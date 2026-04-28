// =============================================================
//  batteryOptimization.js — Android battery-optimization opt-out
//  (task #9)
//
//  WHY:
//    On Android, the OS aggressively kills background processes
//    to save battery — the most aggressive killer is the per-app
//    "Battery optimization" setting, ON by default for every app.
//    When VaultChat is on the optimization list, FCM data messages
//    can be deferred or dropped entirely, killing call delivery
//    while the app is backgrounded or fully closed.
//
//    Signal, WhatsApp, Telegram, etc. all show a one-time prompt
//    asking the user to whitelist the app from battery optimization.
//    Without it, "calls don't ring" is the most common bug report.
//
//  HOW:
//    1. After POST_NOTIFICATIONS grant, check AsyncStorage for a
//       "we already asked once" flag. If we've asked, do nothing —
//       respect the user's previous choice.
//    2. Otherwise, show an Alert explaining WHY we want battery
//       optimization disabled and what action they need to take.
//    3. On confirm, open the system Battery Optimization settings.
//       The user finds VaultChat in the list and toggles it OFF.
//    4. Set the flag so we never ask again.
//
//  iOS:
//    Skipped entirely — iOS handles VoIP wake via PushKit, no
//    equivalent setting exists.
//
//  PRECEDENT:
//    The IGNORE_BATTERY_OPTIMIZATION_SETTINGS intent has been
//    available since Android 6.0 (API 23). Every device on our
//    minSdkVersion (API 24) supports it.
// =============================================================

import { Platform, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'vaultchat_battery_optimization_prompted';

/**
 * Show the battery-optimization opt-out prompt at most once per
 * install. Safe to call repeatedly — the AsyncStorage flag prevents
 * re-prompting after the user has been asked.
 *
 * @returns {Promise<'shown'|'skipped'|'not_android'>}
 *   - 'shown'      : prompt was displayed this call
 *   - 'skipped'    : already prompted in a previous session
 *   - 'not_android': platform is not Android, no-op
 */
export async function maybePromptBatteryOptimizationExemption() {
  if (Platform.OS !== 'android') return 'not_android';

  // Check if we've already asked.
  try {
    const alreadyPrompted = await AsyncStorage.getItem(STORAGE_KEY);
    if (alreadyPrompted === '1') return 'skipped';
  } catch {
    // AsyncStorage failure is non-fatal — proceed to show the prompt.
  }

  // Mark as prompted BEFORE showing the alert so concurrent calls
  // (e.g., user signs in twice rapidly) don't double-prompt.
  try { await AsyncStorage.setItem(STORAGE_KEY, '1'); } catch {}

  return new Promise((resolve) => {
    Alert.alert(
      'Get reliable call alerts',
      'VaultChat needs to be exempt from Android\'s battery optimization so calls ring even when the app is closed. Tap "Open settings" and switch VaultChat to "Unrestricted" or "Don\'t optimize."',
      [
        {
          text: 'Not now',
          style: 'cancel',
          onPress: () => resolve('shown'),
        },
        {
          text: 'Open settings',
          onPress: async () => {
            try {
              // Try the system-wide battery optimization list first.
              // User finds VaultChat in the list and toggles it.
              await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
            } catch {
              // Fallback: app-level settings page where battery
              // optimization can be reached via Battery > Background.
              try { await Linking.openSettings(); } catch {}
            }
            resolve('shown');
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve('shown') },
    );
  });
}

/**
 * Reset the "we already asked" flag. Useful for support cases —
 * e.g., user reports calls are unreliable, support agent walks them
 * through running this from a debug screen so the prompt re-appears.
 *
 * Not currently wired to any UI; export available for future use.
 */
export async function resetBatteryOptimizationPrompt() {
  try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
}
