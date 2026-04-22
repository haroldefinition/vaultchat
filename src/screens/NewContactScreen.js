import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveContact } from '../services/contactsSync';
import { useTheme } from '../services/theme';

export default function NewContactScreen({ route, navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  // Safe destructure — route.params may be undefined
  const { onSave } = route?.params || {};

  const [photo,     setPhoto]     = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [mobile,    setMobile]    = useState('');
  const [email,     setEmail]     = useState('');
  const [address,   setAddress]   = useState('');
  const [birthday,  setBirthday]  = useState('');
  const [url,       setUrl]       = useState('');
  const [notes,     setNotes]     = useState('');
  const [loading,   setLoading]   = useState(false);

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 1,
    });
    if (!result.canceled && result.assets?.[0]) setPhoto(result.assets[0].uri);
  }

  async function saveContact() {
    if (!firstName.trim() && !mobile.trim()) {
      Alert.alert('Required', 'Enter at least a first name or phone number.');
      return;
    }
    setLoading(true);
    const contact = {
      id:        `contact_${Date.now()}`,
      photo,
      firstName: firstName.trim(),
      lastName:  lastName.trim(),
      name:      `${firstName.trim()} ${lastName.trim()}`.trim() || mobile,
      phone:     mobile.replace(/\D/g, ''),
      mobile:    mobile.replace(/\D/g, ''),
      email:     email.trim(),
      address:   address.trim(),
      birthday:  birthday.trim(),
      url:       url.trim(),
      notes:     notes.trim(),
    };
    // Save to AsyncStorage + Supabase via sync service
    try { await saveContact(contact); } catch {}

    // Notify caller if a callback was provided
    if (typeof onSave === 'function') onSave(contact);

    Alert.alert('Saved!', `${contact.name} has been added to your contacts.`, [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
    setLoading(false);
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

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerBtn}>
          <Text style={[s.cancelTx, { color: sub }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tx }]}>New Contact</Text>
        <TouchableOpacity onPress={saveContact} disabled={loading} style={s.headerBtn}>
          {loading
            ? <ActivityIndicator color={accent} size="small" />
            : <Text style={[s.doneTx, { color: accent }]}>Done</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled">

        {/* Photo picker */}
        <TouchableOpacity onPress={pickPhoto} style={s.photoWrap}>
          {photo
            ? <Image source={{ uri: photo }} style={s.photo} />
            : <View style={[s.photoPlaceholder, { backgroundColor: accent + '22' }]}>
                <Text style={{ fontSize: 38 }}>📷</Text>
              </View>
          }
          <Text style={[s.photoHint, { color: accent }]}>
            {photo ? 'Change Photo' : 'Add Photo'}
          </Text>
        </TouchableOpacity>

        {/* Fields */}
        {FIELDS.map(({ label, val, set, kb, multi }) => (
          <View key={label} style={[s.field, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.fieldLabel, { color: sub }]}>{label.toUpperCase()}</Text>
            <TextInput
              style={[s.fieldInput, { color: tx }, multi && { minHeight: 60, textAlignVertical: 'top' }]}
              value={val}
              onChangeText={set}
              keyboardType={kb}
              autoCapitalize={kb === 'default' ? 'words' : 'none'}
              multiline={multi}
              placeholder={`Add ${label.toLowerCase()}…`}
              placeholderTextColor={sub + '88'}
              returnKeyType={multi ? 'default' : 'next'}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1 },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn:        { minWidth: 60 },
  headerTitle:      { fontSize: 17, fontWeight: '700' },
  cancelTx:         { fontSize: 16 },
  doneTx:           { fontSize: 16, fontWeight: '700' },
  scroll:           { paddingBottom: 48 },
  photoWrap:        { alignItems: 'center', paddingVertical: 28 },
  photo:            { width: 100, height: 100, borderRadius: 50 },
  photoPlaceholder: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  photoHint:        { fontSize: 14, fontWeight: '600', marginTop: 10 },
  field:            { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 16, marginBottom: 10 },
  fieldLabel:       { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 5 },
  fieldInput:       { fontSize: 16, lineHeight: 22 },
});
