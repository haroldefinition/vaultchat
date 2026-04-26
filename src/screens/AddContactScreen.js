// ============================================================
//  AddContactScreen — full-screen "Add Secure Contact" picker
//
//  Layout (matches Harold's mockup):
//
//    ┌────────────────────────────────────────────┐
//    │   New Contact                  Cancel      │
//    │                                            │
//    │             ┌────────────┐                 │
//    │             │   PURPLE   │                 │  hero icon
//    │             │   GRADIENT │                 │
//    │             │   👤+      │                 │
//    │             └────────────┘                 │
//    │                                            │
//    │          Add Secure Contact                │  title
//    │   Add a new contact to VaultChat           │  subtitle
//    │       using a secure method.               │
//    │                                            │
//    │  ┌──────────────────────────────────────┐  │
//    │  │ 👥  Add from Contacts                │  │
//    │  │     Add someone from your phone…     │  │
//    │  └──────────────────────────────────────┘  │
//    │  ┌──────────────────────────────────────┐  │
//    │  │ @  Invite via Username               │  │
//    │  │    Connect using a unique handle     │  │
//    │  └──────────────────────────────────────┘  │
//    │  ┌──────────────────────────────────────┐  │
//    │  │ 🔗 Share Invite Link                 │  │
//    │  │    Share your secure invite link…    │  │
//    │  └──────────────────────────────────────┘  │
//    │  ┌──────────────────────────────────────┐  │
//    │  │ ▦  Scan QR Code                      │  │
//    │  │    Scan a QR code to add securely    │  │
//    │  └──────────────────────────────────────┘  │
//    └────────────────────────────────────────────┘
//
//  Each card opens a real, functional flow:
//    • Add from Contacts → triggers contact-sync
//    • Invite via Username → NewContact (manual entry / @handle)
//    • Share Invite Link  → shareMyInvite (iOS Share sheet)
//    • Scan QR Code       → QRContact screen with scanner tab
// ============================================================

import React, { useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { UserPlus, Users, AtSign, Link2, QrCode } from 'lucide-react-native';
import { useTheme } from '../services/theme';
import { requestContactsPermission, syncContacts } from '../services/contacts';
import { shareMyInvite } from '../services/inviteLink';

// ── One option card ────────────────────────────────────────
function OptionCard({ Icon, label, hint, onPress, accent, card, tx, sub, border }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[s.card, { backgroundColor: card, borderColor: border }]}>
      <View style={[s.cardIcon, { backgroundColor: accent + '1F' }]}>
        <Icon size={22} color={accent} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.cardLabel, { color: tx }]}>{label}</Text>
        <Text style={[s.cardHint,  { color: sub }]}>{hint}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function AddContactScreen({ navigation }) {
  const { bg, card, tx, sub, border, accent } = useTheme();

  const onFromContacts = useCallback(async () => {
    // Pop the system contacts permission first; if denied, surface a
    // clear explanation instead of failing silently.
    const granted = await requestContactsPermission();
    if (!granted) {
      Alert.alert('Permission needed', 'Allow contacts in Settings → Privacy → Contacts.');
      return;
    }
    try {
      const sync = await syncContacts();
      Alert.alert('Synced!', `${sync.length} contacts imported from your phone.`);
      // Bounce back to the previous screen (Contacts list) so the
      // newly-imported contacts appear immediately on focus refresh.
      navigation.goBack();
    } catch {
      Alert.alert('Sync failed', 'Couldn’t sync your phone contacts. Try again in a moment.');
    }
  }, [navigation]);

  const onNewContact = useCallback(() => {
    // Close the modal-presented "Add Secure Contact" picker first so
    // NewContactScreen lands on top of the underlying Contacts list,
    // not on top of the modal. The 50ms delay gives the dismiss
    // animation time to start before the next push, which avoids the
    // "nothing happens" stall on iOS modal-stack transitions.
    navigation.goBack();
    setTimeout(() => navigation.navigate('NewContact'), 50);
  }, [navigation]);

  const onInviteLink = useCallback(async () => {
    try { await shareMyInvite(); }
    catch { Alert.alert('Could not share', 'Try again in a moment.'); }
  }, []);

  const onQR = useCallback(() => {
    navigation.replace('QRContact', { initialTab: 'scan' });
  }, [navigation]);

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: border }]}>
        <Text style={[s.headerTitle, { color: tx }]}>New Contact</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.cancelBtn}>
          <Text style={[s.cancelTx, { color: accent }]}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Hero icon — solid accent disc with the user-plus glyph */}
        <View style={s.heroWrap}>
          <View style={[s.heroOuterGlow, { backgroundColor: accent + '20' }]}>
            <View style={[s.heroDisc, { backgroundColor: accent }]}>
              <UserPlus size={40} color="#fff" strokeWidth={2.2} />
            </View>
          </View>
        </View>

        <Text style={[s.title, { color: tx }]}>Add Secure Contact</Text>
        <Text style={[s.subtitle, { color: sub }]}>
          Add a new contact to VaultChat{'\n'}using a secure method.
        </Text>

        {/* Four option cards */}
        <View style={{ paddingHorizontal: 16, gap: 12, marginTop: 20 }}>
          <OptionCard
            Icon={Users}
            label="Add from Contacts"
            hint="Add someone from your phone contacts"
            onPress={onFromContacts}
            accent={accent} card={card} tx={tx} sub={sub} border={border}
          />
          <OptionCard
            Icon={AtSign}
            label="New Contact"
            hint="Add manually with a name, phone, or username"
            onPress={onNewContact}
            accent={accent} card={card} tx={tx} sub={sub} border={border}
          />
          <OptionCard
            Icon={Link2}
            label="Share Invite Link"
            hint="Share your secure invite link to connect"
            onPress={onInviteLink}
            accent={accent} card={card} tx={tx} sub={sub} border={border}
          />
          <OptionCard
            Icon={QrCode}
            label="Scan QR Code"
            hint="Scan a QR code to add securely"
            onPress={onQR}
            accent={accent} card={card} tx={tx} sub={sub} border={border}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 56, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:  { fontSize: 22, fontWeight: '800' },
  cancelBtn:    { padding: 4 },
  cancelTx:     { fontSize: 15, fontWeight: '600' },

  heroWrap:     { alignItems: 'center', marginTop: 28, marginBottom: 18 },
  heroOuterGlow:{ width: 132, height: 132, borderRadius: 66, alignItems: 'center', justifyContent: 'center' },
  heroDisc:     { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },

  title:        { fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  subtitle:     { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20, paddingHorizontal: 30 },

  card:         { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 18, borderWidth: 1, gap: 14 },
  cardIcon:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cardLabel:    { fontSize: 16, fontWeight: '700', marginBottom: 3 },
  cardHint:     { fontSize: 12, lineHeight: 16 },
});
