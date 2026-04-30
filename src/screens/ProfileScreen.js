// ============================================================
//  ProfileScreen — premium-framed profile view
//
//  Layout matches the dark mockup:
//    - Header: "Profile" + back chevron
//    - Hero card: large circular avatar + display name + 👑
//      "Premium Member" tag (shown only when the user is premium)
//    - Fields card: Username, Phone Number, Email, Premium Status
//      (Active / Free)
//    - "Edit Profile" primary button
//
//  Edit Profile routes back to Settings since that screen owns the
//  full profile-editing flow (display name, photo, address, bio, etc).
//  Spinning up a dedicated edit screen would duplicate state — defer
//  to v1.1 if a cleaner UX is required.
// ============================================================

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../services/theme';
import { supabase } from '../services/supabase';
import { isPremiumUser } from '../services/adsService';
import { getMyHandle, displayHandle } from '../services/vaultHandle';

export default function ProfileScreen({ navigation }) {
  const { bg, card, tx, sub, border, accent, isPremium: themePremium } = useTheme();
  // Theme reads premium from a cached flag at theme construction
  // time; we re-pull on focus to catch upgrades that happened after
  // the screen was first mounted.
  const [premium,     setPremium]     = useState(themePremium);
  const [displayName, setDisplayName] = useState('');
  const [handle,      setHandle]      = useState('');
  const [phone,       setPhone]       = useState('');
  const [email,       setEmail]       = useState('');
  const [photo,       setPhoto]       = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const u = session?.user;
        if (!cancelled && u) {
          setEmail(u.email || '');
          setPhone(u.phone || '');
        }
        const dn = await AsyncStorage.getItem('vaultchat_display_name');
        const ph = await AsyncStorage.getItem('vaultchat_profile_photo');
        const h  = await getMyHandle().catch(() => null);
        if (cancelled) return;
        if (dn) setDisplayName(dn);
        if (ph) setPhoto(ph);
        if (h)  setHandle(h);
        const isPrem = await isPremiumUser();
        if (!cancelled) setPremium(!!isPrem);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const brand = premium ? '#7C3AED' : accent;

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        {navigation.canGoBack && navigation.canGoBack() ? (
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <ChevronLeft size={26} color={brand} />
          </TouchableOpacity>
        ) : <View style={s.headerBtn} />}
        <Text style={[s.headerTitle, { color: tx }]}>Profile</Text>
        <View style={s.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {/* Hero card — avatar + name + Premium Member tag */}
        <View style={[s.hero, { alignItems: 'center', marginVertical: 18 }]}>
          <View style={[s.avatarRing, { borderColor: brand + '88' }]}>
            {photo ? (
              <Image source={{ uri: photo }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, { backgroundColor: brand + '33', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: brand, fontSize: 42, fontWeight: '800' }}>
                  {(displayName || '?')[0]?.toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
            <Text style={[s.name, { color: tx }]}>{displayName || 'Your Name'}</Text>
            {premium && <Text style={{ fontSize: 18 }}>👑</Text>}
          </View>
          {premium && (
            <View style={[s.premiumTag, { backgroundColor: brand + '22', borderColor: brand + '55' }]}>
              <Text style={[s.premiumTagTx, { color: brand }]}>Premium Member</Text>
            </View>
          )}
        </View>

        {/* Fields card */}
        <View style={[s.fieldsCard, { backgroundColor: card, borderColor: border }]}>
          <Field label="Username" value={handle ? displayHandle(handle) : '—'} tx={tx} sub={sub} border={border} />
          <Field label="Phone Number" value={phone || '—'} tx={tx} sub={sub} border={border} />
          <Field label="Email" value={email || '—'} tx={tx} sub={sub} border={border} />
          <Field
            label="Premium Status"
            value={premium ? 'Active' : 'Free'}
            valueColor={premium ? '#34C759' : sub}
            tx={tx} sub={sub} border={border}
            isLast
          />
        </View>

        {/* Edit Profile button — Settings screen owns the actual
            edit fields, so we route there rather than duplicate state. */}
        <TouchableOpacity
          style={[s.editBtn, { backgroundColor: brand }]}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Settings')}>
          <Text style={s.editBtnTx}>Edit Profile</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Field({ label, value, valueColor, tx, sub, border, isLast }) {
  return (
    <View style={[s.fieldRow, !isLast && { borderBottomColor: border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text style={[s.fieldLabel, { color: sub }]}>{label}</Text>
      <Text style={[s.fieldValue, { color: valueColor || tx }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12 },
  headerBtn:    { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 18, fontWeight: '800' },

  hero:         { paddingVertical: 8 },
  avatarRing:   { width: 132, height: 132, borderRadius: 66, padding: 4, borderWidth: 2 },
  avatar:       { width: '100%', height: '100%', borderRadius: 62 },
  name:         { fontSize: 22, fontWeight: '800' },
  premiumTag:   { marginTop: 8, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  premiumTagTx: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },

  fieldsCard:   { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, marginTop: 12, marginBottom: 24 },
  fieldRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  fieldLabel:   { fontSize: 13, fontWeight: '600' },
  fieldValue:   { fontSize: 14, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },

  editBtn:      { paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  editBtnTx:    { color: '#fff', fontSize: 15, fontWeight: '800' },
});
