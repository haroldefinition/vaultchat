// ============================================================
//  EncryptionInfoScreen — "Your privacy is our priority"
//
//  Dedicated info screen reachable from:
//    - The 🔒 / "End-to-end encrypted" badge in any ChatRoom
//      (1:1 and group)
//    - Settings → Privacy & Security → "About End-to-end Encryption"
//
//  Pure content + reassurance. No actions other than back. The
//  "Learn more" link routes to the Privacy Policy screen for the
//  full long-form data-handling story.
//
//  Why dedicated: the lock badge in chats says "End-to-end
//  encrypted" but doesn't explain what that means. A 30-second
//  read of this screen translates into trust signal for users
//  evaluating switching from iMessage/Signal/etc.
// ============================================================

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { ChevronLeft, Shield } from 'lucide-react-native';
import { useTheme } from '../services/theme';

export default function EncryptionInfoScreen({ navigation }) {
  const { bg, card, tx, sub, border, accent, isPremium, gold } = useTheme();
  const brand = isPremium ? '#7C3AED' : accent;

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[s.header, { borderBottomColor: 'transparent' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft size={26} color={brand} />
        </TouchableOpacity>
        <View style={s.headerTitleRow}>
          <Text style={[s.headerTitle, { color: tx }]}>End-to-end Encrypted</Text>
          {isPremium && <Text style={s.headerCrown}>👑</Text>}
        </View>
        <View style={s.backBtn} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Hero shield — radial-glow effect via stacked circles */}
        <View style={s.shieldStage}>
          <View style={[s.shieldRingOuter, { borderColor: brand + '22' }]} />
          <View style={[s.shieldRingMid, { borderColor: brand + '44' }]} />
          <View style={[s.shieldCore, { backgroundColor: brand + '22', borderColor: brand + '88' }]}>
            <Shield size={56} color={brand} strokeWidth={2.2} />
          </View>
        </View>

        <Text style={[s.title, { color: tx }]}>Your privacy is our priority</Text>

        <Text style={[s.body, { color: sub }]}>
          All messages and calls are protected with end-to-end encryption. Only you and the intended recipient can access them.
        </Text>

        {/* Three quick reassurance points — keeps the page from
            feeling like a one-liner. Each line maps to a real
            property of the implementation, not marketing fluff. */}
        <View style={[s.bulletCard, { backgroundColor: card, borderColor: border }]}>
          <Bullet
            icon="🔐"
            title="Messages stay on your devices"
            body="Your encryption keys live on your phone. Even VaultChat servers cannot read your messages."
            tx={tx} sub={sub}
          />
          <Divider color={border} />
          <Bullet
            icon="🔄"
            title="Forward secrecy"
            body="Each message uses a fresh key. Even if a key is later compromised, past messages stay sealed."
            tx={tx} sub={sub}
          />
          <Divider color={border} />
          <Bullet
            icon="🛡️"
            title="Verified delivery"
            body="Calls and messages are authenticated end-to-end. No one in the middle can tamper with them."
            tx={tx} sub={sub}
          />
        </View>

        {/* Learn more link — routes into the long-form Privacy Policy
            for users who want the full legal/technical breakdown. */}
        <TouchableOpacity
          style={s.learnMore}
          onPress={() => navigation.navigate('PrivacyPolicy')}>
          <Text style={[s.learnMoreTx, { color: brand }]}>Learn more about VaultChat security</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Bullet({ icon, title, body, tx, sub }) {
  return (
    <View style={s.bulletRow}>
      <Text style={s.bulletIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[s.bulletTitle, { color: tx }]}>{title}</Text>
        <Text style={[s.bulletBody,  { color: sub }]}>{body}</Text>
      </View>
    </View>
  );
}

function Divider({ color }) {
  return <View style={[s.divider, { backgroundColor: color }]} />;
}

const s = StyleSheet.create({
  container:        { flex: 1 },

  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12 },
  backBtn:          { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitleRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle:      { fontSize: 16, fontWeight: '700' },
  headerCrown:      { fontSize: 16 },

  scroll:           { paddingHorizontal: 24, paddingBottom: 40 },

  shieldStage:      { alignItems: 'center', justifyContent: 'center', height: 200, marginTop: 12, marginBottom: 24, position: 'relative' },
  shieldRingOuter:  { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 1 },
  shieldRingMid:    { position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 1.5 },
  shieldCore:       { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },

  title:            { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  body:             { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 28, paddingHorizontal: 8 },

  bulletCard:       { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 22 },
  bulletRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 14 },
  bulletIcon:       { fontSize: 22, width: 30, textAlign: 'center', marginTop: 2 },
  bulletTitle:      { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  bulletBody:       { fontSize: 12, lineHeight: 17 },
  divider:          { height: StyleSheet.hairlineWidth, marginLeft: 44 },

  learnMore:        { alignItems: 'center', paddingVertical: 8 },
  learnMoreTx:      { fontSize: 14, fontWeight: '700' },
});
