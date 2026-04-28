// keyExchange.js — VaultChat public-key directory.
//
// Responsibilities:
//   • Ensure this device has an identity keypair (X25519 via tweetnacl).
//   • Publish the LOCAL public key to `profiles.public_key` in Supabase so
//     other users can fetch it. Private key never leaves the device.
//   • Look up a peer's public key by user_id, with a short-lived in-memory cache.
//   • Resolve the "other member" of a 1:1 room via `rooms.member_ids`.
//
// Scope: 1:1 DMs only. Groups + media stay plaintext for Phase 2.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { ensureIdentityKeys, loadIdentityKeys } from '../crypto/encryption';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const _pubKeyCache = new Map(); // userId → { pk: string, ts: number }

/**
 * Read the stored identifier (phone in E.164) from AsyncStorage.
 * Used as a weak-auth check when we have to publish via the RPC path
 * (devices without a real Supabase auth session).
 */
async function getStoredPhone() {
  try {
    const raw = await AsyncStorage.getItem('vaultchat_user');
    if (!raw) return null;
    const u = JSON.parse(raw);
    return typeof u?.phone === 'string' && u.phone ? u.phone : null;
  } catch {
    return null;
  }
}

/**
 * If AsyncStorage doesn't have our phone, look it up on profiles (publicly
 * readable) keyed by user_id, and backfill AsyncStorage so future boots
 * have it locally. This is a self-healing migration for devices that
 * pre-date the current RegisterScreen phone-storage flow.
 *
 * Note on security: profiles.phone is already publicly readable via RLS
 * policy profiles_select_public, so no additional disclosure. The RPC's
 * phone-check is a structural guard only — the real identity proof will
 * come when we migrate to real Supabase auth sessions.
 */
async function resolveMyPhone(myUserId) {
  const fromStore = await getStoredPhone();
  if (fromStore) return fromStore;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', myUserId)
      .maybeSingle();
    if (error || !data?.phone) return null;

    // Backfill AsyncStorage so subsequent boots skip the network round-trip.
    try {
      const raw = await AsyncStorage.getItem('vaultchat_user');
      const prev = raw ? JSON.parse(raw) : {};
      await AsyncStorage.setItem(
        'vaultchat_user',
        JSON.stringify({ ...prev, id: myUserId, phone: data.phone })
      );
    } catch {}
    return data.phone;
  } catch {
    return null;
  }
}

/**
 * Generate (if needed) and publish this device's public key to Supabase.
 *
 * Two paths:
 *   1. Direct UPDATE — works when the device has a real Supabase auth session
 *      (auth.uid() matches profiles.id, RLS `profiles_update_own` allows it).
 *   2. RPC fallback — `publish_public_key(user_id, phone, public_key)` is
 *      SECURITY DEFINER and requires the caller's stored phone to match the
 *      profile row. Covers devices that registered via Railway /register only.
 *
 * Safe to call on every app launch. No-op if the server already has the
 * same key. Returns `{ publicKey }` on success, `null` on failure.
 */
export async function publishMyPublicKey(myUserId) {
  if (!myUserId) return null;
  try {
    const { publicKey } = await ensureIdentityKeys();
    // (Phase debug log removed — verified the dev-shortcut fix works.)

    // Check current value — avoid a write if unchanged.
    const { data: existing } = await supabase
      .from('profiles')
      .select('public_key')
      .eq('id', myUserId)
      .maybeSingle();

    if (existing?.public_key === publicKey) return { publicKey };

    // Path 1: UPSERT — works when we have a real Supabase auth session
    // (auth.uid() == myUserId). Covers both "no profile row yet" and
    // "profile row exists, pubkey stale" in one call. The insert branch
    // is gated by profiles_insert_own; the update branch by profiles_update_own.
    const { data: upserted, error: upsertError } = await supabase
      .from('profiles')
      .upsert(
        { id: myUserId, public_key: publicKey, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      )
      .select('id');

    if (!upsertError && Array.isArray(upserted) && upserted.length > 0) {
      return { publicKey };
    }
    if (__DEV__ && upsertError) {
      console.warn('publishMyPublicKey upsert warning:', upsertError.message);
    }

    // Path 2: RPC fallback — used only when upsert didn't take (no auth
    // session / RLS blocked). Phone-match acts as a structural guard for
    // legacy rows that predate the Supabase auth flow.
    const phone = await resolveMyPhone(myUserId);
    if (!phone) {
      if (__DEV__) console.warn('publishMyPublicKey: no phone for user, cannot use RPC path');
      return null;
    }
    const { data: rpcResult, error: rpcError } = await supabase.rpc('publish_public_key', {
      p_user_id:    myUserId,
      p_identifier: phone,
      p_public_key: publicKey,
    });
    if (rpcError) {
      if (__DEV__) console.warn('publishMyPublicKey rpc error:', rpcError.message);
      return null;
    }
    if (rpcResult && rpcResult.ok === true) {
      return { publicKey };
    }
    if (__DEV__) console.warn('publishMyPublicKey rpc rejected:', rpcResult);
    return null;
  } catch (e) {
    if (__DEV__) console.warn('publishMyPublicKey error:', e?.message || e);
    return null;
  }
}

/**
 * Fetch another user's public key. Cached for 5 min per user_id.
 * Returns the base64 public key string, or `null` if missing/unpublished.
 */
export async function getPublicKey(userId) {
  if (!userId) return null;
  const cached = _pubKeyCache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.pk;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('public_key')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data?.public_key) return null;
    _pubKeyCache.set(userId, { pk: data.public_key, ts: Date.now() });
    return data.public_key;
  } catch (e) {
    if (__DEV__) console.warn('getPublicKey error:', e?.message || e);
    return null;
  }
}

/** Clear the pubkey cache for a user (e.g., after a reported device change). */
export function invalidatePublicKey(userId) {
  _pubKeyCache.delete(userId);
}

/**
 * Resolve the other member of a 1:1 room.
 *
 * Strategy:
 *   1. Read `rooms.member_ids` — the canonical source once rooms rows exist.
 *   2. Fall back to looking up a profile by `recipientPhone` (supplied by
 *      the screen) for legacy chats where the rooms row was never created.
 *   3. If we resolved the peer via fallback, upsert a `rooms` row so future
 *      lookups go through the fast path.
 *
 * Returns `null` if the room is a group (Phase 2) or we cannot resolve.
 */
export async function resolveDirectRecipient(roomId, myUserId, { recipientPhone } = {}) {
  if (!roomId || !myUserId) return null;

  // 1. Canonical: rooms table.
  try {
    const { data } = await supabase
      .from('rooms')
      .select('type, member_ids')
      .eq('id', roomId)
      .maybeSingle();
    if (data) {
      if (data.type && data.type !== 'direct') return null; // groups: Phase 2
      const members = Array.isArray(data.member_ids) ? data.member_ids : [];
      const other = members.find(id => id && id !== myUserId);
      if (other) return other;
    }
  } catch (e) {
    if (__DEV__) console.warn('resolveDirectRecipient (rooms read) error:', e?.message || e);
  }

  // 2. Fallback: phone → profile lookup. Legacy chats had no rooms row.
  if (recipientPhone) {
    try {
      const phoneNormalized = normalizePhone(recipientPhone);
      if (!phoneNormalized) return null;
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', phoneNormalized)
        .maybeSingle();
      if (profile?.id && profile.id !== myUserId) {
        // 3. Backfill rooms row so next time we hit the fast path.
        backfillDirectRoom(roomId, myUserId, profile.id).catch(() => {});
        return profile.id;
      }
    } catch (e) {
      if (__DEV__) console.warn('resolveDirectRecipient (phone fallback) error:', e?.message || e);
    }
  }

  return null;
}

/**
 * Create the `rooms` row for a 1:1 chat if it doesn't already exist.
 * Safe to call multiple times — no-ops when the row is already present.
 * Never throws.
 */
async function backfillDirectRoom(roomId, myUserId, otherUserId) {
  try {
    const { data: existing } = await supabase
      .from('rooms')
      .select('id')
      .eq('id', roomId)
      .maybeSingle();
    if (existing) return;
    await supabase.from('rooms').insert({
      id:         roomId,
      type:       'direct',
      member_ids: [myUserId, otherUserId],
      created_by: myUserId,
    });
  } catch (e) {
    if (__DEV__) console.warn('backfillDirectRoom error:', e?.message || e);
  }
}

// Minimal phone normalizer — matches how RegisterScreen stores phone as "+1<digits>".
// If `recipientPhone` already starts with '+', keep it. Otherwise assume US and prefix.
function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith('+')) return t;
  const digits = t.replace(/\D/g, '');
  if (!digits) return null;
  return `+1${digits}`;
}

/** Convenience: do I already have local identity keys? */
export async function haveLocalKeys() {
  return !!(await loadIdentityKeys());
}
