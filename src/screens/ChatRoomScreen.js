import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Image, Modal, Alert, ActivityIndicator,
  ScrollView, Linking, Share
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { useTheme } from '../services/theme';
import { uploadMedia } from '../services/mediaUpload';

const BACKEND = 'https://vaultchat-production-3a96.up.railway.app';

const GIFS = [
  { emoji: '😂', name: 'Haha', msg: '😂 [GIF: laughing]' },
  { emoji: '🎉', name: 'Party', msg: '🎉 [GIF: celebration]' },
  { emoji: '👋', name: 'Wave', msg: '👋 [GIF: waving]' },
  { emoji: '🔥', name: 'Fire', msg: '🔥 [GIF: fire]' },
  { emoji: '💯', name: '100', msg: '💯 [GIF: 100%]' },
  { emoji: '🤯', name: 'Wow', msg: '🤯 [GIF: mind blown]' },
  { emoji: '👀', name: 'Eyes', msg: '👀 [GIF: watching]' },
  { emoji: '💪', name: 'Flex', msg: '💪 [GIF: flex]' },
  { emoji: '😎', name: 'Cool', msg: '😎 [GIF: cool]' },
  { emoji: '🥳', name: 'Party', msg: '🥳 [GIF: party]' },
  { emoji: '❤️', name: 'Love', msg: '❤️ [GIF: love]' },
  { emoji: '🏆', name: 'Win', msg: '🏆 [GIF: winner]' },
];

const EMOJIS = ['😀','😂','😍','🥰','😎','😭','🤣','😤','🤩','😴','🫡','🤯','🥳','😏','💅','🫶','😈','🤞','😇','🙈','🙉','🙊','🐶','🐱','🦋','🌸','🌈','⭐','🔥','💥','❄️','🌙','☀️','🍀','🎶','🎯','🚀','💎','🏆','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❤️‍🔥','💯','✨','🎉','🎊','🎁','🎀','🏅','🥇','👑','💪','👀','🙏','👏','🤝','🫂','💀','👻','🤖','👽','🎃'];

// Image viewer component
function ImageViewer({ uri, isMe, sub }) {
  const [full, setFull] = React.useState(false);
  if (!uri) return null;
  return (
    <>
      <TouchableOpacity onPress={() => setFull(true)}>
        <Image source={{ uri }} style={styles.imgBubble} resizeMode="cover" />
        <Text style={[styles.tapHint, { color: isMe ? 'rgba(255,255,255,0.6)' : sub }]}>Tap to expand</Text>
      </TouchableOpacity>
      <Modal visible={full} transparent animationType="fade">
        <View style={styles.fullscreenBg}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setFull(false)}>
            <Text style={styles.closeBtnText}>✕ Close</Text>
          </TouchableOpacity>
          <Image source={{ uri }} style={styles.fullImg} resizeMode="contain" />
        </View>
      </Modal>
    </>
  );
}

// Message bubble renderer
function Bubble({ item, myId, tx, sub, card, accent }) {
  const me = item.sender_id === myId;
  const content = item.content || '';

  const renderContent = () => {
    if (content.startsWith('REPLY:')) {
      const pipe = content.indexOf('|');
      const quoted = content.substring(6, pipe);
      const actual = content.substring(pipe + 1);
      return (
        <>
          <View style={[styles.replyQuote, { borderLeftColor: me ? 'rgba(255,255,255,0.5)' : accent }]}>
            <Text style={[styles.replyLabel, { color: me ? 'rgba(255,255,255,0.7)' : accent }]}>↩ Reply</Text>
            <Text style={[styles.replyText, { color: me ? 'rgba(255,255,255,0.6)' : sub }]} numberOfLines={2}>{quoted}</Text>
          </View>
          <Text style={[styles.msgText, { color: me ? '#fff' : tx }]}>{actual}</Text>
        </>
      );
    }
    if (content.startsWith('LOCALIMG:') || content.startsWith('IMG:')) {
      const key = content.replace('LOCALIMG:', '').replace('IMG:', '');
      return <LazyImage msgKey={key} isLocal={content.startsWith('LOCALIMG:')} isMe={me} sub={sub} />;
    }
    if (content.startsWith('LOCALVID:') || content.startsWith('VID:')) {
      const uri = content.replace('LOCALVID:', '').replace('VID:', '');
      return (
        <TouchableOpacity style={styles.vidBubble} onPress={() =>
          Alert.alert('Video', 'Play this video?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Share to Play', onPress: () => Share.share({ url: uri, message: 'Video from VaultChat' }) },
          ])}>
          <Text style={styles.vidPlay}>▶️</Text>
          <Text style={styles.vidLabel}>Tap to play video</Text>
        </TouchableOpacity>
      );
    }
    if (content.startsWith('FILE:')) {
      const [name, url] = content.replace('FILE:', '').split('|');
      return (
        <TouchableOpacity style={styles.fileRow} onPress={() => url && Linking.openURL(url)}>
          <Text style={{ fontSize: 26 }}>📄</Text>
          <View>
            <Text style={[styles.fileName, { color: me ? '#fff' : tx }]}>{name}</Text>
            <Text style={[styles.fileHint, { color: me ? 'rgba(255,255,255,0.6)' : sub }]}>Tap to open</Text>
          </View>
        </TouchableOpacity>
      );
    }
    return <Text style={[styles.msgText, { color: me ? '#fff' : tx }]}>{content}</Text>;
  };

  return (
    <View style={[styles.bubbleWrap, me ? styles.myWrap : styles.theirWrap]}>
      <View style={[styles.bubble, me ? styles.myBubble : [styles.theirBubble, { backgroundColor: card }]]}>
        {renderContent()}
        <Text style={styles.time}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
    </View>
  );
}

// Lazy image loader for local/remote images
function LazyImage({ msgKey, isLocal, isMe, sub }) {
  const [uri, setUri] = React.useState(null);
  React.useEffect(() => {
    if (isLocal) {
      AsyncStorage.getItem(msgKey).then(v => { if (v) setUri(v); });
    } else {
      setUri(msgKey);
    }
  }, [msgKey]);
  if (!uri) return <View style={[styles.imgBubble, { backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: '#fff' }}>📷</Text></View>;
  return <ImageViewer uri={uri} isMe={isLocal} sub={sub} />;
}

export default function ChatRoomScreen({ route, navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const { roomId, recipientPhone, recipientName, recipientPhoto } = route.params || {};
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [myId, setMyId] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [attachModal, setAttachModal] = useState(false);
  const [gifModal, setGifModal] = useState(false);
  const [emojiModal, setEmojiModal] = useState(false);
  const [emojiTab, setEmojiTab] = useState('emoji');
  const listRef = useRef(null);
  const pendingAttach = useRef(null);

  useEffect(() => {
    loadUser();
    fetchMessages();
    const poll = setInterval(fetchMessages, 3000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (!attachModal && pendingAttach.current) {
      const t = pendingAttach.current;
      pendingAttach.current = null;
      setTimeout(() => handleAttachType(t), 700);
    }
  }, [attachModal]);

  async function loadUser() {
    const saved = await AsyncStorage.getItem('vaultchat_user');
    if (saved) {
      const p = JSON.parse(saved);
      setMyId(p.id || p.phone || '');
    }
  }

  async function fetchMessages() {
    try {
      const res = await fetch(`${BACKEND}/messages/${roomId}`);
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
    } catch (e) {}
  }

  async function send(override) {
    let content = override || text.trim();
    if (!content) return;
    if (replyTo && !override) {
      const quoted = (replyTo.content || '').substring(0, 60);
      content = `REPLY:${quoted}|${content}`;
      setReplyTo(null);
    }
    setText('');
    setSending(true);
    try {
      await fetch(`${BACKEND}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, sender_id: myId || 'anon', content }),
      });
      fetchMessages();

      // Update chat list last message
      const chats = await AsyncStorage.getItem('vaultchat_chats');
      if (chats) {
        const parsed = JSON.parse(chats);
        const updated = parsed.map(c =>
          c.roomId === roomId ? { ...c, lastMessage: content.substring(0, 40), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } : c
        );
        await AsyncStorage.setItem('vaultchat_chats', JSON.stringify(updated));
      }
    } catch (e) {}
    setSending(false);
  }

  function pickAttach(type) {
    pendingAttach.current = type;
    setAttachModal(false);
  }

  async function handleAttachType(type) {
    if (type === 'photo') {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed', 'Allow photo access in Settings → Expo Go → Photos'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
      if (!r.canceled && r.assets?.[0]) {
        const key = `img_${Date.now()}`;
        await AsyncStorage.setItem(key, r.assets[0].uri);
        send(`LOCALIMG:${key}`);
      }
    } else if (type === 'video') {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos', quality: 1 });
      if (!r.canceled && r.assets?.[0]) {
        setSending(true);
        const url = await uploadMedia(r.assets[0].uri, 'video');
        send(url ? `LOCALVID:${url}` : '🎥 Video shared');
        setSending(false);
      }
    } else if (type === 'camera') {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (!r.canceled && r.assets?.[0]) {
        const key = `img_${Date.now()}`;
        await AsyncStorage.setItem(key, r.assets[0].uri);
        send(`LOCALIMG:${key}`);
      }
    } else if (type === 'file') {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!r.canceled && r.assets?.[0]) {
        const f = r.assets[0];
        setSending(true);
        const url = await uploadMedia(f.uri, 'file');
        send(url ? `FILE:${f.name}|${url}` : `📁 ${f.name}`);
        setSending(false);
      }
    } else if (type === 'airdrop') {
      await Share.share({ message: 'Sent via VaultChat - encrypted messaging!' });
    } else if (type === 'location') {
      const p = await Location.requestForegroundPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const loc = await Location.getCurrentPositionAsync({});
      send(`📍 https://maps.google.com/?q=${loc.coords.latitude},${loc.coords.longitude}`);
    } else if (type === 'gif') {
      setGifModal(true);
    } else if (type === 'emoji') {
      setEmojiModal(true);
    }
  }

  const attachments = [
    { icon: '🖼️', label: 'Gallery', type: 'photo' },
    { icon: '🎥', label: 'Video', type: 'video' },
    { icon: '📸', label: 'Camera', type: 'camera' },
    { icon: '📁', label: 'File', type: 'file' },
    { icon: '🔵', label: 'AirDrop', type: 'airdrop' },
    { icon: '🎭', label: 'GIF', type: 'gif' },
    { icon: '😀', label: 'Emoji', type: 'emoji' },
    { icon: '📍', label: 'Location', type: 'location' },
  ];

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <View style={[styles.headerAvatar, { backgroundColor: accent }]}>
          {recipientPhoto
            ? <Image source={{ uri: recipientPhoto }} style={styles.headerAvatarImg} />
            : <Text style={styles.headerAvatarText}>{(recipientName || '?')[0]?.toUpperCase()}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerName, { color: tx }]}>{recipientName || recipientPhone || 'Chat'}</Text>
          <Text style={[styles.headerSub, { color: sub }]}>🔒 End-to-end encrypted</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('ActiveCall', { recipientName, recipientPhone, callType: 'voice' })} style={styles.callBtn}>
          <Text style={{ fontSize: 22 }}>📞</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('ActiveCall', { recipientName, recipientPhone, callType: 'video' })} style={styles.callBtn}>
          <Text style={{ fontSize: 22 }}>📹</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item, i) => item.id || i.toString()}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={1}
            onLongPress={() => {
              setReplyTo(item);
              Alert.alert('Reply', 'Replying to this message. Type your response below.');
            }}
            delayLongPress={500}
          >
            <Bubble item={item} myId={myId} tx={tx} sub={sub} card={card} accent={accent} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🔒</Text>
            <Text style={[styles.emptyText, { color: sub }]}>No messages yet. Say hello!</Text>
          </View>
        }
      />

      {/* Reply Bar */}
      {replyTo && (
        <View style={[styles.replyBar, { backgroundColor: card, borderTopColor: border, borderLeftColor: accent }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.replyBarLabel, { color: accent }]}>↩ Replying to message</Text>
            <Text style={[styles.replyBarText, { color: sub }]} numberOfLines={1}>{replyTo.content?.substring(0, 60)}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.replyClose}>
            <Text style={[{ color: sub, fontSize: 20 }]}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      <View style={[styles.inputBar, { backgroundColor: card, borderTopColor: border }]}>
        <TouchableOpacity style={[styles.plusBtn, { backgroundColor: inputBg, borderColor: accent }]} onPress={() => setAttachModal(true)}>
          <Text style={[styles.plusText, { color: accent }]}>+</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { backgroundColor: inputBg, color: tx }]}
          placeholder={replyTo ? 'Type your reply...' : 'Message...'}
          placeholderTextColor={sub}
          value={text}
          onChangeText={setText}
          multiline
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: text.trim() ? accent : inputBg }]}
          onPress={() => send()}
          disabled={!text.trim() || sending}
        >
          {sending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={{ color: text.trim() ? '#fff' : sub, fontSize: 18 }}>➤</Text>}
        </TouchableOpacity>
      </View>

      {/* Attachments Modal */}
      <Modal visible={attachModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setAttachModal(false)}>
          <View style={[styles.sheet, { backgroundColor: card }]}>
            <View style={[styles.sheetHandle, { backgroundColor: border }]} />
            <Text style={[styles.sheetTitle, { color: tx }]}>Attachments</Text>
            <View style={styles.attachGrid}>
              {attachments.map((a, i) => (
                <TouchableOpacity key={i} style={styles.attachItem} onPress={() => pickAttach(a.type)}>
                  <View style={[styles.attachIcon, { backgroundColor: inputBg }]}>
                    <Text style={{ fontSize: 28 }}>{a.icon}</Text>
                  </View>
                  <Text style={[styles.attachLabel, { color: sub }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* GIF Modal */}
      <Modal visible={gifModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { backgroundColor: card, maxHeight: '60%' }]}>
            <View style={[styles.sheetHandle, { backgroundColor: border }]} />
            <Text style={[styles.sheetTitle, { color: tx }]}>Send a GIF</Text>
            <View style={styles.gifGrid}>
              {GIFS.map((g, i) => (
                <TouchableOpacity key={i} style={[styles.gifItem, { backgroundColor: inputBg }]}
                  onPress={() => { setGifModal(false); send(g.msg); }}>
                  <Text style={{ fontSize: 32 }}>{g.emoji}</Text>
                  <Text style={[{ fontSize: 10, color: sub, marginTop: 4 }]}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: inputBg }]} onPress={() => setGifModal(false)}>
              <Text style={[{ color: sub, fontWeight: 'bold' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Emoji Modal */}
      <Modal visible={emojiModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { backgroundColor: card, maxHeight: '65%' }]}>
            <View style={[styles.sheetHandle, { backgroundColor: border }]} />
            <View style={[styles.tabRow, { backgroundColor: inputBg }]}>
              {['emoji', 'gif'].map(t => (
                <TouchableOpacity key={t} style={[styles.tab, emojiTab === t && { backgroundColor: card }]} onPress={() => setEmojiTab(t)}>
                  <Text style={[{ fontSize: 13, fontWeight: 'bold', color: tx }]}>{t === 'emoji' ? '😀 Emoji' : '🎭 GIF'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {emojiTab === 'gif' ? (
                <View style={styles.gifGrid}>
                  {GIFS.map((g, i) => (
                    <TouchableOpacity key={i} style={[styles.gifItem, { backgroundColor: inputBg }]}
                      onPress={() => { setEmojiModal(false); send(g.msg); }}>
                      <Text style={{ fontSize: 32 }}>{g.emoji}</Text>
                      <Text style={[{ fontSize: 10, color: sub, marginTop: 4 }]}>{g.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.emojiGrid}>
                  {EMOJIS.map((e, i) => (
                    <TouchableOpacity key={i} style={[styles.emojiItem, { backgroundColor: inputBg }]}
                      onPress={() => { setEmojiModal(false); send(e); }}>
                      <Text style={{ fontSize: 26 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
            <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: inputBg }]} onPress={() => setEmojiModal(false)}>
              <Text style={[{ color: sub, fontWeight: 'bold' }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, gap: 8 },
  backBtn: { padding: 4 },
  backText: { fontSize: 30, fontWeight: 'bold' },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  headerAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  headerAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  headerName: { fontWeight: 'bold', fontSize: 15 },
  headerSub: { fontSize: 11 },
  callBtn: { padding: 4 },
  bubbleWrap: { marginBottom: 6 },
  myWrap: { alignItems: 'flex-end' },
  theirWrap: { alignItems: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 18, padding: 12 },
  myBubble: { backgroundColor: '#0057a8' },
  theirBubble: {},
  msgText: { fontSize: 15, lineHeight: 20 },
  time: { fontSize: 10, color: '#999', marginTop: 4, alignSelf: 'flex-end' },
  replyQuote: { borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 4, borderRadius: 4, marginBottom: 6 },
  replyLabel: { fontSize: 11, fontWeight: 'bold', marginBottom: 2 },
  replyText: { fontSize: 12 },
  imgBubble: { width: 220, height: 180, borderRadius: 12, marginBottom: 4 },
  tapHint: { fontSize: 10, marginTop: 2 },
  fullscreenBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', alignItems: 'center', justifyContent: 'center' },
  closeBtn: { position: 'absolute', top: 56, right: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  closeBtnText: { color: '#fff', fontWeight: 'bold' },
  fullImg: { width: '100%', height: '80%' },
  vidBubble: { width: 220, height: 140, borderRadius: 12, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  vidPlay: { fontSize: 44 },
  vidLabel: { color: '#fff', fontSize: 12, marginTop: 8, fontWeight: 'bold' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fileName: { fontWeight: 'bold', fontSize: 13 },
  fileHint: { fontSize: 11 },
  emptyBox: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  replyBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderLeftWidth: 4 },
  replyBarLabel: { fontSize: 11, fontWeight: 'bold', marginBottom: 2 },
  replyBarText: { fontSize: 12 },
  replyClose: { padding: 8 },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: 12, borderTopWidth: 1, gap: 8, paddingBottom: 24, minHeight: 70 },
  plusBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  plusText: { fontSize: 26, fontWeight: '300', lineHeight: 30 },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, fontSize: 15, maxHeight: 100, minHeight: 42 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 44 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontWeight: 'bold', fontSize: 16, marginBottom: 16, textAlign: 'center' },
  attachGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 16 },
  attachItem: { alignItems: 'center', width: 72 },
  attachIcon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  attachLabel: { fontSize: 11 },
  gifGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 12 },
  gifItem: { width: '22%', borderRadius: 14, padding: 10, alignItems: 'center' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingBottom: 12 },
  emojiItem: { width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 8 },
  tabRow: { flexDirection: 'row', marginBottom: 12, borderRadius: 12, padding: 4 },
  tab: { flex: 1, padding: 8, borderRadius: 10, alignItems: 'center' },
});
