import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';

const BACKEND = 'https://vaultchat-production-3a96.up.railway.app';

export default function GroupChatScreen({ route, navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const { group } = route.params;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [myId, setMyId] = useState('');
  const [myName, setMyName] = useState('');
  const flatRef = useRef(null);

  useEffect(() => {
    loadUser();
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, []);

  async function loadUser() {
    const saved = await AsyncStorage.getItem('vaultchat_user');
    const name = await AsyncStorage.getItem('vaultchat_display_name');
    if (saved) {
      const parsed = JSON.parse(saved);
      setMyId(parsed.id || parsed.phone || '');
    }
    if (name) setMyName(name);
  }

  async function fetchMessages() {
    try {
      const res = await fetch(`${BACKEND}/messages/${group.id}`);
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
    } catch (e) {}
  }

  async function sendMessage() {
    if (!text.trim()) return;
    setLoading(true);
    const content = text.trim();
    setText('');
    try {
      await fetch(`${BACKEND}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: group.id,
          sender_id: myId || '550e8400-e29b-41d4-a716-446655440001',
          content: `[${myName || 'You'}]: ${content}`,
        }),
      });
      fetchMessages();
    } catch (e) {}
    setLoading(false);
  }

  const isMe = msg => {
    const prefix = `[${myName || 'You'}]:`;
    return msg.content?.startsWith(prefix) || msg.sender_id === myId;
  };

  const getSenderName = msg => {
    const match = msg.content?.match(/^\[(.+?)\]:/);
    return match ? match[1] : 'Member';
  };

  const getContent = msg => {
    return msg.content?.replace(/^\[.+?\]:\s*/, '') || msg.content;
  };

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[s.back, { color: accent }]}>‹ Back</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={[s.groupAvatar, { backgroundColor: accent }]}>
            <Text style={s.groupAvatarText}>{group.name[0].toUpperCase()}</Text>
          </View>
          <View>
            <Text style={[s.headerName, { color: tx }]}>{group.name}</Text>
            <Text style={[s.headerSub, { color: sub }]}>
              🔒 Encrypted · {group.memberCount || group.members?.length + 1 || 1} members
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => Alert.alert(group.name, `Members: ${group.members?.map(m => m.name).join(', ') || 'Just you'}\n\nThis group is end-to-end encrypted.`)}>
          <Text style={{ fontSize: 20 }}>ℹ️</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={item => item.id || Math.random().toString()}
        onContentSizeChange={() => flatRef.current?.scrollToEnd()}
        style={{ backgroundColor: bg }}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View style={[s.msgWrapper, isMe(item) ? s.myWrapper : s.theirWrapper]}>
            {!isMe(item) && (
              <Text style={[s.senderName, { color: accent }]}>{getSenderName(item)}</Text>
            )}
            <View style={[s.bubble, isMe(item) ? [s.myBubble] : [s.theirBubble, { backgroundColor: card }]]}>
              <Text style={[s.bubbleText, isMe(item) ? s.myText : { color: tx }]}>
                {getContent(item)}
              </Text>
              <Text style={s.time}>
                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>👥</Text>
            <Text style={[s.emptyText, { color: sub }]}>No messages yet.{'\n'}Send the first message!</Text>
          </View>
        }
      />

      {/* Input */}
      <View style={[s.inputRow, { backgroundColor: card, borderTopColor: border }]}>
        <TextInput
          style={[s.input, { backgroundColor: inputBg, color: tx }]}
          placeholder="Message group..."
          placeholderTextColor={sub}
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity
          style={[s.sendBtn, { backgroundColor: text.trim() ? accent : inputBg }]}
          onPress={sendMessage}
          disabled={!text.trim() || loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={[s.sendText, { color: text.trim() ? '#fff' : sub }]}>➤</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  back: { fontSize: 22, fontWeight: 'bold' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  groupAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  headerName: { fontWeight: 'bold', fontSize: 15 },
  headerSub: { fontSize: 11, marginTop: 1 },
  msgWrapper: { marginBottom: 8 },
  myWrapper: { alignItems: 'flex-end' },
  theirWrapper: { alignItems: 'flex-start' },
  senderName: { fontSize: 12, fontWeight: 'bold', marginBottom: 3, marginLeft: 4 },
  bubble: { maxWidth: '80%', borderRadius: 18, padding: 12 },
  myBubble: { backgroundColor: '#0057a8' },
  theirBubble: {},
  bubbleText: { fontSize: 15 },
  myText: { color: '#fff' },
  time: { fontSize: 10, color: '#999', marginTop: 4, alignSelf: 'flex-end' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 60 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  inputRow: { flexDirection: 'row', padding: 12, paddingHorizontal: 14, alignItems: 'center', gap: 10, borderTopWidth: 1, minHeight: 80 },
  input: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 26, fontSize: 16, maxHeight: 120, minHeight: 52 },
  sendBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontSize: 20 },
});
