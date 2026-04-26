import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Image, Alert, RefreshControl, AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Swipeable } from 'react-native-gesture-handler';
import ContactEditModal from '../components/ContactEditModal';
import { useTheme } from '../services/theme';
import { useUnread } from '../services/unreadBadge';
import { getMyHandle } from '../services/vaultHandle';
import { taptic, longPressFeedback } from '../services/haptics';
import { requestContactsPermission, syncContacts } from '../services/contacts';
import { listFolders, subscribe as subscribeFolders } from '../services/folders';
import { isPremiumUser } from '../services/adsService';
import PremiumModal from '../components/PremiumModal';
import {
  subscribe as subscribeVault,
  isUnlocked as isVaultUnlocked,
  unlock as unlockVault,
  lock as lockVault,
  hasVaultPin,
  listVaultedIds,
  addToVault,
  removeFromVault,
} from '../services/vault';

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
  const [showArchived, setShowArchived] = useState(false);

  // Chat folders (premium feature, task #82). selectedFolderId === null
  // means "All" — the default tab. Folders array is loaded from
  // src/services/folders.js and kept fresh via the subscribe() listener.
  const [folders,           setFolders]           = useState([]);
  const [selectedFolderId,  setSelectedFolderId]  = useState(null);
  const [premium,           setPremium]           = useState(false);
  const [premiumModalVis,   setPremiumModalVis]   = useState(false);

  // Vault mode (task #84). When unlocked the chat list FLIPS to show
  // ONLY vaulted chats; when locked, vaulted chats are filtered OUT
  // entirely so they don't appear at all. Long-pressing the "Chats"
  // title opens the vault PIN prompt. The vault re-locks on app
  // background. vaultedIds is kept in local state so filter changes
  // are instant — listVaultedIds() reads from AsyncStorage.
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultedIds,    setVaultedIds]    = useState([]);
  const [vaultPinModal, setVaultPinModal] = useState(false);
  const [vaultPinInput, setVaultPinInput] = useState('');
  const [vaultPinError, setVaultPinError] = useState('');

  // Track the currently-open Swipeable so we can close it when another
  // row is swiped. Without this, users can end up with multiple rows
  // stuck in their "open" state and the UI feels broken.
  const openSwipeRef = useRef(null);

  // Refresh folder list + premium flag whenever we focus or the
  // folders service signals a write (so creating a folder elsewhere
  // updates the pill row immediately).
  useEffect(() => {
    const refreshFolders = () => listFolders().then(setFolders);
    refreshFolders();
    isPremiumUser().then(setPremium);
    const unsubFolderWrites = subscribeFolders(refreshFolders);
    return () => unsubFolderWrites();
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      loadChats();
      clearUnread(); // clear badge when Chats tab is opened
      listFolders().then(setFolders);
      isPremiumUser().then(setPremium);
      listVaultedIds().then(setVaultedIds);
    });
    getMyHandle().then(h => { if (h) setMyHandle(h); });
    return unsub;
  }, [navigation]);

  // Vault subscription — fires whenever the vault locks/unlocks or the
  // vaulted-id list changes. Re-pull the id list each time so adding a
  // chat to the vault from the long-press menu refreshes the filter
  // immediately without waiting for a focus event.
  useEffect(() => {
    setVaultUnlocked(isVaultUnlocked());
    listVaultedIds().then(setVaultedIds);
    const unsub = subscribeVault(() => {
      setVaultUnlocked(isVaultUnlocked());
      listVaultedIds().then(setVaultedIds);
    });
    return unsub;
  }, []);

  // Auto-relock the vault when the app goes to background or inactive.
  // This is a hard requirement of the feature — vaulted chats should
  // never be visible without an explicit unlock from the current
  // foreground session.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') lockVault();
    });
    return () => sub.remove();
  }, []);

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

  // ── Direct-item helpers used by swipe actions ───────────────
  // Distinct from the modal versions below because swipe actions
  // need to toggle a specific row without going through `selected`.

  // Identify a chat reliably — some rows have `id`, older ones only
  // have `roomId`; fall back through both so swipe actions on any
  // row shape work.
  function sameChat(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id) return a.id === b.id;
    if (a.roomId && b.roomId) return a.roomId === b.roomId;
    return false;
  }

  async function togglePinAt(item) {
    taptic();
    const updated = chats
      .map(c => sameChat(c, item) ? { ...c, pinned: !c.pinned } : c)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    await saveChats(updated);
    openSwipeRef.current?.close?.();
  }

  async function toggleArchiveAt(item) {
    taptic();
    const updated = chats.map(c =>
      sameChat(c, item) ? { ...c, archived: !c.archived } : c
    );
    await saveChats(updated);
    openSwipeRef.current?.close?.();
  }

  // "Mark as unread" — distinct from server-driven unread counter.
  // Sets a local `markedUnread` flag that surfaces a blue dot until
  // the user opens the chat (at which point ChatRoomScreen's existing
  // read-receipt path should clear the flag on open).
  async function toggleUnreadAt(item) {
    taptic();
    const updated = chats.map(c =>
      sameChat(c, item) ? { ...c, markedUnread: !c.markedUnread } : c,
    );
    await saveChats(updated);
    openSwipeRef.current?.close?.();
  }

  // ── Legacy modal-driven versions (still used by long-press) ──

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

  // ── Vault: move chat in/out of vault ────────────────────────
  // Always available from the long-press action sheet on a row, even
  // if no Vault PIN has been set yet — in that case we redirect the
  // user to Settings to set one. Once vaulted, the chat disappears
  // from the normal list immediately (vault is locked by default).
  async function toggleVaultForSelected() {
    if (!selected) return;
    setActionModal(false);
    const id = chatId(selected);
    if (vaultedSet.has(id)) {
      await removeFromVault(id);
      await listVaultedIds().then(setVaultedIds);
      return;
    }
    // Adding to vault: require that a Vault PIN has been set first,
    // otherwise the chat would be hidden behind nothing and only
    // recoverable by reinstall — bad UX.
    const has = await hasVaultPin();
    if (!has) {
      Alert.alert(
        'Set a Vault PIN first',
        'Open Settings → Privacy → Vault PIN to choose a PIN before moving chats into your vault.',
        [{ text: 'OK' }],
      );
      return;
    }
    await addToVault(id);
    await listVaultedIds().then(setVaultedIds);
  }

  // ── Vault: PIN prompt triggered by long-pressing the title ──
  async function onTitleLongPress() {
    longPressFeedback();
    // Already unlocked → tapping should LOCK back to normal view.
    if (vaultUnlocked) {
      lockVault();
      return;
    }
    const has = await hasVaultPin();
    if (!has) {
      // Don't reveal the existence of the vault feature with an alert
      // — silently no-op if no PIN is set. Users who know about the
      // feature will set one in Settings; everyone else sees nothing.
      return;
    }
    setVaultPinInput('');
    setVaultPinError('');
    setVaultPinModal(true);
  }

  async function submitVaultPin() {
    const ok = await unlockVault(vaultPinInput);
    if (ok) {
      setVaultPinModal(false);
      setVaultPinInput('');
      setVaultPinError('');
    } else {
      setVaultPinError('Wrong PIN');
      setVaultPinInput('');
    }
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

  const matchesSearch = (c) =>
    !search ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search);

  // Folder filter — applied BEFORE the archived split so a folder
  // can show its members from either pile. selectedFolderId === null
  // means "All", which is the unfiltered view.
  const folderChatIds = selectedFolderId
    ? new Set((folders.find(f => f.id === selectedFolderId)?.chatIds) || [])
    : null;
  const inSelectedFolder = (c) => {
    if (!folderChatIds) return true;
    const id = c.id || c.roomId || c.handle;
    return folderChatIds.has(id);
  };

  // Vault filter — the inverse of selectedFolderId. When the vault is
  // LOCKED (default), vaulted chats are hidden entirely; when UNLOCKED,
  // ONLY vaulted chats are shown (no normal chats, no archived bucket).
  const vaultedSet = new Set(vaultedIds);
  const chatId = (c) => c.id || c.roomId || c.handle;
  const matchesVaultMode = (c) => vaultUnlocked
    ? vaultedSet.has(chatId(c))
    : !vaultedSet.has(chatId(c));

  const visible = chats
    .filter(c => !c.archived && matchesSearch(c) && inSelectedFolder(c) && matchesVaultMode(c))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const archived = chats.filter(c => c.archived && matchesSearch(c) && inSelectedFolder(c) && matchesVaultMode(c));

  // When the user taps the Archived footer, splice archived chats into
  // the list so they can still be swiped (un-archive, pin, etc.).
  const listData = showArchived ? [...visible, ...archived] : visible;

  // ── Folder pill row helpers ──────────────────────────────────
  function onFolderPillPress(folderId) {
    // Premium gate — only the "All" tab is free; everything else
    // requires premium. Show the upgrade modal on first paywalled tap.
    if (folderId !== null && !premium) {
      setPremiumModalVis(true);
      return;
    }
    setSelectedFolderId(folderId);
  }
  function onManageFoldersPress() {
    if (!premium) { setPremiumModalVis(true); return; }
    navigation.navigate('Folders');
  }

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
        {/* Growth CTA — onboard users faster by matching their address
            book against known VaultChat profiles. Request contacts
            permission, sync, show a friendly count, then reload the
            chat list so any discovered friends show up. */}
        <TouchableOpacity
          style={[s.emptyBtnOutline, { borderColor: accent }]}
          onPress={async () => {
            taptic();
            const granted = await requestContactsPermission();
            if (!granted) {
              Alert.alert('Permission needed', 'Enable Contacts access in Settings so VaultChat can find friends you already know.');
              return;
            }
            try {
              const contacts = await syncContacts();
              Alert.alert('Contacts synced', `${contacts?.length || 0} contacts imported. Anyone already on VaultChat is ready to message.`);
              loadChats();
            } catch (e) {
              Alert.alert('Sync failed', e?.message || 'Please try again in a moment.');
            }
          }}>
          <Text style={[s.emptyBtnOutlineTx, { color: accent }]}>👥  Sync Phone Contacts</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.emptyBtnOutline, { borderColor: accent, marginTop: 10 }]}
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
        <TouchableOpacity onLongPress={onTitleLongPress} delayLongPress={500} activeOpacity={1}>
          <Text style={[s.title, { color: vaultUnlocked ? '#10B981' : accent }]}>
            {vaultUnlocked ? '🛡️ Vault' : 'Chats'}
          </Text>
          {myHandle ? <Text style={[s.handle, { color: '#5856d6' }]}>{myHandle}</Text> : null}
        </TouchableOpacity>
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

      {/* Folder pill row — Telegram-style. Always shows "All" + the
          user's custom folders + a "+" pill that opens FoldersScreen.
          Custom folders are gated behind premium (handled by
          onFolderPillPress); the pills are visible either way so
          non-premium users discover the upsell naturally. */}
      <View style={[s.folderRow, { borderBottomColor: border }]}>
        <FlatList
          horizontal
          data={[{ id: null, name: 'All', emoji: null }, ...folders, { id: '__manage', name: 'Manage', emoji: '⚙️' }]}
          keyExtractor={f => f.id || 'all'}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
          renderItem={({ item }) => {
            if (item.id === '__manage') {
              return (
                <TouchableOpacity
                  onPress={onManageFoldersPress}
                  style={[s.folderPill, { backgroundColor: inputBg, borderColor: border }]}>
                  <Text style={{ fontSize: 14 }}>⚙️</Text>
                  <Text style={{ color: sub, fontSize: 13, fontWeight: '600' }}>Manage</Text>
                  {!premium && <Text style={{ color: accent, fontSize: 11 }}>👑</Text>}
                </TouchableOpacity>
              );
            }
            const active = selectedFolderId === item.id;
            return (
              <TouchableOpacity
                onPress={() => onFolderPillPress(item.id)}
                style={[
                  s.folderPill,
                  { backgroundColor: active ? accent : inputBg, borderColor: active ? accent : border },
                ]}>
                {item.emoji ? <Text style={{ fontSize: 14 }}>{item.emoji}</Text> : null}
                <Text style={{ color: active ? '#fff' : tx, fontSize: 13, fontWeight: '600' }}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
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
        data={listData}
        keyExtractor={(item, i) => item.id || item.roomId || i.toString()}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={accent}
            colors={[accent]}
          />
        }
        renderItem={({ item }) => {
          // Right swipe (reveals from left) → Pin / Unpin
          const renderLeftActions = () => (
            <TouchableOpacity
              style={[s.swipeAction, { backgroundColor: accent }]}
              onPress={() => togglePinAt(item)}>
              <Text style={s.swipeIcon}>📌</Text>
              <Text style={s.swipeLabel}>{item.pinned ? 'Unpin' : 'Pin'}</Text>
            </TouchableOpacity>
          );
          // Left swipe (reveals from right) → Unread, Archive
          const renderRightActions = () => (
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity
                style={[s.swipeAction, { backgroundColor: '#5856d6' }]}
                onPress={() => toggleUnreadAt(item)}>
                <Text style={s.swipeIcon}>●</Text>
                <Text style={s.swipeLabel}>{item.markedUnread ? 'Read' : 'Unread'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.swipeAction, { backgroundColor: '#8e8e93' }]}
                onPress={() => toggleArchiveAt(item)}>
                <Text style={s.swipeIcon}>📦</Text>
                <Text style={s.swipeLabel}>{item.archived ? 'Unarc' : 'Archive'}</Text>
              </TouchableOpacity>
            </View>
          );

          return (
            <Swipeable
              renderLeftActions={renderLeftActions}
              renderRightActions={renderRightActions}
              friction={2}
              leftThreshold={60}
              rightThreshold={60}
              onSwipeableWillOpen={(ref) => {
                if (openSwipeRef.current && openSwipeRef.current !== ref) {
                  openSwipeRef.current.close();
                }
                openSwipeRef.current = ref;
              }}>
              <TouchableOpacity
                style={[s.row, { borderBottomColor: border, backgroundColor: bg }, item.pinned && { backgroundColor: card }]}
                onPress={async () => {
                  taptic();
                  // Opening a chat auto-clears the manually-marked-unread flag.
                  if (item.markedUnread) {
                    const updated = chats.map(c =>
                      sameChat(c, item) ? { ...c, markedUnread: false } : c,
                    );
                    saveChats(updated);
                  }
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
                {/* Time + unread indicator */}
                <View style={s.rightCol}>
                  <Text style={[s.time, { color: sub }]}>{item.time || ''}</Text>
                  {(item.unread > 0 || item.markedUnread) && (
                    <View style={[s.unreadDot, { backgroundColor: accent }]}>
                      <Text style={s.unreadTx}>
                        {item.unread > 99 ? '99+' : (item.unread || '')}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </Swipeable>
          );
        }}
        ListEmptyComponent={<EmptyState />}
        ListFooterComponent={
          archived.length > 0 ? (
            <TouchableOpacity
              style={[s.archivedRow, { borderTopColor: border }]}
              onPress={() => { taptic(); setShowArchived(v => !v); }}>
              <Text style={{ color: sub, fontSize: 14 }}>
                📦 Archived ({archived.length}) {showArchived ? '▾' : '▸'}
              </Text>
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
            <TouchableOpacity
              style={[s.actionBtn, { borderBottomColor: border }]}
              onPress={() => { toggleUnreadAt(selected); setActionModal(false); }}>
              <Text style={[s.actionText, { color: tx }]}>
                {selected?.markedUnread ? '● Mark as Read' : '● Mark as Unread'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, { borderBottomColor: border }]} onPress={toggleVaultForSelected}>
              <Text style={[s.actionText, { color: tx }]}>
                {selected && vaultedSet.has(chatId(selected)) ? '🛡️ Remove from Vault' : '🛡️ Move to Vault'}
              </Text>
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

      {/* Vault PIN prompt — appears when the user long-presses the
          "Chats" title. Hidden gesture by design so the existence of
          the vault feature isn't obvious to a snooper. Returning to
          the normal list happens by long-pressing the title again
          (which calls lockVault). */}
      <Modal visible={vaultPinModal} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setVaultPinModal(false)}>
          <View style={[s.actionBox, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.actionTitle, { color: tx }]}>Enter Vault PIN</Text>
            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
              <TextInput
                style={{
                  borderWidth: 1, borderColor: border, borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 10,
                  color: tx, backgroundColor: inputBg,
                  fontSize: 18, textAlign: 'center', letterSpacing: 8,
                }}
                value={vaultPinInput}
                onChangeText={(t) => { setVaultPinInput(t); setVaultPinError(''); }}
                placeholder="••••"
                placeholderTextColor={sub}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
                autoFocus
              />
              {vaultPinError ? (
                <Text style={{ color: '#ff4444', textAlign: 'center', marginTop: 8 }}>{vaultPinError}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={[s.actionBtn, { borderBottomColor: border, borderTopWidth: 1, borderTopColor: border }]}
              onPress={submitVaultPin}>
              <Text style={[s.actionText, { color: accent, fontWeight: '700' }]}>Unlock</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={() => setVaultPinModal(false)}>
              <Text style={[s.actionText, { color: sub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Premium upsell — fired by paywalled folder taps. On
          successful subscribe, refresh the premium flag so the
          gate stops bouncing the user. */}
      <PremiumModal
        visible={premiumModalVis}
        onClose={() => setPremiumModalVis(false)}
        onUpgraded={() => isPremiumUser().then(setPremium)}
        colors={{ card, text: tx, muted: sub, border }}
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

  // Swipe action buttons — reveal behind a chat row when the user
  // swipes horizontally. Color-coded: accent for pin, indigo for
  // mark-unread, gray for archive. Fixed-width so multi-button
  // groups don't resize weirdly when content changes.
  swipeAction:      { width: 88, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  swipeIcon:        { fontSize: 22, color: '#fff' },
  swipeLabel:       { fontSize: 11, color: '#fff', marginTop: 4, fontWeight: '600' },
  overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  actionBox:        { width: '80%', borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  actionTitle:      { fontSize: 16, fontWeight: 'bold', padding: 16, textAlign: 'center' },
  actionBtn:        { padding: 16, borderBottomWidth: 1, alignItems: 'center' },
  actionText:       { fontSize: 16, fontWeight: '500' },
  // Folder pill row (task #82). Compact horizontal bar between the
  // header and the search input. Each pill is rounded with the
  // accent color when active.
  folderRow:        { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  folderPill:       {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 18, borderWidth: 1,
  },
});
