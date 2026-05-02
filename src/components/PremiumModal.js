// ============================================================
//  PremiumModal — task #92
//  Real-money paywall backed by react-native-iap.
//
//  Pricing (decided 2026-04-25):
//    $4.99/month  · $39.99/year  · 7-day free trial on first sub
//    Annual is the moneymaker (~33% discount vs monthly).
//
//  Apple compliance checklist (App Store Review Guideline 3.1.2):
//    - Show price + billing period clearly                 ✅
//    - Show free trial duration if any                      ✅
//    - Auto-renewal disclosure                              ✅
//    - Restore Purchases button                             ✅
//    - Links to Terms of Use + Privacy Policy               ✅
//    - State that subscription renews unless cancelled 24h
//      before the period ends                               ✅
// ============================================================

import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Platform, Linking,
} from 'react-native';
import {
  initIAP, listPremiumProducts, purchase, restorePurchases,
} from '../services/iapService';
import { setPremiumUser } from '../services/adsService';

const PERKS = [
  { emoji: '🚫', label: 'Remove all ads' },
  { emoji: '📁', label: 'Unlimited chat folders' },
  { emoji: '👥', label: 'Larger groups (up to 256 members)' },
  { emoji: '🎨', label: 'Custom themes & app icons' },
  { emoji: '📌', label: 'Unlimited pinned chats' },
  { emoji: '⚡', label: 'Priority message delivery' },
];

const MONTHLY_ID = 'vaultchat_premium_monthly';
const ANNUAL_ID  = 'vaultchat_premium_annual';

// Fallback prices in case the StoreKit fetch fails (sim, no
// network, sandbox tester not signed in). The real prices arrive
// from Apple via getSubscriptions().
const FALLBACK = {
  [MONTHLY_ID]: { price: '$4.99',  period: 'month' },
  [ANNUAL_ID]:  { price: '$39.99', period: 'year'  },
};

export default function PremiumModal({ visible, onClose, onUpgraded, colors }) {
  const c = colors || { card: '#1C1C1E', text: '#FFFFFF', muted: '#8E8E93', border: '#38383A' };
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState(false);
  const [selected, setSelected] = useState(ANNUAL_ID); // pre-select the moneymaker

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try { await initIAP(); } catch {}
      const list = await listPremiumProducts();
      if (cancelled) return;
      setProducts(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [visible]);

  const productById = (id) => products.find(p => p.productId === id);
  const display = (id) => {
    const p = productById(id);
    if (p) {
      // react-native-iap returns localizedPrice (e.g. "$4.99") and
      // subscriptionPeriodUnitIOS ("MONTH" / "YEAR"). We mirror with
      // safe fallbacks so the UI never shows blanks.
      return {
        price:  p.localizedPrice || FALLBACK[id].price,
        period: (p.subscriptionPeriodUnitIOS || FALLBACK[id].period).toLowerCase(),
        title:  p.title,
      };
    }
    return { ...FALLBACK[id] };
  };

  const handleSubscribe = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await purchase(selected);
      if (ok) {
        // The IAP service flips the cached premium flag inside
        // _onPurchaseUpdated after server-side receipt verification.
        // We mirror it through adsService.setPremiumUser so any code
        // still reading the legacy flag sees premium too.
        await setPremiumUser(true);
        onUpgraded && onUpgraded();
        onClose && onClose();
        Alert.alert(
          'Welcome to Premium 👑',
          'Your free trial has begun. You won\'t be charged until day 7. Cancel anytime in your App Store account settings.',
        );
      }
    } catch (e) {
      Alert.alert('Purchase failed', e?.message || 'Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { restored, premium } = await restorePurchases();
      if (premium) {
        await setPremiumUser(true);
        onUpgraded && onUpgraded();
        onClose && onClose();
        Alert.alert('Welcome back', 'Your Premium subscription has been restored.');
      } else if (restored > 0) {
        Alert.alert('No active subscription', 'We found prior purchases but none are currently active. They may have expired.');
      } else {
        Alert.alert('Nothing to restore', 'No prior VaultChat Premium purchases were found on this Apple ID.');
      }
    } catch (e) {
      Alert.alert('Restore failed', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const monthly = display(MONTHLY_ID);
  const annual  = display(ANNUAL_ID);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: c.card }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.closeX, { color: c.muted }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.crown}>👑</Text>
          <Text style={[styles.title, { color: c.text }]}>VaultChat Premium</Text>
          <Text style={[styles.subtitle, { color: c.muted }]}>
            7 days free, then cancel anytime.
          </Text>

          <ScrollView style={styles.perksList} showsVerticalScrollIndicator={false}>
            {PERKS.map((p) => (
              <View key={p.label} style={styles.perkRow}>
                <Text style={styles.perkEmoji}>{p.emoji}</Text>
                <Text style={[styles.perkLabel, { color: c.text }]}>{p.label}</Text>
              </View>
            ))}
          </ScrollView>

          {loading ? (
            <View style={{ paddingVertical: 30 }}>
              <ActivityIndicator color="#6C63FF" />
            </View>
          ) : (
            <>
              {/* Annual — pre-selected, "best value" badge */}
              <PlanCard
                selected={selected === ANNUAL_ID}
                onPress={() => setSelected(ANNUAL_ID)}
                price={annual.price}
                period={annual.period}
                badge="BEST VALUE — save 33%"
                colors={c}
              />
              {/* Monthly */}
              <PlanCard
                selected={selected === MONTHLY_ID}
                onPress={() => setSelected(MONTHLY_ID)}
                price={monthly.price}
                period={monthly.period}
                colors={c}
              />

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: '#6C63FF', opacity: busy ? 0.6 : 1 }]}
                onPress={handleSubscribe}
                disabled={busy}>
                {busy
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>Start 7-day free trial</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={handleRestore} disabled={busy} style={{ paddingVertical: 8 }}>
                <Text style={[styles.restore, { color: c.muted }]}>Restore Purchases</Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={[styles.legal, { color: c.muted }]}>
            Subscription automatically renews at the end of each period
            unless cancelled at least 24 hours before the period ends.
            Manage or cancel anytime in your App Store account settings.
          </Text>
          <View style={styles.legalLinks}>
            {/* Domain is vaultchat.co (where the policy is hosted on
                Lovable). The /terms and /privacy paths must exist
                or App Review will flag a 404 from the upgrade modal.
                Privacy file is hosted at the long path, mirrored
                here as the canonical URL for App Store compliance. */}
            <Text style={[styles.legalLink, { color: c.muted }]}
                  onPress={() => Linking.openURL('https://vaultchat.co/terms')}>
              Terms of Use
            </Text>
            <Text style={[styles.legalLink, { color: c.muted }]}>·</Text>
            <Text style={[styles.legalLink, { color: c.muted }]}
                  onPress={() => Linking.openURL('https://vaultchat.co/android-privacy.html')}>
              Privacy Policy
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PlanCard({ selected, onPress, price, period, badge, colors }) {
  const c = colors;
  return (
    <TouchableOpacity
      style={[
        styles.planCard,
        { borderColor: selected ? '#6C63FF' : c.border, backgroundColor: selected ? '#6C63FF18' : 'transparent' },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.planRadio}>
        <View style={[styles.radio, { borderColor: selected ? '#6C63FF' : c.border }]}>
          {selected ? <View style={styles.radioDot} /> : null}
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.planPrice, { color: c.text }]}>
          {price} <Text style={[styles.planPeriod, { color: c.muted }]}>/ {period}</Text>
        </Text>
        {badge ? <Text style={styles.planBadge}>{badge}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '92%' },
  headerRow: { alignItems: 'flex-end', marginBottom: 4 },
  closeX:    { fontSize: 18, fontWeight: '600', padding: 4 },
  crown:     { fontSize: 44, textAlign: 'center', marginBottom: 8 },
  title:     { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle:  { fontSize: 14, textAlign: 'center', marginTop: 6, marginBottom: 20 },
  perksList: { marginBottom: 16, maxHeight: 180 },
  perkRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  perkEmoji: { fontSize: 18, marginRight: 12, width: 28, textAlign: 'center' },
  perkLabel: { fontSize: 15, fontWeight: '500' },
  planCard:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 8 },
  planRadio: { marginRight: 12 },
  radio:     { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot:  { width: 12, height: 12, borderRadius: 6, backgroundColor: '#6C63FF' },
  planPrice: { fontSize: 17, fontWeight: '700' },
  planPeriod:{ fontSize: 13, fontWeight: '500' },
  planBadge: { fontSize: 11, color: '#10B981', fontWeight: '700', marginTop: 2, letterSpacing: 0.4 },
  btn:       { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 6, marginBottom: 4 },
  btnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  restore:   { textAlign: 'center', fontSize: 13, fontWeight: '600' },
  legal:     { fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: 8 },
  legalLinks:{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 6 },
  legalLink: { fontSize: 11, textDecorationLine: 'underline' },
});
