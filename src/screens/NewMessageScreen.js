import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '../services/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { Share } from 'react-native';
import { supabase } from '../services/supabase';
import { getMyHandle } from '../services/vaultHandle';

const BACKEND = 'https://vaultchat-production-3a96.up.railway.app';

function generateRoomId(phone1, phone2) {
  const sorted = [phone1.replace(/\D/g,''), phone2.replace(/\D/g,'')].sort();
  const combined = sorted[0] + sorted[1];
  let h1 = 0, h2 = 0;
  for (let i = 0; i < combined.length; i++) {
    h1 = Math.imul(31, h1) + combined.charCodeAt(i) | 0;
    h2 = Math.imul(37, h2) + combined.charCodeAt(i) | 0;
  }
  const a = Math.abs(h1).toString(16).padStart(8, '0');
  const b = Math.abs(h2).toString(16).padStart(8, '0');
  const c = Math.abs(h1 ^ h2).toString(16).padStart(8, '0');
  return `${a.slice(0,8)}-${b.slice(0,4)}-4${b.slice(1,4)}-a${c.slice(0,3)}-${a}${b.slice(0,4)}`;
}

export default function NewMessageScreen({ navigation, route }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState('');
  const [user, setUser] = useState(null);
  const [attachModal, setAttachModal] = useState(false);
  const [selectedName, setSelectedName] = useState('');
  const [myHandle, setMyHandle] = useState('');
  const pendingType = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUser(session.user);
    });
    getMyHandle().then(h => { if (h) setMyHandle(h); });
  }, []);

  useEffect(() => {
    if (route.params?.selectedContact) {
      const c = route.params.selectedContact;
      setInput(c.handle || c.phone);
      setSelectedName(c.name || '');
    }
  }, [route.params?.selectedContact]);

  // Run attach AFTER modal closes
  useEffect(() => {
    if (!attachModal && pendingType.current) {
      const type = pendingType.current;
      pendingType.current = null;
      setTimeout(() => runAttach(type), 600);
    }
  }, [attachModal]);

  function handleAttach(type) {
    pendingType.current = type;
    setAttachModal(false);
  }

  async function runAttach(type) {
    if (type === 'photo') {
      try {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permission needed', 'Go to Settings → Expo Go → Photos → All Photos'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
        if (!result.canceled && result.assets?.length > 0) setMsg('🖼️ Photo: ' + result.assets[0].uri.split('/').pop());
      } catch(e) { Alert.alert('Gallery Error', e.message); }

    } else if (type === 'video') {
      try {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permission needed', 'Go to Settings → Expo Go → Photos → All Photos'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos', quality: 1 });
        if (!result.canceled && result.assets?.length > 0) setMsg('🎥 Video: ' + result.assets[0].uri.split('/').pop());
      } catch(e) { Alert.alert('Video Error', e.message); }

    } else if (type === 'camera') {
      try {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permission needed', 'Allow camera in Settings → Expo Go → Camera'); return; }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
        if (!result.canceled && result.assets?.length > 0) setMsg('📷 Camera photo taken');
      } catch(e) { Alert.alert('Camera', 'Camera works on real iPhone only.'); }

    } else if (type === 'file') {
      try {
        const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
        if (!result.canceled && result.assets?.length > 0) {
          const file = result.assets[0];
          setMsg('📁 ' + file.name + ' (' + (file.size ? (file.size/1024).toFixed(1) + ' KB' : 'unknown') + ')');
        }
      } catch(e) { Alert.alert('File', 'File picker works on real iPhone.'); }

    } else if (type === 'airdrop') {
      try {
        await Share.share({ message: msg || 'Sent via VaultChat - encrypted messaging!', title: 'VaultChat' });
        setMsg('🔵 AirDrop: Content shared');
      } catch(e) { Alert.alert('AirDrop Error', e.message); }

    } else if (type === 'location') {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permission needed', 'Allow location in Settings → Expo Go → Location'); return; }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setMsg('📍 Location: https://maps.google.com/?q=' + loc.coords.latitude.toFixed(5) + ',' + loc.coords.longitude.toFixed(5));
      } catch(e) { Alert.alert('Location Error', 'Could not get location.'); }
    }
  }

  async function startChat() {
    const phone = input.replace(/\D/g, '');
    if (!phone || phone.length < 10) { Alert.alert('Error', 'Enter a valid 10-digit phone number or select from contacts'); return; }
    const myPhone = user?.phone?.replace('+1','') || '0000000000';
    const roomId = generateRoomId(myPhone, phone);
    const saved = await AsyncStorage.getItem('vaultchat_chats');
    const existing = saved ? JSON.parse(saved) : [];
    const exists = existing.find(c => c.phone === phone);
    if (!exists) {
      const updated = [{ roomId, phone, name: selectedName, handle: input.startsWith('@') ? input : '', photo: null, lastMessage: msg || 'New chat', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), pinned: false, hideAlerts: false }, ...existing];
      await AsyncStorage.setItem('vaultchat_chats', JSON.stringify(updated));
    }
    if (msg.trim()) {
      try {
        if (!user?.id) return;
        const senderId = user.id;
        await fetch(`${BACKEND}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room_id: roomId, sender_id: senderId, content: msg.trim() }) });
      } catch(e) {}
    }
    navigation.replace('ChatRoom', { roomId, recipientPhone: phone, recipientName: selectedName || exists?.name || '', recipientPhoto: exists?.photo || null, user });
  }

  const attachments = [
    { icon: '🖼️', label: 'Gallery', type: 'photo' },
    { icon: '🎥', label: 'Video', type: 'video' },
    { icon: '📸', label: 'Camera', type: 'camera' },
    { icon: '📁', label: 'File', type: 'file' },
    { icon: '🔵', label: 'AirDrop', type: 'airdrop' },
    { icon: '📍', label: 'Location', type: 'location' },
  ];

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {myHandle ? (
        <View style={[{ backgroundColor: card, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 4 }]}>
          <Text style={{ color: '#5856d6', fontSize: 11, fontWeight: 'bold' }}>{myHandle}</Text>
        </View>
      ) : null}
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border, paddingTop: myHandle ? 8 : 56 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: accent, fontSize: 16 }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tx }]}>New Message</Text>
        <TouchableOpacity onPress={startChat}>
          <Text style={{ color: input.length >= 3 ? accent : sub, fontWeight: 'bold', fontSize: 16 }}>Start</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.toRow, { backgroundColor: card, borderBottomColor: border }]}>
        <Text style={[s.toLabel, { color: accent }]}>To:</Text>
        <TextInput
          style={[s.toInput, { color: tx }]}
          placeholder="Phone number or @handle"
          placeholderTextColor={sub}
          value={input}
          onChangeText={v => { setInput(v); setSelectedName(''); }}
          autoCapitalize="none"
          keyboardType="default"
        />
        <TouchableOpacity style={[s.toAddBtn, { backgroundColor: accent }]} onPress={() => navigation.navigate('ContactPicker')}>
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold', lineHeight: 28 }}>+</Text>
        </TouchableOpacity>
      </View>

      {selectedName ? (
        <View style={[s.selectedBadge, { backgroundColor: accent }]}>
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>✓ {selectedName}{input.startsWith('@') ? ' ' + input : ''}</Text>
          <TouchableOpacity onPress={() => { setInput(''); setSelectedName(''); }}>
            <Text style={{ color: '#fff', fontSize: 16, marginLeft: 8 }}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={{ flex: 1 }} />

      <View style={[s.inputRow, { backgroundColor: card, borderTopColor: border }]}>
        <TouchableOpacity style={[s.plusBtn, { backgroundColor: inputBg, borderColor: accent }]} onPress={() => setAttachModal(true)}>
          <Text style={{ color: accent, fontSize: 26, fontWeight: '300', lineHeight: 30 }}>+</Text>
        </TouchableOpacity>
        <TextInput
          style={[s.msgInput, { backgroundColor: inputBg, color: tx }]}
          placeholder="Type a message..."
          placeholderTextColor={sub}
          value={msg}
          onChangeText={setMsg}
          multiline
        />
        <TouchableOpacity style={[s.sendBtn, { backgroundColor: input.length >= 3 ? accent : inputBg }]} onPress={startChat}>
          <Text style={{ color: input.length >= 3 ? '#fff' : sub, fontSize: 18 }}>➤</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={attachModal} transparent animationType="slide">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setAttachModal(false)}>
          <View style={[s.sheet, { backgroundColor: card }]}>
            <View style={[s.handle, { backgroundColor: border }]} />
            <Text style={[s.sheetTitle, { color: tx }]}>Attachments</Text>
            <View style={s.attachGrid}>
              {attachments.map((a, i) => (
                <TouchableOpacity key={i} style={s.attachItem} onPress={() => handleAttach(a.type)}>
                  <View style={[s.attachIconBox, { backgroundColor: inputBg }]}>
                    <Text style={{ fontSize: 28 }}>{a.icon}</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: sub }}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: 'bold' },
  toRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingLeft: 16, minHeight: 56 },
  toLabel: { fontWeight: 'bold', fontSize: 16, width: 28 },
  toInput: { flex: 1, fontSize: 16, padding: 14 },
  toAddBtn: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  selectedBadge: { flexDirection: 'row', alignItems: 'center', margin: 12, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  inputRow: { flexDirection: 'row', padding: 10, paddingHorizontal: 12, alignItems: 'center', gap: 8, borderTopWidth: 1, minHeight: 70, paddingBottom: 24 },
  plusBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  msgInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, fontSize: 15, maxHeight: 100, minHeight: 42 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 44 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontWeight: 'bold', fontSize: 16, marginBottom: 16, textAlign: 'center' },
  attachGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 16 },
  attachItem: { alignItems: 'center', width: 72 },
  attachIconBox: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});
