// VaultChat — AIAssistantScreen
// Private AI — zero data retention, session clears on exit
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '../services/theme';

export default function AIAssistantScreen({ route, navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const { messages: chatMessages = [], context = '' } = route.params || {};
  const [messages, setMessages] = useState([
    { id: 'sys', role: 'assistant', text: '👋 I\'m your private AI. I can summarize, translate, improve your writing, or suggest replies. This session is not stored.' },
  ]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  const QUICK = ['Summarize conversation', 'Suggest a reply', 'Translate to Spanish', 'Make it more professional'];

  async function ask(question) {
    const q = question || input.trim();
    if (!q) return;
    setInput('');
    const userMsg = { id: `u${Date.now()}`, role: 'user', text: q };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 512,
          system: 'You are a private AI assistant inside VaultChat, a privacy-first messaging app. Be concise and helpful. The user may share conversation context. Never store or repeat sensitive information.',
          messages: [
            ...(chatMessages.length > 0 ? [{ role: 'user', content: `Context from my conversation with ${context}: ${chatMessages.slice(-5).map(m => m.content).join(' | ')}` }] : []),
            { role: 'user', content: q },
          ],
        }),
      });
      const data = await resp.json();
      const text = data.content?.[0]?.text || 'I couldn\'t process that. Please try again.';
      setMessages(prev => [...prev, { id: `a${Date.now()}`, role: 'assistant', text }]);
    } catch {
      setMessages(prev => [...prev, { id: `e${Date.now()}`, role: 'assistant', text: '⚠️ Connection error. Please try again.' }]);
    }
    setLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={[s.backTx, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 22 }}>🤖</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.hName, { color: tx }]}>AI Assistant</Text>
          <Text style={[s.hSub, { color: accent }]}>🔒 Zero data retention · Private</Text>
        </View>
        <TouchableOpacity onPress={() => { setMessages([{ id: 'sys', role: 'assistant', text: '👋 Session cleared. How can I help?' }]); }} style={{ padding: 8 }}>
          <Text style={{ color: sub, fontSize: 12 }}>Clear</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item }) => {
          const isMe = item.role === 'user';
          return (
            <View style={[s.bWrap, isMe ? s.myWrap : s.theirWrap]}>
              <View style={[s.bubble, { backgroundColor: isMe ? accent : card }]}>
                <Text style={[s.msgTx, { color: '#fff' }]}>{item.text}</Text>
              </View>
            </View>
          );
        }}
        ListFooterComponent={loading ? <View style={s.loadingRow}><ActivityIndicator color={accent} size="small" /><Text style={[s.loadingTx, { color: sub }]}>Thinking…</Text></View> : null}
      />

      {/* Quick action chips */}
      <View style={[s.quickRow, { borderTopColor: border }]}>
        {QUICK.map((q, i) => (
          <TouchableOpacity key={i} style={[s.quickChip, { backgroundColor: card, borderColor: border }]} onPress={() => ask(q)}>
            <Text style={[s.quickTx, { color: tx }]}>{q}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[s.inputBar, { backgroundColor: card, borderTopColor: border }]}>
        <TextInput style={[s.input, { backgroundColor: inputBg, color: tx }]}
          placeholder="Ask anything…" placeholderTextColor={sub}
          value={input} onChangeText={setInput} multiline />
        <TouchableOpacity style={[s.sendBtn, { backgroundColor: input.trim() ? accent : inputBg }]}
          onPress={() => ask()} disabled={!input.trim() || loading}>
          <Text style={{ color: input.trim() ? '#fff' : sub, fontSize: 18 }}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1 },
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  backBtn:    { padding: 4 },
  backTx:     { fontSize: 28, fontWeight: 'bold' },
  hName:      { fontWeight: 'bold', fontSize: 15 },
  hSub:       { fontSize: 11 },
  bWrap:      { maxWidth: '85%' },
  myWrap:     { alignSelf: 'flex-end' },
  theirWrap:  { alignSelf: 'flex-start' },
  bubble:     { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  msgTx:      { fontSize: 15, lineHeight: 21 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 16 },
  loadingTx:  { fontSize: 13 },
  quickRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, borderTopWidth: 1 },
  quickChip:  { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  quickTx:    { fontSize: 12, fontWeight: '500' },
  inputBar:   { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: 12, borderTopWidth: 1, gap: 8, paddingBottom: 24 },
  input:      { flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, fontSize: 15, maxHeight: 100, minHeight: 42 },
  sendBtn:    { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
