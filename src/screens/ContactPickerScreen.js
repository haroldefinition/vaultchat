import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image } from 'react-native';
import { useTheme } from '../services/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedContacts } from '../services/contacts';

export default function ContactPickerScreen({ navigation, route }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const { onSelect } = route.params || {};
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState([]);

  useEffect(() => { loadContacts(); }, []);

  async function loadContacts() {
    const chats = await AsyncStorage.getItem('vaultchat_chats');
    const appContacts = chats ? JSON.parse(chats).map(c => ({ phone: c.phone, name: c.name || 'Unknown', handle: c.handle || '', photo: c.photo, onApp: true })) : [];
    const pc = await getCachedContacts();
    const phoneContacts = pc.map(c => ({ ...c, onApp: false }));
    setContacts([...appContacts, ...phoneContacts.filter(p => !appContacts.find(a => a.phone === p.phone))]);
  }

  const filtered = contacts.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.handle?.toLowerCase().includes(search.toLowerCase())
  );

  function select(contact) {
    navigation.navigate('NewMessage', { selectedContact: contact });
  }

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: accent, fontSize: 16 }}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tx }]}>Select Contact</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={[s.searchRow, { backgroundColor: inputBg, borderColor: border }]}>
        <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
        <TextInput
          style={[{ flex: 1, padding: 12, fontSize: 15, color: tx }]}
          placeholder="Search name, @handle or number..."
          placeholderTextColor={sub}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoFocus
        />
      </View>

      <ScrollView style={{ flex: 1 }}>
        <Text style={[s.sectionLabel, { color: sub }]}>🔒 ON VAULTCHAT</Text>
        {filtered.filter(c => c.onApp).length === 0
          ? <Text style={[s.empty, { color: sub }]}>No app users yet. Sync contacts in Settings.</Text>
          : filtered.filter(c => c.onApp).map((contact, i) => (
            <TouchableOpacity key={i} style={[s.row, { borderBottomColor: border, backgroundColor: card }]} onPress={() => select(contact)}>
              {contact.photo
                ? <Image source={{ uri: contact.photo }} style={s.avatar} />
                : <View style={[s.avatarCircle, { backgroundColor: accent }]}>
                    <Text style={s.avatarText}>{contact.name?.[0]?.toUpperCase() || '?'}</Text>
                  </View>}
              <View style={{ flex: 1 }}>
                <Text style={[s.name, { color: tx }]}>{contact.name}</Text>
                {contact.handle
                  ? <Text style={{ color: '#5856d6', fontSize: 12, fontWeight: 'bold' }}>{contact.handle}</Text>
                  : <Text style={{ color: sub, fontSize: 12 }}>+1{contact.phone}</Text>}
                <Text style={{ fontSize: 10, color: '#00ffa3' }}>🔒 On VaultChat</Text>
              </View>
              <View style={[s.selectBtn, { backgroundColor: accent }]}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Select</Text>
              </View>
            </TouchableOpacity>
          ))}

        {filtered.filter(c => !c.onApp).length > 0 && (
          <>
            <Text style={[s.sectionLabel, { color: sub, marginTop: 8 }]}>📱 PHONE CONTACTS</Text>
            {filtered.filter(c => !c.onApp).map((contact, i) => (
              <TouchableOpacity key={i} style={[s.row, { borderBottomColor: border, backgroundColor: card }]} onPress={() => select(contact)}>
                <View style={[s.avatarCircle, { backgroundColor: '#5856d6' }]}>
                  <Text style={s.avatarText}>{contact.name?.[0]?.toUpperCase() || '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.name, { color: tx }]}>{contact.name}</Text>
                  <Text style={{ color: sub, fontSize: 12 }}>+1{contact.phone}</Text>
                  <Text style={{ fontSize: 10, color: sub }}>📱 Not on app yet</Text>
                </View>
                <View style={[s.selectBtn, { backgroundColor: '#5856d6' }]}>
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Select</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: 'bold' },
  searchRow: { flexDirection: 'row', alignItems: 'center', margin: 12, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14 },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', letterSpacing: 1, paddingHorizontal: 20, paddingVertical: 8 },
  empty: { textAlign: 'center', padding: 20, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 12 },
  avatarCircle: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  name: { fontSize: 16, fontWeight: 'bold', marginBottom: 3 },
  selectBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
});
