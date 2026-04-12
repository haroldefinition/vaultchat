import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Image, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import { getMyHandle } from '../services/vaultHandle';

const CHATS_KEY = 'vaultchat_chats';

export default function ChatsScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [chats, setChats] = useState([]);
  const [search, setSearch] = useState('');
  const [myHandle, setMyHandle] = useState('');
  const [actionModal, setActionModal] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const unsub = navigation.addListener('focus', loadChats);
    getMyHandle().then(h => { if (h) setMyHandle(h); });
    return unsub;
  }, [navigation]);

  async function loadChats() {
    const saved = await AsyncStorage.getItem(CHATS_KEY);
    if (saved) setChats(JSON.parse(saved));
  }

  async function saveChats(updated) {
    setChats(updated);
    await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(updated));
  }

  async function pinChat() {
    const updated = chats
      .map(c => c.id === selected.id ? { ...c, pinned: !c.pinned } : c)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    await saveChats(updated);
    setActionModal(false);
  }

  async function archiveChat() {
    const updated = chats.map(c => c.id === selected.id ? { ...c, archived: !c.archived } : c);
    await saveChats(updated);
    setActionModal(false);
  }

  async function deleteChat() {
    Alert.alert('Delete Chat', `Delete chat with ${selected.name || 'this contact'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await saveChats(chats.filter(c => c.id !== selected.id));
        setActionModal(false);
      }},
    ]);
  }

  const visible = chats
    .filter(c => !c.archived)
    .filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const archived = chats.filter(c => c.archived);

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: border }]}>
        <View>
          <Text style={[s.title, { color: accent }]}>Chats</Text>
          {myHandle ? <Text style={[s.handle, { color: '#5856d6' }]}>{myHandle}</Text> : null}
        </View>
        <TouchableOpacity style={[s.addBtn, { backgroundColor: accent }]} onPress={() => navigation.navigate('NewMessage')}>
          <Text style={s.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar — always visible */}
      <View style={[s.searchBar, { backgroundColor: inputBg, borderColor: border }]}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={[s.searchInput, { color: tx }]}
          placeholder="Search chats..."
          placeholderTextColor={sub}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={[s.clearBtn, { color: sub }]}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Chat List */}
      <FlatList
        data={visible}
        keyExtractor={(item, i) => item.id || i.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.row, { borderBottomColor: border }, item.pinned && { backgroundColor: card }]}
            onPress={() => navigation.navigate('ChatRoom', {
              roomId: item.roomId,
              recipientPhone: item.phone,
              recipientName: item.name,
              recipientPhoto: item.photo,
            })}
            onLongPress={() => { setSelected(item); setActionModal(true); }}
            delayLongPress={400}
          >
            <View style={[s.avatar, { backgroundColor: accent }]}>
              {item.photo
                ? <Image source={{ uri: item.photo }} style={s.avatarImg} />
                : <Text style={s.avatarText}>{(item.name || '?')[0].toUpperCase()}</Text>}
            </View>
            <View style={s.info}>
              <View style={s.nameRow}>
                {item.pinned && <Text style={s.pin}>📌</Text>}
                <Text style={[s.name, { color: tx }]}>{item.name || 'Unknown'}</Text>
              </View>
              {item.handle ? <Text style={[s.subHandle, { color: '#5856d6' }]}>{item.handle}</Text> : null}
              <Text style={[s.lastMsg, { color: sub }]} numberOfLines={1}>{item.lastMessage || 'Tap to chat'}</Text>
            </View>
            <Text style={[s.time, { color: sub }]}>{item.time || ''}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🔒</Text>
            <Text style={[s.emptyTitle, { color: tx }]}>No chats yet</Text>
            <Text style={[s.emptySub, { color: sub }]}>Tap + to start a secure chat</Text>
          </View>
        }
        ListFooterComponent={
          archived.length > 0 ? (
            <TouchableOpacity style={[s.archivedRow, { borderTopColor: border }]}
              onPress={() => Alert.alert('Archived', archived.map(c => c.name || c.phone).join('\n'))}>
              <Text style={[{ color: sub, fontSize: 14 }]}>📦 Archived ({archived.length})</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {/* Long Press Modal */}
      <Modal visible={actionModal} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setActionModal(false)}>
          <View style={[s.actionBox, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.actionTitle, { color: tx }]}>{selected?.name || 'Chat'}</Text>
            <TouchableOpacity style={[s.actionBtn, { borderBottomColor: border }]} onPress={pinChat}>
              <Text style={[s.actionText, { color: tx }]}>{selected?.pinned ? '📌 Unpin' : '📌 Pin Chat'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, { borderBottomColor: border }]} onPress={archiveChat}>
              <Text style={[s.actionText, { color: tx }]}>{selected?.archived ? '📥 Unarchive' : '📦 Archive'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={deleteChat}>
              <Text style={[s.actionText, { color: '#ff4444' }]}>🗑️ Delete Chat</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 24, fontWeight: 'bold' },
  handle: { fontSize: 11, fontWeight: 'bold', marginTop: 2 },
  addBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#fff', fontSize: 26, fontWeight: '300', lineHeight: 30 },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14 },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, padding: 10, fontSize: 15 },
  clearBtn: { fontSize: 16, paddingHorizontal: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 20 },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  pin: { fontSize: 12 },
  name: { fontWeight: 'bold', fontSize: 15 },
  subHandle: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  lastMsg: { fontSize: 13 },
  time: { fontSize: 12 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center' },
  archivedRow: { padding: 16, alignItems: 'center', borderTopWidth: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  actionBox: { width: '80%', borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  actionTitle: { fontSize: 16, fontWeight: 'bold', padding: 16, textAlign: 'center' },
  actionBtn: { padding: 16, borderBottomWidth: 1, alignItems: 'center' },
  actionText: { fontSize: 16, fontWeight: '500' },
});
