// ============================================================
//  VaultChat — iOS Share Extension handler (task #83)
//  src/services/shareIntent.js
//
//  When a user picks VaultChat from another app's iOS share
//  sheet (Photos, Safari, Mail, etc.), the system hands the
//  shared content (URL / text / image / video / file) to our
//  Share Extension target. The extension immediately re-opens
//  the main app with the payload, which expo-share-intent
//  delivers to JS via the useShareIntent hook below.
//
//  Flow:
//    1. App boot subscribes via initShareIntent(navigationRef)
//    2. Incoming share → we navigate to a contact picker so the
//       user chooses who to send it to
//    3. After they pick, NewMessage opens with the shared
//       content staged as a pending message / file / image
//
//  Native side (configured in app.json + a dev-client rebuild):
//    - expo-share-intent's config plugin adds the Share Extension
//      target to the iOS project, declares supported UTIs
//      (images, videos, URLs, plain text), and wires the App
//      Group entitlement so the extension can hand data back
//      to the main app.
//
//  This service is JS-only and safe to import without the native
//  module being present — if expo-share-intent isn't installed
//  yet, initShareIntent is a no-op (logs once in dev) so the app
//  still boots.
// ============================================================

let _shareIntentImpl = null;
try {
  // Defensive require — if the package isn't installed, we don't
  // crash the whole app. The init function below becomes a no-op.
  // eslint-disable-next-line global-require
  _shareIntentImpl = require('expo-share-intent');
} catch {
  _shareIntentImpl = null;
}

let _bound = false;

/**
 * Subscribe to incoming share-extension events. Pass a navigation
 * ref so we can route from outside the React tree. Safe to call
 * multiple times — second call is a no-op.
 */
export function initShareIntent(navigationRef) {
  if (_bound) return;
  if (!_shareIntentImpl) {
    if (__DEV__) console.log('[shareIntent] expo-share-intent not installed — share extension disabled');
    return;
  }
  if (!navigationRef) return;
  _bound = true;

  // Two events: cold-launch (app opened from share sheet while
  // not running) and live-runtime (app already foregrounded).
  // The package exposes them via getShareIntent() + an event
  // emitter; both flow through the same handler.
  try {
    const { getShareIntent, addShareIntentListener } = _shareIntentImpl;
    if (typeof getShareIntent === 'function') {
      getShareIntent().then(payload => {
        if (payload) handlePayload(navigationRef, payload);
      }).catch(() => {});
    }
    if (typeof addShareIntentListener === 'function') {
      addShareIntentListener(payload => {
        if (payload) handlePayload(navigationRef, payload);
      });
    }
  } catch (e) {
    if (__DEV__) console.warn('[shareIntent] init error:', e?.message || e);
  }
}

/**
 * Route a normalized share payload into the New Message flow.
 * The contact-picker step is delegated to NewMessage which
 * already supports a `shared` route param for staging incoming
 * content; the user picks a recipient and the content is sent
 * as a normal message via that screen's existing send paths.
 *
 * Payload shape (normalized across share types):
 *   { type: 'text' | 'url' | 'image' | 'video' | 'file',
 *     text?: string,           // for text and url
 *     uri?:  string,           // for image/video/file (file:// or content://)
 *     mimeType?: string }
 */
function handlePayload(navigationRef, raw) {
  const shared = normalize(raw);
  if (!shared) return;

  const tryNav = (attempt = 0) => {
    if (!navigationRef?.isReady?.()) {
      if (attempt < 12) setTimeout(() => tryNav(attempt + 1), 150);
      return;
    }
    try {
      navigationRef.navigate('NewMessage', { shared });
    } catch (e) {
      if (__DEV__) console.warn('[shareIntent] navigate error:', e?.message || e);
    }
  };
  tryNav();
}

// expo-share-intent's payload shape varies across versions; this
// shim flattens the common variants into the schema described
// above. Returns null if the payload doesn't carry anything we
// can act on.
function normalize(raw) {
  if (!raw) return null;
  // Some versions: { text, weburl, files: [{path, mimeType}], ... }
  if (typeof raw.text === 'string' && raw.text.trim()) {
    return { type: 'text', text: raw.text };
  }
  if (typeof raw.weburl === 'string' && raw.weburl.trim()) {
    return { type: 'url', text: raw.weburl };
  }
  if (Array.isArray(raw.files) && raw.files.length > 0) {
    const f = raw.files[0];
    const mime = f.mimeType || f.type || '';
    let type = 'file';
    if (mime.startsWith('image/')) type = 'image';
    else if (mime.startsWith('video/')) type = 'video';
    return { type, uri: f.path || f.uri, mimeType: mime };
  }
  // Newer payload shape may use { type, value }
  if (raw.type && raw.value) {
    return { type: raw.type, ...(raw.type === 'text' || raw.type === 'url'
      ? { text: raw.value }
      : { uri: raw.value }) };
  }
  return null;
}
