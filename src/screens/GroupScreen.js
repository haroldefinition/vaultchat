import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, Modal, StyleSheet, RefreshControl,
  Alert, StatusBar, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ContactEditModal from '../components/ContactEditModal';
import PremiumModal from '../components/PremiumModal';
import { useTheme } from '../services/theme';
import { taptic, longPressFeedback } from '../services/haptics';
import { supabase } from '../services/supabase';
import { subscribeMessageNew } from '../services/socket';
// 1.0.14 group badges: see project_vaultchat_v1_0_14_groups_plan.md
// in memory for the full architecture. Active-room tracker (set by
// GroupChatScreen on focus) tells the message:new handler below to
// skip incrementing unread for the group the user is currently
// viewing — otherwise the badge would flicker on for an instant
// before the in-room subscription cleared it.
import { getActiveRoom } from '../services/activeRoom';

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

// ── Group size limits (task #92, premium gate) ───────────────
// Free accounts cap out at 8 group members. Premium unlocks 256.
// The cap is enforced both here (when adding from the manage UI)
// and on the server eventually — for now it's a soft client-side
// gate so paying users get more headroom.
const FREE_GROUP_MAX    = 8;
const PREMIUM_GROUP_MAX = 256;

// ── Manage Members Modal ──────────────────────────────────────
//
//  Members are stored as objects:
//    { name, user_id, vault_handle, phone, public_key }
//
//  Adding a new member REQUIRES a @handle or phone — we resolve the
//  input via vaultHandle.findByHandleOrPhone the moment Add is
//  tapped, fetch the NaCl pubkey via getPublicKey, and only then
//  insert the row. Free-form names are no longer accepted because
//  the per-recipient envelope encryption (groupCrypto.js) needs
//  user_id + public_key to actually encrypt for that recipient.
//
//  Legacy bare-string entries (e.g. "John") are tolerated for
//  backwards-compat: rendered with an amber "Resolve" affordance so
//  the user can convert them in-place by typing the member's
//  @handle or phone. Once converted, that member starts receiving
//  encrypted messages on the next send. Unresolved legacy entries
//  can also be removed in one tap.
function ManageMembersModal({ visible, group, onClose, onSave, accent, bg, card, tx, sub, border, inputBg, onUpsell }) {
  // Local state. Each entry is normalized to an object so renders
  // can branch cleanly on the presence of `user_id`.
  const normalize = (m) => (typeof m === 'string' ? { name: m } : { ...m });
  const [members,   setMembers]    = useState((group?.members || []).map(normalize));
  const [newInput,  setNewInput]   = useState('');
  const [adding,    setAdding]     = useState(false);
  const [premium,   setPremium]    = useState(false);
  // Per-row state for legacy resolution: { [index]: { lookup, status } }
  const [resolveState, setResolveState] = useState({});

  useEffect(() => {
    if (group) setMembers((group.members || []).map(normalize));
  }, [group]);

  useEffect(() => {
    if (!visible) return;
    try { require('../services/iapService').isPremium().then(setPremium); } catch {}
  }, [visible]);

  // Lazy require so this file doesn't grow a hard dep on the
  // services layer at parse time.
  function lookupServices() {
    const vh  = require('../services/vaultHandle');
    const kx  = require('../services/keyExchange');
    return { findByHandleOrPhone: vh.findByHandleOrPhone, getPublicKey: kx.getPublicKey };
  }

  // Hard validation — must look like a handle (@xxx) or a phone
  // (5+ digits). Free-form names are rejected so we never store
  // an unresolvable entry going forward.
  function looksLikeIdentity(s) {
    const t = String(s || '').trim();
    if (!t) return false;
    if (t.startsWith('@')) return /^@[a-z0-9_]{2,}$/i.test(t);
    const digits = t.replace(/\D/g, '');
    return digits.length >= 5;
  }

  async function add() {
    const raw = newInput.trim();
    if (!raw) return;
    if (!looksLikeIdentity(raw)) {
      Alert.alert(
        'Use @handle or phone',
        'Members must be added by their VaultChat @handle (e.g. @harold) or phone number so messages can be encrypted to them.',
      );
      return;
    }
    // Group cap (free vs premium).
    const cap = premium ? PREMIUM_GROUP_MAX : FREE_GROUP_MAX;
    if (members.length >= cap) {
      if (!premium) {
        Alert.alert(
          'Group full',
          `Free groups can have up to ${FREE_GROUP_MAX} members. Upgrade to Premium for groups up to ${PREMIUM_GROUP_MAX}.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'See Premium', onPress: () => onUpsell && onUpsell() },
          ],
        );
      } else {
        Alert.alert('Group full', `Premium groups can have up to ${PREMIUM_GROUP_MAX} members.`);
      }
      return;
    }
    setAdding(true);
    try {
      const { findByHandleOrPhone, getPublicKey } = lookupServices();
      const profile = await findByHandleOrPhone(raw);
      if (!profile?.id) {
        Alert.alert(
          'No match',
          `No VaultChat user matches "${raw}". Double-check the @handle or phone number.`,
        );
        setAdding(false);
        return;
      }
      // Dup-check by user_id (more robust than name comparison).
      if (members.some(m => m.user_id === profile.id)) {
        Alert.alert('Already added', 'This member is already in the group.');
        setAdding(false);
        return;
      }
      const pk = await getPublicKey(profile.id);
      const enriched = {
        name:         profile.display_name || profile.vault_handle || profile.phone || raw,
        user_id:      profile.id,
        vault_handle: profile.vault_handle || null,
        phone:        profile.phone || null,
        public_key:   pk || null,
      };
      setMembers(prev => [...prev, enriched]);
      setNewInput('');
    } catch {
      Alert.alert('Couldn’t add', 'Try again in a moment.');
    } finally {
      setAdding(false);
    }
  }

  // Convert a legacy bare-name entry to a resolved one in-place.
  async function resolveAt(idx) {
    const state = resolveState[idx] || {};
    const lookup = (state.lookup || '').trim();
    if (!looksLikeIdentity(lookup)) {
      Alert.alert('Use @handle or phone', 'Enter the member\'s VaultChat @handle or phone to resolve.');
      return;
    }
    setResolveState(prev => ({ ...prev, [idx]: { ...state, status: 'resolving' } }));
    try {
      const { findByHandleOrPhone, getPublicKey } = lookupServices();
      const profile = await findByHandleOrPhone(lookup);
      if (!profile?.id) {
        setResolveState(prev => ({ ...prev, [idx]: { ...state, status: 'fail' } }));
        return;
      }
      const pk = await getPublicKey(profile.id);
      setMembers(prev => prev.map((m, i) => i === idx ? {
        name:         m.name || profile.display_name || profile.vault_handle || profile.phone || lookup,
        user_id:      profile.id,
        vault_handle: profile.vault_handle || null,
        phone:        profile.phone || null,
        public_key:   pk || null,
      } : m));
      setResolveState(prev => {
        const next = { ...prev };
        delete next[idx];
        return next;
      });
    } catch {
      setResolveState(prev => ({ ...prev, [idx]: { ...state, status: 'fail' } }));
    }
  }

  function remove(idx) {
    const m = members[idx];
    Alert.alert('Remove Member', `Remove "${m.name || 'this member'}" from the group?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        setMembers(prev => prev.filter((_, i) => i !== idx));
        setResolveState(prev => {
          const next = { ...prev };
          delete next[idx];
          return next;
        });
      }},
    ]);
  }

  function save() {
    onSave && onSave(members);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View style={[{ backgroundColor: bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '85%' }]}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }}>
            <TouchableOpacity onPress={onClose}><Text style={{ color: sub, fontSize: 16 }}>Cancel</Text></TouchableOpacity>
            <Text style={{ color: tx, fontWeight: '700', fontSize: 17 }}>Manage Members</Text>
            <TouchableOpacity onPress={save}><Text style={{ color: accent, fontWeight: '700', fontSize: 16 }}>Save</Text></TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={{ color: sub, fontSize: 11, fontWeight: '700', marginBottom: 12, letterSpacing: 0.5 }}>
              {members.length} MEMBER{members.length !== 1 ? 'S' : ''}
            </Text>

            {/* Add member row — identity-required */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 6 }}>
              <TextInput
                style={{ flex: 1, backgroundColor: inputBg, color: tx, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }}
                placeholder="@handle or phone"
                placeholderTextColor={sub}
                value={newInput}
                onChangeText={setNewInput}
                onSubmitEditing={add}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                editable={!adding}
              />
              <TouchableOpacity
                style={{ backgroundColor: accent, borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', opacity: adding ? 0.6 : 1 }}
                onPress={add}
                disabled={adding}>
                {adding
                  ? <ActivityIndicator color="#000" size="small" />
                  : <Text style={{ color: '#000', fontWeight: '700', fontSize: 15 }}>Add</Text>}
              </TouchableOpacity>
            </View>
            <Text style={{ color: sub, fontSize: 11, marginBottom: 16 }}>
              Members are added by VaultChat @handle or phone so messages can be end-to-end encrypted to them.
            </Text>

            {/* Members list */}
            {members.length === 0 && (
              <Text style={{ color: sub, textAlign: 'center', paddingVertical: 20 }}>No members yet. Add someone above.</Text>
            )}
            {members.map((m, i) => {
              const resolved = !!(m.user_id && m.public_key);
              const rs       = resolveState[i] || {};
              return (
                <View key={i} style={{ backgroundColor: card, borderRadius: 14, padding: 14, marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: accent + '33', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Text style={{ color: tx, fontWeight: '700', fontSize: 15 }}>{(m.name || '?')[0]?.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: tx, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{m.name || 'Member'}</Text>
                      {/* Status line — green when encryptable, amber otherwise */}
                      {resolved ? (
                        <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '600', marginTop: 2 }}>
                          🔒 {m.vault_handle ? `@${m.vault_handle}` : (m.phone || 'encrypted')}
                        </Text>
                      ) : (
                        <Text style={{ color: '#B45309', fontSize: 11, fontWeight: '600', marginTop: 2 }}>
                          ⚠️ Legacy member — needs an identity to encrypt
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => remove(i)} style={{ padding: 6 }}>
                      <Text style={{ color: '#FF3B30', fontSize: 18 }}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Inline resolve row for legacy bare-name entries */}
                  {!resolved && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <TextInput
                        style={{ flex: 1, backgroundColor: inputBg, color: tx, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 }}
                        placeholder="@handle or phone"
                        placeholderTextColor={sub}
                        value={rs.lookup || ''}
                        onChangeText={t => setResolveState(prev => ({ ...prev, [i]: { ...prev[i], lookup: t, status: 'idle' } }))}
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={() => resolveAt(i)}
                        editable={rs.status !== 'resolving'}
                      />
                      <TouchableOpacity
                        style={{ backgroundColor: accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, opacity: (rs.lookup || '').trim() ? 1 : 0.5 }}
                        onPress={() => resolveAt(i)}
                        disabled={!(rs.lookup || '').trim() || rs.status === 'resolving'}>
                        {rs.status === 'resolving'
                          ? <ActivityIndicator color="#000" size="small" />
                          : <Text style={{ color: '#000', fontWeight: '700', fontSize: 12 }}>Resolve</Text>}
                      </TouchableOpacity>
                    </View>
                  )}
                  {!resolved && rs.status === 'fail' && (
                    <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '600', marginTop: 6 }}>
                      No VaultChat user matches that handle / phone.
                    </Text>
                  )}
                </View>
              );
            })}
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
  const [groupSearch, setGroupSearch] = useState('');
  const [refreshing,  setRefreshing]  = useState(false);
  const [premiumModalVis, setPremiumModalVis] = useState(false);
  // Pinning groups to the top is a Premium feature — same gating
  // model as Pinned Chats. We pull the local cached flag on focus
  // so an upgrade elsewhere lights up immediately on return.
  const [premium, setPremium] = useState(false);

  // My user id, used by the message:new handler below to skip
  // incrementing unread badges for messages I sent from another
  // device. Stored as a ref so the handler reads the latest value
  // without forcing the socket subscription to tear down.
  const myIdRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled && session?.user?.id) myIdRef.current = session.user.id;
      } catch {}
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      myIdRef.current = session?.user?.id || null;
    });
    return () => {
      cancelled = true;
      try { subscription?.unsubscribe?.(); } catch {}
    };
  }, []);

  useEffect(() => {
    loadGroups();
    const unsub = navigation.addListener('focus', () => {
      loadGroups();
      try { require('../services/iapService').isPremium().then(setPremium); } catch {}
    });
    try { require('../services/iapService').isPremium().then(setPremium); } catch {}
    return unsub;
  }, [navigation]);

  // 1.0.14 group badges: subscribe globally to message:new events.
  // Server (vaultchat-server/server.js) stamps roomType: 'group' on
  // every fan-out for group rooms, so we filter by that to avoid
  // touching 1:1 events (which ChatsScreen owns). Increments
  // matching group's `unread` count except when:
  //   (a) sender === me on another device — own messages aren't unread
  //   (b) user is currently viewing this group (getActiveRoom matches)
  // Tap-to-open + GroupChatScreen focus both clear the count.
  useEffect(() => {
    const cleanup = subscribeMessageNew((evt) => {
      try {
        if (!evt || !evt.roomId || !evt.senderId) return;
        if (evt.roomType !== 'group') return;  // 1:1 events handled by ChatsScreen

        const myId = myIdRef.current;
        const shouldIncrement =
          evt.senderId !== myId && !(getActiveRoom() === evt.roomId);

        const previewByType = (t) => {
          if (t === 'image' || t === 'gif')   return '📷 Photo';
          if (t === 'video')                  return '🎥 Video';
          if (t === 'audio')                  return '🎤 Voice note';
          if (t === 'file')                   return '📎 File';
          if (t === 'vanish')                 return '👻 Vanish message';
          return 'New message';
        };
        const lastPreview = previewByType(evt.type);
        const prettyTime  = (() => {
          try {
            const d = evt.timestamp ? new Date(evt.timestamp) : new Date();
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } catch {
            return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
        })();

        setGroups(prev => {
          const list = Array.isArray(prev) ? prev.slice() : [];
          const idx = list.findIndex(g => g?.id === evt.roomId);
          // Group not in local list — could be a new group I was just
          // added to but haven't seen yet. No-op for now; a future
          // "fetch my groups from Supabase" hydration would cover this
          // (group analog of Task #99 for 1:1 chats).
          if (idx < 0) return prev;

          const prevUnread = Number.isFinite(list[idx].unread) ? list[idx].unread : 0;
          const updated = {
            ...list[idx],
            lastMessage: lastPreview,
            time:        prettyTime,
            unread:      shouldIncrement ? prevUnread + 1 : prevUnread,
          };
          list.splice(idx, 1);
          // Pinned groups float to top regardless; otherwise insert
          // right after the last pinned group (matching 1:1 chat list
          // behavior on new messages).
          if (updated.pinned) {
            const firstNonPinned = list.findIndex(g => !g.pinned);
            const insertAt = firstNonPinned < 0 ? list.length : firstNonPinned;
            list.splice(insertAt, 0, updated);
          } else {
            let lastPinned = -1;
            for (let i = list.length - 1; i >= 0; i--) {
              if (list[i].pinned) { lastPinned = i; break; }
            }
            list.splice(lastPinned + 1, 0, updated);
          }

          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list)).catch(() => {});
          return list;
        });
      } catch (e) {
        if (__DEV__) console.warn('group message:new handler failed:', e?.message);
      }
    });
    return cleanup;
  }, []);

  // Upserts the canonical Supabase `rooms` row for a group. Required
  // for the server's message:send fan-out to find the group's
  // member_ids (server fetches from rooms table on each send). Idempotent
  // — safe to call from group create AND every member-list change.
  // Filters legacy bare-string members (no user_id) since the server
  // can't fan out to them anyway. Always includes the creator/current
  // user as a member so single-creator groups work too.
  async function _upsertGroupRoom(groupId, groupName, members) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const myUserId = session?.user?.id;
      if (!myUserId || !groupId) return;
      const memberUserIds = new Set([myUserId]);
      for (const m of (members || [])) {
        if (m && typeof m === 'object' && m.user_id) memberUserIds.add(m.user_id);
      }
      await supabase.from('rooms').upsert({
        id:         groupId,
        type:       'group',
        member_ids: Array.from(memberUserIds),
        created_by: myUserId,
        name:       groupName || null,
      }, { onConflict: 'id' });
    } catch (e) {
      if (__DEV__) console.warn('group rooms upsert failed:', e?.message);
    }
  }

  // Filtered groups for search
  const filteredGroups = groupSearch.trim()
    ? groups.filter(g =>
        g.name?.toLowerCase().includes(groupSearch.toLowerCase()) ||
        g.description?.toLowerCase().includes(groupSearch.toLowerCase())
      )
    : groups;

  async function onRefresh() {
    setRefreshing(true);
    await loadGroups();
    setRefreshing(false);
  }

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
    // 1.0.14 group badges: register the canonical rooms row so the
    // server can find member_ids on the first message:send fan-out.
    // Members[] is empty at create time — only the creator is a
    // member until they add others via Manage Members. Fire-and-
    // forget; UI doesn't block on this.
    _upsertGroupRoom(id, name, []);
    setGroupName(''); setGroupDesc(''); setCreateModal(false);
    navigation.navigate('GroupChat', { groupId: id, groupName: name });
  };

  const openActionMenu = (group) => { setSelectedGroup(group); setActionModal(true); };

  const handlePin = async () => {
    // Premium gate. Free users see the upsell; allow unpin so users
    // who downgraded aren't stuck with a frozen pinned group.
    const willPin = !selectedGroup?.pinned;
    if (willPin && !premium) {
      setActionModal(false);
      setTimeout(() => setPremiumModalVis(true), 250);
      return;
    }
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
    // 1.0.14 group badges: keep the rooms row's member_ids in sync
    // with the local members list. Without this, newly-added members
    // wouldn't receive the message:new fan-out (server reads
    // member_ids from the rooms row on each send).
    _upsertGroupRoom(selectedGroup.id, selectedGroup.name, members);
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

  // Premium row: rounded-card treatment matching ContactsScreen.
  // Free row: legacy flat-bordered list. Both share the same avatar
  // edit shortcut, long-press menu, and tap-to-open behavior.
  const renderGroup = ({ item }) => {
    const rowStyle = premium
      ? [s.cardRow, { backgroundColor: card, borderColor: border }]
      : [s.row,     { backgroundColor: card, borderBottomColor: border }];

    const unread = Number.isFinite(item.unread) ? item.unread : 0;

    return (
      <TouchableOpacity
        style={rowStyle}
        activeOpacity={0.85}
        onPress={() => {
          // 1.0.14 group badges: opening a group clears its unread
          // count (mirrors 1:1 chat-list behavior). Persist atomically
          // before the navigate so coming back doesn't briefly flash
          // the stale count before the focus listener reloads.
          if (unread > 0) {
            const cleared = groups.map(g => g.id === item.id ? { ...g, unread: 0 } : g);
            saveGroups(cleared);
          }
          navigation.navigate('GroupChat', { groupId: item.id, groupName: item.name });
        }}
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
        {unread > 0 ? (
          <View style={[s.unreadDot, { backgroundColor: accent }]}>
            <Text style={s.unreadTx}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : (
          <Text style={[s.chevron, { color: sub }]}>›</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
      <StatusBar barStyle="light-content" />
      <View style={[s.header, { backgroundColor: bg, borderBottomColor: border }]}>
        {/* Back chevron — GroupScreen used to be a bottom tab (no back
            button needed). Now that it's pushed onto the stack from
            the "Groups" chip on Chats, we render the chevron whenever
            there's a screen to pop back to. Falls back to a spacer
            View so the title centering doesn't shift when GroupScreen
            is reached from a tab path with no stack history. */}
        {navigation.canGoBack && navigation.canGoBack() ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ paddingRight: 12, paddingVertical: 4 }}>
            <Text style={{ color: accent, fontSize: 30, fontWeight: '300', lineHeight: 32 }}>‹</Text>
          </TouchableOpacity>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Text style={[s.headerTitle, { color: tx }]}>Groups</Text>
          {/* Crown next to title for premium users — matches the rest
              of the premium chrome (Chats / Vault / Contacts). */}
          {premium && <Text style={{ fontSize: 18, marginLeft: 2 }}>👑</Text>}
        </View>
        <TouchableOpacity style={[s.newBtn, { backgroundColor: accent }]} onPress={() => setCreateModal(true)}>
          <Text style={s.newBtnText}>+ New Group</Text>
        </TouchableOpacity>
      </View>

      {/* Group search bar */}
      <View style={[s.searchBar, { backgroundColor: inputBg, borderColor: border }]}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={[s.searchInput, { color: tx }]}
          placeholder="Search groups..."
          placeholderTextColor={sub}
          value={groupSearch}
          onChangeText={setGroupSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {groupSearch.length > 0 && (
          <TouchableOpacity onPress={() => setGroupSearch('')}>
            <Text style={{ color: sub, fontSize: 16, paddingHorizontal: 8 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredGroups}
        keyExtractor={item => item.id}
        renderItem={renderGroup}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} colors={[accent]} />
        }
        ListEmptyComponent={
          <View style={s.empty}>
            {groupSearch ? (
              <>
                <Text style={s.emptyEmoji}>🔍</Text>
                <Text style={[s.emptyTitle, { color: tx }]}>No groups found</Text>
                <Text style={[s.emptySub, { color: sub }]}>No groups match "{groupSearch}"</Text>
              </>
            ) : (
              <>
                <View style={[s.emptyIconWrap, { backgroundColor: accent + '18', borderColor: accent + '30' }]}>
                  <Text style={{ fontSize: 48 }}>👥</Text>
                </View>
                <Text style={[s.emptyTitle, { color: tx }]}>No groups yet</Text>
                <Text style={[s.emptySub, { color: sub }]}>
                  Create a group to start encrypted conversations with multiple people.
                </Text>
                <TouchableOpacity
                  style={[s.emptyBtn, { backgroundColor: accent }]}
                  onPress={() => { taptic(); setCreateModal(true); }}>
                  <Text style={s.emptyBtnText}>👥  Create a Group</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        }
        contentContainerStyle={filteredGroups.length === 0 ? { flex: 1 } : { paddingBottom: 20 }}
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
              {!premium && !selectedGroup?.pinned && (
                <Text style={{ marginLeft: 'auto', fontSize: 14 }}>👑</Text>
              )}
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
        onUpsell={() => { setMembersModal(false); setTimeout(() => setPremiumModalVis(true), 250); }}
        accent={accent} bg={bg} card={card} tx={tx} sub={sub} border={border} inputBg={inputBg}
      />
      {/* Premium upsell — fired when free user hits the 8-member group cap. */}
      <PremiumModal
        visible={premiumModalVis}
        onClose={() => setPremiumModalVis(false)}
        onUpgraded={() => setPremiumModalVis(false)}
        colors={{ card, text: tx, muted: sub, border }}
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
  searchBar:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10 },
  searchIcon:    { fontSize: 14, marginRight: 6, opacity: 0.6 },
  searchInput:   { flex: 1, paddingVertical: 8, paddingHorizontal: 6, fontSize: 14 },
  headerTitle:   { fontSize: 28, fontWeight: '800' },
  newBtn:        { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  newBtnText:    { color: '#000', fontWeight: '700', fontSize: 14 },
  row:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  // Premium-only — rounded card row matching ContactsScreen
  cardRow:       { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1 },
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
  // 1.0.14 group badges — mirrors the 1:1 chat-list badge style in
  // ChatsScreen so both lists feel cohesive. Replaces the chevron
  // when count > 0 so the row's right edge isn't fighting itself.
  unreadDot:     { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 4 },
  unreadTx:      { color: '#000', fontSize: 11, fontWeight: '900' },
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
