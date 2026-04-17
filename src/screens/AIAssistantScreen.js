import React, { useState, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '../services/theme';

const SUGGESTIONS = ['Summarize this conversation','Translate to Spanish','Suggest a reply','Improve my message'];

export default function AIAssistantScreen({ route, navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const { messages: ctxMessages = [], context = '' } = route.params || {};
  const [msgs,    setMsgs]    = useState([
    { id:'0', role:'assistant', content:`Hi! I'm VaultChat AI — a private assistant powered by Claude. Anthropic doesn't train on API conversations, and VaultChat never stores your chats. How can I help?` }
  ]);
  const [text,    setText]    = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  async function send(override) {
    const prompt = override || text.trim();
    if (!prompt) return;
    setText('');
    const userMsg = { id: String(Date.now()), role: 'user', content: prompt };
    setMsgs(prev => [...prev, userMsg]);
    setLoading(true);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: 'You are VaultChat AI — a private, helpful assistant powered by Claude. Be concise and helpful. You help with messaging tasks: summarizing conversations, translating text, suggesting replies, and improving writing. Never mention training data or data retention details unprompted.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || 'I couldn\'t process that. Try again.';
      setMsgs(prev => [...prev, { id: String(Date.now()+1), role: 'assistant', content: reply }]);
    } catch {
      setMsgs(prev => [...prev, { id: String(Date.now()+1), role: 'assistant', content: 'Connection error. Check your internet and try again.' }]);
    }
    setLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }

  return (
    <KeyboardAvoidingView style={[s.container,{backgroundColor:bg}]} behavior={Platform.OS==='ios'?'padding':'height'}>
      <View style={[s.header,{backgroundColor:card,borderBottomColor:border}]}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={[s.back,{color:accent}]}>‹</Text></TouchableOpacity>
        <Text style={{fontSize:22}}>🤖</Text>
        <View style={{flex:1}}>
          <Text style={[{color:tx,fontWeight:'700',fontSize:15}]}>VaultChat AI</Text>
          <Text style={[{color:sub,fontSize:11}]}>Private · No chat storage · No AI training</Text>
        </View>
      </View>

      <FlatList ref={listRef} data={msgs} keyExtractor={i=>i.id}
        contentContainerStyle={{padding:16,gap:12}}
        onContentSizeChange={() => listRef.current?.scrollToEnd({animated:false})}
        renderItem={({item}) => (
          <View style={[s.bWrap, item.role==='user' ? s.myWrap : s.aiWrap]}>
            {item.role==='assistant' && <Text style={{fontSize:18,marginBottom:4}}>🤖</Text>}
            <View style={[s.bubble, {backgroundColor: item.role==='user' ? '#0057a8' : card}]}>
              <Text style={{color:item.role==='user'?'#fff':tx,fontSize:15,lineHeight:22}}>{item.content}</Text>
            </View>
          </View>
        )}
      />

      {loading && (
        <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingBottom:8,gap:8}}>
          <ActivityIndicator size="small" color={accent}/>
          <Text style={{color:sub,fontSize:13}}>Thinking…</Text>
        </View>
      )}

      <View style={s.suggestRow}>
        {SUGGESTIONS.map((sg,i) => (
          <TouchableOpacity key={i} style={[s.suggest,{backgroundColor:card,borderColor:border}]} onPress={() => send(sg)}>
            <Text style={{color:tx,fontSize:11}}>{sg}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[s.inputBar,{backgroundColor:card,borderTopColor:border}]}>
        <TextInput style={[s.input,{backgroundColor:inputBg,color:tx}]}
          placeholder="Ask anything…" placeholderTextColor={sub} value={text} onChangeText={setText} multiline/>
        <TouchableOpacity style={[s.sendBtn,{backgroundColor:text.trim()?accent:inputBg}]}
          onPress={() => send()} disabled={!text.trim()||loading}>
          <Text style={{color:text.trim()?'#000':sub,fontSize:18}}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:  {flex:1},
  header:     {flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingTop:56,paddingBottom:12,borderBottomWidth:1,gap:10},
  back:       {fontSize:30,fontWeight:'bold',padding:4},
  bWrap:      {maxWidth:'85%'},
  myWrap:     {alignSelf:'flex-end'},
  aiWrap:     {alignSelf:'flex-start'},
  bubble:     {borderRadius:18,paddingHorizontal:14,paddingVertical:10},
  suggestRow: {flexDirection:'row',flexWrap:'wrap',gap:8,paddingHorizontal:12,paddingBottom:8},
  suggest:    {paddingHorizontal:12,paddingVertical:7,borderRadius:12,borderWidth:1},
  inputBar:   {flexDirection:'row',alignItems:'center',padding:10,paddingHorizontal:12,borderTopWidth:1,gap:8,paddingBottom:24},
  input:      {flex:1,paddingHorizontal:14,paddingVertical:10,borderRadius:22,fontSize:15,maxHeight:100,minHeight:42},
  sendBtn:    {width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},
});
