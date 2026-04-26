// ============================================================
//  ContactViewScreen — full contact profile (mockup parity)
//
//  Layout:
//    ┌──────────────────────────────────────────┐
//    │ ‹  Contact                          Edit │
//    │                                          │
//    │            ┌──────────┐                  │
//    │            │  AVATAR  │   ✓ verified     │  hero card
//    │            └──────────┘                  │
//    │              Alice Park 👑               │
//    │              +1 (555) 010-3344           │
//    │              @alice                      │
//    │       🔒  End-to-end encrypted           │
//    │                                          │
//    │  ┌────┬────┬────┬────┐                    │
//    │  │💬  │📞  │📹  │•••│                     │  action grid
//    │  │Msg │Call│Vid │More│                    │
//    │  └────┴────┴────┴────┘                    │
//    │                                          │
//    │  PRIVACY                                 │
//    │  ┌──────────────────────────────────┐    │
//    │  │ 🛡  End-to-end encrypted         │    │
//    │  │ 👁  Last seen: hidden            │    │
//    │  │ 🛎  Notifications: on            │    │
//    │  └──────────────────────────────────┘    │
//    │                                          │
//    │  CONTACT INFO                            │
//    │  ┌──────────────────────────────────┐    │
//    │  │ 📱 Mobile     +1 (555) 010-3344  │    │
//    │  │ ✉️ Email      alice@example.com  │    │
//    │  │ 🎂 Birthday   March 14           │    │
//    │  └──────────────────────────────────┘    │
//    │                                          │
//    │  [ 🚫 Block Contact  ]                    │
//    │  [ 🗑 Remove Contact ]                   │
//    └──────────────────────────────────────────┘
//
//  Premium peers get a verified shield badge tucked next to the
//  avatar (gold/accent ring + ✓), the crown next to their name,
//  and a "Premium Member" tagline above the action grid. Free
//  contacts skip those bits without leaving an obvious gap.
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import ContactEditModal from '../components/ContactEditModal';
import { placeCall } from '../services/placeCall';
import { displayHandle } from '../services/vaultHandle';
import { isUserPremiumByPhone, isUserPremium } from '../services/premiumStatus';
import { blockUser, unblockUser, isBlockedSync, hydrateBlocks } from '../services/blocks';
import PremiumCrown from '../components/PremiumCrown';

// Single-line action tile in the 4-up action grid.
function ActionTile({ icon, label, onPress, accent, card, tx, danger }) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[s.actionTile, { backgroundColor: card, borderColor: danger ? '#ff3b3033' : accent + '33' }]}>
      <View style={[s.actionIconCircle, { backgroundColor: danger ? '#ff3b3022' : accent + '22' }]}>
        <Text style={{ fontSize: 22 }}>{icon}</Text>
      </View>
      <Text style={[s.actionLabel, { color: danger ? '#ff3b30' : tx }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ContactViewScreen({ route, navigation }) {
  const { contact: initialContact } = route.params || {};
  // gold comes from theme.js premium polish — used for the verified
  // ring + badge so the color stays consistent with other premium
  // surfaces (Vault hero, Premium Contacts header).
  const { bg, card, tx, sub, border, accent, gold } = useTheme();

  const [contact,   setContact]   = useState(initialContact || {});
  const [editOpen,  setEditOpen]  = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [blocked,   setBlocked]   = useState(false);

  // Refresh contact from local cache + premium-check on mount.
  useEffect(() => {
    AsyncStorage.getItem('vaultchat_contacts').then(raw => {
      if (!raw) return;
      const list = JSON.parse(raw);
      const found = list.find(c => c.id === initialContact?.id || c.phone === initialContact?.phone);
      if (found) setContact(found);
    }).catch(() => {});

    // Resolve premium status — prefer userId if present, otherwise
    // phone. Result drives the verified shield + "Premium Member"
    // tagline + crown.
    const userId = initialContact?.id || initialContact?.user_id;
    const phone  = initialContact?.phone || initialContact?.mobile;
    (async () => {
      try {
        if (userId) setIsPremium(await isUserPremium(userId));
        else if (phone) setIsPremium(await isUserPremiumByPhone(phone));
      } catch {}
    })();

    // Block-state hydration so we know whether to show "Block" or
    // "Unblock". hydrateBlocks() repopulates from Supabase; the
    // sync helper reads the in-memory cache afterwards.
    (async () => {
      try {
        await hydrateBlocks();
        if (userId) setBlocked(isBlockedSync(userId));
      } catch {}
    })();
  }, []);

  const name    = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.name || contact.phone || 'Unknown';
  const initial = name[0]?.toUpperCase() || '?';

  const INFO_ROWS = [
    { icon: '📱', label: 'Mobile',   val: contact.phone    || contact.mobile },
    { icon: '✉️', label: 'Email',    val: contact.email   },
    { icon: '📍', label: 'Address',  val: contact.address  },
    { icon: '🎂', label: 'Birthday', val: contact.birthday },
    { icon: '🔗', label: 'URL',      val: contact.url      },
    { icon: '📝', label: 'Notes',    val: contact.notes    },
  ].filter(r => r.val && String(r.val).trim());

  const PRIVACY_ROWS = [
    { icon: '🛡', label: 'End-to-end encrypted', val: 'NaCl Box' },
    { icon: '🔑', label: 'Verified identity',    val: isPremium ? 'Premium' : 'Standard' },
    { icon: '🔕', label: 'Disappearing messages', val: 'Off' },
  ];

  function callContact() {
    const num = contact.phone || contact.mobile;
    if (!num) { Alert.alert('No phone number'); return; }
    placeCall({ navigation, recipientName: name, recipientPhone: num, type: 'voice' });
  }

  function videoCallContact() {
    const num = contact.phone || contact.mobile;
    if (!num) { Alert.alert('No phone number'); return; }
    placeCall({ navigation, recipientName: name, recipientPhone: num, type: 'video' });
  }

  function messageContact() {
    const num    = contact.phone || contact.mobile;
    const roomId = `dm_${[num, 'me'].sort().join('_')}`;
    navigation.navigate('ChatRoom', {
      roomId, recipientPhone: num, recipientName: name, recipientPhoto: contact.photo,
    });
  }

  function openUrl() {
    if (contact.url) Linking.openURL(contact.url.startsWith('http') ? contact.url : `https://${contact.url}`);
  }

  function showMore() {
    // Lightweight "More" sheet via Alert — covers Share, Copy, Mute
    // without dragging in another modal component.
    Alert.alert(
      name,
      undefined,
      [
        { text: 'Share Contact',   onPress: () => Alert.alert('Coming soon', 'Sharing contact cards is on the roadmap.') },
        { text: 'Copy Phone',      onPress: () => Alert.alert('Copied', contact.phone || contact.mobile || 'no phone') },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }

  async function toggleBlock() {
    const userId = contact.id || contact.user_id;
    if (!userId) {
      Alert.alert('Cannot block', 'This contact does not have a VaultChat account yet.');
      return;
    }
    if (blocked) {
      await unblockUser(userId).catch(() => {});
      setBlocked(false);
      return;
    }
    Alert.alert(
      `Block ${name}?`,
      'They won’t be able to message or call you. You can unblock at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: async () => {
          await blockUser(userId).catch(() => {});
          setBlocked(true);
        }},
      ],
    );
  }

  function removeContact() {
    Alert.alert('Remove Contact', `Remove ${name} from your contacts?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const raw  = await AsyncStorage.getItem('vaultchat_contacts');
        const list = raw ? JSON.parse(raw) : [];
        await AsyncStorage.setItem('vaultchat_contacts', JSON.stringify(
          list.filter(c => c.id !== contact.id && c.phone !== contact.phone)
        ));
        navigation.goBack();
      }},
    ]);
  }

  // Verified ring tint + glow only show for premium peers. The
  // gold token is supplied by the theme service so it stays in
  // sync with the rest of the premium polish (Vault hero, Premium
  // Contacts header).
  const ringColor = isPremium ? gold : accent + '55';

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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Hero — avatar with verified ring, name + crown, phone, handle, E2E pill */}
        <View style={s.heroSection}>
          <View style={[s.avatarRing, { borderColor: ringColor }]}>
            {contact.photo
              ? <Image source={{ uri: contact.photo }} style={s.avatar} />
              : <View style={[s.avatarPlaceholder, { backgroundColor: accent + '33' }]}>
                  <Text style={[s.avatarInitial, { color: accent }]}>{initial}</Text>
                </View>
            }
            {isPremium && (
              <View style={[s.verifiedBadge, { backgroundColor: gold, borderColor: bg }]}>
                <Text style={s.verifiedTx}>✓</Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14 }}>
            <Text style={[s.name, { color: tx }]}>{name}</Text>
            <PremiumCrown isPremium={isPremium} size={20} />
          </View>

          {isPremium && (
            <Text style={[s.premiumTag, { color: gold }]}>PREMIUM MEMBER</Text>
          )}

          {contact.phone ? (
            <Text style={[s.phone, { color: sub }]}>{contact.phone}</Text>
          ) : null}
          {contact.handle ? (
            <Text style={[s.handle, { color: accent }]}>{displayHandle(contact.handle)}</Text>
          ) : null}

          {/* E2E pill */}
          <View style={[s.e2ePill, { backgroundColor: accent + '18', borderColor: accent + '44' }]}>
            <Text style={{ fontSize: 12 }}>🔒</Text>
            <Text style={[s.e2eTx, { color: accent }]}>End-to-end encrypted</Text>
          </View>
        </View>

        {/* Action grid */}
        <View style={s.actionGrid}>
          <ActionTile icon="💬"  label="Message" onPress={messageContact}  accent={accent} card={card} tx={tx} />
          <ActionTile icon="📞"  label="Call"    onPress={callContact}     accent={accent} card={card} tx={tx} />
          <ActionTile icon="📹"  label="Video"   onPress={videoCallContact} accent={accent} card={card} tx={tx} />
          <ActionTile icon="•••" label="More"    onPress={showMore}        accent={accent} card={card} tx={tx} />
        </View>

        {/* Privacy block */}
        <Text style={[s.sectionLabel, { color: sub }]}>PRIVACY</Text>
        <View style={[s.infoCard, { backgroundColor: card, borderColor: border }]}>
          {PRIVACY_ROWS.map((row, i) => (
            <View
              key={row.label}
              style={[s.infoRow, i < PRIVACY_ROWS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }]}>
              <Text style={s.infoIcon}>{row.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.infoLabel, { color: sub }]}>{row.label}</Text>
                <Text style={[s.infoVal, { color: tx }]}>{row.val}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Contact info */}
        {INFO_ROWS.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { color: sub }]}>CONTACT INFO</Text>
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
          </>
        )}

        {/* Block / Remove */}
        <TouchableOpacity
          onPress={toggleBlock}
          style={[s.dangerBtn, { borderColor: '#ff3b3044', backgroundColor: '#ff3b3011' }]}>
          <Text style={{ color: '#ff3b30', fontWeight: '700', fontSize: 15 }}>
            {blocked ? '✓ Unblock Contact' : '🚫 Block Contact'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={removeContact}
          style={[s.dangerBtn, { borderColor: '#ff3b3044', backgroundColor: '#ff3b3011' }]}>
          <Text style={{ color: '#ff3b30', fontWeight: '700', fontSize: 15 }}>🗑  Remove Contact</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit modal */}
      <ContactEditModal
        visible={editOpen}
        contact={contact}
        onClose={() => setEditOpen(false)}
        onSave={(updated) => { setContact(updated); setEditOpen(false); }}
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

  heroSection:       { alignItems: 'center', paddingTop: 30, paddingBottom: 18 },
  // Ring sits flush against the avatar — the purple fill goes
  // edge-to-edge inside the gold border with no inner padding gap.
  // Avatar size = ring outer minus 2× border width, so the two
  // circles touch perfectly regardless of theme.
  avatarRing:        { width: 124, height: 124, borderRadius: 62, borderWidth: 3, padding: 0, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatar:            { width: 118, height: 118, borderRadius: 59 },
  avatarPlaceholder: { width: 118, height: 118, borderRadius: 59, alignItems: 'center', justifyContent: 'center' },
  avatarInitial:     { fontSize: 46, fontWeight: '700' },
  verifiedBadge:     { position: 'absolute', right: 0, bottom: 4, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  verifiedTx:        { color: '#1A1A1A', fontWeight: '900', fontSize: 14 },
  name:              { fontSize: 26, fontWeight: '800' },
  premiumTag:        { fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 4 },
  phone:             { fontSize: 15, marginTop: 6 },
  handle:            { fontSize: 14, fontWeight: '600', marginTop: 4 },
  e2ePill:           { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, marginTop: 12 },
  e2eTx:             { fontSize: 12, fontWeight: '700' },

  actionGrid:        { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 14, marginBottom: 24 },
  actionTile:        { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 18, borderWidth: 1, gap: 8 },
  actionIconCircle:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  actionLabel:       { fontSize: 12, fontWeight: '700' },

  sectionLabel:      { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginHorizontal: 22, marginBottom: 8, marginTop: 4 },
  infoCard:          { marginHorizontal: 16, borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 22 },
  infoRow:           { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  infoIcon:          { fontSize: 20, width: 28, textAlign: 'center' },
  infoLabel:         { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  infoVal:           { fontSize: 15, fontWeight: '500' },

  dangerBtn:         { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'center' },
});
