// VaultChat — BusinessScreen
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';

const PLANS = [
  { id: 'starter', name: 'Starter', price: '$29/mo',  limit: '500 customers',    color: '#0057a8' },
  { id: 'growth',  name: 'Growth',  price: '$79/mo',  limit: '2,000 customers',  color: '#7c3aed' },
  { id: 'pro',     name: 'Pro',     price: '$199/mo', limit: 'Unlimited',         color: '#0e7490' },
];

const SAMPLE_BUSINESSES = [
  { id: 'b1', name: 'Auxxilus Fitnesswear', emoji: '💪', lastMsg: 'New collection just dropped!', time: '2m', unread: 1 },
  { id: 'b2', name: 'iO SKIN™',             emoji: '✨', lastMsg: 'Your order has shipped',       time: '1h', unread: 0 },
];

const TEMPLATES = ['📅 Appointment reminder', '🛍️ Special offer', '📦 Order update', '👋 Welcome message'];

export default function BusinessScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [tab,         setTab]         = useState('inbox');
  const [businesses,  setBusinesses]  = useState(SAMPLE_BUSINESSES);
  const [plan,        setPlan]        = useState(null);
  const [planModal,   setPlanModal]   = useState(false);
  const [setupModal,  setSetupModal]  = useState(false);
  const [followModal, setFollowModal] = useState(false);
  const [bizCode,     setBizCode]     = useState('');
  const [broadcast,   setBroadcast]   = useState('');

  useEffect(() => {
    AsyncStorage.getItem('vaultchat_biz_plan').then(s => { if (s) setPlan(JSON.parse(s)); });
    AsyncStorage.getItem('vaultchat_followed_biz').then(s => { if (s) setBusinesses(prev => [...prev, ...JSON.parse(s)]); });
  }, []);

  async function subscribePlan(p) {
    setPlan(p);
    await AsyncStorage.setItem('vaultchat_biz_plan', JSON.stringify(p));
    setPlanModal(false);
    Alert.alert('🎉 Subscribed!', `You're now on the ${p.name} plan.`);
  }

  async function followBusiness() {
    if (!bizCode.trim()) { Alert.alert('Enter a business code'); return; }
    const newBiz = { id: `biz_${Date.now()}`, name: `Business (${bizCode})`, emoji: '🏢', lastMsg: 'You followed this business', time: 'now', unread: 0, code: bizCode };
    const updated = [...businesses, newBiz];
    setBusinesses(updated);
    const myBiz = updated.filter(b => b.code);
    await AsyncStorage.setItem('vaultchat_followed_biz', JSON.stringify(myBiz));
    setFollowModal(false); setBizCode('');
    Alert.alert('Following!', `You'll receive messages from this business.`);
  }

  async function sendBroadcast() {
    if (!broadcast.trim()) { Alert.alert('Enter a message'); return; }
    Alert.alert('Sent!', `Broadcast delivered to your opted-in customers.`);
    setBroadcast('');
  }

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <Text style={[s.headerTitle, { color: tx }]}>Business</Text>
        <TouchableOpacity style={[s.followBtn, { borderColor: accent }]} onPress={() => setFollowModal(true)}>
          <Text style={[{ color: accent, fontSize: 13, fontWeight: '700' }]}>+ Follow</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.tabRow, { backgroundColor: card, borderBottomColor: border }]}>
        {['inbox','dashboard','plans'].map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && { borderBottomColor: accent, borderBottomWidth: 2 }]} onPress={() => setTab(t)}>
            <Text style={[s.tabTx, { color: tab === t ? accent : sub }]}>
              {t === 'inbox' ? '📥 Inbox' : t === 'dashboard' ? '📊 Dashboard' : '💼 Plans'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'inbox' && (
        <FlatList
          data={businesses}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={[s.bizRow, { backgroundColor: card, borderColor: border }]}
              onPress={() => navigation.navigate('BusinessChat', { businessId: item.id, businessName: item.name, emoji: item.emoji })}>
              <View style={[s.bizAvatar, { backgroundColor: accent + '22' }]}>
                <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[s.bizName, { color: tx }]}>{item.name}</Text>
                  <View style={[s.verBadge, { backgroundColor: accent + '20' }]}><Text style={{ color: accent, fontSize: 9, fontWeight: '700' }}>BUSINESS</Text></View>
                </View>
                <Text style={[s.bizLast, { color: sub }]} numberOfLines={1}>{item.lastMsg}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.bizTime, { color: sub }]}>{item.time}</Text>
                {item.unread > 0 && <View style={[s.unread, { backgroundColor: accent }]}><Text style={s.unreadTx}>{item.unread}</Text></View>}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={s.empty}><Text style={{ fontSize: 40 }}>🏪</Text><Text style={[s.emptyTx, { color: sub }]}>No businesses followed yet.{'\n'}Tap + Follow to get started.</Text></View>}
        />
      )}

      {tab === 'dashboard' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          {plan ? (
            <>
              <View style={[s.statRow, { backgroundColor: card, borderColor: border }]}>
                {[{ label: 'Customers', val: '247' }, { label: 'Delivered', val: '1,892' }, { label: 'Open Rate', val: '68%' }].map((st, i) => (
                  <View key={i} style={s.stat}>
                    <Text style={[s.statVal, { color: accent }]}>{st.val}</Text>
                    <Text style={[s.statLabel, { color: sub }]}>{st.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={[s.sectionTitle, { color: tx }]}>Broadcast Message</Text>
              <TextInput style={[s.broadcastInput, { backgroundColor: inputBg, color: tx, borderColor: border }]}
                placeholder="Write your message to all customers…" placeholderTextColor={sub}
                value={broadcast} onChangeText={setBroadcast} multiline />
              <Text style={[s.templateLabel, { color: sub }]}>Quick templates</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {TEMPLATES.map((t, i) => (
                  <TouchableOpacity key={i} style={[s.template, { backgroundColor: card, borderColor: border }]} onPress={() => setBroadcast(t)}>
                    <Text style={[{ color: tx, fontSize: 13 }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={[s.broadcastBtn, { backgroundColor: accent }]} onPress={sendBroadcast}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Send to All Customers</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={[s.noPlanCard, { backgroundColor: card, borderColor: border }]}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>💼</Text>
              <Text style={[s.noPlanTitle, { color: tx }]}>Start Your Business Account</Text>
              <Text style={[s.noPlanSub, { color: sub }]}>Message your customers privately.{'\n'}They opt in. You never see their data.</Text>
              <TouchableOpacity style={[s.noPlanBtn, { backgroundColor: accent }]} onPress={() => setTab('plans')}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>See Plans</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {tab === 'plans' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          {PLANS.map(p => (
            <View key={p.id} style={[s.planCard, { backgroundColor: card, borderColor: plan?.id === p.id ? p.color : border, borderWidth: plan?.id === p.id ? 2 : 1 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={[s.planName, { color: p.color }]}>{p.name}</Text>
                <Text style={[s.planPrice, { color: tx }]}>{p.price}</Text>
              </View>
              <Text style={[s.planLimit, { color: sub }]}>{p.limit}</Text>
              <TouchableOpacity style={[s.planBtn, { backgroundColor: plan?.id === p.id ? border : p.color }]} onPress={() => subscribePlan(p)}>
                <Text style={[s.planBtnTx, { color: plan?.id === p.id ? sub : '#fff' }]}>
                  {plan?.id === p.id ? '✓ Current Plan' : 'Subscribe'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
          <Text style={[s.bizNote, { color: sub }]}>Customers never share their identity. Messages route through VaultChat's encrypted layer.</Text>
        </ScrollView>
      )}

      {/* Follow business modal */}
      <Modal visible={followModal} transparent animationType="slide" onRequestClose={() => setFollowModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: card }]}>
            <Text style={[s.modalTitle, { color: tx }]}>Follow a Business</Text>
            <Text style={[s.modalSub, { color: sub }]}>Enter the business code or scan their QR at the store</Text>
            <TextInput style={[s.modalInput, { backgroundColor: inputBg, color: tx, borderColor: border }]}
              placeholder="Business code (e.g. VAULT-BIZ-001)" placeholderTextColor={sub}
              value={bizCode} onChangeText={setBizCode} autoCapitalize="characters" />
            <TouchableOpacity style={[s.modalBtn, { backgroundColor: accent }]} onPress={followBusiness}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Follow Business</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFollowModal(false)} style={{ marginTop: 10, alignItems: 'center' }}>
              <Text style={{ color: sub }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle:    { fontSize: 24, fontWeight: '800' },
  followBtn:      { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 7 },
  tabRow:         { flexDirection: 'row', borderBottomWidth: 1 },
  tab:            { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabTx:          { fontSize: 13, fontWeight: '700' },
  bizRow:         { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  bizAvatar:      { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  bizName:        { fontSize: 15, fontWeight: '700' },
  bizLast:        { fontSize: 12, marginTop: 2 },
  bizTime:        { fontSize: 11, marginBottom: 4 },
  verBadge:       { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  unread:         { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  unreadTx:       { color: '#fff', fontSize: 10, fontWeight: '800' },
  empty:          { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTx:        { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  statRow:        { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  stat:           { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statVal:        { fontSize: 22, fontWeight: '800' },
  statLabel:      { fontSize: 11, marginTop: 4 },
  sectionTitle:   { fontSize: 15, fontWeight: '700' },
  broadcastInput: { borderRadius: 14, borderWidth: 1, padding: 14, fontSize: 14, minHeight: 80 },
  templateLabel:  { fontSize: 12, fontWeight: '600' },
  template:       { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  broadcastBtn:   { borderRadius: 14, padding: 14, alignItems: 'center' },
  noPlanCard:     { borderRadius: 20, borderWidth: 1, padding: 32, alignItems: 'center', gap: 8 },
  noPlanTitle:    { fontSize: 18, fontWeight: '800' },
  noPlanSub:      { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  noPlanBtn:      { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },
  planCard:       { borderRadius: 16, padding: 16 },
  planName:       { fontSize: 18, fontWeight: '800' },
  planPrice:      { fontSize: 18, fontWeight: '800' },
  planLimit:      { fontSize: 13, marginBottom: 14 },
  planBtn:        { borderRadius: 12, padding: 12, alignItems: 'center' },
  planBtnTx:      { fontSize: 14, fontWeight: '700' },
  bizNote:        { fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 16 },
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 },
  modalTitle:     { fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  modalSub:       { fontSize: 13, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  modalInput:     { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 14 },
  modalBtn:       { borderRadius: 14, padding: 14, alignItems: 'center' },
});
