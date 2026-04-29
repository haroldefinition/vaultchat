// ============================================================
//  VaultChat — Vault Handle Service
//  src/services/vaultHandle.js
//
//  User-chosen @handles (e.g. "@love6362") used for discovery.
//  Stored in profiles.vault_handle (unique, case-insensitive)
//  plus a device-local copy in AsyncStorage for fast reads.
//
//  Normalization: the '@' is cosmetic — it's stripped before
//  persisting and lookups so callers can pass either form.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase }  from './supabase';

const LOCAL_KEY = 'vaultchat_handle';

/**
 * Display formatter — strips a leading '@' so handles render as the
 * bare name in chat headers, contact rows, mention popups, etc.
 * The signup flow still accepts the '@' prefix as user input, and
 * @-mention typing inside chat composers still uses '@handle' to
 * trigger the autocomplete — only the *display* form is bare.
 *
 * Safe on `undefined` / `null` (returns ''), so callers don't need
 * to null-check before passing.
 */
export function displayHandle(h) {
  if (typeof h !== 'string') return '';
  return h.replace(/^@+/, '');
}

// Strip the leading '@' and lowercase. Returns null for unusable input.
function normalize(h) {
  if (typeof h !== 'string') return null;
  const t = h.trim().replace(/^@+/, '').toLowerCase();
  // Keep only a-z, 0-9, underscore. Reject empty/overlong.
  const cleaned = t.replace(/[^a-z0-9_]/g, '');
  if (!cleaned || cleaned.length < 3 || cleaned.length > 32) return null;
  return cleaned;
}

export async function generateHandle(name) {
  const base   = (name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `@${base}${suffix}`;
}

/**
 * Read the current user's handle from AsyncStorage (fast, no network).
 * Returns the value with leading '@' if stored that way, otherwise raw.
 */
export async function getMyHandle() {
  try { return await AsyncStorage.getItem(LOCAL_KEY); } catch { return null; }
}

/**
 * Resolve the best display label for THIS device's user with a graceful
 * fallback chain, used anywhere we broadcast our identity to peers
 * (e.g. the `userName` field on callroom:join or callroom:upgrade):
 *   1. vaultchat_display_name — what the user set on their profile
 *   2. vaultchat_handle       — their @handle (so peers see "@hjero7" rather
 *                                than "VaultChat User" when display_name isn't set)
 *   3. 'VaultChat User'       — last-resort default
 * Never throws.
 */
export async function getMyDisplayName() {
  try {
    const name = await AsyncStorage.getItem('vaultchat_display_name');
    if (name && name.trim()) return name;
  } catch {}
  try {
    const h = await AsyncStorage.getItem(LOCAL_KEY);
    if (h && h.trim()) return h; // typically stored with leading '@'
  } catch {}
  return 'VaultChat User';
}

/**
 * Persist the handle locally AND to Supabase. Both `vault_handle` and
 * `vault_id` columns get the SAME value — the Vault ID and @handle are
 * the user's single public identifier and we keep them in sync so the
 * Settings screen, blocked-users list, contact rows, and any future
 * surface that reads either column show the same thing.
 *
 * Normalizes (strips '@', lowercases) before writing to the DB; the
 * local AsyncStorage copy keeps the leading '@' so display surfaces
 * can read it without prepending.
 *
 * Returns { ok, reason } — reason = 'taken' | 'invalid' | 'network' | null.
 */
export async function saveHandle(handle) {
  const norm = normalize(handle);
  if (!norm) return { ok: false, reason: 'invalid' };

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const myUserId = session?.user?.id;
    if (!myUserId) {
      // Not logged in — still cache locally, but flag failure.
      try {
        await AsyncStorage.setItem(LOCAL_KEY, `@${norm}`);
        await AsyncStorage.setItem('vaultchat_vault_id', `@${norm}`);
      } catch {}
      return { ok: false, reason: 'network' };
    }

    // Attempt to claim. Case-insensitive unique index will reject collisions.
    // Write to both vault_handle (used for handle search/lookup) and
    // vault_id (legacy column read by blocks list + backup) so they
    // never drift apart.
    //
    // .select() at the tail forces Supabase to return the updated rows
    // so we can detect RLS silent rejections. Without it, supabase-js
    // returns { error: null } even when the row-level security policy
    // refused to mutate any row — saveHandle would then erroneously
    // report success, the local cache would update, and the user would
    // see their new @handle in the UI while Supabase silently kept the
    // old value (the exact failure mode we hit on 2026-04-28).
    const { data: updatedRows, error } = await supabase
      .from('profiles')
      .update({ vault_handle: norm, vault_id: norm })
      .eq('id', myUserId)
      .select();

    if (error) {
      // 23505 = unique_violation → already taken by someone else.
      const code = error.code || '';
      if (code === '23505' || /duplicate key|unique/i.test(error.message || '')) {
        return { ok: false, reason: 'taken' };
      }
      return { ok: false, reason: 'network' };
    }
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
      // RLS rejected the update without raising an error. Either the
      // profiles table is missing an UPDATE policy, or the policy's
      // USING clause excludes this row. Treat as a failure so the UI
      // doesn't lie to the user.
      return { ok: false, reason: 'rls' };
    }

    try {
      await AsyncStorage.setItem(LOCAL_KEY, `@${norm}`);
      // Sync the local Vault ID cache the SettingsScreen reads from on
      // load so the field shows the chosen handle immediately and the
      // copy-button text matches what other users see.
      await AsyncStorage.setItem('vaultchat_vault_id', `@${norm}`);
    } catch {}
    return { ok: true, reason: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/**
 * Resolve a handle to a profile row. Accepts either '@love6362' or 'love6362'.
 * Returns { id, vault_handle, display_name, phone } or null if no match.
 */
export async function findByHandle(handle) {
  const norm = normalize(handle);
  if (!norm) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, vault_handle, display_name, phone')
      .ilike('vault_handle', norm)       // case-insensitive exact match
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

/**
 * Resolve a phone number to a profile row. Accepts any common format;
 * normalizes to the Supabase profiles.phone format (digits only,
 * country-code prefixed, NO leading '+') so it matches what auth +
 * profile upserts actually wrote.
 *
 * A previous version normalized to '+1…' — but profiles.phone stores
 * bare digits ("15555550101"), so the .eq('phone', '+15555550101')
 * lookup always missed and "find by phone" silently failed. Same
 * normalization shape now lives in placeCall.normalizePhone.
 *
 * Returns { id, vault_handle, display_name, phone } or null.
 */
export async function findByPhone(phoneRaw) {
  if (typeof phoneRaw !== 'string') return null;
  const digits = phoneRaw.replace(/\D/g, '');
  if (!digits) return null;
  // 10-digit US national → prepend country code; otherwise assume
  // the input already includes country code or is international.
  const normalized = digits.length === 10 ? `1${digits}` : digits;
  if (normalized.length < 8) return null;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, vault_handle, display_name, phone')
      .eq('phone', normalized)
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

/**
 * One-call helper: given user input (phone OR @handle), returns the matching
 * profile row, or null. Decides based on whether the string starts with '@'
 * or contains only digits/separators.
 */
export async function findByHandleOrPhone(input) {
  if (typeof input !== 'string') return null;
  const t = input.trim();
  if (!t) return null;
  if (t.startsWith('@') || /^[a-z_][a-z0-9_]*$/i.test(t)) {
    return await findByHandle(t);
  }
  return await findByPhone(t);
}
