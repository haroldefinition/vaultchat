import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Image, Alert, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ContactEditModal from '../components/ContactEditModal';
import { useTheme } from '../services/theme';
import { useUnread } from '../services/unreadBadge';
import { getMyHandle } from '../services/vaultHandle';
import { taptic, longPressFeedback } from '../services/haptics';

const CHATS_KEY = 'vaultchat_chats';

export default function ChatsScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const { clear: clearUnread } = useUnread();

  const [chats,        setChats]        = useState([]);
  const [search,       setSearch]       = useState('');
  const [myHandle,     setMyHandle]     = useState('');
  const [refreshing,   setRefreshing]   = useState(false);
  const [actionModal,  setActionModal]  = useState(false);
  const [editModalVis, setEditModalVis] = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [selected,     setSelected]     = useState(null);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      loadChats();
      clearUnread(); // clear badge when Chats tab is opened
    });
    getMyHandle().then(h => { if (h) setMyHandle(h); });
    return unsub;
  }, [navigation]);

  async function loadChats() {
    const saved = await AsyncStorage.getItem(CHATS_KEY);
    if (saved) setChats(JSON.parse(saved));
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadChats();
    setRefreshing(false);
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
    const updated = chats.map(c =>
      c.id === selected.id ? { ...c, archived: !c.archived } : c
    );
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
    .filter(c =>
      !search ||
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search)
    )
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const archived = chats.filter(c => c.archived);

  // ── Better empty state ────────────────────────────────────────
  const EmptyState = () => {
    if (search) return (
      <View style={s.empty}>
        <Text style={s.emptyIcon}>🔍</Text>
        <Text style={[s.emptyTitle, { color: tx }]}>No chats found</Text>
        <Text style={[s.emptySub, { color: sub }]}>No chats matching "{search}"</Text>
      </View>
    );
    return (
      <View style={s.empty}>
        <View style={[s.emptyIconWrap, { backgroundColor: accent + '18', borderColor: accent + '30' }]}>
          <Text style={{ fontSize: 48 }}>💬</Text>
        </View>
        <Text style={[s.emptyTitle, { color: tx }]}>No messages yet</Text>
        <Text style={[s.emptySub, { color: sub }]}>
          Start a private encrypted conversation with anyone in your contacts.
        </Text>
        <TouchableOpacity
          style={[s.emptyBtn, { backgroundColor: accent }]}
          onPress={() => { taptic(); navigation.navigate('NewMessage'); }}>
          <Text style={s.emptyBtnTx}>✏️  New Message</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.emptyBtnOutline, { borderColor: accent }]}
          onPress={() => { taptic(); navigation.navigate('Contacts'); }}>
          <Text style={[s.emptyBtnOutlineTx, { color: accent }]}>👤  Add a Contact</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: border }]}>
        <View>
          <Text style={[s.title, { color: accent }]}>Chats</Text>
          {myHandle ? <Text style={[s.handle, { color: '#5856d6' }]}>{myHandle}</Text> : null}
        </View>
        <TouchableOpacity
          style={[s.iconBtn, { backgroundColor: accent + '22', borderColor: accent + '55' }]}
          onPress={() => { taptic(); navigation.navigate('Contacts'); }}>
          <Text style={{ fontSize: 15 }}>👤</Text>
          <Text style={[s.iconBtnPlus, { color: accent }]}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.iconBtn, { backgroundColor: accent + '22', borderColor: accent + '55' }]}
          onPress={() => { taptic(); navigation.navigate('NewMessage'); }}>
          <Text style={{ fontSize: 18 }}>✏️</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={[s.searchBar, { backgroundColor: inputBg, borderColor: border }]}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={[s.searchInput, { color: tx }]}
          placeholder="Search chats..."
          placeholderTextColor={sub}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={[s.clearBtn, { color: sub }]}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Chat list */}
      <FlatList
        data={visible}
        keyExtractor={(item, i) => item.id || i.toString()}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={accent}
            colors={[accent]}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.row, { borderBottomColor: border }, item.pinned && { backgroundColor: card }]}
            onPress={() => {
              taptic();
              navigation.navigate('ChatRoom', {
                roomId: item.roomId,
                recipientPhone: item.phone,
                recipientName: item.name,
                recipientPhoto: item.photo,
              });
            }}
            onLongPress={() => {
              longPressFeedback();
              setSelected(item);
              setActionModal(true);
            }}
            delayLongPress={400}>
            {/* Avatar */}
            <TouchableOpacity
              style={[s.avatar, { backgroundColor: accent }]}
              onPress={() => navigation.navigate('ContactView', {
                contact: { name: item.name, phone: item.phone, photo: item.photo, email: item.email || '', notes: item.notes || '' }
              })}>
              {item.photo
                ? <Image source={{ uri: item.photo }} style={s.avatarImg} />
                : <Text style={s.avatarText}>{(item.name || '?')[0].toUpperCase()}</Text>}
            </TouchableOpacity>
            {/* Info */}
            <View style={s.info}>
              <View style={s.nameRow}>
                {item.pinned && <Text style={s.pin}>📌</Text>}
                <Text style={[s.name, { color: tx }]}>{item.name || 'Unknown'}</Text>
              </View>
              {item.handle
                ? <Text style={[s.subHandle, { color: '#5856d6' }]}>{item.handle}</Text>
                : null}
              <Text style={[s.lastMsg, { color: sub }]} numberOfLines={1}>
                {item.lastMessage || 'Tap to chat'}
              </Text>
            </View>
            {/* Time + unread dot */}
            <View style={s.rightCol}>
              <Text style={[s.time, { color: sub }]}>{item.time || ''}</Text>
              {item.unread > 0 && (
                <View style={[s.unreadDot, { backgroundColor: accent }]}>
                  <Text style={s.unreadTx}>{item.unread > 99 ? '99+' : item.unread}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<EmptyState />}
        ListFooterComponent={
          archived.length > 0 ? (
            <TouchableOpacity
              style={[s.archivedRow, { borderTopColor: border }]}
              onPress={() => Alert.alert('Archived', archived.map(c => c.name || c.phone).join('\n'))}>
              <Text style={{ color: sub, fontSize: 14 }}>📦 Archived ({archived.length})</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {/* Long press action modal */}
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

      {/* Contact edit modal */}
      <ContactEditModal
        visible={editModalVis}
        contact={editTarget}
        onClose={() => { setEditModalVis(false); setEditTarget(null); }}
        onSave={async (updated) => {
          try {
            const raw = await AsyncStorage.getItem('vaultchat_chats');
            if (raw) {
              const parsed = JSON.parse(raw);
              const next = parsed.map(ch =>
                ch.roomId === updated.roomId ? { ...ch, ...updated } : ch
              );
              await AsyncStorage.setItem('vaultchat_chats', JSON.stringify(next));
              setChats(next);
            }
          } catch {}
          setEditModalVis(false);
          setEditTarget(null);
        }}
        colors={{ bg, card, tx, sub, border, inputBg, accent }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1 },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1 },
  title:            { fontSize: 24, fontWeight: 'bold' },
  handle:           { fontSize: 11, fontWeight: 'bold', marginTop: 2 },
  iconBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1, height: 36, paddingHorizontal: 10, borderRadius: 18, borderWidth: 1 },
  iconBtnPlus:      { fontSize: 13, fontWeight: '800', lineHeight: 16 },
  searchBar:        { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10 },
  searchIcon:       { fontSize: 14, marginRight: 6, opacity: 0.6 },
  searchInput:      { flex: 1, paddingVertical: 8, paddingHorizontal: 6, fontSize: 14 },
  clearBtn:         { fontSize: 16, paddingHorizontal: 8 },
  row:              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  avatar:           { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' },
  avatarImg:        { width: 52, height: 52, borderRadius: 26 },
  avatarText:       { color: '#fff', fontWeight: 'bold', fontSize: 20 },
  info:             { flex: 1 },
  nameRow:          { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  pin:              { fontSize: 12 },
  name:             { fontWeight: 'bold', fontSize: 15 },
  subHandle:        { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  lastMsg:          { fontSize: 13 },
  rightCol:         { alignItems: 'flex-end', gap: 4 },
  time:             { fontSize: 12 },
  unreadDot:        { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadTx:         { color: '#000', fontSize: 11, fontWeight: '900' },
  // Empty state
  empty:            { alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIconWrap:    { width: 96, height: 96, borderRadius: 48, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyIcon:        { fontSize: 48, marginBottom: 16 },
  emptyTitle:       { fontSize: 22, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  emptySub:         { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  emptyBtn:         { width: '100%', paddingVertical: 14, borderRadius: 24, alignItems: 'center', marginBottom: 12 },
  emptyBtnTx:       { color: '#000', fontWeight: '800', fontSize: 15 },
  emptyBtnOutline:  { width: '100%', paddingVertical: 14, borderRadius: 24, alignItems: 'center', borderWidth: 1.5 },
  emptyBtnOutlineTx:{ fontWeight: '700', fontSize: 15 },
  archivedRow:      { padding: 16, alignItems: 'center', borderTopWidth: 1 },
  overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  actionBox:        { width: '80%', borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  actionTitle:      { fontSize: 16, fontWeight: 'bold', padding: 16, textAlign: 'center' },
  actionBtn:        { padding: 16, borderBottomWidth: 1, alignItems: 'center' },
  actionText:       { fontSize: 16, fontWeight: '500' },
});
