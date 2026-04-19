// haptics.js — Tactile feedback using React Native's built-in Vibration API.
// All functions check the 'vaultchat_haptic' AsyncStorage setting before
// vibrating. If the user has turned off haptics in Settings, every call
// is a no-op — no vibration fires anywhere in the app.
import { Vibration, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HAPTIC_KEY = 'vaultchat_haptic';

// Internal helper — reads the setting and vibrates only if enabled.
// AsyncStorage.getItem is fast (microseconds from cache) so this adds
// no perceptible delay to the gesture that triggers it.
async function vibrate(pattern) {
  try {
    const stored = await AsyncStorage.getItem(HAPTIC_KEY);
    // Default is enabled (null = never set = true)
    const enabled = stored === null ? true : JSON.parse(stored);
    if (!enabled) return;
    if (Array.isArray(pattern)) {
      Vibration.vibrate(pattern);
    } else {
      Vibration.vibrate(pattern);
    }
  } catch {
    // If AsyncStorage fails, silently skip — never crash on haptics
  }
}

// Light tap — button presses, selections
export function taptic() {
  vibrate(Platform.OS === 'android' ? 30 : 10);
}

// Medium impact — sending a message, confirming an action
export function impactMedium() {
  vibrate(Platform.OS === 'android' ? 60 : 20);
}

// Long press — context menus, destructive actions
export function longPressFeedback() {
  vibrate(Platform.OS === 'android' ? 80 : 30);
}

// Success — message sent, action confirmed
export function successFeedback() {
  vibrate(
    Platform.OS === 'android'
      ? [0, 40, 60, 40]
      : 25
  );
}
