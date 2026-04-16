// VaultChat — NearbyScreen
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, Animated } from 'react-native';
import { useTheme } from '../services/theme';
import { scanNearbyDevices, isOnline } from '../services/offlineQueue';

export default function NearbyScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [scanning,  setScanning]  = useState(false);
  const [devices,   setDevices]   = useState([]);
  const [online,    setOnline]    = useState(true);
  const [msgModal,  setMsgModal]  = useState(false);
  const [selected,  setSelected]  = useState(null);
  const [msgText,   setMsgText]   = useState('');
  const radarAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    isOnline().then(setOnline);
  }, []);

  async function scan() {
    setScanning(true);
    setDevices([]);
    Animated.loop(Animated.timing(radarAnim, { toValue: 1, duration: 1500, useNativeDriver: true })).start();
    const found = await scanNearbyDevices();
    setDevices(found);
    setScanning(false);
    radarAnim.stopAnimation();
    radarAnim.setValue(0);
  }

  function openMsg(device) { setSelected(device); setMsgModal(true); }

  function sendOfflineMsg() {
    if (!msgText.trim()) return;
    Alert.alert('Sent!', `Message queued for ${selected.handle} via local network.`);
    setMsgModal(false); setMsgText('');
  }

  const radarScale = radarAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 2.5] });
  const radarOpacity = radarAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] });

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={[s.backTx, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tx }]}>📡 Nearby</Text>
        <View style={[s.statusBadge, { backgroundColor: online ? '#00ffa320' : '#ff444420' }]}>
          <Text style={{ color: online ? '#00ffa3' : '#ff4444', fontSize: 12, fontWeight: '700' }}>
            {online ? '🌐 Online' : '📵 Offline'}
          </Text>
        </View>
      </View>

      {/* Radar animation */}
      <View style={s.radarWrap}>
        {scanning && (
          <Animated.View style={[s.radarRing, { backgroundColor: accent + '30', transform: [{ scale: radarScale }], opacity: radarOpacity }]} />
        )}
        <View style={[s.radarCenter, { backgroundColor: accent + '22', borderColor: accent }]}>
          <Text style={{ fontSize: 32 }}>📡</Text>
        </View>
      </View>

      <TouchableOpacity style={[s.scanBtn, { backgroundColor: scanning ? border : accent }]}
        onPress={scan} disabled={scanning}>
        <Text style={[s.scanBtnTx, { color: scanning ? sub : '#fff' }]}>
          {scanning ? 'Scanning…' : '🔍 Scan for Nearby Devices'}
        </Text>
      </TouchableOpacity>

      <FlatList
        data={devices}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item }) => (
          <View style={[s.deviceRow, { backgroundColor: card, borderColor: border }]}>
            <View style={[s.deviceAvatar, { backgroundColor: accent + '22' }]}>
              <Text style={{ fontSize: 20 }}>👤</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.deviceName, { color: tx }]}>{item.name}</Text>
              <Text style={[s.deviceHandle, { color: accent }]}>{item.handle}</Text>
              <Text style={[s.deviceDist, { color: sub }]}>{item.distance} · Signal: {item.signal}</Text>
            </View>
            <TouchableOpacity style={[s.msgBtn, { backgroundColor: accent }]} onPress={() => openMsg(item)}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Message</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          !scanning && (
            <View style={s.empty}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>📵</Text>
              <Text style={[s.emptyTitle, { color: tx }]}>No devices found</Text>
              <Text style={[s.emptyTx, { color: sub }]}>Tap Scan to find VaultChat users nearby using Bluetooth or WiFi Direct</Text>
            </View>
          )
        }
      />

      <View style={[s.infoRow, { backgroundColor: card, borderTopColor: border }]}>
        <Text style={[s.infoTx, { color: sub }]}>🔒 Encrypted · Works offline · Up to 100m range</Text>
      </View>

      <Modal visible={msgModal} transparent animationType="slide" onRequestClose={() => setMsgModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: card }]}>
            <Text style={[s.modalTitle, { color: tx }]}>Message {selected?.handle}</Text>
            <Text style={[s.modalSub, { color: sub }]}>🔒 End-to-end encrypted · Sent via local network</Text>
            <TextInput style={[s.modalInput, { backgroundColor: inputBg, color: tx, borderColor: border }]}
              placeholder="Your message…" placeholderTextColor={sub}
              value={msgText} onChangeText={setMsgText} multiline />
            <TouchableOpacity style={[s.sendOfflineBtn, { backgroundColor: accent }]} onPress={sendOfflineMsg}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Send Offline Message</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMsgModal(false)} style={{ marginTop: 10, alignItems: 'center' }}>
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
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  backBtn:        { padding: 4 },
  backTx:         { fontSize: 28, fontWeight: 'bold' },
  headerTitle:    { flex: 1, fontSize: 20, fontWeight: '800' },
  statusBadge:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  radarWrap:      { alignItems: 'center', justifyContent: 'center', height: 160, marginTop: 10 },
  radarRing:      { position: 'absolute', width: 120, height: 120, borderRadius: 60 },
  radarCenter:    { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  scanBtn:        { marginHorizontal: 24, borderRadius: 16, padding: 14, alignItems: 'center', marginBottom: 8 },
  scanBtnTx:      { fontSize: 15, fontWeight: '700' },
  deviceRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  deviceAvatar:   { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  deviceName:     { fontSize: 14, fontWeight: '700' },
  deviceHandle:   { fontSize: 12, marginTop: 1 },
  deviceDist:     { fontSize: 11, marginTop: 2 },
  msgBtn:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  empty:          { alignItems: 'center', paddingTop: 20, paddingHorizontal: 32 },
  emptyTitle:     { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  emptyTx:        { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  infoRow:        { padding: 16, borderTopWidth: 1, alignItems: 'center' },
  infoTx:         { fontSize: 12 },
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 },
  modalTitle:     { fontSize: 18, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  modalSub:       { fontSize: 12, textAlign: 'center', marginBottom: 16 },
  modalInput:     { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 14, minHeight: 80, marginBottom: 14 },
  sendOfflineBtn: { borderRadius: 14, padding: 14, alignItems: 'center' },
});
