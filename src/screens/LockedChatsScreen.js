// ============================================================
//  LockedChatsScreen — premium-gated dedicated page for vaulted
//  conversations.
//
//  Layout (matches the Vaultchat Premium mockup):
//    ┌─────────────────────────────┐
//    │  ‹  Locked Chats     Select │  header
//    │  🔍  Search locked chats…   │  search bar
//    │  ┌───────────────────────┐  │  info banner
//    │  │ 🔒 These chats are    │  │
//    │  │    locked and hidden  │  │
//    │  └───────────────────────┘  │
//    │  • Isabella Rossi    9:41AM │  list rows
//    │  • Michael Lee       9:30AM │
//    │  ...                        │
//    │  ┌───────────────────────┐  │
//    │  │  🔒  Add to Vault     │  │  bottom CTA
//    │  └───────────────────────┘  │
//    └─────────────────────────────┘
//
//  Data source: AsyncStorage `vaultchat_chats` (the same store the
//  main Chats list reads). We filter to entries whose chat id is
//  in the vault index (services/vault.listVaultedIds), so this
//  screen is a focused view of the same source-of-truth data.
//
//  Select mode: tap "Select" in the header to enter multi-select.
//  Tapping rows then toggles a checkbox. The bottom CTA flips to
//  "Remove from Vault" while in select mode and acts on the
//  selected ids. Tap "Done" to exit.
//
//  Add to Vault: when not in select mode, the bottom CTA opens a
//  picker of NON-vaulted chats so the user can mark more
//  conversations as private. We reuse the same chats list and
//  call vault.addToVault for each picked id.
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput,
  Image, Alert, Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import {
  listVaultedIds, addToVault, removeFromVault, isUnlocked,
} from '../services/vault';
import VaultPinPrompt from '../components/VaultPinPrompt';

const CHATS_KEY = 'vaultchat_chats';

function chatId(c) { return c.id || c.roomId || c.handle || c.phone || ''; }

export default function LockedChatsScreen({ navigation }) {
  const { bg, card, tx, sub, border, accent, inputBg } = useTheme();

  const [allChats,  setAllChats]  = useState([]);
  const [vaultedIds, setVaultedIds] = useState([]);
  const [search,    setSearch]    = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected,   setSelected]   = useState(new Set());
  const [pickerVisible, setPickerVisible] = useState(false);
  // PIN prompt — opened when a free user (or a premium user who
  // has locked the vault again) taps a locked row before unlocking.
  const [pinPromptOpen,  setPinPromptOpen]  = useState(false);
  // The chat the user wanted to open before getting bounced to the
  // PIN prompt — auto-navigated once unlock succeeds.
  const [pendingOpen,    setPendingOpen]    = useState(null);

  const reload = useCallback(async () => {
    const raw = await AsyncStorage.getItem(CHATS_KEY).catch(() => null);
    setAllChats(raw ? JSON.parse(raw) : []);
    setVaultedIds(await listVaultedIds().catch(() => []));
  }, []);

  useEffect(() => {
    reload();
    const unsub = navigation.addListener('focus', reload);
    return unsub;
  }, [navigation, reload]);

  // Locked chats = the subset of allChats whose id is in the vault index.
  const vaultedSet = new Set(vaultedIds);
  const lockedChats = allChats.filter(c => vaultedSet.has(chatId(c)));

  // Free-text filter (name + last message preview)
  const q = search.trim().toLowerCase();
  const filtered = q
    ? lockedChats.filter(c => {
        const name = (c.name || c.handle || c.phone || '').toLowerCase();
        const last = (c.lastMessage || c.preview || '').toLowerCase();
        return name.includes(q) || last.includes(q);
      })
    : lockedChats;

  function toggleSelected(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  async function onRemoveSelected() {
    if (selected.size === 0) {
      Alert.alert('Nothing selected', 'Tap rows to mark them, then try again.');
      return;
    }
    Alert.alert(
      `Remove ${selected.size} chat${selected.size === 1 ? '' : 's'}?`,
      'They will go back to your main chats list. The conversation history is not deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            for (const id of selected) {
              try { await removeFromVault(id); } catch {}
            }
            setSelected(new Set());
            setSelectMode(false);
            await reload();
          },
        },
      ],
    );
  }

  async function onAddPicked(ids) {
    for (const id of ids) {
      try { await addToVault(id); } catch {}
    }
    setPickerVisible(false);
    await reload();
  }

  // ── Render row ────────────────────────────────────────────
  function renderRow({ item }) {
    const id = chatId(item);
    const name = item.name || item.handle || item.phone || 'Unknown';
    const time = item.time || '';
    const preview = item.lastMessage || item.preview || '';
    const isSel = selected.has(id);

    return (
      <TouchableOpacity
        style={[s.row, { borderBottomColor: border }]}
        onPress={() => {
          if (selectMode) { toggleSelected(id); return; }
          // Tap a locked chat → open it, but only if vault is unlocked.
          // Otherwise stash the target and prompt for the PIN inline —
          // on success we navigate straight into the chat instead of
          // making the user tap again.
          const target = {
            roomId: item.roomId,
            recipientPhone: item.phone,
            recipientName: name,
            recipientPhoto: item.photo,
          };
          if (!isUnlocked()) {
            setPendingOpen(target);
            setPinPromptOpen(true);
            return;
          }
          navigation.navigate('ChatRoom', target);
        }}
        onLongPress={() => {
          if (!selectMode) { setSelectMode(true); toggleSelected(id); }
        }}
        delayLongPress={350}>
        <View style={[s.avatar, { backgroundColor: accent + '33' }]}>
          {item.photo
            ? <Image source={{ uri: item.photo }} style={s.avatarImg} />
            : <Text style={{ color: accent, fontWeight: '700', fontSize: 18 }}>
                {name[0]?.toUpperCase()}
              </Text>}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[s.name, { color: tx }]} numberOfLines={1}>{name}</Text>
          {preview ? <Text style={[s.preview, { color: sub }]} numberOfLines={1}>{preview}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.time, { color: sub }]}>{time}</Text>
          {selectMode && (
            <View style={[s.checkbox, { borderColor: accent, backgroundColor: isSel ? accent : 'transparent' }]}>
              {isSel ? <Text style={s.checkboxTx}>✓</Text> : null}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={[s.backTx, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: tx }]}>Locked Chats</Text>
        <TouchableOpacity
          onPress={() => {
            if (selectMode) { setSelected(new Set()); setSelectMode(false); }
            else setSelectMode(true);
          }}>
          <Text style={[s.selectBtn, { color: accent }]}>
            {selectMode ? 'Done' : 'Select'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[s.searchBar, { backgroundColor: inputBg, borderColor: border }]}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={[s.searchInput, { color: tx }]}
          placeholder="Search locked chats"
          placeholderTextColor={sub}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={{ color: sub, fontSize: 16, paddingHorizontal: 6 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Info banner */}
      <View style={[s.banner, { backgroundColor: accent + '14', borderColor: accent + '33' }]}>
        <Text style={[s.bannerIcon, { color: accent }]}>🔒</Text>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[s.bannerTitle, { color: tx }]}>These chats are locked and hidden.</Text>
          <Text style={[s.bannerBody, { color: sub }]}>Only you can access them.</Text>
        </View>
      </View>

      {/* Locked chats list */}
      <FlatList
        data={filtered}
        keyExtractor={(item, i) => chatId(item) || String(i)}
        renderItem={renderRow}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={{ fontSize: 56, marginBottom: 12 }}>🔒</Text>
            <Text style={[s.emptyTitle, { color: tx }]}>No locked chats yet</Text>
            <Text style={[s.emptySub,   { color: sub }]}>
              Tap "Add to Vault" below to lock a conversation.
            </Text>
          </View>
        }
      />

      {/* Bottom CTA — purple Add to Vault, or destructive Remove if select mode */}
      <View style={s.ctaWrap} pointerEvents="box-none">
        <TouchableOpacity
          style={[s.cta, { backgroundColor: selectMode ? '#dc2626' : accent }]}
          onPress={() => selectMode ? onRemoveSelected() : setPickerVisible(true)}>
          <Text style={s.ctaIcon}>🔒</Text>
          <Text style={s.ctaTx}>
            {selectMode ? `Remove ${selected.size} from Vault` : 'Add to Vault'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Add-to-Vault picker — list of non-vaulted chats */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerVisible(false)}>
        <View style={s.pickerBackdrop}>
          <View style={[s.pickerSheet, { backgroundColor: card }]}>
            <View style={[s.pickerHeader, { borderBottomColor: border }]}>
              <TouchableOpacity onPress={() => setPickerVisible(false)}>
                <Text style={{ color: sub, fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[s.pickerTitle, { color: tx }]}>Add to Vault</Text>
              <View style={{ width: 50 }} />
            </View>
            <FlatList
              data={allChats.filter(c => !vaultedSet.has(chatId(c)))}
              keyExtractor={(item, i) => chatId(item) || String(i)}
              renderItem={({ item }) => {
                const id = chatId(item);
                const name = item.name || item.handle || item.phone || 'Unknown';
                return (
                  <TouchableOpacity
                    style={[s.row, { borderBottomColor: border }]}
                    onPress={() => onAddPicked([id])}>
                    <View style={[s.avatar, { backgroundColor: accent + '33' }]}>
                      {item.photo
                        ? <Image source={{ uri: item.photo }} style={s.avatarImg} />
                        : <Text style={{ color: accent, fontWeight: '700', fontSize: 18 }}>
                            {name[0]?.toUpperCase()}
                          </Text>}
                    </View>
                    <Text style={[s.name, { color: tx, marginLeft: 12, flex: 1 }]}>{name}</Text>
                    <Text style={{ color: accent, fontSize: 22 }}>＋</Text>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={s.empty}>
                  <Text style={[s.emptyTitle, { color: tx }]}>No chats to add</Text>
                  <Text style={[s.emptySub,   { color: sub }]}>Every conversation is already vaulted.</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Inline Vault PIN prompt — opens when the user taps a row
          while the vault is still locked. On success, navigate
          straight into the chat they were trying to open. */}
      <VaultPinPrompt
        visible={pinPromptOpen}
        onClose={() => { setPinPromptOpen(false); setPendingOpen(null); }}
        onUnlocked={() => {
          setPinPromptOpen(false);
          if (pendingOpen) {
            const target = pendingOpen;
            setPendingOpen(null);
            navigation.navigate('ChatRoom', target);
          }
        }}
        onSetup={() => navigation.navigate('Settings')}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1 },
  header:       {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn:      { padding: 4, marginRight: 6 },
  backTx:       { fontSize: 30, fontWeight: 'bold' },
  title:        { flex: 1, fontSize: 20, fontWeight: '800' },
  selectBtn:    { fontSize: 15, fontWeight: '700' },

  searchBar:    {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginTop: 12, marginBottom: 10,
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10,
  },
  searchIcon:   { fontSize: 14, marginRight: 8, opacity: 0.7 },
  searchInput:  { flex: 1, fontSize: 14 },

  banner:       {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 14, borderWidth: 1,
  },
  bannerIcon:   { fontSize: 20 },
  bannerTitle:  { fontSize: 13, fontWeight: '700' },
  bannerBody:   { fontSize: 12, marginTop: 1 },

  row:          {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar:       { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarImg:    { width: 46, height: 46, borderRadius: 23 },
  name:         { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  preview:      { fontSize: 13 },
  time:         { fontSize: 12 },
  checkbox:     {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginTop: 6,
  },
  checkboxTx:   { color: '#fff', fontSize: 13, fontWeight: '900' },

  empty:        { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle:   { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySub:     { fontSize: 13, textAlign: 'center' },

  ctaWrap:      { position: 'absolute', left: 0, right: 0, bottom: 24, paddingHorizontal: 20 },
  cta:          {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 24,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  ctaIcon:      { fontSize: 18, color: '#fff' },
  ctaTx:        { color: '#fff', fontSize: 16, fontWeight: '700' },

  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet:    { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', paddingBottom: 30 },
  pickerHeader:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerTitle:    { fontSize: 17, fontWeight: '800' },
});
