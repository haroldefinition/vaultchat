import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const BACKEND = 'https://vaultchat-production-3a96.up.railway.app';

export default function NewContactScreen({ route, navigation }) {
  const { user, phone, onSave } = route.params;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(false);

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  }

  async function saveContact() {
    setLoading(true);
    const name = nickname || `${firstName} ${lastName}`.trim();
    try {
      await fetch(`${BACKEND}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: user?.id, phone: `1${phone}`, first_name: firstName, last_name: lastName, nickname: name }),
      });
    } catch (err) {}

    if (onSave) onSave(name, photo);
    
    const roomId = '550e8400-e29b-41d4-a716-446655440000';
    navigation.replace('ChatRoom', { roomId, recipientPhone: phone, recipientName: name, recipientPhoto: photo, user });
    setLoading(false);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Contact</Text>
        <TouchableOpacity onPress={saveContact} disabled={loading}>
          {loading ? <ActivityIndicator color="#00ffa3" /> : <Text style={styles.doneText}>Done</Text>}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.photoContainer} onPress={pickPhoto}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoIcon}>📷</Text>
            <Text style={styles.photoText}>Add Photo</Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.section}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Phone</Text>
          <Text style={styles.fieldValue}>+1{phone}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>First Name</Text>
          <TextInput style={styles.fieldInput} placeholder="First name" placeholderTextColor="#555" value={firstName} onChangeText={setFirstName} />
        </View>
        <View style={[styles.field, styles.fieldBorder]}>
          <Text style={styles.fieldLabel}>Last Name</Text>
          <TextInput style={styles.fieldInput} placeholder="Last name" placeholderTextColor="#555" value={lastName} onChangeText={setLastName} />
        </View>
        <View style={[styles.field, styles.fieldBorder]}>
          <Text style={styles.fieldLabel}>Nickname</Text>
          <TextInput style={styles.fieldInput} placeholder="Nickname (optional)" placeholderTextColor="#555" value={nickname} onChangeText={setNickname} />
        </View>
      </View>

      <TouchableOpacity style={styles.startChatBtn} onPress={saveContact} disabled={loading}>
        <Text style={styles.startChatText}>💬 Start Secure Chat</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080b12' },
  content: { paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 60 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  cancelText: { color: '#888', fontSize: 15 },
  doneText: { color: '#00ffa3', fontSize: 15, fontWeight: 'bold' },
  photoContainer: { alignItems: 'center', marginVertical: 24 },
  photo: { width: 100, height: 100, borderRadius: 50 },
  photoPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#0e1220', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#00ffa3', borderStyle: 'dashed' },
  photoIcon: { fontSize: 28 },
  photoText: { color: '#00ffa3', fontSize: 11, marginTop: 4 },
  section: { backgroundColor: '#0e1220', marginHorizontal: 16, borderRadius: 16, marginBottom: 16, overflow: 'hidden' },
  field: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  fieldBorder: { borderTopWidth: 1, borderTopColor: '#141828' },
  fieldLabel: { color: '#00ffa3', width: 90, fontSize: 14 },
  fieldValue: { color: '#fff', fontSize: 15 },
  fieldInput: { flex: 1, color: '#fff', fontSize: 15 },
  startChatBtn: { backgroundColor: '#00ffa3', margin: 16, padding: 16, borderRadius: 16, alignItems: 'center' },
  startChatText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
});
