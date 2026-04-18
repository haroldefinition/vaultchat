// pushNotifications.js — Push notification setup and local notification helpers
// Push notifications require a native/EAS build — they do NOT work in Expo Go.
// All code is ready; run `eas build` after Apple Developer enrollment to activate.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let Notifications = null;
try { Notifications = require('expo-notifications'); } catch {}

const BACKEND = 'https://vaultchat-production-3a96.up.railway.app';

// ── Notification appearance ────────────────────────────────────
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge:  true,
    }),
  });
}

// ── Request permissions and register device token ─────────────
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

    // Android channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: true,
      });
    }

    // Get Expo push token
    let token = null;
    try {
      const t = await Notifications.getExpoPushTokenAsync({
        projectId: 'cdcdbb60-34c6-4acb-9728-7c321313ebc6',
      });
      token = t.data;
    } catch {
      // Token unavailable in Expo Go — will work after EAS build
      return null;
    }

    if (token) {
      await AsyncStorage.setItem('vaultchat_push_token', token);
      await registerTokenWithServer(token);
    }

    return token;
  } catch { return null; }
}

// ── Register token with backend so server can send to this device ──
async function registerTokenWithServer(token) {
  try {
    const raw = await AsyncStorage.getItem('vaultchat_user');
    if (!raw) return;
    const user = JSON.parse(raw);
    await fetch(`${BACKEND}/register-push-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id || user.phone, token, platform: Platform.OS }),
    });
  } catch {}
}

// ── Send a local notification (works in Expo Go for testing) ──
export async function showLocalNotification(title, body) {
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        // SECURITY: Never put message content in title or body
        // Use generic text only — content is end-to-end encrypted
      },
      trigger: null, // immediate
    });
  } catch {}
}

// ── Show a new-message notification (content-free for privacy) ──
export async function notifyNewMessage(senderName, roomId) {
  await showLocalNotification(
    'VaultChat',
    `New message from ${senderName || 'someone'}`
    // Note: never include actual message content — security requirement
  );
}

// ── Clear badge count when user opens app ─────────────────────
export async function clearBadge() {
  if (!Notifications) return;
  try { await Notifications.setBadgeCountAsync(0); } catch {}
}

// ── Listen for notification taps to navigate to the right chat ─
export function addNotificationResponseListener(onResponse) {
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    if (data?.roomId && onResponse) onResponse(data);
  });
  return () => sub.remove();
}
