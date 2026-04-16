import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import { setPremiumUser } from '../services/adsService';

const OFFERS = [
  { id:'o1', brand:'Auxxilus Fitnesswear', emoji:'💪', reward:'3 free Premium days', desc:'Shop performance activewear', claimed:false },
  { id:'o2', brand:'iO SKIN™',             emoji:'✨', reward:'5 free Premium days', desc:'Nature-powered skincare', claimed:false },
  { id:'o3', brand:'VaultChat',            emoji:'🔒', reward:'7 free Premium days', desc:'Refer a friend to VaultChat', claimed:false },
];

const HISTORY = [
  { id:'h1', source:'Welcome bonus',    days:1,  date:'Today' },
  { id:'h2', source:'Daily check-in',   days:1,  date:'Yesterday' },
];

export default function OfferInboxScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [tab,     setTab]     = useState('offers');
  const [offers,  setOffers]  = useState(OFFERS);
  const [optedIn, setOptedIn] = useState(true);
  const [balance, setBalance] = useState(2);

  function claim(id) {
    const offer = offers.find(o => o.id === id);
    if (!offer) return;
    setOffers(prev => prev.map(o => o.id === id ? { ...o, claimed: true } : o));
    setBalance(b => b + parseInt(offer.reward));
    Alert.alert('🎉 Claimed!', `You earned ${offer.reward}. Your Premium balance has been updated.`);
  }

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={[s.backTx, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: tx }]}>Offer Inbox</Text>
        <View style={[s.badge, { backgroundColor: accent }]}>
          <Text style={{ color: '#000', fontWeight: '800', fontSize: 12 }}>🏆 {balance}d</Text>
        </View>
      </View>

      <View style={[s.tabs, { backgroundColor: card, borderBottomColor: border }]}>
        {['offers','rewards'].map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab===t && { borderBottomColor: accent, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}>
            <Text style={[s.tabTx, { color: tab===t ? accent : sub }]}>
              {t === 'offers' ? '🎁 Offers' : '⭐ Rewards'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'offers' ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={[s.optRow, { backgroundColor: card, borderColor: border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[{ color: tx, fontWeight: '700' }]}>Receive Brand Offers</Text>
              <Text style={[{ color: sub, fontSize: 12, marginTop: 2 }]}>Earn free Premium days for engaging</Text>
            </View>
            <Switch value={optedIn} onValueChange={setOptedIn} trackColor={{ false: border, true: accent }} thumbColor="#fff" />
          </View>
          {!optedIn && (
            <Text style={[{ color: sub, fontSize: 13, textAlign: 'center', padding: 20 }]}>
              Offers are turned off. Toggle above to earn free Premium days.
            </Text>
          )}
          {optedIn && offers.map(o => (
            <View key={o.id} style={[s.offerCard, { backgroundColor: card, borderColor: border }]}>
              <Text style={{ fontSize: 32 }}>{o.emoji}</Text>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={[{ color: sub, fontSize: 11, fontWeight: '700', marginBottom: 2 }]}>{o.brand.toUpperCase()}</Text>
                <Text style={[{ color: tx, fontWeight: '600', marginBottom: 4 }]}>{o.desc}</Text>
                <Text style={[{ color: accent, fontWeight: '700', fontSize: 13 }]}>🏆 {o.reward}</Text>
              </View>
              <TouchableOpacity
                style={[s.claimBtn, { backgroundColor: o.claimed ? border : accent }]}
                onPress={() => !o.claimed && claim(o.id)} disabled={o.claimed}>
                <Text style={{ color: o.claimed ? sub : '#000', fontWeight: '700', fontSize: 12 }}>
                  {o.claimed ? 'Claimed' : 'Claim'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={[s.balanceCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[{ color: sub, fontSize: 13 }]}>Total Premium Balance</Text>
            <Text style={[{ color: accent, fontSize: 48, fontWeight: '800' }]}>{balance}</Text>
            <Text style={[{ color: sub }]}>free days earned</Text>
          </View>
          <Text style={[s.sectionTitle, { color: tx }]}>How You Earned It</Text>
          {HISTORY.map(h => (
            <View key={h.id} style={[s.historyRow, { backgroundColor: card, borderColor: border }]}>
              <Text style={[{ color: tx, flex: 1 }]}>{h.source}</Text>
              <Text style={[{ color: accent, fontWeight: '700' }]}>+{h.days}d</Text>
              <Text style={[{ color: sub, fontSize: 12, marginLeft: 12 }]}>{h.date}</Text>
            </View>
          ))}
          <View style={[s.howCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[{ color: tx, fontWeight: '700', marginBottom: 8 }]}>How to earn more</Text>
            {['Claim brand offers → 3–7 days each','Refer friends → 7 days per referral','Daily check-in → 1 day','Upgrade to Premium → unlimited'].map((tip, i) => (
              <Text key={i} style={[{ color: sub, fontSize: 13, marginBottom: 4 }]}>• {tip}</Text>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  back:        { padding: 4 },
  backTx:      { fontSize: 30, fontWeight: 'bold' },
  title:       { flex: 1, fontSize: 20, fontWeight: '800' },
  badge:       { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  tabs:        { flexDirection: 'row', borderBottomWidth: 1 },
  tab:         { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabTx:       { fontWeight: '700', fontSize: 14 },
  optRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, borderWidth: 1 },
  offerCard:   { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, borderWidth: 1 },
  claimBtn:    { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  balanceCard: { borderRadius: 20, padding: 24, borderWidth: 1, alignItems: 'center' },
  sectionTitle:{ fontSize: 16, fontWeight: '700', marginTop: 8 },
  historyRow:  { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, borderWidth: 1 },
  howCard:     { borderRadius: 16, padding: 16, borderWidth: 1, marginTop: 4 },
});
