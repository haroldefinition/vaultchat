// ============================================================
//  chatPrefsSync.js — cross-device sync of chat-row state
//
//  Server tables (see 20260427_chat_prefs_sync.sql):
//    user_chat_prefs (user_id, room_id, pinned, archived,
//                      hide_alerts, marked_unread, folder_id)
//    user_folders    (user_id, name, emoji, position)
//
//  How it integrates with existing local state:
//    - ChatsScreen still loads its `vaultchat_chats` array from
//      AsyncStorage (where chat metadata like name / lastMessage
//      / time lives — that stays local).
//    - On entry, pullPrefs() fetches the user's prefs from
//      Supabase and overlays {pinned/archived/hideAlerts/...}
//      onto the local chat objects. The merged view is what the
//      UI renders.
//    - When the user pins / archives / etc, the helper writes
//      BOTH to local AsyncStorage (instant feedback) AND to
//      user_chat_prefs (cross-device sync). Realtime subscription
//      fans the change out to the user's other installs.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

let supabase = null;
try { supabase = require('./supabase').supabase; } catch {}

const FOLDERS_LOCAL_KEY = 'vaultchat_folders';
const PREFS_LOCAL_KEY   = 'vaultchat_chat_prefs_cache';

// ── Pull helpers ───────────────────────────────────────────────

/**
 * Fetch the user's full chat-prefs map from Supabase.
 * Returns { roomId: { pinned, archived, hideAlerts, markedUnread, folderId } }.
 */
export async function pullChatPrefs(userId) {
  if (!userId || !supabase) return {};
  try {
    const { data, error } = await supabase
      .from('user_chat_prefs')
      .select('room_id, pinned, archived, hide_alerts, marked_unread, folder_id')
      .eq('user_id', userId);
    if (error || !Array.isArray(data)) return {};
    const map = {};
    for (const row of data) {
      map[row.room_id] = {
        pinned:       !!row.pinned,
        archived:     !!row.archived,
        hideAlerts:   !!row.hide_alerts,
        markedUnread: !!row.marked_unread,
        folderId:     row.folder_id || null,
      };
    }
    // Cache so a subsequent cold launch has prefs available
    // immediately even before the network round-trip completes.
    try { await AsyncStorage.setItem(PREFS_LOCAL_KEY, JSON.stringify(map)); } catch {}
    return map;
  } catch (e) {
    if (__DEV__) console.warn('pullChatPrefs error:', e?.message);
    return {};
  }
}

/** Read the last cached prefs map for offline-first first paint. */
export async function readCachedPrefs() {
  try {
    const raw = await AsyncStorage.getItem(PREFS_LOCAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// ── Write helpers ─────────────────────────────────────────────

/**
 * Upsert one room's prefs. Pass only the fields you want to
 * change; unspecified fields keep their current value via the
 * upsert merge.
 */
export async function setChatPref(userId, roomId, patch) {
  if (!userId || !roomId || !supabase) return;
  try {
    // Fetch existing row so we don't accidentally clear other
    // fields when patching one.
    const { data: existing } = await supabase
      .from('user_chat_prefs')
      .select('pinned, archived, hide_alerts, marked_unread, folder_id')
      .eq('user_id', userId)
      .eq('room_id', roomId)
      .maybeSingle();
    const merged = {
      user_id:       userId,
      room_id:       roomId,
      pinned:        patch.pinned       != null ? !!patch.pinned       : !!existing?.pinned,
      archived:      patch.archived     != null ? !!patch.archived     : !!existing?.archived,
      hide_alerts:   patch.hideAlerts   != null ? !!patch.hideAlerts   : !!existing?.hide_alerts,
      marked_unread: patch.markedUnread != null ? !!patch.markedUnread : !!existing?.marked_unread,
      folder_id:     patch.folderId     !== undefined ? patch.folderId : (existing?.folder_id || null),
    };
    await supabase.from('user_chat_prefs')
      .upsert(merged, { onConflict: 'user_id,room_id' });
    // Update local cache so next pullChatPrefs returns instantly.
    try {
      const raw = await AsyncStorage.getItem(PREFS_LOCAL_KEY);
      const cache = raw ? JSON.parse(raw) : {};
      cache[roomId] = {
        pinned:       merged.pinned,
        archived:     merged.archived,
        hideAlerts:   merged.hide_alerts,
        markedUnread: merged.marked_unread,
        folderId:     merged.folder_id,
      };
      await AsyncStorage.setItem(PREFS_LOCAL_KEY, JSON.stringify(cache));
    } catch {}
  } catch (e) {
    if (__DEV__) console.warn('setChatPref error:', e?.message);
  }
}

// ── Folders ────────────────────────────────────────────────────

/**
 * Fetch the user's folder list from Supabase. Caches locally so
 * a subsequent cold launch has folders available immediately.
 * Returns array of { id, name, emoji, position }.
 */
export async function pullFolders(userId) {
  if (!userId || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('user_folders')
      .select('id, name, emoji, position')
      .eq('user_id', userId)
      .order('position', { ascending: true });
    if (error || !Array.isArray(data)) return [];
    try { await AsyncStorage.setItem(FOLDERS_LOCAL_KEY, JSON.stringify(data)); } catch {}
    return data;
  } catch (e) {
    if (__DEV__) console.warn('pullFolders error:', e?.message);
    return [];
  }
}

/** Create a new folder. Returns the inserted row. */
export async function createFolder(userId, { name, emoji = null, position = 0 }) {
  if (!userId || !name || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from('user_folders')
      .insert({ user_id: userId, name, emoji, position })
      .select()
      .single();
    if (error || !data) return null;
    return data;
  } catch (e) {
    if (__DEV__) console.warn('createFolder error:', e?.message);
    return null;
  }
}

/** Rename / reposition / re-emoji an existing folder. */
export async function updateFolder(userId, folderId, patch) {
  if (!userId || !folderId || !supabase) return;
  try {
    await supabase
      .from('user_folders')
      .update({
        ...(patch.name     != null && { name:     patch.name }),
        ...(patch.emoji    != null && { emoji:    patch.emoji }),
        ...(patch.position != null && { position: patch.position }),
      })
      .eq('id', folderId)
      .eq('user_id', userId);
  } catch (e) {
    if (__DEV__) console.warn('updateFolder error:', e?.message);
  }
}

/** Delete a folder. Server cascades folder_id → NULL on chat prefs. */
export async function deleteFolder(userId, folderId) {
  if (!userId || !folderId || !supabase) return;
  try {
    await supabase.from('user_folders').delete()
      .eq('id', folderId).eq('user_id', userId);
  } catch (e) {
    if (__DEV__) console.warn('deleteFolder error:', e?.message);
  }
}

// ── Migration: legacy AsyncStorage → server (one-time) ─────────

/**
 * On first launch after Phase OO ships, copy the user's local
 * pinned / archived / hideAlerts state from `vaultchat_chats`
 * up to user_chat_prefs so a 2nd device picks it up. Idempotent
 * — re-running is a no-op (upsert merges).
 */
export async function migrateLocalPrefsToServer(userId) {
  if (!userId || !supabase) return;
  try {
    const raw = await AsyncStorage.getItem('vaultchat_chats');
    if (!raw) return;
    const chats = JSON.parse(raw);
    if (!Array.isArray(chats)) return;
    const rows = chats
      .filter(c => c.roomId && (c.pinned || c.archived || c.hideAlerts || c.markedUnread))
      .map(c => ({
        user_id:       userId,
        room_id:       c.roomId,
        pinned:        !!c.pinned,
        archived:      !!c.archived,
        hide_alerts:   !!c.hideAlerts,
        marked_unread: !!c.markedUnread,
      }));
    if (!rows.length) return;
    await supabase.from('user_chat_prefs').upsert(rows, { onConflict: 'user_id,room_id' });
  } catch (e) {
    if (__DEV__) console.warn('migrateLocalPrefsToServer error:', e?.message);
  }
}
