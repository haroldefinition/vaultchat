// ContactEditModal — universal edit form used across all screens
// Covers: profile photo, firstName, lastName, mobile, email,
//         address, birthday, URL, notes
import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Image, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveContact } from '../services/contactsSync';

export default function ContactEditModal({ visible, contact, onClose, onSave, colors = {} }) {
  const {
    bg      = '#080b12',
    card    = '#0e1220',
    tx      = '#ffffff',
    sub     = '#888888',
    border  = '#1a2035',
    inputBg = '#141828',
    accent  = '#00C2A8',
  } = colors;

  const [photo,     setPhoto]     = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [mobile,    setMobile]    = useState('');
  const [email,     setEmail]     = useState('');
  const [address,   setAddress]   = useState('');
  const [birthday,  setBirthday]  = useState('');
  const [url,       setUrl]       = useState('');
  const [notes,     setNotes]     = useState('');

  // Populate fields when contact changes
  useEffect(() => {
    if (contact) {
      setPhoto(contact.photo     || null);
      setFirstName(contact.firstName || contact.name?.split(' ')[0] || '');
      setLastName(contact.lastName   || contact.name?.split(' ').slice(1).join(' ') || '');
      setMobile(contact.phone    || contact.mobile || '');
      setEmail(contact.email     || '');
      setAddress(contact.address || '');
      setBirthday(contact.birthday || '');
      setUrl(contact.url         || '');
      setNotes(contact.notes     || '');
    }
  }, [contact, visible]);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images', quality: 0.85, allowsEditing: true, aspect: [1, 1],
    });
    if (!result.canceled && result.assets?.[0]) setPhoto(result.assets[0].uri);
  }

  function handleSave() {
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const updated  = {
      ...contact,
      photo,
      firstName: firstName.trim(),
      lastName:  lastName.trim(),
      name:      fullName || mobile,
      phone:     mobile.trim(),
      mobile:    mobile.trim(),
      email:     email.trim(),
      address:   address.trim(),
      birthday:  birthday.trim(),
      url:       url.trim(),
      notes:     notes.trim(),
    };
    // Save to AsyncStorage + Supabase via sync service
    saveContact(updated).catch(() => {});
    onSave && onSave(updated);
    onClose();
  }

  const FIELDS = [
    { label: 'First Name',   val: firstName, set: setFirstName, kb: 'default',       multi: false },
    { label: 'Last Name',    val: lastName,  set: setLastName,  kb: 'default',       multi: false },
    { label: 'Mobile',       val: mobile,    set: setMobile,    kb: 'phone-pad',     multi: false },
    { label: 'Email',        val: email,     set: setEmail,     kb: 'email-address', multi: false },
    { label: 'Address',      val: address,   set: setAddress,   kb: 'default',       multi: true  },
    { label: 'Birthday',     val: birthday,  set: setBirthday,  kb: 'default',       multi: false },
    { label: 'URL',          val: url,       set: setUrl,       kb: 'url',           multi: false },
    { label: 'Notes',        val: notes,     set: setNotes,     kb: 'default',       multi: true  },
  ];

  const initial = (firstName?.[0] || lastName?.[0] || '?').toUpperCase();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[s.overlay]}>
        <View style={[s.sheet, { backgroundColor: bg }]}>
          {/* Header */}
          <View style={[s.header, { borderBottomColor: border }]}>
            <TouchableOpacity onPress={onClose} style={s.headerBtn}>
              <Text style={{ color: sub, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: tx }]}>Edit Contact</Text>
            <TouchableOpacity onPress={handleSave} style={s.headerBtn}>
              <Text style={{ color: accent, fontWeight: '700', fontSize: 16 }}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled">
            {/* Avatar */}
            <TouchableOpacity onPress={pickPhoto} style={s.avatarWrap}>
              {photo
                ? <Image source={{ uri: photo }} style={s.avatarImg} />
                : <View style={[s.avatarPlaceholder, { backgroundColor: accent + '33' }]}>
                    <Text style={{ fontSize: 40, color: tx, fontWeight: '700' }}>{initial}</Text>
                  </View>
              }
              <View style={[s.cameraOverlay, { backgroundColor: accent }]}>
                <Text style={{ fontSize: 14 }}>📷</Text>
              </View>
              <Text style={[s.photoHint, { color: accent }]}>
                {photo ? 'Change Photo' : 'Add Photo'}
              </Text>
            </TouchableOpacity>

            {/* Fields */}
            {FIELDS.map(({ label, val, set, kb, multi }) => (
              <View key={label} style={[s.field, { backgroundColor: card, borderColor: border }]}>
                <Text style={[s.fieldLabel, { color: sub }]}>{label.toUpperCase()}</Text>
                <TextInput
                  style={[s.fieldInput, { color: tx }, multi && { minHeight: 60 }]}
                  value={val}
                  onChangeText={set}
                  keyboardType={kb}
                  autoCapitalize={kb === 'default' ? 'words' : 'none'}
                  multiline={multi}
                  placeholder={label}
                  placeholderTextColor={sub + '88'}
                  returnKeyType={multi ? 'default' : 'next'}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:           { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '95%' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn:       { minWidth: 60 },
  headerTitle:     { fontSize: 17, fontWeight: '700' },
  avatarWrap:      { alignItems: 'center', paddingVertical: 28, position: 'relative' },
  avatarImg:       { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder:{ width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  cameraOverlay:   { position: 'absolute', bottom: 36, right: '34%', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  photoHint:       { fontSize: 13, fontWeight: '600', marginTop: 8 },
  field:           { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 16, marginBottom: 10 },
  fieldLabel:      { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 5 },
  fieldInput:      { fontSize: 16, lineHeight: 22 },
});
