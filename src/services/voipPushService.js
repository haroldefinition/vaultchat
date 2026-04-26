// ============================================================
//  voipPushService.js — task #103
//  PushKit (VoIP) integration for cold-state incoming calls.
//
//  Lifecycle:
//    1. App boot → register VoIP push handler with iOS via
//       react-native-voip-push-notification.
//    2. iOS hands us a PushKit token (hex string) on first launch
//       AND any time it rotates the token.
//    3. We POST the token to the Railway server's
//       /pushkit/register endpoint, keyed by the current user id.
//    4. When someone calls us, the server fans out a VoIP push to
//       every registered token. iOS wakes our app from a fully-
//       killed state and delivers the push to didReceiveIncomingPush.
//    5. We MUST display CallKit within ~5 seconds or iOS penalises
//       the app (eventually revoking VoIP entitlement).
//       displayIncomingCall() is wired through callkit.js — same
//       path the foreground socket flow uses, so the UI is identical.
//
//  Android:
//    iOS-only. Android background calling is task #60 (FCM
//    high-priority data messages → ConnectionService). This module
//    is a no-op on Android.
//
//  Dev note:
//    react-native-voip-push-notification is a NATIVE module — it
//    requires a development build (expo prebuild + native compile).
//    Expo Go users will get an undefined module on import, which is
//    why we wrap the require in try/catch and silently no-op when
//    missing. This matches Harold's policy: expo-dev-client only.
// ============================================================

import { Platform } from 'react-native';
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
  if (Platform.OS !== 'ios') return;          // iOS-only for now (#60 covers Android)
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

async function _postTokenToServer({ userId, token }) {
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
        platform: 'ios',
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
