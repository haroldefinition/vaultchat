// ContactViewScreen — view a contact's full profile
// Tap Edit → ContactEditModal opens on the same screen
import React, { useState, useEffect } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import ContactEditModal from '../components/ContactEditModal';

export default function ContactViewScreen({ route, navigation }) {
  const { contact: initialContact } = route.params || {};
  const { bg, card, tx, sub, border, accent } = useTheme();

  const [contact,  setContact]  = useState(initialContact || {});
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    // Load freshest version from AsyncStorage
    AsyncStorage.getItem('vaultchat_contacts').then(raw => {
      if (!raw) return;
      const list = JSON.parse(raw);
      const found = list.find(c => c.id === initialContact?.id || c.phone === initialContact?.phone);
      if (found) setContact(found);
    }).catch(() => {});
  }, []);

  const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.name || contact.phone || 'Unknown';
  const initial = name[0]?.toUpperCase() || '?';

  const INFO_ROWS = [
    { icon: '📱', label: 'Mobile',   val: contact.phone    || contact.mobile },
    { icon: '✉️', label: 'Email',    val: contact.email   },
    { icon: '📍', label: 'Address',  val: contact.address  },
    { icon: '🎂', label: 'Birthday', val: contact.birthday },
    { icon: '🔗', label: 'URL',      val: contact.url      },
    { icon: '📝', label: 'Notes',    val: contact.notes    },
  ].filter(r => r.val && r.val.trim());

  function callContact() {
    const num = contact.phone || contact.mobile;
    if (!num) { Alert.alert('No phone number'); return; }
    navigation.navigate('ActiveCall', {
      recipientName: name, recipientPhone: num, callType: 'voice',
    });
  }

  function messageContact() {
    const num   = contact.phone || contact.mobile;
    const roomId = `dm_${[num, 'me'].sort().join('_')}`;
    navigation.navigate('ChatRoom', {
      roomId, recipientPhone: num, recipientName: name, recipientPhoto: contact.photo,
    });
  }

  function openUrl() {
    if (contact.url) Linking.openURL(contact.url.startsWith('http') ? contact.url : `https://${contact.url}`);
  }

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={[s.backTx, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tx }]}>Contact</Text>
        <TouchableOpacity onPress={() => setEditOpen(true)} style={s.editBtn}>
          <Text style={[s.editTx, { color: accent }]}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Avatar */}
        <View style={s.avatarSection}>
          {contact.photo
            ? <Image source={{ uri: contact.photo }} style={s.avatar} />
            : <View style={[s.avatarPlaceholder, { backgroundColor: accent + '33' }]}>
                <Text style={[s.avatarInitial, { color: accent }]}>{initial}</Text>
              </View>
          }
          <Text style={[s.name, { color: tx }]}>{name}</Text>
          {contact.phone && (
            <Text style={[s.phone, { color: sub }]}>{contact.phone}</Text>
          )}
          {contact.handle && (
            <Text style={[s.handle, { color: accent }]}>@{contact.handle}</Text>
          )}
        </View>

        {/* Action buttons */}
        <View style={[s.actions, { borderColor: border }]}>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: card }]} onPress={messageContact}>
            <Text style={{ fontSize: 24 }}>💬</Text>
            <Text style={[s.actionLabel, { color: tx }]}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: card }]} onPress={callContact}>
            <Text style={{ fontSize: 24 }}>📞</Text>
            <Text style={[s.actionLabel, { color: tx }]}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: card }]}
            onPress={() => navigation.navigate('ActiveCall', { recipientName: name, recipientPhone: contact.phone, callType: 'video' })}>
            <Text style={{ fontSize: 24 }}>📹</Text>
            <Text style={[s.actionLabel, { color: tx }]}>Video</Text>
          </TouchableOpacity>
        </View>

        {/* Info rows */}
        {INFO_ROWS.length > 0 && (
          <View style={[s.infoCard, { backgroundColor: card, borderColor: border }]}>
            {INFO_ROWS.map((row, i) => (
              <TouchableOpacity
                key={row.label}
                style={[s.infoRow, i < INFO_ROWS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }]}
                onPress={row.label === 'URL' ? openUrl : undefined}
                activeOpacity={row.label === 'URL' ? 0.6 : 1}>
                <Text style={s.infoIcon}>{row.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.infoLabel, { color: sub }]}>{row.label}</Text>
                  <Text style={[s.infoVal, { color: row.label === 'URL' ? accent : tx }]}>{row.val}</Text>
                </View>
                {row.label === 'URL' && <Text style={{ color: accent, fontSize: 14 }}>›</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Danger zone */}
        <TouchableOpacity style={[s.deleteBtn, { borderColor: '#ff3b3044', backgroundColor: '#ff3b3011' }]}
          onPress={() => Alert.alert('Remove Contact', `Remove ${name} from your contacts?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: async () => {
              const raw  = await AsyncStorage.getItem('vaultchat_contacts');
              const list = raw ? JSON.parse(raw) : [];
              await AsyncStorage.setItem('vaultchat_contacts', JSON.stringify(
                list.filter(c => c.id !== contact.id && c.phone !== contact.phone)
              ));
              navigation.goBack();
            }},
          ])}>
          <Text style={{ color: '#ff3b30', fontWeight: '600', fontSize: 15 }}>Remove Contact</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit modal */}
      <ContactEditModal
        visible={editOpen}
        contact={contact}
        onClose={() => setEditOpen(false)}
        onSave={(updated) => {
          setContact(updated);
          setEditOpen(false);
        }}
        colors={{ bg, card, tx, sub, border, accent }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:         { flex: 1 },
  header:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:           { padding: 4, marginRight: 8 },
  backTx:            { fontSize: 30, fontWeight: 'bold' },
  headerTitle:       { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  editBtn:           { padding: 4 },
  editTx:            { fontSize: 16, fontWeight: '600' },
  avatarSection:     { alignItems: 'center', paddingTop: 32, paddingBottom: 24 },
  avatar:            { width: 110, height: 110, borderRadius: 55, marginBottom: 16 },
  avatarPlaceholder: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  avatarInitial:     { fontSize: 46, fontWeight: '700' },
  name:              { fontSize: 26, fontWeight: '800', marginBottom: 6 },
  phone:             { fontSize: 15, marginBottom: 4 },
  handle:            { fontSize: 14, fontWeight: '600' },
  actions:           { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: 16, marginBottom: 24, borderRadius: 20, borderWidth: 1, padding: 16 },
  actionBtn:         { alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 16, minWidth: 80 },
  actionLabel:       { fontSize: 12, fontWeight: '600' },
  infoCard:          { marginHorizontal: 16, borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 24 },
  infoRow:           { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  infoIcon:          { fontSize: 20, width: 28, textAlign: 'center' },
  infoLabel:         { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  infoVal:           { fontSize: 15, fontWeight: '500' },
  deleteBtn:         { marginHorizontal: 16, marginBottom: 40, borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'center' },
});
