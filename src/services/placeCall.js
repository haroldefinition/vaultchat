// ============================================================
//  VaultChat — Outgoing Call Placement Helper
//  src/services/placeCall.js
//
//  Single entry point for every "tap to call" surface in the app.
//  Converts the legacy navigation pattern:
//     navigation.navigate('ActiveCall', { recipientName, recipientPhone, callType })
//  into the real-call pattern:
//     navigation.navigate('ActiveCall', { mode: 'outgoing', callId, roomId,
//                                          myUserId, peerUserId, ... })
//
//  Responsibilities:
//    1. Resolve the peer's userId from their phone (via supabase.profiles).
//       If unresolved, falls back to the mock-call UX so the user still
//       sees *something* rather than a dead button.
//    2. Derive the deterministic 1:1 roomId (same hash as NewMessageScreen).
//    3. Generate a callId (uuid v4-ish — good enough for a correlation id).
//    4. Navigate to ActiveCall with mode='outgoing'.
//
//  Note: we do NOT call callPeer.startOutgoing here — ActiveCallScreen does
//  that on mount. This keeps the network/media side effects confined to the
//  screen that actually shows them.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// Matches NewMessageScreen.generateRoomId() so we hit the same room the
// chat UI would create. Don't diverge these — a call and a chat for the
// same 1:1 pair must share a roomId.
function generateRoomId(phone1, phone2) {
  const sorted = [String(phone1 || '').replace(/\D/g, ''), String(phone2 || '').replace(/\D/g, '')].sort();
  const combined = sorted[0] + sorted[1];
  let h1 = 0, h2 = 0;
  for (let i = 0; i < combined.length; i++) {
    h1 = Math.imul(31, h1) + combined.charCodeAt(i) | 0;
    h2 = Math.imul(37, h2) + combined.charCodeAt(i) | 0;
  }
  const a = Math.abs(h1).toString(16).padStart(8, '0');
  const b = Math.abs(h2).toString(16).padStart(8, '0');
  const c = Math.abs(h1 ^ h2).toString(16).padStart(8, '0');
  return `${a.slice(0,8)}-${b.slice(0,4)}-4${b.slice(1,4)}-a${c.slice(0,3)}-${a}${b.slice(0,4)}`;
}

function makeCallId() {
  // Good-enough uuid-ish — 128 random bits, collision probability negligible
  // for the in-flight window of a single call.
  const rnd = Math.random().toString(16).slice(2, 10)
            + Math.random().toString(16).slice(2, 10);
  const t   = Date.now().toString(16);
  return `${rnd.slice(0,8)}-${rnd.slice(8,12)}-4${t.slice(-3)}-a${rnd.slice(12,15)}-${rnd.slice(0,12)}`;
}

function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith('+')) return t;
  const digits = t.replace(/\D/g, '');
  if (!digits) return null;
  return `+1${digits}`;
}

async function getMyIdentity() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      // Prefer the stored phone from AsyncStorage (set at register time);
      // fall back to profiles lookup if missing.
      const raw = await AsyncStorage.getItem('vaultchat_user');
      let phone = null;
      if (raw) { try { phone = JSON.parse(raw)?.phone || null; } catch {} }
      if (!phone) {
        const { data } = await supabase.from('profiles').select('phone').eq('id', session.user.id).maybeSingle();
        phone = data?.phone || null;
      }
      return { myUserId: session.user.id, myPhone: phone };
    }
  } catch {}
  try {
    const raw = await AsyncStorage.getItem('vaultchat_user');
    if (raw) {
      const u = JSON.parse(raw);
      if (u?.id) return { myUserId: u.id, myPhone: u.phone || null };
    }
  } catch {}
  return { myUserId: null, myPhone: null };
}

async function resolvePeerUserId(peerPhoneNormalized) {
  if (!peerPhoneNormalized) return null;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', peerPhoneNormalized)
      .maybeSingle();
    return data?.id || null;
  } catch {
    return null;
  }
}

/**
 * Place a 1:1 call. Resolves identities, navigates to ActiveCall.
 * If the peer can't be resolved (not a VaultChat user), falls back to the
 * mock-call UX so the button isn't silently broken.
 *
 * @param {object} opts
 * @param {object} opts.navigation                  — react-navigation nav prop
 * @param {string} opts.recipientName               — display name
 * @param {string} opts.recipientPhone              — peer's phone, any format
 * @param {'voice'|'video'} [opts.type='voice']
 */
export async function placeCall({ navigation, recipientName, recipientPhone, type = 'voice' }) {
  const phoneNorm = normalizePhone(recipientPhone);
  const { myUserId, myPhone } = await getMyIdentity();

  const peerUserId = phoneNorm ? await resolvePeerUserId(phoneNorm) : null;

  if (!myUserId || !peerUserId || !myPhone) {
    // Unresolved — keep the old mock-call behavior so the user still sees UI.
    // ActiveCallScreen's isRealCall branch is gated on real IDs being present.
    navigation.navigate('ActiveCall', {
      recipientName, recipientPhone: phoneNorm || recipientPhone, callType: type,
    });
    return;
  }

  const roomId = generateRoomId(myPhone, phoneNorm);
  const callId = makeCallId();

  navigation.navigate('ActiveCall', {
    mode: 'outgoing',
    callId, roomId,
    myUserId, peerUserId,
    recipientName, recipientPhone: phoneNorm,
    callType: type,
  });
}
