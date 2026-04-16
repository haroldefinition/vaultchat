import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';

const MAX_PARTICIPANTS = 8;

export default function GroupCallScreen({ route, navigation }) {
  const { groupName = 'Group', participants: initial = [] } = route.params || {};
  const { bg, card, tx, sub, border, accent } = useTheme();
  const [participants, setParticipants] = useState(
    initial.length ? initial : [{ id:'me', name:'You', muted:false, video:false }]
  );
  const [muted,     setMuted]     = useState(false);
  const [videoOn,   setVideoOn]   = useState(false);
  const [speaker,   setSpeaker]   = useState(true);
  const [duration,  setDuration]  = useState(0);
  const [addInput,  setAddInput]  = useState('');
  const [quality,   setQuality]   = useState('HD');
  const timer = useRef(null);
  const qualityMap = { HD:'🟢', SD:'🟡', Low:'🟠', Min:'🔴' };

  useEffect(() => {
    timer.current = setInterval(() => setDuration(d => d + 1), 1000);
    // Simulate quality changes for rural simulation
    const qTimer = setInterval(() => {
      const qs = ['HD','SD','Low','HD','HD','SD'];
      setQuality(qs[Math.floor(Math.random()*qs.length)]);
    }, 8000);
    return () => { clearInterval(timer.current); clearInterval(qTimer); };
  }, []);

  function fmt(s) {
    const m = Math.floor(s/60), sec = s%60;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  async function haptic() {
    try {
      const v = await AsyncStorage.getItem('vaultchat_haptic');
      if (v === null || JSON.parse(v)) Vibration.vibrate(15);
    } catch { Vibration.vibrate(15); }
  }

  function toggleMute() { haptic(); setMuted(m => !m); setParticipants(prev => prev.map(p => p.id==='me'?{...p,muted:!muted}:p)); }
  function toggleVideo(){ haptic(); setVideoOn(v => !v); }
  function endCall()    { navigation.goBack(); }

  function addParticipant() {
    if (participants.length >= MAX_PARTICIPANTS) { Alert.alert('Limit reached', 'Group calls support up to 8 people.'); return; }
    const name = addInput.trim() || `User ${participants.length}`;
    setParticipants(prev => [...prev, { id:`p_${Date.now()}`, name, muted:false, video:false }]);
    setAddInput('');
  }

  const KEYPAD = ['1','2','3','4','5','6','7','8','9','*','0','#'];

  return (
    <View style={[s.container,{backgroundColor:bg}]}>
      <View style={[s.header,{borderBottomColor:border}]}>
        <Text style={[s.groupName,{color:tx}]}>{groupName}</Text>
        <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
          <Text style={{fontSize:14}}>{qualityMap[quality]}</Text>
          <Text style={[{color:sub,fontSize:13}]}>{quality} · {fmt(duration)}</Text>
        </View>
      </View>

      {/* Participant grid */}
      <FlatList
        data={participants}
        keyExtractor={p=>p.id}
        numColumns={2}
        contentContainerStyle={{padding:12,gap:8}}
        columnWrapperStyle={{gap:8}}
        style={{flex:1}}
        renderItem={({item}) => (
          <View style={[s.participantCard,{backgroundColor:card,borderColor:border}]}>
            <View style={[s.avatar,{backgroundColor:accent+'33'}]}>
              <Text style={{fontSize:24}}>{item.name[0]?.toUpperCase()}</Text>
            </View>
            <Text style={[{color:tx,fontWeight:'600',fontSize:13,marginTop:8}]} numberOfLines={1}>{item.name}</Text>
            <View style={{flexDirection:'row',gap:6,marginTop:4}}>
              {item.muted  && <Text style={{fontSize:12}}>🔇</Text>}
              {item.video  && <Text style={{fontSize:12}}>📹</Text>}
              {!item.muted && !item.video && <Text style={{fontSize:12,color:sub}}>🎙️</Text>}
            </View>
          </View>
        )}
        ListFooterComponent={participants.length < MAX_PARTICIPANTS ? (
          <TouchableOpacity style={[s.addCard,{backgroundColor:card,borderColor:border}]} onPress={() => Alert.prompt('Add Participant','Enter their name or phone:',(name)=>{ if(name) { setParticipants(prev=>[...prev,{id:`p_${Date.now()}`,name,muted:false,video:false}]); } })}>
            <Text style={{fontSize:28,color:sub}}>+</Text>
            <Text style={[{color:sub,fontSize:12,marginTop:4}]}>Add</Text>
          </TouchableOpacity>
        ) : null}
      />

      {/* Controls */}
      <View style={[s.controls,{backgroundColor:card,borderTopColor:border}]}>
        {[
          { icon: muted?'🔇':'🎙️',  label: muted?'Unmute':'Mute',    fn: toggleMute  },
          { icon: videoOn?'📹':'📷', label: videoOn?'Video Off':'Video', fn: toggleVideo },
          { icon: speaker?'🔊':'🔈', label: 'Speaker',               fn: () => setSpeaker(s=>!s) },
        ].map(btn => (
          <TouchableOpacity key={btn.label} style={[s.ctrlBtn,{backgroundColor:bg}]} onPress={btn.fn}>
            <Text style={{fontSize:28}}>{btn.icon}</Text>
            <Text style={[{color:sub,fontSize:11,marginTop:4}]}>{btn.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.endBtn]} onPress={endCall}>
          <Text style={{fontSize:28}}>📵</Text>
          <Text style={[{color:'#ff3b30',fontSize:11,marginTop:4}]}>End</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container:       {flex:1},
  header:          {paddingHorizontal:20,paddingTop:56,paddingBottom:14,borderBottomWidth:1,alignItems:'center',gap:4},
  groupName:       {fontSize:20,fontWeight:'800'},
  participantCard: {flex:1,borderRadius:20,padding:16,borderWidth:1,alignItems:'center',minHeight:130},
  avatar:          {width:56,height:56,borderRadius:28,alignItems:'center',justifyContent:'center'},
  addCard:         {flex:1,borderRadius:20,padding:16,borderWidth:1,alignItems:'center',justifyContent:'center',minHeight:130,borderStyle:'dashed'},
  controls:        {flexDirection:'row',justifyContent:'space-around',paddingVertical:16,paddingBottom:36,borderTopWidth:1},
  ctrlBtn:         {alignItems:'center',padding:12,borderRadius:20,minWidth:70},
  endBtn:          {alignItems:'center',padding:12,borderRadius:20,minWidth:70},
});
