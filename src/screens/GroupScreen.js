import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, ScrollView, Image } from 'react-native';
import { useTheme } from '../services/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

function generateGroupRoomId(groupName, timestamp) {
  const str = groupName + timestamp;
  let h1 = 0, h2 = 0;
  for (let i = 0; i < str.length; i++) {
    h1 = Math.imul(31, h1) + str.charCodeAt(i) | 0;
    h2 = Math.imul(37, h2) + str.charCodeAt(i) | 0;
  }
  const a = Math.abs(h1).toString(16).padStart(8, '0');
  const b = Math.abs(h2).toString(16).padStart(8, '0');
  return `${a}-${b.slice(0,4)}-4${b.slice(1,4)}-a${a.slice(0,3)}-${b}${a.slice(0,4)}`;
}

export default function GroupScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [groups, setGroups] = useState([]);
  const [modal, setModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [contacts, setContacts] = useState([]);
  const [actionModal, setActionModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    loadGroups();
    loadContacts();
  }, []);

  async function loadGroups() {
    const saved = await AsyncStorage.getItem('vaultchat_groups');
    if (saved) setGroups(JSON.parse(saved));
  }

  async function loadContacts() {
    const saved = await AsyncStorage.getItem('vaultchat_chats');
    if (saved) {
      const chats = JSON.parse(saved);
      setContacts(chats.map(c => ({ phone: c.phone, name: c.name || `+1${c.phone}`, photo: c.photo })));
    } else {
      setContacts([
        { phone: '6092330963', name: 'Jon', photo: null },
        { phone: '2675551234', name: 'Sarah', photo: null },
        { phone: '5551234567', name: 'Mike', photo: null },
      ]);
    }
  }

  async function createGroup() {
    if (!groupName.trim()) { Alert.alert('Error', 'Enter a group name'); return; }
    const timestamp = Date.now();
    const roomId = generateGroupRoomId(groupName.trim(), timestamp.toString());
    const newGroup = {
      id: roomId,
      name: groupName.trim(),
      desc: groupDesc.trim(),
      members: selectedMembers,
      memberCount: selectedMembers.length + 1,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      lastMessage: 'Group created · 🔒 Encrypted',
      createdAt: timestamp,
    };
    const updated = [newGroup, ...groups];
    setGroups(updated);
    await AsyncStorage.setItem('vaultchat_groups', JSON.stringify(updated));
    setGroupName(''); setGroupDesc(''); setSelectedMembers([]); setSearchText(''); setModal(false);
    navigation.navigate('GroupChat', { group: newGroup });
  }

  function toggleMember(contact) {
    setSelectedMembers(prev =>
      prev.find(m => m.phone === contact.phone)
        ? prev.filter(m => m.phone !== contact.phone)
        : [...prev, contact]
    );
  }

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchText.toLowerCase()) ||
    c.phone.includes(searchText)
  );

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <View style={[s.header, { borderBottomColor: border }]}>
        <Text style={[s.title, { color: accent }]}>Groups</Text>
        <TouchableOpacity style={[s.newBtn, { backgroundColor: accent }]} onPress={() => setModal(true)}>
          <Text style={s.newBtnText}>+ New Group</Text>
        </TouchableOpacity>
      </View>

      {groups.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>👥</Text>
          <Text style={[s.emptyText, { color: tx }]}>No groups yet</Text>
          <Text style={[s.emptySub, { color: sub }]}>Create a group to chat with multiple people</Text>
          <TouchableOpacity style={[s.createBtn, { backgroundColor: accent }]} onPress={() => setModal(true)}>
            <Text style={s.createBtnText}>Create Group</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={i => i.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={[s.groupItem, { borderBottomColor: border }]} onPress={() => Alert.alert(item.name, `${item.memberCount} member(s)\n${item.desc || ''}`)}>
              <View style={[s.avatar, { backgroundColor: accent }]}>
                <Text style={s.avatarText}>{item.name[0].toUpperCase()}</Text>
              </View>
              <View style={s.groupInfo}>
                <Text style={[s.groupName, { color: tx }]}>{item.name}</Text>
                <Text style={[s.groupSub, { color: sub }]}>👥 {item.memberCount} members · {item.lastMessage}</Text>
              </View>
              <Text style={[s.groupTime, { color: sub }]}>{item.time}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Create Group Modal */}
      <Modal visible={modal} animationType="slide">
        <View style={[{ flex: 1, backgroundColor: bg }]}>
          <View style={[s.modalBox, { backgroundColor: bg, flex: 1 }]}>
            {/* Modal Header */}
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => { setModal(false); setSelectedMembers([]); setGroupName(''); setGroupDesc(''); setSearchText(''); }}>
                <Text style={{ color: sub, fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[s.modalTitle, { color: tx }]}>New Group</Text>
              <TouchableOpacity onPress={createGroup}>
                <Text style={{ color: accent, fontWeight: 'bold', fontSize: 15 }}>Create</Text>
              </TouchableOpacity>
            </View>

            {/* Group avatar + name */}
            <View style={[s.avatarLarge, { backgroundColor: accent }]}>
              <Text style={s.avatarLargeText}>{groupName ? groupName[0].toUpperCase() : '👥'}</Text>
            </View>
            <TextInput style={[s.input, { backgroundColor: inputBg, color: tx }]} placeholder="Group name *" placeholderTextColor={sub} value={groupName} onChangeText={setGroupName} autoFocus />
            <TextInput style={[s.input, { backgroundColor: inputBg, color: tx }]} placeholder="Description (optional)" placeholderTextColor={sub} value={groupDesc} onChangeText={setGroupDesc} />

            {/* Selected members chips */}
            {selectedMembers.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsScroll}>
                {selectedMembers.map(m => (
                  <TouchableOpacity key={m.phone} style={[s.chip, { backgroundColor: accent }]} onPress={() => toggleMember(m)}>
                    <Text style={s.chipText}>{m.name} ✕</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Search contacts */}
            <Text style={[s.addMembersLabel, { color: sub }]}>ADD MEMBERS ({selectedMembers.length} selected)</Text>
            <TextInput style={[s.searchInput, { backgroundColor: inputBg, color: tx }]} placeholder="Search contacts..." placeholderTextColor={sub} value={searchText} onChangeText={setSearchText} />

            {/* Scrollable contact list */}
            <ScrollView style={s.contactList} showsVerticalScrollIndicator={false}>
              {filteredContacts.length === 0 ? (
                <Text style={[s.noContacts, { color: sub }]}>No contacts found. Start a chat first to add members.</Text>
              ) : (
                filteredContacts.map(contact => {
                  const isSelected = selectedMembers.find(m => m.phone === contact.phone);
                  return (
                    <TouchableOpacity key={contact.phone} style={[s.contactRow, { borderBottomColor: border }]} onPress={() => toggleMember(contact)}>
                      <View style={[s.contactAvatar, { backgroundColor: isSelected ? accent : inputBg }]}>
                        <Text style={[s.contactAvatarText, { color: isSelected ? '#fff' : tx }]}>{contact.name[0].toUpperCase()}</Text>
                      </View>
                      <View style={s.contactInfo}>
                        <Text style={[s.contactName, { color: tx }]}>{contact.name}</Text>
                        <Text style={[s.contactPhone, { color: sub }]}>+1{contact.phone}</Text>
                      </View>
                      <View style={[s.checkbox, { borderColor: accent, backgroundColor: isSelected ? accent : 'transparent' }]}>
                        {isSelected && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Long press action modal */}
      <Modal visible={actionModal} transparent animationType="fade">
        <TouchableOpacity style={sa.overlay} activeOpacity={1} onPress={() => setActionModal(false)}>
          <View style={[sa.box, { backgroundColor: card, borderColor: border }]}>
            <Text style={[sa.title, { color: tx }]}>{selectedGroup?.name}</Text>
            <TouchableOpacity style={[sa.btn, { borderBottomColor: border }]} onPress={async () => {
              const updated = groups.map(g => g.id === selectedGroup.id ? { ...g, pinned: !g.pinned } : g)
                .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
              setGroups(updated);
              await AsyncStorage.setItem('vaultchat_groups', JSON.stringify(updated));
              setActionModal(false);
            }}>
              <Text style={sa.btnText}>{selectedGroup?.pinned ? '📌 Unpin Group' : '📌 Pin Group'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sa.btn, { borderBottomColor: border }]} onPress={async () => {
              const updated = groups.map(g => g.id === selectedGroup.id ? { ...g, hideAlerts: !g.hideAlerts } : g);
              setGroups(updated);
              await AsyncStorage.setItem('vaultchat_groups', JSON.stringify(updated));
              setActionModal(false);
            }}>
              <Text style={sa.btnText}>{selectedGroup?.hideAlerts ? '🔔 Unmute Alerts' : '🔕 Hide Alerts'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sa.btn} onPress={() => {
              Alert.alert('Delete Group', `Delete "${selectedGroup?.name}"?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: async () => {
                  const updated = groups.filter(g => g.id !== selectedGroup.id);
                  setGroups(updated);
                  await AsyncStorage.setItem('vaultchat_groups', JSON.stringify(updated));
                  setActionModal(false);
                }},
              ]);
            }}>
              <Text style={[sa.btnText, { color: '#ff4444' }]}>🗑️ Delete Group</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const sa = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  box: { width: '80%', borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  title: { fontSize: 16, fontWeight: 'bold', padding: 16, textAlign: 'center' },
  btn: { padding: 16, borderBottomWidth: 1, alignItems: 'center' },
  btnText: { fontSize: 16, fontWeight: '500' },
});

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1 },
  title: { fontSize: 24, fontWeight: 'bold' },
  newBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  newBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyText: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', marginBottom: 24 },
  createBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
  createBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  groupItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, gap: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 16, fontWeight: 'bold', marginBottom: 3 },
  groupSub: { fontSize: 13 },
  groupTime: { fontSize: 12 },
  overlay: { flex: 1 },
  modalBox: { flex: 1, padding: 20, paddingTop: 56, paddingBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: 'bold' },
  avatarLarge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  avatarLargeText: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  input: { borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 10 },
  chipsScroll: { marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8 },
  chipText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  addMembersLabel: { fontSize: 11, fontWeight: 'bold', letterSpacing: 1, marginBottom: 8 },
  searchInput: { borderRadius: 12, padding: 12, fontSize: 15, marginBottom: 8 },
  contactList: { flex: 1 },
  noContacts: { textAlign: 'center', padding: 20, fontSize: 13 },
  contactRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, gap: 12 },
  contactAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  contactAvatarText: { fontWeight: 'bold', fontSize: 16 },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: 'bold' },
  contactPhone: { fontSize: 12, marginTop: 2 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
