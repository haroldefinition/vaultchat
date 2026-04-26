import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert,
  Modal, KeyboardAvoidingView, Platform, ScrollView, Share, Image, ActivityIndicator,
} from 'react-native';
import { useTheme } from '../services/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { getMyHandle, findByHandleOrPhone } from '../services/vaultHandle';
import { hashPair } from '../services/placeCall';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { uploadMedia } from '../services/mediaUpload';

const GIFS = [
  { emoji: '😂', name: 'Haha',  msg: '😂' },
  { emoji: '🎉', name: 'Party', msg: '🎉' },
  { emoji: '👋', name: 'Wave',  msg: '👋' },
  { emoji: '🔥', name: 'Fire',  msg: '🔥' },
  { emoji: '💯', name: '100',   msg: '💯' },
  { emoji: '🤯', name: 'Wow',   msg: '🤯' },
  { emoji: '👀', name: 'Eyes',  msg: '👀' },
  { emoji: '💪', name: 'Flex',  msg: '💪' },
  { emoji: '😎', name: 'Cool',  msg: '😎' },
  { emoji: '🥳', name: 'Party', msg: '🥳' },
  { emoji: '❤️', name: 'Love',  msg: '❤️' },
  { emoji: '🏆', name: 'Win',   msg: '🏆' },
  { emoji: '😭', name: 'Cry',   msg: '😭' },
  { emoji: '🤣', name: 'Lol',   msg: '🤣' },
  { emoji: '💀', name: 'Dead',  msg: '💀' },
  { emoji: '🫶', name: 'Love',  msg: '🫶' },
];
const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','☺️',
  '😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😏','😒','🙄','😬',
  '😌','😔','😪','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎',
  '😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱',
  '🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👻','👽','👾','🤖',
  '👋','✋','👌','✌️','🤞','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','👏','🙌','🫶','🙏','💪',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❤️‍🔥','💕','💗','💖','💘',
  '🎉','🎊','🎁','🎀','🏆','🥇','🎯','🎲','🎮','🎵','🎶',
  '🌸','🌺','🌻','🌹','💐','🌿','☘️','🍀','🦋','🐶','🐱',
  '🍕','🍔','🌮','🍜','🍣','🍦','🎂','🍰','☕',
  '🚀','✈️','🏠','🌍','🌈','⭐','🌙','☀️','⚡','🔥','💥','❄️','💎','💯','✨',
];


function generateRoomId(phone1, phone2) {
  const sorted = [phone1.replace(/\D/g,''), phone2.replace(/\D/g,'')].sort();
  const combined = sorted[0] + sorted[1];
  let h1 = 0, h2 = 0;
  for (let i = 0; i < combined.length; i++) {
    h1 = Math.imul(31, h1) + combined.charCodeAt(i) | 0;
    h2 = Math.imul(37, h2) + combined.charCodeAt(i) | 0;
  }
  const a = Math.abs(h1).toString(16).padStart(8, '0');
  const b = Math.abs(h2).toString(16).padStart(8, '0');
  const c = Math.abs(h1 ^ h2).toString(16).padStart(8, '0');
  return `${a.slice(0,8)}-${b.slice(0,4)}-4${b.slice(1,4)}-a${c.slice(0,3)}-${a}${b.slice(0,4)}`;
}

// ── Emoji picker panel ────────────────────────────────────────

export default function NewMessageScreen({ navigation, route }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [toInput,       setToInput]       = useState('');
  const [msg,           setMsg]           = useState('');
  const [user,          setUser]          = useState(null);
  const [selectedName,  setSelectedName]  = useState('');
  const [myHandle,      setMyHandle]      = useState('');
  // Attachment modals — exact mirror of ChatRoomScreen
  const [attachModal,   setAttachModal]   = useState(false);
  const [gifModal,      setGifModal]      = useState(false);
  const [emojiModal,    setEmojiModal]    = useState(false);
  const [emojiTab,      setEmojiTab]      = useState('emoji');

  const [stagedPhotos,  setStagedPhotos]  = useState([]);   // [{uri, key}]
  const [stagedVideos,  setStagedVideos]  = useState([]);   // [{uri}]
  const [stagedFile,    setStagedFile]    = useState(null); // {name, uri}
  const [sending,       setSending]       = useState(false);
  const pendingAttach = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUser(session.user);
    }).catch(() => {});
    getMyHandle().then(h => { if (h) setMyHandle(h); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (route.params?.selectedContact) {
      const ct = route.params.selectedContact;
      setToInput(ct.handle || ct.phone || '');
      setSelectedName(ct.name || ct.firstName || '');
    }
  }, [route.params?.selectedContact]);

  // Share-extension intake (task #83). When the user picks
  // VaultChat from another app's iOS share sheet, App.js routes
  // here with a `shared` payload. We pre-stage it so the user
  // just has to pick a recipient and hit send. Text/URL go into
  // the message field; images/videos/files go into their staging
  // arrays so they ride the existing send paths.
  useEffect(() => {
    const sh = route.params?.shared;
    if (!sh) return;
    if ((sh.type === 'text' || sh.type === 'url') && sh.text) {
      setMsg(prev => (prev ? prev + '\n' : '') + sh.text);
    } else if (sh.type === 'image' && sh.uri) {
      // Mirrors the photo-attach staging used elsewhere
      const key = `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      AsyncStorage.setItem(key, sh.uri).catch(() => {});
      setStagedPhotos(prev => [...prev, { uri: sh.uri, key }]);
    } else if (sh.type === 'video' && sh.uri) {
      setStagedVideos(prev => [...prev, { uri: sh.uri }]);
    } else if (sh.type === 'file' && sh.uri) {
      setStagedFile({ name: sh.uri.split('/').pop() || 'shared-file', uri: sh.uri });
    }
  }, [route.params?.shared]);

  // Fire attachment handler AFTER modal is fully dismissed (700ms — same as ChatRoomScreen)
  useEffect(() => {
    if (!attachModal && pendingAttach.current) {
      const t = pendingAttach.current; pendingAttach.current = null;
      setTimeout(() => handleAttachType(t), 700);
    }
  }, [attachModal]);

  function pickAttach(type) {
    pendingAttach.current = type;
    setAttachModal(false);
  }

  async function handleAttachType(type) {
    if (type === 'photo') {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images', quality: 1, allowsMultipleSelection: true, selectionLimit: 20,
      });
      if (!r.canceled && r.assets?.length) {
        const newPhotos = await Promise.all(r.assets.map(async asset => {
          const key = `img_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
          await AsyncStorage.setItem(key, asset.uri);
          return { uri: asset.uri, key };
        }));
        setStagedPhotos(prev => [...prev, ...newPhotos].slice(0, 20));
      }
    } else if (type === 'video') {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos', quality: 1, allowsMultipleSelection: true, selectionLimit: 10 });
      if (!r.canceled && r.assets?.length)
        setStagedVideos(prev => [...prev, ...r.assets.map(a => ({ uri: a.uri }))].slice(0, 10));
    } else if (type === 'camera') {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchCameraAsync({ quality: 1 });
      if (!r.canceled && r.assets?.[0]) {
        const key = `img_${Date.now()}`;
        await AsyncStorage.setItem(key, r.assets[0].uri);
        setStagedPhotos(prev => [...prev, { uri: r.assets[0].uri, key }].slice(0, 20));
      }
    } else if (type === 'file') {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!r.canceled && r.assets?.[0])
        setStagedFile({ name: r.assets[0].name, uri: r.assets[0].uri });
    } else if (type === 'airdrop') {
      try {
        const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!p.granted) { Alert.alert('Permission needed'); return; }
        const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'all', quality: 1, allowsMultipleSelection: false });
        if (!r.canceled && r.assets?.[0]) {
          await Share.share(
            { url: r.assets[0].uri, message: 'Shared via VaultChat — encrypted messaging' },
            { dialogTitle: 'Send via AirDrop or Nearby Share' }
          );
        }
      } catch { /* dismissed */ }
    } else if (type === 'location') {
      const p = await Location.requestForegroundPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const loc = await Location.getCurrentPositionAsync({});
      setMsg(prev => prev + (prev ? '\n' : '') + `📍 https://maps.google.com/?q=${loc.coords.latitude},${loc.coords.longitude}`);
    } else if (type === 'gif')   { setGifModal(true);
    } else if (type === 'emoji') { setEmojiModal(true); }
  }

  const ATTACHMENTS = [
    { icon: '🖼️', label: 'Gallery',  type: 'photo'    },
    { icon: '🎥', label: 'Video',    type: 'video'    },
    { icon: '📸', label: 'Camera',   type: 'camera'   },
    { icon: '📁', label: 'File',     type: 'file'     },
    { icon: '🎭', label: 'GIF',      type: 'gif'      },
    { icon: '😀', label: 'Emoji',    type: 'emoji'    },
    { icon: '🔵', label: 'AirDrop',  type: 'airdrop'  },
    { icon: '📍', label: 'Location', type: 'location' },
  ];


  async function startChat() {
    const cleaned = toInput.trim();
    if (!cleaned) { Alert.alert('To:', 'Enter a phone number or @handle.'); return; }

    // Must be logged in — we need our own userId to build the rooms row.
    const myUserId = user?.id;
    if (!myUserId) {
      Alert.alert('Not signed in', 'Please sign in again before starting a chat.');
      return;
    }

    // Resolve the input (phone OR @handle) against Supabase profiles.
    const peer = await findByHandleOrPhone(cleaned);
    if (!peer?.id) {
      Alert.alert(
        'User not found',
        `No VaultChat user matches "${cleaned}". Double-check the @handle or phone number.`,
      );
      return;
    }
    if (peer.id === myUserId) {
      Alert.alert('Nice try', 'You can\'t start a chat with yourself.');
      return;
    }

    // Deterministic roomId from sorted userIds. placeCall uses the same hash,
    // so calls and chats in this room agree on the id on both sides.
    const roomId        = hashPair(myUserId, peer.id);
    const peerUserId    = peer.id;
    // Display fallback uses the bare handle (no '@') so chat headers
    // and contact lists stay consistent with the rest of the app —
    // '@' only appears when the user is mid-typing a mention.
    const peerHandle    = peer.vault_handle || '';
    const peerDisplay   = selectedName || peer.display_name || peerHandle || peer.phone || 'VaultChat User';
    const peerPhone     = peer.phone || null;

    // Canonical server-side record: rooms.member_ids drives resolveDirectRecipient.
    // Upsert so re-opening the same chat doesn't error out.
    try {
      await supabase.from('rooms').upsert(
        {
          id:         roomId,
          type:       'direct',
          member_ids: [myUserId, peerUserId],
          created_by: myUserId,
        },
        { onConflict: 'id' },
      );
    } catch (e) {
      if (__DEV__) console.warn('rooms upsert failed:', e?.message || e);
      // Non-fatal — chat still opens, but calls may fall back to mock UX until
      // the row appears. Worth surfacing in dev but don't block the user.
    }

    // Local AsyncStorage cache for fast chat-list rendering.
    try {
      const raw  = await AsyncStorage.getItem('vaultchat_chats');
      const list = raw ? JSON.parse(raw) : [];
      if (!list.find(ch => ch.roomId === roomId)) {
        list.unshift({
          roomId,
          userId:      peerUserId,        // canonical id going forward
          phone:       peerPhone,
          name:        peerDisplay,
          handle:      peerHandle,
          photo:       null,
          lastMessage: msg || 'New chat',
          time:        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          pinned:      false,
          hideAlerts:  false,
        });
        await AsyncStorage.setItem('vaultchat_chats', JSON.stringify(list));
      }
    } catch {}

    // Build pendingMessage for ChatRoom to auto-send
    // Priority: photos > videos > file > text
    let pendingMessage = null;

    if (stagedPhotos.length > 0) {
      const content = stagedPhotos.length === 1
        ? `LOCALIMG:${stagedPhotos[0].key}`
        : `GALLERY:${stagedPhotos.map(p => p.key).join('|')}`;
      pendingMessage = msg.trim() ? content + '\n' + msg.trim() : content;
    } else if (stagedVideos.length > 0) {
      setSending(true);
      try {
        const caption = msg.trim();
        if (stagedVideos.length === 1) {
          const url = await uploadMedia(stagedVideos[0].uri, 'video').catch(() => null);
          const content = url ? `LOCALVID:${url}` : '🎥 Video';
          pendingMessage = caption ? content + '\n' + caption : content;
        } else {
          const urls = await Promise.all(stagedVideos.map(v => uploadMedia(v.uri, 'video').catch(() => null)));
          const valid = urls.filter(Boolean);
          const content = valid.length ? `VIDEOS:${valid.join('|')}` : '🎥 Videos';
          pendingMessage = caption ? content + '\n' + caption : content;
        }
      } catch {}
      setSending(false);
    } else if (stagedFile) {
      try {
        const url = await uploadMedia(stagedFile.uri, 'file').catch(() => null);
        pendingMessage = url ? `FILE:${stagedFile.name}|${url}` : `FILE:${stagedFile.name}|${stagedFile.uri}`;
      } catch {
        pendingMessage = `FILE:${stagedFile.name}|${stagedFile.uri}`;
      }
    } else if (msg.trim()) {
      pendingMessage = msg.trim();
    }

    navigation.replace('ChatRoom', {
      roomId,
      recipientId:     peerUserId,           // canonical — drives call routing
      recipientPhone:  peerPhone,
      recipientName:   peerDisplay,
      recipientHandle: peerHandle,
      recipientPhoto:  null,
      pendingMessage,                        // ChatRoom auto-sends this on mount
    });
  }

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

      {/* Header */}
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: accent, fontSize: 16 }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tx }]}>New Message</Text>
        <TouchableOpacity onPress={startChat} disabled={toInput.trim().length < 3}>
          <Text style={{ color: toInput.trim().length >= 3 ? accent : sub, fontWeight: '700', fontSize: 16 }}>
            Start
          </Text>
        </TouchableOpacity>
      </View>

      {/* To: row */}
      <View style={[s.toRow, { backgroundColor: card, borderBottomColor: border }]}>
        <Text style={[s.toLabel, { color: accent }]}>To:</Text>
        <TextInput
          style={[s.toInput, { color: tx }]}
          placeholder="Phone number or @handle"
          placeholderTextColor={sub}
          value={toInput}
          onChangeText={v => { setToInput(v); setSelectedName(''); }}
          autoCapitalize="none"
          autoFocus
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[s.toPickBtn, { backgroundColor: accent }]}
          onPress={() => navigation.navigate('ContactPicker')}>
          <Text style={{ color: '#000', fontSize: 20, fontWeight: '700', lineHeight: 24 }}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Selected contact badge */}
      {selectedName ? (
        <View style={[s.badge, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
          <Text style={{ color: accent, fontWeight: '700', fontSize: 13 }}>
            ✓ {selectedName}{toInput.startsWith('@') ? '  ' + toInput : ''}
          </Text>
          <TouchableOpacity onPress={() => { setToInput(''); setSelectedName(''); }}>
            <Text style={{ color: sub, fontSize: 16, marginLeft: 10 }}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={{ flex: 1 }} />

      {/* Staged photos preview */}
      {stagedPhotos.length > 0 && (
        <View style={[s.stagedBar, { borderTopColor: border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, padding: 8 }}>
            {stagedPhotos.map((p, i) => (
              <View key={i} style={s.stagedThumbWrap}>
                <Image source={{ uri: p.uri }} style={s.stagedThumb} resizeMode="cover" />
                <TouchableOpacity style={s.stagedRemove} onPress={() => setStagedPhotos(prev => prev.filter((_, j) => j !== i))}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
          <View style={[s.stagedBadge, { backgroundColor: accent }]}>
            <Text style={s.stagedBadgeTx}>{stagedPhotos.length} photo{stagedPhotos.length > 1 ? 's' : ''}</Text>
          </View>
        </View>
      )}

      {/* Staged videos preview */}
      {stagedVideos.length > 0 && (
        <View style={[s.stagedVideoBar, { backgroundColor: inputBg, borderTopColor: border }]}>
          <Text style={{ fontSize: 24 }}>🎥</Text>
          <Text style={{ color: tx, fontWeight: '600', flex: 1 }}>{stagedVideos.length} video{stagedVideos.length > 1 ? 's' : ''} ready</Text>
          <TouchableOpacity onPress={() => setStagedVideos([])}><Text style={{ color: sub, fontSize: 16 }}>✕</Text></TouchableOpacity>
        </View>
      )}

      {/* Staged file preview */}
      {stagedFile && (
        <View style={[s.stagedVideoBar, { backgroundColor: inputBg, borderTopColor: border }]}>
          <Text style={{ fontSize: 24 }}>📄</Text>
          <Text style={{ color: tx, fontWeight: '600', flex: 1 }} numberOfLines={1}>{stagedFile.name}</Text>
          <TouchableOpacity onPress={() => setStagedFile(null)}><Text style={{ color: sub, fontSize: 16 }}>✕</Text></TouchableOpacity>
        </View>
      )}

      {/* Input bar — identical to ChatRoomScreen */}
      <View style={[s.inputBar, { backgroundColor: card, borderTopColor: border }]}>
        <TouchableOpacity
          style={[s.plusBtn, { backgroundColor: inputBg, borderColor: accent }]}
          onPress={() => setAttachModal(true)}>
          <Text style={[s.plusTx, { color: accent }]}>+</Text>
        </TouchableOpacity>
        <TextInput
          style={[s.input, { backgroundColor: inputBg, color: tx }]}
          placeholder={stagedPhotos.length || stagedVideos.length || stagedFile ? 'Caption… (optional)' : 'Message…'}
          placeholderTextColor={sub}
          value={msg}
          onChangeText={setMsg}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[s.sendBtn, { backgroundColor: (toInput.trim().length >= 3 && (msg.trim() || stagedPhotos.length || stagedVideos.length || stagedFile)) ? accent : inputBg }]}
          onPress={startChat}
          disabled={toInput.trim().length < 3 || sending}>
          {sending
            ? <ActivityIndicator color={accent} size="small" />
            : <Text style={{ color: (toInput.trim().length >= 3 && (msg.trim() || stagedPhotos.length || stagedVideos.length || stagedFile)) ? '#000' : sub, fontSize: 18 }}>➤</Text>}
        </TouchableOpacity>
      </View>

      {/* Attach sheet — identical to ChatRoomScreen */}
      <Modal visible={attachModal} transparent animationType="slide">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setAttachModal(false)}>
          <View style={[s.sheet, { backgroundColor: card }]}>
            <View style={[s.handle, { backgroundColor: border }]} />
            <View style={s.sheetHeaderRow}>
              <Text style={[s.sheetTitle, { color: tx }]}>Attachments</Text>
              <TouchableOpacity style={[s.sheetXBtn, { backgroundColor: accent }]} onPress={() => setAttachModal(false)}>
                <Text style={s.sheetXTx}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={s.attachGrid}>
              {ATTACHMENTS.map((a, i) => (
                <TouchableOpacity key={i} style={s.attachItem} onPress={() => pickAttach(a.type)}>
                  <View style={[s.attachIcon, { backgroundColor: inputBg }]}>
                    <Text style={{ fontSize: 28 }}>{a.icon}</Text>
                  </View>
                  <Text style={[s.attachLabel, { color: sub }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* GIF modal — identical to ChatRoomScreen */}
      <Modal visible={gifModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: card, maxHeight: '60%' }]}>
            <View style={[s.handle, { backgroundColor: border }]} />
            <View style={s.sheetHeaderRow}>
              <Text style={[s.sheetTitle, { color: tx }]}>GIFs</Text>
              <TouchableOpacity style={[s.sheetXBtn, { backgroundColor: accent }]} onPress={() => setGifModal(false)}>
                <Text style={s.sheetXTx}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={s.gifGrid}>
              {GIFS.map((g, i) => (
                <TouchableOpacity key={i} style={[s.gifItem, { backgroundColor: inputBg }]}
                  onPress={() => { setGifModal(false); setMsg(prev => prev + g.msg); }}>
                  <Text style={{ fontSize: 32 }}>{g.emoji}</Text>
                  <Text style={{ fontSize: 10, color: sub, marginTop: 4 }}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Emoji modal — identical to ChatRoomScreen */}
      <Modal visible={emojiModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: card, maxHeight: '65%' }]}>
            <View style={[s.handle, { backgroundColor: border }]} />
            <View style={s.sheetHeaderRow}>
              <Text style={[s.sheetTitle, { color: tx }]}>Emoji & GIFs</Text>
              <TouchableOpacity style={[s.sheetXBtn, { backgroundColor: accent }]} onPress={() => setEmojiModal(false)}>
                <Text style={s.sheetXTx}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={[s.tabRow, { backgroundColor: inputBg }]}>
              {['emoji', 'gif'].map(t => (
                <TouchableOpacity key={t} style={[s.tab, emojiTab === t && { backgroundColor: card }]}
                  onPress={() => setEmojiTab(t)}>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: tx }}>
                    {t === 'emoji' ? '😀 Emoji' : '🎭 GIF'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {emojiTab === 'gif' ? (
                <View style={s.gifGrid}>
                  {GIFS.map((g, i) => (
                    <TouchableOpacity key={i} style={[s.gifItem, { backgroundColor: inputBg }]}
                      onPress={() => { setEmojiModal(false); setMsg(prev => prev + g.msg); }}>
                      <Text style={{ fontSize: 32 }}>{g.emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={s.emojiGrid}>
                  {EMOJIS.map((e, i) => (
                    <TouchableOpacity key={i} style={[s.emojiItem, { backgroundColor: inputBg }]}
                      onPress={() => { setEmojiModal(false); setMsg(prev => prev + e); }}>
                      <Text style={{ fontSize: 26 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}


const s = StyleSheet.create({
  container:      { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:    { fontSize: 17, fontWeight: '700' },
  toRow:          { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingLeft: 16, minHeight: 56 },
  toLabel:        { fontWeight: '700', fontSize: 16, width: 28 },
  toInput:        { flex: 1, fontSize: 16, paddingVertical: 14, paddingHorizontal: 8 },
  toPickBtn:      { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  badge:          { flexDirection: 'row', alignItems: 'center', margin: 12, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  // Input bar — mirrors ChatRoomScreen exactly
  inputBar:       { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: 12, borderTopWidth: 1, gap: 8, paddingBottom: 24, minHeight: 70 },
  plusBtn:        { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  plusTx:         { fontSize: 26, fontWeight: '300', lineHeight: 30 },
  input:          { flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, fontSize: 15, maxHeight: 100, minHeight: 42 },
  sendBtn:        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  // Attachment sheet — mirrors ChatRoomScreen exactly
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:          { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 44 },
  handle:         { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  sheetTitle:     { fontWeight: 'bold', fontSize: 16, marginBottom: 0, textAlign: 'center' },
  sheetXBtn:      { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sheetXTx:       { color: '#000', fontWeight: '900', fontSize: 14 },
  attachGrid:     { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 16 },
  attachItem:     { alignItems: 'center', width: 72 },
  attachIcon:     { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  attachLabel:    { fontSize: 11 },
  // GIF + Emoji modals — mirrors ChatRoomScreen exactly
  gifGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 12 },
  gifItem:        { width: '22%', borderRadius: 14, padding: 10, alignItems: 'center' },
  emojiGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingBottom: 12 },
  emojiItem:      { width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabRow:         { flexDirection: 'row', marginBottom: 12, borderRadius: 12, padding: 4 },
  tab:            { flex: 1, padding: 8, borderRadius: 10, alignItems: 'center' },
  // Staged media previews
  stagedBar:      { borderTopWidth: StyleSheet.hairlineWidth, position: 'relative' },
  stagedThumbWrap:{ position: 'relative' },
  stagedThumb:    { width: 80, height: 80, borderRadius: 12 },
  stagedRemove:   { position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#ff3b30', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  stagedBadge:    { position: 'absolute', top: 12, left: 14, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  stagedBadgeTx:  { color: '#000', fontSize: 10, fontWeight: '800' },
  stagedVideoBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
});
