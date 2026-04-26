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

    // Try to resolve via @handle or phone using whatever we have
    const lookup = seed.vault_handle || seed.handle || seed.phone || seed.name;
    if (!lookup) return seed;
    try {
      const profile = await findByHandleOrPhone(lookup);
      if (!profile?.id) return seed;
      const pk = await getPublicKey(profile.id);
      return {
        ...seed,
        user_id:     profile.id,
        vault_handle: profile.vault_handle || seed.vault_handle || null,
        phone:       profile.phone || seed.phone || null,
        public_key:  pk || seed.public_key || null,
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
  const ct_for_recipients = {};
  let recipientCount = 0;
  let missingCount   = 0;

  // Encrypt for each member who has a published pubkey.
  for (const m of members) {
    if (!m?.user_id || !m?.public_key) { missingCount++; continue; }
    if (m.user_id === myUserId) continue; // self-envelope handled below
    try {
      ct_for_recipients[m.user_id] = await encryptMessage(plaintext, m.public_key);
      recipientCount++;
    } catch { missingCount++; }
  }

  // Encrypt-to-self so the sender's own device can decrypt their
  // history back from the server. Self-DH (encrypt to my own pub).
  if (myUserId) {
    try {
      const me = await ensureIdentityKeys();
      ct_for_recipients[myUserId] = await encryptMessage(plaintext, me.publicKey);
    } catch {}
  }

  return {
    insertPayload: {
      content:  GRP_SENTINEL,
      metadata: {
        encrypted: true,
        v:        'group:1',
        ct_for_recipients,
      },
    },
    recipientCount,
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
    const env = row?.metadata?.ct_for_recipients?.[myUserId];
    if (!env) return '🔒 Encrypted message';
    const { decryptMessage } = require('../crypto/encryption');
    return await decryptMessage(env);
  } catch {
    return '🔒 Encrypted message';
  }
}
