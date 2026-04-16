// VaultChat — BusinessChatScreen
import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '../services/theme';

const SAMPLE_MSGS = [
  { id: '1', from: 'business', text: '👋 Thanks for following! We\'ll send you exclusive offers.', time: '2m ago' },
  { id: '2', from: 'business', text: '🛍️ FLASH SALE: 20% off all items this weekend. Use code VAULT20', time: '1m ago' },
];

export default function BusinessChatScreen({ route, navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const { businessName, emoji } = route.params || {};
  const [messages, setMessages] = useState(SAMPLE_MSGS);
  const [text, setText] = useState('');

  function send() {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { id: String(Date.now()), from: 'me', text: text.trim(), time: 'now' }]);
    setText('');
  }

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={[s.backTx, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 26 }}>{emoji || '🏢'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.hName, { color: tx }]}>{businessName || 'Business'}</Text>
          <Text style={[s.hSub, { color: accent }]}>Business Account · 🔒 Encrypted</Text>
        </View>
      </View>
      <FlatList
        data={messages}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item }) => {
          const isMe = item.from === 'me';
          return (
            <View style={[s.bWrap, isMe ? s.myWrap : s.theirWrap]}>
              <View style={[s.bubble, { backgroundColor: isMe ? accent : card }]}>
                <Text style={[s.msgTx, { color: '#fff' }]}>{item.text}</Text>
              </View>
              <Text style={[s.time, { color: sub }]}>{item.time}</Text>
            </View>
          );
        }}
      />
      <View style={[s.inputBar, { backgroundColor: card, borderTopColor: border }]}>
        <TextInput style={[s.input, { backgroundColor: inputBg, color: tx }]}
          placeholder="Reply to business…" placeholderTextColor={sub}
          value={text} onChangeText={setText} multiline />
        <TouchableOpacity style={[s.sendBtn, { backgroundColor: text.trim() ? accent : inputBg }]}
          onPress={send} disabled={!text.trim()}>
          <Text style={{ color: text.trim() ? '#fff' : sub, fontSize: 18 }}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  backBtn:   { padding: 4 },
  backTx:    { fontSize: 28, fontWeight: 'bold' },
  hName:     { fontWeight: 'bold', fontSize: 15 },
  hSub:      { fontSize: 11 },
  bWrap:     { maxWidth: '80%' },
  myWrap:    { alignSelf: 'flex-end' },
  theirWrap: { alignSelf: 'flex-start' },
  bubble:    { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  msgTx:     { fontSize: 15, lineHeight: 21 },
  time:      { fontSize: 10, marginTop: 3 },
  inputBar:  { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: 12, borderTopWidth: 1, gap: 8, paddingBottom: 24 },
  input:     { flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, fontSize: 15, maxHeight: 100, minHeight: 42 },
  sendBtn:   { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
