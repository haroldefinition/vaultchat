import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, Modal, StyleSheet, Alert, StatusBar, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';

const STORAGE_KEY = 'vaultchat_groups';

function generateRoomId(name, ts) {
  let h1 = 0, h2 = 0;
  const str = name + ts;
  for (let i = 0; i < str.length; i++) {
    h1 = (Math.imul(31, h1) + str.charCodeAt(i)) | 0;
    h2 = (Math.imul(37, h2) + str.charCodeAt(i)) | 0;
  }
  const a = Math.abs(h1).toString(16).padStart(8, '0');
  const b = Math.abs(h2).toString(16).padStart(8, '0');
  return `${a}-${b.slice(0,4)}-4${b.slice(1,4)}-a${a.slice(0,3)}-${b}${a.slice(0,4)}`;
}

export default function GroupScreen({ navigation }) {
  const theme = useTheme();
  const { bg, card, tx, sub, border, inputBg, accent } = theme;
  const [groups, setGroups] = useState([]);
  const [createModal, setCreateModal] = useState(false);
  const [actionModal, setActionModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');

  useEffect(() => {
    loadGroups();
    const unsub = navigation.addListener('focus', loadGroups);
    return unsub;
  }, [navigation]);

  const loadGroups = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setGroups(JSON.parse(raw));
    } catch (e) { console.warn('loadGroups error:', e); }
  }, []);

  const saveGroups = async (updated) => {
    setGroups(updated);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); }
    catch (e) { console.warn('saveGroups error:', e); }
  };

  const handleCreate = async () => {
    const name = groupName.trim();
    if (!name) { Alert.alert('Error', 'Please enter a group name.'); return; }
    const ts = Date.now().toString();
    const id = generateRoomId(name, ts);
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newGroup = { id, name, desc: groupDesc.trim(), memberCount: 1, lastMessage: 'Group created', time, pinned: false, hideAlerts: false, createdAt: Date.now() };
    const updated = [newGroup, ...groups];
    await saveGroups(updated);
    setGroupName(''); setGroupDesc(''); setCreateModal(false);
    navigation.navigate('GroupChat', { groupId: id, groupName: name });
  };

  const openActionMenu = (group) => { setSelectedGroup(group); setActionModal(true); };

  const handlePin = async () => {
    const updated = groups.map(g => g.id === selectedGroup.id ? { ...g, pinned: !g.pinned } : g);
    updated.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    await saveGroups(updated);
    setActionModal(false);
    Alert.alert(selectedGroup.pinned ? 'Unpinned' : 'Pinned', `"${selectedGroup.name}" has been ${selectedGroup.pinned ? 'unpinned' : 'pinned'}.`);
  };

  const handleHideAlerts = async () => {
    const updated = groups.map(g => g.id === selectedGroup.id ? { ...g, hideAlerts: !g.hideAlerts } : g);
    await saveGroups(updated);
    setActionModal(false);
    Alert.alert(selectedGroup.hideAlerts ? 'Alerts On' : 'Alerts Off', `Notifications for "${selectedGroup.name}" are now ${selectedGroup.hideAlerts ? 'enabled' : 'muted'}.`);
  };

  const handleDelete = () => {
    Alert.alert('Delete Group', `Delete "${selectedGroup.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel', onPress: () => setActionModal(false) },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const updated = groups.filter(g => g.id !== selectedGroup.id);
        await saveGroups(updated);
        setActionModal(false);
      }},
    ]);
  };

  const renderGroup = ({ item }) => (
    <TouchableOpacity
      style={[s.row, { backgroundColor: card, borderBottomColor: border }]}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('GroupChat', { groupId: item.id, groupName: item.name })}
      onLongPress={() => openActionMenu(item)}
      delayLongPress={400}
    >
      <View style={[s.avatar, { backgroundColor: accent + '22' }]}>
        <Text style={s.avatarEmoji}>👥</Text>
        {item.pinned && <View style={[s.pinBadge, { backgroundColor: accent }]}><Text style={s.pinText}>📌</Text></View>}
      </View>
      <View style={s.info}>
        <View style={s.topRow}>
          <Text style={[s.name, { color: tx }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[s.time, { color: sub }]}>{item.time || ''}</Text>
        </View>
        <View style={s.bottomRow}>
          <Text style={[s.preview, { color: sub }]} numberOfLines={1}>{item.hideAlerts ? '🔕 ' : '🔒 '}{item.lastMessage || 'Tap to open'}</Text>
          <Text style={[s.members, { color: sub }]}>{item.memberCount || 1} {(item.memberCount || 1) === 1 ? 'member' : 'members'}</Text>
        </View>
      </View>
      <Text style={[s.chevron, { color: sub }]}>›</Text>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={s.empty}>
      <Text style={s.emptyEmoji}>👥</Text>
      <Text style={[s.emptyTitle, { color: tx }]}>No groups yet</Text>
      <Text style={[s.emptySub, { color: sub }]}>Create a group to start an encrypted conversation.</Text>
      <TouchableOpacity style={[s.emptyBtn, { backgroundColor: accent }]} onPress={() => setCreateModal(true)}>
        <Text style={s.emptyBtnText}>+ Create Group</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={bg} />
      <View style={[s.header, { backgroundColor: bg, borderBottomColor: border }]}>
        <Text style={[s.headerTitle, { color: tx }]}>Groups</Text>
        <TouchableOpacity style={[s.newBtn, { backgroundColor: accent }]} onPress={() => setCreateModal(true)} activeOpacity={0.8}>
          <Text style={s.newBtnText}>+ New Group</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={groups}
        keyExtractor={item => item.id}
        renderItem={renderGroup}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={groups.length === 0 ? { flex: 1 } : { paddingBottom: 20 }}
        style={{ flex: 1 }}
      />

      <Modal visible={createModal} animationType="slide" transparent onRequestClose={() => setCreateModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <View style={[s.sheet, { backgroundColor: card }]}>
            <View style={[s.sheetHandle, { backgroundColor: border }]} />
            <Text style={[s.sheetTitle, { color: tx }]}>Create New Group</Text>
            <Text style={[s.sheetSub, { color: sub }]}>All group messages are end-to-end encrypted 🔒</Text>
            <TextInput style={[s.input, { backgroundColor: inputBg, color: tx, borderColor: border }]} placeholder="Group name" placeholderTextColor={sub} value={groupName} onChangeText={setGroupName} autoFocus maxLength={50} />
            <TextInput style={[s.input, { backgroundColor: inputBg, color: tx, borderColor: border }]} placeholder="Description (optional)" placeholderTextColor={sub} value={groupDesc} onChangeText={setGroupDesc} maxLength={150} />
            <View style={s.sheetBtns}>
              <TouchableOpacity style={[s.cancelBtn, { borderColor: border }]} onPress={() => { setCreateModal(false); setGroupName(''); setGroupDesc(''); }}>
                <Text style={[s.cancelBtnText, { color: sub }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.createBtn, { backgroundColor: accent }]} onPress={handleCreate}>
                <Text style={s.createBtnText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={actionModal} animationType="fade" transparent onRequestClose={() => setActionModal(false)}>
        <TouchableOpacity style={s.actionOverlay} activeOpacity={1} onPress={() => setActionModal(false)}>
          <View style={[s.actionSheet, { backgroundColor: card }]}>
            <Text style={[s.actionTitle, { color: tx }]} numberOfLines={1}>{selectedGroup?.name}</Text>
            <TouchableOpacity style={[s.actionRow, { borderBottomColor: border }]} onPress={handlePin}>
              <Text style={s.actionIcon}>📌</Text>
              <Text style={[s.actionLabel, { color: tx }]}>{selectedGroup?.pinned ? 'Unpin' : 'Pin'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionRow, { borderBottomColor: border }]} onPress={handleHideAlerts}>
              <Text style={s.actionIcon}>{selectedGroup?.hideAlerts ? '🔔' : '🔕'}</Text>
              <Text style={[s.actionLabel, { color: tx }]}>{selectedGroup?.hideAlerts ? 'Unmute Alerts' : 'Hide Alerts'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionRow, { borderBottomColor: 'transparent' }]} onPress={handleDelete}>
              <Text style={s.actionIcon}>🗑️</Text>
              <Text style={[s.actionLabel, { color: '#ff4444' }]}>Delete Group</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.cancelAction, { borderTopColor: border }]} onPress={() => setActionModal(false)}>
              <Text style={[s.cancelActionText, { color: sub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  newBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 12, position: 'relative' },
  avatarEmoji: { fontSize: 22 },
  pinBadge: { position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pinText: { fontSize: 8 },
  info: { flex: 1, gap: 3 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  time: { fontSize: 12 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  preview: { fontSize: 13, flex: 1, marginRight: 8 },
  members: { fontSize: 12 },
  chevron: { fontSize: 20, marginLeft: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  sheetSub: { fontSize: 13, marginBottom: 20 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 12 },
  sheetBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
  createBtn: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  actionOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  actionSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: 34 },
  actionTitle: { fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 12, paddingHorizontal: 24 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 14 },
  actionIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  actionLabel: { fontSize: 16 },
  cancelAction: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 16, alignItems: 'center' },
  cancelActionText: { fontSize: 16, fontWeight: '600' },
});
