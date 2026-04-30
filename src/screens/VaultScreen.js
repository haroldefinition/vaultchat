// ============================================================
//  VaultScreen — premium-gated vault dashboard
//
//  TWO LAYOUTS based on premium flag:
//
//  PREMIUM (matches the Mar 2026 dark-mode mockup):
//    - Header: "Vault 👑" title + Add (+) button
//    - Search bar (filters the items list)
//    - Categorized items list:
//        • Encrypted Messages → Locked Chats
//        • Encrypted Files
//        • Secure Notes
//        • Passwords
//        • Biometrics (Enabled / status row)
//    - Bottom protection banner ("Your Vault is Protected")
//
//  FREE (legacy fallback so non-premium users can still see
//        the vault and be upsold to premium):
//    - Header: "Vault" + gear icon
//    - Hero protection card at top
//    - 3-stat row + "VAULT ITEMS" categorized list
//    - Bottom upsell card pointing to PremiumModal
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
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Shield, Lock, FileText, Image as ImageIcon, Mic, ChevronLeft, Settings as SettingsIcon, Plus, Key, Fingerprint, MessageSquare } from 'lucide-react-native';
import { useTheme } from '../services/theme';
import { isPremiumUser } from '../services/adsService';
import {
  isUnlocked as isVaultUnlocked,
  lock as lockVault,
  listVaultedIds,
  hasVaultPin,
} from '../services/vault';
import PremiumModal from '../components/PremiumModal';
import VaultPinPrompt from '../components/VaultPinPrompt';
import VaultPinSetupModal from '../components/VaultPinSetupModal';

// AsyncStorage flag — set when we've shown the first-run setup modal
// (whether the user created a PIN or skipped). Prevents the modal
// from popping every time they visit the Vault.
const SETUP_SEEN_KEY = 'vaultchat_vault_setup_seen';

export default function VaultScreen({ navigation }) {
  // gold + isPremium come from theme.js premium polish — used to
  // tint the hero shield, ring, and CTA so paying users get the
  // warm gold accent shown in the mockup.
  const { bg, card, tx, sub, border, accent, gold, isPremium } = useTheme();
  const heroAccent = isPremium ? gold : accent;
  const [premium,         setPremium]         = useState(false);
  const [premiumModalVis, setPremiumModalVis] = useState(false);
  const [stats,           setStats]           = useState({ chats: 0, files: 0, media: 0, notes: 0, audio: 0, passwords: 0, biometrics: false });
  const [unlocked,        setUnlocked]        = useState(false);
  const [search,          setSearch]          = useState('');
  // Inline PIN prompt — opens when the user taps the lock pill on
  // the bottom protection banner while the vault is still locked.
  const [pinPromptOpen,   setPinPromptOpen]   = useState(false);
  // First-run PIN setup modal — pops on first Vault visit when the
  // user is premium and has no PIN yet (so they don't have to hunt
  // for the Settings row). Tracked locally with `setupModalOpen`.
  const [setupModalOpen,  setSetupModalOpen]  = useState(false);

  // Refresh on every focus — vault state can change from elsewhere
  // (Settings PIN setup, chat list "Move to Vault" actions).
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      const isPrem = await isPremiumUser();
      if (cancelled) return;
      setPremium(isPrem);
      // (Per Harold 2026-04-29: Vault is now FREE for the basic
      //  Locked Chats flow. The premium gate moved row-by-row — the
      //  Encrypted Files / Notes / Passwords / Biometrics rows pop
      //  the upgrade modal individually when a free user taps them.
      //  No more auto-popping the modal on Vault mount.)
      const ids = await listVaultedIds();
      if (cancelled) return;
      // Best-effort biometric check — if the user enabled biometric
      // unlock for the vault we surface "Enabled" on the row, else
      // "Set up". This is a local cache flag set by Settings.
      let bio = false;
      try {
        const v = await AsyncStorage.getItem('vaultchat_vault_biometrics');
        bio = v === '1' || v === 'true';
      } catch {}
      setStats(prev => ({ ...prev, chats: ids.length, biometrics: bio }));
      setUnlocked(isVaultUnlocked());

      // First-run Vault setup — premium users who don't have a PIN
      // yet AND haven't seen the setup modal before get a friendly
      // in-screen guide so they don't have to know about Settings →
      // Vault PIN. We don't show it to free users (they can vault
      // chats but the PIN is optional for the basic flow), and we
      // never show it twice (the seen flag persists across launches).
      if (isPrem) {
        try {
          const [hasPin, seenRaw] = await Promise.all([
            hasVaultPin(),
            AsyncStorage.getItem(SETUP_SEEN_KEY),
          ]);
          if (cancelled) return;
          if (!hasPin && !seenRaw) {
            setSetupModalOpen(true);
          }
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, []));

  // ── UNIFIED VAULT LAYOUT (mockup match for both free + premium) ──
  // Per Harold 2026-04-29: Vault is now free for the basic Locked
  // Chats use. Encrypted Files / Secure Notes / Passwords / Biometrics
  // rows are paywalled — tapping them as a free user pops the upgrade
  // modal. The categorized layout matches the dark-mode mockup. Free
  // users still get the full layout, just with 🔒 markers on premium
  // rows and the modal as the gate.
  {
    const openUpsell = () => setPremiumModalVis(true);
    const items = [
      {
        key:   'messages',
        Icon:  MessageSquare,
        label: 'Encrypted Messages',
        count: stats.chats,
        right: String(stats.chats),
        premium: false,
        onPress: () => navigation.navigate('LockedChats'),
      },
      {
        key:   'files',
        Icon:  FileText,
        label: 'Encrypted Files',
        count: stats.files,
        right: premium ? String(stats.files) : '👑',
        premium: true,
        onPress: () => premium
          ? Alert.alert('Coming Soon', 'Vault file browser ships in v1.1.')
          : openUpsell(),
      },
      {
        key:   'notes',
        Icon:  FileText,
        label: 'Secure Notes',
        count: stats.notes,
        right: premium ? String(stats.notes) : '👑',
        premium: true,
        onPress: () => premium
          ? Alert.alert('Coming Soon', 'Secure Notes will be available in v1.1.')
          : openUpsell(),
      },
      {
        key:   'passwords',
        Icon:  Key,
        label: 'Passwords',
        count: stats.passwords,
        right: premium ? String(stats.passwords) : '👑',
        premium: true,
        onPress: () => premium
          ? Alert.alert('Coming Soon', 'Password vault ships in v1.1.')
          : openUpsell(),
      },
      {
        key:   'biometrics',
        Icon:  Fingerprint,
        label: 'Biometrics',
        count: 0,
        right: premium ? (stats.biometrics ? 'Enabled' : 'Set up') : '👑',
        premium: true,
        onPress: () => premium
          ? navigation.navigate('Settings')
          : openUpsell(),
      },
    ];

    const q = search.trim().toLowerCase();
    const filtered = q ? items.filter(it => it.label.toLowerCase().includes(q)) : items;

    return (
      <View style={[s.container, { backgroundColor: bg }]}>
        {/* Premium header — title with crown + Add (+) button */}
        <View style={[s.header, { borderBottomColor: border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerBtn}>
            <ChevronLeft size={26} color={accent} />
          </TouchableOpacity>
          <View style={s.headerTitleRow}>
            <Text style={[s.headerTitle, { color: tx }]}>Vault</Text>
            {premium && <Text style={s.headerCrown}>👑</Text>}
          </View>
          <TouchableOpacity
            style={s.headerBtn}
            accessibilityLabel="Add to Vault"
            onPress={() => {
              // Free users only get the "Lock a Chat" option (free
              // tier) plus an upsell for the rest. Premium users see
              // the full menu.
              const choices = [
                { text: 'Lock a Chat', onPress: () => navigation.navigate('LockedChats') },
                premium
                  ? { text: 'Secure Note', onPress: () => Alert.alert('Coming Soon', 'Secure Notes ship in v1.1.') }
                  : { text: 'Secure Note 👑', onPress: openUpsell },
                premium
                  ? { text: 'Password',    onPress: () => Alert.alert('Coming Soon', 'Password vault ships in v1.1.') }
                  : { text: 'Password 👑', onPress: openUpsell },
                { text: 'Cancel', style: 'cancel' },
              ];
              Alert.alert('Add to Vault', 'Choose what to add.', choices);
            }}>
            <Plus size={24} color={accent} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={[s.searchWrap, { backgroundColor: card, borderColor: border }]}>
          <Text style={[s.searchIcon, { color: sub }]}>🔎</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search vault…"
            placeholderTextColor={sub}
            style={[s.searchInput, { color: tx }]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {/* Categorized items */}
          <View style={[s.itemsList, { marginTop: 6 }]}>
            {filtered.map(it => (
              <PremiumVaultItem
                key={it.key}
                Icon={it.Icon}
                label={it.label}
                right={it.right}
                onPress={it.onPress}
                accent={accent} card={card} border={border} tx={tx} sub={sub}
              />
            ))}
            {filtered.length === 0 && (
              <Text style={[s.emptyText, { color: sub }]}>No vault items match "{search}".</Text>
            )}
          </View>

          {/* Bottom protection banner */}
          <View style={[s.protectBanner, { backgroundColor: heroAccent + '14', borderColor: heroAccent + '40' }]}>
            <View style={[s.protectIconWrap, { backgroundColor: heroAccent + '22' }]}>
              <Shield size={20} color={heroAccent} strokeWidth={2.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.protectTitle, { color: tx }]}>Your Vault is Protected</Text>
              <Text style={[s.protectBody, { color: sub }]}>
                Everything is secured with end-to-end encryption.
              </Text>
            </View>
            <TouchableOpacity
              style={[s.protectBtn, { backgroundColor: unlocked ? heroAccent : 'transparent', borderColor: heroAccent }]}
              onPress={() => {
                if (unlocked) {
                  lockVault();
                  setUnlocked(false);
                  Alert.alert('Vault Locked', 'Vaulted chats are hidden again.');
                } else {
                  // Open the PIN prompt inline — much friendlier than
                  // bouncing the user back to long-press the Chats
                  // title.
                  setPinPromptOpen(true);
                }
              }}>
              <Lock size={14} color={unlocked ? '#fff' : heroAccent} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </ScrollView>

        <PremiumModal
          visible={premiumModalVis}
          onClose={() => setPremiumModalVis(false)}
          onUpgraded={() => { setPremiumModalVis(false); isPremiumUser().then(setPremium); }}
          colors={{ card, text: tx, muted: sub, border }}
        />

        {/* Inline Vault PIN prompt — opens from the protection-banner
            lock pill so users don't have to learn the long-press-on-
            Chats-title gesture. */}
        <VaultPinPrompt
          visible={pinPromptOpen}
          onClose={() => setPinPromptOpen(false)}
          onUnlocked={() => {
            setPinPromptOpen(false);
            setUnlocked(true);
            Alert.alert('Vault Unlocked', 'Your locked chats are visible again.');
          }}
          onSetup={() => navigation.navigate('Settings')}
        />

        {/* First-run setup — premium-only, fires once when the user
            opens the Vault and no PIN exists. The "seen" flag is set
            on either successful create OR explicit skip, so the
            modal never re-pops. */}
        <VaultPinSetupModal
          visible={setupModalOpen}
          onClose={async () => {
            setSetupModalOpen(false);
            try { await AsyncStorage.setItem(SETUP_SEEN_KEY, '1'); } catch {}
          }}
          onCreated={async () => {
            setSetupModalOpen(false);
            try { await AsyncStorage.setItem(SETUP_SEEN_KEY, '1'); } catch {}
            Alert.alert(
              'Vault PIN created',
              'You can now move chats into the vault from the chat list (long-press a row → Move to Vault).'
            );
          }}
        />
      </View>
    );
  }
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

// Premium row — single-line title + right-aligned count or status,
// matching the dark mockup. Uses a circular accent-tinted icon well.
function PremiumVaultItem({ Icon, label, right, onPress, accent, card, border, tx, sub }) {
  return (
    <TouchableOpacity
      style={[s.pItem, { backgroundColor: card, borderColor: border }]}
      onPress={onPress}
      activeOpacity={0.85}>
      <View style={[s.pItemIcon, { backgroundColor: accent + '22' }]}>
        <Icon size={20} color={accent} strokeWidth={2.2} />
      </View>
      <Text style={[s.pItemLabel, { color: tx }]} numberOfLines={1}>{label}</Text>
      {right != null && right !== '' && (
        <Text style={[s.pItemRight, { color: sub }]}>{right}</Text>
      )}
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

  // ── Premium-only styles ─────────────────────────────────────
  headerCrown:      { fontSize: 18, marginLeft: 2 },

  searchWrap:       {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 12, height: 44,
  },
  searchIcon:       { fontSize: 14, marginRight: 8 },
  searchInput:      { flex: 1, fontSize: 15, paddingVertical: 0 },

  pItem:            {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: 14, borderWidth: 1,
  },
  pItemIcon:        { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pItemLabel:       { flex: 1, fontSize: 15, fontWeight: '700' },
  pItemRight:       { fontSize: 14, fontWeight: '700', marginRight: 6 },

  emptyText:        { textAlign: 'center', fontSize: 13, paddingVertical: 24 },

  protectBanner:    {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    margin: 16, marginTop: 18,
    paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: 16, borderWidth: 1,
  },
  protectIconWrap:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  protectTitle:     { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  protectBody:      { fontSize: 12 },
  protectBtn:       {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
});
