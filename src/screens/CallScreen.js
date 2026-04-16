import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Vibration } from 'react-native';
import { useTheme } from '../services/theme';
import { setupCallKit } from '../services/callkit';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SAMPLE_CALLS = [
  { id: '1', name: 'Jon', number: '6092330963', type: 'incoming', time: 'Today, 5:42 PM', duration: '3m 21s' },
  { id: '2', name: 'Unknown', number: '2675551234', type: 'missed', time: 'Today, 2:10 PM', duration: '' },
  { id: '3', name: 'Jon', number: '6092330963', type: 'outgoing', time: 'Yesterday, 8:00 PM', duration: '12m 4s' },
];

export default function CallScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [calls, setCalls] = useState(SAMPLE_CALLS);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('recent');
  const [vmPlaying, setVmPlaying] = useState(null);
  const [editCallModal, setEditCallModal] = useState(false);
  const [editCallTarget, setEditCallTarget] = useState(null);
  const [dialInput, setDialInput] = useState('');

  useEffect(() => {
    setupCallKit();
    loadCalls();
  }, []);

  async function loadCalls() {
    try {
      const saved = await AsyncStorage.getItem('vaultchat_calls');
      if (saved) setCalls(JSON.parse(saved));
    } catch (e) {}
  }

  function makeCall(name, number, type = 'voice') {
    if (!number) { Alert.alert('Error', 'Enter a phone number'); return; }
    navigation.navigate('ActiveCall', { recipientName: name || '', recipientPhone: number, user, callType: type });
  }

  function addDigit(d) {
    Vibration.vibrate(20);
    setDialInput(p => p.length < 10 ? p + d : p);
  }

  function deleteDigit() { setDialInput(p => p.slice(0, -1)); }

  const typeColor = type => type === 'missed' ? '#ff4444' : tx;
  const typeIcon = type => type === 'incoming' ? '↙' : type === 'outgoing' ? '↗' : '✗';

  const PlusButton = () => (
    <TouchableOpacity
      style={[s.plusCircleBtn, { backgroundColor: accent }]}
      onPress={() => navigation.navigate('NewCall')}
    >
      <Text style={s.plusCircleText}>+</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: border }]}>
        <Text style={[s.title, { color: accent }]}>Calls</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[s.tabToggle, { backgroundColor: card, borderColor: border }]}>
            <TouchableOpacity style={[s.tabBtn, tab === 'recent' && { backgroundColor: accent }]} onPress={() => setTab('recent')}>
              <Text style={[s.tabBtnText, { color: tab === 'recent' ? '#fff' : sub }]}>Recent</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tabBtn, tab === 'voicemail' && { backgroundColor: accent }]} onPress={() => setTab('voicemail')}>
              <Text style={[s.tabBtnText, { color: tab === 'voicemail' ? '#fff' : sub }]}>Voicemail</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tabBtn, tab === 'keypad' && { backgroundColor: accent }]} onPress={() => setTab('keypad')}>
              <Text style={[s.tabBtnText, { color: tab === 'keypad' ? '#fff' : sub }]}>Keypad</Text>
            </TouchableOpacity>
          </View>
          <PlusButton />
        </View>
      </View>

      {tab === 'voicemail' ? (
        <VoicemailTab accent={accent} card={card} tx={tx} sub={sub} border={border} inputBg={inputBg} navigation={navigation} />
      ) : tab === 'keypad' ? (
        <View style={s.keypadPage}>
          <View style={s.displayBox}>
            <Text style={[s.displayText, { color: tx }]}>
              {dialInput
                ? `+1 ${dialInput.slice(0,3)}${dialInput.length > 3 ? ' ' : ''}${dialInput.slice(3,6)}${dialInput.length > 6 ? ' ' : ''}${dialInput.slice(6)}`
                : 'Enter number'}
            </Text>
            {dialInput.length > 0 && (
              <TouchableOpacity onPress={deleteDigit} style={s.deleteBtn}>
                <Text style={{ color: sub, fontSize: 22 }}>⌫</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={s.keypadGrid}>
            {[
              [{ d: '1', s: '' }, { d: '2', s: 'ABC' }, { d: '3', s: 'DEF' }],
              [{ d: '4', s: 'GHI' }, { d: '5', s: 'JKL' }, { d: '6', s: 'MNO' }],
              [{ d: '7', s: 'PQRS' }, { d: '8', s: 'TUV' }, { d: '9', s: 'WXYZ' }],
              [{ d: '*', s: '' }, { d: '0', s: '+' }, { d: '#', s: '' }],
            ].map((row, i) => (
              <View key={i} style={s.keyRow}>
                {row.map(({ d, s: sub2 }) => (
                  <TouchableOpacity key={d} style={[s.dialKey, { backgroundColor: card, borderColor: border }]} onPress={() => addDigit(d)}>
                    <Text style={[s.dialDigit, { color: tx }]}>{d}</Text>
                    {sub2 ? <Text style={[s.dialSub, { color: sub }]}>{sub2}</Text> : null}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>

          <View style={s.callBtnRow}>
            <TouchableOpacity
              style={[s.greenCallBtn, { backgroundColor: '#34C759', opacity: dialInput.length >= 10 ? 1 : 0.4 }]}
              onPress={() => makeCall('', dialInput, 'voice')}
              disabled={dialInput.length < 10}
            >
              <Text style={s.greenCallIcon}>📞</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[s.facetimeCallBtn, { backgroundColor: '#1a73e8', opacity: dialInput.length >= 10 ? 1 : 0.4 }]}
            onPress={() => makeCall('', dialInput, 'video')}
            disabled={dialInput.length < 10}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>📹 FaceTime</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={[s.featureBanner, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.featureText, { color: accent }]}>✓ Background Persist  ✓ Hold/Swap  ✓ Never Drop  ✓ Noise Cancel</Text>
          </View>
          <FlatList
            data={calls}
            keyExtractor={i => i.id}
            renderItem={({ item }) => (
              <View style={[s.callItem, { borderBottomColor: border }]}>
                <TouchableOpacity style={[s.avatar, { backgroundColor: item.type === 'missed' ? '#ff4444' : accent }]}
                  onPress={() => { setEditCallTarget(item); setEditCallModal(true); }}>
                  <Text style={s.avatarText}>{item.name[0]}</Text>
                </TouchableOpacity>
                <View style={s.callInfo}>
                  <Text style={[s.callName, { color: typeColor(item.type) }]}>{item.name}</Text>
                  <Text style={[s.callSub, { color: sub }]}>
                    {typeIcon(item.type)} {item.type === 'incoming' ? 'Incoming' : item.type === 'outgoing' ? 'Outgoing' : 'Missed'} · {item.time}
                  </Text>
                  {item.duration ? <Text style={[s.callDuration, { color: sub }]}>⏱ {item.duration}</Text> : null}
                </View>
                <View style={s.callActions}>
                  <TouchableOpacity style={[s.callBtn, { backgroundColor: '#34C759' }]} onPress={() => makeCall(item.name, item.number, 'voice')}>
                    <Text style={{ fontSize: 18 }}>📞</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.callBtn, { backgroundColor: '#1a73e8' }]} onPress={() => makeCall(item.name, item.number, 'video')}>
                    <Text style={{ fontSize: 18 }}>📹</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={s.emptyIcon}>📞</Text>
                <Text style={[s.emptyText, { color: tx }]}>No recent calls</Text>
                <Text style={[s.emptySub, { color: sub }]}>Tap + to make a call</Text>
              </View>
            }
          />
        </View>
      )}

      {/* Edit contact from call history */}
      <Modal visible={editCallModal} animationType="slide" transparent onRequestClose={() => setEditCallModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <CallContactEditor
            item={editCallTarget}
            onClose={() => { setEditCallModal(false); setEditCallTarget(null); }}
            onSave={(updated) => {
              setCalls(prev => prev.map(c => c.id === updated.id ? { ...c, name: updated.name } : c));
              setEditCallModal(false); setEditCallTarget(null);
            }}
            accent={accent} bg={bg} card={card} tx={tx} sub={sub} border={border} inputBg={inputBg}
          />
        </View>
      </Modal>
    </View>
  );
}


// ── Call Contact Editor ────────────────────────────────────────
function CallContactEditor({ item, onClose, onSave, accent, bg, card, tx, sub, border, inputBg }) {
  const [name, setName] = React.useState(item?.name || '');
  const [num,  setNum]  = React.useState(item?.number || '');

  async function pickPhoto() {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: true, aspect: [1,1] });
    // photo handled inline
  }

  return (
    <View style={{ backgroundColor: bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 44 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }}>
        <TouchableOpacity onPress={onClose}><Text style={{ color: sub, fontSize: 16 }}>Cancel</Text></TouchableOpacity>
        <Text style={{ color: tx, fontWeight: '700', fontSize: 17 }}>Edit Contact</Text>
        <TouchableOpacity onPress={() => onSave({ ...item, name, number: num })}><Text style={{ color: accent, fontWeight: '700', fontSize: 16 }}>Save</Text></TouchableOpacity>
      </View>
      <View style={{ padding: 20, gap: 12 }}>
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: accent + '33', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 36, color: tx, fontWeight: '700' }}>{name?.[0]?.toUpperCase() || '?'}</Text>
          </View>
          <TouchableOpacity onPress={pickPhoto} style={{ marginTop: 8 }}>
            <Text style={{ color: accent, fontWeight: '600' }}>Change Photo</Text>
          </TouchableOpacity>
        </View>
        {[['Name', name, setName, 'default'], ['Phone Number', num, setNum, 'phone-pad']].map(([label, val, setter, kb]) => (
          <View key={label} style={{ backgroundColor: card, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ color: sub, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>{label.toUpperCase()}</Text>
            <TextInput style={{ color: tx, fontSize: 16 }} value={val} onChangeText={setter} keyboardType={kb} autoCapitalize={kb === 'default' ? 'words' : 'none'} placeholder={label} placeholderTextColor={sub} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Voicemail Tab ─────────────────────────────────────────────

// ── Waveform animation ─────────────────────────────────────────
class Waveform extends React.Component {
  constructor(props) {
    super(props);
    const { Animated } = require('react-native');
    this.bars = Array.from({ length: 18 }, () => new Animated.Value(0.3));
    this.anims = [];
  }
  componentDidMount() {
    const { Animated } = require('react-native');
    this.anims = this.bars.map((bar, i) =>
      Animated.loop(Animated.sequence([
        Animated.timing(bar, { toValue: 0.3 + Math.random() * 0.7, duration: 220 + i * 25, useNativeDriver: true }),
        Animated.timing(bar, { toValue: 0.2, duration: 220 + i * 25, useNativeDriver: true }),
      ]))
    );
    this.anims.forEach(a => a.start());
  }
  componentWillUnmount() { this.anims.forEach(a => a.stop()); }
  render() {
    const { Animated, View } = require('react-native');
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 22, flex: 1, paddingHorizontal: 4 }}>
        {this.bars.map((bar, i) => (
          <Animated.View key={i} style={{ width: 3, borderRadius: 2, backgroundColor: this.props.accent, height: 20, transform: [{ scaleY: bar }] }} />
        ))}
      </View>
    );
  }
}

const VOICEMAILS = [
  { id:'vm1', from:'Mom',           phone:'+1 555 234 5678', duration:'0:42', date:'Today 9:14 AM',    read:false },
  { id:'vm2', from:'Dr. Johnson',   phone:'+1 555 876 5432', duration:'1:18', date:'Yesterday 2:30 PM', read:false },
  { id:'vm3', from:'John Smith',    phone:'+1 555 345 6789', duration:'0:25', date:'Mon 11:05 AM',      read:true  },
  { id:'vm4', from:'Unknown',       phone:'+1 555 000 1234', duration:'0:12', date:'Sun 6:48 PM',       read:true  },
];

function VoicemailTab({ accent, card, tx, sub, border, inputBg, navigation }) {
  const [vms, setVms] = React.useState(VOICEMAILS);
  const [playing, setPlaying] = React.useState(null);

  function markRead(id) { setVms(prev => prev.map(v => v.id===id ? {...v,read:true} : v)); }
  function deleteVm(id)  { Alert.alert('Delete','Delete this voicemail?',[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:()=>setVms(prev=>prev.filter(v=>v.id!==id))}]); }

  const unread = vms.filter(v=>!v.read).length;

  return (
    <View style={{flex:1}}>
      {unread > 0 && (
        <View style={{backgroundColor:accent+'22',marginHorizontal:16,marginTop:12,borderRadius:12,padding:12}}>
          <Text style={{color:accent,fontWeight:'700',fontSize:13}}>{unread} new voicemail{unread>1?'s':''}</Text>
        </View>
      )}
      {vms.length === 0 && (
        <View style={{flex:1,alignItems:'center',justifyContent:'center',gap:12}}>
          <Text style={{fontSize:48}}>📭</Text>
          <Text style={{color:sub,fontSize:15}}>No voicemails</Text>
        </View>
      )}
      <FlatList
        data={vms}
        keyExtractor={v=>v.id}
        contentContainerStyle={{padding:16,gap:10}}
        renderItem={({item}) => (
          <View style={{backgroundColor:card,borderRadius:18,padding:16,borderWidth:1,borderColor:border}}>
            <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
              <View style={{width:46,height:46,borderRadius:23,backgroundColor:item.read?border:accent+'33',alignItems:'center',justifyContent:'center'}}>
                <Text style={{fontSize:20}}>{item.read?'📞':'📞'}</Text>
              </View>
              <View style={{flex:1}}>
                <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                  <Text style={{color:tx,fontWeight:'700',fontSize:15}}>{item.from}</Text>
                  {!item.read && <View style={{width:8,height:8,borderRadius:4,backgroundColor:accent}}/>}
                </View>
                <Text style={{color:sub,fontSize:12}}>{item.phone}</Text>
              </View>
              <View style={{alignItems:'flex-end',gap:4}}>
                <Text style={{color:sub,fontSize:11}}>{item.date}</Text>
                <Text style={{color:sub,fontSize:11}}>⏱ {item.duration}</Text>
              </View>
            </View>
            {/* Player controls */}
            <View style={{flexDirection:'row',alignItems:'center',gap:8,marginTop:12,paddingTop:12,borderTopWidth:1,borderTopColor:border}}>
              <TouchableOpacity
                style={{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:playing===item.id?accent+'33':inputBg,borderRadius:12,paddingVertical:10}}
                onPress={()=>{setPlaying(p=>p===item.id?null:item.id);markRead(item.id);}}>
                <Text style={{fontSize:16}}>{playing===item.id?'⏸':'▶️'}</Text>
                {playing===item.id
                  ? <Waveform accent={accent} />
                  : <Text style={{color:tx,fontWeight:'600',fontSize:13}}>Play</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={{paddingHorizontal:14,paddingVertical:10,backgroundColor:accent,borderRadius:12}}
                onPress={()=>navigation.navigate('ActiveCall',{recipientName:item.from,recipientPhone:item.phone,callType:'voice'})}>
                <Text style={{color:'#000',fontWeight:'700',fontSize:13}}>Call Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{paddingHorizontal:14,paddingVertical:10,backgroundColor:'#ff3b3022',borderRadius:12}}
                onPress={()=>deleteVm(item.id)}>
                <Text style={{fontSize:16}}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 24, fontWeight: 'bold' },
  plusCircleBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  plusCircleText: { color: '#fff', fontSize: 24, fontWeight: '300', lineHeight: 28 },
  tabToggle: { flexDirection: 'row', borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  tabBtnText: { fontSize: 13, fontWeight: 'bold' },
  featureBanner: { margin: 12, padding: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  featureText: { fontSize: 11, fontWeight: 'bold', textAlign: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  emptySub: { fontSize: 14 },
  callItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  callInfo: { flex: 1 },
  callName: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  callSub: { fontSize: 13 },
  callDuration: { fontSize: 12, marginTop: 2 },
  callActions: { flexDirection: 'row', gap: 8 },
  callBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  keypadPage: { flex: 1, alignItems: 'center', paddingTop: 20, paddingBottom: 20 },
  displayBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 60, paddingHorizontal: 40, marginBottom: 24, position: 'relative', width: '100%' },
  displayText: { fontSize: 28, fontWeight: '300', textAlign: 'center', letterSpacing: 2 },
  deleteBtn: { position: 'absolute', right: 32 },
  keypadGrid: { gap: 12, width: '80%' },
  keyRow: { flexDirection: 'row', justifyContent: 'space-around' },
  dialKey: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, gap: 2 },
  dialDigit: { fontSize: 28, fontWeight: '300' },
  dialSub: { fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
  callBtnRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 28, gap: 24 },
  greenCallBtn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  greenCallIcon: { fontSize: 32 },
  facetimeCallBtn: { marginTop: 16, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 28, alignItems: 'center' },
});
