// ============================================================
//  VaultChat — Invite Link service (task #67)
//  src/services/inviteLink.js
//
//  Single source of truth for VaultChat's deep-link format.
//  Used by:
//    - QRContactScreen (encodes the URL into a QR code)
//    - SettingsScreen "Share My Invite Link" row (Share sheet)
//    - App.js Linking handler (parses incoming URLs and routes)
//
//  Canonical URL form:
//      vaultchat://user/<handle>?name=<display>
//
//  We use the custom-scheme form here. Once task #96 lands a real
//  domain, we'll add a https://vaultchat.app/u/<handle> mirror so
//  links survive being shared in plain-text contexts (Gmail, web,
//  etc.) where iOS only auto-links http(s)/.com URLs.
// ============================================================

import { Linking, Share } from 'react-native';
import { getMyHandle, getMyDisplayName } from './vaultHandle';

const SCHEME = 'vaultchat';
const PATH   = 'user';
const PREFIX = `${SCHEME}://${PATH}/`;

/**
 * Build a deep link for a given handle. Strips a leading '@' so
 * either '@harold' or 'harold' produces the same URL.
 */
export function buildInviteUrl({ handle, name }) {
  const h = String(handle || '').replace(/^@+/, '');
  if (!h) return null;
  const nameParam = name ? `?name=${encodeURIComponent(name)}` : '';
  return `${PREFIX}${h}${nameParam}`;
}

/**
 * Parse an incoming URL into { handle, name } or null if it's
 * not a recognizable VaultChat invite. Forgiving — accepts the
 * canonical scheme URL, a bare @handle, or a raw handle string,
 * so the same parser can be reused by QR scanner code paths.
 */
export function parseInviteUrl(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;

  // Canonical scheme URL: vaultchat://user/<handle>?name=...
  if (t.toLowerCase().startsWith(PREFIX)) {
    const rest = t.slice(PREFIX.length);
    const [handlePart, queryPart] = rest.split('?');
    const handle = (handlePart || '').replace(/^@+/, '').split('/')[0];
    let name = null;
    if (queryPart) {
      try {
        const p = new URLSearchParams(queryPart);
        name = p.get('name');
      } catch {}
    }
    return handle ? { handle, name } : null;
  }

  // Bare @handle
  if (t.startsWith('@')) {
    const handle = t.slice(1).replace(/\s/g, '');
    return handle ? { handle, name: null } : null;
  }

  // Raw alphanumeric handle (3-32 chars, lowercase letters/digits/underscore)
  if (/^[a-z0-9_]{3,32}$/i.test(t)) return { handle: t, name: null };

  return null;
}

/**
 * Build the URL for the current user and pop the iOS Share sheet.
 * Returns true if the share dialog opened, false on failure (no
 * handle set yet, share cancelled, etc).
 */
export async function shareMyInvite() {
  const handle = await getMyHandle();
  if (!handle) return false;
  const name   = await getMyDisplayName();
  const url    = buildInviteUrl({ handle, name });
  if (!url) return false;
  try {
    await Share.share({
      message: `Add me on VaultChat: ${handle}\n${url}`,
      url,
      title: 'My VaultChat Invite',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Subscribe to deep-link events. `cb({handle, name})` fires for
 * every recognizable VaultChat URL — both the cold-launch URL
 * (Linking.getInitialURL) and live-runtime ones (Linking 'url'
 * event). Returns an unsubscribe function.
 *
 * Usage in App.js:
 *   useEffect(() => {
 *     return subscribeToInviteUrls(({ handle, name }) => {
 *       navigationRef.navigate('NewMessage', { selectedContact: ... });
 *     });
 *   }, []);
 */
export function subscribeToInviteUrls(cb) {
  // Resolve a possible cold-launch URL.
  Linking.getInitialURL().then(url => {
    if (!url) return;
    const parsed = parseInviteUrl(url);
    if (parsed) try { cb(parsed); } catch {}
  }).catch(() => {});

  const sub = Linking.addEventListener('url', ({ url }) => {
    const parsed = parseInviteUrl(url);
    if (parsed) try { cb(parsed); } catch {}
  });

  return () => { try { sub?.remove?.(); } catch {} };
}
