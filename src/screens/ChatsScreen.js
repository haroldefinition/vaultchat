import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Image, ScrollView } from 'react-native';
import { supabase } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import { getMyHandle } from '../services/vaultHandle';

const BACKEND = 'https://vaultchat-production-3a96.up.railway.app';

function generateRoomId(phone1, phone2) {
  // Sort so A->B and B->A always get same room ID
  const sorted = [phone1.replace(/\D/g,''), phone2.replace(/\D/g,'')].sort();
  const combined = sorted[0] + sorted[1];
  // Generate deterministic UUID v4-like from phone pair
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

export default function ChatsScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [chats, setChats] = useState([]);
  const [user, setUser] = useState(null);
  const [modal, setModal] = useState(false);
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('');
  const [searchText, setSearchText] = useState('');
  const [contacts, setContacts] = useState([]);
  const [myHandle, setMyHandle] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) setUser(session.user); });
    load();
    getMyHandle().then(h => { if (h) setMyHandle(h); });
  }, []);

  useEffect(() => { const u = navigation.addListener('focus', load); return u; }, [navigation]);

  async function load() {
    const s = await AsyncStorage.getItem('vaultchat_chats');
    if (s) {
      const parsed = JSON.parse(s);
      setChats(parsed);
      setContacts(parsed.map(c => ({ phone: c.phone, name: c.name || '', photo: c.photo || null })));
    }
  }

  async function saveChats(data) { await AsyncStorage.setItem('vaultchat_chats', JSON.stringify(data)); }

  async function start(overridePhone, overrideName) {
    const targetPhone = overridePhone || phone;
    const targetName = overrideName || '';
    if (!targetPhone || targetPhone.length < 10) return;
    const myPhone = user?.phone?.replace('+1','') || '0000000000';
    const roomId = generateRoomId(myPhone, targetPhone);
    const exists = chats.find(c => c.phone === targetPhone);
    if (!exists) {
      const updated = [{
        roomId, phone: targetPhone, name: targetName, photo: null,
        lastMessage: msg || 'New chat',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }, ...chats];
      setChats(updated); saveChats(updated);
    } else {
      const updated = chats.map(c => c.phone === targetPhone ? { ...c, roomId } : c);
      setChats(updated); saveChats(updated);
    }
    if (msg.trim()) {
      try {
        const senderId = user?.id || '550e8400-e29b-41d4-a716-446655440001';
        await fetch(`${BACKEND}/messages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room_id: roomId, sender_id: senderId, content: msg.trim() })
        });
      } catch (e) {}
    }
    setModal(false); setPhone(''); setMsg(''); setSearchText('');
    navigation.navigate('ChatRoom', {
      roomId, recipientPhone: targetPhone,
      recipientName: targetName || exists?.name || '',
      recipientPhoto: exists?.photo || null, user
    });
  }

  const filteredContacts = contacts.filter(c =>
    (c.name && c.name.toLowerCase().includes(searchText.toLowerCase())) ||
    c.phone.includes(searchText) ||
    (c.handle && c.handle.toLowerCase().includes(searchText.toLowerCase()))
  );

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <View style={[s.header, { borderBottomColor: border }]}>
        <View>
          <Text style={[s.title, { color: accent }]}>VaultChat</Text>
          {myHandle ? <Text style={{ color: '#5856d6', fontSize: 11, fontWeight: 'bold' }}>{myHandle}</Text> : null}
        </View>
        <TouchableOpacity style={[s.compose, { backgroundColor: card }]} onPress={() => setModal(true)}>
          <Text style={s.composeIcon}>✏️</Text>
        </TouchableOpacity>
      </View>

      {chats.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>🔒</Text>
          <Text style={[s.emptyText, { color: tx }]}>No chats yet</Text>
          <Text style={[s.emptySub, { color: sub }]}>Tap ✏️ to start a secure chat</Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={i => i.phone}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.chatItem, { borderBottomColor: border }]}
              onPress={() => navigation.navigate('ChatRoom', {
                roomId: item.roomId, recipientPhone: item.phone,
                recipientName: item.name, recipientPhoto: item.photo, user
              })}
            >
              {item.photo
                ? <Image source={{ uri: item.photo }} style={s.avatar} />
                : <View style={[s.avatarCircle, { backgroundColor: accent }]}>
                    <Text style={s.avatarText}>{item.name ? item.name[0].toUpperCase() : item.phone.slice(-2)}</Text>
                  </View>}
              <View style={s.chatInfo}>
                <Text style={[s.chatName, { color: tx }]}>{item.name || `+1${item.phone}`}</Text>
                <Text style={[s.chatLast, { color: sub }]}>{item.lastMessage}</Text>
              </View>
              <Text style={[s.chatTime, { color: sub }]}>{item.time}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Full Page New Message Modal */}
      <Modal visible={modal} animationType="slide">
        <View style={[s.fullPage, { backgroundColor: bg }]}>

          {/* Header */}
          <View style={[s.fullHeader, { backgroundColor: card, borderBottomColor: border }]}>
            <TouchableOpacity onPress={() => { setModal(false); setPhone(''); setMsg(''); setSearchText(''); }}>
              <Text style={{ color: accent, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[s.fullTitle, { color: tx }]}>New Message</Text>
            <TouchableOpacity onPress={() => start()}>
              <Text style={{ color: phone.length >= 10 ? accent : sub, fontWeight: 'bold', fontSize: 16 }}>Send</Text>
            </TouchableOpacity>
          </View>

          {/* Phone input row */}
          <View style={[s.toRow, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.toLabel, { color: accent }]}>To:</Text>
            <TextInput
              style={[s.toInput, { color: tx }]}
              placeholder="Enter phone number (10 digits)"
              placeholderTextColor={sub}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              maxLength={10}
            />
            {phone.length > 0 && (
              <TouchableOpacity onPress={() => setPhone('')}>
                <Text style={{ color: sub, fontSize: 18, paddingHorizontal: 8 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Message input */}
          <View style={[s.msgRow, { backgroundColor: card, borderColor: border }]}>
            <TextInput
              style={[s.msgInput, { color: tx }]}
              placeholder="Type a message (optional)"
              placeholderTextColor={sub}
              value={msg}
              onChangeText={setMsg}
              multiline
            />
          </View>

          {/* Search contacts */}
          <View style={[s.searchRow, { backgroundColor: inputBg, borderColor: border }]}>
            <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
            <TextInput
              style={[s.searchInput, { color: tx }]}
              placeholder="Search contacts by name or number..."
              placeholderTextColor={sub}
              value={searchText}
              onChangeText={setSearchText}
              autoCapitalize="none"
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <Text style={{ color: sub, fontSize: 16, paddingLeft: 8 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Contacts label */}
          <Text style={[s.contactsLabel, { color: sub, backgroundColor: bg }]}>
            {contacts.length > 0 ? `CONTACTS (${contacts.length})` : 'NO CONTACTS YET'}
          </Text>

          {/* Scrollable contacts list */}
          {contacts.length === 0 ? (
            <View style={s.noContactsBox}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>👥</Text>
              <Text style={[s.noContactsText, { color: sub }]}>
                No contacts yet.{'\n'}Start a chat by entering a phone number above.
              </Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {(searchText ? filteredContacts : contacts).length === 0 ? (
                <View style={s.noContactsBox}>
                  <Text style={{ fontSize: 36 }}>🔍</Text>
                  <Text style={[s.noContactsText, { color: sub }]}>No contacts match "{searchText}"</Text>
                </View>
              ) : (
                (searchText ? filteredContacts : contacts).map((contact, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.contactRow, { borderBottomColor: border, backgroundColor: card }]}
                    onPress={() => {
                      setPhone(contact.phone);
                      start(contact.phone, contact.name);
                    }}
                  >
                    {contact.photo
                      ? <Image source={{ uri: contact.photo }} style={s.contactAvatar} />
                      : <View style={[s.contactAvatarCircle, { backgroundColor: accent }]}>
                          <Text style={s.contactAvatarText}>
                            {contact.name ? contact.name[0].toUpperCase() : contact.phone.slice(-2)}
                          </Text>
                        </View>}
                    <View style={s.contactInfo}>
                      <Text style={[s.contactName, { color: tx }]}>{contact.name || `+1${contact.phone}`}</Text>
                      <Text style={[s.contactPhone, { color: sub }]}>+1{contact.phone}</Text>
                    </View>
                    <View style={[s.chatNowBtn, { backgroundColor: accent }]}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Chat</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1 },
  title: { fontSize: 24, fontWeight: 'bold' },
  compose: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  composeIcon: { fontSize: 18 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  chatItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  avatar: { width: 52, height: 52, borderRadius: 26, marginRight: 12 },
  avatarCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontWeight: 'bold', color: '#fff', fontSize: 18 },
  chatInfo: { flex: 1 },
  chatName: { fontWeight: 'bold', fontSize: 15, marginBottom: 3 },
  chatLast: { fontSize: 13 },
  chatTime: { fontSize: 12 },

  // Full page modal
  fullPage: { flex: 1 },
  fullHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1 },
  fullTitle: { fontSize: 17, fontWeight: 'bold' },
  toRow: { flexDirection: 'row', alignItems: 'center', margin: 16, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16 },
  toLabel: { fontWeight: 'bold', fontSize: 15, marginRight: 8 },
  toInput: { flex: 1, padding: 14, fontSize: 16 },
  msgRow: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, marginBottom: 8 },
  msgInput: { flex: 1, padding: 14, fontSize: 15, minHeight: 60 },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, marginBottom: 4 },
  searchInput: { flex: 1, padding: 12, fontSize: 15 },
  contactsLabel: { fontSize: 11, fontWeight: 'bold', letterSpacing: 1, paddingHorizontal: 20, paddingVertical: 10 },
  noContactsBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48, marginTop: 60 },
  noContactsText: { fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  contactRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  contactAvatar: { width: 54, height: 54, borderRadius: 27, marginRight: 14 },
  contactAvatarCircle: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  contactAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 20 },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 16, fontWeight: 'bold', marginBottom: 3 },
  contactPhone: { fontSize: 13 },
  chatNowBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
});
