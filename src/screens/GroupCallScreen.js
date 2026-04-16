// VaultChat — GroupCallScreen (up to 8 participants)
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, Vibration, Modal, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import { getQualityLabel, measureRTT } from '../services/callQuality';

async function hapticVibrate(ms = 20) {
  try {
    const val = await AsyncStorage.getItem('vaultchat_haptic');
    if (val === null || JSON.parse(val)) Vibration.vibrate(ms);
  } catch { Vibration.vibrate(ms); }
}

export default function GroupCallScreen({ route, navigation }) {
  const { bg, card, tx, sub, border, accent } = useTheme();
  const { groupId, groupName, participants: initial = [] } = route.params || {};

  const [muted,      setMuted]      = useState(false);
  const [videoOff,   setVideoOff]   = useState(false);
  const [speaker,    setSpeaker]    = useState(true);
  const [duration,   setDuration]   = useState(0);
  const [quality,    setQuality]    = useState({ label: 'Good', color: '#00ffa3' });
  const [addModal,   setAddModal]   = useState(false);
  const [dialInput,  setDialInput]  = useState('');
  const [participants, setParticipants] = useState([
    { id: 'me', name: 'You', handle: '@you', muted: false, videoOff: false },
    ...initial.slice(0, 7).map((p, i) => ({ id: `p${i}`, name: p.name || `Participant ${i+1}`, handle: p.handle || `@user${i+1}`, muted: false, videoOff: false })),
  ]);

  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    const qualityCheck = setInterval(async () => {
      const rtt = await measureRTT();
      setQuality(getQualityLabel(rtt));
    }, 5000);
    return () => { clearInterval(timerRef.current); clearInterval(qualityCheck); };
  }, []);

  function formatDuration(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  function addDigit(d) { hapticVibrate(20); setDialInput(p => p.length < 10 ? p + d : p); }

  function endCall() {
    clearInterval(timerRef.current);
    navigation.goBack();
  }

  const KEYPAD = ['1','2','3','4','5','6','7','8','9','*','0','#'];

  return (
    <View style={[s.container, { backgroundColor: '#0a0a1a' }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.groupName}>{groupName || 'Group Call'}</Text>
        <View style={[s.qualityBadge, { backgroundColor: quality.color + '30' }]}>
          <Text style={[s.qualityTx, { color: quality.color }]}>● {quality.label}</Text>
        </View>
        <Text style={s.duration}>{formatDuration(duration)}</Text>
      </View>

      {/* Participant grid */}
      <FlatList
        data={participants}
        keyExtractor={i => i.id}
        numColumns={2}
        contentContainerStyle={{ padding: 12, gap: 10 }}
        columnWrapperStyle={{ gap: 10 }}
        renderItem={({ item }) => (
          <View style={[s.participantCard, { backgroundColor: '#1a1a2e' }]}>
            <View style={[s.pAvatar, { backgroundColor: accent + '30' }]}>
              <Text style={{ color: accent, fontSize: 22, fontWeight: '700' }}>{item.name[0]?.toUpperCase()}</Text>
            </View>
            <Text style={s.pName} numberOfLines={1}>{item.name}</Text>
            <Text style={s.pHandle} numberOfLines={1}>{item.handle}</Text>
            <View style={s.pIcons}>
              {item.muted    && <Text style={{ fontSize: 14 }}>🔇</Text>}
              {item.videoOff && <Text style={{ fontSize: 14 }}>📷</Text>}
            </View>
          </View>
        )}
      />

      {/* Controls */}
      <View style={s.controls}>
        {[
          { icon: muted    ? '🔇' : '🎙️', label: muted    ? 'Unmute' : 'Mute',    onPress: () => { hapticVibrate(); setMuted(m => !m); } },
          { icon: videoOff ? '📷' : '📹', label: videoOff ? 'Start Video' : 'Stop Video', onPress: () => { hapticVibrate(); setVideoOff(v => !v); } },
          { icon: speaker  ? '🔊' : '🔈', label: 'Speaker', onPress: () => { hapticVibrate(); setSpeaker(s => !s); } },
          { icon: '➕',                    label: 'Add',     onPress: () => { hapticVibrate(); setAddModal(true); }, disabled: participants.length >= 8 },
        ].map((btn, i) => (
          <TouchableOpacity key={i} style={[s.ctrlBtn, { backgroundColor: '#1a1a2e', opacity: btn.disabled ? 0.4 : 1 }]}
            onPress={btn.onPress} disabled={btn.disabled}>
            <Text style={{ fontSize: 22 }}>{btn.icon}</Text>
            <Text style={[s.ctrlLabel, { color: sub }]}>{btn.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.endBtn]} onPress={endCall}>
          <Text style={{ fontSize: 22 }}>📵</Text>
          <Text style={[s.ctrlLabel, { color: '#ff4444' }]}>End</Text>
        </TouchableOpacity>
      </View>

      {/* Add participant modal */}
      <Modal visible={addModal} transparent animationType="slide" onRequestClose={() => setAddModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: card }]}>
            <Text style={[s.modalTitle, { color: tx }]}>Add to Call ({participants.length}/8)</Text>
            <View style={[s.dialDisplay, { backgroundColor: '#0a0a1a' }]}>
              <Text style={s.dialTx}>{dialInput || '  '}</Text>
              {dialInput.length > 0 && (
                <TouchableOpacity onPress={() => setDialInput(p => p.slice(0,-1))} style={{ padding: 8 }}>
                  <Text style={{ color: sub, fontSize: 20 }}>⌫</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={s.keypadGrid}>
              {KEYPAD.map(d => (
                <TouchableOpacity key={d} style={[s.keypadBtn, { backgroundColor: '#1a1a2e' }]}
                  onPress={() => addDigit(d)}>
                  <Text style={s.keypadTx}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[s.callAddBtn, { backgroundColor: '#00c853' }]}
              onPress={() => {
                if (!dialInput.trim()) return;
                if (participants.length >= 8) { Alert.alert('Max 8 participants'); return; }
                setParticipants(p => [...p, { id: `a${Date.now()}`, name: dialInput, handle: `@${dialInput}`, muted: false, videoOff: false }]);
                setDialInput('');
                setAddModal(false);
              }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>📞 Add to Call</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAddModal(false)} style={{ marginTop: 10, alignItems: 'center' }}>
              <Text style={{ color: sub }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1 },
  header:         { alignItems: 'center', paddingTop: 60, paddingBottom: 16, gap: 6 },
  groupName:      { color: '#fff', fontSize: 22, fontWeight: '800' },
  qualityBadge:   { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  qualityTx:      { fontSize: 12, fontWeight: '700' },
  duration:       { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  participantCard:{ flex: 1, borderRadius: 16, padding: 16, alignItems: 'center', gap: 6 },
  pAvatar:        { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  pName:          { color: '#fff', fontSize: 13, fontWeight: '700' },
  pHandle:        { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  pIcons:         { flexDirection: 'row', gap: 4 },
  controls:       { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 16, paddingVertical: 20, paddingBottom: 40 },
  ctrlBtn:        { alignItems: 'center', width: 60, paddingVertical: 12, borderRadius: 16, gap: 4 },
  ctrlLabel:      { fontSize: 10, fontWeight: '600' },
  endBtn:         { alignItems: 'center', width: 60, paddingVertical: 12, borderRadius: 16, backgroundColor: '#ff000020', gap: 4 },
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 },
  modalTitle:     { fontSize: 18, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  dialDisplay:    { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  dialTx:         { color: '#fff', fontSize: 24, fontWeight: '300', letterSpacing: 4 },
  keypadGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 16 },
  keypadBtn:      { width: 72, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  keypadTx:       { color: '#fff', fontSize: 20, fontWeight: '500' },
  callAddBtn:     { borderRadius: 14, padding: 14, alignItems: 'center' },
});
