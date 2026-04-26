// ============================================================
//  VaultChat — Vault Mode (task #84)
//  src/services/vault.js
//
//  Hide specific chats behind a separate PIN. Day-to-day the
//  vaulted chats don't appear in the chat list at all — to see
//  them, the user enters their Vault PIN via a hidden gesture
//  (long-press the Chats title). Once unlocked, the list flips
//  to show ONLY vaulted chats. Going to background or tapping
//  back to "All" re-locks the vault.
//
//  Distinct from the existing PIN system:
//    - Real PIN     → unlocks the app at biometric lock screen
//    - Decoy PIN    → unlocks into an empty/fake chat list
//    - Vault PIN    → reveals the vaulted-chats view from inside
//                     the normal app session
//
//  Storage:
//    vaultchat_vault_pin    — SHA-256-hashed PIN (or plain in
//                              dev mode for now; matches real_pin
//                              storage style for consistency)
//    vaultchat_vaulted_ids  — JSON array of chat IDs currently
//                              vaulted
//
//  In-memory state (NOT persisted):
//    unlocked    — true while the user is in the vault view.
//                  Cleared on app background / explicit lock.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPin, setPin, clearPin, hasPin, PIN_KEY_VAULT } from './securePinStore';

// Vault PIN now lives in iOS Keychain / Android Keystore via
// expo-secure-store (security audit fix #121). The vaulted-id list
// itself stays in AsyncStorage — it's just a list of chat IDs, not
// a secret, and putting it in Keychain would be overkill.
const PIN_KEY     = PIN_KEY_VAULT;
const VAULTED_KEY = 'vaultchat_vaulted_ids';

let _unlocked = false;
const _listeners = new Set();

function notify() {
  for (const cb of _listeners) { try { cb(_unlocked); } catch {} }
}

export function subscribe(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

export function isUnlocked() { return _unlocked; }

/**
 * Try to unlock the vault with a PIN. Returns true on success.
 * If no Vault PIN has been set yet, returns false (caller should
 * prompt the user to set one in Settings first).
 */
export async function unlock(pinAttempt) {
  try {
    const stored = await getPin(PIN_KEY);
    if (!stored) return false;
    if (String(pinAttempt) === stored) {
      _unlocked = true;
      notify();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Manually re-lock — UI calls this on app background / explicit lock. */
export function lock() {
  if (!_unlocked) return;
  _unlocked = false;
  notify();
}

export async function hasVaultPin() {
  try {
    return await hasPin(PIN_KEY);
  } catch {
    return false;
  }
}

export async function setVaultPin(pin) {
  if (!pin || String(pin).length < 4) return false;
  try {
    return await setPin(PIN_KEY, String(pin));
  } catch {
    return false;
  }
}

export async function clearVaultPin() {
  try {
    await clearPin(PIN_KEY);
    await AsyncStorage.removeItem(VAULTED_KEY); // also clear the vaulted list — no PIN, no vault
    _unlocked = false;
    notify();
    return true;
  } catch {
    return false;
  }
}

// ── Vaulted chat IDs ─────────────────────────────────────────

export async function listVaultedIds() {
  try {
    const raw = await AsyncStorage.getItem(VAULTED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeVaulted(ids) {
  try { await AsyncStorage.setItem(VAULTED_KEY, JSON.stringify(ids)); } catch {}
  notify();
}

export async function addToVault(chatId) {
  if (!chatId) return;
  const ids = await listVaultedIds();
  if (!ids.includes(chatId)) {
    ids.push(chatId);
    await writeVaulted(ids);
  }
}

export async function removeFromVault(chatId) {
  if (!chatId) return;
  const ids = await listVaultedIds();
  await writeVaulted(ids.filter(id => id !== chatId));
}

export async function isVaulted(chatId) {
  if (!chatId) return false;
  const ids = await listVaultedIds();
  return ids.includes(chatId);
}
