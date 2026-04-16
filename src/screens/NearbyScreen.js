import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, Animated } from 'react-native';
import { useTheme } from '../services/theme';
import { isOnline, queueMessage, getQueueCount, scanNearbyDevices } from '../services/offlineQueue';

export default function NearbyScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [online,   setOnline]   = useState(true);
  const [devices,  setDevices]  = useState([]);
  const [queue,    setQueue]    = useState(0);
  const [scanning, setScanning] = useState(false);
  const [msgText,  setMsgText]  = useState('');
  const [selected, setSelected] = useState(null);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    checkStatus();
    const t = setInterval(checkStatus, 5000);
    return () => clearInterval(t);
  }, []);

  async function checkStatus() {
    const on = await isOnline();
    setOnline(on);
    const q = await getQueueCount();
    setQueue(q);
  }

  async function scan() {
    setScanning(true);
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, {toValue:1.3, duration:600, useNativeDriver:true}),
      Animated.timing(pulse, {toValue:1,   duration:600, useNativeDriver:true}),
    ])).start();
    setTimeout(() => {
      setDevices(scanNearbyDevices());
      setScanning(false);
      pulse.stopAnimation();
      pulse.setValue(1);
    }, 2000);
  }

  async function sendOffline() {
    if (!msgText.trim() || !selected) return;
    await queueMessage({ to: selected.id, content: msgText.trim(), id: `q_${Date.now()}` });
    Alert.alert('Queued', 'Message saved. It will send when connection is restored or delivered via mesh when in range.');
    setMsgText('');
    checkStatus();
  }

  return (
    <View style={[s.container,{backgroundColor:bg}]}>
      <View style={[s.header,{backgroundColor:card,borderBottomColor:border}]}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={[s.back,{color:accent}]}>‹</Text></TouchableOpacity>
        <Text style={[s.title,{color:tx}]}>Nearby</Text>
        <View style={[s.statusBadge,{backgroundColor:online?'#00ffa322':'#ff3b3022'}]}>
          <Text style={{color:online?'#00ffa3':'#ff3b30',fontSize:12,fontWeight:'700'}}>{online?'🟢 Online':'🔴 Offline'}</Text>
        </View>
      </View>

      <View style={[s.infoCard,{backgroundColor:card,borderColor:border}]}>
        <Text style={{fontSize:32,marginBottom:8}}>📡</Text>
        <Text style={[{color:tx,fontWeight:'700',fontSize:16,marginBottom:6}]}>Mesh Messaging</Text>
        <Text style={[{color:sub,fontSize:13,textAlign:'center',lineHeight:19}]}>
          Send messages to nearby VaultChat users without internet.{'\n'}
          Messages are encrypted and queue locally until delivered.
        </Text>
        {queue > 0 && (
          <View style={[s.queueBadge,{backgroundColor:accent}]}>
            <Text style={{color:'#000',fontWeight:'700',fontSize:12}}>{queue} message{queue>1?'s':''} queued</Text>
          </View>
        )}
      </View>

      <TouchableOpacity style={[s.scanBtn,{borderColor:accent}]} onPress={scan} disabled={scanning}>
        <Animated.Text style={{fontSize:36, transform:[{scale:pulse}]}}>📡</Animated.Text>
        <Text style={[{color:accent,fontWeight:'700',marginTop:8}]}>{scanning?'Scanning…':'Scan for Devices'}</Text>
      </TouchableOpacity>

      {devices.length > 0 && (
        <>
          <Text style={[s.sectionTitle,{color:sub}]}>NEARBY DEVICES</Text>
          <FlatList
            data={devices}
            keyExtractor={d=>d.id}
            horizontal
            contentContainerStyle={{paddingHorizontal:16,gap:10}}
            renderItem={({item}) => (
              <TouchableOpacity
                style={[s.deviceCard,{backgroundColor:selected?.id===item.id?accent+'22':card,borderColor:selected?.id===item.id?accent:border}]}
                onPress={() => setSelected(item)}>
                <Text style={{fontSize:28}}>📱</Text>
                <Text style={[{color:tx,fontWeight:'600',fontSize:12,textAlign:'center',marginTop:4}]}>{item.name}</Text>
                <Text style={[{color:sub,fontSize:10}]}>{item.signal} dBm</Text>
              </TouchableOpacity>
            )}
          />
          {selected && (
            <View style={[s.composeRow,{backgroundColor:card,borderTopColor:border}]}>
              <TextInput style={[s.input,{backgroundColor:inputBg,color:tx}]}
                placeholder={`Message to ${selected.name}…`} placeholderTextColor={sub}
                value={msgText} onChangeText={setMsgText}/>
              <TouchableOpacity style={[s.sendBtn,{backgroundColor:accent}]} onPress={sendOffline}>
                <Text style={{color:'#000',fontWeight:'700'}}>Send</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      <Text style={[s.note,{color:sub}]}>
        🔒 All nearby messages are end-to-end encrypted.{'\n'}No data passes through VaultChat servers.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:   {flex:1},
  header:      {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:56,paddingBottom:12,borderBottomWidth:1,gap:12},
  back:        {fontSize:30,fontWeight:'bold'},
  title:       {flex:1,fontSize:20,fontWeight:'800'},
  statusBadge: {paddingHorizontal:10,paddingVertical:5,borderRadius:12},
  infoCard:    {margin:16,borderRadius:20,padding:20,borderWidth:1,alignItems:'center'},
  queueBadge:  {marginTop:12,paddingHorizontal:14,paddingVertical:6,borderRadius:12},
  scanBtn:     {alignSelf:'center',alignItems:'center',borderRadius:80,borderWidth:2,padding:24,marginVertical:16},
  sectionTitle:{paddingHorizontal:16,fontSize:11,fontWeight:'700',letterSpacing:0.5,marginBottom:8},
  deviceCard:  {width:100,borderRadius:16,padding:14,borderWidth:1,alignItems:'center'},
  composeRow:  {flexDirection:'row',alignItems:'center',padding:12,borderTopWidth:1,gap:8,marginTop:12},
  input:       {flex:1,borderRadius:20,paddingHorizontal:14,paddingVertical:10,fontSize:15,minHeight:42},
  sendBtn:     {paddingHorizontal:18,paddingVertical:10,borderRadius:20},
  note:        {textAlign:'center',fontSize:12,lineHeight:18,padding:20,marginTop:'auto'},
});
