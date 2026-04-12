import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, ScrollView, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import { getCachedContacts } from '../services/contacts';

const GROUPS_KEY = 'vaultchat_groups';
const BACKEND = 'https://vaultchat-production-3a96.up.railway.app';

function makeRoomId(name, ts) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = Math.imul(31, h) + name.charCodeAt(i) | 0;
  return `grp-${Math.abs(h).toString(16)}-${ts}`;
}

export default function GroupScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [groups, setGroups] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [createModal, setCreateModal] = useState(false);
  const [actionModal, setActionModal] = useState(false);
  const [membersModal, setMembersModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [picked, setPicked] = useState([]);
  const [contactSearch, setContactSearch] = useState('');

  useEffect(() => {
    const unsub = navigation.addListener('focus', loadGroups);
    loadContacts();
    return unsub;
  }, [navigation]);

  async function loadGroups() {
    const s = await AsyncStorage.getItem(GROUPS_KEY);
    if (s) setGroups(JSON.parse(s));
  }

  async function loadContacts() {
    const s = await AsyncStorage.getItem('vaultchat_chats');
    const app = s ? JSON.parse(s).map(c => ({ ...c, onApp: true })) : [];
    const ph = await getCachedContacts();
    setContacts([...app, ...ph.filter(p => !app.find(a => a.phone === p.phone)).map(p => ({ ...p, onApp: false }))]);
  }

  async function save(updated) {
    setGroups(updated);
    await AsyncStorage.setItem(GROUPS_KEY, JSON.stringify(updated));
  }

  async function createGroup() {
    if (!groupName.trim()) { Alert.alert('Error', 'Enter a group name'); return; }
    const ts = Date.now();
    const group = {
      id: makeRoomId(groupName.trim(), ts),
      name: groupName.trim(),
      desc: groupDesc.trim(),
      members: picked,
      memberCount: picked.length + 1,
      createdAt: ts,
      pinned: false,
      archived: false,
      lastMessage: '🔒 Group created',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // Send SMS invite to non-app members
    const nonApp = picked.filter(m => !m.onApp);
    for (const m of nonApp) {
      try {
        await fetch(`${BACKEND}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_id: '550e8400-e29b-41d4-a716-446655440000',
            sender_id: 'system',
            content: `You've been invited to join "${group.name}" on VaultChat! Download the app to join.`,
          }),
        });
      } catch (e) {}
    }

    const updated = [group, ...groups];
    await save(updated);
    setGroupName(''); setGroupDesc(''); setPicked([]); setContactSearch('');
    setCreateModal(false);
    navigation.navigate('GroupChat', { group });
  }

  async function pinGroup() {
    const updated = groups
      .map(g => g.id === selected.id ? { ...g, pinned: !g.pinned } : g)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    await save(updated);
    setActionModal(false);
  }

  async function archiveGroup() {
    const updated = groups.map(g => g.id === selected.id ? { ...g, archived: !g.archived } : g);
    await save(updated);
    setActionModal(false);
  }

  async function deleteGroup() {
    Alert.alert('Delete Group', `Delete "${selected?.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await save(groups.filter(g => g.id !== selected.id));
        setActionModal(false);
      }},
    ]);
  }

  async function addMember(contact) {
    if (!selected) return;
    const already = selected.members?.find(m => m.phone === contact.phone);
    if (already) { Alert.alert('Already added', `${contact.name} is already in this group`); return; }
    if (!contact.onApp) {
      Alert.alert('Not on VaultChat', `${contact.name} hasn't installed the app. Send them an invite?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send Invite', onPress: async () => {
          try {
            await fetch(`${BACKEND}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ room_id: '550e8400-e29b-41d4-a716-446655440000', sender_id: 'system', content: `Join "${selected.name}" on VaultChat!` }),
            });
          } catch (e) {}
          Alert.alert('Invite Sent', `${contact.name} was invited to download VaultChat.`);
        }},
      ]);
      return;
    }
    const updatedMembers = [...(selected.members || []), contact];
    const updatedGroup = { ...selected, members: updatedMembers, memberCount: updatedMembers.length + 1 };
    const updated = groups.map(g => g.id === selected.id ? updatedGroup : g);
    await save(updated);
    setSelected(updatedGroup);
    Alert.alert('Added ✓', `${contact.name} added to ${selected.name}`);
  }

  async function removeMember(member) {
    Alert.alert('Remove Member', `Remove ${member.name} from "${selected?.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const updatedMembers = selected.members.filter(m => m.phone !== member.phone);
        const updatedGroup = { ...selected, members: updatedMembers, memberCount: updatedMembers.length + 1 };
        const updated = groups.map(g => g.id === selected.id ? updatedGroup : g);
        await save(updated);
        setSelected(updatedGroup);
      }},
    ]);
  }

  const visible = groups
    .filter(g => !g.archived)
    .filter(g => !search || g.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const filteredContacts = contacts.filter(c =>
    !contactSearch ||
    c.name?.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.phone?.includes(contactSearch) ||
    c.handle?.toLowerCase().includes(contactSearch.toLowerCase())
  );

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: border }]}>
        <Text style={[s.title, { color: accent }]}>Groups</Text>
        <TouchableOpacity style={[s.newBtn, { backgroundColor: accent }]} onPress={() => setCreateModal(true)}>
          <Text style={s.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[s.searchBar, { backgroundColor: inputBg, borderColor: border }]}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={[s.searchInput, { color: tx }]}
          placeholder="Search groups..."
          placeholderTextColor={sub}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={[{ color: sub, fontSize: 16, paddingHorizontal: 8 }]}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Group List */}
      <FlatList
        data={visible}
        keyExtractor={(item, i) => item.id || i.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.row, { borderBottomColor: border }, item.pinned && { backgroundColor: card }]}
            onPress={() => navigation.navigate('GroupChat', { group: item })}
            onLongPress={() => { setSelected(item); setActionModal(true); }}
            delayLongPress={400}
          >
            <View style={[s.avatar, { backgroundColor: accent }]}>
              <Text style={s.avatarText}>{item.name[0]?.toUpperCase()}</Text>
            </View>
            <View style={s.info}>
              <View style={s.nameRow}>
                {item.pinned && <Text style={{ fontSize: 12 }}>📌</Text>}
                <Text style={[s.name, { color: tx }]}>{item.name}</Text>
              </View>
              <Text style={[s.sub2, { color: sub }]}>👥 {item.memberCount || 1} members · {item.lastMessage}</Text>
            </View>
            <Text style={[s.time, { color: sub }]}>{item.time}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>👥</Text>
            <Text style={[s.emptyTitle, { color: tx }]}>No groups yet</Text>
            <Text style={[s.emptySub, { color: sub }]}>Tap + New to create a group</Text>
            <TouchableOpacity style={[s.createBtn, { backgroundColor: accent }]} onPress={() => setCreateModal(true)}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Create Group</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Long Press Actions */}
      <Modal visible={actionModal} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setActionModal(false)}>
          <View style={[s.actionBox, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.actionTitle, { color: tx }]}>{selected?.name}</Text>
            <TouchableOpacity style={[s.actionBtn, { borderBottomColor: border }]} onPress={pinGroup}>
              <Text style={[s.actionText, { color: tx }]}>{selected?.pinned ? '📌 Unpin' : '📌 Pin Group'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, { borderBottomColor: border }]} onPress={() => { setActionModal(false); setMembersModal(true); }}>
              <Text style={[s.actionText, { color: tx }]}>👥 Manage Members</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, { borderBottomColor: border }]} onPress={archiveGroup}>
              <Text style={[s.actionText, { color: tx }]}>{selected?.archived ? '📥 Unarchive' : '📦 Archive'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={deleteGroup}>
              <Text style={[s.actionText, { color: '#ff4444' }]}>🗑️ Delete Group</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Members Management Modal */}
      <Modal visible={membersModal} animationType="slide">
        <View style={[{ flex: 1, backgroundColor: bg }]}>
          <View style={[s.modalHeader, { backgroundColor: card, borderBottomColor: border }]}>
            <TouchableOpacity onPress={() => setMembersModal(false)}>
              <Text style={{ color: accent, fontSize: 16 }}>‹ Back</Text>
            </TouchableOpacity>
            <Text style={[s.modalTitle, { color: tx }]}>Members — {selected?.name}</Text>
            <View style={{ width: 60 }} />
          </View>

          <TextInput
            style={[s.memberSearch, { backgroundColor: inputBg, color: tx, borderColor: border }]}
            placeholder="Search to add members..."
            placeholderTextColor={sub}
            value={contactSearch}
            onChangeText={setContactSearch}
            autoCapitalize="none"
          />

          {/* Current members */}
          {selected?.members?.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { color: sub }]}>CURRENT MEMBERS</Text>
              {selected.members.map((m, i) => (
                <View key={i} style={[s.memberRow, { borderBottomColor: border, backgroundColor: card }]}>
                  <View style={[s.memberAvatar, { backgroundColor: '#5856d6' }]}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>{m.name?.[0]?.toUpperCase() || '?'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: tx, fontWeight: 'bold', fontSize: 15 }]}>{m.name || m.phone}</Text>
                    {m.handle ? <Text style={[{ color: '#5856d6', fontSize: 12 }]}>{m.handle}</Text> : null}
                  </View>
                  <TouchableOpacity style={[s.removeBtn]} onPress={() => removeMember(m)}>
                    <Text style={{ color: '#ff4444', fontWeight: 'bold', fontSize: 13 }}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {/* Add from contacts */}
          <Text style={[s.sectionLabel, { color: sub }]}>ADD MEMBERS</Text>
          <ScrollView style={{ flex: 1 }}>
            {filteredContacts
              .filter(c => !selected?.members?.find(m => m.phone === c.phone))
              .map((c, i) => (
                <TouchableOpacity key={i} style={[s.memberRow, { borderBottomColor: border, backgroundColor: card }]} onPress={() => addMember(c)}>
                  <View style={[s.memberAvatar, { backgroundColor: c.onApp ? accent : '#888' }]}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>{c.name?.[0]?.toUpperCase() || '?'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: tx, fontWeight: 'bold', fontSize: 15 }]}>{c.name || c.phone}</Text>
                    <Text style={[{ color: c.onApp ? '#00ffa3' : sub, fontSize: 11 }]}>{c.onApp ? '🔒 On VaultChat' : '📱 Not installed'}</Text>
                  </View>
                  <View style={[s.addMemberBtn, { backgroundColor: c.onApp ? accent : '#5856d6' }]}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>{c.onApp ? 'Add' : 'Invite'}</Text>
                  </View>
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Create Group Modal */}
      <Modal visible={createModal} animationType="slide">
        <View style={[{ flex: 1, backgroundColor: bg }]}>
          <View style={[s.modalHeader, { backgroundColor: card, borderBottomColor: border }]}>
            <TouchableOpacity onPress={() => { setCreateModal(false); setGroupName(''); setGroupDesc(''); setPicked([]); setContactSearch(''); }}>
              <Text style={{ color: sub, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[s.modalTitle, { color: tx }]}>New Group</Text>
            <TouchableOpacity onPress={createGroup}>
              <Text style={{ color: groupName.trim() ? accent : sub, fontWeight: 'bold', fontSize: 15 }}>Create</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
            <View style={[s.groupAvatarLarge, { backgroundColor: accent }]}>
              <Text style={s.groupAvatarText}>{groupName ? groupName[0].toUpperCase() : '👥'}</Text>
            </View>

            <TextInput
              style={[s.textField, { backgroundColor: card, color: tx, borderColor: border }]}
              placeholder="Group name *"
              placeholderTextColor={sub}
              value={groupName}
              onChangeText={setGroupName}
              autoFocus
            />
            <TextInput
              style={[s.textField, { backgroundColor: card, color: tx, borderColor: border }]}
              placeholder="Description (optional)"
              placeholderTextColor={sub}
              value={groupDesc}
              onChangeText={setGroupDesc}
            />

            {/* Selected members chips */}
            {picked.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {picked.map((m, i) => (
                  <TouchableOpacity key={i} style={[s.chip, { backgroundColor: accent }]} onPress={() => setPicked(picked.filter(x => x.phone !== m.phone))}>
                    <Text style={s.chipText}>{m.name || m.phone} ✕</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <Text style={[s.sectionLabel, { color: sub }]}>ADD MEMBERS ({picked.length} selected)</Text>
            <TextInput
              style={[s.textField, { backgroundColor: card, color: tx, borderColor: border }]}
              placeholder="Search name, @handle or phone..."
              placeholderTextColor={sub}
              value={contactSearch}
              onChangeText={setContactSearch}
              autoCapitalize="none"
            />

            {filteredContacts.length === 0
              ? <Text style={[{ color: sub, textAlign: 'center', padding: 20 }]}>No contacts. Go to Settings → Sync Contacts first.</Text>
              : filteredContacts.map(c => {
                const isPicked = picked.find(m => m.phone === c.phone);
                return (
                  <TouchableOpacity key={c.phone} style={[s.contactRow, { borderBottomColor: border, backgroundColor: card }]} onPress={() => {
                    if (isPicked) { setPicked(picked.filter(m => m.phone !== c.phone)); }
                    else { setPicked([...picked, c]); }
                  }}>
                    <View style={[s.memberAvatar, { backgroundColor: isPicked ? accent : c.onApp ? '#5856d6' : '#888' }]}>
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>{c.name?.[0]?.toUpperCase() || '?'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[{ color: tx, fontWeight: 'bold', fontSize: 15 }]}>{c.name || c.phone}</Text>
                      {c.handle ? <Text style={[{ color: '#5856d6', fontSize: 12 }]}>{c.handle}</Text> : <Text style={[{ color: sub, fontSize: 12 }]}>+1{c.phone}</Text>}
                      <Text style={[{ fontSize: 10, color: c.onApp ? '#00ffa3' : sub }]}>{c.onApp ? '🔒 On VaultChat' : '📱 Will receive invite'}</Text>
                    </View>
                    <View style={[s.checkbox, { borderColor: accent, backgroundColor: isPicked ? accent : 'transparent' }]}>
                      {isPicked && <Text style={{ color: '#fff', fontSize: 14 }}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 24, fontWeight: 'bold' },
  newBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  newBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14 },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, padding: 10, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 20 },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  name: { fontWeight: 'bold', fontSize: 15 },
  sub2: { fontSize: 13 },
  time: { fontSize: 12 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold' },
  emptySub: { fontSize: 14, textAlign: 'center' },
  createBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20, marginTop: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  actionBox: { width: '80%', borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  actionTitle: { fontSize: 16, fontWeight: 'bold', padding: 16, textAlign: 'center' },
  actionBtn: { padding: 16, borderBottomWidth: 1, alignItems: 'center' },
  actionText: { fontSize: 16, fontWeight: '500' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: 'bold' },
  memberSearch: { margin: 16, borderRadius: 14, borderWidth: 1, padding: 12, fontSize: 15 },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', letterSpacing: 1, paddingHorizontal: 20, paddingVertical: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 12 },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#ff4444' },
  addMemberBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  groupAvatarLarge: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 20 },
  groupAvatarText: { color: '#fff', fontSize: 32, fontWeight: 'bold' },
  textField: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8 },
  chipText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  contactRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 12, borderRadius: 12, marginBottom: 4 },
  checkbox: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
