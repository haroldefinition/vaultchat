// ContactsScreen — full contacts list with sync, search, and A-Z index
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  Image, Alert, ActivityIndicator, SectionList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import { requestContactsPermission, syncContacts, getCachedContacts } from '../services/contacts';
import { loadContacts, saveContact, deleteContact } from '../services/contactsSync';

function Avatar({ contact, size = 46, accent }) {
  const name = contact.name || contact.firstName || '?';
  return contact.photo || contact.image
    ? <Image source={{ uri: contact.photo || contact.image }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: accent + '33', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: accent, fontWeight: '700', fontSize: size * 0.37 }}>{name[0]?.toUpperCase()}</Text>
      </View>;
}

export default function ContactsScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [contacts, setContacts] = useState([]);
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [synced,   setSynced]   = useState(false);

  useEffect(() => { fetchContacts(); }, []);

  async function fetchContacts() {
    setLoading(true);
    // Load from AsyncStorage immediately (Supabase syncs in background)
    const mine = await loadContacts();
    // loadContacts is from contactsSync
    // Also merge cached phone contacts
    const cached = await getCachedContacts().catch(() => []);
    const merged = [...mine];
    cached.forEach(pc => {
      if (!merged.find(m => m.phone === pc.phone)) merged.push(pc);
    });
    setContacts(merged.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    setLoading(false);
  }

  async function syncPhoneContacts() {
    setLoading(true);
    const granted = await requestContactsPermission();
    if (!granted) {
      Alert.alert('Permission needed', 'Allow contacts in Settings → Privacy → Contacts.');
      setLoading(false); return;
    }
    const synced = await syncContacts();
    // Merge with existing
    const raw  = await AsyncStorage.getItem('vaultchat_contacts');
    const mine = raw ? JSON.parse(raw) : [];
    const merged = [...mine];
    synced.forEach(c => {
      if (!merged.find(m => m.phone === c.phone)) merged.push(c);
    });
    setContacts(merged.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    setSynced(true);
    Alert.alert('Synced!', `${synced.length} contacts imported from your phone.`);
    setLoading(false);
  }

  const filtered = contacts.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  );

  // Group into sections by first letter
  const sections = filtered.reduce((acc, c) => {
    const letter = (c.name || c.phone || '#')[0]?.toUpperCase() || '#';
    const key    = /[A-Z]/.test(letter) ? letter : '#';
    const sec    = acc.find(s => s.title === key);
    if (sec) sec.data.push(c);
    else acc.push({ title: key, data: [c] });
    return acc;
  }, []).sort((a, b) => a.title.localeCompare(b.title));

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={[s.backTx, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: tx }]}>Contacts</Text>
        <TouchableOpacity
          style={[s.syncBtn, { backgroundColor: accent + '18', borderColor: accent + '44' }]}
          onPress={syncPhoneContacts} disabled={loading}>
          {loading
            ? <ActivityIndicator size="small" color={accent} />
            : <Text style={[s.syncTx, { color: accent }]}>{synced ? '↻' : '⟳'} Sync</Text>}
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[s.searchRow, { backgroundColor: inputBg, borderColor: border }]}>
        <Text style={{ color: sub, marginRight: 8 }}>🔍</Text>
        <TextInput
          style={[s.searchInput, { color: tx }]}
          placeholder="Search contacts…"
          placeholderTextColor={sub}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={{ color: sub, fontSize: 16, paddingHorizontal: 8 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* New contact button */}
      <TouchableOpacity
        style={[s.newContactRow, { backgroundColor: card, borderBottomColor: border }]}
        onPress={() => navigation.navigate('NewContact')}>
        <View style={[s.newContactIcon, { backgroundColor: accent + '20' }]}>
          <Text style={{ fontSize: 20, color: accent }}>＋</Text>
        </View>
        <Text style={[s.newContactTx, { color: accent }]}>New Contact</Text>
      </TouchableOpacity>

      {loading && contacts.length === 0 ? (
        <View style={s.loader}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={[{ color: sub, marginTop: 12 }]}>Loading contacts…</Text>
        </View>
      ) : sections.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>👤</Text>
          <Text style={[s.emptyTitle, { color: tx }]}>No Contacts Yet</Text>
          <Text style={[s.emptySub, { color: sub }]}>Tap Sync to import from your phone</Text>
          <TouchableOpacity style={[s.emptySyncBtn, { backgroundColor: accent }]} onPress={syncPhoneContacts}>
            <Text style={{ color: '#000', fontWeight: '700' }}>⟳  Sync Phone Contacts</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) => item.id || item.phone || String(i)}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: 32 }}
          renderSectionHeader={({ section }) => (
            <View style={[s.sectionHeader, { backgroundColor: bg }]}>
              <Text style={[s.sectionLetter, { color: accent }]}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const name = `${item.firstName || ''} ${item.lastName || ''}`.trim() || item.name || item.phone || 'Unknown';
            return (
              <TouchableOpacity
                style={[s.row, { borderBottomColor: border }]}
                onPress={() => navigation.navigate('ContactView', { contact: { ...item, name } })}>
                <Avatar contact={{ ...item, name }} accent={accent} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[s.contactName, { color: tx }]}>{name}</Text>
                  {item.phone ? <Text style={[s.contactPhone, { color: sub }]}>{item.phone}</Text> : null}
                  {item.handle ? <Text style={[s.contactHandle, { color: accent }]}>@{item.handle}</Text> : null}
                </View>
                <Text style={{ color: sub, fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:        { padding: 4 },
  backTx:         { fontSize: 30, fontWeight: 'bold' },
  title:          { flex: 1, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  syncBtn:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, borderWidth: 1 },
  syncTx:         { fontWeight: '700', fontSize: 13 },
  searchRow:      { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput:    { flex: 1, fontSize: 15 },
  newContactRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 14 },
  newContactIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  newContactTx:   { fontSize: 16, fontWeight: '600' },
  sectionHeader:  { paddingHorizontal: 20, paddingVertical: 6 },
  sectionLetter:  { fontSize: 13, fontWeight: '700' },
  row:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  contactName:    { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  contactPhone:   { fontSize: 13 },
  contactHandle:  { fontSize: 12, fontWeight: '600' },
  loader:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle:     { fontSize: 20, fontWeight: '700' },
  emptySub:       { fontSize: 14, textAlign: 'center' },
  emptySyncBtn:   { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, marginTop: 8 },
});
