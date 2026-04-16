import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '../services/theme';

const INIT_MSGS = [
  { id:'1', text:'Welcome! You\'ve opted in to receive messages from us. You can unfollow anytime.', isMe:false, time:'Yesterday' },
  { id:'2', text:'Thanks! Looking forward to your offers.', isMe:true, time:'Yesterday' },
  { id:'3', text:'🛍️ Special offer — 20% off everything this weekend. Use code VAULT20.', isMe:false, time:'10:30 AM' },
];

export default function BusinessChatScreen({ route, navigation }) {
  const { bizName = 'Business', bizEmoji = '🏪' } = route.params || {};
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [messages, setMessages] = useState(INIT_MSGS);
  const [text, setText] = useState('');

  function send() {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { id: String(Date.now()), text: text.trim(), isMe: true, time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) }]);
    setText('');
  }

  return (
    <KeyboardAvoidingView style={[s.container, {backgroundColor:bg}]} behavior={Platform.OS==='ios'?'padding':'height'}>
      <View style={[s.header, {backgroundColor:card, borderBottomColor:border}]}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={[s.back,{color:accent}]}>‹</Text></TouchableOpacity>
        <Text style={{fontSize:26}}>{bizEmoji}</Text>
        <View style={{flex:1}}>
          <Text style={[{color:tx,fontWeight:'700',fontSize:15}]}>{bizName}</Text>
          <View style={[s.verifiedBadge]}>
            <Text style={{color:'#fff',fontSize:10,fontWeight:'700'}}>✓ BUSINESS ACCOUNT</Text>
          </View>
        </View>
        <TouchableOpacity style={[s.unfollowBtn,{borderColor:border}]} onPress={() => navigation.goBack()}>
          <Text style={{color:sub,fontSize:12}}>Unfollow</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={{padding:12,gap:8}}
        renderItem={({item}) => (
          <View style={[s.bWrap, item.isMe ? s.myWrap : s.theirWrap]}>
            <View style={[s.bubble, {backgroundColor: item.isMe ? '#0057a8' : card}]}>
              <Text style={{color:item.isMe?'#fff':tx,fontSize:15,lineHeight:21}}>{item.text}</Text>
            </View>
            <Text style={[s.time, {color:sub}]}>{item.time}</Text>
          </View>
        )}
      />
      <View style={[s.inputBar,{backgroundColor:card,borderTopColor:border}]}>
        <TextInput style={[s.input,{backgroundColor:inputBg,color:tx}]}
          placeholder="Reply…" placeholderTextColor={sub} value={text} onChangeText={setText}/>
        <TouchableOpacity style={[s.sendBtn,{backgroundColor:text.trim()?accent:inputBg}]} onPress={send}>
          <Text style={{color:text.trim()?'#000':sub,fontSize:18}}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:    {flex:1},
  header:       {flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingTop:56,paddingBottom:12,borderBottomWidth:1,gap:10},
  back:         {fontSize:30,fontWeight:'bold',padding:4},
  verifiedBadge:{backgroundColor:'#0057a8',alignSelf:'flex-start',paddingHorizontal:6,paddingVertical:2,borderRadius:6,marginTop:2},
  unfollowBtn:  {paddingHorizontal:12,paddingVertical:6,borderRadius:10,borderWidth:1},
  bWrap:        {marginBottom:2,maxWidth:'80%'},
  myWrap:       {alignSelf:'flex-end',alignItems:'flex-end'},
  theirWrap:    {alignSelf:'flex-start',alignItems:'flex-start'},
  bubble:       {borderRadius:18,paddingHorizontal:14,paddingVertical:10},
  time:         {fontSize:11,marginTop:3,marginBottom:6},
  inputBar:     {flexDirection:'row',alignItems:'center',padding:10,paddingHorizontal:12,borderTopWidth:1,gap:8,paddingBottom:24},
  input:        {flex:1,paddingHorizontal:14,paddingVertical:10,borderRadius:22,fontSize:15,minHeight:42},
  sendBtn:      {width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},
});
