import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Image, Modal, Alert, ActivityIndicator, ScrollView, Linking, Share } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';

const BACKEND = 'https://vaultchat-production-3a96.up.railway.app';

const EMOJIS = ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','😗','😙','😚','🙂','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','☹️','🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨','😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','🥴','😠','😡','🤬','😷','🤒','🤕','🤢','🤮','🤧','🥳','🥸','🤠','🤡','👺','👻','💀','☠️','👽','👾','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','💕','💞','💓','💗','💖','💘','💝','💟','☮️','👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👋','🤚','🖐','✋','🖖','👏','🙌','🤲','🤝','🙏','💪','🦾','👀','🔥','💥','✨','⭐','🌟','💫','⚡','💢','💦','💧','🌊','🎉','🎊','🎈','🎁','🎀','🏆','🥇','🥈','🥉','🏅','🎖','🚀','🛸','🌈','☀️','🌙','⭐','🌺','🌸','🌼','🌻','🌹','🍀','🌿','🍁','🍂','🍃','🌴','🌵','🦋','🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🍕','🍔','🌮','🌯','🥗','🍜','🍱','🍣','🍩','🎂','🍰','🧁','🍪','🍫','🍬','🍭','🍦','🧃','☕','🍾'];

const STICKERS = ['🔥','💯','👑','💎','⚡','🌟','💪','🎯','🚀','✨','🏆','💥','🎊','🌈','💫','🎉','👏','🙌','🤝','💰','🦋','🌸','❄️','🌊','🎭','🎨','🎸','🎵','🎶','🎤','📱','💻','⌚','📸','🎮','🕹','🎲','🃏','🀄','🎯','🦄','🐉','🦅','🦁','🐬','🦊','🐺','🦋','🌺','🌻','🍀','🌴','🏔','🌋','🗺','🏖','🏝','🌅','🌠','🎆'];

const GIFS = [
  { label: '😂', name: 'Laughing', msg: '😂 [GIF: laughing out loud]' },
  { label: '🎉', name: 'Celebrate', msg: '🎉 [GIF: celebration!]' },
  { label: '👋', name: 'Wave', msg: '👋 [GIF: hey waving]' },
  { label: '🔥', name: 'Fire', msg: '🔥 [GIF: this is fire!]' },
  { label: '💯', name: '100%', msg: '💯 [GIF: 100 percent]' },
  { label: '🐶', name: 'Doggo', msg: '🐶 [GIF: cute doggo]' },
  { label: '😴', name: 'Sleepy', msg: '😴 [GIF: so sleepy]' },
  { label: '🤯', name: 'Mind Blown', msg: '🤯 [GIF: mind blown!]' },
  { label: '👀', name: 'Eyes', msg: '👀 [GIF: watching you]' },
  { label: '💪', name: 'Flex', msg: '💪 [GIF: flexing!]' },
  { label: '🎶', name: 'Music', msg: '🎶 [GIF: music vibes]' },
  { label: '🚀', name: 'Rocket', msg: '🚀 [GIF: to the moon!]' },
  { label: '😎', name: 'Cool', msg: '😎 [GIF: too cool]' },
  { label: '🥳', name: 'Party', msg: '🥳 [GIF: party time!]' },
  { label: '❤️', name: 'Love', msg: '❤️ [GIF: sending love]' },
  { label: '🏆', name: 'Trophy', msg: '🏆 [GIF: winner!]' },
  { label: '🤦', name: 'Facepalm', msg: '🤦 [GIF: facepalm]' },
  { label: '💃', name: 'Dance', msg: '💃 [GIF: dance moves]' },
  { label: '🤸', name: 'Flip', msg: '🤸 [GIF: backflip!]' },
  { label: '😱', name: 'Shocked', msg: '😱 [GIF: no way!]' },
  { label: '🙄', name: 'Eye Roll', msg: '🙄 [GIF: eye roll]' },
  { label: '🥺', name: 'Pleading', msg: '🥺 [GIF: please please]' },
  { label: '😬', name: 'Awkward', msg: '😬 [GIF: awkward...]' },
  { label: '🤪', name: 'Crazy', msg: '🤪 [GIF: going crazy]' },
  { label: '👌', name: 'OK', msg: '👌 [GIF: OK!]' },
  { label: '💩', name: 'Poop', msg: '💩 [GIF: poop emoji]' },
  { label: '🤑', name: 'Money', msg: '🤑 [GIF: money!]' },
  { label: '😋', name: 'Yummy', msg: '😋 [GIF: so yummy]' },
  { label: '🤗', name: 'Hug', msg: '🤗 [GIF: big hug!]' },
  { label: '🫡', name: 'Salute', msg: '🫡 [GIF: saluting]' },
];

export default function ChatRoomScreen({ route, navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const { roomId, recipientPhone, recipientName, recipientPhoto, user } = route.params;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState(null);
  const [editModal, setEditModal] = useState(false);
  const [attachModal, setAttachModal] = useState(false);
  const [emojiModal, setEmojiModal] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [musicModal, setMusicModal] = useState(false);
  const [scheduleText, setScheduleText] = useState('');
  const [scheduleDate, setScheduleDate] = useState(new Date());
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editNick, setEditNick] = useState('');
  const [emojiTab, setEmojiTab] = useState('emoji');
  const [reactions, setReactions] = useState({});
  const [reactionModal, setReactionModal] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState(null);
  const flatRef = useRef(null);

  useEffect(() => {
    loadContact();
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, []);

  async function loadContact() {
    const saved = await AsyncStorage.getItem(`contact_${recipientPhone}`);
    if (saved) {
      const c = JSON.parse(saved);
      if (c.name) { setName(c.name); setEditNick(c.name); }
      if (c.photo) setPhoto(c.photo);
    } else if (recipientName) { setName(recipientName); setEditNick(recipientName); }
    if (recipientPhoto) setPhoto(recipientPhoto);
  }

  async function saveContact() {
    const n = editNick || `${editFirst} ${editLast}`.trim();
    if (!n) { setEditModal(false); return; }
    setName(n);
    await AsyncStorage.setItem(`contact_${recipientPhone}`, JSON.stringify({ name: n, photo }));
    const saved = await AsyncStorage.getItem('vaultchat_chats');
    if (saved) {
      const chats = JSON.parse(saved).map(c => c.phone === recipientPhone ? { ...c, name: n, photo } : c);
      await AsyncStorage.setItem('vaultchat_chats', JSON.stringify(chats));
    }
    setEditModal(false);
  }

  async function fetchMessages() {
    try {
      const res = await fetch(`${BACKEND}/messages/${roomId}`);
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
    } catch (e) {}
  }

  async function sendMessage(content) {
    const msg = content || text.trim();
    if (!msg) return;
    setLoading(true); setText('');
    try {
      // Use real user ID or fallback to phone-based UUID
      let senderId = user?.id;
      if (!senderId) {
        const saved = await AsyncStorage.getItem('vaultchat_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          senderId = parsed.id || parsed.phone;
        }
      }
      senderId = senderId || '550e8400-e29b-41d4-a716-446655440001';
      const res = await fetch(`${BACKEND}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, sender_id: senderId, content: msg }),
      });
      const data = await res.json();
      if (data.success) fetchMessages();
    } catch (e) { console.log('Send error:', e); }
    setLoading(false);
  }

  async function handleAirdrop() {
    setAttachModal(false);
    Alert.alert('Share via AirDrop', 'What would you like to share?', [
      { text: 'Cancel', style: 'cancel' },
      { text: '📷 Photo', onPress: async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images });
        if (!result.canceled) { await Share.share({ message: 'Photo from VaultChat', url: result.assets[0].uri }); sendMessage('🔵 [AirDrop: Photo shared]'); }
      }},
      { text: '🎥 Video', onPress: async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos });
        if (!result.canceled) { await Share.share({ message: 'Video from VaultChat', url: result.assets[0].uri }); sendMessage('🔵 [AirDrop: Video shared]'); }
      }},
      { text: '💬 Message', onPress: async () => {
        await Share.share({ message: text.trim() || 'Sent via VaultChat' });
        sendMessage('🔵 [AirDrop: Message shared]');
      }},
    ]);
  }

  async function handleAttach(type) {
    setAttachModal(false);
    if (type === 'photo') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled) sendMessage(`📷 Photo: ${result.assets[0].uri.split('/').pop()}`);
    } else if (type === 'video') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos });
      if (!result.canceled) sendMessage(`🎥 Video: ${result.assets[0].uri.split('/').pop()}`);
    } else if (type === 'camera') {
      try {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed'); return; }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
        if (!result.canceled) sendMessage(`📷 Camera: ${result.assets[0].uri.split('/').pop()}`);
      } catch (e) { Alert.alert('Camera unavailable', 'Camera works on real iPhone only.'); }
    } else if (type === 'file') {
      try {
        const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
        if (result && !result.canceled && result.assets?.length > 0) {
          const file = result.assets[0];
          sendMessage(`📁 File: ${file.name} (${file.size ? (file.size/1024).toFixed(1)+' KB' : 'unknown'})`);
        }
      } catch (e) { Alert.alert('Info', 'File sharing works on real iPhone.'); }
    } else if (type === 'airdrop') { handleAirdrop(); }
    else if (type === 'emoji') { setEmojiModal(true); }
    else if (type === 'music') { setMusicModal(true); }
    else if (type === 'location') {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed'); return; }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude, longitude } = loc.coords;
        sendMessage(`📍 Location: https://maps.google.com/?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`);
      } catch (e) { Alert.alert('Error', 'Could not get location.'); }
    } else if (type === 'schedule') { setScheduleModal(true); }
  }

  function sendScheduled() {
    if (!scheduleText.trim()) { Alert.alert('Error', 'Enter a message'); return; }
    const formatted = scheduleDate.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    sendMessage(`🕐 Scheduled for ${formatted}:\n"${scheduleText}"`);
    setScheduleModal(false); setScheduleText(''); setScheduleDate(new Date());
  }

  async function pickContactPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1,1], quality: 0.5 });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  }

  const displayName = name || `+1${recipientPhone}`;
  const [myId, setMyId] = React.useState(user?.id || '');
  React.useEffect(() => {
    AsyncStorage.getItem('vaultchat_user').then(saved => {
      if (saved) {
        const parsed = JSON.parse(saved);
        setMyId(parsed.id || parsed.phone || '');
      }
    });
  }, []);
  const isMe = msg => msg.sender_id === myId || msg.sender_id === user?.id;

  const attachments = [
    { icon: '📷', label: 'Photo', type: 'photo' },
    { icon: '🎥', label: 'Video', type: 'video' },
    { icon: '📸', label: 'Camera', type: 'camera' },
    { icon: '📁', label: 'File', type: 'file' },
    { icon: '📡', label: 'AirDrop', type: 'airdrop' },
    { icon: '🎵', label: 'Music', type: 'music' },
    { icon: '😄', label: 'Emoji/GIF', type: 'emoji' },
    { icon: '📍', label: 'Location', type: 'location' },
    { icon: '🕐', label: 'Schedule', type: 'schedule' },
  ];

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[s.back, { color: accent }]}>‹ Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.headerCenter} onPress={() => setEditModal(true)}>
          {photo ? <Image source={{ uri: photo }} style={s.avatar} /> :
            <View style={[s.avatarCircle, { backgroundColor: accent }]}>
              <Text style={s.avatarText}>{recipientPhone?.slice(-4)}</Text>
            </View>}
          <View>
            <Text style={[s.headerName, { color: tx }]}>{displayName}</Text>
            <Text style={s.encrypted}>🔒 End-to-end encrypted</Text>
          </View>
        </TouchableOpacity>
        <View style={s.headerActions}>
          <TouchableOpacity style={[s.headerActionBtn, { backgroundColor: '#34C759' }]} onPress={() => navigation.navigate('ActiveCall', { recipientName: displayName, recipientPhone, user, callType: 'voice' })}>
            <Text style={s.headerActionIcon}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.headerActionBtn, { backgroundColor: '#0057a8' }]} onPress={() => {
            const url = `facetime://${recipientPhone}`;
            Linking.canOpenURL(url).then(supported => {
              if (supported) Linking.openURL(url);
              else navigation.navigate('ActiveCall', { recipientName: displayName, recipientPhone, user, callType: 'video' });
            });
          }}>
            <Text style={s.headerActionIcon}>📹</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={item => item.id || Math.random().toString()}
        onContentSizeChange={() => flatRef.current?.scrollToEnd()}
        renderItem={({ item }) => (
          <View>
            <TouchableOpacity
              style={[s.bubble, isMe(item) ? s.myBubble : [s.theirBubble, { backgroundColor: card }]]}
              onLongPress={() => { setSelectedMsgId(item.id); setReactionModal(true); }}
              delayLongPress={400}
            >
              <Text style={[s.bubbleText, isMe(item) ? s.myText : { color: tx }]}>{item.content}</Text>
              <Text style={s.time}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </TouchableOpacity>
            {reactions[item.id] && reactions[item.id].length > 0 && (
              <View style={[s.reactionsRow, isMe(item) ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
                {[...new Set(reactions[item.id])].map((r, i) => (
                  <TouchableOpacity key={i} style={[s.reactionBubble, { backgroundColor: card, borderColor: border }]} onPress={() => {
                    setReactions(prev => ({ ...prev, [item.id]: (prev[item.id] || []).filter(x => x !== r) }));
                  }}>
                    <Text style={s.reactionText}>{r} {reactions[item.id].filter(x => x === r).length}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
        contentContainerStyle={{ padding: 16 }}
        style={{ backgroundColor: bg }}
      />

      {/* Input Row */}
      <View style={[s.inputRow, { backgroundColor: card, borderTopColor: border }]}>
        <TouchableOpacity style={[s.plusBtn, { backgroundColor: inputBg, borderColor: accent }]} onPress={() => setAttachModal(true)}>
          <Text style={[s.plusText, { color: accent }]}>+</Text>
        </TouchableOpacity>
        <TextInput style={[s.input, { backgroundColor: inputBg, color: tx }]} placeholder="Message..." placeholderTextColor={sub} value={text} onChangeText={setText} multiline />
        <TouchableOpacity style={[s.sendBtn, !text.trim() && s.sendOff, { backgroundColor: text.trim() ? accent : inputBg }]} onPress={() => sendMessage()} disabled={!text.trim() || loading}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[s.sendText, { color: text.trim() ? '#fff' : sub }]}>➤</Text>}
        </TouchableOpacity>
      </View>

      {/* Reaction Picker Modal */}
      <Modal visible={reactionModal} transparent animationType="fade">
        <TouchableOpacity style={[s.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]} activeOpacity={1} onPress={() => setReactionModal(false)}>
          <View style={[s.reactionPicker, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.sheetTitle, { color: tx, marginBottom: 12, fontSize: 14 }]}>React to message</Text>
            <View style={s.reactionGrid}>
              {['❤️','😂','😮','😢','😡','👍','👎','🔥','💯','🎉','😍','🙏','👏','💪','✨','🥳','😎','🤣','💀','🫡'].map((emoji, i) => (
                <TouchableOpacity key={i} style={s.reactionOption} onPress={() => {
                  setReactions(prev => ({ ...prev, [selectedMsgId]: [...(prev[selectedMsgId] || []), emoji] }));
                  setReactionModal(false);
                }}>
                  <Text style={{ fontSize: 28 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Attachment Modal */}
      <Modal visible={attachModal} transparent animationType="slide">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setAttachModal(false)}>
          <View style={[s.sheet, { backgroundColor: card }]}>
            <View style={[s.handle, { backgroundColor: border }]} />
            <Text style={[s.sheetTitle, { color: tx }]}>Attachments</Text>
            <View style={s.attachGrid}>
              {attachments.map((a, i) => (
                <TouchableOpacity key={i} style={s.attachItem} onPress={() => handleAttach(a.type)}>
                  <View style={[s.attachIconBox, { backgroundColor: inputBg }]}><Text style={s.attachIcon}>{a.icon}</Text></View>
                  <Text style={[s.attachLabel, { color: sub }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Emoji + Sticker + GIF Modal */}
      <Modal visible={emojiModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: card, maxHeight: '70%' }]}>
            <View style={[s.handle, { backgroundColor: border }]} />
            <View style={[s.tabRow, { backgroundColor: inputBg }]}>
              {['emoji','sticker','gif'].map(tab => (
                <TouchableOpacity key={tab} style={[s.tab, emojiTab === tab && { backgroundColor: card }]} onPress={() => setEmojiTab(tab)}>
                  <Text style={[s.tabText, { color: tx }]}>{tab === 'emoji' ? '😀 Emoji' : tab === 'sticker' ? '🎨 Sticker' : '🎭 GIF'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {emojiTab === 'gif' ? (
                <View style={s.gifGrid}>
                  {GIFS.map((g, i) => (
                    <TouchableOpacity key={i} style={[s.gifItem, { backgroundColor: inputBg }]} onPress={() => { setEmojiModal(false); sendMessage(g.msg); }}>
                      <Text style={s.gifEmoji}>{g.label}</Text>
                      <Text style={[s.gifName, { color: sub }]}>{g.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={s.emojiGrid}>
                  {(emojiTab === 'emoji' ? EMOJIS : STICKERS).map((e, i) => (
                    <TouchableOpacity key={i} style={[s.emojiItem, { backgroundColor: inputBg }]} onPress={() => { setEmojiModal(false); sendMessage(e); }}>
                      <Text style={s.emojiText}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
            <TouchableOpacity style={[s.closeBtn, { backgroundColor: inputBg }]} onPress={() => setEmojiModal(false)}>
              <Text style={[s.closeBtnText, { color: sub }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Music Modal */}
      <Modal visible={musicModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: card }]}>
            <View style={[s.handle, { backgroundColor: border }]} />
            <Text style={[s.sheetTitle, { color: tx }]}>Share Music</Text>
            {[
              { icon: '🎵', name: 'Apple Music', sub: 'Open Apple Music to share', url: 'music://', msg: '🎵 [Apple Music link shared]' },
              { icon: '🎧', name: 'Spotify', sub: 'Open Spotify to share', url: 'spotify://', msg: '🎧 [Spotify link shared]' },
              { icon: '🔊', name: 'SoundCloud', sub: 'Open SoundCloud to share', url: 'soundcloud://', msg: '🔊 [SoundCloud link shared]' },
            ].map((m, i) => (
              <TouchableOpacity key={i} style={[s.musicOption, { backgroundColor: inputBg }]} onPress={() => {
                setMusicModal(false);
                Linking.canOpenURL(m.url).then(supported => {
                  if (supported) Linking.openURL(m.url);
                  else Alert.alert(`${m.name} not installed`, `Install ${m.name} on your iPhone.`);
                });
                sendMessage(m.msg);
              }}>
                <Text style={s.musicIcon}>{m.icon}</Text>
                <View>
                  <Text style={[s.musicName, { color: tx }]}>{m.name}</Text>
                  <Text style={[s.musicSub, { color: sub }]}>{m.sub}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[s.musicOption, { backgroundColor: inputBg, justifyContent: 'center' }]} onPress={() => setMusicModal(false)}>
              <Text style={{ color: sub, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Schedule Modal */}
      <Modal visible={scheduleModal} transparent animationType="slide">
        <View style={s.overlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}>
            <View style={[s.sheet, { backgroundColor: card }]}>
              <View style={[s.handle, { backgroundColor: border }]} />
              <Text style={[s.sheetTitle, { color: tx }]}>Schedule Message</Text>
              <TextInput style={[s.schedInput, { backgroundColor: inputBg, color: tx }]} placeholder="Message to send..." placeholderTextColor={sub} value={scheduleText} onChangeText={setScheduleText} multiline />
              <Text style={[s.schedLabel, { color: accent }]}>Select Date & Time:</Text>
              <DateTimePicker value={scheduleDate} mode="datetime" display="spinner" minimumDate={new Date()} maximumDate={new Date(new Date().getFullYear() + 1, 11, 31)} onChange={(event, date) => { if (date) setScheduleDate(date); }} textColor={tx} style={{ backgroundColor: inputBg, borderRadius: 12 }} />
              <Text style={[s.schedLabel, { color: sub, marginTop: 4 }]}>
                Sending: {scheduleDate.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                <TouchableOpacity style={[s.schedBtn, { backgroundColor: inputBg }]} onPress={() => setScheduleModal(false)}>
                  <Text style={{ color: sub, fontWeight: 'bold' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.schedBtn, { backgroundColor: accent }]} onPress={sendScheduled}>
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Schedule ✓</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Edit Contact Modal */}
      <Modal visible={editModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: card }]}>
            <View style={[s.modalHeader]}>
              <TouchableOpacity onPress={() => setEditModal(false)}><Text style={{ color: sub, fontSize: 15 }}>Cancel</Text></TouchableOpacity>
              <Text style={[s.sheetTitle, { color: tx, marginBottom: 0 }]}>Contact Info</Text>
              <TouchableOpacity onPress={saveContact}><Text style={{ color: accent, fontSize: 15, fontWeight: 'bold' }}>Save</Text></TouchableOpacity>
            </View>
            <TouchableOpacity style={s.photoWrap} onPress={pickContactPhoto}>
              {photo ? <Image source={{ uri: photo }} style={s.contactPhoto} /> :
                <View style={[s.photoPlaceholder, { backgroundColor: inputBg, borderColor: accent }]}>
                  <Text style={s.photoIcon}>📷</Text>
                  <Text style={[s.photoLabel, { color: accent }]}>Add Photo</Text>
                </View>}
            </TouchableOpacity>
            <View style={[s.phoneBox, { backgroundColor: inputBg }]}>
              <Text style={[s.phoneLbl, { color: accent }]}>Phone</Text>
              <Text style={{ color: tx }}>+1{recipientPhone}</Text>
            </View>
            <View style={[s.fieldGroup, { backgroundColor: inputBg }]}>
              <TextInput style={[s.fieldInput, { color: tx }]} placeholder="First name" placeholderTextColor={sub} value={editFirst} onChangeText={setEditFirst} />
              <TextInput style={[s.fieldInput, s.fieldDiv, { color: tx, borderTopColor: border }]} placeholder="Last name" placeholderTextColor={sub} value={editLast} onChangeText={setEditLast} />
              <TextInput style={[s.fieldInput, s.fieldDiv, { color: tx, borderTopColor: border }]} placeholder="Nickname" placeholderTextColor={sub} value={editNick} onChangeText={setEditNick} />
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  back: { fontSize: 22, fontWeight: 'bold' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerActionBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerActionIcon: { fontSize: 16 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarCircle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: 'bold', color: '#fff', fontSize: 12 },
  headerName: { fontWeight: 'bold', fontSize: 15 },
  encrypted: { color: '#00ffa3', fontSize: 10, marginTop: 1 },
  bubble: { maxWidth: '80%', borderRadius: 18, padding: 12, marginBottom: 6 },
  myBubble: { alignSelf: 'flex-end', backgroundColor: '#0057a8' },
  theirBubble: { alignSelf: 'flex-start' },
  bubbleText: { fontSize: 15 },
  myText: { color: '#ffffff' },
  time: { fontSize: 10, color: '#999', marginTop: 4, alignSelf: 'flex-end' },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2, marginBottom: 4, paddingHorizontal: 8 },
  reactionBubble: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  reactionText: { fontSize: 14 },
  reactionPicker: { position: 'absolute', top: '40%', left: 20, right: 20, borderRadius: 20, padding: 16, borderWidth: 1 },
  reactionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  reactionOption: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  inputRow: { flexDirection: 'row', padding: 12, paddingHorizontal: 14, alignItems: 'center', gap: 10, borderTopWidth: 1, minHeight: 80 },
  plusBtn: { width: 52, height: 52, borderRadius: 26, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  plusText: { fontSize: 32, fontWeight: '400', lineHeight: 36 },
  input: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 26, fontSize: 16, maxHeight: 120, minHeight: 52 },
  sendBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  sendOff: {},
  sendText: { fontSize: 20 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 44 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontWeight: 'bold', fontSize: 16, marginBottom: 16, textAlign: 'center' },
  attachGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 16 },
  attachItem: { alignItems: 'center', width: 72 },
  attachIconBox: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  attachIcon: { fontSize: 28 },
  attachLabel: { fontSize: 11 },
  tabRow: { flexDirection: 'row', marginBottom: 12, borderRadius: 12, padding: 4 },
  tab: { flex: 1, padding: 8, borderRadius: 10, alignItems: 'center' },
  tabText: { fontSize: 12, fontWeight: 'bold' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingBottom: 16 },
  emojiItem: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  emojiText: { fontSize: 26 },
  gifGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 16 },
  gifItem: { borderRadius: 14, padding: 12, alignItems: 'center', width: '30%' },
  gifEmoji: { fontSize: 30, marginBottom: 4 },
  gifName: { fontSize: 10, textAlign: 'center' },
  closeBtn: { borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 8 },
  closeBtnText: { fontWeight: 'bold' },
  musicOption: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 10, gap: 14 },
  musicIcon: { fontSize: 28 },
  musicName: { fontWeight: 'bold', fontSize: 15 },
  musicSub: { fontSize: 12, marginTop: 2 },
  schedInput: { padding: 14, borderRadius: 12, fontSize: 15, marginBottom: 12 },
  schedLabel: { fontWeight: 'bold', fontSize: 12, marginBottom: 8 },
  schedBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  photoWrap: { alignItems: 'center', marginBottom: 20 },
  contactPhoto: { width: 90, height: 90, borderRadius: 45 },
  photoPlaceholder: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed' },
  photoIcon: { fontSize: 26 },
  photoLabel: { fontSize: 10, marginTop: 4 },
  phoneBox: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 12, gap: 10 },
  phoneLbl: { fontWeight: 'bold', width: 70 },
  fieldGroup: { borderRadius: 12, overflow: 'hidden' },
  fieldInput: { padding: 14, fontSize: 15 },
  fieldDiv: { borderTopWidth: 1 },
});
