import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let Notifications;
try { Notifications = require('expo-notifications'); } catch (e) { Notifications = null; }

// SECURITY: Never include message content in notifications
// This counters iOS notification storage extraction vulnerability
export async function setupPushNotifications() {
  if (!Notifications) return null;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    let token;
    try {
      token = await Notifications.getExpoPushTokenAsync({ projectId: 'cdcdbb60-34c6-4acb-9728-7c321313ebc6' });
    } catch (e) {
      // Project ID not configured yet - push notifications will activate after Expo project setup
      console.log('Push token pending Expo project setup');
      return null;
    }

    await AsyncStorage.setItem('vaultchat_push_token', token.data);
    await registerTokenWithServer(token.data);
    return token.data;
  } catch (e) {
    console.log('Push setup error:', e);
    return null;
  }
}

async function registerTokenWithServer(token) {
  try {
    await fetch('https://vaultchat-production-3a96.up.railway.app/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: Platform.OS }),
    });
  } catch (e) {}
}

export async function sendPushNotification(expoPushToken, senderName) {
  // SECURITY: Never include message content in notification body
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: 'VaultChat',
    body: `New message from ${senderName || 'someone'}`, // No message content
    data: { type: 'new_message' }, // No message content in data either
  };

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
  } catch (e) {}
}

export function addNotificationListener(handler) {
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationReceivedListener(handler);
  return () => sub.remove();
}

export function addNotificationResponseListener(handler) {
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener(handler);
  return () => sub.remove();
}
