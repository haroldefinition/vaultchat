// ============================================================
//  voipPushService.js — tasks #103 (iOS) + #60 (Android)
//
//  Cold-state incoming-call delivery for both platforms:
//
//  iOS (PushKit / APNs):
//    1. App boot → register VoIP push handler with iOS via
//       react-native-voip-push-notification.
//    2. iOS hands us a PushKit token. We POST it to /pushkit/register
//       with platform='ios'.
//    3. Server fans out a VoIP push via APNs. iOS wakes the app
//       and delivers to didReceiveIncomingPush. We MUST display
//       CallKit within ~5 seconds or iOS revokes the entitlement.
//
//  Android (FCM / ConnectionService):
//    1. App boot → register Firebase messaging handler.
//    2. Firebase hands us an FCM token. We POST it to /pushkit/register
//       with platform='android'.
//    3. Server fans out via FCM HTTP v1 high-priority data message.
//       Android wakes the app — the BACKGROUND handler is registered
//       in index.js (must be set up BEFORE App mounts so headless JS
//       can pick it up from a fully-killed state).
//    4. The handler immediately calls RNCallKeep.displayIncomingCall
//       which binds to our self-managed ConnectionService and renders
//       the OS-level incoming-call UI on the lock screen.
//
//  Dev note:
//    Both platforms require a development build (expo prebuild +
//    native compile). Expo Go users get undefined module imports,
//    which is why we wrap each native require in try/catch and
//    silently no-op when missing. Matches Harold's policy:
//    expo-dev-client only.
// ============================================================

import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as callPeer from './callPeer';
import * as roomCall from './roomCall';
import { displayIncomingCall, setupCallKit } from './callkit';

// Lazy native-module require — Expo Go and tests don't have it.
//
// TEMPORARILY DISABLED (TODO: re-enable after wiring AppDelegate):
// react-native-voip-push-notification requires native AppDelegate
// methods (pushRegistry:didUpdatePushCredentials:forType: etc.) that
// Expo prebuild doesn't auto-generate. Without those methods, iOS
// crashes the app on launch when the PKPushRegistry tries to deliver
// the VoIP token. We disable the whole module here until a proper
// Expo config plugin is wired to inject the AppDelegate code.
//
// To re-enable: write a config plugin OR manually add the four
// PushKit methods to ios/VaultChat/AppDelegate.swift, then revert
// this comment and re-run npx expo run:ios.
let VoipPushNotification = null;
// try {
//   VoipPushNotification = require('react-native-voip-push-notification').default
//                        || require('react-native-voip-push-notification');
// } catch (e) {}

const BACKEND       = 'https://vaultchat-production-3a96.up.railway.app';
const TOKEN_KEY     = 'vaultchat_pushkit_token';
const TOKEN_USER_KEY = 'vaultchat_pushkit_token_user';

let _started = false;
let _myUserId = null;

/**
 * Mount once at app start, after we know the current user id.
 * Safe to call multiple times — no-ops after first successful start.
 */
export async function startVoipPush({ myUserId }) {
  if (_started || !myUserId) return;

  // Android branch — Firebase Cloud Messaging + react-native-callkeep.
  // Lives in a separate function so the module shape stays clean.
  if (Platform.OS === 'android') {
    return _startAndroidPush({ myUserId });
  }

  if (Platform.OS !== 'ios') return;
  if (!VoipPushNotification) {
    if (__DEV__) console.log('[voip] react-native-voip-push-notification not installed — skipping');
    return;
  }

  _myUserId = myUserId;

  // CallKit must be set up before the first incoming push, otherwise
  // the displayIncomingCall call inside _onIncomingPush is a no-op.
  try { setupCallKit(); } catch {}

  // Token registration — Apple gives us a token shortly after we
  // call .registerVoipToken(). If we already have a cached token for
  // this same user, we still re-POST so the server's updated_at gets
  // bumped (cleanup queries use that to drop stale tokens).
  VoipPushNotification.addEventListener('register', async (token) => {
    try {
      await AsyncStorage.setItem(TOKEN_KEY, token);
      await AsyncStorage.setItem(TOKEN_USER_KEY, myUserId);
      await _postTokenToServer({ userId: myUserId, token });
    } catch (e) {
      if (__DEV__) console.warn('[voip] register handler error:', e?.message || e);
    }
  });

  // Incoming VoIP push — MUST trigger CallKit display within ~5s.
  VoipPushNotification.addEventListener('notification', (payload) => {
    _onIncomingPush(payload);
  });

  // Some iOS versions require an explicit register call to bootstrap
  // the registry. Safe to call always — no-ops if already registered.
  VoipPushNotification.registerVoipToken();

  _started = true;
}

/**
 * Stop listening (sign-out path). Also tells the server to drop the
 * cached token so a future user on the same device gets their own
 * fresh registration.
 */
export async function stopVoipPush() {
  if (!_started) return;
  _started = false;
  if (!VoipPushNotification) return;
  try {
    VoipPushNotification.removeEventListener('register');
    VoipPushNotification.removeEventListener('notification');
  } catch {}
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) {
      fetch(`${BACKEND}/pushkit/unregister`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => {});
    }
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(TOKEN_USER_KEY);
  } catch {}
  _myUserId = null;
}

// ── Internal ────────────────────────────────────────────────

// Pull the current Supabase access token. The server (security audit
// fix #123) now requires this on /pushkit/register so it can verify
// the user identity instead of trusting a userId in the request body.
async function _getSupabaseAccessToken() {
  try {
    const { supabase } = require('./supabase');
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

async function _postTokenToServer({ userId, token, platform = 'ios' }) {
  try {
    const accessToken = await _getSupabaseAccessToken();
    if (!accessToken) {
      if (__DEV__) console.warn('[voip] no Supabase access token — skipping registration');
      return;
    }
    await fetch(`${BACKEND}/pushkit/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${accessToken}`,
      },
      // userId is now derived server-side from the JWT, but we still
      // include it in the body for forward compat / debugging — the
      // server ignores it and uses the verified token instead.
      body: JSON.stringify({
        token,
        platform,
        bundleId: 'com.chatvault.vaultchat',
      }),
    });
  } catch (e) {
    if (__DEV__) console.warn('[voip] token POST failed:', e?.message || e);
  }
}

// PushKit payloads from server.js — see voipPush.js for the exact shape.
//
// Path:
//   - 1:1 call    → callPeer.handleIncomingInvite + CallKit display
//   - conference  → roomCall.handleIncomingInvite + CallKit display
//
// We always display CallKit synchronously — that's what satisfies
// iOS's "must show UI within 5 seconds" requirement. The user
// answering CallKit fires onAnswer in callListener.js, which navigates
// to ActiveCall — same code path as a foreground answer.
function _onIncomingPush(payload) {
  if (!payload) return;
  const {
    callId, roomId, callerId, callerName, type, isConference,
  } = payload;
  if (!callId || !callerId) return;

  try {
    if (isConference) {
      roomCall.handleIncomingInvite({
        callId, roomId,
        inviterId:    callerId,
        inviterName:  callerName,
        type:         type || 'voice',
        existingParticipants: [],
      });
    } else {
      callPeer.handleIncomingInvite({
        callId, roomId, callerId, type: type || 'voice',
      });
    }
  } catch (e) {
    if (__DEV__) console.warn('[voip] stage invite failed:', e?.message || e);
  }

  try {
    displayIncomingCall(callId, callerId, callerName || 'VaultChat');
  } catch (e) {
    if (__DEV__) console.warn('[voip] CallKit display failed:', e?.message || e);
  }
}

export function isVoipReady() {
  return _started && !!VoipPushNotification;
}

// ── Android (Phase AAA / task #60) ─────────────────────────────
// Firebase Cloud Messaging + react-native-callkeep.
//
// Lifecycle:
//   1. Set up callkeep with PhoneAccount config — registers the
//      VoiceConnectionService declared in AndroidManifest.xml.
//   2. Request POST_NOTIFICATIONS perm (Android 13+) so heads-up
//      incoming-call notifications can render.
//   3. Get the FCM token + register it with the server under
//      platform='android'. Listen for token rotations.
//   4. Wire foreground messaging — when an FCM data message arrives
//      while the app is foregrounded, route through the SAME
//      _onIncomingPush so the call pipeline stays unified.
//   5. Wire callkeep answer/end events so user actions propagate
//      back to callPeer / roomCall.
//
// The BACKGROUND message handler — the one that wakes a killed
// app — is registered separately in index.js (the Expo entry).
// Firebase's headless JS runtime requires that handler be set
// BEFORE App mounts.

let _RNCallKeep = null;
let _firebaseMessaging = null;
try {
  const ck = require('react-native-callkeep');
  _RNCallKeep = ck.default || ck.RNCallKeep || ck;
  if (__DEV__) {
    console.log('[voip] callkeep module keys:', ck && Object.keys(ck));
    console.log('[voip] callkeep default keys:', ck?.default && Object.keys(ck.default));
    console.log('[voip] callkeep resolved type:', typeof _RNCallKeep,
      'has setup:', typeof _RNCallKeep?.setup === 'function');
  }
} catch (e) {
  if (__DEV__) console.warn('[voip] callkeep require threw:', e?.message);
}
try {
  const fm = require('@react-native-firebase/messaging');
  _firebaseMessaging = fm.default || fm;
  if (__DEV__ && typeof _firebaseMessaging !== 'function') {
    console.warn('[voip] firebase messaging not a function. typeof:', typeof _firebaseMessaging, 'keys:', Object.keys(fm));
  }
} catch (e) {
  if (__DEV__) console.warn('[voip] firebase messaging require threw:', e?.message);
}

// Notifee for the high-importance "incoming_calls" channel (task #4).
// Channel creation is duplicated in index.js so it exists in headless
// FCM contexts; here we re-create on normal app launch as a safety net
// for cases where index.js didn't run (hot reload, expo dev client).
let _notifee = null;
let _AndroidImportance = null;
try {
  const n = require('@notifee/react-native');
  _notifee = n.default || n;
  _AndroidImportance = n.AndroidImportance;
} catch (e) {
  if (__DEV__) console.warn('[voip] notifee require threw:', e?.message);
}

async function _ensureIncomingCallsChannel() {
  if (!_notifee || !_AndroidImportance) return;
  try {
    await _notifee.createChannel({
      id:          'incoming_calls',
      name:        'Incoming Calls',
      description: 'Ring tone for incoming VaultChat calls.',
      importance:  _AndroidImportance.HIGH,
      sound:       'default',
      vibration:   true,
      vibrationPattern: [300, 500, 300, 500],
      bypassDnd:   true,
    });
  } catch (e) {
    if (__DEV__) console.warn('[voip] createChannel failed:', e?.message);
  }
}

let _androidStarted = false;

async function _startAndroidPush({ myUserId }) {
  if (_androidStarted) return;
  const hasCk = !!(_RNCallKeep && (typeof _RNCallKeep.setup === 'function'));
  const hasFm = typeof _firebaseMessaging === 'function';
  if (!hasCk || !hasFm) {
    if (__DEV__) console.log('[voip] android: native modules missing — callkeep:', hasCk, 'firebase:', hasFm);
    return;
  }
  _myUserId = myUserId;
  _androidStarted = true;

  // Make sure the high-priority "incoming_calls" channel exists
  // BEFORE any FCM message can arrive. Idempotent — a no-op if
  // index.js already created it at module-eval time.
  await _ensureIncomingCallsChannel();

  // Set up callkeep. The PhoneAccount config below MUST be filled
  // out — empty values cause the OS to silently reject the
  // registration and incoming calls land in the void.
  try {
    await _RNCallKeep.setup({
      ios: { appName: 'VaultChat' }, // ignored on Android but the API requires it
      android: {
        alertTitle:                   'Permissions required',
        alertDescription:             'VaultChat needs Phone Account permission to ring incoming calls.',
        cancelButton:                 'Cancel',
        okButton:                     'OK',
        imageName:                    'phone_account_icon',
        additionalPermissions:        [],
        // foregroundService keeps WebRTC alive once a call is connected.
        foregroundService: {
          channelId:        'com.chatvault.vaultchat.calls',
          channelName:      'Active calls',
          notificationTitle: 'VaultChat is on a call',
          notificationIcon: 'ic_launcher',
        },
      },
    });
    _RNCallKeep.setAvailable(true);
  } catch (e) {
    if (__DEV__) console.warn('[voip] callkeep setup failed:', e?.message || e);
  }

  // Wire callkeep events — answer routes to the existing call
  // pipeline; end-call cleans up.
  try {
    _RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
      // The actual WebRTC connect happens when callPeer/roomCall
      // receives the matching socket event. callkeep's role is
      // purely UI: it surfaces the user's accept intent.
      try { _RNCallKeep.setCurrentCallActive(callUUID); } catch {}
    });
    _RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
      try { callPeer.endActiveCall?.(callUUID); } catch {}
      try { roomCall.endActiveCall?.(callUUID);  } catch {}
    });
  } catch {}

  // Permission for heads-up notifications (task #5).
  //
  // Two layers, both required:
  //   1. POST_NOTIFICATIONS — runtime permission introduced in
  //      Android 13 (API 33). Without it, the OS silently drops
  //      every notification we post including the high-priority
  //      "incoming_calls" channel — meaning a backgrounded user
  //      gets no ring at all. The manifest declares the permission;
  //      this is the user-facing prompt that actually grants it.
  //   2. messaging().requestPermission() — Firebase's own
  //      cross-platform shim. On Android 13+ it largely overlaps
  //      with #1 but it ALSO sets the in-app notifications-enabled
  //      flag that some Firebase code paths key off of. Cheap to
  //      call — keep both.
  if (Platform.Version >= 33) {
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        {
          title:           'Allow incoming-call alerts',
          message:         'VaultChat needs notification permission to ring you when someone calls.',
          buttonPositive:  'Allow',
          buttonNegative:  'Not now',
        },
      );
      if (__DEV__) console.log('[voip] POST_NOTIFICATIONS:', result);
    } catch (e) {
      if (__DEV__) console.warn('[voip] POST_NOTIFICATIONS request failed:', e?.message);
    }
  }
  try { await _firebaseMessaging().requestPermission(); } catch {}

  // Token registration + rotation.
  try {
    const token = await _firebaseMessaging().getToken();
    if (token) await _postTokenToServer({ userId: myUserId, token, platform: 'android' });
  } catch (e) {
    if (__DEV__) console.warn('[voip] android: getToken failed:', e?.message || e);
  }
  try {
    _firebaseMessaging().onTokenRefresh(async (token) => {
      try { await _postTokenToServer({ userId: myUserId, token, platform: 'android' }); }
      catch {}
    });
  } catch {}

  // Foreground FCM handler — when an FCM message arrives while the
  // app is open, route it through the same path as the background
  // handler in index.js so the call UI is consistent.
  try {
    _firebaseMessaging().onMessage(async (remoteMessage) => {
      _onIncomingPush(remoteMessage?.data || {});
    });
  } catch {}
}

// (token POST helper now accepts `platform` directly — see
// _postTokenToServer above.)
