// VaultChat — OfferInboxScreen
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Switch, Alert, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';

const OFFERS = [
  { id: 'o1', sponsor: 'Auxxilus Fitnesswear', emoji: '💪', title: 'Get 10% off your first order', reward: '3 free Premium days', claimed: false },
  { id: 'o2', sponsor: 'VaultChat',            emoji: '⚡', title: 'Upgrade to Premium this week', reward: '7 free Premium days', claimed: false },
  { id: 'o3', sponsor: 'iO SKIN™',             emoji: '✨', title: 'Discover nature-powered skincare', reward: '2 free Premium days', claimed: false },
  { id: 'o4', sponsor: 'SecureVPN',            emoji: '🛡️', title: 'Stay private on every network', reward: '5 free Premium days', claimed: false },
];

const HISTORY = [
  { id: 'h1', action: 'Completed offer: Auxxilus',       days: 3, date: '3 days ago'  },
  { id: 'h2', action: 'Referred a friend',                days: 7, date: '1 week ago'  },
  { id: 'h3', action: 'Completed offer: VaultChat Beta', days: 14, date: '2 weeks ago' },
];

export default function OfferInboxScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [tab,         setTab]         = useState('offers');
  const [optedIn,     setOptedIn]     = useState(true);
  const [claimed,     setClaimed]     = useState({});
  const [totalDays,   setTotalDays]   = useState(24);

  useEffect(() => {
    AsyncStorage.getItem('vaultchat_offers_claimed').then(s => { if (s) setClaimed(JSON.parse(s)); });
    AsyncStorage.getItem('vaultchat_offers_optin').then(s => { if (s !== null) setOptedIn(JSON.parse(s)); });
  }, []);

  async function claimOffer(offer) {
    if (claimed[offer.id]) return;
    const next = { ...claimed, [offer.id]: true };
    setClaimed(next);
    await AsyncStorage.setItem('vaultchat_offers_claimed', JSON.stringify(next));
    const days = parseInt(offer.reward);
    setTotalDays(t => t + days);
    Alert.alert('🎉 Claimed!', `You earned ${offer.reward}!`);
  }

  async function toggleOptIn(v) {
    setOptedIn(v);
    await AsyncStorage.setItem('vaultchat_offers_optin', JSON.stringify(v));
  }

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={[s.backTx, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tx }]}>Offer Inbox</Text>
        <View style={[s.badge, { backgroundColor: accent }]}>
          <Text style={s.badgeTx}>{totalDays}d</Text>
        </View>
      </View>

      <View style={[s.tabRow, { backgroundColor: card, borderBottomColor: border }]}>
        {['offers', 'rewards'].map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && { borderBottomColor: accent, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}>
            <Text style={[s.tabTx, { color: tab === t ? accent : sub }]}>
              {t === 'offers' ? '🎁 Offers' : '⭐ Rewards'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'offers' ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={[s.optRow, { backgroundColor: card, borderColor: border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.optTitle, { color: tx }]}>Receive Brand Offers</Text>
              <Text style={[s.optSub, { color: sub }]}>Earn free Premium days for engaging with offers</Text>
            </View>
            <Switch value={optedIn} onValueChange={toggleOptIn} trackColor={{ true: accent }} />
          </View>
          {optedIn ? OFFERS.map(offer => (
            <View key={offer.id} style={[s.offerCard, { backgroundColor: card, borderColor: border }]}>
              <Text style={s.offerEmoji}>{offer.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.offerSponsor, { color: accent }]}>{offer.sponsor}</Text>
                <Text style={[s.offerTitle, { color: tx }]}>{offer.title}</Text>
                <Text style={[s.offerReward, { color: sub }]}>🏆 {offer.reward}</Text>
              </View>
              <TouchableOpacity
                style={[s.claimBtn, { backgroundColor: claimed[offer.id] ? border : accent }]}
                onPress={() => claimOffer(offer)}>
                <Text style={[s.claimBtnTx, { color: claimed[offer.id] ? sub : '#fff' }]}>
                  {claimed[offer.id] ? 'Claimed ✓' : 'Claim'}
                </Text>
              </TouchableOpacity>
            </View>
          )) : (
            <View style={[s.offCard, { backgroundColor: card }]}>
              <Text style={s.offEmoji}>🔕</Text>
              <Text style={[s.offTx, { color: sub }]}>Offers are turned off.{'\n'}Toggle above to earn free Premium days.</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={[s.balCard, { backgroundColor: accent }]}>
            <Text style={s.balLabel}>Total Earned</Text>
            <Text style={s.balDays}>{totalDays} days</Text>
            <Text style={s.balSub}>Free Premium</Text>
          </View>
          {HISTORY.map(h => (
            <View key={h.id} style={[s.histRow, { backgroundColor: card, borderColor: border }]}>
              <Text style={[s.histAction, { color: tx }]}>{h.action}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.histDays, { color: accent }]}>+{h.days}d</Text>
                <Text style={[s.histDate, { color: sub }]}>{h.date}</Text>
              </View>
            </View>
          ))}
          <View style={[s.howCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.howTitle, { color: tx }]}>How to earn more</Text>
            {['Claim brand offers (+2–7 days each)', 'Refer a friend (+7 days)', 'Stay Premium for 3 months (+14 days bonus)'].map((t, i) => (
              <Text key={i} style={[s.howItem, { color: sub }]}>• {t}</Text>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  backBtn:     { padding: 4 },
  backTx:      { fontSize: 28, fontWeight: 'bold' },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '800' },
  badge:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeTx:     { color: '#fff', fontSize: 12, fontWeight: '800' },
  tabRow:      { flexDirection: 'row', borderBottomWidth: 1 },
  tab:         { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabTx:       { fontSize: 14, fontWeight: '700' },
  optRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  optTitle:    { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  optSub:      { fontSize: 12 },
  offerCard:   { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  offerEmoji:  { fontSize: 28 },
  offerSponsor:{ fontSize: 11, fontWeight: '700', marginBottom: 2 },
  offerTitle:  { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  offerReward: { fontSize: 12 },
  claimBtn:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  claimBtnTx:  { fontSize: 13, fontWeight: '700' },
  offCard:     { borderRadius: 16, padding: 32, alignItems: 'center' },
  offEmoji:    { fontSize: 40, marginBottom: 12 },
  offTx:       { textAlign: 'center', fontSize: 14, lineHeight: 22 },
  balCard:     { borderRadius: 20, padding: 24, alignItems: 'center' },
  balLabel:    { color: '#fff', fontSize: 12, opacity: 0.8, marginBottom: 4 },
  balDays:     { color: '#fff', fontSize: 48, fontWeight: '900' },
  balSub:      { color: '#fff', fontSize: 14, opacity: 0.9 },
  histRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 14 },
  histAction:  { fontSize: 13, fontWeight: '500', flex: 1 },
  histDays:    { fontSize: 15, fontWeight: '800' },
  histDate:    { fontSize: 11, marginTop: 2 },
  howCard:     { borderRadius: 14, borderWidth: 1, padding: 16 },
  howTitle:    { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  howItem:     { fontSize: 13, lineHeight: 22 },
});
