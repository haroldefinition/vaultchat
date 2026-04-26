// ============================================================
//  iapService.js — task #92
//  In-App Purchase wrapper for VaultChat Premium.
//
//  Pricing (decided 2026-04-25):
//    Monthly  → $4.99/mo  — productId: vaultchat_premium_monthly
//    Annual   → $39.99/yr — productId: vaultchat_premium_annual
//                          (~33% discount; annual is the moneymaker)
//    Free trial: 7 days, applied via App Store Connect "Introductory
//                Offer" — configured per-product. Apple handles trial
//                eligibility / abuse prevention; we just expose the
//                product and let StoreKit sort it out.
//
//  Architecture:
//    1. App start → initIAP() opens the StoreKit connection and
//       fetches both subscription products.
//    2. PremiumModal calls listPremiumProducts() to render choices
//       and purchase(productId) to start the buy flow.
//    3. purchaseUpdatedListener fires when StoreKit hands back a
//       transaction — we ship the receipt to /iap/verify on Railway,
//       which validates against Apple and persists the active
//       subscription. On success we flip the local premium flag.
//    4. restorePurchases() is wired to a button in PremiumModal
//       — Apple REQUIRES a Restore button on every paywall.
//
//  Locally we keep `vaultchat_premium = "true"` in AsyncStorage so
//  paywall checks (isPremiumUser() in adsService.js) can be sync.
//  The server is the source of truth — local flag gets refreshed
//  from the server on app boot via syncPremiumFromServer().
// ============================================================

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Lazy native-module require — Expo Go and tests don't have it.
let RNIap = null;
try { RNIap = require('react-native-iap'); }
catch (e) { /* no-op shim */ }

const BACKEND = 'https://vaultchat-production-3a96.up.railway.app';

export const PRODUCT_IDS = Platform.select({
  ios: [
    'vaultchat_premium_monthly',
    'vaultchat_premium_annual',
  ],
  android: [
    'vaultchat_premium_monthly',
    'vaultchat_premium_annual',
  ],
  default: [],
});

const PREMIUM_KEY = 'vaultchat_premium';

let _initialized = false;
let _purchaseSub = null;
let _errorSub    = null;
let _onPremiumChange = null;
let _userId = null;

export function setUserId(id) { _userId = id || null; }

export function onPremiumChange(cb) {
  _onPremiumChange = cb;
  return () => { if (_onPremiumChange === cb) _onPremiumChange = null; };
}

async function _setPremiumLocally(value) {
  // Route through adsService.setPremiumUser so every subscribed
  // surface (theme.js, header crowns, gold-tinted hero cards) gets
  // notified the moment the flag flips. The legacy single-listener
  // _onPremiumChange callback is preserved for any caller that hasn't
  // migrated to the pub/sub yet.
  try {
    const { setPremiumUser } = require('./adsService');
    await setPremiumUser(!!value);
  } catch {
    try { await AsyncStorage.setItem(PREMIUM_KEY, value ? 'true' : 'false'); } catch {}
  }
  if (_onPremiumChange) { try { _onPremiumChange(!!value); } catch {} }
}

/** Check the current cached premium flag synchronously. */
export async function isPremium() {
  try {
    const v = await AsyncStorage.getItem(PREMIUM_KEY);
    return v === 'true';
  } catch {
    return false;
  }
}

/**
 * Initialize StoreKit connection and start listening for purchase
 * events. Safe to call multiple times — no-ops after the first
 * successful init.
 */
export async function initIAP() {
  if (_initialized || !RNIap) return false;
  try {
    await RNIap.initConnection();
  } catch (e) {
    if (__DEV__) console.warn('[iap] initConnection failed:', e?.message || e);
    return false;
  }

  // iOS: clean up any pending unfinished transactions left over from a
  // prior crash — StoreKit re-delivers them at every initConnection
  // until they're explicitly finished, which would cause the user to
  // see a "purchase complete" prompt every launch.
  if (Platform.OS === 'ios') {
    // v15 renamed clearTransactionIOS → clearTransactionsIOS (plural).
    // Try both so this keeps working on either version.
    try {
      if (typeof RNIap.clearTransactionsIOS === 'function') await RNIap.clearTransactionsIOS();
      else if (typeof RNIap.clearTransactionIOS === 'function') await RNIap.clearTransactionIOS();
    } catch {}
  }

  _purchaseSub = RNIap.purchaseUpdatedListener(_onPurchaseUpdated);
  _errorSub    = RNIap.purchaseErrorListener(_onPurchaseError);
  _initialized = true;
  return true;
}

export function tearDownIAP() {
  if (_purchaseSub) { try { _purchaseSub.remove(); } catch {} _purchaseSub = null; }
  if (_errorSub)    { try { _errorSub.remove();    } catch {} _errorSub    = null; }
  if (RNIap) { try { RNIap.endConnection(); } catch {} }
  _initialized = false;
}

/**
 * Fetch product details (localized title, description, price string)
 * for both the monthly and annual subscriptions. Returns [] when
 * IAP isn't available (Expo Go, dev simulator without a sandbox
 * tester, etc.) — callers should render placeholder pricing in that
 * case rather than crashing.
 */
export async function listPremiumProducts() {
  if (!RNIap) return [];
  if (!_initialized) await initIAP();
  try {
    // Subscriptions API (vs. one-time products) — recurring auto-renew.
    const subs = await RNIap.getSubscriptions({ skus: PRODUCT_IDS });
    return subs || [];
  } catch (e) {
    if (__DEV__) console.warn('[iap] getSubscriptions failed:', e?.message || e);
    return [];
  }
}

/**
 * Start a purchase. StoreKit takes over — the App Store sheet
 * appears, the user authenticates with Face ID, and the result
 * arrives later via _onPurchaseUpdated.
 */
export async function purchase(productId) {
  if (!RNIap) throw new Error('In-app purchases are not available on this build.');
  if (!_initialized) await initIAP();
  if (!productId) throw new Error('productId required');

  // ── Version-tolerant API call ─────────────────────────────
  // react-native-iap v15 renamed `requestSubscription` to
  // `requestPurchase` and changed the parameter shape from
  // { sku: 'x' } to { skus: ['x'] } (with a `type: 'subs'` hint
  // on Android and a nested `request: { ios, android }` object on
  // newer minors). v12 still uses `requestSubscription({ sku })`.
  //
  // We detect what the installed version exports and call the
  // right shape, so the same client code works on v12, v13, v14,
  // and v15 without further changes. This fixes the
  // "RNIap.requestSubscription is not a function" crash on v15.
  try {
    if (typeof RNIap.requestSubscription === 'function') {
      // v12-v14 path — single sku.
      await RNIap.requestSubscription({ sku: productId });
    } else if (typeof RNIap.requestPurchase === 'function') {
      // v15+ path — unified call, subscriptions take a `subs` type.
      // We try the most permissive shape first and fall back if the
      // installed minor needs the nested `request` envelope.
      try {
        await RNIap.requestPurchase({
          sku: productId,
          skus: [productId],
          type: 'subs',
          subscriptionOffers: [],
        });
      } catch (innerErr) {
        // Newer v15 minors expect the platform-split envelope.
        await RNIap.requestPurchase({
          request: Platform.OS === 'ios'
            ? { sku: productId }
            : { skus: [productId], subscriptionOffers: [] },
          type: 'subs',
        });
      }
    } else {
      throw new Error('react-native-iap is missing requestPurchase / requestSubscription. Update the native module and rebuild.');
    }
    return true;
  } catch (e) {
    // User-cancel returns a specific code we don't want to surface as
    // an error — just swallow it.
    if (e?.code === 'E_USER_CANCELLED') return false;
    throw e;
  }
}

/**
 * Restore prior purchases — required on every paywall by App Store
 * guideline 3.1.1. iOS pops the App Store sign-in if needed and
 * replays any active transactions through purchaseUpdatedListener,
 * which flips the local premium flag.
 */
export async function restorePurchases() {
  if (!RNIap) return { restored: 0 };
  if (!_initialized) await initIAP();
  try {
    const purchases = await RNIap.getAvailablePurchases();
    const active = (purchases || []).filter(p =>
      PRODUCT_IDS.includes(p.productId) || PRODUCT_IDS.includes(p.productId?.toLowerCase()),
    );
    if (active.length === 0) {
      await _setPremiumLocally(false);
      return { restored: 0 };
    }
    // Verify the most recent receipt with the server — if it passes,
    // the server flips the user's premium flag and we mirror it
    // locally. We pick the latest by transaction date.
    active.sort((a, b) => (b.transactionDate || 0) - (a.transactionDate || 0));
    const latest = active[0];
    const ok = await _verifyWithServer(latest);
    if (ok) await _setPremiumLocally(true);
    return { restored: active.length, premium: ok };
  } catch (e) {
    if (__DEV__) console.warn('[iap] restore failed:', e?.message || e);
    return { restored: 0, error: e?.message };
  }
}

/**
 * Refresh the local premium flag from the server. Call on app boot
 * so a user who upgraded on another device sees premium status
 * here without having to tap Restore.
 */
export async function syncPremiumFromServer() {
  if (!_userId) return;
  try {
    const accessToken = await _getSupabaseAccessToken();
    if (!accessToken) return;
    const r = await fetch(`${BACKEND}/iap/status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return;
    const { premium } = await r.json();
    await _setPremiumLocally(!!premium);
  } catch {}
}

// Pull the current Supabase session token. /iap/verify and /iap/status
// (security audit fix #123) require this so the server derives userId
// from the verified JWT instead of trusting whatever userId we send.
async function _getSupabaseAccessToken() {
  try {
    const { supabase } = require('./supabase');
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

// ── Internal handlers ───────────────────────────────────────

async function _onPurchaseUpdated(purchase) {
  if (!purchase) return;
  // Server-side verify, then finish the transaction. Skipping the
  // finishTransaction call would cause StoreKit to re-deliver this
  // purchase on every app launch.
  try {
    const verified = await _verifyWithServer(purchase);
    if (verified) await _setPremiumLocally(true);
  } finally {
    try {
      await RNIap.finishTransaction({ purchase, isConsumable: false });
    } catch (e) {
      if (__DEV__) console.warn('[iap] finishTransaction failed:', e?.message || e);
    }
  }
}

function _onPurchaseError(err) {
  if (!err) return;
  if (err.code === 'E_USER_CANCELLED') return;
  if (__DEV__) console.warn('[iap] purchase error:', err.code, err.message);
}

async function _verifyWithServer(purchase) {
  if (!_userId) return false;
  try {
    const accessToken = await _getSupabaseAccessToken();
    if (!accessToken) {
      if (__DEV__) console.warn('[iap] no Supabase session — cannot verify');
      return false;
    }
    const r = await fetch(`${BACKEND}/iap/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        platform:      Platform.OS,
        productId:     purchase.productId,
        transactionId: purchase.transactionId,
        receipt:       purchase.transactionReceipt, // iOS base64 receipt
        purchaseToken: purchase.purchaseToken,      // Android only
      }),
    });
    if (!r.ok) return false;
    const j = await r.json();
    return !!j.premium;
  } catch (e) {
    if (__DEV__) console.warn('[iap] verify failed:', e?.message || e);
    return false;
  }
}
