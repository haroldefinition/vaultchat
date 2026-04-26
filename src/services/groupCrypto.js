// ============================================================
//  groupCrypto.js — per-recipient envelope encryption for groups
//
//  Group chats don't yet have a sender-keys / Megolm ratchet.
//  Instead we wrap each message in a per-recipient envelope:
//
//    messages.content                 = 'GRPENC:v1'  (sentinel)
//    messages.metadata.encrypted      = true
//    messages.metadata.v              = 'group:1'
//    messages.metadata.ct_for_recipients = {
//       <member_user_id>: '<ENC2 envelope encrypted to them>',
//       ...
//       <my_user_id>:     '<ENC2 envelope encrypted to me, so I
//                            can read my own history back>',
//    }
//
//  Reader: pulls metadata.ct_for_recipients[my_user_id] and
//          decryptMessage()s it.
//
//  Sender: getPublicKey(memberId) for every resolvable member,
//          encryptMessage(plaintext, theirPubKey) for each, plus
//          encrypt-to-self via my own pubkey so the sender's own
//          device can decrypt back from the server.
//
//  This is wasteful at 256 members (256 ciphertexts per message)
//  but correct, simple, and a credible v1 of group E2E. Sender-keys
//  ratchet is a follow-up.
//
//  Member resolution:
//    Group records currently store members as bare display strings
//    (legacy from when groups predated handle/userId). To encrypt
//    we need user_ids. resolveAndCacheGroupMembers() takes the
//    bare-string array, looks each entry up via vaultHandle, and
//    writes back the enriched member objects so we only resolve
//    once per group.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { encryptMessage } from '../crypto/encryption';
import { getPublicKey } from './keyExchange';
import { findByHandleOrPhone } from './vaultHandle';
import { ensureIdentityKeys } from '../crypto/encryption';

const GROUPS_KEY = 'vaultchat_groups';
const GRP_SENTINEL = 'GRPENC:v1';

/**
 * True if a stored group message is one of our group envelopes.
 * Cheap O(1) check that avoids parsing JSON for plaintext rows.
 */
export function isGroupEnvelope(row) {
  return !!(row && row.metadata && row.metadata.encrypted &&
            (row.metadata.v === 'group:1' || row.metadata.v === 'group_v1'));
}

/**
 * Resolve bare-string group members → enriched objects with
 * user_id / vault_handle / phone / public_key fields. Caches the
 * resolved member list back into the group record so the same
 * lookup doesn't hit the network on every send.
 *
 * Returns the enriched members array (may be a mix of resolved
 * and unresolved entries — unresolved ones keep just their `name`).
 */
export async function resolveAndCacheGroupMembers(groupId) {
  if (!groupId) return [];
  let groups = [];
  try {
    const raw = await AsyncStorage.getItem(GROUPS_KEY);
    groups = raw ? JSON.parse(raw) : [];
  } catch { return []; }

  const idx = groups.findIndex(g => g.id === groupId);
  if (idx < 0) return [];
  const group = groups[idx];
  const members = Array.isArray(group.members) ? group.members : [];

  // Resolve any string-only entries (legacy). Keep already-resolved
  // entries intact unless their public_key is missing — refresh keys
  // since they can change after a device reset.
  const enriched = await Promise.all(members.map(async m => {
    const seed = typeof m === 'string' ? { name: m } : { ...m };
    if (seed.user_id && seed.public_key) return seed;

    // Try to resolve via @handle or phone using whatever we have.
    // Phase MM: also fetch the member's per-device key list so the
    // group send can fan out to every install of every member.
    const lookup = seed.vault_handle || seed.handle || seed.phone || seed.name;
    if (!lookup) return seed;
    try {
      const profile = await findByHandleOrPhone(lookup);
      if (!profile?.id) return seed;
      const { getDeviceKeysForUser } = require('./deviceKeys');
      const [pk, devices] = await Promise.all([
        getPublicKey(profile.id),
        getDeviceKeysForUser(profile.id),
      ]);
      return {
        ...seed,
        user_id:     profile.id,
        vault_handle: profile.vault_handle || seed.vault_handle || null,
        phone:       profile.phone || seed.phone || null,
        public_key:  pk || seed.public_key || null,
        device_keys: Array.isArray(devices) ? devices : [],
      };
    } catch { return seed; }
  }));

  // Persist back so future sends skip the resolution round-trips.
  groups[idx] = { ...group, members: enriched };
  try { await AsyncStorage.setItem(GROUPS_KEY, JSON.stringify(groups)); } catch {}
  return enriched;
}

/**
 * Build the per-recipient envelope payload for a group message.
 *
 * Returns { insertPayload, recipientCount, missingCount } so the
 * caller can decide whether to fall back to plaintext (e.g. when no
 * members have published keys yet) and how to message the user.
 */
export async function encryptForGroup(plaintext, members, myUserId) {
  // Phase MM upgrade: per-DEVICE per-recipient envelopes. Each
  // member is fanned out to every device they've published a
  // key for. Wire shape becomes:
  //   metadata.ct_for_devices = { [device_id]: <ENC2 envelope>, ... }
  //
  // We also keep the legacy ct_for_recipients map populated for
  // peers still on Phase BB (single-recipient envelope) so they
  // can decrypt during the rollout window. New clients prefer
  // ct_for_devices when present.
  const ct_for_devices    = {};
  const ct_for_recipients = {};
  let recipientCount = 0;
  let deviceCount    = 0;
  let missingCount   = 0;

  for (const m of members) {
    if (!m?.user_id) { missingCount++; continue; }
    if (m.user_id === myUserId) continue; // self handled below
    const devices = Array.isArray(m.device_keys) ? m.device_keys : [];
    if (devices.length > 0) {
      // Multi-device path — encrypt once per published device.
      for (const d of devices) {
        if (!d?.device_id || !d?.public_key) continue;
        try {
          ct_for_devices[d.device_id] = await encryptMessage(plaintext, d.public_key);
          deviceCount++;
        } catch {}
      }
      recipientCount++;
    } else if (m.public_key) {
      // Legacy fallback — peer hasn't published per-device keys yet.
      try {
        ct_for_recipients[m.user_id] = await encryptMessage(plaintext, m.public_key);
        recipientCount++;
      } catch { missingCount++; }
    } else {
      missingCount++;
    }
  }

  // Encrypt-to-self for sender history. Use my own device keys if
  // available so this device + any other install of mine can read
  // back; fall back to identity-key self-seal if not.
  if (myUserId) {
    try {
      const { getDeviceKeysForUser } = require('./deviceKeys');
      const myDevices = await getDeviceKeysForUser(myUserId);
      if (Array.isArray(myDevices) && myDevices.length > 0) {
        for (const d of myDevices) {
          if (!d?.device_id || !d?.public_key) continue;
          try {
            ct_for_devices[d.device_id] = await encryptMessage(plaintext, d.public_key);
          } catch {}
        }
      } else {
        const me = await ensureIdentityKeys();
        ct_for_recipients[myUserId] = await encryptMessage(plaintext, me.publicKey);
      }
    } catch {}
  }

  return {
    insertPayload: {
      content:  GRP_SENTINEL,
      metadata: {
        encrypted: true,
        v:        'group:2',          // bumped — devices map present
        ct_for_devices,                // primary (new clients)
        ct_for_recipients,             // legacy (Phase BB peers)
      },
    },
    recipientCount,
    deviceCount,
    missingCount,
  };
}

/**
 * Pull the calling user's envelope out of a group message and
 * decrypt it. Returns plaintext, or a placeholder if no envelope
 * was provisioned for this user (e.g. they joined after the message
 * was sent, or the sender didn't have their pubkey).
 */
export async function decryptGroupMessageForMe(row, myUserId) {
  try {
    const { decryptMessage } = require('../crypto/encryption');
    // Phase MM upgrade — prefer the per-DEVICE map written by
    // group:2 senders. Look up THIS device's slot first; that
    // gives a unique envelope per install of the same user.
    const devMap = row?.metadata?.ct_for_devices;
    if (devMap && Object.keys(devMap).length > 0) {
      try {
        const { getDeviceId } = require('./deviceIdentity');
        const myDeviceId = await getDeviceId();
        const env = devMap[myDeviceId];
        if (env) return await decryptMessage(env);
      } catch {}
      // Fall through to the user-id map if device lookup misses
      // (e.g., sender encrypted before this device's key was
      // published — happens during the first multi-device send
      // window).
    }
    const env = row?.metadata?.ct_for_recipients?.[myUserId];
    if (!env) return '🔒 Encrypted message';
    return await decryptMessage(env);
  } catch {
    return '🔒 Encrypted message';
  }
}
