// ============================================================
//  VaultChat — Manage Chat Folders (premium feature, task #82)
//  src/screens/FoldersScreen.js
//
//  Two modes within one screen:
//
//   1. List mode  — shows existing folders + a Create button.
//                   Tap a folder to enter Edit mode.
//   2. Edit mode  — name + emoji at top, then a checklist of
//                   every chat: tap to toggle membership in
//                   this folder. Save persists, Delete removes
//                   the folder entirely.
//
//  This entire screen is gated by isPremiumUser at the entry
//  point (ChatsScreen header), so by the time the user lands
//  here they're already premium. We don't re-check inside.
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import {
  listFolders, createFolder, updateFolder, deleteFolder,
  addChatToFolder, removeChatFromFolder, subscribe as subscribeFolders,
} from '../services/folders';

const EMOJIS = ['📁', '⭐', '👨‍👩‍👧', '💼', '🎓', '🎮', '🛒', '🏝️', '❤️', '🚀', '🎉', '🔒'];
const CHATS_KEY = 'vaultchat_chats';

export default function FoldersScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [folders, setFolders] = useState([]);
  const [chats,   setChats]   = useState([]);
  const [editing, setEditing] = useState(null); // folder being edited, or null for list mode
  const [name,    setName]    = useState('');
  const [emoji,   setEmoji]   = useState('📁');
  const [memberIds, setMemberIds] = useState(new Set());

  useEffect(() => {
    refresh();
    const unsub = subscribeFolders(refresh);
    return () => unsub();
  }, []);

  async function refresh() {
    const [fs, raw] = await Promise.all([
      listFolders(),
      AsyncStorage.getItem(CHATS_KEY),
    ]);
    setFolders(fs);
    try { setChats(raw ? JSON.parse(raw) : []); } catch { setChats([]); }
  }

  function startCreate() {
    setEditing({ id: null, name: '', emoji: '📁', chatIds: [] });
    setName('');
    setEmoji('📁');
    setMemberIds(new Set());
  }

  function startEdit(folder) {
    setEditing(folder);
    setName(folder.name);
    setEmoji(folder.emoji || '📁');
    setMemberIds(new Set(folder.chatIds || []));
  }

  async function save() {
    if (!name.trim()) { Alert.alert('Name required', 'Folders need a name.'); return; }
    if (editing.id) {
      // Update existing — patch name + emoji, then reconcile chat membership
      await updateFolder(editing.id, { name: name.trim(), emoji });
      const old = new Set(editing.chatIds || []);
      const next = memberIds;
      // Remove chats that were unchecked
      for (const id of old) if (!next.has(id)) await removeChatFromFolder(editing.id, id);
      // Add chats that were newly checked
      for (const id of next) if (!old.has(id)) await addChatToFolder(editing.id, id);
    } else {
      // Create new folder + add initial members
      const created = await createFolder({ name: name.trim(), emoji });
      if (created) {
        for (const id of memberIds) await addChatToFolder(created.id, id);
      }
    }
    setEditing(null);
    refresh();
  }

  async function confirmDelete() {
    if (!editing?.id) return;
    Alert.alert(
      'Delete folder?',
      `Remove "${editing.name}"? Chats inside it will stay in your main list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
            await deleteFolder(editing.id);
            setEditing(null);
            refresh();
        }},
      ],
    );
  }

  function toggleMember(chatId) {
    setMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  }

  // ── EDIT MODE ──────────────────────────────────────────────
  if (editing) {
    return (
      <View style={{ flex: 1, backgroundColor: bg }}>
        <View style={[s.navBar, { backgroundColor: card, borderBottomColor: border }]}>
          <TouchableOpacity onPress={() => setEditing(null)} style={{ width: 60 }}>
            <Text style={{ color: accent, fontSize: 16 }}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={[s.navTitle, { color: tx }]}>{editing.id ? 'Edit Folder' : 'New Folder'}</Text>
          <TouchableOpacity onPress={save} style={{ width: 60, alignItems: 'flex-end' }}>
            <Text style={{ color: accent, fontWeight: '700', fontSize: 16 }}>Save</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
          {/* Name + emoji picker */}
          <View style={[s.field, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.fieldLabel, { color: sub }]}>FOLDER NAME</Text>
            <TextInput
              style={[s.input, { color: tx, backgroundColor: inputBg, borderColor: border }]}
              value={name}
              onChangeText={setName}
              placeholder="Family, Work, Best Friends..."
              placeholderTextColor={sub}
              autoCapitalize="words"
              maxLength={32}
            />
          </View>
          <View style={[s.field, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.fieldLabel, { color: sub }]}>ICON</Text>
            <View style={s.emojiRow}>
              {EMOJIS.map(e => (
                <TouchableOpacity
                  key={e}
                  onPress={() => setEmoji(e)}
                  style={[
                    s.emojiPill,
                    { backgroundColor: inputBg, borderColor: emoji === e ? accent : border },
                    emoji === e && { borderWidth: 2 },
                  ]}>
                  <Text style={{ fontSize: 22 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Chat checklist */}
          <View style={[s.field, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.fieldLabel, { color: sub }]}>
              CHATS IN THIS FOLDER ({memberIds.size})
            </Text>
            {chats.length === 0 ? (
              <Text style={{ color: sub, fontSize: 13, paddingVertical: 14, textAlign: 'center' }}>
                No chats yet. Start a conversation first, then come back to organize it.
              </Text>
            ) : chats.map(chat => {
              const id = chat.id || chat.roomId || chat.handle || JSON.stringify(chat).slice(0, 50);
              const checked = memberIds.has(id);
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => toggleMember(id)}
                  style={[s.chatRow, { borderBottomColor: border }]}>
                  <View style={[s.avatar, { backgroundColor: accent }]}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {(chat.name || chat.handle || '?')[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[s.chatName, { color: tx }]} numberOfLines={1}>
                    {chat.name || chat.handle || 'Chat'}
                  </Text>
                  <View style={[
                    s.checkbox,
                    { borderColor: checked ? accent : border, backgroundColor: checked ? accent : 'transparent' },
                  ]}>
                    {checked ? <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>✓</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {editing.id && (
            <TouchableOpacity onPress={confirmDelete} style={[s.deleteBtn, { borderColor: '#ff3b30' }]}>
              <Text style={{ color: '#ff3b30', fontWeight: '700', fontSize: 15 }}>Delete Folder</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── LIST MODE ──────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <View style={[s.navBar, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 60 }}>
          <Text style={{ color: accent, fontSize: 16 }}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[s.navTitle, { color: tx }]}>Folders</Text>
        <TouchableOpacity onPress={startCreate} style={{ width: 60, alignItems: 'flex-end' }}>
          <Text style={{ color: accent, fontWeight: '700', fontSize: 16 }}>+ New</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {folders.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 56, marginBottom: 12 }}>📁</Text>
            <Text style={[s.emptyTitle, { color: tx }]}>No folders yet</Text>
            <Text style={[s.emptySub, { color: sub }]}>
              Create folders like Family, Work, or Best Friends to organize your chats. Tap "+ New" up top to start.
            </Text>
          </View>
        ) : folders.map(f => (
          <TouchableOpacity
            key={f.id}
            onPress={() => startEdit(f)}
            style={[s.folderCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={{ fontSize: 26 }}>{f.emoji || '📁'}</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={[s.folderName, { color: tx }]}>{f.name}</Text>
              <Text style={[s.folderSub, { color: sub }]}>
                {f.chatIds.length} {f.chatIds.length === 1 ? 'chat' : 'chats'}
              </Text>
            </View>
            <Text style={{ color: sub, fontSize: 18 }}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  navBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  navTitle:  { fontSize: 17, fontWeight: '700' },
  field:     { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12 },
  fieldLabel:{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  input:     { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  emojiRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiPill: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  chatRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chatName:  { flex: 1, fontSize: 15, fontWeight: '500' },
  checkbox:  { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { marginTop: 24, padding: 16, borderRadius: 14, borderWidth: 1.5, alignItems: 'center' },
  folderCard:{ flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 10 },
  folderName:{ fontSize: 16, fontWeight: '600' },
  folderSub: { fontSize: 12, marginTop: 2 },
  empty:     { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle:{ fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub:  { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
