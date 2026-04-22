import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  TextInput, Animated, Modal, KeyboardAvoidingView, Platform, Vibration,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import { getRTCConfig, profileForSignal } from '../services/callQuality';
import CallQualityChip from '../components/CallQualityChip';

// ── Enhanced quality badge with relay info ────────────────────
function QualityBadge({ quality, routing }) {
  const colorMap = { HD: '#00ffa3', SD: '#ffd700', Low: '#ff9500', Min: '#ff3b30' };
  const labelMap = {
    HD:  'HD · Excellent signal',
    SD:  'SD · Good signal',
    Low: 'Low · Weak signal',
    Min: 'Min · Rural relay active',
  };
  const color = colorMap[quality] || '#00ffa3';
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View style={[qb.badge, { backgroundColor: color + '22', borderColor: color }]}>
        <View style={[qb.dot, { backgroundColor: color }]} />
        <Text style={[qb.label, { color }]}>{quality}</Text>
        {quality === 'Low' || quality === 'Min' ? (
          <Text style={[qb.relay, { color }]}>📡 Relay</Text>
        ) : (
          <Text style={[qb.relay, { color }]}>✓ Direct</Text>
        )}
      </View>
      <Text style={qb.subLabel}>{labelMap[quality]}</Text>
    </View>
  );
}
const qb = StyleSheet.create({
  badge:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  dot:      { width: 7, height: 7, borderRadius: 4 },
  label:    { fontSize: 12, fontWeight: '800' },
  relay:    { fontSize: 11, fontWeight: '600', opacity: 0.85 },
  subLabel: { fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.3 },
});

// ── Dialpad page (for + Add) ──────────────────────────────────
function DialpadPage({ onClose, onDial, tx, sub, card, accent, inputBg, border }) {
  const [input, setInput] = useState('');
  const KEYS = [
    ['1','',''],['2','ABC',''],['3','DEF',''],
    ['4','GHI',''],['5','JKL',''],['6','MNO',''],
    ['7','PQRS',''],['8','TUV',''],['9','WXYZ',''],
    ['*','',''],['0','+',''],['#','',''],
  ];

  async function haptic() {
    try {
      const v = await AsyncStorage.getItem('vaultchat_haptic');
      if (v === null || JSON.parse(v)) Vibration.vibrate(15);
    } catch { Vibration.vibrate(15); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: card }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: border }}>
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: accent, fontSize: 16 }}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={{ color: tx, fontWeight: '700', fontSize: 18 }}>Add to Call</Text>
        <TouchableOpacity onPress={() => { if (input.length >= 3) { onDial(input); onClose(); } }}>
          <Text style={{ color: input.length >= 3 ? accent : sub, fontWeight: '700', fontSize: 16 }}>Dial</Text>
        </TouchableOpacity>
      </View>

      {/* Display */}
      <View style={{ alignItems: 'center', paddingVertical: 28 }}>
        <Text style={{ color: tx, fontSize: 36, fontWeight: '300', letterSpacing: 6, minHeight: 48 }}>
          {input || ' '}
        </Text>
        {input.length > 0 && (
          <TouchableOpacity onPress={() => setInput(prev => prev.slice(0, -1))} style={{ marginTop: 8 }}>
            <Text style={{ color: sub, fontSize: 22 }}>⌫</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Keys */}
      <View style={{ paddingHorizontal: 40, gap: 12 }}>
        {[KEYS.slice(0,3), KEYS.slice(3,6), KEYS.slice(6,9), KEYS.slice(9,12)].map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            {row.map(([digit, sub2]) => (
              <TouchableOpacity key={digit}
                style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: inputBg, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => { setInput(prev => prev + digit); haptic(); }}>
                <Text style={{ color: tx, fontSize: 28, fontWeight: '400' }}>{digit}</Text>
                {sub2 ? <Text style={{ color: sub, fontSize: 10, marginTop: -2 }}>{sub2}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      {/* Call button */}
      <TouchableOpacity
        style={{ alignSelf: 'center', marginTop: 28, width: 70, height: 70, borderRadius: 35, backgroundColor: '#34C759', alignItems: 'center', justifyContent: 'center' }}
        onPress={() => { if (input.length >= 3) { onDial(input); onClose(); } else Alert.alert('Enter a number'); }}>
        <Text style={{ fontSize: 28 }}>📞</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main ActiveCallScreen ─────────────────────────────────────
export default function ActiveCallScreen({ route, navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const { recipientName, recipientPhone, callType } = route.params || {};

  const [status,    setStatus]    = useState('Connecting...');
  const [duration,  setDuration]  = useState(0);
  const [muted,     setMuted]     = useState(false);
  const [speaker,   setSpeaker]   = useState(false);
  const [onHold,    setOnHold]    = useState(false);
  const [quality,   setQuality]   = useState('HD');
  const [dialModal, setDialModal] = useState(false);
  const [lines, setLines] = useState([
    { name: recipientName || 'Unknown', phone: recipientPhone, active: true }
  ]);

  const pulse = useRef(new Animated.Value(1)).current;
  const timer = useRef(null);

  useEffect(() => {
    // Animate avatar pulse while connecting
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.15, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 800, useNativeDriver: true }),
    ]));
    anim.start();
    const connect = setTimeout(() => { setStatus('Connected'); anim.stop(); }, 2000);

    // Simulate quality changes (rural-aware — varies based on signal)
    const qualTimer = setInterval(() => {
      const bars = Math.floor(Math.random() * 5); // 0–4 bars
      const p    = profileForSignal(bars);
      if      (p.maxBitrate >= 1000000) setQuality('HD');
      else if (p.maxBitrate >= 500000)  setQuality('SD');
      else if (p.maxBitrate >= 200000)  setQuality('Low');
      else                              setQuality('Min');
    }, 7000);

    return () => { clearTimeout(connect); clearInterval(qualTimer); clearInterval(timer.current); };
  }, []);

  useEffect(() => {
    if (status === 'Connected') {
      timer.current = setInterval(() => setDuration(d => d + 1), 1000);
    }
    return () => clearInterval(timer.current);
  }, [status]);

  async function haptic() {
    try {
      const v = await AsyncStorage.getItem('vaultchat_haptic');
      if (v === null || JSON.parse(v)) Vibration.vibrate(15);
    } catch { Vibration.vibrate(15); }
  }

  function fmt(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function addLine(number) {
    setLines(prev => [...prev, { name: number, phone: number, active: true }]);
  }

  const isVideo = callType === 'video';

  return (
    <View style={[s.container, { backgroundColor: '#07091a' }]}>
      {/* Quality badge — shows signal + routing info */}
      {status === 'Connected' && (
        <View style={s.qualityRow}>
          <QualityBadge quality={quality} />
          {(quality === 'Low' || quality === 'Min') && (
            <Text style={s.ruralNote}>
              📶 Routing through secure relay for low-signal areas
            </Text>
          )}
          {/* Live adaptation banner — invisible on good networks, shows when
              Opus bitrate has been adjusted for the current call path. */}
          <CallQualityChip />
        </View>
      )}

      {/* Top section */}
      <View style={s.top}>
        <Text style={s.callTypeLabel}>{isVideo ? '📹 Video Call' : '📞 Voice Call'}</Text>
        <Animated.View style={[s.avatar, { transform: [{ scale: status === 'Connecting...' ? pulse : 1 }], backgroundColor: accent }]}>
          <Text style={s.avatarTx}>{(recipientName || '?')[0]?.toUpperCase()}</Text>
        </Animated.View>
        <Text style={s.name}>{recipientName || 'Unknown'}</Text>
        <Text style={[s.status, { color: status === 'Connected' ? '#00ffa3' : '#aaa' }]}>
          {status === 'Connected' ? fmt(duration) : status}
        </Text>
        {onHold && <Text style={{ color: '#ff9500', fontSize: 13, marginTop: 4 }}>⏸ On Hold</Text>}
      </View>

      {/* Conference participants */}
      {lines.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={s.participantsRow} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
          {lines.map((line, i) => (
            <View key={i} style={[s.participant, { backgroundColor: line.active ? accent : '#333' }]}>
              <Text style={s.partTx}>{line.name[0]?.toUpperCase()}</Text>
              <Text style={s.partName} numberOfLines={1}>{line.name}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Controls */}
      <View style={s.controls}>
        <View style={s.controlRow}>
          <TouchableOpacity style={[s.btn, muted && { backgroundColor: '#ff4444' }]}
            onPress={() => { haptic(); setMuted(m => !m); }}>
            <Text style={s.btnIcon}>{muted ? '🔇' : '🎤'}</Text>
            <Text style={s.btnLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, speaker && { backgroundColor: accent }]}
            onPress={() => { haptic(); setSpeaker(v => !v); }}>
            <Text style={s.btnIcon}>🔊</Text>
            <Text style={s.btnLabel}>Speaker</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, onHold && { backgroundColor: '#ff9500' }]}
            onPress={() => { haptic(); setOnHold(v => !v); }}>
            <Text style={s.btnIcon}>{onHold ? '▶️' : '⏸'}</Text>
            <Text style={s.btnLabel}>{onHold ? 'Resume' : 'Hold'}</Text>
          </TouchableOpacity>
        </View>
        <View style={s.controlRow}>
          {/* + Add opens the full dialpad page */}
          <TouchableOpacity style={s.btn} onPress={() => { haptic(); setDialModal(true); }}>
            <Text style={s.btnIcon}>➕</Text>
            <Text style={s.btnLabel}>Add</Text>
          </TouchableOpacity>
          {isVideo && (
            <TouchableOpacity style={s.btn} onPress={() => { haptic(); Alert.alert('Camera flipped'); }}>
              <Text style={s.btnIcon}>🔄</Text>
              <Text style={s.btnLabel}>Flip</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* End call */}
      <View style={s.endRow}>
        <TouchableOpacity style={s.endBtn} onPress={() => { clearInterval(timer.current); navigation.goBack(); }}>
          <Text style={s.endIcon}>📵</Text>
        </TouchableOpacity>
      </View>

      {/* Dialpad modal (full page) */}
      <Modal visible={dialModal} animationType="slide">
        <DialpadPage
          onClose={() => setDialModal(false)}
          onDial={addLine}
          tx={tx} sub={sub} card={card} accent={accent} inputBg={inputBg} border={border}
        />
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1 },
  qualityRow:     { alignItems: 'center', paddingTop: 56, paddingBottom: 4, gap: 6 },
  ruralNote:      { fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', paddingHorizontal: 32 },
  top:            { alignItems: 'center', paddingTop: 20, paddingBottom: 24 },
  callTypeLabel:  { color: '#aaa', fontSize: 13, marginBottom: 20, letterSpacing: 1 },
  avatar:         { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  avatarTx:       { color: '#fff', fontSize: 42, fontWeight: 'bold' },
  name:           { color: '#fff', fontSize: 26, fontWeight: 'bold', marginBottom: 8 },
  status:         { fontSize: 16, letterSpacing: 1 },
  participantsRow:{ maxHeight: 90, marginBottom: 10 },
  participant:    { width: 64, height: 80, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 8 },
  partTx:         { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  partName:       { color: '#fff', fontSize: 10, marginTop: 4 },
  controls:       { flex: 1, justifyContent: 'center', paddingHorizontal: 40, gap: 24 },
  controlRow:     { flexDirection: 'row', justifyContent: 'space-around' },
  btn:            { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', gap: 4 },
  btnIcon:        { fontSize: 26 },
  btnLabel:       { color: '#aaa', fontSize: 11 },
  endRow:         { alignItems: 'center', paddingBottom: 60 },
  endBtn:         { width: 72, height: 72, borderRadius: 36, backgroundColor: '#ff3b30', alignItems: 'center', justifyContent: 'center' },
  endIcon:        { fontSize: 30 },
});
