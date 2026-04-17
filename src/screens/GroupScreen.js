import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, Modal, StyleSheet,
  Alert, StatusBar, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ContactEditModal from '../components/ContactEditModal';
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

// ── Manage Members Modal ──────────────────────────────────────
function ManageMembersModal({ visible, group, onClose, onSave, accent, bg, card, tx, sub, border, inputBg }) {
  const [members,   setMembers]   = useState(group?.members || []);
  const [newMember, setNewMember] = useState('');

  useEffect(() => {
    if (group) setMembers(group.members || []);
  }, [group]);

  function add() {
    const name = newMember.trim();
    if (!name) return;
    if (members.includes(name)) { Alert.alert('Already added'); return; }
    setMembers(prev => [...prev, name]);
    setNewMember('');
  }

  function remove(name) {
    Alert.alert('Remove Member', `Remove "${name}" from the group?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setMembers(prev => prev.filter(m => m !== name)) },
    ]);
  }

  function save() {
    onSave && onSave(members);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View style={[{ backgroundColor: bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '80%' }]}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }}>
            <TouchableOpacity onPress={onClose}><Text style={{ color: sub, fontSize: 16 }}>Cancel</Text></TouchableOpacity>
            <Text style={{ color: tx, fontWeight: '700', fontSize: 17 }}>Manage Members</Text>
            <TouchableOpacity onPress={save}><Text style={{ color: accent, fontWeight: '700', fontSize: 16 }}>Save</Text></TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <Text style={{ color: sub, fontSize: 11, fontWeight: '700', marginBottom: 12, letterSpacing: 0.5 }}>
              {members.length} MEMBER{members.length !== 1 ? 'S' : ''}
            </Text>

            {/* Add member row */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <TextInput
                style={{ flex: 1, backgroundColor: inputBg, color: tx, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }}
                placeholder="Add member name or handle…"
                placeholderTextColor={sub}
                value={newMember}
                onChangeText={setNewMember}
                onSubmitEditing={add}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={{ backgroundColor: accent, borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' }}
                onPress={add}>
                <Text style={{ color: '#000', fontWeight: '700', fontSize: 15 }}>Add</Text>
              </TouchableOpacity>
            </View>

            {/* Members list */}
            {members.length === 0 && (
              <Text style={{ color: sub, textAlign: 'center', paddingVertical: 20 }}>No members yet. Add someone above.</Text>
            )}
            {members.map((m, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: card, borderRadius: 14, padding: 14, marginBottom: 8 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: accent + '33', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Text style={{ color: tx, fontWeight: '700', fontSize: 15 }}>{m[0]?.toUpperCase()}</Text>
                </View>
                <Text style={{ flex: 1, color: tx, fontSize: 15, fontWeight: '600' }}>{m}</Text>
                <TouchableOpacity onPress={() => remove(m)} style={{ padding: 6 }}>
                  <Text style={{ color: '#FF3B30', fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function GroupScreen({ navigation }) {
  const theme = useTheme();
  const { bg, card, tx, sub, border, inputBg, accent } = theme;
  const [groups,      setGroups]      = useState([]);
  const [createModal, setCreateModal] = useState(false);
  const [actionModal, setActionModal] = useState(false);
  const [membersModal,setMembersModal]= useState(false);
  const [selectedGroup,setSelectedGroup] = useState(null);
  const [groupEditModal, setGroupEditModal] = useState(false);
  const [groupEditTarget, setGroupEditTarget] = useState(null);
  const [groupName,   setGroupName]   = useState('');
  const [groupDesc,   setGroupDesc]   = useState('');

  useEffect(() => {
    loadGroups();
    const unsub = navigation.addListener('focus', loadGroups);
    return unsub;
  }, [navigation]);

  const loadGroups = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setGroups(JSON.parse(raw));
    } catch {}
  }, []);

  const saveGroups = async (updated) => {
    setGroups(updated);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
  };

  const handleCreate = async () => {
    const name = groupName.trim();
    if (!name) { Alert.alert('Error', 'Enter a group name.'); return; }
    const ts  = Date.now().toString();
    const id  = generateRoomId(name, ts);
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newGroup = { id, name, desc: groupDesc.trim(), memberCount: 1, members: [], lastMessage: 'Group created', time: now, pinned: false, hideAlerts: false, createdAt: Date.now() };
    await saveGroups([newGroup, ...groups]);
    setGroupName(''); setGroupDesc(''); setCreateModal(false);
    navigation.navigate('GroupChat', { groupId: id, groupName: name });
  };

  const openActionMenu = (group) => { setSelectedGroup(group); setActionModal(true); };

  const handlePin = async () => {
    const updated = groups.map(g => g.id === selectedGroup.id ? { ...g, pinned: !g.pinned } : g);
    updated.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    await saveGroups(updated);
    setActionModal(false);
  };

  const handleHideAlerts = async () => {
    const updated = groups.map(g => g.id === selectedGroup.id ? { ...g, hideAlerts: !g.hideAlerts } : g);
    await saveGroups(updated);
    setActionModal(false);
  };

  const handleManageMembers = () => {
    setActionModal(false);
    setTimeout(() => setMembersModal(true), 300);
  };

  const handleSaveMembers = async (members) => {
    const updated = groups.map(g => g.id === selectedGroup.id
      ? { ...g, members, memberCount: members.length || 1 } : g);
    await saveGroups(updated);
    setSelectedGroup(prev => ({ ...prev, members, memberCount: members.length || 1 }));
  };

  const handleDelete = () => {
    Alert.alert('Delete Group', `Delete "${selectedGroup.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel', onPress: () => setActionModal(false) },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await saveGroups(groups.filter(g => g.id !== selectedGroup.id));
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
      delayLongPress={400}>
      <TouchableOpacity style={[s.avatar, { backgroundColor: accent + '22' }]}
        onPress={() => { setGroupEditTarget({ ...item, firstName: item.name, phone: '', email: '', id: item.id }); setGroupEditModal(true); }}>
        <Text style={s.avatarEmoji}>👥</Text>
        {item.pinned && <View style={[s.pinBadge, { backgroundColor: accent }]}><Text style={s.pinText}>📌</Text></View>}
      </TouchableOpacity>
      <View style={s.info}>
        <View style={s.topRow}>
          <Text style={[s.name, { color: tx }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[s.time, { color: sub }]}>{item.time || ''}</Text>
        </View>
        <View style={s.bottomRow}>
          <Text style={[s.preview, { color: sub }]} numberOfLines={1}>{item.hideAlerts ? '🔕 ' : '🔒 '}{item.lastMessage || 'Tap to open'}</Text>
          <Text style={[s.members, { color: sub }]}>{item.memberCount || 1} member{(item.memberCount || 1) !== 1 ? 's' : ''}</Text>
        </View>
      </View>
      <Text style={[s.chevron, { color: sub }]}>›</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
      <StatusBar barStyle="light-content" />
      <View style={[s.header, { backgroundColor: bg, borderBottomColor: border }]}>
        <Text style={[s.headerTitle, { color: tx }]}>Groups</Text>
        <TouchableOpacity style={[s.newBtn, { backgroundColor: accent }]} onPress={() => setCreateModal(true)}>
          <Text style={s.newBtnText}>+ New Group</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={groups}
        keyExtractor={item => item.id}
        renderItem={renderGroup}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>👥</Text>
            <Text style={[s.emptyTitle, { color: tx }]}>No groups yet</Text>
            <Text style={[s.emptySub, { color: sub }]}>Create a group to start encrypted conversations.</Text>
            <TouchableOpacity style={[s.emptyBtn, { backgroundColor: accent }]} onPress={() => setCreateModal(true)}>
              <Text style={s.emptyBtnText}>+ Create Group</Text>
            </TouchableOpacity>
          </View>
        }
        contentContainerStyle={groups.length === 0 ? { flex: 1 } : { paddingBottom: 20 }}
        style={{ flex: 1 }}
      />

      {/* Create group modal */}
      <Modal visible={createModal} animationType="slide" transparent onRequestClose={() => setCreateModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <View style={[s.sheet, { backgroundColor: card }]}>
            <View style={[s.sheetHandle, { backgroundColor: border }]} />
            <Text style={[s.sheetTitle, { color: tx }]}>Create New Group</Text>
            <Text style={[s.sheetSub, { color: sub }]}>All messages are end-to-end encrypted 🔒</Text>
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

      {/* Long-press action menu */}
      <Modal visible={actionModal} animationType="fade" transparent onRequestClose={() => setActionModal(false)}>
        <TouchableOpacity style={s.actionOverlay} activeOpacity={1} onPress={() => setActionModal(false)}>
          <View style={[s.actionSheet, { backgroundColor: card }]}>
            <Text style={[s.actionTitle, { color: tx }]} numberOfLines={1}>{selectedGroup?.name}</Text>
            <TouchableOpacity style={[s.actionRow, { borderBottomColor: border }]} onPress={handleManageMembers}>
              <Text style={s.actionIcon}>👥</Text>
              <Text style={[s.actionLabel, { color: tx }]}>Manage Members</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionRow, { borderBottomColor: border }]} onPress={handlePin}>
              <Text style={s.actionIcon}>📌</Text>
              <Text style={[s.actionLabel, { color: tx }]}>{selectedGroup?.pinned ? 'Unpin' : 'Pin'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionRow, { borderBottomColor: border }]} onPress={handleHideAlerts}>
              <Text style={s.actionIcon}>{selectedGroup?.hideAlerts ? '🔔' : '🔕'}</Text>
              <Text style={[s.actionLabel, { color: tx }]}>{selectedGroup?.hideAlerts ? 'Unmute Alerts' : 'Mute Alerts'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionRow, { borderBottomColor: 'transparent' }]} onPress={handleDelete}>
              <Text style={s.actionIcon}>🗑️</Text>
              <Text style={[s.actionLabel, { color: '#ff4444' }]}>Delete Group</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionCancel, { borderTopColor: border }]} onPress={() => setActionModal(false)}>
              <Text style={[s.actionCancelText, { color: sub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Manage Members modal */}
      <ManageMembersModal
        visible={membersModal}
        group={selectedGroup}
        onClose={() => setMembersModal(false)}
        onSave={handleSaveMembers}
        accent={accent} bg={bg} card={card} tx={tx} sub={sub} border={border} inputBg={inputBg}
      />
      {/* Group info edit modal */}
      <ContactEditModal
        visible={groupEditModal}
        contact={groupEditTarget}
        onClose={() => { setGroupEditModal(false); setGroupEditTarget(null); }}
        onSave={async (updated) => {
          const next = groups.map(g => g.id === updated.id
            ? { ...g, name: updated.name || updated.firstName || g.name, photo: updated.photo }
            : g);
          await saveGroups(next);
          setGroupEditModal(false); setGroupEditTarget(null);
        }}
        colors={{ bg, card, tx, sub, border, inputBg, accent }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:   { fontSize: 28, fontWeight: '800' },
  newBtn:        { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  newBtnText:    { color: '#000', fontWeight: '700', fontSize: 14 },
  row:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar:        { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginRight: 12, position: 'relative' },
  avatarEmoji:   { fontSize: 22 },
  pinBadge:      { position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pinText:       { fontSize: 9 },
  info:          { flex: 1, marginRight: 8 },
  topRow:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  name:          { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  time:          { fontSize: 12 },
  bottomRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  preview:       { fontSize: 13, flex: 1, marginRight: 8 },
  members:       { fontSize: 11 },
  chevron:       { fontSize: 18 },
  empty:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji:    { fontSize: 64, marginBottom: 16 },
  emptyTitle:    { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  emptySub:      { fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  emptyBtn:      { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 25 },
  emptyBtnText:  { color: '#000', fontWeight: '700', fontSize: 16 },
  modalOverlay:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:         { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44 },
  sheetHandle:   { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:    { fontSize: 20, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  sheetSub:      { fontSize: 13, textAlign: 'center', marginBottom: 20 },
  input:         { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 12 },
  sheetBtns:     { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn:     { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
  createBtn:     { flex: 2, borderRadius: 14, padding: 14, alignItems: 'center' },
  createBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
  actionOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  actionSheet:   { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 34 },
  actionTitle:   { fontSize: 15, fontWeight: '700', textAlign: 'center', paddingVertical: 16, paddingHorizontal: 20 },
  actionRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 14 },
  actionIcon:    { fontSize: 20, width: 28, textAlign: 'center' },
  actionLabel:   { fontSize: 16 },
  actionCancel:  { paddingVertical: 16, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  actionCancelText: { fontSize: 16, fontWeight: '600' },
});
