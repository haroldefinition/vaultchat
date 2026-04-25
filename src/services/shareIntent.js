// ============================================================
//  VaultChat — iOS Share Extension bridge (task #83)
//  src/services/shareIntent.js
//
//  expo-share-intent v6 exposes its API via React hook only
//  (useShareIntent), so the integration has to be a component
//  mounted inside the NavigationContainer rather than an
//  imperative subscription. This file exports a single
//  <ShareIntentBridge /> component that App.js drops into the
//  tree once the navigation ref is ready.
//
//  Flow:
//    1. useShareIntent fires when the iOS Share Extension hands
//       us a payload (cold-launch OR live-runtime).
//    2. We normalize the payload (text / url / image / video /
//       file) and navigate to NewMessage with a `shared` route
//       param so the user can pick a recipient.
//    3. resetShareIntent clears the native pending payload so
//       the same share doesn't re-fire on re-focus.
//
//  Defensive: if expo-share-intent isn't installed the
//  component renders null and is a no-op. The whole share-
//  extension feature is best-effort — never breaks the app.
// ============================================================

import React, { useEffect, useRef } from 'react';

// Defensive import: if the package is missing the bridge stays a
// no-op. Without this guard, removing the package from package.json
// would crash the bundle at parse time.
let useShareIntent = null;
try {
  // eslint-disable-next-line global-require
  useShareIntent = require('expo-share-intent').useShareIntent;
} catch {
  useShareIntent = null;
}

// Normalize the package's ShareIntent shape into the same payload
// schema NewMessageScreen expects: { type, text?, uri?, mimeType? }
function normalize(intent) {
  if (!intent) return null;
  if (typeof intent.text === 'string' && intent.text.trim()) {
    return { type: 'text', text: intent.text };
  }
  if (typeof intent.webUrl === 'string' && intent.webUrl.trim()) {
    return { type: 'url', text: intent.webUrl };
  }
  if (Array.isArray(intent.files) && intent.files.length > 0) {
    const f = intent.files[0];
    const mime = f.mimeType || f.type || '';
    let type = 'file';
    if (mime.startsWith('image/')) type = 'image';
    else if (mime.startsWith('video/')) type = 'video';
    return { type, uri: f.path || f.uri, mimeType: mime };
  }
  return null;
}

export function ShareIntentBridge({ navigationRef }) {
  // Bail early when the native module isn't around — render null
  // and skip the hook so we don't crash on undefined.
  if (!useShareIntent) return null;

  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  const consumedRef = useRef(false); // dedupe — same payload won't fire twice

  useEffect(() => {
    if (!hasShareIntent || !shareIntent) return;
    if (consumedRef.current) return;

    const payload = normalize(shareIntent);
    if (!payload) {
      // Nothing actionable in this payload — clear it and bail
      try { resetShareIntent(true); } catch {}
      return;
    }
    consumedRef.current = true;

    // Wait for the navigation tree to be ready (cold launch races
    // — the hook can fire before NavigationContainer has mounted).
    const tryNav = (attempt = 0) => {
      if (!navigationRef?.isReady?.()) {
        if (attempt < 12) setTimeout(() => tryNav(attempt + 1), 150);
        return;
      }
      try {
        navigationRef.navigate('NewMessage', { shared: payload });
      } catch (e) {
        if (__DEV__) console.warn('[shareIntent] navigate failed:', e?.message || e);
      }
      // Clear the native-side pending payload so the next foreground
      // doesn't replay this same share.
      try { resetShareIntent(true); } catch {}
      // Reset our dedupe guard so a new share later in the session
      // can still flow through.
      setTimeout(() => { consumedRef.current = false; }, 1500);
    };
    tryNav();
  }, [hasShareIntent, shareIntent]);

  return null;
}

// Legacy export kept for back-compat with the previous imperative
// API — does nothing now that the bridge is a component, but
// callers that import it won't fail at parse time.
export function initShareIntent() {}
