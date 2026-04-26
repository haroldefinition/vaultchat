// ============================================================
//  VaultChat — Encryption Engine (real crypto)
//  src/crypto/encryption.js
//
//  What this is:
//    - X25519 key agreement (Curve25519 ECDH) via tweetnacl
//    - XSalsa20-Poly1305 authenticated encryption (nacl.box)
//    - Identity keypair generated ONCE per install, private key
//      never leaves the device (AsyncStorage only)
//    - Versioned ciphertext envelope: { v: 2, ct, n, spk }
//
//  Scope (Phase 1):
//    - 1:1 DMs only
//    - Groups and media remain plaintext for now (Phase 2)
//
//  Migration note:
//    - Any legacy "ENC1:"/XOR content is treated as plaintext
//      on read (best-effort display). New writes use v=2.
// ============================================================

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

// ── TweetNaCl PRNG wiring ───────────────────────────────────
// React Native has no built-in crypto.getRandomValues, so tweetnacl defaults
// to throwing "no PRNG" on any call that needs randomness (keypair gen,
// nonces). Wire expo-crypto's secure RNG once at module load.
//
// expo-crypto is already a project dep and doesn't need a separate native
// rebuild beyond what we already have in the dev client.
nacl.setPRNG((out, n) => {
  const bytes = Crypto.getRandomBytes(n);
  for (let i = 0; i < n; i++) out[i] = bytes[i];
});

const KEY_STORE   = 'vaultchat_identity_keys_v2';
const ENVELOPE_V  = 2;
const ENVELOPE_TAG = 'ENC2:';

// ── Identity key management ─────────────────────────────────

/**
 * Generate a new X25519 identity keypair and persist the private key
 * to device-local AsyncStorage. Safe to call multiple times — will
 * overwrite existing keys, so normally call via `ensureIdentityKeys`.
 */
export async function generateIdentityKeys() {
  const kp = nacl.box.keyPair();
  const publicKey  = naclUtil.encodeBase64(kp.publicKey);
  const privateKey = naclUtil.encodeBase64(kp.secretKey);
  await AsyncStorage.setItem(KEY_STORE, JSON.stringify({ publicKey, privateKey }));
  return { publicKey, privateKey };
}

/** Load this device's persisted identity keys (null if never generated). */
export async function loadIdentityKeys() {
  const stored = await AsyncStorage.getItem(KEY_STORE);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (!parsed?.publicKey || !parsed?.privateKey) return null;
    return parsed;
  } catch { return null; }
}

/** Generate keys only if none exist. Call on app boot and at /register. */
export async function ensureIdentityKeys() {
  const existing = await loadIdentityKeys();
  if (existing) return existing;
  return generateIdentityKeys();
}

// ── Message encryption / decryption ─────────────────────────

/**
 * Encrypt a plaintext UTF-8 string for a specific recipient.
 *
 * @param {string} plaintext
 * @param {string} recipientPublicKeyB64  — recipient's public key (base64)
 * @returns {string} envelope string: `ENC2:<json>` — store this as message.content
 */
export async function encryptMessage(plaintext, recipientPublicKeyB64) {
  if (plaintext == null) return plaintext;
  if (!recipientPublicKeyB64 || typeof recipientPublicKeyB64 !== 'string') {
    throw new Error('encryptMessage: recipient public key required');
  }
  const me = await ensureIdentityKeys();
  const nonce     = nacl.randomBytes(nacl.box.nonceLength);
  const msgBytes  = naclUtil.decodeUTF8(String(plaintext));
  const recipPk   = naclUtil.decodeBase64(recipientPublicKeyB64);
  const myPriv    = naclUtil.decodeBase64(me.privateKey);
  const sealed    = nacl.box(msgBytes, nonce, recipPk, myPriv);
  const envelope  = {
    v:   ENVELOPE_V,
    ct:  naclUtil.encodeBase64(sealed),
    n:   naclUtil.encodeBase64(nonce),
    spk: me.publicKey, // sender public key — lets recipient verify + derive shared key
  };
  return ENVELOPE_TAG + JSON.stringify(envelope);
}

/**
 * Decrypt a message envelope produced by `encryptMessage`.
 *
 * @param {string} envelopeString
 * @returns {string} plaintext
 * @throws if the envelope is malformed or auth fails
 */
export async function decryptMessage(envelopeString) {
  if (!isEncryptedEnvelope(envelopeString)) {
    // Not one of ours — treat as plaintext passthrough.
    return envelopeString;
  }
  const me = await loadIdentityKeys();
  if (!me) throw new Error('No local identity keys');

  const json = envelopeString.slice(ENVELOPE_TAG.length);
  let env;
  try { env = JSON.parse(json); }
  catch { throw new Error('Malformed envelope JSON'); }

  if (env.v !== ENVELOPE_V) throw new Error(`Unsupported envelope version ${env.v}`);
  if (!env.ct || !env.n || !env.spk) throw new Error('Envelope missing fields');

  const opened = nacl.box.open(
    naclUtil.decodeBase64(env.ct),
    naclUtil.decodeBase64(env.n),
    naclUtil.decodeBase64(env.spk),
    naclUtil.decodeBase64(me.privateKey),
  );
  if (!opened) throw new Error('Decryption failed (auth / wrong recipient)');
  return naclUtil.encodeUTF8(opened);
}

/** Cheap prefix check — no parsing. */
export function isEncryptedEnvelope(s) {
  return typeof s === 'string' && s.startsWith(ENVELOPE_TAG);
}

/**
 * Encrypt a plaintext for BOTH the recipient AND yourself in one go.
 * Returns two independent ciphertexts so the sender can still read their
 * own message history back from the server.
 *
 *   { content:        ENC2 envelope for recipient — store in messages.content
 *     metadataSelf: { ct, n, spk } — store in messages.metadata.ct_self
 *   }
 *
 * The "for self" seal is a nacl.box with (myPub, myPriv) — a self-DH that
 * the opening side inverts with (myPub, myPriv). No new primitive.
 */
export async function encryptMessageForPair(plaintext, recipientPublicKeyB64) {
  const content = await encryptMessage(plaintext, recipientPublicKeyB64);
  const me = await ensureIdentityKeys();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const myPubBytes  = naclUtil.decodeBase64(me.publicKey);
  const myPrivBytes = naclUtil.decodeBase64(me.privateKey);
  const sealed = nacl.box(naclUtil.decodeUTF8(String(plaintext)), nonce, myPubBytes, myPrivBytes);
  const metadataSelf = {
    v:   ENVELOPE_V,
    ct:  naclUtil.encodeBase64(sealed),
    n:   naclUtil.encodeBase64(nonce),
    spk: me.publicKey,
  };
  return { content, metadataSelf };
}

/**
 * Decrypt the "for self" copy produced by `encryptMessageForPair`.
 * Used when the current device is the sender and is rendering its own history.
 */
export async function decryptSelfEnvelope(env) {
  if (!env || env.v !== ENVELOPE_V || !env.ct || !env.n || !env.spk) {
    throw new Error('Invalid self envelope');
  }
  const me = await loadIdentityKeys();
  if (!me) throw new Error('No local identity keys');
  // Self-seal: peer pubkey and our own are the same, so open with our own.
  const opened = nacl.box.open(
    naclUtil.decodeBase64(env.ct),
    naclUtil.decodeBase64(env.n),
    naclUtil.decodeBase64(me.publicKey),
    naclUtil.decodeBase64(me.privateKey),
  );
  if (!opened) throw new Error('Self-decryption failed');
  return naclUtil.encodeUTF8(opened);
}

/**
 * Try-decrypt helper for the receive path. Returns plaintext on success,
 * the original string on non-envelope input, or a user-visible placeholder
 * on failure. Never throws.
 */
export async function safeDecrypt(envelopeOrPlain, opts = {}) {
  // Multi-device envelope (Phase MM) \u2014 needs my device_id to know
  // which envelope slot to open. Caller should pass `myDeviceId`
  // via opts; if absent we lazy-load it.
  if (isMultiDeviceEnvelope(envelopeOrPlain)) {
    try {
      let did = opts.myDeviceId;
      if (!did) { did = await require('../services/deviceIdentity').getDeviceId(); }
      return await decryptForMyDevice(envelopeOrPlain, did);
    } catch (e) {
      if (__DEV__) console.warn('safeDecrypt(multi) failed:', e?.message || e);
      return '[Can\u2019t decrypt this message on this device]';
    }
  }
  if (!isEncryptedEnvelope(envelopeOrPlain)) return envelopeOrPlain;
  try {
    return await decryptMessage(envelopeOrPlain);
  } catch (e) {
    if (__DEV__) console.warn('safeDecrypt failed:', e?.message || e);
    return '[Can\u2019t decrypt this message on this device]';
  }
}

// ── Fingerprint (safety-number style) ──────────────────────

/**
 * Produce a short comparable fingerprint of the pair of public keys.
 * Users can read these aloud to verify no MITM. Deterministic.
 */
export async function generateFingerprint(myPublicKeyB64, theirPublicKeyB64) {
  // SHA-512 via nacl.hash (tweetnacl) — avoids pulling in expo-crypto just for this.
  const a = naclUtil.decodeBase64(myPublicKeyB64);
  const b = naclUtil.decodeBase64(theirPublicKeyB64);
  // Canonicalize order so both sides compute the same fingerprint.
  const [first, second] = compareBytes(a, b) <= 0 ? [a, b] : [b, a];
  const concat = new Uint8Array(first.length + second.length);
  concat.set(first, 0); concat.set(second, first.length);
  const digest = nacl.hash(concat); // 64 bytes
  const hex = bytesToHex(digest).toUpperCase();
  // 8 blocks of 4 hex chars each = 32 chars of fingerprint
  return hex.slice(0, 32).match(/.{4}/g).join(' ');
}

// ── Multi-device envelope (Phase MM) ───────────────────────
//
// Wire shape:
//   content:  'MD2:' + JSON.stringify({
//     v: 'multi:1',
//     by_dev: { [device_id]: '<ENC2 envelope string>', ... }
//   })
//
// The 'MD2:' prefix lets the existing receive path detect a
// multi-device envelope without parsing JSON. Inside it, each
// device_id maps to a regular ENC2 envelope encrypted to that
// device's pubkey. The recipient picks their own device_id key
// and decrypts that envelope with the local private key.
//
// Backwards compat: legacy 'ENC2:' single-recipient envelopes
// still decrypt via the existing decryptMessage path. Senders
// still produce 'ENC2:' if the recipient has no device-key
// rows (pre-Phase MM peer).

const MD_TAG = 'MD2:';

export function isMultiDeviceEnvelope(s) {
  return typeof s === 'string' && s.startsWith(MD_TAG);
}

/**
 * Build a multi-device envelope by encrypting `plaintext` to every
 * provided recipient device. Each device entry is `{ device_id,
 * public_key }`. Returns the wire string ready to insert as
 * `messages.content`.
 *
 * Throws if the device list is empty — caller should fall back to
 * a single-recipient envelope (or refuse to send) in that case.
 */
export async function encryptForDevices(plaintext, deviceList) {
  if (!Array.isArray(deviceList) || !deviceList.length) {
    throw new Error('encryptForDevices: at least one device required');
  }
  const by_dev = {};
  for (const d of deviceList) {
    if (!d?.device_id || !d?.public_key) continue;
    // Each per-device payload is a normal ENC2 envelope, so the
    // receiving device's decryptMessage path works unchanged.
    by_dev[d.device_id] = await encryptMessage(plaintext, d.public_key);
  }
  if (!Object.keys(by_dev).length) {
    throw new Error('encryptForDevices: no usable device keys');
  }
  return MD_TAG + JSON.stringify({ v: 'multi:1', by_dev });
}

/**
 * Decrypt a multi-device envelope picking my own device_id slot.
 * Falls through with a clear error if my device isn't included
 * (sender hadn't seen this device's key when they encrypted).
 */
export async function decryptForMyDevice(wire, myDeviceId) {
  if (!isMultiDeviceEnvelope(wire)) throw new Error('Not a multi-device envelope');
  const json = wire.slice(MD_TAG.length);
  let env;
  try { env = JSON.parse(json); }
  catch { throw new Error('Malformed multi-device envelope JSON'); }
  if (!env.by_dev || !env.by_dev[myDeviceId]) {
    throw new Error(`No envelope for device ${myDeviceId.slice(0, 8)} — sender encrypted before this device's key was published`);
  }
  return await decryptMessage(env.by_dev[myDeviceId]);
}

/**
 * Convenience: encrypt to a recipient's device list AND a self-
 * envelope so the sender can read their own history back. Mirrors
 * encryptMessageForPair but for the multi-device era.
 *
 * Returns { content, metadataSelf } in the same shape so call
 * sites swap one in for the other with no other changes.
 */
export async function encryptForDevicesAndSelf(plaintext, deviceList) {
  const content = await encryptForDevices(plaintext, deviceList);
  const me = await ensureIdentityKeys();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const myPubBytes  = naclUtil.decodeBase64(me.publicKey);
  const myPrivBytes = naclUtil.decodeBase64(me.privateKey);
  const sealed = nacl.box(naclUtil.decodeUTF8(String(plaintext)), nonce, myPubBytes, myPrivBytes);
  const metadataSelf = {
    v:   ENVELOPE_V,
    ct:  naclUtil.encodeBase64(sealed),
    n:   naclUtil.encodeBase64(nonce),
    spk: me.publicKey,
  };
  return { content, metadataSelf };
}

// ── Vanishing-photo key (single-use symmetric key) ─────────
// Used elsewhere in the app for once-view media encryption.

export async function generateVanishKey() {
  return naclUtil.encodeBase64(nacl.randomBytes(32));
}

// ── Helpers ────────────────────────────────────────────────

function bytesToHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function compareBytes(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}
