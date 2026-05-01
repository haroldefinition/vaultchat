// ============================================================
//  historyBackup.js — encrypted server-side message history
//
//  Phase 2 of the 90-day-history feature.
//
//  Goal:
//    - Survive reinstall: a user who wipes the app and signs back
//      in can recover the last 90 days of chat history.
//    - Sync across devices: a second device on the same account
//      can pull the history backup and populate its local caches.
//
//  Security model:
//    - The backup blob lives in Supabase (table message_history_blob)
//      protected by RLS so only the row owner can read it.
//    - The blob itself is AES-via-tweetnacl-secretbox encrypted with
//      a key derived from the user's Vault PIN via PBKDF2-HMAC-SHA512
//      (100,000 iterations — matches WhatsApp's chat-backup level).
//      The server never sees plaintext or the PIN.
//    - The Vault PIN is the SOLE key. If the user forgets it, the
//      backup is unrecoverable — by design, this is what keeps it
//      end-to-end encrypted from the server.
//
//  PIN strength (PBKDF2 100k iters):
//    - 4-digit PIN: ~3s × 10000 = ~8 hours to brute-force a leaked
//      blob. Fine for casual attacker, weak vs. determined one.
//    - 6-digit PIN: ~3s × 1M = ~35 days. Acceptable.
//    - 8-digit PIN: ~3s × 100M = ~9.5 years. Strong.
//    - 4-digit floor matches the rest of VaultChat's PIN UX (per
//      Harold's product call). Upgrade path: bump to 6-digit
//      minimum once we have telemetry on actual abuse.
//
//  Snapshot shape (what we encrypt):
//    {
//      v: 1,
//      generated_at: <iso>,
//      ttl_ms: 90 * 24 * 60 * 60 * 1000,
//      rooms:  { [roomId]:  { [msgId]: { t, ts } } },
//      groups: { [groupId]: { [msgId]: { t, ts } } },
//    }
//
//  Wire format on Supabase:
//    columns payload, salt, nonce are all base64 strings.
//    See migrations/2026-04-30-message_history_blob.sql.
// ============================================================

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// 100,000 iters is WhatsApp's encryption-key level for chat
// backups — strong enough that a leaked blob with a 4-digit PIN
// still takes hours of sustained effort to brute-force, but fast
// enough on a phone that the "Working..." spinner is short
// (single-digit seconds rather than 10-30s at 1M iters).
// Per-row pbkdf2_iters in the schema means existing 1M backups
// remain decryptable; only new uploads use 100k.
const PBKDF2_ITERS_DEFAULT = 100000;
const TTL_MS               = 90 * 24 * 60 * 60 * 1000;
const SCHEMA_VERSION       = 1;
const PLAIN_PREFIX_ROOM    = 'vaultchat_plain_';
const PLAIN_PREFIX_GROUP   = 'vaultchat_gplain_';
const LAST_BACKUP_AT_KEY   = 'vaultchat_last_history_backup';
const BACKUP_THROTTLE_MS   = 6 * 60 * 60 * 1000; // 6 hours

// ── PBKDF2-HMAC-SHA512 (built on tweetnacl primitives) ────────
// Same construction used in vaultBackup.js. Slow by design; the
// iteration count is what makes brute-forcing the PIN expensive.

function _u8(arr) { return arr instanceof Uint8Array ? arr : new Uint8Array(arr); }

function _hmacSha512(key, data) {
  const BLOCK = 128;
  let k = _u8(key);
  if (k.length > BLOCK) k = nacl.hash(k);
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
  return nacl.hash(outer); // 64 bytes
}

function _pbkdf2(pinBytes, salt, iters, dkLen) {
  const out = new Uint8Array(dkLen);
  let blockIdx = 1;
  let outOffset = 0;
  while (outOffset < dkLen) {
    const blockBE = new Uint8Array([(blockIdx>>24)&0xff,(blockIdx>>16)&0xff,(blockIdx>>8)&0xff,blockIdx&0xff]);
    const saltConcat = new Uint8Array(salt.length + 4);
    saltConcat.set(salt, 0); saltConcat.set(blockBE, salt.length);
    let u = _hmacSha512(pinBytes, saltConcat);
    let t = u.slice();
    for (let i = 1; i < iters; i++) {
      u = _hmacSha512(pinBytes, u);
      for (let j = 0; j < t.length; j++) t[j] ^= u[j];
    }
    const copyLen = Math.min(t.length, dkLen - outOffset);
    out.set(t.subarray(0, copyLen), outOffset);
    outOffset += copyLen;
    blockIdx += 1;
  }
  return out;
}

function _deriveKey(pin, salt, iters) {
  const pinBytes = naclUtil.decodeUTF8(String(pin));
  return _pbkdf2(pinBytes, salt, iters, nacl.secretbox.keyLength); // 32 bytes
}

// ── Snapshot collection / application ─────────────────────────

/**
 * Walk every plaintext-cache key in AsyncStorage and build the
 * snapshot shape. Drops entries older than 90 days as we go so
 * the encrypted blob never carries stale data we wouldn't render.
 */
async function _collectSnapshot() {
  const snap = {
    v: 1,
    generated_at: new Date().toISOString(),
    ttl_ms: TTL_MS,
    rooms:  {},
    groups: {},
  };
  const now = Date.now();
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    for (const key of allKeys || []) {
      if (typeof key !== 'string') continue;
      const isRoom  = key.startsWith(PLAIN_PREFIX_ROOM);
      const isGroup = key.startsWith(PLAIN_PREFIX_GROUP);
      if (!isRoom && !isGroup) continue;
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;
        const map = JSON.parse(raw);
        if (!map || typeof map !== 'object') continue;
        const fresh = {};
        for (const [id, v] of Object.entries(map)) {
          if (typeof v === 'string') {
            // Legacy entry — assume fresh for the snapshot.
            fresh[id] = { t: v, ts: now };
          } else if (v && typeof v === 'object' && typeof v.t === 'string') {
            const ts = typeof v.ts === 'number' ? v.ts : now;
            if (now - ts > TTL_MS) continue;
            fresh[id] = { t: v.t, ts };
          }
        }
        if (Object.keys(fresh).length === 0) continue;
        const id = key.slice((isRoom ? PLAIN_PREFIX_ROOM : PLAIN_PREFIX_GROUP).length);
        if (isRoom) snap.rooms[id] = fresh;
        else        snap.groups[id] = fresh;
      } catch {}
    }
  } catch {}
  return snap;
}

/**
 * Merge a decrypted snapshot back into AsyncStorage. For each
 * (room/group, msgId) pair we keep the entry with the newer ts
 * so a partially-populated local cache isn't clobbered by an
 * older server snapshot.
 */
async function _applySnapshot(snap) {
  if (!snap || typeof snap !== 'object') {
    return { ok: false, message: 'Invalid snapshot.' };
  }
  if (snap.v !== 1) {
    return { ok: false, message: `Unsupported snapshot version: ${snap.v}` };
  }
  const now = Date.now();
  let restored = 0;

  async function _mergeInto(prefix, bucket) {
    if (!bucket || typeof bucket !== 'object') return;
    for (const [id, mapIn] of Object.entries(bucket)) {
      if (!mapIn || typeof mapIn !== 'object') continue;
      const key = `${prefix}${id}`;
      let existing = {};
      try {
        const raw = await AsyncStorage.getItem(key);
        if (raw) existing = JSON.parse(raw) || {};
      } catch {}
      let touched = false;
      for (const [msgId, v] of Object.entries(mapIn)) {
        if (!v || typeof v.t !== 'string') continue;
        const incomingTs = typeof v.ts === 'number' ? v.ts : now;
        if (now - incomingTs > TTL_MS) continue;  // skip stale
        const cur = existing[msgId];
        const curTs = (cur && typeof cur === 'object' && typeof cur.ts === 'number')
          ? cur.ts
          : (typeof cur === 'string' ? 0 : -1);
        if (curTs >= incomingTs) continue;  // local is newer or same
        existing[msgId] = { t: v.t, ts: incomingTs };
        touched = true;
        restored++;
      }
      if (touched) {
        try { await AsyncStorage.setItem(key, JSON.stringify(existing)); } catch {}
      }
    }
  }

  await _mergeInto(PLAIN_PREFIX_ROOM,  snap.rooms);
  await _mergeInto(PLAIN_PREFIX_GROUP, snap.groups);
  return { ok: true, restored };
}

// ── Encrypt / decrypt the snapshot blob ───────────────────────

function _encryptSnapshot(snap, pin, iters = PBKDF2_ITERS_DEFAULT) {
  const json   = JSON.stringify(snap);
  const data   = naclUtil.decodeUTF8(json);
  const salt   = nacl.randomBytes(16);
  const nonce  = nacl.randomBytes(nacl.secretbox.nonceLength);
  const key    = _deriveKey(pin, salt, iters);
  const cipher = nacl.secretbox(data, nonce, key);
  if (!cipher) throw new Error('Encryption failed');
  return {
    payload: naclUtil.encodeBase64(cipher),
    salt:    naclUtil.encodeBase64(salt),
    nonce:   naclUtil.encodeBase64(nonce),
    iters,
    bytes:   data.length,
  };
}

function _decryptSnapshot(blob, pin) {
  const salt   = naclUtil.decodeBase64(blob.salt);
  const nonce  = naclUtil.decodeBase64(blob.nonce);
  const cipher = naclUtil.decodeBase64(blob.payload);
  const iters  = typeof blob.pbkdf2_iters === 'number' && blob.pbkdf2_iters > 0
    ? blob.pbkdf2_iters
    : PBKDF2_ITERS_DEFAULT;
  const key   = _deriveKey(pin, salt, iters);
  const plain = nacl.secretbox.open(cipher, nonce, key);
  if (!plain) throw new Error('WRONG_PIN');
  const json = naclUtil.encodeUTF8(plain);
  return JSON.parse(json);
}

// ── Public API ────────────────────────────────────────────────

/**
 * Run a backup now: collect snapshot → encrypt → upsert to
 * Supabase. Throttled to once every BACKUP_THROTTLE_MS unless
 * `force` is true. No UI side effects — caller decides whether
 * to surface success/failure to the user.
 */
export async function runHistoryBackup(pin, { force = false } = {}) {
  // 4-digit PIN floor matches the rest of VaultChat's PIN UX. The
  // backup-attack trade-off is documented in the file header.
  if (!pin || String(pin).length < 4) {
    return { ok: false, message: 'PIN too short.' };
  }
  try {
    if (!force) {
      const lastRaw = await AsyncStorage.getItem(LAST_BACKUP_AT_KEY);
      const last = parseInt(lastRaw || '0', 10);
      if (Date.now() - last < BACKUP_THROTTLE_MS) {
        return { ok: true, skipped: true, reason: 'throttled' };
      }
    }
    const { data: { user } = {} } = await supabase.auth.getUser();
    if (!user?.id) return { ok: false, message: 'Not signed in.' };

    const snap = await _collectSnapshot();
    const haveAny =
      Object.keys(snap.rooms).length > 0 ||
      Object.keys(snap.groups).length > 0;
    if (!haveAny) {
      return { ok: true, skipped: true, reason: 'empty' };
    }

    const enc = _encryptSnapshot(snap, pin);
    const { error } = await supabase
      .from('message_history_blob')
      .upsert({
        user_id:        user.id,
        payload:        enc.payload,
        salt:           enc.salt,
        nonce:          enc.nonce,
        pbkdf2_iters:   enc.iters,
        schema_version: SCHEMA_VERSION,
        bytes_payload:  enc.bytes,
      }, { onConflict: 'user_id' });
    if (error) {
      if (__DEV__) console.warn('[historyBackup] upsert error:', error.message);
      return { ok: false, message: error.message };
    }
    await AsyncStorage.setItem(LAST_BACKUP_AT_KEY, String(Date.now())).catch(() => {});
    return {
      ok: true,
      bytes: enc.bytes,
      rooms: Object.keys(snap.rooms).length,
      groups: Object.keys(snap.groups).length,
    };
  } catch (e) {
    if (__DEV__) console.warn('[historyBackup] failed:', e?.message);
    return { ok: false, message: e?.message || 'Backup failed.' };
  }
}

/**
 * Look up whether a backup exists for the current user. Used by
 * the first-run restore flow to decide whether to offer it. No
 * decryption performed — just a metadata check.
 */
export async function fetchHistoryBackupMeta() {
  try {
    const { data: { user } = {} } = await supabase.auth.getUser();
    if (!user?.id) return { ok: false, message: 'Not signed in.' };
    const { data, error } = await supabase
      .from('message_history_blob')
      .select('user_id, bytes_payload, schema_version, pbkdf2_iters, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) return { ok: false, message: error.message };
    if (!data)  return { ok: true, exists: false };
    return {
      ok: true,
      exists: true,
      bytes: data.bytes_payload,
      schemaVersion: data.schema_version,
      iters: data.pbkdf2_iters,
      updatedAt: data.updated_at,
    };
  } catch (e) {
    return { ok: false, message: e?.message || 'Lookup failed.' };
  }
}

/**
 * Restore a backup: download → decrypt with PIN → merge into
 * local AsyncStorage caches. Returns { ok, restored } where
 * `restored` = total messages merged across rooms + groups.
 *
 * Failure modes:
 *   - 'NOT_SIGNED_IN'
 *   - 'NO_BACKUP'
 *   - 'WRONG_PIN'
 *   - any other error message
 */
export async function runHistoryRestore(pin) {
  if (!pin) return { ok: false, message: 'PIN required.' };
  try {
    const { data: { user } = {} } = await supabase.auth.getUser();
    if (!user?.id) return { ok: false, code: 'NOT_SIGNED_IN', message: 'Not signed in.' };
    const { data, error } = await supabase
      .from('message_history_blob')
      .select('payload, salt, nonce, pbkdf2_iters, schema_version')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) return { ok: false, message: error.message };
    if (!data)  return { ok: false, code: 'NO_BACKUP', message: 'No backup found.' };

    let snap;
    try {
      snap = _decryptSnapshot(data, pin);
    } catch (e) {
      if (e?.message === 'WRONG_PIN') {
        return { ok: false, code: 'WRONG_PIN', message: 'Wrong PIN — couldn’t decrypt the backup.' };
      }
      throw e;
    }
    const result = await _applySnapshot(snap);
    return { ...result };
  } catch (e) {
    if (__DEV__) console.warn('[historyBackup] restore failed:', e?.message);
    return { ok: false, message: e?.message || 'Restore failed.' };
  }
}

/**
 * Wipe the backup row for the current user. Called from account
 * deletion + an explicit "Disable cloud history backup" Settings
 * action (not yet wired in v1.1).
 */
export async function deleteHistoryBackup() {
  try {
    const { data: { user } = {} } = await supabase.auth.getUser();
    if (!user?.id) return { ok: false, message: 'Not signed in.' };
    const { error } = await supabase
      .from('message_history_blob')
      .delete()
      .eq('user_id', user.id);
    if (error) return { ok: false, message: error.message };
    await AsyncStorage.removeItem(LAST_BACKUP_AT_KEY).catch(() => {});
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e?.message || 'Delete failed.' };
  }
}
