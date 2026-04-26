// ============================================================
//  securePinStore.js — task #121, security audit fix
//  Hardware-backed PIN storage via Keychain (iOS) / Keystore (Android).
//
//  Why this exists:
//    AsyncStorage on iOS is backed by NSUserDefaults, which does NOT
//    use iOS Data Protection by default. PINs stored there sit in a
//    plaintext .plist in the app's Documents folder and survive
//    forensic device extraction — a privacy-app failure mode that
//    would erode user trust if it ever surfaced.
//
//    expo-secure-store uses the iOS Keychain (Secure Enclave on
//    devices that have one) and Android Keystore. Items are encrypted
//    with hardware-backed keys, gated by the device passcode, and
//    NOT included in iCloud / Google Drive backups.
//
//  Migration (one-time, automatic on first call):
//    Old AsyncStorage PIN values get read once, copied to
//    SecureStore, then deleted from AsyncStorage. After that the
//    AsyncStorage slot is empty forever.
//
//  Keys (mirror the old AsyncStorage keys for clarity):
//    vaultchat_real_pin   — primary app-unlock PIN
//    vaultchat_decoy_pin  — decoy PIN that opens the empty fake list
//    vaultchat_vault_pin  — Vault mode reveal PIN
// ============================================================

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// SecureStore options:
//   keychainAccessible: WHEN_UNLOCKED — value can only be read while
//     the device is unlocked. Strikes the right balance between
//     security (background access blocked while phone is locked)
//     and usability (PINs work when the user opens the app).
//
//   For the absolute strictest setting we'd use WHEN_PASSCODE_SET_THIS_DEVICE_ONLY
//   but that breaks if the user disables their device passcode (rare but
//   possible). WHEN_UNLOCKED is the standard for this kind of secret.
const STORE_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED,
};

const PIN_KEYS = ['vaultchat_real_pin', 'vaultchat_decoy_pin', 'vaultchat_vault_pin'];

// Tracks whether we've already done the AsyncStorage → SecureStore
// migration in this process. Migration only runs once per app install.
let _migrationDone = false;

async function _ensureMigrated() {
  if (_migrationDone) return;
  for (const key of PIN_KEYS) {
    try {
      const legacy = await AsyncStorage.getItem(key);
      if (legacy) {
        // Only copy if SecureStore doesn't already have this key
        // (e.g., user reinstalled the app — Keychain entries can
        // survive uninstall depending on iOS Data Protection class).
        const existing = await SecureStore.getItemAsync(key, STORE_OPTIONS);
        if (!existing) {
          await SecureStore.setItemAsync(key, String(legacy), STORE_OPTIONS);
        }
        // Wipe the AsyncStorage copy regardless — leaving it would
        // defeat the entire point of this migration.
        await AsyncStorage.removeItem(key);
      }
    } catch (e) {
      if (__DEV__) console.warn(`[securePinStore] migration of ${key} failed:`, e?.message || e);
    }
  }
  _migrationDone = true;
}

/**
 * Read a PIN. Returns the stored string, or null if not set.
 * Lazy-migrates from AsyncStorage on first call per session.
 */
export async function getPin(key) {
  await _ensureMigrated();
  try {
    return await SecureStore.getItemAsync(key, STORE_OPTIONS);
  } catch (e) {
    if (__DEV__) console.warn(`[securePinStore] getPin(${key}) failed:`, e?.message || e);
    return null;
  }
}

/**
 * Save a PIN. Overwrites any existing value at the same key.
 * Returns true on success, false on error.
 */
export async function setPin(key, value) {
  await _ensureMigrated();
  if (value === null || value === undefined || value === '') {
    return clearPin(key);
  }
  try {
    await SecureStore.setItemAsync(key, String(value), STORE_OPTIONS);
    return true;
  } catch (e) {
    if (__DEV__) console.warn(`[securePinStore] setPin(${key}) failed:`, e?.message || e);
    return false;
  }
}

/**
 * Delete a PIN. Idempotent — returns true even if the key didn't exist.
 */
export async function clearPin(key) {
  try {
    await SecureStore.deleteItemAsync(key, STORE_OPTIONS);
    return true;
  } catch (e) {
    // SecureStore throws on missing keys on some platforms — that's
    // not an error from our perspective, the goal state (no PIN) is met.
    if (__DEV__) console.warn(`[securePinStore] clearPin(${key}) note:`, e?.message || e);
    return true;
  }
}

/**
 * Check if a PIN is set without retrieving its value. Useful for the
 * "PIN is set" indicator in Settings without leaking the PIN itself
 * into the React state tree.
 */
export async function hasPin(key) {
  const v = await getPin(key);
  return !!v && v.length > 0;
}

// Re-export the canonical key names so callers don't typo them.
export const PIN_KEY_REAL  = 'vaultchat_real_pin';
export const PIN_KEY_DECOY = 'vaultchat_decoy_pin';
export const PIN_KEY_VAULT = 'vaultchat_vault_pin';
