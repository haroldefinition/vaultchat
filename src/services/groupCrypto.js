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
import { supabase } from './supabase';
import {
  ensureRoomSecret,
  getMyRoomSecret,
  blindedIndex,
  myBlindedIndexForMessage,
} from './roomSecrets';

const GROUPS_KEY = 'vaultchat_groups';
const GRP_SENTINEL = 'GRPENC:v1';

// RFC 4122-ish lightweight UUID4 — used as the per-message public
// nonce that combines with the per-room secret to derive the
// blinded envelope keys. Doesn't need cryptographic uniqueness, just
// uniqueness within a room over time.
function _uuid() {
  const bytes = require('tweetnacl').randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  let hex = '';
  for (let i = 0; i < 16; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

/**
 * True if a stored group message is one of our group envelopes.
 * Cheap O(1) check that avoids parsing JSON for plaintext rows.
 *
 * Recognises every protocol version we've ever shipped:
 *   - 'group:1' / 'group_v1' — original Phase 1 (per-user envelopes only)
 *   - 'group:2'              — Phase MM (per-device fan-out via ct_for_devices)
 *   - 'group:3'              — Phase UU (HMAC-blinded routing keys)
 *
 * Pre-1.0.17 fix: this used to only accept v1, so receivers of v2/v3
 * messages would treat them as plaintext and render the raw 'GRPENC:v1'
 * sentinel string instead of triggering decryptGroupMessageForMe.
 */
export function isGroupEnvelope(row) {
  return !!(row && row.metadata && row.metadata.encrypted &&
            (row.metadata.v === 'group:1'
             || row.metadata.v === 'group_v1'
             || row.metadata.v === 'group:2'
             || row.metadata.v === 'group:3'));
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

    // 1.0.17 fix: user_id-first lookup branch. New-member group
    // hydration (GroupScreen.loadGroups) writes member stubs as
    // { user_id } only — they have no vault_handle/phone/name to
    // feed findByHandleOrPhone, so the legacy lookup path below
    // would drop them at the !lookup guard, leaving members[]
    // empty and silently flipping the send path to plaintext.
    //
    // Late-1.0.17 fix: previously we early-returned here when
    // seed had user_id + public_key. That cached an old
    // device_keys list across the lifetime of the group — when
    // a peer reinstalled and rotated keys, our send would still
    // encrypt to their stale pubkeys, the receiver couldn't
    // decrypt, and the FlatList filter would hide their copy
    // of the message entirely. Always re-fetch device_keys for
    // any user we already know the user_id for; getPublicKey
    // has its own short-lived cache so the cost is bounded.
    if (seed.user_id) {
      try {
        const { getDeviceKeysForUser } = require('./deviceKeys');
        const [{ data: profile }, devices] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, vault_handle, phone, public_key')
            .eq('id', seed.user_id)
            .maybeSingle(),
          getDeviceKeysForUser(seed.user_id),
        ]);
        if (profile?.id) {
          return {
            ...seed,
            user_id:      profile.id,
            vault_handle: profile.vault_handle || seed.vault_handle || null,
            phone:        profile.phone || seed.phone || null,
            public_key:   profile.public_key || seed.public_key || null,
            device_keys:  Array.isArray(devices) ? devices : [],
          };
        }
      } catch { /* fall through to legacy lookup */ }
    }

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
export async function encryptForGroup(plaintext, members, myUserId, opts = {}) {
  // Phase UU upgrade: HMAC-blinded routing keys. Instead of
  // exposing { device_id: ct } in metadata (which leaks group
  // membership to anyone with DB read access), each envelope is
  // keyed by HMAC(roomSecret, message_uuid || device_id) — a
  // 128-bit hex blob with no link to the underlying identity.
  //
  // The room_secrets table holds one row per member, each
  // encrypted to that member's pubkey, so only members can
  // compute the HMAC keys.
  //
  // Backwards compat: ct_for_devices + ct_for_recipients are
  // ALSO populated for clients that haven't shipped Phase UU.
  // They get pruned in a follow-up release once telemetry shows
  // adoption. New clients (group:3) prefer ct_blinded; older
  // ones fall through to the legacy maps as before.
  const { roomId } = opts;
  const ct_for_devices    = {};
  const ct_for_recipients = {};
  const ct_blinded        = {};
  let recipientCount = 0;
  let deviceCount    = 0;
  let missingCount   = 0;

  // Fetch / lazily create the room secret. Null = nobody on the
  // roster could be encrypted to (very fresh group with zero
  // resolvable members), in which case we fall back to plaintext
  // upstream — same as before.
  let roomSecret = null;
  let messageUuid = null;
  if (roomId) {
    try {
      roomSecret  = await ensureRoomSecret(roomId, members, myUserId);
      messageUuid = _uuid();
    } catch (e) {
      if (__DEV__) console.warn('roomSecret fetch failed, falling back to legacy keys:', e?.message);
    }
  }

  // Helper — encrypts plaintext to a device's pubkey AND writes
  // the result under both the legacy device_id key and the new
  // blinded HMAC key (when we have a roomSecret).
  async function _addDeviceCt(deviceId, devicePub) {
    if (!deviceId || !devicePub) return;
    try {
      const ct = await encryptMessage(plaintext, devicePub);
      ct_for_devices[deviceId] = ct;
      if (roomSecret && messageUuid) {
        const idx = blindedIndex(roomSecret, `${messageUuid}|${deviceId}`);
        if (idx) ct_blinded[idx] = ct;
      }
      deviceCount++;
    } catch {}
  }

  for (const m of members) {
    if (!m?.user_id) { missingCount++; continue; }
    if (m.user_id === myUserId) continue; // self handled below
    const devices = Array.isArray(m.device_keys) ? m.device_keys : [];
    if (devices.length > 0) {
      for (const d of devices) await _addDeviceCt(d?.device_id, d?.public_key);
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
        for (const d of myDevices) await _addDeviceCt(d?.device_id, d?.public_key);
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
        v:        roomSecret && messageUuid ? 'group:3' : 'group:2',
        // group:3 blinded routing — primary for Phase UU+ readers
        ...(roomSecret && messageUuid ? {
          message_uuid: messageUuid,
          ct_blinded,
        } : {}),
        // group:2 legacy maps — kept for Phase MM-only readers
        ct_for_devices,
        ct_for_recipients,
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
    const meta = row?.metadata || {};

    // Phase UU upgrade — prefer the blinded routing map. Compute
    // MY blinded index from the room secret + message_uuid + my
    // device_id. If the sender wrote a slot under that index, that's
    // my envelope.
    const blinded = meta.ct_blinded;
    const messageUuid = meta.message_uuid;
    if (blinded && messageUuid && row?.group_id) {
      try {
        const secret = await getMyRoomSecret(row.group_id, myUserId);
        if (secret) {
          const { getDeviceId } = require('./deviceIdentity');
          const myDeviceId = await getDeviceId();
          const idx = myBlindedIndexForMessage(secret, messageUuid, myDeviceId);
          if (idx && blinded[idx]) {
            return await decryptMessage(blinded[idx]);
          }
        }
      } catch {}
      // Fall through to legacy maps if the secret isn't fetched
      // yet or my device wasn't included in the blinded map.
    }

    // Phase MM legacy — per-device map keyed by raw device_id.
    const devMap = meta.ct_for_devices;
    if (devMap && Object.keys(devMap).length > 0) {
      try {
        const { getDeviceId } = require('./deviceIdentity');
        const myDeviceId = await getDeviceId();
        const env = devMap[myDeviceId];
        if (env) return await decryptMessage(env);
      } catch {}
    }

    // Phase BB legacy — per-user map.
    const env = meta.ct_for_recipients?.[myUserId];
    if (!env) return '🔒 Encrypted message';
    return await decryptMessage(env);
  } catch {
    return '🔒 Encrypted message';
  }
}
