// ============================================================
//  deviceIdentity.js — stable per-install device id
//
//  Generated once on first call, persisted in expo-secure-store
//  (hardware keychain on iOS / EncryptedSharedPreferences on
//  Android). Survives app restarts and most reinstalls — used as:
//
//    1. The unique key in user_device_keys so each install can
//       publish its own NaCl public key (Phase MM).
//    2. The device-scoped owner of cross-device sync rows in
//       user_chat_prefs so we know which device wrote what
//       (Phase OO).
//    3. A label on per-device PushKit + IAP receipts so we can
//       attribute push tokens / restore activity to the right
//       device record.
//
//  RAM-cached after first read so the hot path (every encrypt
//  on send) doesn't hit SecureStore repeatedly.
// ============================================================

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const KEY = 'vaultchat_device_id';
const STORE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED };

let _cached = null;

/**
 * Returns this install's device_id, generating + persisting one
 * on the first call. Idempotent — safe to call from anywhere.
 */
export async function getDeviceId() {
  if (_cached) return _cached;
  try {
    let id = await SecureStore.getItemAsync(KEY, STORE_OPTIONS);
    if (!id) {
      // expo-crypto.randomUUID returns a v4 UUID without bringing in
      // a fresh native dep — already a transitive dep of expo.
      id = Crypto.randomUUID
        ? Crypto.randomUUID()
        : (await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            String(Date.now()) + Math.random(),
          )).slice(0, 36);
      await SecureStore.setItemAsync(KEY, id, STORE_OPTIONS);
    }
    _cached = id;
    return id;
  } catch (e) {
    if (__DEV__) console.warn('getDeviceId fallback:', e?.message);
    // Last-resort fallback so the rest of the app doesn't break if
    // SecureStore is briefly unavailable. NOT persisted — caller
    // should retry on next launch.
    if (!_cached) _cached = `ephem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    return _cached;
  }
}

/**
 * Best-effort label for the device key entry. Falls back to a
 * short fingerprint so the user can tell rows apart in any future
 * device-management UI.
 */
export async function getDeviceLabel() {
  try {
    // expo-device is optional; if it's installed we can show "iPhone 15 Pro".
    const Device = require('expo-device');
    const name = Device?.deviceName || Device?.modelName;
    if (name) return String(name);
  } catch {}
  const id = await getDeviceId();
  return `Device ${id.slice(0, 8)}`;
}

/** Test/hard-reset hook — wipes the cached + persisted id. */
export async function _resetDeviceIdForTests() {
  _cached = null;
  try { await SecureStore.deleteItemAsync(KEY, STORE_OPTIONS); } catch {}
}

/**
 * Production rotation hook. Wipes the cached + persisted device_id
 * so the next getDeviceId() call generates a fresh UUID. Used by
 * publishMyDeviceKey to recover from the orphaned-key state on
 * iOS reinstall:
 *
 *   - iOS Keychain (where we store device_id) survives the
 *     reinstall, so getDeviceId() returns the OLD id even after
 *     the user re-installs.
 *   - AsyncStorage (where the identity keypair lives) does NOT
 *     survive, so loadIdentityKeys() returns null and a NEW
 *     keypair gets generated.
 *   - publishMyDeviceKey upserts (user_id, OLD device_id,
 *     NEW public_key). If the upsert UPDATE doesn't actually
 *     replace public_key (silent RLS rejection, replication
 *     lag, or any other reason), peers continue encrypting to
 *     the stale published key — the user never receives any
 *     decryptable message.
 *
 * Rotation breaks the cycle: we drop the keychain device_id,
 * generate a fresh one, and INSERT a new user_device_keys row
 * with our NEW public_key. The orphan row stays in the table
 * (peers will see it but can't reach this install through it
 * — they'll prefer the newer row by last_seen_at).
 *
 * Returns the new device_id.
 */
export async function rotateDeviceId() {
  _cached = null;
  try { await SecureStore.deleteItemAsync(KEY, STORE_OPTIONS); } catch {}
  return getDeviceId();
}
