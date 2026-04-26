// ============================================================
//  VaultChat — Chat Folders (premium feature, task #82)
//  src/services/folders.js
//
//  AsyncStorage-backed folders for organizing chats. Each folder
//  is { id, name, emoji, chatIds[] }. Powers a Telegram-style
//  pill row above the chat list and a Manage Folders screen.
//
//  Phase OO: now also synced to user_folders on Supabase. Local
//  AsyncStorage stays as the offline cache + chatIds membership
//  (which lives client-side because it can be derived from
//  user_chat_prefs.folder_id, but we cache it here for instant
//  filter rendering). The folder LIST itself (id, name, emoji,
//  position) is pushed to / pulled from user_folders so it
//  follows the user across devices.
//
//  This is a PREMIUM feature — non-premium users can see the
//  default "All" tab but can't create or switch into custom
//  folders. Gate is enforced at the UI layer (ChatsScreen +
//  FoldersScreen check isPremiumUser before opening the editor
//  or filtering by a folder).
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'vaultchat_folders';

const listeners = new Set();

// Lazy require — keeps folders.js usable in non-network contexts.
function getSyncHelpers() {
  try { return require('./chatPrefsSync'); } catch { return null; }
}
async function getMyUserId() {
  try {
    const { supabase } = require('./supabase');
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id || null;
  } catch { return null; }
}

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeAll(arr) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(arr)); } catch {}
  for (const cb of listeners) { try { cb(); } catch {} }
}

export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Returns the user's folders. Reads local cache first for instant
 * paint; concurrently kicks off a Supabase pull (Phase OO) that
 * will fan out via the listener notifier when fresher data arrives.
 */
export async function listFolders() {
  const local = await readAll();
  // Background server pull — doesn't block the local read.
  (async () => {
    try {
      const sync = getSyncHelpers();
      const myId = await getMyUserId();
      if (!sync?.pullFolders || !myId) return;
      const remote = await sync.pullFolders(myId);
      if (!Array.isArray(remote)) return;
      // Server columns: { id, name, emoji, position }. Merge with
      // local chatIds so server is the source of truth for the list
      // identity but local keeps the membership map.
      const localById = new Map(local.map(f => [f.id, f]));
      const merged = remote.map(r => ({
        id:     r.id,
        name:   r.name,
        emoji:  r.emoji || '📁',
        chatIds: localById.get(r.id)?.chatIds || [],
      }));
      await writeAll(merged);
    } catch {}
  })();
  return local;
}

export async function createFolder({ name, emoji }) {
  if (!name?.trim()) return null;
  // Push to Supabase first when we have an auth session — that way
  // the inserted row carries the canonical id we'll persist locally
  // too. Falls back to a local-only id if offline / unauthenticated.
  let folder = null;
  try {
    const sync = getSyncHelpers();
    const myId = await getMyUserId();
    if (sync?.createFolder && myId) {
      const remote = await sync.createFolder(myId, { name: name.trim(), emoji: emoji || '📁' });
      if (remote?.id) {
        folder = { id: remote.id, name: remote.name, emoji: remote.emoji || '📁', chatIds: [] };
      }
    }
  } catch {}
  if (!folder) {
    folder = {
      id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      emoji: emoji || '📁',
      chatIds: [],
    };
  }
  const arr = await readAll();
  arr.push(folder);
  await writeAll(arr);
  return folder;
}

export async function updateFolder(folderId, patch) {
  const arr = await readAll();
  const idx = arr.findIndex(f => f.id === folderId);
  if (idx < 0) return null;
  arr[idx] = { ...arr[idx], ...patch };
  await writeAll(arr);
  // Mirror to Supabase. Only forward fields the server schema knows
  // about (name / emoji / position) — chatIds is local-only.
  try {
    const sync = getSyncHelpers();
    const myId = await getMyUserId();
    if (sync?.updateFolder && myId) {
      const serverPatch = {};
      if (patch.name  != null) serverPatch.name  = patch.name;
      if (patch.emoji != null) serverPatch.emoji = patch.emoji;
      if (patch.position != null) serverPatch.position = patch.position;
      if (Object.keys(serverPatch).length) {
        sync.updateFolder(myId, folderId, serverPatch).catch(() => {});
      }
    }
  } catch {}
  return arr[idx];
}

export async function deleteFolder(folderId) {
  const arr = await readAll();
  await writeAll(arr.filter(f => f.id !== folderId));
  try {
    const sync = getSyncHelpers();
    const myId = await getMyUserId();
    if (sync?.deleteFolder && myId) sync.deleteFolder(myId, folderId).catch(() => {});
  } catch {}
}

export async function addChatToFolder(folderId, chatId) {
  const arr = await readAll();
  const idx = arr.findIndex(f => f.id === folderId);
  if (idx < 0) return null;
  if (!arr[idx].chatIds.includes(chatId)) {
    arr[idx] = { ...arr[idx], chatIds: [...arr[idx].chatIds, chatId] };
    await writeAll(arr);
  }
  return arr[idx];
}

export async function removeChatFromFolder(folderId, chatId) {
  const arr = await readAll();
  const idx = arr.findIndex(f => f.id === folderId);
  if (idx < 0) return null;
  arr[idx] = { ...arr[idx], chatIds: arr[idx].chatIds.filter(c => c !== chatId) };
  await writeAll(arr);
  return arr[idx];
}
