// ============================================================
//  VaultScreen — premium-gated vault dashboard
//
//  Layout matches the design mockup:
//    - Header: "Vault" title + gear icon (settings)
//    - Hero card: shield icon + "Your Vault is Protected" +
//      explainer + "Lock Vault" button
//    - 3-stat row: Chats / Files / Media counts
//    - "Vault Items" section header
//    - Category list:
//        • Locked Chats (count) → opens locked chats list
//        • Secure Notes (count)
//        • Files (count)
//        • Photos & Videos (count)
//        • Audio (count)
//
//  Premium gate:
//    - Non-premium users see PremiumModal immediately on mount
//      and a CTA explaining Vault is a Premium feature.
//    - Premium users see the full vault dashboard.
//
//  Theme:
//    - Light mode: white bg, Fiji blue (#0EA5E9) accent — keeps
//      the existing app accent so the vault feels native.
//    - Dark mode: violet accent + deeper purple gradients to
//      match the "Premium" branded feel from the mockup.
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Shield, Lock, FileText, Image as ImageIcon, Mic, ChevronLeft, Settings as SettingsIcon } from 'lucide-react-native';
import { useTheme } from '../services/theme';
import { isPremiumUser } from '../services/adsService';
import {
  isUnlocked as isVaultUnlocked,
  lock as lockVault,
  listVaultedIds,
} from '../services/vault';
import PremiumModal from '../components/PremiumModal';

export default function VaultScreen({ navigation }) {
  // gold + isPremium come from theme.js premium polish — used to
  // tint the hero shield, ring, and CTA so paying users get the
  // warm gold accent shown in the mockup.
  const { bg, card, tx, sub, border, accent, gold, isPremium } = useTheme();
  const heroAccent = isPremium ? gold : accent;
  const [premium,         setPremium]         = useState(false);
  const [premiumModalVis, setPremiumModalVis] = useState(false);
  const [stats,           setStats]           = useState({ chats: 0, files: 0, media: 0, notes: 0, audio: 0 });
  const [unlocked,        setUnlocked]        = useState(false);

  // Refresh on every focus — vault state can change from elsewhere
  // (Settings PIN setup, chat list "Move to Vault" actions).
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      const isPrem = await isPremiumUser();
      if (cancelled) return;
      setPremium(isPrem);
      if (!isPrem) {
        // Non-premium: pop the upgrade modal immediately.
        setPremiumModalVis(true);
      }
      const ids = await listVaultedIds();
      if (cancelled) return;
      setStats(prev => ({ ...prev, chats: ids.length }));
      setUnlocked(isVaultUnlocked());
    })();
    return () => { cancelled = true; };
  }, []));

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerBtn}>
          <ChevronLeft size={26} color={accent} />
        </TouchableOpacity>
        <View style={s.headerTitleRow}>
          <Shield size={18} color={accent} strokeWidth={2.5} />
          <Text style={[s.headerTitle, { color: tx }]}>Vault</Text>
        </View>
        <TouchableOpacity
          style={s.headerBtn}
          onPress={() => navigation.navigate('Settings')}>
          <SettingsIcon size={22} color={sub} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Hero card — matches mockup's protected-state visual.
            Premium users get the gold-tinted variant; others keep
            the standard accent treatment. */}
        <View style={[s.heroCard, { backgroundColor: heroAccent + '12', borderColor: heroAccent + '40' }]}>
          <View style={[s.heroIconWrap, { backgroundColor: heroAccent + '22' }]}>
            <Shield size={32} color={heroAccent} strokeWidth={2.5} />
          </View>
          <Text style={[s.heroTitle, { color: tx }]}>Your Vault is Protected</Text>
          <Text style={[s.heroBody, { color: sub }]}>
            Everything in your vault is secured with end-to-end encryption.
          </Text>
          <TouchableOpacity
            style={[s.heroBtn, { backgroundColor: unlocked ? heroAccent : 'transparent', borderColor: heroAccent, borderWidth: unlocked ? 0 : 1.5 }]}
            onPress={() => {
              if (!premium) { setPremiumModalVis(true); return; }
              if (unlocked) { lockVault(); setUnlocked(false); Alert.alert('Vault Locked', 'Vaulted chats are hidden again.'); }
              else { Alert.alert('Vault Locked', 'Long-press the "Chats" title and enter your Vault PIN to unlock.'); }
            }}>
            <Lock size={16} color={unlocked ? '#fff' : heroAccent} strokeWidth={2.5} />
            <Text style={[s.heroBtnTx, { color: unlocked ? '#fff' : heroAccent }]}>
              {unlocked ? 'Lock Vault' : 'Vault is Locked'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 3-stat row */}
        <View style={s.statsRow}>
          <StatTile label="Chats"  value={stats.chats}  icon="💬" card={card} border={border} tx={tx} sub={sub} />
          <StatTile label="Files"  value={stats.files}  icon="📁" card={card} border={border} tx={tx} sub={sub} />
          <StatTile label="Media"  value={stats.media}  icon="🖼"  card={card} border={border} tx={tx} sub={sub} />
        </View>

        {/* Vault items list */}
        <Text style={[s.sectionLabel, { color: sub }]}>VAULT ITEMS</Text>
        <View style={s.itemsList}>
          <VaultItem
            Icon={Lock}
            label="Locked Chats"
            count={stats.chats}
            countLabel={stats.chats === 1 ? 'conversation' : 'conversations'}
            onPress={() => {
              if (!premium) { setPremiumModalVis(true); return; }
              navigation.navigate('Chats', { focusVault: true });
            }}
            accent={accent} card={card} border={border} tx={tx} sub={sub}
          />
          <VaultItem
            Icon={FileText}
            label="Secure Notes"
            count={stats.notes}
            countLabel={stats.notes === 1 ? 'note' : 'notes'}
            onPress={() => premium ? Alert.alert('Coming Soon', 'Secure Notes will be available in v1.1.') : setPremiumModalVis(true)}
            accent={accent} card={card} border={border} tx={tx} sub={sub}
          />
          <VaultItem
            Icon={FileText}
            label="Files"
            count={stats.files}
            countLabel={stats.files === 1 ? 'file' : 'files'}
            onPress={() => premium ? Alert.alert('Coming Soon', 'Vault file browser ships in v1.1.') : setPremiumModalVis(true)}
            accent={accent} card={card} border={border} tx={tx} sub={sub}
          />
          <VaultItem
            Icon={ImageIcon}
            label="Photos & Videos"
            count={stats.media}
            countLabel="items"
            onPress={() => premium ? Alert.alert('Coming Soon', 'Vault media browser ships in v1.1.') : setPremiumModalVis(true)}
            accent={accent} card={card} border={border} tx={tx} sub={sub}
          />
          <VaultItem
            Icon={Mic}
            label="Audio"
            count={stats.audio}
            countLabel={stats.audio === 1 ? 'recording' : 'recordings'}
            onPress={() => premium ? Alert.alert('Coming Soon', 'Vault audio browser ships in v1.1.') : setPremiumModalVis(true)}
            accent={accent} card={card} border={border} tx={tx} sub={sub}
          />
        </View>

        {/* Bottom upsell for non-premium users — soft second-chance after they
            dismiss the modal but stay on the page browsing what's available. */}
        {!premium && (
          <View style={[s.upsellCard, { backgroundColor: accent + '0d', borderColor: accent + '40' }]}>
            <Text style={[s.upsellTitle, { color: accent }]}>👑  Vault is a Premium feature</Text>
            <Text style={[s.upsellBody, { color: sub }]}>
              Hide sensitive chats, secure notes, files, and media behind a separate PIN. Upgrade to VaultChat Premium to unlock the vault.
            </Text>
            <TouchableOpacity
              style={[s.upsellBtn, { backgroundColor: accent }]}
              onPress={() => setPremiumModalVis(true)}>
              <Text style={s.upsellBtnTx}>See Premium</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <PremiumModal
        visible={premiumModalVis}
        onClose={() => setPremiumModalVis(false)}
        onUpgraded={() => { setPremiumModalVis(false); isPremiumUser().then(setPremium); }}
        colors={{ card, text: tx, muted: sub, border }}
      />
    </View>
  );
}

// ── Sub-components ───────────────────────────────────────────

function StatTile({ label, value, icon, card, border, tx, sub }) {
  return (
    <View style={[s.statTile, { backgroundColor: card, borderColor: border }]}>
      <Text style={s.statIcon}>{icon}</Text>
      <Text style={[s.statValue, { color: tx }]}>{value}</Text>
      <Text style={[s.statLabel, { color: sub }]}>{label}</Text>
    </View>
  );
}

function VaultItem({ Icon, label, count, countLabel, onPress, accent, card, border, tx, sub }) {
  return (
    <TouchableOpacity
      style={[s.item, { backgroundColor: card, borderColor: border }]}
      onPress={onPress}
      activeOpacity={0.85}>
      <View style={[s.itemIcon, { backgroundColor: accent + '18' }]}>
        <Icon size={18} color={accent} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.itemLabel, { color: tx }]}>{label}</Text>
        <Text style={[s.itemCount, { color: sub }]}>{count} {countLabel}</Text>
      </View>
      <Text style={[s.itemChevron, { color: sub }]}>›</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1 },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn:        { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitleRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle:      { fontSize: 20, fontWeight: '700' },

  heroCard:         {
    margin: 16,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
  },
  heroIconWrap:     {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle:        { fontSize: 18, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  heroBody:         { fontSize: 13, textAlign: 'center', marginBottom: 18, lineHeight: 18 },
  heroBtn:          {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 11,
    borderRadius: 22,
  },
  heroBtnTx:        { fontSize: 14, fontWeight: '700' },

  statsRow:         { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 22 },
  statTile:         {
    flex: 1, paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 4,
  },
  statIcon:         { fontSize: 20 },
  statValue:        { fontSize: 22, fontWeight: '800' },
  statLabel:        { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },

  sectionLabel:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginLeft: 20, marginBottom: 8 },
  itemsList:        { paddingHorizontal: 16, gap: 8 },
  item:             {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
  itemIcon:         { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemLabel:        { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  itemCount:        { fontSize: 12 },
  itemChevron:      { fontSize: 22, fontWeight: '300', marginLeft: 4 },

  upsellCard:       {
    margin: 16, padding: 20, borderRadius: 16, borderWidth: 1.5,
  },
  upsellTitle:      { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  upsellBody:       { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  upsellBtn:        { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  upsellBtnTx:      { color: '#000', fontWeight: '800', fontSize: 14 },
});
