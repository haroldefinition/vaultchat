import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, TextInput, Animated, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '../services/theme';

export default function ActiveCallScreen({ route, navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const { recipientName, recipientPhone, callType } = route.params || {};
  const [status, setStatus] = useState('Connecting...');
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [conferenceModal, setConferenceModal] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [conferenceLines, setConferenceLines] = useState([
    { name: recipientName || 'Unknown', phone: recipientPhone, active: true }
  ]);
  const pulse = useRef(new Animated.Value(1)).current;
  const timer = useRef(null);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
    const t = setTimeout(() => setStatus('Connected'), 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (status === 'Connected') {
      timer.current = setInterval(() => setDuration(d => d + 1), 1000);
    }
    return () => clearInterval(timer.current);
  }, [status]);

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function endCall() {
    clearInterval(timer.current);
    navigation.goBack();
  }

  function addToConference() {
    if (!addInput.trim()) return;
    setConferenceLines(prev => [...prev, { name: addInput, phone: addInput, active: true }]);
    setAddInput('');
  }

  const isVideo = callType === 'video';

  return (
    <View style={[s.container, { backgroundColor: '#0a0a1a' }]}>
      {/* Top Section */}
      <View style={s.topSection}>
        <Text style={s.callType}>{isVideo ? '📹 Video Call' : '📞 Voice Call'}</Text>
        <Animated.View style={[s.avatar, { transform: [{ scale: status === 'Connecting...' ? pulse : 1 }], backgroundColor: accent }]}>
          <Text style={s.avatarText}>{(recipientName || '?')[0]?.toUpperCase()}</Text>
        </Animated.View>
        <Text style={s.name}>{recipientName || 'Unknown'}</Text>
        <Text style={[s.status, { color: status === 'Connected' ? '#00ffa3' : '#aaa' }]}>
          {status === 'Connected' ? formatTime(duration) : status}
        </Text>
        {onHold && <Text style={{ color: '#ff9500', fontSize: 13, marginTop: 4 }}>⏸ On Hold</Text>}
      </View>

      {/* Conference participants */}
      {conferenceLines.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.participantsRow} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
          {conferenceLines.map((line, i) => (
            <View key={i} style={[s.participant, { backgroundColor: line.active ? accent : '#333' }]}>
              <Text style={s.participantText}>{line.name[0]?.toUpperCase()}</Text>
              <Text style={s.participantName} numberOfLines={1}>{line.name}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Main Controls */}
      <View style={s.controls}>
        <View style={s.controlRow}>
          <TouchableOpacity style={[s.controlBtn, muted && { backgroundColor: '#ff4444' }]} onPress={() => setMuted(!muted)}>
            <Text style={s.controlIcon}>{muted ? '🔇' : '🎤'}</Text>
            <Text style={s.controlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.controlBtn, speaker && { backgroundColor: accent }]} onPress={() => setSpeaker(!speaker)}>
            <Text style={s.controlIcon}>🔊</Text>
            <Text style={s.controlLabel}>Speaker</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.controlBtn, onHold && { backgroundColor: '#ff9500' }]} onPress={() => setOnHold(!onHold)}>
            <Text style={s.controlIcon}>{onHold ? '▶️' : '⏸'}</Text>
            <Text style={s.controlLabel}>{onHold ? 'Resume' : 'Hold'}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.controlRow}>
          <TouchableOpacity style={s.controlBtn} onPress={() => setConferenceModal(true)}>
            <Text style={s.controlIcon}>➕</Text>
            <Text style={s.controlLabel}>Add</Text>
          </TouchableOpacity>

          {isVideo && (
            <TouchableOpacity style={s.controlBtn} onPress={() => Alert.alert('Camera', 'Camera flip')}>
              <Text style={s.controlIcon}>🔄</Text>
              <Text style={s.controlLabel}>Flip</Text>
            </TouchableOpacity>
          )}


        </View>
      </View>

      {/* End Call Button */}
      <View style={s.endRow}>
        <TouchableOpacity style={s.endBtn} onPress={endCall}>
          <Text style={s.endIcon}>📵</Text>
        </TouchableOpacity>
      </View>

      {/* Add to Conference Modal */}
      <Modal visible={conferenceModal} animationType="slide">
        <KeyboardAvoidingView style={[{ flex: 1, backgroundColor: bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[s.confHeader, { backgroundColor: card, borderBottomColor: border }]}>
            <TouchableOpacity onPress={() => { setConferenceModal(false); setAddInput(''); }}>
              <Text style={{ color: accent, fontSize: 16 }}>‹ Back</Text>
            </TouchableOpacity>
            <Text style={[s.modalTitle, { color: tx }]}>Add to Call</Text>
            <TouchableOpacity onPress={() => { addToConference(); setConferenceModal(false); }}>
              <Text style={{ color: addInput.length > 2 ? accent : sub, fontWeight: 'bold', fontSize: 16 }}>Add</Text>
            </TouchableOpacity>
          </View>

          <View style={[s.addRow, { backgroundColor: inputBg, borderColor: border, margin: 16 }]}>
            <Text style={{ color: accent, fontSize: 16, marginRight: 8 }}>👤</Text>
            <TextInput
              style={[{ flex: 1, padding: 14, fontSize: 16, color: tx }]}
              placeholder="Name or phone number..."
              placeholderTextColor={sub}
              value={addInput}
              onChangeText={setAddInput}
              autoFocus
              keyboardType="default"
              returnKeyType="done"
              onSubmitEditing={() => { addToConference(); setConferenceModal(false); }}
            />
            {addInput.length > 0 && (
              <TouchableOpacity onPress={() => setAddInput('')}>
                <Text style={{ color: sub, fontSize: 18, paddingHorizontal: 8 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={[{ color: sub, fontSize: 12, paddingHorizontal: 20, marginTop: 8 }]}>Current participants:</Text>
          {conferenceLines.map((line, i) => (
            <View key={i} style={[s.confLine, { backgroundColor: card, borderBottomColor: border }]}>
              <View style={[s.confAvatar, { backgroundColor: accent }]}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>{line.name[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[{ color: tx, fontWeight: 'bold', fontSize: 15 }]}>{line.name}</Text>
                <Text style={[{ color: sub, fontSize: 12 }]}>🟢 Active</Text>
              </View>
            </View>
          ))}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  topSection: { alignItems: 'center', paddingTop: 80, paddingBottom: 30 },
  callType: { color: '#aaa', fontSize: 13, marginBottom: 20, letterSpacing: 1 },
  avatar: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  avatarText: { color: '#fff', fontSize: 42, fontWeight: 'bold' },
  name: { color: '#fff', fontSize: 26, fontWeight: 'bold', marginBottom: 8 },
  status: { fontSize: 16, letterSpacing: 1 },
  participantsRow: { maxHeight: 90, marginBottom: 10 },
  participant: { width: 64, height: 80, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 8 },
  participantText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  participantName: { color: '#fff', fontSize: 10, marginTop: 4 },
  controls: { flex: 1, justifyContent: 'center', paddingHorizontal: 40, gap: 24 },
  controlRow: { flexDirection: 'row', justifyContent: 'space-around' },
  controlBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', gap: 4 },
  controlIcon: { fontSize: 26 },
  controlLabel: { color: '#aaa', fontSize: 11 },
  endRow: { alignItems: 'center', paddingBottom: 60 },
  endBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#ff3b30', alignItems: 'center', justifyContent: 'center' },
  endIcon: { fontSize: 30 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  addRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  addBtn: { padding: 14, paddingHorizontal: 20 },
  doneBtn: { padding: 14, borderRadius: 14, alignItems: 'center' },
  confHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1 },
  confLine: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, gap: 12 },
  confAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
