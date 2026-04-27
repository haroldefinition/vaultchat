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
  try {
    messaging = require('@react-native-firebase/messaging').default
             || require('@react-native-firebase/messaging');
  } catch {}
  try {
    RNCallKeep = require('react-native-callkeep').default
              || require('react-native-callkeep');
  } catch {}

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
        if (!callId || !callerId) return;
        try {
          await RNCallKeep.displayIncomingCall(
            callId,
            callerId,
            callerName,
            'generic',
            type === 'video',
          );
        } catch (e) {}
      });
    } catch (e) {
      console.warn('[index] setBackgroundMessageHandler failed:', e?.message);
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
