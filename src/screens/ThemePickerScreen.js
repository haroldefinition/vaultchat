// ============================================================
//  ThemePickerScreen — task #92, premium gate
//  Settings → Appearance → Theme & Icon
//
//  Cosmetic premium-only feature: choose between accent themes
//  and (later) alternate app icons. The default Violet (dark) /
//  Fiji Blue (light) accent is always available; everything else
//  is paywalled. Apple lets us swap the home-screen icon at
//  runtime via UIApplication.setAlternateIconName but we ship
//  the picker UI first and wire icon swap as a follow-up once
//  the assets are bundled.
// ============================================================

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { useTheme } from '../services/theme';
import PremiumModal from '../components/PremiumModal';
import { isPremium } from '../services/iapService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCENT_KEY = 'vaultchat_custom_accent';

const PRESETS = [
  { id: 'default',  name: 'Default',  color: null,        free: true,  desc: 'Violet (dark) / Fiji blue (light)' },
  { id: 'sunset',   name: 'Sunset',   color: '#F97316',   free: false, desc: 'Warm orange' },
  { id: 'forest',   name: 'Forest',   color: '#10B981',   free: false, desc: 'Emerald green' },
  { id: 'rose',     name: 'Rose',     color: '#EC4899',   free: false, desc: 'Soft pink' },
  { id: 'crimson',  name: 'Crimson',  color: '#DC2626',   free: false, desc: 'Deep red' },
  { id: 'ocean',    name: 'Ocean',    color: '#0EA5E9',   free: false, desc: 'Deep blue' },
  { id: 'gold',     name: 'Gold',     color: '#F59E0B',   free: false, desc: 'Premium gold' },
];

export default function ThemePickerScreen({ navigation }) {
  const { bg, card, tx, sub, border, accent } = useTheme();
  const [premium,         setPremium]         = useState(false);
  const [premiumModalVis, setPremiumModalVis] = useState(false);
  const [selected,        setSelected]        = useState('default');

  useEffect(() => {
    isPremium().then(setPremium);
    AsyncStorage.getItem(ACCENT_KEY).then(v => { if (v) setSelected(v); });
  }, []);

  const choose = async (preset) => {
    if (!preset.free && !premium) {
      setPremiumModalVis(true);
      return;
    }
    setSelected(preset.id);
    await AsyncStorage.setItem(ACCENT_KEY, preset.id);
    Alert.alert(
      'Theme saved',
      preset.id === 'default'
        ? 'Reverted to the default accent.'
        : `${preset.name} accent applied. Restart the app to see it everywhere.`,
    );
  };

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <View style={[s.header, { borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerBtn}>
          <Text style={[s.headerBtnTx, { color: accent }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: tx }]}>Theme & Icon</Text>
        <View style={s.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={[s.sectionLabel, { color: sub }]}>ACCENT COLOR</Text>
        {PRESETS.map(p => {
          const isSel = selected === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              style={[s.row, { borderColor: isSel ? accent : border, backgroundColor: card }]}
              onPress={() => choose(p)}
              activeOpacity={0.85}
            >
              <View style={[s.swatch, { backgroundColor: p.color || accent }]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.rowName, { color: tx }]}>
                  {p.name}
                  {!p.free ? <Text style={{ color: '#F59E0B' }}>  👑</Text> : null}
                </Text>
                <Text style={[s.rowDesc, { color: sub }]}>{p.desc}</Text>
              </View>
              {isSel && <Text style={{ color: accent, fontSize: 20 }}>✓</Text>}
            </TouchableOpacity>
          );
        })}

        {!premium && (
          <View style={[s.upsellCard, { borderColor: '#F59E0B', backgroundColor: '#F59E0B11' }]}>
            <Text style={[s.upsellTitle, { color: tx }]}>👑 Unlock all themes</Text>
            <Text style={[s.upsellDesc, { color: sub }]}>
              Custom accents and alternate app icons are part of VaultChat Premium.
            </Text>
            <TouchableOpacity
              style={[s.upsellBtn, { backgroundColor: '#F59E0B' }]}
              onPress={() => setPremiumModalVis(true)}>
              <Text style={s.upsellBtnTx}>See Premium</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <PremiumModal
        visible={premiumModalVis}
        onClose={() => setPremiumModalVis(false)}
        onUpgraded={() => { setPremiumModalVis(false); isPremium().then(setPremium); }}
        colors={{ card, text: tx, muted: sub, border }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1 },
  headerBtn:    { minWidth: 60 },
  headerBtnTx:  { fontSize: 16, fontWeight: '600' },
  title:        { fontSize: 18, fontWeight: '700' },
  sectionLabel: { fontSize: 11, fontWeight: '700', marginBottom: 12, letterSpacing: 0.5 },
  row:          { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1.5, marginBottom: 8, gap: 14 },
  swatch:       { width: 36, height: 36, borderRadius: 18 },
  rowName:      { fontSize: 15, fontWeight: '700' },
  rowDesc:      { fontSize: 12, marginTop: 2 },
  upsellCard:   { padding: 16, borderRadius: 14, borderWidth: 1.5, marginTop: 24 },
  upsellTitle:  { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  upsellDesc:   { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  upsellBtn:    { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  upsellBtnTx:  { color: '#000', fontWeight: '800', fontSize: 14 },
});
