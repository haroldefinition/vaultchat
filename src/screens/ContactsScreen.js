// ============================================================
//  ContactsScreen — VaultChat-style contacts list
//
//  Layout (matches the design mockup):
//    ┌─────────────────────────────┐
//    │  ‹  Contacts            +   │  header
//    │  🔍 Search contacts…        │
//    │  ┌─────┬─────┬─────┐        │  3 quick-action cards
//    │  │  🛡 │  ⟳ │ 🔗 │           │  Secure Invite / Sync / Invite Link
//    │  └─────┴─────┴─────┘        │
//    │  Premium Contacts        👑 │  premium-gated section
//    │  ┌──────────────────────┐    │
//    │  │ 🛡 Alice Premium  👑 │    │
//    │  └──────────────────────┘    │
//    │  ─────  All Contacts  ───── │
//    │  A                          │
//    │  • Alice                    │  A-Z section list
//    │  • Andy                     │
//    │  B                          │
//    │  • Bob                      │
//    └─────────────────────────────┘
//
//  Premium Contacts section is gated:
//    - Free users see a locked teaser card with 👑 + "Tap to unlock"
//    - Tap → PremiumModal (upsell)
//    - Premium users see a real list of friends who are also premium,
//      pre-fetched in bulk via getPremiumStatusBulkByPhone for a
//      single round-trip. Each row carries a 🛡 (matched + active)
//      AND the 👑 crown.
//
//  AddContactModal sheet (the new "+" in the header) offers four
//  paths: From Contacts (phone sync), Username (manual via
//  NewContactScreen), Invite Link (share), QR Code (QR scanner).
// ============================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  Image, Alert, ActivityIndicator, SectionList, Modal, Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import { requestContactsPermission, syncContacts, getCachedContacts } from '../services/contacts';
import { loadContacts } from '../services/contactsSync';
import { displayHandle } from '../services/vaultHandle';
import { getPremiumStatusBulkByPhone } from '../services/premiumStatus';
import { shareMyInvite } from '../services/inviteLink';
import PremiumCrown from '../components/PremiumCrown';
import PremiumModal from '../components/PremiumModal';

// ── Avatar ──────────────────────────────────────────────────
function Avatar({ contact, size = 46, accent }) {
  const name = contact.name || contact.firstName || '?';
  return contact.photo || contact.image
    ? <Image source={{ uri: contact.photo || contact.image }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: accent + '33', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: accent, fontWeight: '700', fontSize: size * 0.37 }}>{name[0]?.toUpperCase()}</Text>
      </View>;
}

// ── Quick-action card (one of the three at the top) ─────────
function QuickAction({ icon, label, accent, card, tx, onPress }) {
  return (
    <TouchableOpacity
      style={[s.quickCard, { backgroundColor: card, borderColor: accent + '33' }]}
      activeOpacity={0.75}
      onPress={onPress}>
      <View style={[s.quickIcon, { backgroundColor: accent + '22' }]}>
        <Text style={{ fontSize: 22 }}>{icon}</Text>
      </View>
      <Text style={[s.quickLabel, { color: tx }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Add-contact bottom sheet ────────────────────────────────
function AddContactSheet({ visible, onClose, onPick }) {
  const { card, tx, sub, border, accent } = useTheme();
  const OPTIONS = [
    { id: 'from_contacts', icon: '📱', label: 'From Contacts',  hint: 'Sync your phone’s address book' },
    { id: 'username',      icon: '✏️', label: 'Add Manually',   hint: 'Name, phone, @username' },
    { id: 'invite_link',   icon: '🔗', label: 'Invite Link',    hint: 'Send a link to invite someone' },
    { id: 'qr',            icon: '📷', label: 'QR Code',        hint: 'Scan or show your QR code' },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.sheetBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={[s.sheet, { backgroundColor: card }]}>
          <Text style={[s.sheetTitle, { color: tx }]}>Add Contact</Text>
          {OPTIONS.map(o => (
            <TouchableOpacity
              key={o.id}
              style={[s.sheetRow, { borderBottomColor: border }]}
              onPress={() => { onClose(); setTimeout(() => onPick(o.id), 150); }}>
              <View style={[s.sheetIcon, { backgroundColor: accent + '22' }]}>
                <Text style={{ fontSize: 20 }}>{o.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.sheetLabel, { color: tx }]}>{o.label}</Text>
                <Text style={[s.sheetHint, { color: sub }]}>{o.hint}</Text>
              </View>
              <Text style={{ color: sub, fontSize: 20 }}>›</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={onClose} style={s.sheetCancel}>
            <Text style={{ color: accent, fontWeight: '700', fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export default function ContactsScreen({ navigation }) {
  // gold + isPremium come from theme.js premium polish — used to
  // tint the Premium Contacts header, shield, and section accents
  // so paying users feel the warm gold treatment from the mockup.
  const { bg, card, tx, sub, border, inputBg, accent, gold, isPremium: themeIsPremium } = useTheme();
  // Header tint = gold for premium users in dark mode, accent otherwise.
  const premiumTint = themeIsPremium ? gold : accent;

  // ── State ───────────────────────────────────────────────
  const [contacts, setContacts] = useState([]);
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [synced,   setSynced]   = useState(false);
  const [premium,  setPremium]  = useState(false);
  const [premiumByPhone, setPremiumByPhone] = useState(new Map());
  const [addSheetOpen,   setAddSheetOpen]   = useState(false);
  const [premiumModalVis,setPremiumModalVis]= useState(false);

  // ── Data load ───────────────────────────────────────────
  useEffect(() => { fetchContacts(); }, []);
  useEffect(() => {
    try { require('../services/iapService').isPremium().then(setPremium); } catch {}
    const unsub = navigation.addListener('focus', () => {
      try { require('../services/iapService').isPremium().then(setPremium); } catch {}
    });
    return unsub;
  }, [navigation]);

  async function fetchContacts() {
    setLoading(true);
    const mine   = await loadContacts();
    const cached = await getCachedContacts().catch(() => []);
    const merged = [...mine];
    cached.forEach(pc => {
      if (!merged.find(m => m.phone === pc.phone)) merged.push(pc);
    });
    const sorted = merged.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    setContacts(sorted);
    setLoading(false);
    // Pre-fetch premium status for the entire list in one round-trip
    // so the Premium Contacts section + crown indicators light up
    // together, without per-row API thrash.
    const phones = sorted.map(c => c.phone).filter(Boolean);
    if (phones.length) {
      try {
        const map = await getPremiumStatusBulkByPhone(phones);
        setPremiumByPhone(map);
      } catch {}
    }
  }

  async function syncPhoneContacts() {
    setLoading(true);
    const granted = await requestContactsPermission();
    if (!granted) {
      Alert.alert('Permission needed', 'Allow contacts in Settings → Privacy → Contacts.');
      setLoading(false); return;
    }
    const sync = await syncContacts();
    const raw  = await AsyncStorage.getItem('vaultchat_contacts');
    const mine = raw ? JSON.parse(raw) : [];
    const merged = [...mine];
    sync.forEach(c => { if (!merged.find(m => m.phone === c.phone)) merged.push(c); });
    const sorted = merged.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    setContacts(sorted);
    setSynced(true);
    Alert.alert('Synced!', `${sync.length} contacts imported from your phone.`);
    setLoading(false);
    // Refresh premium map for the new arrivals.
    const phones = sorted.map(c => c.phone).filter(Boolean);
    if (phones.length) {
      try {
        const map = await getPremiumStatusBulkByPhone(phones);
        setPremiumByPhone(map);
      } catch {}
    }
  }

  // ── Quick-action handlers ───────────────────────────────
  const onSecureInvite = useCallback(async () => {
    // "Secure Invite" — uses the existing invite-link share path
    // but adds a one-line preface emphasising E2E encryption so the
    // recipient sees the security promise before downloading.
    try { await shareMyInvite({ preface: 'Join me on VaultChat — end-to-end encrypted messaging.' }); }
    catch { Alert.alert('Could not share', 'Try again in a moment.'); }
  }, []);

  const onInviteLink = useCallback(async () => {
    try { await shareMyInvite(); }
    catch { Alert.alert('Could not share', 'Try again in a moment.'); }
  }, []);

  const onAddPick = useCallback((id) => {
    if (id === 'from_contacts') return syncPhoneContacts();
    if (id === 'username')      return navigation.navigate('NewContact');
    if (id === 'invite_link')   return onInviteLink();
    if (id === 'qr')            return navigation.navigate('QRContact', { initialTab: 'mine' });
  }, [navigation, onInviteLink]);

  // ── Filter / group ──────────────────────────────────────
  const filtered = useMemo(() => contacts.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  ), [contacts, search]);

  const sections = useMemo(() => {
    return filtered.reduce((acc, c) => {
      const letter = (c.name || c.phone || '#')[0]?.toUpperCase() || '#';
      const key    = /[A-Z]/.test(letter) ? letter : '#';
      const sec    = acc.find(s => s.title === key);
      if (sec) sec.data.push(c);
      else acc.push({ title: key, data: [c] });
      return acc;
    }, []).sort((a, b) => a.title.localeCompare(b.title));
  }, [filtered]);

  // ── Renderers ───────────────────────────────────────────
  const renderRow = ({ item }) => {
    const name = `${item.firstName || ''} ${item.lastName || ''}`.trim() || item.name || item.phone || 'Unknown';
    const isPrem = !!(item.phone && premiumByPhone.get(item.phone));
    return (
      <TouchableOpacity
        style={[s.row, { borderBottomColor: border }]}
        onPress={() => navigation.navigate('ContactView', { contact: { ...item, name } })}>
        <Avatar contact={{ ...item, name }} accent={accent} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[s.contactName, { color: tx }]}>{name}</Text>
            <PremiumCrown isPremium={isPrem} size={13} />
          </View>
          {item.phone ? <Text style={[s.contactPhone, { color: sub }]}>{item.phone}</Text> : null}
          {item.handle ? <Text style={[s.contactHandle, { color: accent }]}>{displayHandle(item.handle)}</Text> : null}
        </View>
        <Text style={{ color: sub, fontSize: 18 }}>›</Text>
      </TouchableOpacity>
    );
  };

  // ListHeader covers the quick-actions row + "All Contacts" divider
  // ONLY — the search TextInput is rendered separately above the
  // SectionList so a fresh ListHeader function reference on every
  // keystroke doesn't unmount/remount the input and steal focus.
  //
  // Wrapped in useCallback so the SectionList sees the same function
  // reference across renders and doesn't churn the header subtree.
  const ListHeader = useCallback(() => (
    <View>
      {/* Quick actions row */}
      <View style={s.quickRow}>
        <QuickAction icon="🛡" label="Secure Invite" accent={accent} card={card} tx={tx} onPress={onSecureInvite} />
        <QuickAction icon="⟳"  label="Sync Contacts" accent={accent} card={card} tx={tx} onPress={syncPhoneContacts} />
        <QuickAction icon="🔗" label="Invite Link"   accent={accent} card={card} tx={tx} onPress={onInviteLink} />
      </View>

      {/* (Premium Contacts section was removed per Harold's review —
          individual premium peers still get a 👑 next to their name
          in the All Contacts list below, so the signal stays without
          the dedicated section.) */}

      {/* All Contacts divider */}
      <View style={s.allDivider}>
        <View style={[s.allDividerLine, { backgroundColor: border }]} />
        <Text style={[s.allDividerText, { color: sub }]}>All Contacts</Text>
        <View style={[s.allDividerLine, { backgroundColor: border }]} />
      </View>
    </View>
  ), [accent, card, tx, sub, border, onSecureInvite, onInviteLink]);

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header — hide the back chevron when we're at a tab root
          (no entry on the navigation stack to pop back to). */}
      <View style={[s.header, { borderBottomColor: border }]}>
        {navigation.canGoBack && navigation.canGoBack() ? (
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Text style={[s.backTx, { color: accent }]}>‹</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.backBtn} />
        )}
        <Text style={[s.title, { color: tx }]}>Contacts</Text>
        <TouchableOpacity
          style={[s.addBtn, { backgroundColor: accent + '18', borderColor: accent + '44' }]}
          onPress={() => navigation.navigate('AddContact')}
          disabled={loading}>
          {loading
            ? <ActivityIndicator size="small" color={accent} />
            : <Text style={[s.addTx, { color: accent }]}>＋ Add</Text>}
        </TouchableOpacity>
      </View>

      {/* Search bar lives ABOVE the SectionList — pinning it here
          (rather than inside ListHeaderComponent) keeps the TextInput
          mounted across re-renders so focus is retained on every
          keystroke. Same fix mirrored on the Android build. */}
      <View style={[s.searchRow, { backgroundColor: inputBg, borderColor: border }]}>
        <Text style={{ color: sub, marginRight: 8 }}>🔍</Text>
        <TextInput
          style={[s.searchInput, { color: tx }]}
          placeholder="Search contacts…"
          placeholderTextColor={sub}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={{ color: sub, fontSize: 16, paddingHorizontal: 8 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading && contacts.length === 0 ? (
        <View style={s.loader}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={[{ color: sub, marginTop: 12 }]}>Loading contacts…</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) => item.id || item.phone || String(i)}
          stickySectionHeadersEnabled
          ListHeaderComponent={ListHeader}
          contentContainerStyle={{ paddingBottom: 32 }}
          renderSectionHeader={({ section }) => (
            // A-Z section letters render as filled gold pills so the
            // index pops against the dark canvas — matches the
            // mockup where each letter is a warm gold tag rather
            // than tinted text. Falls back to the accent ramp on
            // light mode where gold === accent.
            <View style={[s.sectionHeader, { backgroundColor: bg }]}>
              <View style={[s.sectionLetterPill, { backgroundColor: premiumTint + '22', borderColor: premiumTint + '55' }]}>
                <Text style={[s.sectionLetter, { color: premiumTint }]}>{section.title}</Text>
              </View>
            </View>
          )}
          renderItem={renderRow}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>👤</Text>
              <Text style={[s.emptyTitle, { color: tx }]}>No Contacts Yet</Text>
              <Text style={[s.emptySub, { color: sub }]}>Tap Sync to import from your phone</Text>
              <TouchableOpacity style={[s.emptySyncBtn, { backgroundColor: accent }]} onPress={syncPhoneContacts}>
                <Text style={{ color: '#000', fontWeight: '700' }}>⟳  Sync Phone Contacts</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <AddContactSheet
        visible={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        onPick={onAddPick}
      />
      <PremiumModal
        visible={premiumModalVis}
        onClose={() => setPremiumModalVis(false)}
        onUpgraded={() => {
          setPremiumModalVis(false);
          try { require('../services/iapService').isPremium().then(setPremium); } catch {}
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:        { padding: 4 },
  backTx:         { fontSize: 30, fontWeight: 'bold' },
  title:          { flex: 1, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  addBtn:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, borderWidth: 1 },
  addTx:          { fontWeight: '700', fontSize: 13 },

  searchRow:      { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput:    { flex: 1, fontSize: 15 },

  quickRow:       { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 14 },
  quickCard:      { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 16, borderWidth: 1, gap: 8 },
  quickIcon:      { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  quickLabel:     { fontSize: 12, fontWeight: '700', textAlign: 'center' },

  premiumHeaderRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginTop: 4, marginBottom: 8, gap: 8 },
  premiumHeaderTitle:  { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  premiumLocked:       { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, padding: 14, borderRadius: 16, borderWidth: 1, gap: 12, marginBottom: 12 },
  premiumLockedIcon:   { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  premiumLockedTitle:  { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  premiumLockedHint:   { fontSize: 12 },
  premiumEmpty:        { marginHorizontal: 16, padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  premiumRow:          { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  premiumShield:       { fontSize: 18, marginRight: 8, marginLeft: 2 },

  allDivider:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 6, marginBottom: 4, gap: 10 },
  allDividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  allDividerText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },

  sectionHeader:    { paddingHorizontal: 18, paddingVertical: 6 },
  sectionLetterPill:{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  sectionLetter:    { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  row:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  contactName:    { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  contactPhone:   { fontSize: 13 },
  contactHandle:  { fontSize: 12, fontWeight: '600' },

  loader:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:          { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle:     { fontSize: 20, fontWeight: '700' },
  emptySub:       { fontSize: 14, textAlign: 'center' },
  emptySyncBtn:   { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, marginTop: 8 },

  // Add-contact bottom sheet
  sheetBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:          { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 14, paddingBottom: 40 },
  sheetTitle:     { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 14 },
  sheetRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 14 },
  sheetIcon:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sheetLabel:     { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  sheetHint:      { fontSize: 12 },
  sheetCancel:    { alignItems: 'center', paddingVertical: 14 },
});
