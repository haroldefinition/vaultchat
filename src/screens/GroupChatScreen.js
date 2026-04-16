// VaultChat — GroupChatScreen
// Uses Socket.io — same room system as ChatRoom, groupId is the roomId
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  KeyboardAvoidingView, Platform, Modal, Alert, Image,
  ActivityIndicator, ScrollView, Linking,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { useTheme } from '../services/theme';
import { uploadMedia } from '../services/mediaUpload';
import { connectSocket, joinRoom, sendMessage, getSocket } from '../services/socket';
import { ResolvedPhotoStack, ResolvedVideoCarousel } from '../components/MediaBubbles';

const GIFS = [
  {e:'😂',m:'😂'},{e:'🎉',m:'🎉'},{e:'👋',m:'👋'},{e:'🔥',m:'🔥'},
  {e:'💯',m:'💯'},{e:'🤯',m:'🤯'},{e:'👀',m:'👀'},{e:'💪',m:'💪'},
  {e:'😎',m:'😎'},{e:'🥳',m:'🥳'},{e:'❤️',m:'❤️'},{e:'🏆',m:'🏆'},
  {e:'😭',m:'😭'},{e:'🤣',m:'🤣'},{e:'💀',m:'💀'},{e:'🫶',m:'🫶'},
];
const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','☺️',
  '😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😏','😒','🙄','😬',
  '😌','😔','😪','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎',
  '😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱',
  '🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👻','👽','👾','🤖',
  '👋','✋','👌','✌️','🤞','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','👏','🙌','🫶','🙏','💪',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❤️‍🔥','💕','💞','💓','💗','💖','💘',
  '🎉','🎊','🎁','🎀','🏆','🥇','🎯','🎲','🎮','🎭','🎨','🎶','🎵',
  '🌸','🌺','🌻','🌹','🌷','💐','🌿','☘️','🍀','🦋','🐶','🐱',
  '🍕','🍔','🌮','🍜','🍣','🍦','🎂','🍰','🧁','☕',
  '🚀','✈️','🏠','🌍','🌈','⭐','🌙','☀️','⚡','🔥','💥','❄️','💎','💫','💯','✨',
];

function FullScreenImage({ uri, visible, onClose }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={fs.bg}>
        <TouchableOpacity style={fs.closeBtn} onPress={onClose}>
          <Text style={fs.closeTx}>✕  Close</Text>
        </TouchableOpacity>
        <Image source={{ uri }} style={fs.img} resizeMode="contain" />
      </View>
    </Modal>
  );
}

function VideoPlayerModal({ uri, visible, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!visible && ref.current) ref.current.pauseAsync().catch(() => {});
  }, [visible]);
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={fs.bg}>
        <TouchableOpacity style={fs.closeBtn} onPress={onClose}>
          <Text style={fs.closeTx}>✕  Close</Text>
        </TouchableOpacity>
        <Video ref={ref} source={{ uri }} style={fs.video} resizeMode={ResizeMode.CONTAIN} shouldPlay useNativeControls />
      </View>
    </Modal>
  );
}

function SinglePhoto({ msgKey, isLocal, onFullScreen, onLongPress }) {
  const [uri, setUri] = useState(null);
  useEffect(() => {
    if (isLocal) AsyncStorage.getItem(msgKey).then(v => { if (v) setUri(v); });
    else setUri(msgKey);
  }, [msgKey]);
  if (!uri) return <View style={{ width: 200, height: 180, borderRadius: 14, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="small" color="#555" /></View>;
  return (
    <TouchableOpacity onPress={() => onFullScreen(uri)} onLongPress={onLongPress} delayLongPress={450} activeOpacity={0.88}>
      <Image source={{ uri }} style={{ width: 200, height: 180, borderRadius: 14 }} resizeMode="cover" />
    </TouchableOpacity>
  );
}

function VideoBubble({ uri, onPlay, onLongPress }) {
  return (
    <TouchableOpacity style={{ width: 200, height: 130, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      onPress={() => onPlay(uri)} onLongPress={onLongPress} delayLongPress={450} activeOpacity={0.85}>
      <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 26, marginLeft: 3, color: '#fff' }}>▶</Text>
      </View>
      <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' }}>Tap to play</Text>
    </TouchableOpacity>
  );
}

function Bubble({ item, myId, myHandle, tx, sub, card, accent, onFullScreen, onPlay, onLongPress }) {
  const me    = item.senderId === myId || item.senderName === myHandle;
  const raw   = item.content || '';
  const nlIdx = raw.indexOf('\n');
  const main  = nlIdx >= 0 ? raw.substring(0, nlIdx) : raw;
  const cap   = nlIdx >= 0 ? raw.substring(nlIdx + 1).trim() : '';

  const isMedia = main.startsWith('GALLERY:') || main.startsWith('LOCALIMG:') || main.startsWith('IMG:')
               || main.startsWith('VIDEOS:')  || main.startsWith('LOCALVID:') || main.startsWith('VID:');

  const ts = (() => {
    try { return new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  })();

  const body = () => {
    if (raw.startsWith('REPLY:')) {
      const p = raw.indexOf('|');
      return (
        <>
          <View style={[g.replyQ, { borderLeftColor: me ? 'rgba(255,255,255,0.5)' : accent }]}>
            <Text style={[g.replyLabel, { color: me ? 'rgba(255,255,255,0.7)' : accent }]}>↩ Reply</Text>
            <Text style={[g.replyTx, { color: me ? 'rgba(255,255,255,0.55)' : sub }]} numberOfLines={2}>{raw.substring(6, p)}</Text>
          </View>
          <Text style={[g.msgTx, { color: me ? '#fff' : tx }]}>{raw.substring(p + 1)}</Text>
        </>
      );
    }
    if (main.startsWith('GALLERY:')) return <><ResolvedPhotoStack keys={main.replace('GALLERY:', '').split('|')} onLongPress={onLongPress} />{cap ? <Text style={[g.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}</>;
    if (main.startsWith('LOCALIMG:') || main.startsWith('IMG:')) return <><SinglePhoto msgKey={main.replace('LOCALIMG:', '').replace('IMG:', '')} isLocal={main.startsWith('LOCALIMG:')} onFullScreen={onFullScreen} onLongPress={onLongPress} />{cap ? <Text style={[g.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}</>;
    if (main.startsWith('VIDEOS:')) return <><ResolvedVideoCarousel content={main} onLongPress={onLongPress} />{cap ? <Text style={[g.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}</>;
    if (main.startsWith('LOCALVID:') || main.startsWith('VID:')) return <><VideoBubble uri={main.replace('LOCALVID:', '').replace('VID:', '')} onPlay={onPlay} onLongPress={onLongPress} />{cap ? <Text style={[g.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}</>;
    if (main.startsWith('FILE:')) {
      const [fname, url] = main.replace('FILE:', '').split('|');
      return (
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => url && Linking.openURL(url)} onLongPress={onLongPress} delayLongPress={450}>
          <Text style={{ fontSize: 26 }}>📄</Text>
          <View><Text style={[g.msgTx, { color: me ? '#fff' : tx }]}>{fname}</Text><Text style={{ fontSize: 11, color: me ? 'rgba(255,255,255,0.6)' : sub }}>Tap to open</Text></View>
        </TouchableOpacity>
      );
    }
    return <Text style={[g.msgTx, { color: me ? '#fff' : tx }]}>{raw}</Text>;
  };

  return (
    <View style={[g.bWrap, me ? g.myWrap : g.theirWrap]}>
      {!me && <Text style={[g.sender, { color: accent }]}>{item.senderName || 'Member'}</Text>}
      <TouchableOpacity
        style={[g.bubble, me ? g.myBubble : [g.theirBubble, { backgroundColor: card }], isMedia && g.mediaPad]}
        onLongPress={onLongPress} delayLongPress={450} activeOpacity={0.88}>
        {body()}
      </TouchableOpacity>
      <Text style={[g.time, me ? g.tR : g.tL]}>{ts}</Text>
    </View>
  );
}

export default function GroupChatScreen({ route, navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const groupId   = route?.params?.groupId   ?? null;
  const groupName = route?.params?.groupName ?? 'Group';

  const [messages,     setMessages]     = useState([]);
  const [inputText,    setInputText]    = useState('');
  const [sending,      setSending]      = useState(false);
  const [myId,         setMyId]         = useState('');
  const [myHandle,     setMyHandle]     = useState('You');
  const [replyTo,      setReplyTo]      = useState(null);
  const [menuMsg,      setMenuMsg]      = useState(null);
  const [menuVisible,  setMenuVisible]  = useState(false);
  const [stagedPhotos, setStagedPhotos] = useState([]);
  const [stagedVideos, setStagedVideos] = useState([]);
  const [fullImgUri,   setFullImgUri]   = useState(null);
  const [vidUri,       setVidUri]       = useState(null);
  const [attachModal,  setAttachModal]  = useState(false);
  const [gifModal,     setGifModal]     = useState(false);
  const [emojiModal,   setEmojiModal]   = useState(false);
  const [emojiTab,     setEmojiTab]     = useState('emoji');

  const listRef       = useRef(null);
  const pendingAttach = useRef(null);

  useEffect(() => {
    (async () => {
      const raw  = await AsyncStorage.getItem('vaultchat_user');
      const name = await AsyncStorage.getItem('vaultchat_display_name');
      if (raw) {
        const u  = JSON.parse(raw);
        const id = u.id || u.phone || 'local';
        setMyId(id);
        if (name) setMyHandle(name);

        const sock = connectSocket(id);
        // Groups use their groupId as the roomId
        joinRoom(groupId, id);

        sock.off('room:history');
        sock.on('room:history', ({ roomId, messages: hist }) => {
          if (roomId === groupId) {
            setMessages(hist || []);
            setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
          }
        });

        sock.off('message:received:group:' + groupId);
        sock.on('message:received', (msg) => {
          if (msg.roomId === groupId) {
            setMessages(prev => {
              if (prev.find(m => m.messageId === msg.messageId)) return prev;
              return [...prev, msg];
            });
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
          }
        });
      }
    })();

    return () => {
      const sock = getSocket();
      if (sock) { sock.off('room:history'); sock.off('message:received'); }
    };
  }, [groupId]);

  useEffect(() => {
    if (!attachModal && pendingAttach.current) {
      const t = pendingAttach.current; pendingAttach.current = null;
      setTimeout(() => handleAttachType(t), 700);
    }
  }, [attachModal]);

  function emit(content) {
    const sock = getSocket();
    if (!sock) { Alert.alert('Not connected', 'Please try again.'); return false; }
    sendMessage({
      roomId:    groupId,
      messageId: `msg_${Date.now()}`,
      senderId:  myId,
      senderName: myHandle,
      content,
      type:      'text',
      timestamp: new Date().toISOString(),
      replyTo:   replyTo?.messageId || null,
    });
    setReplyTo(null);
    return true;
  }

  async function sendText(override) {
    const content = override || inputText.trim();
    if (!content) return;
    let final = content;
    if (replyTo && !override) final = `REPLY:${(replyTo.content || '').substring(0, 60)}|${content}`;
    setInputText(''); setSending(true);
    emit(final);
    setSending(false);
  }

  async function sendStagedPhotos() {
    if (!stagedPhotos.length) return;
    setSending(true);
    const caption = inputText.trim();
    let content = stagedPhotos.length === 1
      ? `LOCALIMG:${stagedPhotos[0].key}`
      : `GALLERY:${stagedPhotos.map(p => p.key).join('|')}`;
    if (caption) content += '\n' + caption;
    emit(content);
    setStagedPhotos([]); setInputText(''); setSending(false);
  }

  async function sendStagedVideos() {
    if (!stagedVideos.length) return;
    setSending(true);
    try {
      const caption = inputText.trim();
      if (stagedVideos.length === 1) {
        const url = await uploadMedia(stagedVideos[0].uri, 'video');
        let content = url ? `LOCALVID:${url}` : '🎥 Video';
        if (caption) content += '\n' + caption;
        emit(content);
      } else {
        const urls  = await Promise.all(stagedVideos.map(v => uploadMedia(v.uri, 'video')));
        const valid = urls.filter(Boolean);
        let content = valid.length ? `VIDEOS:${valid.join('|')}` : '🎥 Videos';
        if (caption) content += '\n' + caption;
        emit(content);
      }
    } catch {}
    setStagedVideos([]); setInputText(''); setSending(false);
  }

  function pickAttach(type) { pendingAttach.current = type; setAttachModal(false); }

  async function handleAttachType(type) {
    if (type === 'photo') {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.85, allowsMultipleSelection: true, selectionLimit: 20 });
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
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos', quality: 1, allowsMultipleSelection: true, selectionLimit: 10 });
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
        sendText(url ? `FILE:${f.name}|${url}` : `📁 ${f.name}`);
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
    <KeyboardAvoidingView style={[g.container, { backgroundColor: bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

      {/* Header */}
      <View style={[g.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={g.backBtn}>
          <Text style={[g.backTx, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <View style={[g.groupAvatar, { backgroundColor: accent + '22' }]}>
          <Text style={{ fontSize: 18 }}>👥</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[g.hName, { color: tx }]}>{groupName}</Text>
          <Text style={[g.hSub, { color: accent }]}>🔒 End-to-end encrypted</Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item, i) => item.messageId || String(i)}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
        renderItem={({ item }) => (
          <Bubble item={item} myId={myId} myHandle={myHandle} tx={tx} sub={sub} card={card} accent={accent}
            onFullScreen={uri => setFullImgUri(uri)}
            onPlay={uri => setVidUri(uri)}
            onLongPress={() => { setMenuMsg(item); setMenuVisible(true); }} />
        )}
        ListEmptyComponent={
          <View style={g.emptyBox}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🔒</Text>
            <Text style={[g.emptyTx, { color: sub }]}>Encrypted group chat.{'\n'}Say hello!</Text>
          </View>
        }
      />

      {/* Reply bar */}
      {replyTo && (
        <View style={[g.replyBar, { backgroundColor: card, borderTopColor: border, borderLeftColor: accent }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: 'bold', color: accent, marginBottom: 2 }}>↩ Replying to {replyTo.senderName || 'message'}</Text>
            <Text style={{ fontSize: 12, color: sub }} numberOfLines={1}>{replyTo.content?.substring(0, 60)}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={{ padding: 8 }}>
            <Text style={{ color: sub, fontSize: 20 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Staged media or input bar */}
      {hasStaged ? (
        <View>
          {stagedPhotos.length > 0 && (
            <View style={{ position: 'relative' }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, padding: 10 }}>
                {stagedPhotos.map((p, i) => (
                  <View key={i} style={{ position: 'relative' }}>
                    <Image source={{ uri: p.uri }} style={{ width: 90, height: 90, borderRadius: 12 }} resizeMode="cover" />
                    <TouchableOpacity style={{ position: 'absolute', top: -7, right: -7, width: 22, height: 22, borderRadius: 11, backgroundColor: '#ff3b30', alignItems: 'center', justifyContent: 'center', zIndex: 10 }} onPress={() => setStagedPhotos(prev => prev.filter((_, j) => j !== i))}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900', lineHeight: 16 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {stagedPhotos.length < 20 && (
                  <TouchableOpacity style={{ width: 90, height: 90, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: border, backgroundColor: inputBg, alignItems: 'center', justifyContent: 'center' }} onPress={() => handleAttachType('photo')}>
                    <Text style={{ fontSize: 24, color: sub }}>+</Text>
                    <Text style={{ fontSize: 10, color: sub }}>Add</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
              <View style={{ position: 'absolute', top: 14, left: 14, backgroundColor: accent, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                <Text style={{ color: '#000', fontSize: 11, fontWeight: '800' }}>{stagedPhotos.length} photo{stagedPhotos.length > 1 ? 's' : ''}</Text>
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
              <TouchableOpacity onPress={() => setStagedVideos([])} style={{ padding: 8 }}><Text style={{ color: sub, fontSize: 18 }}>✕</Text></TouchableOpacity>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 24, gap: 10, borderTopWidth: 1, borderTopColor: border }}>
            <TextInput style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, fontSize: 15, maxHeight: 80, minHeight: 42, backgroundColor: inputBg, color: tx }} placeholder="Add a caption… (optional)" placeholderTextColor={sub} value={inputText} onChangeText={setInputText} multiline />
            <TouchableOpacity style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: accent }} onPress={() => { if (stagedVideos.length > 0) sendStagedVideos(); else sendStagedPhotos(); }} disabled={sending}>
              {sending ? <ActivityIndicator color="#000" size="small" /> : <Text style={{ color: '#000', fontWeight: '900', fontSize: 20 }}>➤</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={[g.inputBar, { backgroundColor: card, borderTopColor: border }]}>
          <TouchableOpacity style={[g.plusBtn, { backgroundColor: inputBg, borderColor: accent }]} onPress={() => setAttachModal(true)}>
            <Text style={[g.plusTx, { color: accent }]}>+</Text>
          </TouchableOpacity>
          <TextInput
            style={[g.input, { backgroundColor: inputBg, color: tx }]}
            placeholder={replyTo ? 'Type your reply...' : 'Encrypted message…'}
            placeholderTextColor={sub} value={inputText} onChangeText={setInputText} multiline
          />
          <TouchableOpacity
            style={[g.sendBtn, { backgroundColor: inputText.trim() ? accent : inputBg }]}
            onPress={() => sendText()} disabled={!inputText.trim() || sending}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: inputText.trim() ? '#000' : sub, fontSize: 18 }}>➤</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Viewer modals */}
      <FullScreenImage  uri={fullImgUri} visible={!!fullImgUri} onClose={() => setFullImgUri(null)} />
      <VideoPlayerModal uri={vidUri}     visible={!!vidUri}     onClose={() => setVidUri(null)} />

      {/* Long-press menu */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={g.overlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[g.menuSheet, { backgroundColor: card }]}>
            <Text style={[g.menuPreview, { color: sub, borderBottomColor: border }]} numberOfLines={2}>{menuMsg?.content?.substring(0, 80)}</Text>
            <TouchableOpacity style={[g.menuRow, { borderBottomColor: border }]} onPress={() => { setReplyTo(menuMsg); setMenuVisible(false); }}>
              <Text style={g.menuIcon}>↩</Text><Text style={[g.menuLabel, { color: tx }]}>Reply</Text>
            </TouchableOpacity>
            {(menuMsg?.senderId === myId || menuMsg?.senderName === myHandle) && (
              <TouchableOpacity style={[g.menuRow, { borderBottomColor: 'transparent' }]} onPress={() => { setMenuVisible(false); setMessages(prev => prev.filter(m => m.messageId !== menuMsg.messageId)); }}>
                <Text style={g.menuIcon}>🗑️</Text><Text style={[g.menuLabel, { color: '#ff4444' }]}>Delete</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[g.menuCancel, { borderTopColor: border }]} onPress={() => setMenuVisible(false)}>
              <Text style={[g.menuCancelTx, { color: sub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Attach sheet */}
      <Modal visible={attachModal} transparent animationType="slide">
        <TouchableOpacity style={g.overlay} activeOpacity={1} onPress={() => setAttachModal(false)}>
          <View style={[g.sheet, { backgroundColor: card }]}>
            <View style={[g.handle, { backgroundColor: border }]} />
            <Text style={[g.sheetTitle, { color: tx }]}>Attachments</Text>
            <View style={g.attachGrid}>
              {ATTACHMENTS.map((a, i) => (
                <TouchableOpacity key={i} style={g.attachItem} onPress={() => pickAttach(a.type)}>
                  <View style={[g.attachIcon, { backgroundColor: inputBg }]}><Text style={{ fontSize: 28 }}>{a.icon}</Text></View>
                  <Text style={[g.attachLabel, { color: sub }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* GIF modal */}
      <Modal visible={gifModal} transparent animationType="slide">
        <View style={g.overlay}>
          <View style={[g.sheet, { backgroundColor: card, maxHeight: '60%' }]}>
            <View style={[g.handle, { backgroundColor: border }]} />
            <Text style={[g.sheetTitle, { color: tx }]}>Send a GIF</Text>
            <View style={g.gifGrid}>
              {GIFS.map((gi, i) => (
                <TouchableOpacity key={i} style={[g.gifItem, { backgroundColor: inputBg }]} onPress={() => { setGifModal(false); sendText(gi.m); }}>
                  <Text style={{ fontSize: 32 }}>{gi.e}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[g.cancelBtn, { backgroundColor: inputBg }]} onPress={() => setGifModal(false)}>
              <Text style={{ color: sub, fontWeight: 'bold' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Emoji modal */}
      <Modal visible={emojiModal} transparent animationType="slide">
        <View style={g.overlay}>
          <View style={[g.sheet, { backgroundColor: card, maxHeight: '65%' }]}>
            <View style={[g.handle, { backgroundColor: border }]} />
            <View style={[g.tabRow, { backgroundColor: inputBg }]}>
              {['emoji', 'gif'].map(t => (
                <TouchableOpacity key={t} style={[g.tab, emojiTab === t && { backgroundColor: card }]} onPress={() => setEmojiTab(t)}>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: tx }}>{t === 'emoji' ? '😀 Emoji' : '🎭 GIF'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {emojiTab === 'gif' ? (
                <View style={g.gifGrid}>
                  {GIFS.map((gi, i) => (
                    <TouchableOpacity key={i} style={[g.gifItem, { backgroundColor: inputBg }]} onPress={() => { setEmojiModal(false); sendText(gi.m); }}>
                      <Text style={{ fontSize: 32 }}>{gi.e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={g.emojiGrid}>
                  {EMOJIS.map((e, i) => (
                    <TouchableOpacity key={i} style={[g.emojiItem, { backgroundColor: inputBg }]} onPress={() => { setEmojiModal(false); sendText(e); }}>
                      <Text style={{ fontSize: 26 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
            <TouchableOpacity style={[g.cancelBtn, { backgroundColor: inputBg }]} onPress={() => setEmojiModal(false)}>
              <Text style={{ color: sub, fontWeight: 'bold' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const fs = StyleSheet.create({
  bg:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', alignItems: 'center', justifyContent: 'center' },
  closeBtn: { position: 'absolute', top: 56, right: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  closeTx:  { color: '#fff', fontWeight: 'bold' },
  img:      { width: '100%', height: '80%' },
  video:    { width: '100%', height: 300 },
});

const g = StyleSheet.create({
  container:   { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  backBtn:     { padding: 4 },
  backTx:      { fontSize: 30, fontWeight: 'bold' },
  groupAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  hName:       { fontWeight: 'bold', fontSize: 15 },
  hSub:        { fontSize: 11 },
  bWrap:       { marginBottom: 4, maxWidth: '82%' },
  myWrap:      { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirWrap:   { alignSelf: 'flex-start', alignItems: 'flex-start' },
  sender:      { fontSize: 12, fontWeight: '600', marginBottom: 3, marginLeft: 4 },
  bubble:      { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  myBubble:    { backgroundColor: '#0057a8', borderBottomRightRadius: 4 },
  theirBubble: { borderBottomLeftRadius: 4 },
  mediaPad:    { paddingHorizontal: 4, paddingVertical: 4 },
  msgTx:       { fontSize: 15, lineHeight: 21 },
  cap:         { fontSize: 13, lineHeight: 19, paddingHorizontal: 6, paddingTop: 5, paddingBottom: 2 },
  time:        { fontSize: 11, color: '#8e8e93', marginTop: 3, marginBottom: 8 },
  tR:          { alignSelf: 'flex-end', marginRight: 4 },
  tL:          { alignSelf: 'flex-start', marginLeft: 4 },
  replyQ:      { borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 4, borderRadius: 4, marginBottom: 6 },
  replyLabel:  { fontSize: 11, fontWeight: 'bold', marginBottom: 2 },
  replyTx:     { fontSize: 12 },
  replyBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderLeftWidth: 4 },
  emptyBox:    { alignItems: 'center', paddingTop: 80 },
  emptyTx:     { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  inputBar:    { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: 12, borderTopWidth: 1, gap: 8, paddingBottom: 24, minHeight: 70 },
  plusBtn:     { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  plusTx:      { fontSize: 26, fontWeight: '300', lineHeight: 30 },
  input:       { flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, fontSize: 15, maxHeight: 100, minHeight: 42 },
  sendBtn:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
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
  menuSheet:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
  menuPreview: { fontSize: 13, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  menuRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 14 },
  menuIcon:    { fontSize: 18, width: 26, textAlign: 'center' },
  menuLabel:   { fontSize: 16 },
  menuCancel:  { paddingVertical: 16, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  menuCancelTx:{ fontSize: 16, fontWeight: '600' },
});
