// ============================================================
//  index.js — Expo entry point (Phase AAA / task #60)
//
//  This file replaces the default `expo/AppEntry.js` so we can
//  register the Firebase Cloud Messaging BACKGROUND handler
//  BEFORE the React app mounts. The headless JS runtime that
//  fires when an FCM data message wakes a fully-killed Android
//  app picks up handlers registered at module-evaluation time —
//  anything inside a React component lifecycle is too late.
//
//  The handler immediately calls RNCallKeep.displayIncomingCall
//  so the OS-level incoming-call UI shows on the lock screen
//  within Android's tight wake-budget. The rest of the call
//  pipeline (WebRTC connect, navigation to ActiveCall) takes
//  over once the user accepts and the foreground app boots.
//
//  iOS skips this whole branch — the PushKit background path
//  is handled natively by react-native-voip-push-notification's
//  AppDelegate hooks and does not require a JS handler at this
//  level.
// ============================================================

import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  // Wrap each native require in try/catch so dev/Expo Go builds
  // (which lack the native modules) don't crash on import.
  let messaging   = null;
  let RNCallKeep  = null;
  let notifee     = null;
  let AndroidImportance = null;
  let AsyncStorageModule = null;
  try {
    messaging = require('@react-native-firebase/messaging').default
             || require('@react-native-firebase/messaging');
  } catch {}
  try {
    RNCallKeep = require('react-native-callkeep').default
              || require('react-native-callkeep');
  } catch {}
  try {
    const notifeeModule = require('@notifee/react-native');
    notifee           = notifeeModule.default || notifeeModule;
    AndroidImportance = notifeeModule.AndroidImportance;
  } catch {}
  try {
    AsyncStorageModule = require('@react-native-async-storage/async-storage').default
                      || require('@react-native-async-storage/async-storage');
  } catch {}

  // ── High-priority "Incoming Calls" channel (task #4) ──────────
  // Android 8+ requires every notification to declare its channel.
  // The incoming-call channel needs IMPORTANCE_HIGH so it shows as
  // a heads-up alert and bypasses ambient sound restrictions, plus
  // a ringtone + vibration so it's audible from a locked phone.
  //
  // Why register it here, at module-eval time:
  //   When an FCM data message wakes the app from a fully-killed
  //   state, the headless JS context runs THIS file BEFORE any
  //   React component mounts. Channel creation is idempotent — if
  //   it already exists, this is a no-op. Done early ensures the
  //   channel exists before displayIncomingCall is invoked.
  if (notifee && AndroidImportance) {
    notifee.createChannel({
      id:          'incoming_calls',
      name:        'Incoming Calls',
      description: 'Ring tone for incoming VaultChat calls.',
      importance:  AndroidImportance.HIGH,
      sound:       'default',
      vibration:   true,
      vibrationPattern: [300, 500, 300, 500],
      bypassDnd:   true,
    }).catch(() => {});
  }

  if (messaging && RNCallKeep) {
    // Wrap the registration itself in try/catch — Firebase throws
    // synchronously if no [DEFAULT] app exists (i.e., the build was
    // produced without google-services.json). We don't want a missing
    // FCM config to keep the entire app from booting.
    try {
      messaging().setBackgroundMessageHandler(async (remoteMessage) => {
        const data = remoteMessage?.data || {};
        const callId     = data.callId;
        const callerId   = data.callerId;
        const callerName = data.callerName || 'VaultChat';
        const type       = data.type || 'voice';
        const roomId     = data.roomId || data.callRoomId || null;
        if (!callId || !callerId) return;
        // Stash the call params in AsyncStorage so the answerCall
        // event handler in voipPushService can pick them up when the
        // user taps Accept on the OS-level call UI. Without this,
        // callkeep flips its own state to "active" but the JS side
        // never knows which call to send `call:accept` for, so the
        // caller's iPhone keeps ringing forever.
        if (AsyncStorageModule) {
          try {
            await AsyncStorageModule.setItem(
              'vaultchat_pending_incoming_call',
              JSON.stringify({ callId, callerId, callerName, type, roomId, ts: Date.now() }),
            );
          } catch {}
        }
        // Primary path: bind via ConnectionService for the OS-level
        // incoming-call UI (lock-screen ring, full-screen, etc.).
        try {
          await RNCallKeep.displayIncomingCall(
            callId,
            callerId,
            callerName,
            'generic',
            type === 'video',
          );
        } catch (e) {}
        // Belt-and-suspenders fallback: also show a high-priority
        // notifee notification on the incoming_calls channel. If
        // RNCallKeep silently fails (PhoneAccount not enabled, etc.),
        // this still gives the user a heads-up notification with
        // a full-screen intent. Tapping it opens the app, where the
        // foreground call:incoming socket event routes them to
        // ActiveCall normally.
        if (notifee) {
          try {
            await notifee.displayNotification({
              id: `incoming-${callId}`,
              title: callerName,
              body:  type === 'video' ? 'Incoming video call…' : 'Incoming voice call…',
              data:  { callId, callerId, callerName, type },
              android: {
                channelId: 'incoming_calls',
                category:  'call',
                importance: AndroidImportance.HIGH,
                pressAction:      { id: 'default', launchActivity: 'default' },
                fullScreenAction: { id: 'default', launchActivity: 'default' },
              },
            });
          } catch (e) {}
        }
      });
    } catch (e) {
      if (__DEV__) console.warn('[index] setBackgroundMessageHandler failed:', e?.message);
    }
  }
}

// Hand control to Expo's standard registration after the FCM
// handler is in place. registerRootComponent is what Expo's
// AppEntry.js does internally — we just front-load the FCM
// handler registration above. Expo SDK 50+ no longer needs the
// old `expo/build/Expo.fx` side-effect import; importing
// `registerRootComponent` from 'expo' wires everything needed.
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
