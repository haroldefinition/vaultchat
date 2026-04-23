// ============================================================
//  VaultChat — Outgoing Call Placement Helper
//  src/services/placeCall.js
//
//  Single entry point for every "tap to call" surface in the app.
//
//  Resolution order (first match wins):
//    1. Caller passes peerUserId     → use it directly (preferred).
//    2. Caller passes only peerPhone → look up profiles.phone → id.
//    3. Neither resolvable           → fall back to mock UX so the
//                                       button isn't silently dead.
//
//  Why userId-first: the server's signaling rooms are keyed by
//  auth.users.id (see Railway server.js `user:online` handler).
//  Phone is cosmetic metadata and may be NULL for email signups.
//  Using userId as primary eliminates the entire phone-resolution
//  failure mode.
//
//  callRoomId derivation:
//    - If both userIds known → hash sorted userIds (userId-native path)
//    - Else if both phones known → hash sorted phones (legacy path)
//    - Else → random id (conference will still work, just not
//             deterministic across both sides — avoid this path)
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// Deterministic 32-char-ish hash of the two IDs, sorted.
// Format mimics a uuid so downstream code that assumes "uuid-ish" doesn't choke.
// Exported so other screens (NewMessageScreen) can derive the same roomId
// from the same two userIds and both sides of a chat converge on one room.
export function hashPair(a, b) {
  const sorted = [String(a || ''), String(b || '')].sort();
  const combined = sorted[0] + '|' + sorted[1];
  let h1 = 0, h2 = 0;
  for (let i = 0; i < combined.length; i++) {
    h1 = (Math.imul(31, h1) + combined.charCodeAt(i)) | 0;
    h2 = (Math.imul(37, h2) + combined.charCodeAt(i)) | 0;
  }
  const p1 = Math.abs(h1).toString(16).padStart(8, '0');
  const p2 = Math.abs(h2).toString(16).padStart(8, '0');
  const p3 = Math.abs(h1 ^ h2).toString(16).padStart(8, '0');
  return `${p1}-${p2.slice(0,4)}-4${p2.slice(1,4)}-a${p3.slice(0,3)}-${p1}${p2.slice(0,4)}`;
}

function makeCallId() {
  // 128-ish random bits; collision-free for the in-flight window of a single call.
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

async function resolvePeerUserIdFromPhone(peerPhoneNormalized) {
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
 * Place a 1:1 call. Prefers explicit peerUserId; falls back to phone lookup;
 * if neither resolves, shows the mock UX so the user sees *something*.
 *
 * @param {object} opts
 * @param {object} opts.navigation              — react-navigation nav prop
 * @param {string} [opts.peerUserId]            — peer's auth.users.id (preferred)
 * @param {string} [opts.recipientName]         — display name
 * @param {string} [opts.recipientPhone]        — peer's phone, any format (legacy)
 * @param {string} [opts.chatRoomId]            — existing chat roomId, if any.
 *                                                If provided, used as callRoomId
 *                                                so call + chat share a room.
 * @param {'voice'|'video'} [opts.type='voice']
 */
export async function placeCall({
  navigation,
  peerUserId: explicitPeerUserId,
  recipientName,
  recipientPhone,
  chatRoomId,
  type = 'voice',
}) {
  const phoneNorm = normalizePhone(recipientPhone);
  const { myUserId, myPhone } = await getMyIdentity();

  // Resolve peer userId: explicit > phone-derived > null
  let peerUserId = explicitPeerUserId || null;
  if (!peerUserId && phoneNorm) {
    peerUserId = await resolvePeerUserIdFromPhone(phoneNorm);
  }

  // If we can't identify both sides as real accounts, fall back to mock UX.
  if (!myUserId || !peerUserId) {
    navigation.navigate('ActiveCall', {
      recipientName,
      recipientPhone: phoneNorm || recipientPhone,
      callType: type,
    });
    return;
  }

  // Derive the call's roomId.
  // Preference: use the chat roomId if we already have one (keeps call + chat
  // co-located on the server). Otherwise derive from userIds (phone-agnostic).
  // Phone-based fallback is kept for legacy rooms that were hashed from phones.
  let roomId = chatRoomId || null;
  if (!roomId) {
    if (myUserId && peerUserId) {
      roomId = hashPair(myUserId, peerUserId);
    } else if (myPhone && phoneNorm) {
      roomId = hashPair(myPhone, phoneNorm);
    } else {
      // Last-resort: non-deterministic. Both sides won't derive the same id
      // from this path — we only hit this if something upstream is broken.
      roomId = makeCallId();
    }
  }

  const callId = makeCallId();

  navigation.navigate('ActiveCall', {
    mode: 'outgoing',
    callId,
    roomId,
    myUserId,
    peerUserId,
    recipientName,
    recipientPhone: phoneNorm,
    callType: type,
  });
}
