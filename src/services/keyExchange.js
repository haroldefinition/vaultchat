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

import { supabase } from './supabase';
import { ensureIdentityKeys, loadIdentityKeys } from '../crypto/encryption';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const _pubKeyCache = new Map(); // userId → { pk: string, ts: number }

/**
 * Generate (if needed) and publish this device's public key to Supabase.
 * Safe to call on every app launch. No-op if the server already has the
 * same key. Returns `{ publicKey }` on success, `null` on failure.
 */
export async function publishMyPublicKey(myUserId) {
  if (!myUserId) return null;
  try {
    const { publicKey } = await ensureIdentityKeys();

    // Check current value — avoid a write if unchanged.
    const { data: existing } = await supabase
      .from('profiles')
      .select('public_key')
      .eq('id', myUserId)
      .maybeSingle();

    if (existing?.public_key === publicKey) return { publicKey };

    const { error } = await supabase
      .from('profiles')
      .update({ public_key: publicKey, updated_at: new Date().toISOString() })
      .eq('id', myUserId);

    if (error) {
      if (__DEV__) console.warn('publishMyPublicKey failed:', error.message);
      return null;
    }
    return { publicKey };
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
 * For a 1:1 room, return the OTHER member's user_id.
 * Reads `rooms.member_ids` (uuid[]) and returns the first id that isn't mine.
 * Returns `null` if the room isn't a direct room, has no members, or isn't found.
 */
export async function resolveDirectRecipient(roomId, myUserId) {
  if (!roomId || !myUserId) return null;
  try {
    const { data, error } = await supabase
      .from('rooms')
      .select('type, member_ids')
      .eq('id', roomId)
      .maybeSingle();
    if (error || !data) return null;
    if (data.type && data.type !== 'direct') return null; // groups: Phase 2
    const members = Array.isArray(data.member_ids) ? data.member_ids : [];
    const other = members.find(id => id && id !== myUserId);
    return other || null;
  } catch (e) {
    if (__DEV__) console.warn('resolveDirectRecipient error:', e?.message || e);
    return null;
  }
}

/** Convenience: do I already have local identity keys? */
export async function haveLocalKeys() {
  return !!(await loadIdentityKeys());
}
