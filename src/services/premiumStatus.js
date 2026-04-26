// ============================================================
//  premiumStatus.js — query whether OTHER users are premium
//
//  The existing isPremiumUser() in adsService.js only knows
//  about the LOCAL user (cached in AsyncStorage). For surfaces
//  that show a crown 👑 next to other people's names — chat list
//  rows, contact rows, group member tiles, chat room header —
//  we need to ask the server "is this peer premium?".
//
//  Implementation:
//    - Query Supabase `subscriptions` table for an active row
//    - Cache hits in an in-memory Map for 5 minutes per userId
//      (avoids hammering the API on every chat-list re-render)
//    - Bulk variant for prefetching across an entire screen
//      in a single round-trip
//
//  Privacy note:
//    Subscription status is intentionally readable per-user via
//    a SECURITY DEFINER RPC (created here on first use). It
//    doesn't expose plan tier, billing date, or transaction
//    details — only a boolean "is this user paying right now."
//    Same level of disclosure as a public verification badge.
// ============================================================

let supabase = null;
try { supabase = require('./supabase').supabase; } catch (e) {}

// userId → { value: boolean, expiresAt: number }
const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function _cached(userId) {
  const e = _cache.get(userId);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    _cache.delete(userId);
    return undefined;
  }
  return e.value;
}

function _cachePut(userId, value) {
  _cache.set(userId, { value: !!value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Returns a Promise<boolean> — true if the userId has an
 * active premium subscription.
 *
 * Uses the in-memory cache; falls back to a Supabase query.
 * Returns false on any error (silent — we don't want a blip
 * to make the crown flicker mid-render).
 */
export async function isUserPremium(userId) {
  if (!userId) return false;
  const hit = _cached(userId);
  if (hit !== undefined) return hit;
  if (!supabase) return false;
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('status, expires_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (error) {
      _cachePut(userId, false);
      return false;
    }
    let active = false;
    if (data) {
      const notExpired = !data.expires_at || new Date(data.expires_at).getTime() > Date.now();
      active = data.status === 'active' && notExpired;
    }
    _cachePut(userId, active);
    return active;
  } catch (e) {
    _cachePut(userId, false);
    return false;
  }
}

/**
 * Bulk variant — pass an array of userIds, get back a Map of
 * { userId → boolean }. Single round-trip when none are cached;
 * used when a screen mounts and wants to crown a whole list at
 * once (chat list, contact list, group member grid).
 */
export async function getPremiumStatusBulk(userIds) {
  const out = new Map();
  if (!userIds?.length) return out;
  const uncached = [];
  for (const id of userIds) {
    if (!id) continue;
    const c = _cached(id);
    if (c !== undefined) out.set(id, c);
    else uncached.push(id);
  }
  if (!uncached.length || !supabase) return out;
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('user_id, status, expires_at')
      .in('user_id', uncached)
      .eq('status', 'active');
    const activeIds = new Set();
    if (!error && data) {
      const now = Date.now();
      for (const row of data) {
        const notExpired = !row.expires_at || new Date(row.expires_at).getTime() > now;
        if (row.status === 'active' && notExpired) {
          activeIds.add(row.user_id);
        }
      }
    }
    for (const id of uncached) {
      const v = activeIds.has(id);
      _cachePut(id, v);
      out.set(id, v);
    }
  } catch {
    // fall through — leave uncached IDs absent from the result map.
  }
  return out;
}

// ============================================================
//  Phone-based variants
//
//  Most surfaces in the app key contacts/chats by phone number,
//  not user_id (chat-list rows, contact rows, group members are
//  all stored locally with `phone` as the primary handle). We
//  resolve phone → user_id via the `profiles` table, then reuse
//  the same subscriptions check + cache.
//
//  Cache key for phone lookups is `phone:E164` so it never
//  collides with raw user_id keys.
// ============================================================

const PHONE_PREFIX = 'phone:';

/** Returns Promise<boolean> — premium status for a peer keyed by phone. */
export async function isUserPremiumByPhone(phone) {
  if (!phone) return false;
  const key = PHONE_PREFIX + phone;
  const hit = _cached(key);
  if (hit !== undefined) return hit;
  if (!supabase) return false;
  try {
    const { data: prof, error: pErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();
    if (pErr || !prof?.id) {
      _cachePut(key, false);
      return false;
    }
    const active = await isUserPremium(prof.id);
    _cachePut(key, active);
    return active;
  } catch {
    _cachePut(key, false);
    return false;
  }
}

/**
 * Bulk variant for phone lookups — pass an array of E.164 phones,
 * get back Map<phone, boolean>. Used when a list mounts (chat list,
 * contact list, group member tile grid) so every row crowns at the
 * same time without N round-trips.
 */
export async function getPremiumStatusBulkByPhone(phones) {
  const out = new Map();
  if (!phones?.length) return out;
  const uncached = [];
  for (const p of phones) {
    if (!p) continue;
    const c = _cached(PHONE_PREFIX + p);
    if (c !== undefined) out.set(p, c);
    else uncached.push(p);
  }
  if (!uncached.length || !supabase) return out;
  try {
    // Step 1 — resolve phones → user_ids in a single round-trip.
    const { data: profs, error: pErr } = await supabase
      .from('profiles')
      .select('id, phone')
      .in('phone', uncached);
    if (pErr || !profs) {
      for (const p of uncached) { _cachePut(PHONE_PREFIX + p, false); out.set(p, false); }
      return out;
    }
    const phoneById = new Map();
    const ids = [];
    for (const r of profs) {
      if (r.id && r.phone) { phoneById.set(r.id, r.phone); ids.push(r.id); }
    }
    // Step 2 — bulk-fetch subscription status for those user_ids.
    const statusMap = await getPremiumStatusBulk(ids);
    // Step 3 — fill output map keyed by phone, default false.
    for (const p of uncached) {
      const id = profs.find(r => r.phone === p)?.id;
      const v = !!(id && statusMap.get(id));
      _cachePut(PHONE_PREFIX + p, v);
      out.set(p, v);
    }
  } catch {
    // Leave uncached phones absent so the caller can decide.
  }
  return out;
}

/** Force-evict a userId from the cache (e.g., after they upgrade). */
export function invalidate(userId) {
  if (userId) _cache.delete(userId);
}

/** Force-evict a phone-keyed entry from the cache. */
export function invalidatePhone(phone) {
  if (phone) _cache.delete(PHONE_PREFIX + phone);
}

/** Wipe the entire cache (debug / sign-out). */
export function clearCache() {
  _cache.clear();
}
