import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Image, Modal, Alert, ActivityIndicator,
  ScrollView, Linking,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { useTheme } from '../services/theme';
import { uploadMedia } from '../services/mediaUpload';
import { supabase } from '../services/supabase';
import { ResolvedPhotoStack, ResolvedVideoCarousel } from '../components/MediaBubbles';

// ── GIFs & Emojis ─────────────────────────────────────────────
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

// ── Full-screen image viewer ──────────────────────────────────
function FullScreenImg({ uri, visible, onClose }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.fsWrap}>
        <TouchableOpacity style={s.fsClose} onPress={onClose}>
          <Text style={s.fsCloseTx}>✕  Close</Text>
        </TouchableOpacity>
        <Image source={{ uri }} style={s.fsImg} resizeMode="contain" />
      </View>
    </Modal>
  );
}

// ── In-app video player ───────────────────────────────────────
function VideoModal({ uri, visible, onClose }) {
  const vref = useRef(null);
  useEffect(() => {
    if (!visible && vref.current) vref.current.pauseAsync().catch(() => {});
  }, [visible]);
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.fsWrap}>
        <TouchableOpacity style={s.fsClose} onPress={onClose}>
          <Text style={s.fsCloseTx}>✕  Close</Text>
        </TouchableOpacity>
        <Video ref={vref} source={{ uri }} style={s.fsVideo}
          resizeMode={ResizeMode.CONTAIN} shouldPlay useNativeControls />
      </View>
    </Modal>
  );
}

// ── Single lazy photo bubble ──────────────────────────────────
function SinglePhoto({ msgKey, isLocal, onOpen, onReply }) {
  const [uri, setUri] = useState(null);
  useEffect(() => {
    if (isLocal) AsyncStorage.getItem(msgKey).then(v => { if (v) setUri(v); });
    else setUri(msgKey);
  }, [msgKey]);
  if (!uri) return (
    <View style={{ width: 220, height: 180, borderRadius: 14, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="small" color="#555" />
    </View>
  );
  return (
    <TouchableOpacity onPress={() => onOpen(uri)} onLongPress={onReply} delayLongPress={450} activeOpacity={0.88}>
      <Image source={{ uri }} style={{ width: 220, height: 180, borderRadius: 14 }} resizeMode="cover" />
      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>Tap to expand</Text>
    </TouchableOpacity>
  );
}

// ── Video bubble ──────────────────────────────────────────────
function VideoBubble({ uri, onPlay, onReply }) {
  return (
    <TouchableOpacity
      style={{ width: 220, height: 130, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      onPress={() => onPlay(uri)} onLongPress={onReply} delayLongPress={450}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 26, marginLeft: 4, color: '#fff' }}>▶</Text>
      </View>
      <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' }}>Tap to play</Text>
    </TouchableOpacity>
  );
}

// ── Message bubble ────────────────────────────────────────────
function Bubble({ item, myId, tx, sub, card, accent, onOpenImg, onPlayVid, onReply }) {
  const me      = item.sender_id === myId;
  const raw     = item.content || '';
  const nlIdx   = raw.indexOf('\n');
  const main    = nlIdx >= 0 ? raw.substring(0, nlIdx) : raw;
  const cap     = nlIdx >= 0 ? raw.substring(nlIdx + 1).trim() : '';
  const isMedia = main.startsWith('GALLERY:') || main.startsWith('LOCALIMG:') || main.startsWith('IMG:')
               || main.startsWith('VIDEOS:')  || main.startsWith('LOCALVID:') || main.startsWith('VID:');

  const timeStr = (() => {
    try { return new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  })();

  const body = () => {
    if (raw.startsWith('REPLY:')) {
      const p = raw.indexOf('|');
      const quoted = raw.substring(6, p);
      const actual = raw.substring(p + 1);
      return (
        <>
          <View style={[s.replyQ, { borderLeftColor: me ? 'rgba(255,255,255,0.5)' : accent }]}>
            <Text style={[s.replyLabel, { color: me ? 'rgba(255,255,255,0.7)' : accent }]}>↩ Reply</Text>
            <Text style={[s.replyTx, { color: me ? 'rgba(255,255,255,0.6)' : sub }]} numberOfLines={2}>{quoted}</Text>
          </View>
          <Text style={[s.msgTx, { color: me ? '#fff' : tx }]}>{actual}</Text>
        </>
      );
    }
    if (main.startsWith('GALLERY:')) {
      const keys = main.replace('GALLERY:', '').split('|');
      return <>
        <ResolvedPhotoStack keys={keys} onLongPress={onReply} />
        {cap ? <Text style={[s.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
      </>;
    }
    if (main.startsWith('LOCALIMG:') || main.startsWith('IMG:')) {
      const key = main.replace('LOCALIMG:', '').replace('IMG:', '');
      return <>
        <SinglePhoto msgKey={key} isLocal={main.startsWith('LOCALIMG:')} onOpen={onOpenImg} onReply={onReply} />
        {cap ? <Text style={[s.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
      </>;
    }
    if (main.startsWith('VIDEOS:')) {
      return <>
        <ResolvedVideoCarousel content={main} onLongPress={onReply} />
        {cap ? <Text style={[s.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
      </>;
    }
    if (main.startsWith('LOCALVID:') || main.startsWith('VID:')) {
      const uri = main.replace('LOCALVID:', '').replace('VID:', '');
      return <>
        <VideoBubble uri={uri} onPlay={onPlayVid} onReply={onReply} />
        {cap ? <Text style={[s.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
      </>;
    }
    if (main.startsWith('FILE:')) {
      const [fname, url] = main.replace('FILE:', '').split('|');
      return (
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          onPress={() => url && Linking.openURL(url)} onLongPress={onReply} delayLongPress={450}>
          <Text style={{ fontSize: 26 }}>📄</Text>
          <View>
            <Text style={[s.msgTx, { color: me ? '#fff' : tx }]}>{fname}</Text>
            <Text style={{ fontSize: 11, color: me ? 'rgba(255,255,255,0.6)' : sub }}>Tap to open</Text>
          </View>
        </TouchableOpacity>
      );
    }
    return <Text style={[s.msgTx, { color: me ? '#fff' : tx }]}>{raw}</Text>;
  };

  return (
    <View style={[s.bWrap, me ? s.myWrap : s.theirWrap]}>
      <TouchableOpacity
        style={[s.bubble, me ? s.myBubble : [s.theirBubble, { backgroundColor: card }], isMedia && s.mediaPad]}
        onLongPress={onReply} delayLongPress={450} activeOpacity={0.88}>
        {body()}
      </TouchableOpacity>
      <Text style={[s.time, me ? s.tR : s.tL]}>{timeStr}</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function ChatRoomScreen({ route, navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const { roomId, recipientPhone, recipientName, recipientPhoto } = route.params || {};

  const [messages,     setMessages]     = useState([]);
  const [text,         setText]         = useState('');
  const [sending,      setSending]      = useState(false);
  const [myId,         setMyId]         = useState('');
  const [replyTo,      setReplyTo]      = useState(null);

  // Staged media
  const [stagedPhotos, setStagedPhotos] = useState([]);  // { uri, key }
  const [stagedVideos, setStagedVideos] = useState([]);  // { uri }

  // Viewer modals
  const [fullImgUri,   setFullImgUri]   = useState(null);
  const [vidUri,       setVidUri]       = useState(null);

  // Attachment modals
  const [attachModal,  setAttachModal]  = useState(false);
  const [gifModal,     setGifModal]     = useState(false);
  const [emojiModal,   setEmojiModal]   = useState(false);
  const [emojiTab,     setEmojiTab]     = useState('emoji');

  const listRef       = useRef(null);
  const pendingAttach = useRef(null);

  useEffect(() => {
    loadUser();
    fetchMessages();
    const poll = setInterval(fetchMessages, 3000);
    return () => clearInterval(poll);
  }, [roomId]);

  useEffect(() => {
    if (!attachModal && pendingAttach.current) {
      const t = pendingAttach.current; pendingAttach.current = null;
      setTimeout(() => handleAttachType(t), 700);
    }
  }, [attachModal]);

  async function loadUser() {
    // Try Supabase session first
    const { data } = await supabase.auth.getUser();
    if (data?.user) { setMyId(data.user.id); return; }
    // Fall back to AsyncStorage
    const raw = await AsyncStorage.getItem('vaultchat_user');
    if (raw) { const u = JSON.parse(raw); setMyId(u.id || u.phone || 'local'); }
  }

  async function fetchMessages() {
    if (!roomId) return;
    try {
      // Try Supabase messages table
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });
      if (!error && data) { setMessages(data); return; }
    } catch {}
    // Fallback: AsyncStorage
    try {
      const raw = await AsyncStorage.getItem(`vaultchat_msgs_${roomId}`);
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  }

  async function postMsg(content) {
    const now = new Date().toISOString();
    const tempId = `temp_${Date.now()}`;
    const newMsg = { id: tempId, room_id: roomId, sender_id: myId, content, created_at: now };

    // Optimistic update
    setMessages(prev => [...prev, newMsg]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({ room_id: roomId, sender_id: myId, content })
        .select()
        .single();
      if (!error && data) {
        setMessages(prev => prev.map(m => m.id === tempId ? data : m));
      }
    } catch {
      // Keep in AsyncStorage as fallback
      const raw = await AsyncStorage.getItem(`vaultchat_msgs_${roomId}`);
      const existing = raw ? JSON.parse(raw) : [];
      await AsyncStorage.setItem(`vaultchat_msgs_${roomId}`, JSON.stringify([...existing, newMsg]));
    }

    // Update chat preview
    try {
      const raw = await AsyncStorage.getItem('vaultchat_chats');
      if (raw) {
        const up = JSON.parse(raw).map(c =>
          c.roomId === roomId ? { ...c, lastMessage: content.substring(0, 40),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } : c
        );
        await AsyncStorage.setItem('vaultchat_chats', JSON.stringify(up));
      }
    } catch {}
  }

  async function sendText(override) {
    let content = override || text.trim();
    if (!content) return;
    if (replyTo && !override) {
      content = `REPLY:${(replyTo.content || '').substring(0, 60)}|${content}`;
      setReplyTo(null);
    }
    setText(''); setSending(true);
    await postMsg(content);
    setSending(false);
  }

  async function sendStagedPhotos() {
    if (!stagedPhotos.length) return;
    setSending(true);
    const caption = text.trim();
    let content = stagedPhotos.length === 1
      ? `LOCALIMG:${stagedPhotos[0].key}`
      : `GALLERY:${stagedPhotos.map(p => p.key).join('|')}`;
    if (caption) content += '\n' + caption;
    await postMsg(content);
    setStagedPhotos([]); setText(''); setSending(false);
  }

  async function sendStagedVideos() {
    if (!stagedVideos.length) return;
    setSending(true);
    try {
      const caption = text.trim();
      if (stagedVideos.length === 1) {
        const url = await uploadMedia(stagedVideos[0].uri, 'video');
        let content = url ? `LOCALVID:${url}` : '🎥 Video';
        if (caption) content += '\n' + caption;
        await postMsg(content);
      } else {
        const urls  = await Promise.all(stagedVideos.map(v => uploadMedia(v.uri, 'video')));
        const valid = urls.filter(Boolean);
        let content = valid.length ? `VIDEOS:${valid.join('|')}` : '🎥 Videos';
        if (caption) content += '\n' + caption;
        await postMsg(content);
      }
    } catch {}
    setStagedVideos([]); setText(''); setSending(false);
  }

  function pickAttach(type) { pendingAttach.current = type; setAttachModal(false); }

  async function handleAttachType(type) {
    if (type === 'photo') {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images', quality: 0.85, allowsMultipleSelection: true, selectionLimit: 20,
      });
      if (!r.canceled && r.assets?.length) {
        const newPhotos = await Promise.all(r.assets.map(async asset => {
          const key = `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          await AsyncStorage.setItem(key, asset.uri);
          return { uri: asset.uri, key };
        }));
        setStagedPhotos(prev => [...prev, ...newPhotos].slice(0, 20));
      }
    } else if (type === 'video') {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'videos', quality: 1, allowsMultipleSelection: true, selectionLimit: 10,
      });
      if (!r.canceled && r.assets?.length) {
        setStagedVideos(prev => [...prev, ...r.assets.map(a => ({ uri: a.uri }))].slice(0, 10));
      }
    } else if (type === 'camera') {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
      if (!r.canceled && r.assets?.[0]) {
        const key = `img_${Date.now()}`;
        await AsyncStorage.setItem(key, r.assets[0].uri);
        setStagedPhotos(prev => [...prev, { uri: r.assets[0].uri, key }].slice(0, 20));
      }
    } else if (type === 'file') {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!r.canceled && r.assets?.[0]) {
        const f = r.assets[0]; setSending(true);
        const url = await uploadMedia(f.uri, 'file');
        await sendText(url ? `FILE:${f.name}|${url}` : `📁 ${f.name}`);
        setSending(false);
      }
    } else if (type === 'location') {
      const p = await Location.requestForegroundPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const loc = await Location.getCurrentPositionAsync({});
      sendText(`📍 https://maps.google.com/?q=${loc.coords.latitude},${loc.coords.longitude}`);
    } else if (type === 'gif')   { setGifModal(true);
    } else if (type === 'emoji') { setEmojiModal(true); }
  }

  const hasStaged = stagedPhotos.length > 0 || stagedVideos.length > 0;

  const ATTACHMENTS = [
    { icon: '🖼️', label: 'Gallery',  type: 'photo'    },
    { icon: '🎥', label: 'Video',    type: 'video'    },
    { icon: '📸', label: 'Camera',   type: 'camera'   },
    { icon: '📁', label: 'File',     type: 'file'     },
    { icon: '🎭', label: 'GIF',      type: 'gif'      },
    { icon: '😀', label: 'Emoji',    type: 'emoji'    },
    { icon: '📍', label: 'Location', type: 'location' },
  ];

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

      {/* Header */}
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={[s.backTx, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <View style={[s.hAvatar, { backgroundColor: accent }]}>
          {recipientPhoto
            ? <Image source={{ uri: recipientPhoto }} style={s.hAvatarImg} />
            : <Text style={s.hAvatarTx}>{(recipientName || '?')[0]?.toUpperCase()}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.hName, { color: tx }]}>{recipientName || recipientPhone || 'Chat'}</Text>
          <Text style={[s.hSub, { color: sub }]}>🔒 End-to-end encrypted</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('ActiveCall', { recipientName, recipientPhone, callType: 'voice' })} style={s.callBtn}>
          <Text style={{ fontSize: 22 }}>📞</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('ActiveCall', { recipientName, recipientPhone, callType: 'video' })} style={s.callBtn}>
          <Text style={{ fontSize: 22 }}>📹</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item, i) => String(item.id || i)}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
        renderItem={({ item }) => (
          <Bubble
            item={item} myId={myId} tx={tx} sub={sub} card={card} accent={accent}
            onOpenImg={uri => setFullImgUri(uri)}
            onPlayVid={uri => setVidUri(uri)}
            onReply={() => setReplyTo(item)}
          />
        )}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🔒</Text>
            <Text style={[s.emptyTx, { color: sub }]}>No messages yet. Say hello!</Text>
          </View>
        }
      />

      {/* Reply bar */}
      {replyTo && (
        <View style={[s.replyBar, { backgroundColor: card, borderTopColor: border, borderLeftColor: accent }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: 'bold', color: accent, marginBottom: 2 }}>↩ Replying</Text>
            <Text style={{ fontSize: 12, color: sub }} numberOfLines={1}>{replyTo.content?.substring(0, 60)}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={{ padding: 8 }}>
            <Text style={{ color: sub, fontSize: 20 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Staged media compose area */}
      {hasStaged && (
        <View style={[s.stagedWrap, { borderTopColor: border }]}>
          {stagedPhotos.length > 0 && (
            <View style={{ position: 'relative' }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, padding: 10 }}>
                {stagedPhotos.map((p, i) => (
                  <View key={i} style={{ position: 'relative' }}>
                    <Image source={{ uri: p.uri }} style={s.thumb} resizeMode="cover" />
                    <TouchableOpacity style={s.removeBadge}
                      onPress={() => setStagedPhotos(prev => prev.filter((_, j) => j !== i))}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900', lineHeight: 16 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {stagedPhotos.length < 20 && (
                  <TouchableOpacity style={[s.addMore, { backgroundColor: inputBg, borderColor: border }]}
                    onPress={() => handleAttachType('photo')}>
                    <Text style={{ fontSize: 24, color: sub }}>+</Text>
                    <Text style={{ fontSize: 10, color: sub }}>Add</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
              <View style={[s.countBadge, { backgroundColor: accent }]}>
                <Text style={{ color: '#000', fontSize: 11, fontWeight: '800' }}>
                  {stagedPhotos.length} photo{stagedPhotos.length > 1 ? 's' : ''}
                </Text>
              </View>
            </View>
          )}
          {stagedVideos.length > 0 && (
            <View style={[s.vidPreview, { backgroundColor: inputBg }]}>
              <Text style={{ fontSize: 30 }}>🎥</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: tx, fontWeight: '600', fontSize: 14 }}>
                  {stagedVideos.length} video{stagedVideos.length > 1 ? 's' : ''} ready
                </Text>
                <Text style={{ color: sub, fontSize: 12 }}>Will upload on send</Text>
              </View>
              <TouchableOpacity onPress={() => setStagedVideos([])} style={{ padding: 8 }}>
                <Text style={{ color: sub, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={[s.captionRow, { borderTopColor: border }]}>
            <TextInput
              style={[s.captionInput, { backgroundColor: inputBg, color: tx }]}
              placeholder="Add a caption… (optional)"
              placeholderTextColor={sub}
              value={text} onChangeText={setText} multiline
            />
            <TouchableOpacity
              style={[s.sendBtn, { backgroundColor: accent }]}
              onPress={() => { if (stagedVideos.length > 0) sendStagedVideos(); else sendStagedPhotos(); }}
              disabled={sending}>
              {sending
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={{ color: '#000', fontWeight: '900', fontSize: 20 }}>➤</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Normal input bar */}
      {!hasStaged && (
        <View style={[s.inputBar, { backgroundColor: card, borderTopColor: border }]}>
          <TouchableOpacity style={[s.plusBtn, { backgroundColor: inputBg, borderColor: accent }]}
            onPress={() => setAttachModal(true)}>
            <Text style={[s.plusTx, { color: accent }]}>+</Text>
          </TouchableOpacity>
          <TextInput
            style={[s.input, { backgroundColor: inputBg, color: tx }]}
            placeholder={replyTo ? 'Type your reply...' : 'Message...'}
            placeholderTextColor={sub} value={text} onChangeText={setText} multiline
          />
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: text.trim() ? accent : inputBg }]}
            onPress={() => sendText()} disabled={!text.trim() || sending}>
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ color: text.trim() ? '#000' : sub, fontSize: 18 }}>➤</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Viewer modals */}
      <FullScreenImg uri={fullImgUri} visible={!!fullImgUri} onClose={() => setFullImgUri(null)} />
      <VideoModal    uri={vidUri}     visible={!!vidUri}     onClose={() => setVidUri(null)} />

      {/* Attach sheet */}
      <Modal visible={attachModal} transparent animationType="slide">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setAttachModal(false)}>
          <View style={[s.sheet, { backgroundColor: card }]}>
            <View style={[s.handle, { backgroundColor: border }]} />
            <Text style={[s.sheetTitle, { color: tx }]}>Attachments</Text>
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

      {/* GIF modal */}
      <Modal visible={gifModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: card, maxHeight: '60%' }]}>
            <View style={[s.handle, { backgroundColor: border }]} />
            <Text style={[s.sheetTitle, { color: tx }]}>Send a GIF</Text>
            <View style={s.gifGrid}>
              {GIFS.map((g, i) => (
                <TouchableOpacity key={i} style={[s.gifItem, { backgroundColor: inputBg }]}
                  onPress={() => { setGifModal(false); sendText(g.msg); }}>
                  <Text style={{ fontSize: 32 }}>{g.emoji}</Text>
                  <Text style={{ fontSize: 10, color: sub, marginTop: 4 }}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[s.cancelBtn, { backgroundColor: inputBg }]} onPress={() => setGifModal(false)}>
              <Text style={{ color: sub, fontWeight: 'bold' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Emoji modal */}
      <Modal visible={emojiModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: card, maxHeight: '65%' }]}>
            <View style={[s.handle, { backgroundColor: border }]} />
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
                      onPress={() => { setEmojiModal(false); sendText(g.msg); }}>
                      <Text style={{ fontSize: 32 }}>{g.emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={s.emojiGrid}>
                  {EMOJIS.map((e, i) => (
                    <TouchableOpacity key={i} style={[s.emojiItem, { backgroundColor: inputBg }]}
                      onPress={() => { setEmojiModal(false); sendText(e); }}>
                      <Text style={{ fontSize: 26 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
            <TouchableOpacity style={[s.cancelBtn, { backgroundColor: inputBg }]} onPress={() => setEmojiModal(false)}>
              <Text style={{ color: sub, fontWeight: 'bold' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, gap: 8 },
  backBtn:     { padding: 4 },
  backTx:      { fontSize: 30, fontWeight: 'bold' },
  hAvatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  hAvatarImg:  { width: 40, height: 40, borderRadius: 20 },
  hAvatarTx:   { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  hName:       { fontWeight: 'bold', fontSize: 15 },
  hSub:        { fontSize: 11 },
  callBtn:     { padding: 4 },
  bWrap:       { marginBottom: 4, maxWidth: '80%' },
  myWrap:      { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirWrap:   { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble:      { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  myBubble:    { backgroundColor: '#0057a8', borderBottomRightRadius: 4 },
  theirBubble: { borderBottomLeftRadius: 4 },
  mediaPad:    { paddingHorizontal: 4, paddingVertical: 4 },
  msgTx:       { fontSize: 15, lineHeight: 21 },
  cap:         { fontSize: 13, lineHeight: 19, paddingHorizontal: 6, paddingTop: 5, paddingBottom: 2 },
  time:        { fontSize: 11, color: '#8e8e93', marginTop: 3, marginBottom: 8 },
  tR:          { alignSelf: 'flex-end',   marginRight: 4 },
  tL:          { alignSelf: 'flex-start', marginLeft: 4 },
  replyQ:      { borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 4, borderRadius: 4, marginBottom: 6 },
  replyLabel:  { fontSize: 11, fontWeight: 'bold', marginBottom: 2 },
  replyTx:     { fontSize: 12 },
  replyBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderLeftWidth: 4 },
  emptyBox:    { alignItems: 'center', paddingTop: 80 },
  emptyTx:     { fontSize: 15, textAlign: 'center' },
  // Staged
  stagedWrap:  { borderTopWidth: 1 },
  thumb:       { width: 90, height: 90, borderRadius: 12 },
  removeBadge: { position: 'absolute', top: -7, right: -7, width: 22, height: 22, borderRadius: 11, backgroundColor: '#ff3b30', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  addMore:     { width: 90, height: 90, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 3 },
  countBadge:  { position: 'absolute', top: 14, left: 14, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  vidPreview:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginHorizontal: 12, borderRadius: 14, marginBottom: 4 },
  captionRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 24, gap: 10, borderTopWidth: 1 },
  captionInput:{ flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, fontSize: 15, maxHeight: 80, minHeight: 42 },
  // Input bar
  inputBar:    { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: 12, borderTopWidth: 1, gap: 8, paddingBottom: 24, minHeight: 70 },
  plusBtn:     { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  plusTx:      { fontSize: 26, fontWeight: '300', lineHeight: 30 },
  input:       { flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, fontSize: 15, maxHeight: 100, minHeight: 42 },
  sendBtn:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  // Viewer
  fsWrap:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', alignItems: 'center', justifyContent: 'center' },
  fsClose:     { position: 'absolute', top: 56, right: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  fsCloseTx:   { color: '#fff', fontWeight: 'bold' },
  fsImg:       { width: '100%', height: '80%' },
  fsVideo:     { width: '100%', height: 300 },
  // Modals
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 44 },
  handle:      { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:  { fontWeight: 'bold', fontSize: 16, marginBottom: 16, textAlign: 'center' },
  attachGrid:  { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 16 },
  attachItem:  { alignItems: 'center', width: 72 },
  attachIcon:  { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  attachLabel: { fontSize: 11 },
  gifGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 12 },
  gifItem:     { width: '22%', borderRadius: 14, padding: 10, alignItems: 'center' },
  emojiGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingBottom: 12 },
  emojiItem:   { width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cancelBtn:   { borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 8 },
  tabRow:      { flexDirection: 'row', marginBottom: 12, borderRadius: 12, padding: 4 },
  tab:         { flex: 1, padding: 8, borderRadius: 10, alignItems: 'center' },
});
