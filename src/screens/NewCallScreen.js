import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Image, Alert, ActivityIndicator } from 'react-native';
import { useTheme } from '../services/theme';
import { requestContactsPermission, syncContacts, getCachedContacts } from '../services/contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function NewCallScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [contacts, setContacts] = useState([]);
  const [appUsers, setAppUsers] = useState([]);
  const [frequent, setFrequent] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    // Load cached contacts
    const cached = await getCachedContacts();
    setContacts(cached);
    // Load app users from chats
    const chats = await AsyncStorage.getItem('vaultchat_chats');
    if (chats) {
      const parsed = JSON.parse(chats);
      setAppUsers(parsed.map(c => ({
        name: c.name || `+1${c.phone}`,
        phone: c.phone,
        handle: c.handle || '',
        photo: c.photo || null,
      })));
      // Frequent = first 5 chats
      setFrequent(parsed.slice(0, 5).map(c => ({
        name: c.name || `+1${c.phone}`,
        phone: c.phone,
        handle: c.handle || '',
        photo: c.photo || null,
      })));
    }
    setLoading(false);
  }

  async function syncPhoneContacts() {
    setLoading(true);
    const granted = await requestContactsPermission();
    if (!granted) {
      Alert.alert('Permission needed', 'Allow contacts access in Settings → Expo Go → Contacts');
      setLoading(false);
      return;
    }
    const synced = await syncContacts();
    setContacts(synced);
    Alert.alert('Synced!', `${synced.length} contacts imported from your phone.`);
    setLoading(false);
  }

  function makeCall(name, phone, type = 'voice') {
    navigation.navigate('ActiveCall', { recipientName: name, recipientPhone: phone, callType: type });
  }

  const filtered = (tab === 'app' ? appUsers : tab === 'frequent' ? frequent : contacts).filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.handle?.toLowerCase().includes(search.toLowerCase())
  );

  const Avatar = ({ contact, size = 48 }) => (
    contact.photo || contact.image
      ? <Image source={{ uri: contact.photo || contact.image }} style={[st.avatar, { width: size, height: size, borderRadius: size/2 }]} />
      : <View style={[st.avatarCircle, { width: size, height: size, borderRadius: size/2, backgroundColor: accent }]}>
          <Text style={[st.avatarText, { fontSize: size * 0.35 }]}>{contact.name?.[0]?.toUpperCase() || '?'}</Text>
        </View>
  );

  return (
    <View style={[st.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[st.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: accent, fontSize: 16 }}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: tx }]}>New Call</Text>
        <TouchableOpacity onPress={syncPhoneContacts}>
          <Text style={{ color: accent, fontSize: 13, fontWeight: 'bold' }}>Sync</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[st.searchRow, { backgroundColor: inputBg, borderColor: border }]}>
        <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
        <TextInput
          style={[st.searchInput, { color: tx }]}
          placeholder="Search name, @handle or number..."
          placeholderTextColor={sub}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {/* Tabs */}
      <View style={[st.tabRow, { backgroundColor: card, borderBottomColor: border }]}>
        {[
          { key: 'all', label: '📱 Contacts' },
          { key: 'app', label: '🔒 On App' },
          { key: 'frequent', label: '⭐ Frequent' },
        ].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[st.tab, tab === t.key && { borderBottomWidth: 2, borderBottomColor: accent }]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[st.tabText, { color: tab === t.key ? accent : sub }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={st.loading}>
          <ActivityIndicator color={accent} size="large" />
          <Text style={[{ color: sub, marginTop: 12 }]}>Loading contacts...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={st.empty}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>
            {tab === 'all' ? '📱' : tab === 'app' ? '🔒' : '⭐'}
          </Text>
          <Text style={[st.emptyText, { color: tx }]}>
            {tab === 'all' ? 'No contacts yet' : tab === 'app' ? 'No app users yet' : 'No frequent contacts'}
          </Text>
          {tab === 'all' && (
            <TouchableOpacity style={[st.syncBtn, { backgroundColor: accent }]} onPress={syncPhoneContacts}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Sync Phone Contacts</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, i) => item.phone + i}
          renderItem={({ item }) => (
            <View style={[st.contactRow, { borderBottomColor: border }]}>
              <Avatar contact={item} />
              <View style={st.contactInfo}>
                <Text style={[st.contactName, { color: tx }]}>{item.name}</Text>
                {item.handle
                  ? <Text style={[st.contactHandle, { color: accent }]}>{item.handle}</Text>
                  : <Text style={[st.contactPhone, { color: sub }]}>+1{item.phone}</Text>
                }
                {tab === 'app' && (
                  <Text style={[{ fontSize: 10, color: '#00ffa3', marginTop: 1 }]}>🔒 On VaultChat</Text>
                )}
              </View>
              <View style={st.callBtns}>
                <TouchableOpacity
                  style={[st.callBtn, { backgroundColor: '#34C759' }]}
                  onPress={() => makeCall(item.name, item.phone, 'voice')}
                >
                  <Text style={{ fontSize: 18 }}>📞</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.callBtn, { backgroundColor: '#1a73e8' }]}
                  onPress={() => makeCall(item.name, item.phone, 'video')}
                >
                  <Text style={{ fontSize: 18 }}>📹</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: 'bold' },
  searchRow: { flexDirection: 'row', alignItems: 'center', margin: 12, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14 },
  searchInput: { flex: 1, padding: 12, fontSize: 15 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, padding: 12, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '600' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
  syncBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
  contactRow: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingHorizontal: 16, borderBottomWidth: 1, gap: 12 },
  avatar: { },
  avatarCircle: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold' },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  contactHandle: { fontSize: 13, fontWeight: '600' },
  contactPhone: { fontSize: 13 },
  callBtns: { flexDirection: 'row', gap: 8 },
  callBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
