// ============================================================
//  deviceIntegrity.js — task #128, security audit fix
//  Detect jailbroken / rooted devices and surface a warning.
//
//  Why this exists:
//    On a jailbroken iOS device or rooted Android device, attackers
//    can hook into VaultChat's process via tools like Frida or
//    Cycript. They can read decrypted messages from memory, dump
//    Keychain entries, and inspect WebRTC streams.
//
//    We can't prevent this — once the OS is compromised, no app-level
//    defense holds. But we CAN warn the user that their privacy
//    guarantees are reduced. A privacy app that silently keeps
//    operating on a compromised device is dishonest about its
//    threat model.
//
//  Behavior:
//    - On app start, check device integrity asynchronously
//    - If compromised AND user hasn't dismissed the warning before:
//        show a one-time dismissable Alert with a clear explanation
//    - Cache the dismissal in AsyncStorage so we don't nag every launch
//    - Tracking flag also exposed via isDeviceCompromised() for any
//      surface that wants to add a small "reduced security" badge
//
//  We do NOT:
//    - Block the app from running (would break legitimate jailbroken
//      developer devices, including iOS Simulator detection edge cases)
//    - Phone home with the result (user privacy)
//    - Disable features or refuse messages
// ============================================================

import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Lazy native-module require — no-op on Expo Go / web / tests.
let JailMonkey = null;
try {
  JailMonkey = require('jail-monkey').default || require('jail-monkey');
} catch (e) { /* shim */ }

const DISMISSED_KEY = 'vaultchat_jailbreak_warning_dismissed';

let _checked       = false;
let _isCompromised = false;

/**
 * Run the device integrity check (idempotent — safe to call multiple times).
 * Returns true if device is jailbroken/rooted, false otherwise.
 *
 * Detection methods (per jail-monkey docs):
 *   - iOS: Cydia URL scheme, common jailbreak files, fork() callable
 *   - Android: su binaries, BusyBox, dangerous build tags, common root apps
 *
 * False-positive rate is ~0% on production iOS; slightly higher on Android
 * where some carriers ship modified ROMs. We treat any positive as a warning,
 * not a block, so false positives just over-warn — they don't break the app.
 */
export async function checkDeviceIntegrity() {
  if (_checked) return _isCompromised;
  _checked = true;
  if (!JailMonkey) return false;
  try {
    if (Platform.OS === 'ios') {
      _isCompromised = !!JailMonkey.isJailBroken();
    } else if (Platform.OS === 'android') {
      _isCompromised = !!(JailMonkey.isJailBroken() || JailMonkey.canMockLocation());
    }
  } catch (e) {
    if (__DEV__) console.warn('[deviceIntegrity] check failed:', e?.message || e);
    _isCompromised = false;
  }
  return _isCompromised;
}

/** Synchronous accessor for the cached result. Returns false until checkDeviceIntegrity has resolved. */
export function isDeviceCompromised() {
  return _isCompromised;
}

/**
 * Check device integrity and, if compromised, show a one-time warning.
 * Mount once at app start (after first successful sign-in is fine).
 *
 * The warning is intentionally one-time per device — it would be
 * paternalistic to nag every launch. Power users who jailbreak know
 * what they're doing; we just want to make sure they know we know.
 */
export async function maybeWarnAboutDeviceIntegrity() {
  const compromised = await checkDeviceIntegrity();
  if (!compromised) return;
  try {
    const dismissed = await AsyncStorage.getItem(DISMISSED_KEY);
    if (dismissed === 'true') return;
  } catch {}

  const platformLabel = Platform.OS === 'ios' ? 'jailbroken' : 'rooted';
  Alert.alert(
    'Device Security Warning',
    `Your device appears to be ${platformLabel}. VaultChat\'s privacy guarantees rely on iOS / Android sandboxing — on a ${platformLabel} device, other apps or hooks may be able to read VaultChat\'s memory, including decrypted messages.\n\nVaultChat will keep working, but your conversations are not as private as on a stock device. We recommend not using VaultChat for sensitive conversations on this phone.`,
    [
      { text: 'Don\'t show again', onPress: () => AsyncStorage.setItem(DISMISSED_KEY, 'true').catch(() => {}) },
      { text: 'OK', style: 'cancel' },
    ],
  );
}
