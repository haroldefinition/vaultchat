import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput,
  KeyboardAvoidingView, Platform, Image, Modal, Alert, Linking,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { useTheme } from '../services/theme';
import { supabase } from '../services/supabase';
import { isPremiumUser, injectAds } from '../services/adsService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { uploadMedia } from '../services/mediaUpload';
import GifPickerModal from '../components/GifPickerModal';
import PremiumModal from '../components/PremiumModal';
import { ResolvedPhotoStack, ResolvedVideoCarousel } from '../components/MediaBubbles';

// ── Single photo bubble ───────────────────────────────────────
function SinglePhoto({ msgKey, isLocal, onOpen, onLongPress }) {
  const [uri, setUri] = useState(null);
  useEffect(() => {
    if (isLocal) AsyncStorage.getItem(msgKey).then(v => { if (v) setUri(v); });
    else setUri(msgKey);
  }, [msgKey]);
  if (!uri) return (
    <View style={{ width: 200, height: 170, borderRadius: 14, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="small" color="#555" />
    </View>
  );
  return (
    <TouchableOpacity onPress={() => onOpen(uri)} onLongPress={onLongPress} delayLongPress={450} activeOpacity={0.88}>
      <Image source={{ uri }} style={{ width: 200, height: 170, borderRadius: 14 }} resizeMode="cover" />
      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>Tap to expand</Text>
    </TouchableOpacity>
  );
}

// ── Video bubble ──────────────────────────────────────────────
function VideoBubble({ uri, onPlay, onLongPress }) {
  return (
    <TouchableOpacity
      style={{ width: 200, height: 130, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      onPress={() => onPlay(uri)} onLongPress={onLongPress} delayLongPress={450} activeOpacity={0.85}>
      <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 26, marginLeft: 3, color: '#fff' }}>▶</Text>
      </View>
      <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' }}>Tap to play</Text>
    </TouchableOpacity>
  );
}

// ── Full-screen image ─────────────────────────────────────────
function FullScreenImg({ uri, visible, onClose }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', alignItems: 'center', justifyContent: 'center' }}>
        <TouchableOpacity style={{ position: 'absolute', top: 56, right: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }} onPress={onClose}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>✕  Close</Text>
        </TouchableOpacity>
        <Image source={{ uri }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
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
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <TouchableOpacity style={{ position: 'absolute', top: 56, right: 20, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }} onPress={onClose}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>✕  Close</Text>
        </TouchableOpacity>
        <Video ref={vref} source={{ uri }} style={{ width: '100%', height: 300 }} resizeMode={ResizeMode.CONTAIN} shouldPlay useNativeControls />
      </View>
    </Modal>
  );
}

export default function GroupChatScreen({ route, navigation }) {
  const { groupId, groupName } = route.params || {};
  const colors = useTheme();
  const { bg, card, tx, sub, border, inputBg, accent } = colors;

  const [messages,       setMessages]       = useState([]);
  const [inputText,      setInputText]      = useState('');
  const [replyingTo,     setReplyingTo]     = useState(null);
  const [selectedMsg,    setSelectedMsg]    = useState(null);
  const [msgMenuVisible, setMsgMenuVisible] = useState(false);
  const [gifPickerVisible,   setGifPickerVisible]   = useState(false);
  const [premium,        setPremium]        = useState(false);
  const [premiumModalVisible, setPremiumModalVisible] = useState(false);
  const [currentUserId,  setCurrentUserId]  = useState(null);
  const [currentHandle,  setCurrentHandle]  = useState('');
  const [sending,        setSending]        = useState(false);

  // Staged media
  const [stagedPhotos,   setStagedPhotos]   = useState([]);  // { uri, key }
  const [stagedVideos,   setStagedVideos]   = useState([]);  // { uri }

  // Viewer modals
  const [fullImgUri,     setFullImgUri]     = useState(null);
  const [vidUri,         setVidUri]         = useState(null);

  // Attach / emoji
  const [attachModal,    setAttachModal]    = useState(false);
  const [emojiModal,     setEmojiModal]     = useState(false);

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

  const flatListRef  = useRef(null);
  const pollRef      = useRef(null);
  const pendingAttach = useRef(null);

  useEffect(() => {
    (async () => {
      const prem = await isPremiumUser();
      setPremium(prem);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data } = await supabase.from('profiles').select('handle').eq('id', user.id).single();
        if (data) setCurrentHandle(data.handle);
      } else {
        // fallback to AsyncStorage
        const raw = await AsyncStorage.getItem('vaultchat_user');
        if (raw) { const u = JSON.parse(raw); setCurrentUserId(u.id || u.phone || 'local'); }
        const name = await AsyncStorage.getItem('vaultchat_display_name');
        if (name) setCurrentHandle(name);
      }
    })();
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 3000);
    return () => clearInterval(pollRef.current);
  }, [groupId]);

  useEffect(() => {
    if (!attachModal && pendingAttach.current) {
      const t = pendingAttach.current; pendingAttach.current = null;
      setTimeout(() => handleAttachType(t), 700);
    }
  }, [attachModal]);

  const STORAGE_KEY = `vaultchat_gmsgs_${groupId}`;

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('group_messages')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });
      if (!error && data && data.length > 0) {
        const filtered = data.filter(m => m.id && !String(m.id).startsWith('temp_'));
        setMessages(filtered);
        // Keep local cache in sync
        try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered)); } catch {}
        return;
      }
    } catch (e) { if (__DEV__) console.warn('fetchGroupMessages error:', e); }
    // Fallback: load from AsyncStorage
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  };

  // Send a message to group_messages table
  const postGroupMsg = async (text, type = 'text') => {
    const payload = {
      group_id: groupId,
      sender_id: currentUserId,
      sender_handle: currentHandle,
      text,
      type,
      reply_to_id: replyingTo?.id || null,
      reply_to_text: replyingTo?.text || null,
      reply_to_sender: replyingTo?.sender || null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, { ...payload, id: `temp_${Date.now()}` }]);
    setInputText('');
    setReplyingTo(null);
    flatListRef.current?.scrollToEnd({ animated: true });
    try {
      const { data, error } = await supabase.from('group_messages').insert(payload).select().single();
      if (!error && data) {
        // Replace temp with real ID
        setMessages(prev => {
          const updated = prev.map(m => m.id === payload.created_at ? { ...data } : m);
          AsyncStorage.setItem(`vaultchat_gmsgs_${groupId}`, JSON.stringify(updated.filter(m => !String(m.id).startsWith('temp_')))).catch(() => {});
          return updated;
        });
      }
    } catch (e) {
      if (__DEV__) console.warn('group send error:', e);
      // Keep temp message — store locally so it persists
      const raw = await AsyncStorage.getItem(`vaultchat_gmsgs_${groupId}`);
      const existing = raw ? JSON.parse(raw) : [];
      const withNew = [...existing, { ...payload, id: `local_${Date.now()}` }];
      await AsyncStorage.setItem(`vaultchat_gmsgs_${groupId}`, JSON.stringify(withNew)).catch(() => {});
    }
  };

  // Simple text send
  const sendMessage = async (overrideText, type = 'text') => {
    const text = overrideText ?? inputText.trim();
    if (!text && type === 'text') return;
    await postGroupMsg(text, type);
  };

  // Send staged photos
  async function sendStagedPhotos() {
    if (!stagedPhotos.length) return;
    setSending(true);
    const caption = inputText.trim();
    let content = stagedPhotos.length === 1
      ? `LOCALIMG:${stagedPhotos[0].key}`
      : `GALLERY:${stagedPhotos.map(p => p.key).join('|')}`;
    if (caption) content += '\n' + caption;
    await postGroupMsg(content);
    setStagedPhotos([]); setInputText(''); setSending(false);
  }

  // Send staged videos
  async function sendStagedVideos() {
    if (!stagedVideos.length) return;
    setSending(true);
    try {
      const caption = inputText.trim();
      if (stagedVideos.length === 1) {
        const url = await uploadMedia(stagedVideos[0].uri, 'video');
        let content = url ? `LOCALVID:${url}` : '🎥 Video';
        if (caption) content += '\n' + caption;
        await postGroupMsg(content);
      } else {
        const urls  = await Promise.all(stagedVideos.map(v => uploadMedia(v.uri, 'video')));
        const valid = urls.filter(Boolean);
        let content = valid.length ? `VIDEOS:${valid.join('|')}` : '🎥 Videos';
        if (caption) content += '\n' + caption;
        await postGroupMsg(content);
      }
    } catch {}
    setStagedVideos([]); setInputText(''); setSending(false);
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
        await sendMessage(url ? `FILE:${f.name}|${url}` : `📁 ${f.name}`);
        setSending(false);
      }
    } else if (type === 'location') {
      const p = await Location.requestForegroundPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const loc = await Location.getCurrentPositionAsync({});
      sendMessage(`📍 https://maps.google.com/?q=${loc.coords.latitude},${loc.coords.longitude}`);
    } else if (type === 'emoji') { setEmojiModal(true); }
  }

  const openMsgMenu = (msg) => { setSelectedMsg(msg); setMsgMenuVisible(true); };
  const doReply = () => {
    setReplyingTo({ id: selectedMsg.id, text: selectedMsg.text, sender: selectedMsg.sender_handle || 'them' });
    setMsgMenuVisible(false);
  };
  const doDeleteMsg = async () => {
    setMsgMenuVisible(false);
    if (selectedMsg.sender_id !== currentUserId) return;
    Alert.alert('Delete Message', 'Delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setMessages(prev => prev.filter(m => m.id !== selectedMsg.id));
        await supabase.from('group_messages').delete().eq('id', selectedMsg.id);
      }},
    ]);
  };

  // Render each message — handles text, photos, videos, GIFs, files
  const renderMessage = useCallback(({ item }) => {
    if (item.isAd) {
      return (
        <TouchableOpacity style={g.adBubble}
          onPress={() => { if (item.isUpgradeAd) setPremiumModalVisible(true); else if (item.url) Linking.openURL(item.url); }}>
          <Text style={g.adSponsor}>{item.sponsor} · Sponsored</Text>
          <Text style={g.adText}>{item.text}</Text>
        </TouchableOpacity>
      );
    }

    const isMe = item.sender_id === currentUserId;
    const raw  = item.text || '';
    const nlIdx = raw.indexOf('\n');
    const main  = nlIdx >= 0 ? raw.substring(0, nlIdx) : raw;
    const cap   = nlIdx >= 0 ? raw.substring(nlIdx + 1).trim() : '';

    const isMedia = main.startsWith('GALLERY:') || main.startsWith('LOCALIMG:') || main.startsWith('IMG:')
                 || main.startsWith('VIDEOS:')  || main.startsWith('LOCALVID:') || main.startsWith('VID:');

    const renderContent = () => {
      if (item.type === 'gif') {
        return <Image source={{ uri: raw }} style={g.gifBubble} resizeMode="contain" />;
      }
      if (main.startsWith('GALLERY:')) {
        const keys = main.replace('GALLERY:', '').split('|');
        return <>
          <ResolvedPhotoStack keys={keys} onLongPress={() => openMsgMenu(item)} />
          {cap ? <Text style={[g.capTx, { color: isMe ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
        </>;
      }
      if (main.startsWith('LOCALIMG:') || main.startsWith('IMG:')) {
        const key = main.replace('LOCALIMG:', '').replace('IMG:', '');
        return <>
          <SinglePhoto msgKey={key} isLocal={main.startsWith('LOCALIMG:')} onOpen={uri => setFullImgUri(uri)} onLongPress={() => openMsgMenu(item)} />
          {cap ? <Text style={[g.capTx, { color: isMe ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
        </>;
      }
      if (main.startsWith('VIDEOS:')) {
        return <>
          <ResolvedVideoCarousel content={main} onLongPress={() => openMsgMenu(item)} />
          {cap ? <Text style={[g.capTx, { color: isMe ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
        </>;
      }
      if (main.startsWith('LOCALVID:') || main.startsWith('VID:')) {
        const uri = main.replace('LOCALVID:', '').replace('VID:', '');
        return <>
          <VideoBubble uri={uri} onPlay={uri => setVidUri(uri)} onLongPress={() => openMsgMenu(item)} />
          {cap ? <Text style={[g.capTx, { color: isMe ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
        </>;
      }
      if (main.startsWith('FILE:')) {
        const [fname, url] = main.replace('FILE:', '').split('|');
        return (
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            onPress={() => url && Linking.openURL(url)} onLongPress={() => openMsgMenu(item)} delayLongPress={450}>
            <Text style={{ fontSize: 26 }}>📄</Text>
            <View>
              <Text style={[g.msgText, { color: isMe ? '#fff' : tx }]}>{fname}</Text>
              <Text style={{ fontSize: 11, color: isMe ? 'rgba(255,255,255,0.6)' : sub }}>Tap to open</Text>
            </View>
          </TouchableOpacity>
        );
      }
      return <Text style={[g.msgText, { color: isMe ? '#fff' : tx }]}>{raw}</Text>;
    };

    return (
      <TouchableOpacity activeOpacity={0.85} onLongPress={() => openMsgMenu(item)} delayLongPress={450}
        style={[g.msgWrapper, isMe ? g.right : g.left]}>
        {!isMe && <Text style={[g.senderHandle, { color: accent || '#6C63FF' }]}>@{item.sender_handle || 'unknown'}</Text>}
        {item.reply_to_id && (
          <View style={[g.replyQuote, { borderLeftColor: isMe ? 'rgba(255,255,255,0.6)' : (accent || '#6C63FF') }]}>
            <Text style={[g.replyQuoteSender, { color: isMe ? 'rgba(255,255,255,0.8)' : (accent || '#6C63FF') }]}>{item.reply_to_sender}</Text>
            <Text style={[g.replyQuoteText, { color: isMe ? 'rgba(255,255,255,0.7)' : sub }]} numberOfLines={2}>{item.reply_to_text}</Text>
          </View>
        )}
        <View style={[g.bubble, isMedia && g.mediaPad, { backgroundColor: isMe ? (accent || '#6C63FF') : card }]}>
          {renderContent()}
          <Text style={[g.msgTime, { color: isMe ? 'rgba(255,255,255,0.6)' : sub }]}>{formatMsgTime(item.created_at)}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [currentUserId, colors]);

  const hasStaged = stagedPhotos.length > 0 || stagedVideos.length > 0;

  const ATTACHMENTS = [
    { icon: '🖼️', label: 'Gallery',  type: 'photo'    },
    { icon: '🎥', label: 'Video',    type: 'video'    },
    { icon: '📸', label: 'Camera',   type: 'camera'   },
    { icon: '📁', label: 'File',     type: 'file'     },
    { icon: '😀', label: 'Emoji',    type: 'emoji'    },
    { icon: '📍', label: 'Location', type: 'location' },
  ];

  return (
    <KeyboardAvoidingView style={[g.container, { backgroundColor: bg || '#000' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>

      {/* Header */}
      <View style={[g.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={g.backBtn}>
          <Text style={[g.backTx, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <View style={[g.groupAvatar, { backgroundColor: (accent || '#6C63FF') + '22' }]}>
          <Text style={{ fontSize: 18 }}>👥</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[g.hName, { color: tx }]}>{groupName || 'Group'}</Text>
          <Text style={[g.hSub, { color: accent || '#6C63FF' }]}>🔒 Encrypted</Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={injectAds(messages, premium, 8)}
        keyExtractor={item => String(item.id)}
        renderItem={renderMessage}
        contentContainerStyle={g.msgList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={g.emptyBox}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🔒</Text>
            <Text style={[g.emptyTx, { color: sub }]}>Messages are end-to-end encrypted.{'\n'}Say hello!</Text>
          </View>
        }
      />

      {/* Reply bar */}
      {replyingTo && (
        <View style={[g.replyBar, { backgroundColor: card, borderTopColor: border }]}>
          <View style={g.replyBarContent}>
            <View style={[g.replyBarLine, { backgroundColor: accent || '#6C63FF' }]} />
            <View>
              <Text style={[g.replyBarSender, { color: accent || '#6C63FF' }]}>{replyingTo.sender}</Text>
              <Text style={[g.replyBarText, { color: sub }]} numberOfLines={1}>{replyingTo.text}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)} style={g.replyBarClose}>
            <Text style={{ color: sub, fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Staged media compose area */}
      {hasStaged && (
        <View style={{ borderTopWidth: 1, borderTopColor: border }}>
          {stagedPhotos.length > 0 && (
            <View style={{ position: 'relative' }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, padding: 10 }}>
                {stagedPhotos.map((p, i) => (
                  <View key={i} style={{ position: 'relative' }}>
                    <Image source={{ uri: p.uri }} style={{ width: 90, height: 90, borderRadius: 12 }} resizeMode="cover" />
                    <TouchableOpacity
                      style={{ position: 'absolute', top: -7, right: -7, width: 22, height: 22, borderRadius: 11, backgroundColor: '#ff3b30', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
                      onPress={() => setStagedPhotos(prev => prev.filter((_, j) => j !== i))}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900', lineHeight: 16 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {stagedPhotos.length < 20 && (
                  <TouchableOpacity
                    style={{ width: 90, height: 90, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: border, backgroundColor: inputBg, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => handleAttachType('photo')}>
                    <Text style={{ fontSize: 24, color: sub }}>+</Text>
                    <Text style={{ fontSize: 10, color: sub }}>Add</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
              <View style={{ position: 'absolute', top: 14, left: 14, backgroundColor: accent || '#6C63FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{stagedPhotos.length} photo{stagedPhotos.length > 1 ? 's' : ''}</Text>
              </View>
            </View>
          )}
          {stagedVideos.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: inputBg, marginHorizontal: 12, borderRadius: 14, marginBottom: 4 }}>
              <Text style={{ fontSize: 30 }}>🎥</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: tx, fontWeight: '600', fontSize: 14 }}>{stagedVideos.length} video{stagedVideos.length > 1 ? 's' : ''} ready</Text>
                <Text style={{ color: sub, fontSize: 12 }}>Will upload on send</Text>
              </View>
              <TouchableOpacity onPress={() => setStagedVideos([])} style={{ padding: 8 }}>
                <Text style={{ color: sub, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, paddingBottom: 24, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: border }}>
            <TextInput
              style={[g.input, { color: tx || '#fff', backgroundColor: inputBg || '#2C2C2E', flex: 1 }]}
              placeholder="Add a caption… (optional)" placeholderTextColor={sub || '#8E8E93'}
              value={inputText} onChangeText={setInputText} multiline />
            <TouchableOpacity
              style={[g.sendBtn, { backgroundColor: accent || '#6C63FF' }]}
              onPress={() => { if (stagedVideos.length > 0) sendStagedVideos(); else sendStagedPhotos(); }}
              disabled={sending}>
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={g.sendIcon}>↑</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Normal input area */}
      {!hasStaged && (
        <View style={[g.inputArea, { backgroundColor: card || '#1C1C1E', borderTopColor: border || '#2C2C2E' }]}>
          <TouchableOpacity style={g.attachBtn} onPress={() => setAttachModal(true)}>
            <Text style={[g.attachBtnText, { color: accent || '#6C63FF' }]}>+</Text>
          </TouchableOpacity>

          <TextInput
            style={[g.input, { color: tx || '#fff', backgroundColor: inputBg || '#2C2C2E' }]}
            placeholder="Message..." placeholderTextColor={sub || '#8E8E93'}
            value={inputText} onChangeText={setInputText} multiline maxLength={2000} />
          <TouchableOpacity
            style={[g.sendBtn, { backgroundColor: inputText.trim() ? (accent || '#6C63FF') : (sub || '#8E8E93') }]}
            onPress={() => sendMessage()} disabled={!inputText.trim() || sending}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={g.sendIcon}>↑</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Viewer modals */}
      <FullScreenImg uri={fullImgUri} visible={!!fullImgUri} onClose={() => setFullImgUri(null)} />
      <VideoModal    uri={vidUri}     visible={!!vidUri}     onClose={() => setVidUri(null)} />

      {/* Message long-press menu */}
      <Modal visible={msgMenuVisible} transparent animationType="fade" onRequestClose={() => setMsgMenuVisible(false)}>
        <TouchableOpacity style={g.menuOverlay} activeOpacity={1} onPress={() => setMsgMenuVisible(false)}>
          <View style={[g.msgMenu, { backgroundColor: card || '#1C1C1E' }]}>
            <Text style={[g.menuPreview, { color: sub || '#8E8E93' }]} numberOfLines={2}>
              {selectedMsg?.text?.substring(0, 80)}
            </Text>
            {[
              { icon: '↩️', label: 'Reply', fn: doReply },
              ...(selectedMsg?.sender_id === currentUserId ? [{ icon: '🗑️', label: 'Delete', fn: doDeleteMsg, danger: true }] : []),
            ].map(({ icon, label, fn, danger }) => (
              <TouchableOpacity key={label} style={[g.menuOpt, { borderTopColor: border || '#2C2C2E' }]} onPress={fn}>
                <Text style={g.menuOptIcon}>{icon}</Text>
                <Text style={[g.menuOptLabel, { color: danger ? '#FF3B30' : (tx || '#fff') }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Attach sheet */}
      <Modal visible={attachModal} transparent animationType="slide">
        <TouchableOpacity style={g.modalOverlay} activeOpacity={1} onPress={() => setAttachModal(false)}>
          <View style={[g.sheet, { backgroundColor: card }]}>
            <View style={[g.handle, { backgroundColor: border }]} />
            <Text style={[g.sheetTitle, { color: tx }]}>Attachments</Text>
            <View style={g.attachGrid}>
              {ATTACHMENTS.map((a, i) => (
                <TouchableOpacity key={i} style={g.attachItem} onPress={() => pickAttach(a.type)}>
                  <View style={[g.attachIcon, { backgroundColor: inputBg }]}>
                    <Text style={{ fontSize: 28 }}>{a.icon}</Text>
                  </View>
                  <Text style={[g.attachLabel, { color: sub }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Emoji modal */}
      <Modal visible={emojiModal} transparent animationType="slide">
        <View style={g.modalOverlay}>
          <View style={[g.sheet, { backgroundColor: card, maxHeight: '65%' }]}>
            <View style={[g.handle, { backgroundColor: border }]} />
            <Text style={[g.sheetTitle, { color: tx }]}>Emoji</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={g.emojiGrid}>
                {EMOJIS.map((e, i) => (
                  <TouchableOpacity key={i} style={[g.emojiItem, { backgroundColor: inputBg }]}
                    onPress={() => { setEmojiModal(false); sendMessage(e); }}>
                    <Text style={{ fontSize: 26 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity style={[g.cancelBtn, { backgroundColor: inputBg }]} onPress={() => setEmojiModal(false)}>
              <Text style={{ color: sub, fontWeight: 'bold' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* GIF picker (Giphy powered) */}
      <GifPickerModal
        visible={gifPickerVisible}
        onClose={() => setGifPickerVisible(false)}
        onSelectGif={(gif) => { setGifPickerVisible(false); sendMessage(gif.url, 'gif'); }}
        colors={colors}
      />

      {/* Premium modal */}
      <PremiumModal
        visible={premiumModalVisible}
        onClose={() => setPremiumModalVisible(false)}
        onUpgraded={() => setPremium(true)}
        colors={colors}
      />
    </KeyboardAvoidingView>
  );
}

function formatMsgTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const g = StyleSheet.create({
  container:       { flex: 1 },
  header:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  backBtn:         { padding: 4 },
  backTx:          { fontSize: 30, fontWeight: 'bold' },
  groupAvatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  hName:           { fontWeight: 'bold', fontSize: 15 },
  hSub:            { fontSize: 11 },
  msgList:         { padding: 12, paddingBottom: 8 },
  msgWrapper:      { marginBottom: 8, maxWidth: '80%' },
  right:           { alignSelf: 'flex-end' },
  left:            { alignSelf: 'flex-start' },
  senderHandle:    { fontSize: 11, fontWeight: '700', marginBottom: 3, marginLeft: 4 },
  bubble:          { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  mediaPad:        { paddingHorizontal: 4, paddingVertical: 4 },
  capTx:           { fontSize: 13, lineHeight: 19, paddingHorizontal: 6, paddingTop: 5 },
  replyQuote:      { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 8, paddingVertical: 2 },
  replyQuoteSender:{ fontSize: 12, fontWeight: '700', marginBottom: 1 },
  replyQuoteText:  { fontSize: 12, lineHeight: 16 },
  gifBubble:       { width: 200, height: 150, borderRadius: 12 },
  msgText:         { fontSize: 15, lineHeight: 21 },
  msgTime:         { fontSize: 10, marginTop: 4, textAlign: 'right' },
  adBubble:        { alignSelf: 'center', marginVertical: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#1C1C2E', borderRadius: 14, borderLeftWidth: 3, borderLeftColor: '#6C63FF', maxWidth: '85%' },
  adSponsor:       { color: '#6C63FF', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  adText:          { color: '#ccc', fontSize: 13 },
  replyBar:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  replyBarContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  replyBarLine:    { width: 3, height: 36, borderRadius: 2 },
  replyBarSender:  { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  replyBarText:    { fontSize: 13 },
  replyBarClose:   { padding: 6 },
  emptyBox:        { alignItems: 'center', paddingTop: 80 },
  emptyTx:         { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  inputArea:       { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingVertical: 8, paddingBottom: 24, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  attachBtn:       { width: 38, height: 38, borderRadius: 19, backgroundColor: '#2C2C2E', justifyContent: 'center', alignItems: 'center', marginBottom: 1 },
  attachBtnText:   { fontSize: 22, fontWeight: '700' },
  gifBtn:          { width: 38, height: 38, borderRadius: 19, backgroundColor: '#2C2C2E', justifyContent: 'center', alignItems: 'center', marginBottom: 1 },
  gifBtnText:      { color: '#6C63FF', fontSize: 12, fontWeight: '800' },
  input:           { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15, maxHeight: 100 },
  sendBtn:         { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginBottom: 1 },
  sendIcon:        { color: '#fff', fontSize: 18, fontWeight: '700' },
  menuOverlay:     { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  msgMenu:         { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 },
  menuPreview:     { fontSize: 13, textAlign: 'center', paddingHorizontal: 20, paddingVertical: 14, opacity: 0.7 },
  menuOpt:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, gap: 14 },
  menuOptIcon:     { fontSize: 18, width: 28, textAlign: 'center' },
  menuOptLabel:    { fontSize: 16 },
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:           { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 44 },
  handle:          { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:      { fontWeight: 'bold', fontSize: 16, marginBottom: 16, textAlign: 'center' },
  attachGrid:      { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 16 },
  attachItem:      { alignItems: 'center', width: 72 },
  attachIcon:      { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  attachLabel:     { fontSize: 11 },
  emojiGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingBottom: 12 },
  emojiItem:       { width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cancelBtn:       { borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 8 },
});
