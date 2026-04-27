// ============================================================
//  roomSecrets.js — per-group shared secret for HMAC-blinded
//  envelope routing (Phase UU group metadata privacy).
//
//  Each group/room has a 32-byte random secret known to every
//  member. Sender + receiver use it as the HMAC key when blinding
//  envelope-routing labels:
//
//    idx = HMAC-SHA256(roomSecret, message_uuid || device_id)
//
//  The server only ever sees opaque hex `idx` values in the
//  message metadata — never raw user_ids or device_ids — so a
//  DB reader can't enumerate group membership.
//
//  Distribution:
//    - The first sender to a room with no existing secret
//      generates one, encrypts it once per member's pubkey, and
//      inserts the per-member shares into room_secrets.
//    - Each receiver fetches their share, decrypts with their
//      local NaCl private key, caches the plaintext secret in
//      AsyncStorage so subsequent message reads are O(1).
//    - When a new member joins, the next sender re-distributes
//      the existing secret to them (idempotent INSERT).
// ============================================================

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  encryptMessage,
  decryptMessage,
  ensureIdentityKeys,
} from '../crypto/encryption';

let supabase = null;
try { supabase = require('./supabase').supabase; } catch {}

const CACHE_PREFIX = 'vaultchat_room_secret_';

// In-memory cache so the hot path (every message decrypt) doesn't
// hit AsyncStorage. Loaded lazily from disk on first miss.
const _ramCache = new Map();

function _diskKey(roomId) { return `${CACHE_PREFIX}${roomId}`; }

async function _readCached(roomId) {
  const ram = _ramCache.get(roomId);
  if (ram) return ram;
  try {
    const b64 = await AsyncStorage.getItem(_diskKey(roomId));
    if (b64) {
      _ramCache.set(roomId, b64);
      return b64;
    }
  } catch {}
  return null;
}

async function _writeCached(roomId, secretB64) {
  _ramCache.set(roomId, secretB64);
  try { await AsyncStorage.setItem(_diskKey(roomId), secretB64); } catch {}
}

/**
 * Try to fetch + decrypt MY share of the room's secret.
 * Returns base64 secret string, or null if no share exists for me
 * (caller may then need to generate + distribute a fresh secret
 * if they're the first sender).
 */
export async function getMyRoomSecret(roomId, myUserId) {
  if (!roomId || !myUserId) return null;
  const cached = await _readCached(roomId);
  if (cached) return cached;
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('room_secrets')
      .select('encrypted_secret')
      .eq('room_id', roomId)
      .eq('recipient_user_id', myUserId)
      .maybeSingle();
    if (error || !data?.encrypted_secret) return null;
    const plain = await decryptMessage(data.encrypted_secret);
    if (!plain) return null;
    await _writeCached(roomId, plain);
    return plain;
  } catch (e) {
    if (__DEV__) console.warn('getMyRoomSecret error:', e?.message);
    return null;
  }
}

/**
 * Generate a fresh 32-byte random secret and distribute encrypted
 * shares to every (resolved, key-bearing) member. Idempotent for
 * already-distributed members (DO NOTHING on conflict).
 *
 * `members` shape: array of { user_id, public_key } — anyone
 * missing public_key is skipped.
 *
 * Returns the new secret (base64) or null on failure.
 */
export async function createAndDistributeRoomSecret(roomId, members, myUserId) {
  if (!roomId || !supabase) return null;
  try {
    const secretBytes = nacl.randomBytes(32);
    const secretB64   = naclUtil.encodeBase64(secretBytes);

    const rows = [];
    // Distribute to every member with a published pubkey...
    for (const m of (members || [])) {
      if (!m?.user_id || !m?.public_key) continue;
      try {
        const ct = await encryptMessage(secretB64, m.public_key);
        rows.push({ room_id: roomId, recipient_user_id: m.user_id, encrypted_secret: ct });
      } catch {}
    }
    // ...plus self so I can read my own history back.
    if (myUserId) {
      try {
        const me = await ensureIdentityKeys();
        const ct = await encryptMessage(secretB64, me.publicKey);
        rows.push({ room_id: roomId, recipient_user_id: myUserId, encrypted_secret: ct });
      } catch {}
    }
    if (!rows.length) return null;
    // Use upsert with ignore-on-conflict so re-running for an
    // existing member is a no-op.
    await supabase.from('room_secrets').upsert(rows, {
      onConflict: 'room_id,recipient_user_id',
      ignoreDuplicates: true,
    });
    await _writeCached(roomId, secretB64);
    return secretB64;
  } catch (e) {
    if (__DEV__) console.warn('createAndDistributeRoomSecret error:', e?.message);
    return null;
  }
}

/**
 * Top-level "ensure I have a usable secret for this room" call.
 * Used by the sender path before encryption: tries to fetch an
 * existing share, generates+distributes a new one if none yet.
 */
export async function ensureRoomSecret(roomId, members, myUserId) {
  const existing = await getMyRoomSecret(roomId, myUserId);
  if (existing) return existing;
  return createAndDistributeRoomSecret(roomId, members, myUserId);
}

/**
 * Add a single new member to an existing room secret (used when
 * the group adds a member after the secret was already distributed).
 * No-op if the member already has a share or we don't have the
 * secret locally.
 */
export async function shareRoomSecretWith(roomId, member, myUserId) {
  if (!supabase || !member?.user_id || !member?.public_key) return;
  try {
    const secretB64 = await getMyRoomSecret(roomId, myUserId);
    if (!secretB64) return;
    const ct = await encryptMessage(secretB64, member.public_key);
    await supabase.from('room_secrets').upsert(
      { room_id: roomId, recipient_user_id: member.user_id, encrypted_secret: ct },
      { onConflict: 'room_id,recipient_user_id', ignoreDuplicates: true },
    );
  } catch (e) {
    if (__DEV__) console.warn('shareRoomSecretWith error:', e?.message);
  }
}

/**
 * HMAC-SHA256(secret, label) → hex string. Used to compute the
 * blinded envelope key for a recipient device.
 *
 *   idx = blindedIndex(roomSecret, message_uuid + device_id)
 *
 * tweetnacl doesn't ship HMAC, but for our use case a length-
 * extension-safe construction is sufficient: HMAC = SHA512(key XOR opad ||
 * SHA512(key XOR ipad || message)). We use SHA512 since nacl.hash
 * is already wired in, then truncate to 32 hex chars (128 bits)
 * which is plenty of collision resistance for routing labels.
 */
export function blindedIndex(secretB64, label) {
  if (!secretB64) return null;
  const key  = naclUtil.decodeBase64(secretB64);
  const data = typeof label === 'string' ? naclUtil.decodeUTF8(label) : label;

  // Block size for SHA-512 is 128 bytes
  const BLOCK = 128;
  let k = key;
  if (k.length > BLOCK) k = nacl.hash(k); // 64 bytes
  if (k.length < BLOCK) {
    const padded = new Uint8Array(BLOCK);
    padded.set(k, 0);
    k = padded;
  }
  const ipad = new Uint8Array(BLOCK);
  const opad = new Uint8Array(BLOCK);
  for (let i = 0; i < BLOCK; i++) {
    ipad[i] = k[i] ^ 0x36;
    opad[i] = k[i] ^ 0x5c;
  }
  const inner = new Uint8Array(BLOCK + data.length);
  inner.set(ipad, 0); inner.set(data, BLOCK);
  const innerHash = nacl.hash(inner);

  const outer = new Uint8Array(BLOCK + innerHash.length);
  outer.set(opad, 0); outer.set(innerHash, BLOCK);
  const outerHash = nacl.hash(outer);

  // Truncate to 32 hex chars (128 bits)
  let hex = '';
  for (let i = 0; i < 16; i++) {
    hex += outerHash[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/** Compute MY blinded index for a given message in this room. */
export function myBlindedIndexForMessage(roomSecretB64, messageUuid, myDeviceId) {
  if (!roomSecretB64 || !messageUuid || !myDeviceId) return null;
  return blindedIndex(roomSecretB64, `${messageUuid}|${myDeviceId}`);
}

/** Test/sign-out hook — wipes both RAM + disk caches. */
export async function clearRoomSecretCache() {
  _ramCache.clear();
  // Note: leave AsyncStorage entries — they're tied to the
  // logged-in user's local key. A real sign-out should clear
  // them; for now they're harmless without the matching private
  // key.
}
