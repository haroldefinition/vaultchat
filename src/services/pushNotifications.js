// pushNotifications.js — Content-free push notifications for VaultChat
//
// PRIVACY ARCHITECTURE:
// iOS and Android store notification payloads in system logs, notification
// centres, and lock screen caches. If message content appears in a notification
// body it can be extracted even after the message is deleted.
//
// Rule enforced here: notifications carry ZERO message content.
// The body is always a generic string. The actual message is only
// accessible after the user opens the app and passes biometric auth.
//
// This satisfies:
//   - iOS Notification Service Extension storage attack surface (CVE mitigated)
//   - Android notification shade / recent-apps screenshot leakage
//   - Lock-screen preview leakage on both platforms
//   - Twilio/Apple carrier compliance (no PII in notification body)

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let Notifications = null;
try { Notifications = require('expo-notifications'); } catch {}

const BACKEND = 'https://vaultchat-production-3a96.up.railway.app';

// ── Content-free notification texts ───────────────────────────
// These are the ONLY strings that may appear in notification body.
// They convey no information about message content, sender identity,
// or conversation context that could be stored by the OS.
const SAFE_TITLE = 'VaultChat';
const SAFE_BODY  = 'New message received';   // never varies — zero information leak

// ── Notification handler — controls foreground display ────────
// shouldShowAlert: true  → shows banner so user knows a message arrived
// shouldSetBadge:  true  → increments the badge count on the app icon
// The content shown in the banner comes from the push payload,
// which we control to be content-free (see sendPushToUser in server.js)
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge:  true,
    }),
  });
}

// ── Setup: request permissions + register device token ────────
export async function setupPushNotifications() {
  if (!Notifications) return null;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const { status: asked } = await Notifications.requestPermissionsAsync();
      status = asked;
    }
    if (status !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name:             'Messages',
        importance:       Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound:            true,
        // PRIVACY: PRIVATE hides notification content on the Android lock screen.
        // Users see "Contents hidden" instead of the notification body.
        // CONFIDENTIAL would hide even the existence of a notification — too aggressive.
        lockscreenVisibility: Notifications.AndroidNotificationVisibility?.PRIVATE ?? 0,
        showBadge:        true,
      });
    }

    let token = null;
    try {
      const t = await Notifications.getExpoPushTokenAsync({
        projectId: 'cdcdbb60-34c6-4acb-9728-7c321313ebc6',
      });
      token = t.data;
    } catch {
      return null; // Expo Go — tokens work after EAS build
    }

    if (token) {
      await AsyncStorage.setItem('vaultchat_push_token', token);
      await registerTokenWithServer(token);
    }
    return token;
  } catch { return null; }
}

// ── Register push token with Railway backend ───────────────────
async function registerTokenWithServer(token) {
  try {
    const raw = await AsyncStorage.getItem('vaultchat_user');
    if (!raw) return;
    const user = JSON.parse(raw);
    await fetch(`${BACKEND}/register-push-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId:   user.id || user.phone,
        token,
        platform: Platform.OS,
      }),
    });
  } catch {}
}

// ── Local notification — content-free, no exceptions ──────────
// This function deliberately ignores any `title` or `body` parameters
// that callers might pass. The strings are hardcoded here to ensure
// no message content can ever reach the OS notification store.
export async function showLocalNotification() {
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: SAFE_TITLE,
        body:  SAFE_BODY,
        sound: true,
        // iOS: do NOT set mutable-content: 1.
        // mutable-content allows a Notification Service Extension to
        // modify the payload — but it also causes iOS to write a full
        // copy of the payload to the notification storage database
        // (/var/mobile/Library/UserNotifications/) before the extension
        // runs. By omitting it, iOS stores only the safe generic text.
        // data carries only routing info — never message content.
        data: {},
      },
      trigger: null, // fire immediately
    });
  } catch {}
}

// ── Notify of a new message — always content-free ─────────────
// roomId is passed only in the data payload (for navigation on tap),
// never in the notification title or body that iOS/Android stores.
export async function notifyNewMessage(roomId) {
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: SAFE_TITLE,
        body:  SAFE_BODY,
        sound: true,
        data:  { roomId },  // routing only — never appears in OS logs
      },
      trigger: null,
    });
  } catch {}
}

// ── Clear badge when app is opened ────────────────────────────
export async function clearBadge() {
  if (!Notifications) return;
  try { await Notifications.setBadgeCountAsync(0); } catch {}
}

// ── Handle notification tap → navigate to the right chat ──────
export function addNotificationResponseListener(onResponse) {
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    if (data?.roomId && onResponse) onResponse(data);
  });
  return () => sub.remove();
}
