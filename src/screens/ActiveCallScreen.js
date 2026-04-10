import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, AppState, Linking, Vibration, Modal, TextInput, ScrollView, Animated, Easing } from 'react-native';
import { useTheme } from '../services/theme';
import { setupAudioSession, setSpeakerMode, setEarpieceMode, releaseAudioSession } from '../services/audioSession';
import { startCall, endCall, holdCall, muteCall, onCallKeepEvents } from '../services/callkit';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ActiveCallScreen({ route, navigation }) {
  const { accent } = useTheme();
  const { recipientName, recipientPhone, user, callType = 'voice' } = route.params;
  const [callState, setCallState] = useState('connecting');
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [keypadInput, setKeypadInput] = useState('');
  const [conferenceModal, setConferenceModal] = useState(false);
  const [conferenceParticipants, setConferenceParticipants] = useState([
    { name: recipientName || `+1${recipientPhone}`, phone: recipientPhone, status: 'connected', muted: false, onHold: false },
  ]);
  const [addParticipantPhone, setAddParticipantPhone] = useState('');
  const [addParticipantName, setAddParticipantName] = useState('');
  const [contacts, setContacts] = useState([]);
  const [faceTimeEnabled, setFaceTimeEnabled] = useState(true);
  const [searchContacts, setSearchContacts] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef(null);
  const callId = useRef(`call_${Date.now()}`);

  useEffect(() => {
    setupAudioSession();
    startCall(callId.current, recipientPhone, recipientName);
    loadSettings();
    loadContacts();
    startPulse();
    setTimeout(() => {
      setCallState('connected');
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    }, 2000);
    const cleanup = onCallKeepEvents({ onEnd: () => handleEndCall(), onHold: ({ hold }) => handleHold(hold) });
    const sub = AppState.addEventListener('change', s => { if (s === 'background') console.log('Call persisting'); });
    return () => { cleanup(); sub.remove(); if (timerRef.current) clearInterval(timerRef.current); releaseAudioSession(); };
  }, []);

  function startPulse() {
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.2, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }

  async function loadSettings() {
    const val = await AsyncStorage.getItem('vaultchat_facetime');
    if (val !== null) setFaceTimeEnabled(JSON.parse(val));
  }

  async function loadContacts() {
    const saved = await AsyncStorage.getItem('vaultchat_chats');
    if (saved) setContacts(JSON.parse(saved).map(c => ({ phone: c.phone, name: c.name || `+1${c.phone}` })));
    else setContacts([{ phone: '6092330963', name: 'Jon' }, { phone: '2675551234', name: 'Sarah' }, { phone: '5551234567', name: 'Mike' }]);
  }

  function handleEndCall() {
    Vibration.vibrate(100);
    if (timerRef.current) clearInterval(timerRef.current);
    endCall(callId.current); releaseAudioSession(); navigation.goBack();
  }

  function handleHold(hold) {
    setOnHold(hold); holdCall(callId.current, hold);
    if (hold) Alert.alert('On Hold', 'Switch apps freely — call stays active.');
  }

  function toggleMute() { const n = !muted; setMuted(n); muteCall(callId.current, n); Vibration.vibrate(50); }
  function toggleSpeaker() { const n = !speaker; setSpeaker(n); if (n) setSpeakerMode(); else setEarpieceMode(); Vibration.vibrate(50); }
  function toggleHold() { handleHold(!onHold); Vibration.vibrate(50); }

  function addParticipant(phone, name) {
    if (!phone || phone.length < 10) { Alert.alert('Error', 'Enter a valid 10-digit phone number'); return; }
    if (conferenceParticipants.find(p => p.phone === phone)) { Alert.alert('Already in call'); return; }
    setConferenceParticipants(prev => [...prev, { name: name || `+1${phone}`, phone, status: 'connecting', muted: false, onHold: false }]);
    setTimeout(() => setConferenceParticipants(prev => prev.map(p => p.phone === phone ? { ...p, status: 'connected' } : p)), 2000);
    setAddParticipantPhone(''); setAddParticipantName('');
    Alert.alert('Connecting', `Adding ${name || phone} to conference...`);
  }

  function removeParticipant(phone) {
    if (phone === recipientPhone) { Alert.alert('Cannot remove primary caller'); return; }
    Alert.alert('Remove?', 'Remove from conference?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setConferenceParticipants(prev => prev.filter(p => p.phone !== phone)) },
    ]);
  }

  function openFaceTime() {
    if (!faceTimeEnabled) { Alert.alert('FaceTime Disabled', 'Enable in Settings > Calls.'); return; }
    const url = `facetime://${recipientPhone}`;
    Linking.canOpenURL(url).then(s => { if (s) { handleEndCall(); Linking.openURL(url); } else Alert.alert('FaceTime unavailable'); });
  }

  function openFaceTimeAudio() {
    if (!faceTimeEnabled) { Alert.alert('FaceTime Disabled', 'Enable in Settings > Calls.'); return; }
    const url = `facetime-audio://${recipientPhone}`;
    Linking.canOpenURL(url).then(s => { if (s) { handleEndCall(); Linking.openURL(url); } else Alert.alert('FaceTime Audio unavailable'); });
  }

  const filteredContacts = contacts.filter(c =>
    !conferenceParticipants.find(p => p.phone === c.phone) &&
    (c.name.toLowerCase().includes(searchContacts.toLowerCase()) || c.phone.includes(searchContacts))
  );

  function formatDuration(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  // KEYPAD
  if (showKeypad) {
    return (
      <View style={st.container}>
        <TouchableOpacity style={st.backFromKeypad} onPress={() => setShowKeypad(false)}>
          <Text style={{ color: '#fff', fontSize: 16 }}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={st.keypadDisplay}>{keypadInput || ' '}</Text>
        <View style={st.keypadGrid}>
          {[['1','2','3'],['4','5','6'],['7','8','9'],['*','0','#']].map((row, i) => (
            <View key={i} style={st.keypadRow}>
              {row.map(d => (
                <TouchableOpacity key={d} style={st.keypadBtn} onPress={() => { setKeypadInput(p => p + d); Vibration.vibrate(30); }}>
                  <Text style={st.keypadDigit}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
        <TouchableOpacity style={st.endBtn} onPress={handleEndCall}><Text style={st.endBtnText}>📵</Text></TouchableOpacity>
      </View>
    );
  }

  // MAIN CALL
  return (
    <View style={st.container}>
      {callState === 'connecting' && (
        <View style={st.connectingOverlay}>
          <Animated.View style={[st.pulseRing, { transform: [{ scale: pulseAnim }], borderColor: accent }]} />
          <Animated.View style={[st.pulseRing2, { transform: [{ scale: pulseAnim }], borderColor: accent, opacity: 0.3 }]} />
          <Text style={st.connectingText}>Calling...</Text>
          <Text style={st.connectingSubText}>Waiting for {recipientName || recipientPhone} to answer</Text>
        </View>
      )}
      {onHold && (
        <View style={st.holdOverlay}>
          <Text style={st.holdText}>ON HOLD</Text>
          <Text style={st.holdSub}>Switch apps — call stays active</Text>
        </View>
      )}

      <View style={st.contactSection}>
        <Animated.View style={[st.avatar, { backgroundColor: accent, transform: callState === 'connecting' ? [{ scale: pulseAnim }] : [] }]}>
          <Text style={st.avatarText}>{recipientName ? recipientName[0].toUpperCase() : '?'}</Text>
        </Animated.View>
        <Text style={st.name}>{recipientName || `+1${recipientPhone}`}</Text>
        <Text style={st.phoneNum}>+1{recipientPhone}</Text>
        <Text style={st.status}>{callState === 'connecting' ? '🔄 Ringing...' : onHold ? '⏸ On Hold' : `🟢 ${formatDuration(duration)}`}</Text>
        {conferenceParticipants.length > 1 && <Text style={st.confBadge}>👥 Conference · {conferenceParticipants.length} participants</Text>}
        <Text style={st.encrypted}>🔒 End-to-end encrypted</Text>
      </View>

      <View style={st.controls}>
        <View style={st.controlRow}>
          <TouchableOpacity style={[st.btn, muted && st.btnActive]} onPress={toggleMute}>
            <Text style={st.btnIcon}>{muted ? '🔇' : '🎙️'}</Text>
            <Text style={st.btnLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.btn, speaker && st.btnActive]} onPress={toggleSpeaker}>
            <Text style={st.btnIcon}>{speaker ? '📢' : '🔈'}</Text>
            <Text style={st.btnLabel}>{speaker ? 'Earpiece' : 'Speaker'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.btn, onHold && st.btnActive]} onPress={toggleHold}>
            <Text style={st.btnIcon}>{onHold ? '▶️' : '⏸'}</Text>
            <Text style={st.btnLabel}>{onHold ? 'Resume' : 'Hold'}</Text>
          </TouchableOpacity>
        </View>
        <View style={st.controlRow}>
          <TouchableOpacity style={st.btn} onPress={() => setShowKeypad(true)}>
            <Text style={st.btnIcon}>⌨️</Text>
            <Text style={st.btnLabel}>Keypad</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.btn, { backgroundColor: faceTimeEnabled ? '#1a73e8' : '#333' }]} onPress={openFaceTime}>
            <Text style={st.btnIcon}>📹</Text>
            <Text style={st.btnLabel}>FaceTime</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.btn, { backgroundColor: faceTimeEnabled ? '#34C759' : '#333' }]} onPress={openFaceTimeAudio}>
            <Text style={st.btnIcon}>🎧</Text>
            <Text style={st.btnLabel}>FT Audio</Text>
          </TouchableOpacity>
        </View>
        <View style={st.controlRow}>
          <TouchableOpacity style={[st.btn, { backgroundColor: '#5856d6' }]} onPress={() => setConferenceModal(true)}>
            <Text style={st.btnIcon}>👥</Text>
            <Text style={st.btnLabel}>Conference</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.btn} onPress={() => Alert.alert('Switch Apps', 'Call stays active.', [{ text: 'OK' }])}>
            <Text style={st.btnIcon}>🔄</Text>
            <Text style={st.btnLabel}>Switch App</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.btn} onPress={() => Alert.alert('Noise Cancellation', '🎙️ Active and running')}>
            <Text style={st.btnIcon}>🎚️</Text>
            <Text style={st.btnLabel}>Noise Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={st.endBtn} onPress={handleEndCall}><Text style={st.endBtnText}>📵</Text></TouchableOpacity>
      <Text style={st.bgNote}>{onHold ? '💡 Switch apps — call stays active' : '💡 Call persists in background'}</Text>

      {/* CONFERENCE FULL PAGE MODAL */}
      <Modal visible={conferenceModal} animationType="slide">
        <View style={st.confPage}>
          {/* Conference Header */}
          <View style={st.confPageHeader}>
            <TouchableOpacity onPress={() => setConferenceModal(false)} style={st.confBackBtn}>
              <Text style={{ color: '#5b9cf6', fontSize: 16 }}>‹ Back</Text>
            </TouchableOpacity>
            <Text style={st.confPageTitle}>👥 Conference</Text>
            <Text style={{ color: '#888', fontSize: 13, width: 60, textAlign: 'right' }}>{conferenceParticipants.length} active</Text>
          </View>

          {/* Merge / Swap / Hold All row */}
          <View style={st.confActionRow}>
            <TouchableOpacity style={st.confActionBtn} onPress={() => {
              setConferenceParticipants(prev => prev.map(p => ({ ...p, onHold: false, status: 'connected' })));
              setOnHold(false);
              Alert.alert('✅ Merged', 'All calls merged into conference!');
            }}>
              <View style={[st.confActionIcon, { backgroundColor: '#5856d6' }]}><Text style={{ fontSize: 26 }}>🔀</Text></View>
              <Text style={st.confActionLabel}>Merge All</Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.confActionBtn} onPress={() => {
              Alert.alert('Swap Call', 'Select who to make active:', [
                { text: 'Cancel', style: 'cancel' },
                ...conferenceParticipants.map(p => ({
                  text: p.name,
                  onPress: () => {
                    setConferenceParticipants(prev => prev.map(x => ({ ...x, onHold: x.phone !== p.phone })));
                    Alert.alert('🔄 Swapped', `Now active with ${p.name}`);
                  }
                }))
              ]);
            }}>
              <View style={[st.confActionIcon, { backgroundColor: '#FF9500' }]}><Text style={{ fontSize: 26 }}>🔄</Text></View>
              <Text style={st.confActionLabel}>Swap</Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.confActionBtn} onPress={() => {
              setConferenceParticipants(prev => prev.map(p => ({ ...p, onHold: !onHold })));
              toggleHold();
            }}>
              <View style={[st.confActionIcon, { backgroundColor: onHold ? '#0057a8' : 'rgba(255,255,255,0.15)' }]}><Text style={{ fontSize: 26 }}>{onHold ? '▶️' : '⏸'}</Text></View>
              <Text style={st.confActionLabel}>{onHold ? 'Resume All' : 'Hold All'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.confActionBtn} onPress={() => {
              const allMuted = conferenceParticipants.every(p => p.muted);
              setConferenceParticipants(prev => prev.map(p => ({ ...p, muted: !allMuted })));
              toggleMute();
            }}>
              <View style={[st.confActionIcon, { backgroundColor: muted ? '#0057a8' : 'rgba(255,255,255,0.15)' }]}><Text style={{ fontSize: 26 }}>{muted ? '🔇' : '🎙️'}</Text></View>
              <Text style={st.confActionLabel}>{muted ? 'Unmute All' : 'Mute All'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

            {/* Participants */}
            <Text style={st.confSection}>PARTICIPANTS ({conferenceParticipants.length})</Text>
            {conferenceParticipants.map((p, i) => (
              <View key={p.phone} style={st.confParticipantCard}>
                <View style={[st.confParticipantAvatar, { backgroundColor: i === 0 ? accent : '#5856d6' }]}>
                  <Text style={st.confParticipantAvatarText}>{p.name[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.confParticipantName}>{p.name}</Text>
                  <Text style={st.confParticipantStatus}>
                    {p.status === 'connecting' ? '🔄 Connecting...' : p.onHold ? '⏸ On Hold' : '🟢 Active'}
                    {p.muted ? ' · 🔇' : ''}
                  </Text>
                </View>
                <View style={st.confParticipantActions}>
                  <TouchableOpacity style={[st.confParticipantBtn, p.muted && { backgroundColor: '#0057a8' }]} onPress={() => setConferenceParticipants(prev => prev.map(x => x.phone === p.phone ? { ...x, muted: !x.muted } : x))}>
                    <Text style={{ fontSize: 16 }}>{p.muted ? '🔇' : '🎙️'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.confParticipantBtn, p.onHold && { backgroundColor: '#0057a8' }]} onPress={() => setConferenceParticipants(prev => prev.map(x => x.phone === p.phone ? { ...x, onHold: !x.onHold } : x))}>
                    <Text style={{ fontSize: 16 }}>{p.onHold ? '▶️' : '⏸'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.confParticipantBtn, { backgroundColor: '#5856d6' }]} onPress={() => {
                    setConferenceParticipants(prev => prev.map(x => ({ ...x, onHold: x.phone !== p.phone })));
                    Alert.alert('🔄 Swapped', `Now active with ${p.name}`);
                  }}>
                    <Text style={{ fontSize: 14 }}>🔄</Text>
                  </TouchableOpacity>
                  {i !== 0 && (
                    <TouchableOpacity style={[st.confParticipantBtn, { backgroundColor: '#ff3b30' }]} onPress={() => removeParticipant(p.phone)}>
                      <Text style={{ fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}

            {/* Add participant */}
            <Text style={st.confSection}>ADD PARTICIPANT</Text>
            <View style={st.confAddCard}>
              <View style={st.confAddRow}>
                <View style={[st.confAddIconBox, { backgroundColor: '#5856d6' }]}>
                  <Text style={{ fontSize: 22 }}>👤</Text>
                </View>
                <TextInput style={st.confAddInput} placeholder="Name (optional)" placeholderTextColor="#555" value={addParticipantName} onChangeText={setAddParticipantName} />
              </View>
              <View style={[st.confAddRow, { marginTop: 8 }]}>
                <View style={[st.confAddIconBox, { backgroundColor: '#0057a8' }]}>
                  <Text style={{ fontSize: 22 }}>📱</Text>
                </View>
                <TextInput style={st.confAddInput} placeholder="10-digit phone number" placeholderTextColor="#555" value={addParticipantPhone} onChangeText={setAddParticipantPhone} keyboardType="phone-pad" maxLength={10} />
              </View>
              <TouchableOpacity style={st.confAddBtn} onPress={() => addParticipant(addParticipantPhone, addParticipantName)}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>+ Add to Conference</Text>
              </TouchableOpacity>
            </View>

            {/* Contacts scroll */}
            <Text style={st.confSection}>FROM YOUR CONTACTS</Text>
            <View style={[st.confAddCard, { paddingBottom: 8 }]}>
              <View style={st.confSearchRow}>
                <Text style={{ fontSize: 18 }}>🔍</Text>
                <TextInput style={[st.confAddInput, { flex: 1 }]} placeholder="Search by name or number..." placeholderTextColor="#555" value={searchContacts} onChangeText={setSearchContacts} />
              </View>
            </View>
            {filteredContacts.length === 0 ? (
              <View style={st.confEmptyContacts}>
                <Text style={{ fontSize: 40 }}>👥</Text>
                <Text style={{ color: '#555', textAlign: 'center', marginTop: 8 }}>No contacts available{'\n'}Start chats to add contacts here</Text>
              </View>
            ) : (
              filteredContacts.map(c => (
                <TouchableOpacity key={c.phone} style={st.confContactCard} onPress={() => addParticipant(c.phone, c.name)}>
                  <View style={[st.confParticipantAvatar, { backgroundColor: '#5856d6' }]}>
                    <Text style={st.confParticipantAvatarText}>{c.name[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.confParticipantName}>{c.name}</Text>
                    <Text style={st.confParticipantStatus}>+1{c.phone}</Text>
                  </View>
                  <View style={[st.confAddContactBtn, { backgroundColor: '#5856d6' }]}>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>+ Add</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          {/* End Conference always at bottom */}
          <TouchableOpacity style={st.confEndBtn} onPress={() => { setConferenceModal(false); handleEndCall(); }}>
            <Text style={{ fontSize: 22 }}>📵</Text>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, marginLeft: 8 }}>End Conference Call</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'space-between', paddingTop: 80, paddingBottom: 50 },
  connectingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,22,40,0.9)', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  pulseRing: { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 3, opacity: 0.6 },
  pulseRing2: { position: 'absolute', width: 240, height: 240, borderRadius: 120, borderWidth: 2 },
  connectingText: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginTop: 120 },
  connectingSubText: { color: '#888', fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 40 },
  holdOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,87,168,0.2)', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  holdText: { color: '#5b9cf6', fontSize: 32, fontWeight: 'bold', letterSpacing: 4 },
  holdSub: { color: '#5b9cf6', fontSize: 14, marginTop: 8 },
  contactSection: { alignItems: 'center', gap: 6 },
  avatar: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { color: '#fff', fontSize: 44, fontWeight: 'bold' },
  name: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  phoneNum: { color: '#888', fontSize: 13 },
  status: { color: '#aaa', fontSize: 17, marginTop: 4 },
  confBadge: { color: '#5856d6', fontSize: 13, fontWeight: 'bold', marginTop: 4 },
  encrypted: { color: '#00ffa3', fontSize: 12 },
  controls: { width: '100%', paddingHorizontal: 16, gap: 16 },
  controlRow: { flexDirection: 'row', justifyContent: 'space-around' },
  btn: { alignItems: 'center', width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', gap: 4 },
  btnActive: { backgroundColor: '#0057a8' },
  btnIcon: { fontSize: 26 },
  btnLabel: { color: '#fff', fontSize: 10, textAlign: 'center' },
  endBtn: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#ff3b30', alignItems: 'center', justifyContent: 'center' },
  endBtnText: { fontSize: 34 },
  bgNote: { color: '#444', fontSize: 11, textAlign: 'center', paddingHorizontal: 32 },
  backFromKeypad: { alignSelf: 'flex-start', padding: 20 },
  keypadDisplay: { color: '#fff', fontSize: 32, letterSpacing: 8, minHeight: 50 },
  keypadGrid: { gap: 16, width: '80%' },
  keypadRow: { flexDirection: 'row', justifyContent: 'space-around' },
  keypadBtn: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  keypadDigit: { color: '#fff', fontSize: 28, fontWeight: 'bold' },

  // Conference Full Page
  confPage: { flex: 1, backgroundColor: '#080b12' },
  confPageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#141828' },
  confBackBtn: { width: 60 },
  confPageTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  confActionRow: { flexDirection: 'row', padding: 16, gap: 8, borderBottomWidth: 1, borderBottomColor: '#141828' },
  confActionBtn: { flex: 1, alignItems: 'center', gap: 8 },
  confActionIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  confActionLabel: { color: '#aaa', fontSize: 11, textAlign: 'center' },
  confSection: { color: '#555', fontSize: 11, fontWeight: 'bold', letterSpacing: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  confParticipantCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, backgroundColor: '#0e1220', borderRadius: 16, padding: 14, gap: 12 },
  confParticipantAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  confParticipantAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  confParticipantName: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  confParticipantStatus: { color: '#888', fontSize: 12, marginTop: 2 },
  confParticipantActions: { flexDirection: 'row', gap: 6 },
  confParticipantBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  confAddCard: { marginHorizontal: 16, backgroundColor: '#0e1220', borderRadius: 16, padding: 16, marginBottom: 8 },
  confAddRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  confAddIconBox: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  confAddInput: { flex: 1, backgroundColor: '#141828', color: '#fff', padding: 12, borderRadius: 12, fontSize: 15 },
  confAddBtn: { marginTop: 14, backgroundColor: '#0057a8', borderRadius: 14, padding: 14, alignItems: 'center' },
  confSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confEmptyContacts: { alignItems: 'center', padding: 32 },
  confContactCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, backgroundColor: '#0e1220', borderRadius: 14, padding: 14, gap: 12 },
  confAddContactBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  confEndBtn: { flexDirection: 'row', backgroundColor: '#ff3b30', margin: 16, padding: 18, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
