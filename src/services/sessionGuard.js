// ============================================================
//  sessionGuard.js — task #127, security audit fix
//
//  Two related responsibilities:
//
//  1) IDLE TIMEOUT — if the user hasn't actively used VaultChat
//     in N hours, force them to re-authenticate. Defends against
//     "device left unlocked at a desk for 8 hours, attacker walks
//     up and reads chats" — which the biometric lock screen alone
//     doesn't catch if the user disabled it. Time-based revocation
//     is the standard backstop.
//
//  2) REMOTE SIGN-OUT — Settings → "Sign out all devices" calls
//     supabase.auth.signOut({ scope: 'global' }), which revokes
//     EVERY active session for the user across every device.
//     Combined with our session timeout, this gives users a
//     reliable way to recover from a stolen/lost phone.
//
//  Activity tracking:
//    - We persist a single timestamp `vaultchat_last_active_at`
//      in AsyncStorage, updated whenever the app comes to the
//      foreground via AppState 'active'.
//    - On the NEXT cold start or foreground transition, we compare
//      now() - last_active. If it exceeds IDLE_TIMEOUT_MS, we sign
//      the user out (Supabase scope: 'local' — clears just this
//      device's session, doesn't touch other devices).
//
//  Default timeout: 7 days. Long enough that legitimate users with
//  occasional usage aren't constantly re-signing-in; short enough
//  that a stolen device with VaultChat still installed becomes
//  useless within a week even if the thief never opens it.
// ============================================================

import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_ACTIVE_KEY = 'vaultchat_last_active_at';
const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let _appStateSub  = null;
let _onSignedOut  = null;

/**
 * Mount once at app start, after auth has been initialized. Wires
 * an AppState listener that touches the activity timestamp on each
 * foreground transition AND checks for idle-timeout violations.
 *
 * @param {object} opts
 * @param {Function} opts.onSignedOut — called when we force-sign-out
 *                                       due to idle timeout. The host
 *                                       App.js should flip isLoggedIn
 *                                       to false in response.
 */
export function startSessionGuard({ onSignedOut } = {}) {
  if (_appStateSub) return;
  _onSignedOut = onSignedOut || null;

  // Initial check on mount — if the app was killed and reopened
  // after an idle period, we want to enforce the timeout immediately
  // before showing any chats.
  _checkIdle();

  _appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      _checkIdle();
      _touch();
    } else if (state === 'background' || state === 'inactive') {
      _touch();
    }
  });
}

export function stopSessionGuard() {
  if (_appStateSub) { try { _appStateSub.remove(); } catch {} _appStateSub = null; }
  _onSignedOut = null;
}

/** Update the last-active timestamp to now(). */
async function _touch() {
  try {
    await AsyncStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  } catch {}
}

/**
 * Compare last-active to now and force a local sign-out if the gap
 * exceeds IDLE_TIMEOUT_MS. Local-only sign-out (scope: 'local') —
 * does NOT revoke other devices. The user's other phones / tablets
 * stay signed in; only THIS device is logged out due to inactivity.
 */
async function _checkIdle() {
  try {
    const v = await AsyncStorage.getItem(LAST_ACTIVE_KEY);
    if (!v) {
      // First-ever launch or post-install. Just touch now and exit.
      await _touch();
      return;
    }
    const last = Number(v) || 0;
    const elapsed = Date.now() - last;
    if (elapsed > IDLE_TIMEOUT_MS) {
      if (__DEV__) console.log(`[sessionGuard] idle ${Math.round(elapsed / 3600000)}h > ${IDLE_TIMEOUT_MS / 3600000}h — forcing sign-out`);
      await _forceLocalSignOut('idle-timeout');
    }
  } catch {}
}

async function _forceLocalSignOut(reason) {
  try {
    const { supabase } = require('./supabase');
    // scope: 'local' clears just this device. The user can sign
    // back in immediately if they have credentials; we just want to
    // require re-auth, not break their account.
    await supabase.auth.signOut({ scope: 'local' });
  } catch {}
  try { await AsyncStorage.removeItem(LAST_ACTIVE_KEY); } catch {}
  if (_onSignedOut) {
    try { _onSignedOut(reason); } catch {}
  }
}

/**
 * Public API: revoke ALL sessions across ALL devices for the
 * authenticated user. Wired to a "Sign out all devices" button
 * in Settings. After this, every other device the user is signed
 * in to will be logged out on its next API call (Supabase invalidates
 * the JWT immediately).
 */
export async function signOutAllDevices() {
  try {
    const { supabase } = require('./supabase');
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) return { ok: false, error: error.message };
    try { await AsyncStorage.removeItem(LAST_ACTIVE_KEY); } catch {}
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'sign-out failed' };
  }
}
