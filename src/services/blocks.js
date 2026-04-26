// ============================================================
//  VaultChat — Per-user blocking (task #94)
//  src/services/blocks.js
//
//  When user A blocks user B:
//    - Server drops messages and call invites between them
//      (when both sides have been registered with the same
//      Supabase project — the `blocked_users` table is queried
//      via the users_are_blocked() helper).
//    - Local client also filters anything from B that slips
//      through, AND removes B from contact suggestion / search.
//
//  Source of truth is the Supabase `blocked_users` table; we
//  cache the list in AsyncStorage so chat screens can do
//  synchronous filtering on the inbound message hot path.
//
//  Distinct from `banned_users` (platform-wide, server-only).
//  See vaultchat-server/server.js for the ban enforcement path.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

let supabase = null;
try { supabase = require('./supabase').supabase; } catch (e) {}

const CACHE_KEY = 'vaultchat_blocked_users';

// In-memory mirror — readBlocksCacheSync() returns this. We hydrate
// it from AsyncStorage on first import so chat screens that mount
// quickly can already filter without an await.
let _cache = new Set();
const _listeners = new Set();

function notify() {
  for (const cb of _listeners) { try { cb(_cache); } catch {} }
}

export function subscribe(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

/** Synchronous check — fast enough for the message-receive hot path. */
export function isBlockedSync(userId) {
  if (!userId) return false;
  return _cache.has(userId);
}

/** Returns the in-memory Set of blocked user IDs. */
export function readBlocksCacheSync() {
  return new Set(_cache);
}

async function persistCache() {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(Array.from(_cache)));
  } catch {}
}

/**
 * Hydrate from cache + Supabase. Call once at app boot (e.g. in App.js)
 * and again after sign-in. Falls back to the AsyncStorage cache when
 * offline so existing blocks still apply.
 */
export async function hydrateBlocks() {
  // Local cache first — instant, even if Supabase is unreachable.
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        _cache = new Set(arr);
        notify();
      }
    }
  } catch {}

  // Then refresh from Supabase if available.
  if (!supabase) return;
  try {
    const { data: u } = await supabase.auth.getUser();
    const me = u?.user?.id;
    if (!me) return;
    const { data, error } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', me);
    if (error) return;
    _cache = new Set((data || []).map(r => r.blocked_id).filter(Boolean));
    notify();
    persistCache();
  } catch (e) {
    console.warn('[blocks] hydrate failed:', e?.message || e);
  }
}

/**
 * Block a user. Idempotent — a duplicate INSERT is treated as success
 * because the unique (blocker_id, blocked_id) constraint guarantees
 * the row already exists.
 *
 * @param {string} blockedUserId — the user being blocked
 * @param {object} [opts]
 * @param {string} [opts.reason]          — optional context, kept private
 * @param {string} [opts.sourceReportId]  — link to the report that motivated this
 */
export async function blockUser(blockedUserId, opts = {}) {
  if (!blockedUserId) return false;
  // Optimistic local update so UI reacts instantly.
  _cache.add(blockedUserId);
  notify();
  persistCache();

  if (!supabase) return true; // local-only mode (dev / unauthenticated)
  try {
    const { data: u } = await supabase.auth.getUser();
    const me = u?.user?.id;
    if (!me) return true;
    const { error } = await supabase.from('blocked_users').insert({
      blocker_id:        me,
      blocked_id:        blockedUserId,
      reason:            opts.reason || null,
      source_report_id:  opts.sourceReportId || null,
    });
    // 23505 = unique violation → already blocked → success.
    if (error && error.code !== '23505') {
      console.warn('[blocks] insert failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[blocks] insert exception:', e?.message || e);
    return false;
  }
}

export async function unblockUser(blockedUserId) {
  if (!blockedUserId) return false;
  _cache.delete(blockedUserId);
  notify();
  persistCache();

  if (!supabase) return true;
  try {
    const { data: u } = await supabase.auth.getUser();
    const me = u?.user?.id;
    if (!me) return true;
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', me)
      .eq('blocked_id', blockedUserId);
    if (error) {
      console.warn('[blocks] delete failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[blocks] delete exception:', e?.message || e);
    return false;
  }
}

/**
 * Returns full block records (id, blocked_id, created_at, ...) so the
 * Settings → Blocked Users screen can render names + unblock buttons.
 * Falls back to a minimal list derived from the cache when Supabase is
 * unavailable.
 */
export async function listBlockedUsers() {
  if (!supabase) {
    return Array.from(_cache).map(id => ({ blocked_id: id }));
  }
  try {
    const { data: u } = await supabase.auth.getUser();
    const me = u?.user?.id;
    if (!me) return [];
    // Join into profiles to get display name + handle for the list UI.
    const { data, error } = await supabase
      .from('blocked_users')
      .select('id, blocked_id, created_at, profiles:blocked_id(display_name, handle, avatar_url, vault_id)')
      .eq('blocker_id', me)
      .order('created_at', { ascending: false });
    if (error) return Array.from(_cache).map(id => ({ blocked_id: id }));
    return data || [];
  } catch {
    return Array.from(_cache).map(id => ({ blocked_id: id }));
  }
}

// Auto-hydrate on first import so the Set is populated before any
// chat screen tries to filter inbound messages.
hydrateBlocks();
