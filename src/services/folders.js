// ============================================================
//  VaultChat — Chat Folders (premium feature, task #82)
//  src/services/folders.js
//
//  AsyncStorage-backed folders for organizing chats. Each folder
//  is { id, name, emoji, chatIds[] }. Powers a Telegram-style
//  pill row above the chat list and a Manage Folders screen.
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

export async function listFolders() {
  return readAll();
}

export async function createFolder({ name, emoji }) {
  if (!name?.trim()) return null;
  const folder = {
    id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim(),
    emoji: emoji || '📁',
    chatIds: [],
  };
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
  return arr[idx];
}

export async function deleteFolder(folderId) {
  const arr = await readAll();
  await writeAll(arr.filter(f => f.id !== folderId));
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
