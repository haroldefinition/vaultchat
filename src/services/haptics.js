// haptics.js — Tactile feedback using React Native's built-in Vibration API.
// No extra package required — Vibration is part of react-native core.
// iOS uses short precise pulses; Android uses the same durations.
import { Vibration, Platform } from 'react-native';

// Light tap — button presses, selections
export function taptic() {
  Vibration.vibrate(Platform.OS === 'android' ? 30 : 10);
}

// Medium impact — sending a message, confirming an action
export function impactMedium() {
  Vibration.vibrate(Platform.OS === 'android' ? 60 : 20);
}

// Long press — context menus, destructive actions
export function longPressFeedback() {
  Vibration.vibrate(Platform.OS === 'android' ? 80 : 30);
}

// Success — message sent, action confirmed
export function successFeedback() {
  if (Platform.OS === 'android') {
    Vibration.vibrate([0, 40, 60, 40]);
  } else {
    Vibration.vibrate(25);
  }
}
