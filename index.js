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

import { Platform, AppRegistry } from 'react-native';

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
        const callId       = data.callId;
        const callerId     = data.callerId;
        const callerName   = data.callerName || 'VaultChat';
        const callerHandle = data.callerHandle || '';
        const type         = data.type || 'voice';
        const roomId       = data.roomId || data.callRoomId || null;
        if (!callId || !callerId) return;
        // Compose the Telecom "address" line — what shows under the
        // caller's name in the OS-level incoming call UI. Prefer the
        // @handle if we have it (clean, like "@jon"), otherwise fall
        // back to a generic label so the user_id UUID never leaks
        // into the user-facing UI.
        const displayHandle = callerHandle ? `@${callerHandle}` : 'VaultChat';
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
              JSON.stringify({ callId, callerId, callerHandle, callerName, type, roomId, ts: Date.now() }),
            );
          } catch {}
        }
        // Primary path: bind via ConnectionService for the OS-level
        // incoming-call UI (lock-screen ring, full-screen, etc.).
        // Pass `displayHandle` (the @handle) as the Telecom address so
        // the call UI shows "@jon" under the name, never the raw UUID.
        try {
          await RNCallKeep.displayIncomingCall(
            callId,
            displayHandle,
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

    // Register the callkeep `answerCall` listener at MODULE-EVAL TIME
    // so it's wired up the moment any JS context starts — including
    // the headless context FCM uses to wake the app. Without this,
    // when a user taps Accept on the OS-level call UI from a cold
    // (killed) state, the event fires before voipPushService's
    // listener (which only registers after sign-in via _startAndroidPush)
    // exists, so the call:accept signal never reaches the server and
    // the caller keeps ringing forever.
    //
    // The handler is fully self-contained: it reads the pending call
    // (stashed by setBackgroundMessageHandler), resolves myUserId from
    // the live Supabase session, stages callPeer, and emits call:accept.
    try {
      RNCallKeep.addEventListener('answerCall', async ({ callUUID }) => {
        console.warn('[voip] answerCall (index.js) callUUID=', callUUID);
        try { RNCallKeep.setCurrentCallActive(callUUID); } catch {}
        try {
          if (!AsyncStorageModule) return;
          const raw = await AsyncStorageModule.getItem('vaultchat_pending_incoming_call');
          if (!raw) {
            console.warn('[voip] no pending call in storage');
            return;
          }
          const pending = JSON.parse(raw);
          if (pending?.callId !== callUUID) {
            console.warn('[voip] pending callId mismatch', pending?.callId, 'vs', callUUID);
            return;
          }
          const { supabase: sb } = require('./src/services/supabase');
          const callPeer = require('./src/services/callPeer');
          const { data: sess } = await sb.auth.getSession();
          const myUid = sess?.session?.user?.id;
          if (!myUid) {
            console.warn('[voip] no Supabase session — skipping accept');
            return;
          }
          callPeer.handleIncomingInvite?.({
            callId:   pending.callId,
            roomId:   pending.roomId,
            callerId: pending.callerId,
            type:     pending.type || 'voice',
          });
          await callPeer.accept?.(myUid);
          console.warn('[voip] callPeer.accept resolved — call:accept emitted');
          await AsyncStorageModule.removeItem('vaultchat_pending_incoming_call');
        } catch (e) {
          console.warn('[voip] index.js answerCall failed:', e?.message || e);
        }
      });
      RNCallKeep.addEventListener('endCall', async ({ callUUID }) => {
        console.warn('[voip] endCall (index.js) callUUID=', callUUID);
        try {
          if (AsyncStorageModule) {
            await AsyncStorageModule.removeItem('vaultchat_pending_incoming_call');
          }
        } catch {}
      });
    } catch (e) {
      if (__DEV__) console.warn('[index] callkeep listener registration failed:', e?.message);
    }
  }
}

// Register the callkeep HeadlessJS task BEFORE registering the React
// root. callkeep's RNCallKeepBackgroundMessagingService dispatches
// answer/end events to this task name when the app is killed — it's
// the ONLY reliable way to receive the answerCall signal on a fully-
// cold-wake. Plain RNCallKeep.addEventListener registrations only
// work when a JS context is alive at the moment the event fires;
// after `am kill`, no context exists, so the listener never sees
// the answer tap.
//
// Task contract (callkeep): receives { name, callUUID, ... } where
// name === 'answer' for accept, 'endCall' for decline/end.
AppRegistry.registerHeadlessTask('RNCallKeepBackgroundMessage', () => async ({ name, callUUID }) => {
  console.warn('[voip] headless RNCallKeepBackgroundMessage', name, callUUID);
  if (name !== 'answer') return;
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const raw = await AsyncStorage.getItem('vaultchat_pending_incoming_call');
    if (!raw) {
      console.warn('[voip] headless: no pending call');
      return;
    }
    const pending = JSON.parse(raw);
    if (pending?.callId !== callUUID) {
      console.warn('[voip] headless: callId mismatch', pending?.callId, 'vs', callUUID);
      return;
    }
    const { supabase: sb } = require('./src/services/supabase');
    const callPeer = require('./src/services/callPeer');
    const { data: sess } = await sb.auth.getSession();
    const myUid = sess?.session?.user?.id;
    if (!myUid) {
      console.warn('[voip] headless: no Supabase session');
      return;
    }
    callPeer.handleIncomingInvite?.({
      callId:   pending.callId,
      roomId:   pending.roomId,
      callerId: pending.callerId,
      type:     pending.type || 'voice',
    });
    await callPeer.accept?.(myUid);
    await AsyncStorage.removeItem('vaultchat_pending_incoming_call');
    console.warn('[voip] headless: call:accept emitted');
  } catch (e) {
    console.warn('[voip] headless task failed:', e?.message || e);
  }
});

// Hand control to Expo's standard registration after the FCM
// handler is in place. registerRootComponent is what Expo's
// AppEntry.js does internally — we just front-load the FCM
// handler registration above. Expo SDK 50+ no longer needs the
// old `expo/build/Expo.fx` side-effect import; importing
// `registerRootComponent` from 'expo' wires everything needed.
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
