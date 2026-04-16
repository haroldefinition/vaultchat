import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Image, Alert, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../services/theme';
import { requestContactsPermission, syncContacts, getCachedContacts } from '../services/contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Create Contact Modal ───────────────────────────────────────
function CreateContactModal({ visible, onClose, onSave, accent, bg, card, tx, sub, border, inputBg }) {
  const [photo,     setPhoto]     = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [mobile,    setMobile]    = useState('');
  const [email,     setEmail]     = useState('');
  const [address,   setAddress]   = useState('');
  const [birthday,  setBirthday]  = useState('');
  const [url,       setUrl]       = useState('');
  const [notes,     setNotes]     = useState('');

  function reset() {
    setPhoto(null); setFirstName(''); setLastName(''); setMobile('');
    setEmail(''); setAddress(''); setBirthday(''); setUrl(''); setNotes('');
  }

  async function pickPhoto() {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) { Alert.alert('Permission needed'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (!r.canceled && r.assets?.[0]) setPhoto(r.assets[0].uri);
  }

  async function save() {
    if (!firstName.trim() && !mobile.trim()) {
      Alert.alert('Required', 'Enter at least a first name or phone number.');
      return;
    }
    const contact = {
      id:        `contact_${Date.now()}`,
      name:      `${firstName.trim()} ${lastName.trim()}`.trim(),
      firstName: firstName.trim(),
      lastName:  lastName.trim(),
      phone:     mobile.replace(/\D/g, ''),
      email:     email.trim(),
      address:   address.trim(),
      birthday:  birthday.trim(),
      url:       url.trim(),
      notes:     notes.trim(),
      photo:     photo,
    };
    // Save to AsyncStorage
    const raw  = await AsyncStorage.getItem('vaultchat_contacts');
    const list = raw ? JSON.parse(raw) : [];
    list.push(contact);
    await AsyncStorage.setItem('vaultchat_contacts', JSON.stringify(list));
    Alert.alert('Saved!', `${contact.name || mobile} has been added to your contacts.`);
    onSave && onSave(contact);
    reset();
    onClose();
  }

  const FIELDS = [
    { label: 'First Name',    val: firstName, set: setFirstName, kb: 'default',      multi: false },
    { label: 'Last Name',     val: lastName,  set: setLastName,  kb: 'default',      multi: false },
    { label: 'Mobile Phone',  val: mobile,    set: setMobile,    kb: 'phone-pad',    multi: false },
    { label: 'Email',         val: email,     set: setEmail,     kb: 'email-address',multi: false },
    { label: 'Address',       val: address,   set: setAddress,   kb: 'default',      multi: true  },
    { label: 'Birthday',      val: birthday,  set: setBirthday,  kb: 'default',      multi: false },
    { label: 'URL',           val: url,       set: setUrl,       kb: 'url',          multi: false },
    { label: 'Notes',         val: notes,     set: setNotes,     kb: 'default',      multi: true  },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={cm.overlay}>
        <View style={[cm.sheet, { backgroundColor: bg }]}>
          {/* Header */}
          <View style={[cm.header, { borderBottomColor: border }]}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Text style={{ color: sub, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[cm.title, { color: tx }]}>New Contact</Text>
            <TouchableOpacity onPress={save}>
              <Text style={{ color: accent, fontWeight: '700', fontSize: 16 }}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>
            {/* Avatar */}
            <TouchableOpacity onPress={pickPhoto} style={cm.avatarWrap}>
              {photo
                ? <Image source={{ uri: photo }} style={cm.avatarImg} />
                : <View style={[cm.avatarPlaceholder, { backgroundColor: accent + '33' }]}>
                    <Text style={{ fontSize: 36 }}>📷</Text>
                  </View>
              }
              <Text style={[cm.photoLabel, { color: accent }]}>
                {photo ? 'Change Photo' : 'Add Photo'}
              </Text>
            </TouchableOpacity>

            {/* Fields */}
            {FIELDS.map(({ label, val, set, kb, multi }) => (
              <View key={label} style={[cm.field, { backgroundColor: card, borderColor: border }]}>
                <Text style={[cm.fieldLabel, { color: sub }]}>{label}</Text>
                <TextInput
                  style={[cm.fieldInput, { color: tx }]}
                  value={val}
                  onChangeText={set}
                  keyboardType={kb}
                  autoCapitalize={kb === 'default' ? 'words' : 'none'}
                  multiline={multi}
                  placeholder={label}
                  placeholderTextColor={sub}
                  returnKeyType="next"
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Edit Contact Modal (same form, pre-filled) ─────────────────
function EditContactModal({ visible, contact, onClose, onSave, accent, bg, card, tx, sub, border }) {
  const [photo,     setPhoto]     = useState(contact?.photo    || null);
  const [firstName, setFirstName] = useState(contact?.firstName|| '');
  const [lastName,  setLastName]  = useState(contact?.lastName || '');
  const [mobile,    setMobile]    = useState(contact?.phone    || '');
  const [email,     setEmail]     = useState(contact?.email    || '');
  const [address,   setAddress]   = useState(contact?.address  || '');
  const [birthday,  setBirthday]  = useState(contact?.birthday || '');
  const [url,       setUrl]       = useState(contact?.url      || '');
  const [notes,     setNotes]     = useState(contact?.notes    || '');

  useEffect(() => {
    if (contact) {
      setPhoto(contact.photo||null); setFirstName(contact.firstName||''); setLastName(contact.lastName||'');
      setMobile(contact.phone||''); setEmail(contact.email||''); setAddress(contact.address||'');
      setBirthday(contact.birthday||''); setUrl(contact.url||''); setNotes(contact.notes||'');
    }
  }, [contact]);

  async function pickPhoto() {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) { Alert.alert('Permission needed'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (!r.canceled && r.assets?.[0]) setPhoto(r.assets[0].uri);
  }

  async function save() {
    const updated = {
      ...contact,
      name:      `${firstName.trim()} ${lastName.trim()}`.trim(),
      firstName: firstName.trim(), lastName: lastName.trim(),
      phone: mobile.replace(/\D/g,''), email: email.trim(),
      address: address.trim(), birthday: birthday.trim(),
      url: url.trim(), notes: notes.trim(), photo,
    };
    // Update in AsyncStorage
    const raw  = await AsyncStorage.getItem('vaultchat_contacts');
    const list = raw ? JSON.parse(raw) : [];
    const idx  = list.findIndex(c => c.id === contact?.id);
    if (idx >= 0) list[idx] = updated; else list.push(updated);
    await AsyncStorage.setItem('vaultchat_contacts', JSON.stringify(list));
    onSave && onSave(updated);
    onClose();
  }

  const FIELDS = [
    { label: 'First Name',   val: firstName, set: setFirstName, kb: 'default',       multi: false },
    { label: 'Last Name',    val: lastName,  set: setLastName,  kb: 'default',       multi: false },
    { label: 'Mobile Phone', val: mobile,    set: setMobile,    kb: 'phone-pad',     multi: false },
    { label: 'Email',        val: email,     set: setEmail,     kb: 'email-address', multi: false },
    { label: 'Address',      val: address,   set: setAddress,   kb: 'default',       multi: true  },
    { label: 'Birthday',     val: birthday,  set: setBirthday,  kb: 'default',       multi: false },
    { label: 'URL',          val: url,       set: setUrl,       kb: 'url',           multi: false },
    { label: 'Notes',        val: notes,     set: setNotes,     kb: 'default',       multi: true  },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={cm.overlay}>
        <View style={[cm.sheet, { backgroundColor: bg }]}>
          <View style={[cm.header, { borderBottomColor: border }]}>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: sub, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[cm.title, { color: tx }]}>Edit Contact</Text>
            <TouchableOpacity onPress={save}>
              <Text style={{ color: accent, fontWeight: '700', fontSize: 16 }}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>
            <TouchableOpacity onPress={pickPhoto} style={cm.avatarWrap}>
              {photo
                ? <Image source={{ uri: photo }} style={cm.avatarImg} />
                : <View style={[cm.avatarPlaceholder, { backgroundColor: accent + '33' }]}>
                    <Text style={{ fontSize: 36, color: tx }}>{firstName?.[0]?.toUpperCase() || '?'}</Text>
                  </View>
              }
              <Text style={[cm.photoLabel, { color: accent }]}>{photo ? 'Change Photo' : 'Add Photo'}</Text>
            </TouchableOpacity>
            {FIELDS.map(({ label, val, set, kb, multi }) => (
              <View key={label} style={[cm.field, { backgroundColor: '#1c1c1e', borderColor: '#2c2c2e' }]}>
                <Text style={[cm.fieldLabel, { color: sub }]}>{label}</Text>
                <TextInput style={[cm.fieldInput, { color: tx }]} value={val} onChangeText={set}
                  keyboardType={kb} autoCapitalize={kb === 'default' ? 'words' : 'none'}
                  multiline={multi} placeholder={label} placeholderTextColor={sub} />
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Main NewCallScreen ─────────────────────────────────────────
export default function NewCallScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [contacts,       setContacts]       = useState([]);
  const [appUsers,       setAppUsers]       = useState([]);
  const [frequent,       setFrequent]       = useState([]);
  const [search,         setSearch]         = useState('');
  const [loading,        setLoading]        = useState(false);
  const [tab,            setTab]            = useState('all');
  const [createModal,    setCreateModal]    = useState(false);
  const [editModal,      setEditModal]      = useState(false);
  const [editingContact, setEditingContact] = useState(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const cached = await getCachedContacts();
    // Also load from our own contact store
    const raw = await AsyncStorage.getItem('vaultchat_contacts');
    const mine = raw ? JSON.parse(raw) : [];
    const allContacts = [...mine, ...cached.filter(c => !mine.find(m => m.phone === c.phone))];
    setContacts(allContacts);

    const chats = await AsyncStorage.getItem('vaultchat_chats');
    if (chats) {
      const parsed = JSON.parse(chats);
      const users = parsed.map(c => ({ name: c.name || `+1${c.phone}`, phone: c.phone, handle: c.handle || '', photo: c.photo || null }));
      setAppUsers(users);
      setFrequent(users.slice(0, 5));
    }
    setLoading(false);
  }

  async function syncPhoneContacts() {
    setLoading(true);
    const granted = await requestContactsPermission();
    if (!granted) { Alert.alert('Permission needed', 'Allow contacts in Settings.'); setLoading(false); return; }
    const synced = await syncContacts();
    setContacts(synced);
    Alert.alert('Synced!', `${synced.length} contacts imported.`);
    setLoading(false);
  }

  function makeCall(name, phone, type = 'voice') {
    navigation.navigate('ActiveCall', { recipientName: name, recipientPhone: phone, callType: type });
  }

  function tapAvatar(contact) {
    setEditingContact(contact);
    setEditModal(true);
  }

  const source = tab === 'app' ? appUsers : tab === 'frequent' ? frequent : contacts;
  const filtered = source.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.handle?.toLowerCase().includes(search.toLowerCase())
  );

  const Avatar = ({ contact, size = 48, onPress }) => {
    const initials = contact.name?.[0]?.toUpperCase() || '?';
    return (
      <TouchableOpacity onPress={onPress}>
        {contact.photo || contact.image
          ? <Image source={{ uri: contact.photo || contact.image }} style={{ width: size, height: size, borderRadius: size / 2 }} />
          : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: size * 0.35 }}>{initials}</Text>
            </View>
        }
      </TouchableOpacity>
    );
  };

  return (
    <View style={[st.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[st.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: accent, fontSize: 30, fontWeight: 'bold', padding: 4 }}>‹</Text>
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: tx }]}>New Call</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity onPress={syncPhoneContacts}>
            <Text style={{ color: accent, fontSize: 13, fontWeight: 'bold' }}>Sync</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Create Contact button */}
      <TouchableOpacity
        style={[st.createContactBtn, { backgroundColor: accent + '18', borderColor: accent }]}
        onPress={() => setCreateModal(true)}>
        <Text style={{ fontSize: 20 }}>➕</Text>
        <Text style={[st.createContactTx, { color: accent }]}>Create New Contact</Text>
      </TouchableOpacity>

      {/* Search */}
      <View style={[st.searchRow, { backgroundColor: inputBg, borderColor: border }]}>
        <Text style={{ fontSize: 16, marginRight: 8, color: sub }}>🔍</Text>
        <TextInput
          style={[st.searchInput, { color: tx }]}
          placeholder="Search name, @handle or number..."
          placeholderTextColor={sub}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={{ color: sub, fontSize: 18, paddingHorizontal: 8 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={[st.tabRow, { backgroundColor: card, borderBottomColor: border }]}>
        {[{ key: 'all', label: '📱 Contacts' }, { key: 'app', label: '🔒 On App' }, { key: 'frequent', label: '⭐ Frequent' }].map(t => (
          <TouchableOpacity key={t.key} style={[st.tab, tab === t.key && { borderBottomWidth: 2, borderBottomColor: accent }]} onPress={() => setTab(t.key)}>
            <Text style={[st.tabText, { color: tab === t.key ? accent : sub }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={st.loading}><ActivityIndicator color={accent} size="large" /></View>
      ) : filtered.length === 0 ? (
        <View style={st.empty}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>👤</Text>
          <Text style={[{ color: sub, fontSize: 15, marginBottom: 20 }]}>No contacts found</Text>
          <TouchableOpacity style={[st.createContactBtn, { backgroundColor: accent, borderColor: accent }]} onPress={() => setCreateModal(true)}>
            <Text style={{ color: '#000', fontWeight: '700' }}>Create a Contact</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, i) => item.id || item.phone || String(i)}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <View style={[st.contactRow, { borderBottomColor: border }]}>
              <Avatar contact={item} size={48} onPress={() => tapAvatar(item)} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={[st.contactName, { color: tx }]}>{item.name}</Text>
                {item.handle ? <Text style={[{ color: accent, fontSize: 12 }]}>@{item.handle}</Text> : null}
                <Text style={[st.contactPhone, { color: sub }]}>{item.phone}</Text>
              </View>
              <TouchableOpacity style={[st.callBtn, { backgroundColor: '#34C759' }]} onPress={() => makeCall(item.name, item.phone, 'voice')}>
                <Text style={{ fontSize: 18 }}>📞</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.callBtn, { backgroundColor: '#0057a8', marginLeft: 8 }]} onPress={() => makeCall(item.name, item.phone, 'video')}>
                <Text style={{ fontSize: 18 }}>📹</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* Create Contact Modal */}
      <CreateContactModal
        visible={createModal}
        onClose={() => setCreateModal(false)}
        onSave={(c) => { setContacts(prev => [c, ...prev]); }}
        accent={accent} bg={bg} card={card} tx={tx} sub={sub} border={border} inputBg={inputBg}
      />

      {/* Edit Contact Modal */}
      <EditContactModal
        visible={editModal}
        contact={editingContact}
        onClose={() => { setEditModal(false); setEditingContact(null); }}
        onSave={(updated) => {
          setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
          setEditingContact(null);
        }}
        accent={accent} bg={bg} card={card} tx={tx} sub={sub} border={border}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const cm = StyleSheet.create({
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:           { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '95%' },
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1 },
  title:           { fontSize: 17, fontWeight: '700' },
  avatarWrap:      { alignItems: 'center', paddingVertical: 24 },
  avatarImg:       { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder:{ width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  photoLabel:      { fontSize: 14, fontWeight: '600', marginTop: 10 },
  field:           { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 16, marginBottom: 10 },
  fieldLabel:      { fontSize: 11, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 },
  fieldInput:      { fontSize: 16, minHeight: 22 },
});

const st = StyleSheet.create({
  container:        { flex: 1 },
  header:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, gap: 8 },
  headerTitle:      { flex: 1, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  createContactBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginVertical: 12, padding: 14, borderRadius: 14, borderWidth: 1.5 },
  createContactTx:  { fontSize: 15, fontWeight: '700' },
  searchRow:        { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
  searchInput:      { flex: 1, fontSize: 15 },
  tabRow:           { flexDirection: 'row', borderBottomWidth: 1 },
  tab:              { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText:          { fontSize: 13, fontWeight: '600' },
  loading:          { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  empty:            { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  contactRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  contactName:      { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  contactPhone:     { fontSize: 13 },
  callBtn:          { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatar:           { borderRadius: 24 },
  avatarCircle:     { alignItems: 'center', justifyContent: 'center' },
  avatarText:       { color: '#fff', fontWeight: 'bold' },
});
