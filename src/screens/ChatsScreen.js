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
import { getMyHandle, displayHandle } from '../services/vaultHandle';
import { taptic, longPressFeedback } from '../services/haptics';
import { requestContactsPermission, syncContacts } from '../services/contacts';
import { listFolders, subscribe as subscribeFolders } from '../services/folders';
import { isPremiumUser } from '../services/adsService';
import PremiumModal from '../components/PremiumModal';
import PremiumCrown from '../components/PremiumCrown';
import { supabase } from '../services/supabase';
import {
  pullChatPrefs,
  readCachedPrefs,
  setChatPref,
  migrateLocalPrefsToServer,
} from '../services/chatPrefsSync';
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
import { subscribeMessageNew } from '../services/socket';
// Active-room tracker (set by ChatRoomScreen on focus). Used inside
// the message:new handler to skip incrementing unread badges for the
// room the user is currently viewing — otherwise the badge would
// flicker on for an instant before ChatRoomScreen's own handler
// clears it.
import { getActiveRoom } from '../services/activeRoom';

const CHATS_KEY = 'vaultchat_chats';

// EmptyState defined at MODULE level — not inside ChatsScreen — so its
// component type is stable across parent re-renders. The previous
// in-function definition created a new component reference on every
// ChatsScreen render, which made React unmount + remount the empty
// state on each render. That happened to break tap handlers entirely
// in some scenarios (the underlying native button view was tearing
// down before the touch could resolve). Stable type = stable taps.
function ChatsEmptyState({
  search, tx, sub, accent, navigation, loadChats,
  requestContactsPermission, syncContacts,
}) {
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
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="New message"
        onPress={() => {
          try { navigation.navigate('NewMessage'); } catch (e) { Alert.alert('Could not open New Message', e?.message || 'Please try again.'); }
          try { taptic(); } catch {}
        }}>
        <Text style={s.emptyBtnTx}>✏️  New Message</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.emptyBtnOutline, { borderColor: accent }]}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="Sync phone contacts"
        onPress={async () => {
          try { taptic(); } catch {}
          try {
            const granted = await requestContactsPermission();
            if (!granted) {
              Alert.alert('Permission needed', 'Enable Contacts access in Settings so VaultChat can find friends you already know.');
              return;
            }
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
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="Add a contact"
        onPress={() => {
          try { navigation.navigate('Contacts'); } catch (e) { Alert.alert('Could not open Contacts', e?.message || 'Please try again.'); }
          try { taptic(); } catch {}
        }}>
        <Text style={[s.emptyBtnOutlineTx, { color: accent }]}>👤  Add a Contact</Text>
      </TouchableOpacity>
    </View>
  );
}

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

  // My user id, used by the message:new handler to skip incrementing
  // unread badges for messages I sent from another device. Stored as
  // a ref so the handler can read the latest value without forcing
  // the socket subscription to tear down + re-attach when the user
  // signs in mid-session.
  const myIdRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled && session?.user?.id) {
          myIdRef.current = session.user.id;
        }
      } catch {}
    })();
    // Refresh on auth state changes (sign-in, token refresh, sign-out).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      myIdRef.current = session?.user?.id || null;
    });
    return () => {
      cancelled = true;
      try { subscription?.unsubscribe?.(); } catch {}
    };
  }, []);

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

  // Feature 3 (cold-message UX): global subscription to message:new
  // events fanned out by the server when ANY room you're a member of
  // receives a new message. This is what lets Adam → Jesse "first
  // contact" messages appear in Jesse's chat list immediately even
  // though Jesse has never opened the chat (no per-room INSERT
  // subscription is active for an unknown room). When a message:new
  // arrives, we either bump the existing row (lastMessage + time +
  // sort to top) or insert a brand new chat row using the sender
  // metadata the server fanned out alongside the event.
  //
  // Stays subscribed for the lifetime of the ChatsScreen component
  // (which is essentially app lifetime — it's a tab in the bottom
  // navigator). Re-subscribes survive socket reconnects because
  // socket.io preserves listeners across the reconnect cycle.
  useEffect(() => {
    const cleanup = subscribeMessageNew((evt) => {
      try {
        if (!evt || !evt.roomId || !evt.senderId) return;
        // 1.0.14 group badges: server now stamps roomType in fan-out.
        // Skip group events here — GroupScreen has a parallel handler
        // that owns the group-list updates. Without this filter, group
        // messages would create fake DM rows in the 1:1 list (since
        // roomId wouldn't match any existing 1:1 chat). Old servers
        // (pre-1.0.14) didn't include roomType, so undefined falls
        // through and behaves as a 1:1 — that's fine because old
        // servers also never fanned out for groups (no rooms row).
        if (evt.roomType === 'group') return;

        // iMessage-style unread badge logic. We INCREMENT chat.unread
        // on every incoming message:new, EXCEPT when:
        //   (a) the message was sent by ME from another device
        //       (senderId === myId) — own messages are never unread.
        //   (b) the user is currently viewing that very chat
        //       (getActiveRoom() === roomId) — they're reading it
        //       in real time, so the badge would just flicker on
        //       and immediately get cleared.
        // Tap-to-open and ChatRoomScreen focus both reset the count
        // to zero (see row-tap onPress further below + the
        // useFocusEffect inside ChatRoomScreen).
        const myId = myIdRef.current;
        const shouldIncrementUnread =
          evt.senderId !== myId && !(getActiveRoom() === evt.roomId);

        // Use the functional setState so we don't race with other
        // updaters (loadChats running in parallel, prefs sync, etc.)
        setChats(prev => {
          const list = Array.isArray(prev) ? prev.slice() : [];
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

          const idx = list.findIndex(c => c?.roomId === evt.roomId);
          if (idx >= 0) {
            // Existing chat — bump preview + time, leave name/photo
            // intact so the row doesn't flicker if sender info changed.
            const prevUnread = Number.isFinite(list[idx].unread) ? list[idx].unread : 0;
            const updated = {
              ...list[idx],
              lastMessage: lastPreview,
              time:        prettyTime,
              markedUnread: false,
              unread:      shouldIncrementUnread ? prevUnread + 1 : prevUnread,
            };
            list.splice(idx, 1);
            list.unshift(updated);
          } else {
            // Brand-new chat — Adam → Jesse first contact. Build the
            // row from the server-supplied sender metadata.
            const peerHandle = evt.senderHandle ? `@${String(evt.senderHandle).replace(/^@+/, '')}` : '';
            const peerName   = evt.senderName || peerHandle || 'VaultChat User';
            list.unshift({
              roomId:      evt.roomId,
              userId:      evt.senderId,
              phone:       evt.senderPhone || null,
              name:        peerName,
              handle:      peerHandle,
              photo:       null,
              lastMessage: lastPreview,
              time:        prettyTime,
              pinned:      false,
              hideAlerts:  false,
              unread:      shouldIncrementUnread ? 1 : 0,
            });
          }

          // Persist updated list. Fire-and-forget; setState already
          // committed for the UI render.
          AsyncStorage.setItem(CHATS_KEY, JSON.stringify(list)).catch(() => {});
          return list;
        });
      } catch (e) {
        if (__DEV__) console.warn('message:new handler failed:', e?.message);
      }
    });
    return cleanup;
  }, []);

  // Phase OO: cross-device sync for pin/archive/folder/hide-alerts.
  // We OVERLAY the server-backed pref map onto the locally-stored
  // chat objects (which still own name/lastMessage/time/etc). This
  // means a chat's pin state is the same on every install of the
  // user's account — no more "lost my pins on reinstall" complaints.
  async function loadChats() {
    const saved = await AsyncStorage.getItem(CHATS_KEY);
    let chatsLocal = saved ? JSON.parse(saved) : [];
    // Apply the cached prefs map for first paint, then refresh from
    // the server in the background.
    try {
      const cachedPrefs = await readCachedPrefs();
      if (cachedPrefs) chatsLocal = applyPrefsMap(chatsLocal, cachedPrefs);
    } catch {}
    setChats(chatsLocal);
    // Background server pull (non-blocking).
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const myId = session?.user?.id;
        if (!myId) return;
        // One-time legacy upload — idempotent on repeat.
        migrateLocalPrefsToServer(myId).catch(() => {});
        const fresh = await pullChatPrefs(myId);
        setChats(prev => applyPrefsMap(prev, fresh));
        // Task #99 — rooms hydration. Closes the "got a push but my
        // Chats list is empty" gap when an app is killed and FCM wakes
        // it for a notification but the user opens the app from the
        // launcher icon instead of tapping the notification. AsyncStorage
        // has no chat row for that room (only the per-room INSERT
        // subscription inside ChatRoomScreen seeds it on first open),
        // so the list renders blank. Fix: query Supabase `rooms` for
        // every direct room I'm a member of, then upsert into local
        // list with peer info from `profiles`. message:new still drives
        // realtime updates; this only covers the cold-start gap.
        try {
          const { data: rooms } = await supabase
            .from('rooms')
            .select('id, type, member_ids, created_at')
            .eq('type', 'direct')
            .contains('member_ids', [myId])
            .order('created_at', { ascending: false })
            .limit(200);  // sane cap; users won't have >200 1:1 rooms
          if (!Array.isArray(rooms) || rooms.length === 0) return;
          // Collect peer ids — for direct rooms each room has 2
          // member_ids, the OTHER one is the peer. De-dupe in case
          // the same peer appears in multiple rooms (shouldn't happen
          // with deterministic hashPair roomIds but robustness).
          const peerIdSet = new Set();
          for (const r of rooms) {
            const ids = Array.isArray(r.member_ids) ? r.member_ids : [];
            for (const m of ids) if (m && m !== myId) peerIdSet.add(m);
          }
          const peerIds = Array.from(peerIdSet);
          if (peerIds.length === 0) return;
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, display_name, vault_handle, phone')
            .in('user_id', peerIds);
          const profileById = {};
          for (const p of (profiles || [])) profileById[p.user_id] = p;
          // Functional setState so we merge against the latest list
          // (race-safe with concurrent message:new updaters).
          setChats(prev => {
            const list = Array.isArray(prev) ? prev.slice() : [];
            const existingRoomIds = new Set(list.map(c => c?.roomId));
            let dirty = false;
            for (const r of rooms) {
              if (existingRoomIds.has(r.id)) continue;
              const memberIds = Array.isArray(r.member_ids) ? r.member_ids : [];
              const peerId = memberIds.find(m => m && m !== myId);
              if (!peerId) continue;
              const p = profileById[peerId];
              if (!p) continue;  // skip if peer profile missing — they
                                  // probably deleted their account
              const peerHandle = p.vault_handle ? `@${String(p.vault_handle).replace(/^@+/, '')}` : '';
              const peerName   = p.display_name || peerHandle || 'VaultChat User';
              list.push({
                roomId:      r.id,
                userId:      peerId,
                phone:       p.phone || null,
                name:        peerName,
                handle:      peerHandle,
                photo:       null,
                lastMessage: 'Tap to chat',
                time:        '',
                pinned:      false,
                hideAlerts:  false,
                unread:      0,  // hydration is for COLD start; live
                                  // unread accumulation comes via
                                  // message:new from this point on.
              });
              dirty = true;
            }
            if (!dirty) return prev;
            AsyncStorage.setItem(CHATS_KEY, JSON.stringify(list)).catch(() => {});
            return list;
          });
        } catch (e) {
          if (__DEV__) console.warn('rooms hydration failed:', e?.message);
        }
      } catch {}
    })();
  }

  function applyPrefsMap(list, prefs) {
    if (!prefs || !Array.isArray(list)) return list;
    return list
      .map(c => {
        const key = c.roomId || c.id;
        const p = key && prefs[key];
        if (!p) return c;
        return {
          ...c,
          pinned:       !!p.pinned,
          archived:     !!p.archived,
          hideAlerts:   !!p.hideAlerts,
          markedUnread: !!p.markedUnread,
          folderId:     p.folderId || null,
        };
      })
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
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

  // Phase OO helper: thin wrapper around setChatPref that resolves
  // the current user_id and silently no-ops when there's no auth
  // session (e.g. during sign-in/out transitions).
  async function syncPrefForRoom(roomId, patch) {
    if (!roomId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const myId = session?.user?.id;
      if (!myId) return;
      await setChatPref(myId, roomId, patch);
    } catch {}
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

  // ── Pin cap ─────────────────────────────────────────────
  // Free users can pin up to FREE_PIN_CAP chats; premium users get
  // unlimited (one of the headline subscription benefits). Unpin is
  // always free so a downgrade doesn't leave anyone stuck.
  const FREE_PIN_CAP = 3;
  async function togglePinAt(item) {
    taptic();
    const willPin = !item.pinned;
    if (willPin && !premium) {
      const currentlyPinned = chats.filter(c => c.pinned && !sameChat(c, item)).length;
      if (currentlyPinned >= FREE_PIN_CAP) {
        openSwipeRef.current?.close?.();
        setPremiumModalVis(true);
        return;
      }
    }
    const updated = chats
      .map(c => sameChat(c, item) ? { ...c, pinned: !c.pinned } : c)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    await saveChats(updated);
    // Phase OO: push the new pin state to user_chat_prefs so the
    // user's other devices get the same pinned chat after their next
    // pull (or via realtime in a future iteration).
    syncPrefForRoom(item.roomId || item.id, { pinned: !item.pinned }).catch(() => {});
    openSwipeRef.current?.close?.();
  }

  async function toggleArchiveAt(item) {
    taptic();
    const updated = chats.map(c =>
      sameChat(c, item) ? { ...c, archived: !c.archived } : c
    );
    await saveChats(updated);
    syncPrefForRoom(item.roomId || item.id, { archived: !item.archived }).catch(() => {});
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
    // Mirror the swipe-pin gate so the long-press menu also enforces
    // the free 3-pin cap. Premium users have unlimited pins.
    const willPin = !selected?.pinned;
    if (willPin && !premium) {
      // Bug fix (2026-04-29): was filtering with `c.id !== selected.id`,
      // which collides when multiple chats have no id field (only
      // roomId) — `undefined !== undefined` is false so the count
      // omitted unrelated chats. Use sameChat so the comparison
      // falls back through roomId.
      const currentlyPinned = chats.filter(c => c.pinned && !sameChat(c, selected)).length;
      if (currentlyPinned >= FREE_PIN_CAP) {
        setActionModal(false);
        setTimeout(() => setPremiumModalVis(true), 200);
        return;
      }
    }
    // Bug fix (2026-04-29): was `c.id === selected.id`, which
    // matched ALL chats whose id was undefined when selected.id was
    // also undefined — pinning one chat secretly pinned every
    // id-less chat. Use sameChat so the match falls back through
    // roomId, never matching across distinct rooms.
    const updated = chats
      .map(c => sameChat(c, selected) ? { ...c, pinned: !c.pinned } : c)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    await saveChats(updated);
    syncPrefForRoom(selected?.roomId || selected?.id, { pinned: !selected?.pinned }).catch(() => {});
    setActionModal(false);
  }

  async function archiveChat() {
    // Same bug class as pinChat — use sameChat instead of `c.id ===`
    // so id-less chats don't all flip together.
    const updated = chats.map(c =>
      sameChat(c, selected) ? { ...c, archived: !c.archived } : c
    );
    await saveChats(updated);
    syncPrefForRoom(selected?.roomId || selected?.id, { archived: !selected?.archived }).catch(() => {});
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
        // Same bug class as pinChat — use sameChat so id-less chats
        // don't all delete together when one is selected.
        await saveChats(chats.filter(c => !sameChat(c, selected)));
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
  const folderChatIds = (selectedFolderId && selectedFolderId !== '__unread')
    ? new Set((folders.find(f => f.id === selectedFolderId)?.chatIds) || [])
    : null;
  const inSelectedFolder = (c) => {
    // Special-case "__unread" — show only chats with unread > 0 OR
    // the user-marked-unread flag. Matches the mockup's Unread chip
    // behavior. Other folders use the existing chatIds set.
    if (selectedFolderId === '__unread') {
      return (c.unread > 0) || !!c.markedUnread;
    }
    if (!folderChatIds) return true;
    const id = c.id || c.roomId || c.handle;
    return folderChatIds.has(id);
  };
  // Unread count for the chip badge — simple count of non-archived
  // chats with unread > 0 or markedUnread. Doesn't filter by vault
  // mode (the badge stays accurate whether vault is locked or not).
  const unreadCount = chats.reduce((acc, c) => {
    if (c.archived) return acc;
    return acc + ((c.unread > 0 || c.markedUnread) ? 1 : 0);
  }, 0);

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

  // EmptyState moved to module-level (ChatsEmptyState above the
  // default export) so its component type is stable across renders
  // — fixes the dead-button issue where TouchableOpacities were
  // tearing down before the touch could resolve.

  // Premium polish — when the user is a subscriber, the header band
  // adopts the deep-purple gradient backdrop from Harold's mockup
  // ("VaultChat 👑" hero), the title goes white-on-purple, and the
  // header buttons swap to translucent-white tiles. Free users keep
  // the existing flat header so the upgrade visibly changes the app.
  const headerBg     = premium ? '#5B2FB8' : bg;
  const headerTitleC = premium ? '#FFFFFF' : (vaultUnlocked ? '#10B981' : accent);
  const headerHandleC= premium ? 'rgba(255,255,255,0.7)' : '#5856d6';
  const headerBtnBg  = premium ? 'rgba(255,255,255,0.18)' : accent + '22';
  const headerBtnBd  = premium ? 'rgba(255,255,255,0.30)' : accent + '55';
  const headerIconC  = premium ? '#FFFFFF' : accent;

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: headerBg, borderBottomColor: premium ? 'transparent' : border }]}>
        <TouchableOpacity onLongPress={onTitleLongPress} delayLongPress={500} activeOpacity={1}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[s.title, { color: headerTitleC }]}>
              {vaultUnlocked ? '🛡️ Vault' : 'Chats'}
            </Text>
            {/* Crown next to MY title when I'm premium — matches the
                "VaultChat 👑" branding from the mockup. Only renders
                for paying users so the crown stays meaningful. We
                pass the parent's tracked `premium` state directly so
                the crown lights up the moment a purchase completes
                (PremiumModal.onUpgraded refreshes it). */}
            <PremiumCrown isPremium={premium} size={20} />
          </View>
          {myHandle ? <Text style={[s.handle, { color: headerHandleC }]}>{displayHandle(myHandle)}</Text> : null}
        </TouchableOpacity>
        {/* Premium consolidates the two header icons into a single
            edit/new-message button to match the mockup's cleaner
            top-right. Free users keep both buttons (Contacts + new
            message) since they don't have the bottom-tab Vault entry
            point and need quicker access to Contacts. */}
        {!premium && (
          <TouchableOpacity
            style={[s.iconBtn, { backgroundColor: headerBtnBg, borderColor: headerBtnBd }]}
            onPress={() => { taptic(); navigation.navigate('Contacts'); }}>
            <Text style={{ fontSize: 15 }}>👤</Text>
            <Text style={[s.iconBtnPlus, { color: headerIconC }]}>+</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.iconBtn, { backgroundColor: headerBtnBg, borderColor: headerBtnBd }]}
          accessibilityLabel="New message"
          // Generous hitSlop — the icon is small (36×36) and sits at
          // the screen edge in premium mode where the floating search
          // bar / pulled tab encroach. Pad the tap area so missing it
          // by a few pixels still registers.
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => {
            // Fire the navigation FIRST so the button feels responsive
            // even if haptics or some other side-effect throws. taptic
            // is best-effort.
            navigation.navigate('NewMessage');
            try { taptic(); } catch {}
          }}>
          <Text style={{ fontSize: 18 }}>✏️</Text>
        </TouchableOpacity>
      </View>

      {/* Premium-only: floating translucent search bar inside the
          purple header band. Updated 2026-04-30 to match the new
          mockup — paddingBottom dropped from 40 → 14 since we no
          longer need a "shoulder" for the white pulled-tab to
          overlap into. The chip row + chat list now flow directly
          on bg below the header, no curve. */}
      {premium && (
        <View style={{
          backgroundColor: headerBg,           // purple, extends header band down
          paddingHorizontal: 16,
          paddingBottom: 14,
          paddingTop: 4,
        }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.18)',
            borderRadius: 14,
            paddingHorizontal: 14, paddingVertical: 12,
          }}>
            <Text style={{ fontSize: 14, marginRight: 8, color: 'rgba(255,255,255,0.85)' }}>🔍</Text>
            <TextInput
              style={{ flex: 1, color: '#ffffff', fontSize: 14 }}
              placeholder="Search"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, paddingHorizontal: 6 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Folder pill row — Telegram-style. Always shows "All" + the
          user's custom folders + a "+" pill that opens FoldersScreen.
          Custom folders are gated behind premium (handled by
          onFolderPillPress); the pills are visible either way so
          non-premium users discover the upsell naturally.

          Premium chrome (replaced 2026-04-30 per Harold's mockup
          review): the previous "pulled white tab" treatment with
          marginTop:-24 + borderTopRadius:44 has been removed in
          favor of the cleaner uniform-canvas look in the new
          mockup. The chip row now flows directly from the purple
          header into the rest of the screen on the bg color, no
          curve, matching the mockup exactly. */}
      <View style={[
        s.folderRow,
        { borderBottomColor: border },
        premium && {
          backgroundColor: bg,
          paddingTop: 12,
          paddingBottom: 10,
          borderBottomWidth: 0,
        },
      ]}>
        <FlatList
          horizontal
          data={[
            { id: null,        name: 'All',    emoji: null },
            { id: '__unread',  name: 'Unread', emoji: null, badge: unreadCount },
            { id: '__groups',  name: 'Groups', emoji: '👥' },
            ...folders,
            { id: '__vault',   name: 'Vault',  emoji: '🔒' },
            { id: '__manage',  name: 'Manage', emoji: '⚙️' },
          ]}
          keyExtractor={f => f.id || 'all'}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
          renderItem={({ item }) => {
            if (item.id === '__unread') {
              const active = selectedFolderId === '__unread';
              return (
                <TouchableOpacity
                  onPress={() => { taptic(); setSelectedFolderId(active ? null : '__unread'); }}
                  style={[
                    s.folderPill,
                    { backgroundColor: active ? accent : inputBg, borderColor: active ? accent : border },
                  ]}>
                  <Text style={{ color: active ? '#fff' : tx, fontSize: 13, fontWeight: '600' }}>Unread</Text>
                  {item.badge > 0 && (
                    <View style={{
                      backgroundColor: active ? 'rgba(255,255,255,0.25)' : accent,
                      borderRadius: 10, minWidth: 20, height: 20,
                      paddingHorizontal: 6,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                        {item.badge > 99 ? '99+' : item.badge}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }
            if (item.id === '__groups') {
              // Groups shortcut — jumps to the Groups bottom tab.
              // Lives next to All so users can pivot between 1:1
              // chats and group chats without diving into the tab
              // bar at the bottom of the screen.
              return (
                <TouchableOpacity
                  onPress={() => { taptic(); navigation.navigate('Groups'); }}
                  style={[s.folderPill, { backgroundColor: inputBg, borderColor: border }]}>
                  <Text style={{ fontSize: 14 }}>👥</Text>
                  <Text style={{ color: sub, fontSize: 13, fontWeight: '600' }}>Groups</Text>
                </TouchableOpacity>
              );
            }
            if (item.id === '__vault') {
              // Vault pill — premium gated. Tapping when non-premium opens
              // the upgrade modal so the lock icon serves as a soft upsell;
              // premium users get routed straight to the dashboard.
              return (
                <TouchableOpacity
                  onPress={() => {
                    taptic();
                    if (!premium) { setPremiumModalVis(true); return; }
                    navigation.navigate('Vault');
                  }}
                  style={[s.folderPill, { backgroundColor: inputBg, borderColor: border }]}>
                  <Text style={{ fontSize: 14 }}>🔒</Text>
                  <Text style={{ color: sub, fontSize: 13, fontWeight: '600' }}>Vault</Text>
                  {!premium && <Text style={{ color: accent, fontSize: 11 }}>👑</Text>}
                </TouchableOpacity>
              );
            }
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

      {/* Search bar — free-tier placement (below chip row). Premium
          users get this same search above the chip row instead, so we
          skip it here when premium is on. */}
      {!premium && (
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
      )}

      {/* Chat list — performance tuning:
            - removeClippedSubviews drops off-screen rows from the
              native view tree, lower memory + smoother scroll on
              long lists
            - initialNumToRender sized for typical viewport (8 rows)
              so first paint isn't blocked drawing 50+ rows
            - maxToRenderPerBatch + windowSize keep scroll catch-up
              from janking the JS thread
            - keyboardShouldPersistTaps='handled' lets pin/archive
              swipe actions still register when the keyboard is up */}
      <FlatList
        data={listData}
        keyExtractor={(item, i) => item.id || item.roomId || i.toString()}
        removeClippedSubviews
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={9}
        updateCellsBatchingPeriod={40}
        keyboardShouldPersistTaps="handled"
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
                  // Opening a chat clears BOTH the manually-marked-unread
                  // flag AND the auto-incremented unread count (the
                  // server-driven badge from message:new). We collapse
                  // both clears into a single saveChats call to keep the
                  // tap snappy and persist atomically.
                  const needsClear = item.markedUnread || (item.unread || 0) > 0;
                  if (needsClear) {
                    const updated = chats.map(c =>
                      sameChat(c, item) ? { ...c, markedUnread: false, unread: 0 } : c,
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
                    <PremiumCrown phone={item.phone} size={13} />
                  </View>
                  {item.handle
                    ? <Text style={[s.subHandle, { color: '#5856d6' }]}>{displayHandle(item.handle)}</Text>
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
        ListEmptyComponent={
          <ChatsEmptyState
            search={search}
            tx={tx} sub={sub} accent={accent}
            navigation={navigation}
            loadChats={loadChats}
            requestContactsPermission={requestContactsPermission}
            syncContacts={syncContacts}
          />
        }
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
