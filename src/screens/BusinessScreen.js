import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, Modal } from 'react-native';
import { useTheme } from '../services/theme';

const PLANS = [
  { id:'starter', name:'Starter', price:'$29/mo', limit:'500 customers',    color:'#6C63FF' },
  { id:'growth',  name:'Growth',  price:'$79/mo', limit:'2,000 customers',  color:'#00ffa3' },
  { id:'pro',     name:'Pro',     price:'$199/mo', limit:'Unlimited',       color:'#ffd700' },
];

const TEMPLATES = [
  '📅 Appointment reminder',
  '🛍️ Special offer — limited time',
  '📦 Your order is ready',
  '💬 We wanted to check in',
];

const BUSINESSES = [
  { id:'b1', name:'Auxxilus Fitnesswear', emoji:'💪', unread:2, lastMsg:'New collection is live!' },
  { id:'b2', name:'iO SKIN™',             emoji:'✨', unread:0, lastMsg:'Your order shipped.' },
];

export default function BusinessScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [tab,       setTab]       = useState('inbox');
  const [broadcast, setBroadcast] = useState('');
  const [setupModal,setSetupModal]= useState(false);
  const [bizName,   setBizName]   = useState('');
  const [bizCat,    setBizCat]    = useState('');

  function sendBroadcast() {
    if (!broadcast.trim()) return;
    Alert.alert('Broadcast Sent', `Your message was delivered to your opted-in customers.`);
    setBroadcast('');
  }

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <Text style={[s.title, { color: tx }]}>Business</Text>
        <TouchableOpacity style={[s.setupBtn, { backgroundColor: accent }]} onPress={() => setSetupModal(true)}>
          <Text style={{ color: '#000', fontWeight: '700', fontSize: 13 }}>+ Setup</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.tabs, { backgroundColor: card, borderBottomColor: border }]}>
        {['inbox','dashboard','plans'].map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab===t && { borderBottomColor: accent, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}>
            <Text style={[s.tabTx, { color: tab===t ? accent : sub }]}>
              {t === 'inbox' ? '📥 Inbox' : t === 'dashboard' ? '📊 Dashboard' : '💼 Plans'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'inbox' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Text style={[s.sectionTitle, { color: sub }]}>BUSINESSES YOU FOLLOW</Text>
          {BUSINESSES.map(b => (
            <TouchableOpacity key={b.id} style={[s.bizRow, { backgroundColor: card, borderColor: border }]}
              onPress={() => navigation.navigate('BusinessChat', { bizName: b.name, bizEmoji: b.emoji })}>
              <Text style={{ fontSize: 30 }}>{b.emoji}</Text>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={[{ color: tx, fontWeight: '700' }]}>{b.name}</Text>
                <Text style={[{ color: sub, fontSize: 13 }]} numberOfLines={1}>{b.lastMsg}</Text>
              </View>
              {b.unread > 0 && <View style={[s.unreadBadge, { backgroundColor: accent }]}>
                <Text style={{ color: '#000', fontWeight: '800', fontSize: 11 }}>{b.unread}</Text>
              </View>}
            </TouchableOpacity>
          ))}
          <Text style={[{ color: sub, fontSize: 12, textAlign: 'center', marginTop: 8 }]}>
            Search for a business by name or scan their QR code to opt in.
          </Text>
          <TouchableOpacity style={[s.followBtn, { backgroundColor: card, borderColor: border }]}
            onPress={() => Alert.alert('Follow a Business', 'Enter their business code to opt in to their messages.')}>
            <Text style={[{ color: accent, fontWeight: '700' }]}>+ Follow a Business</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {tab === 'dashboard' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          <View style={[s.statsRow, { gap: 10 }]}>
            {[['Customers','247','👥'],['Delivered','1,840','📨'],['Open Rate','68%','📬']].map(([label,val,icon]) => (
              <View key={label} style={[s.statCard, { backgroundColor: card, borderColor: border }]}>
                <Text style={{ fontSize: 24 }}>{icon}</Text>
                <Text style={[{ color: tx, fontWeight: '800', fontSize: 22 }]}>{val}</Text>
                <Text style={[{ color: sub, fontSize: 11 }]}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={[s.sectionTitle, { color: sub }]}>BROADCAST MESSAGE</Text>
          <View style={[s.broadcastCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[{ color: sub, fontSize: 12, marginBottom: 8 }]}>Quick Templates</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
              {TEMPLATES.map((t,i) => (
                <TouchableOpacity key={i} style={[s.template, { backgroundColor: inputBg, borderColor: border }]}
                  onPress={() => setBroadcast(t)}>
                  <Text style={[{ color: tx, fontSize: 12 }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput style={[s.broadcastInput, { backgroundColor: inputBg, color: tx }]}
              placeholder="Type your message to all customers…" placeholderTextColor={sub}
              value={broadcast} onChangeText={setBroadcast} multiline />
            <TouchableOpacity style={[s.broadcastBtn, { backgroundColor: broadcast.trim() ? accent : border }]}
              onPress={sendBroadcast} disabled={!broadcast.trim()}>
              <Text style={{ color: broadcast.trim() ? '#000' : sub, fontWeight: '700' }}>Send to All Customers</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {tab === 'plans' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          {PLANS.map(p => (
            <View key={p.id} style={[s.planCard, { backgroundColor: card, borderColor: p.color }]}>
              <View style={[s.planBadge, { backgroundColor: p.color + '22' }]}>
                <Text style={[{ color: p.color, fontWeight: '700', fontSize: 13 }]}>{p.name}</Text>
              </View>
              <Text style={[s.planPrice, { color: tx }]}>{p.price}</Text>
              <Text style={[{ color: sub, marginBottom: 14 }]}>Up to {p.limit}</Text>
              <TouchableOpacity style={[s.planBtn, { backgroundColor: p.color }]}
                onPress={() => Alert.alert('Subscribe', `Subscribe to the ${p.name} plan for ${p.price}?`)}>
                <Text style={{ color: '#000', fontWeight: '700' }}>Get Started</Text>
              </TouchableOpacity>
            </View>
          ))}
          <Text style={[{ color: sub, fontSize: 12, textAlign: 'center', lineHeight: 18 }]}>
            Customers never see your business data.{'\n'}Messages route through VaultChat's encrypted layer.
          </Text>
        </ScrollView>
      )}

      <Modal visible={setupModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: bg }]}>
            <Text style={[s.modalTitle, { color: tx }]}>Setup Business Profile</Text>
            <TextInput style={[s.modalInput, { backgroundColor: card, color: tx }]}
              placeholder="Business name" placeholderTextColor={sub} value={bizName} onChangeText={setBizName} />
            <TextInput style={[s.modalInput, { backgroundColor: card, color: tx }]}
              placeholder="Category (e.g. Retail, Health, Food)" placeholderTextColor={sub} value={bizCat} onChangeText={setBizCat} />
            <TouchableOpacity style={[s.planBtn, { backgroundColor: accent }]}
              onPress={() => { setSetupModal(false); Alert.alert('Profile Created', 'Your business profile is ready. Share your code to get customers.'); }}>
              <Text style={{ color: '#000', fontWeight: '700' }}>Create Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSetupModal(false)} style={{ alignItems: 'center', padding: 12 }}>
              <Text style={{ color: sub }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1 },
  title:         { fontSize: 24, fontWeight: '800' },
  setupBtn:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14 },
  tabs:          { flexDirection: 'row', borderBottomWidth: 1 },
  tab:           { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabTx:         { fontWeight: '700', fontSize: 13 },
  sectionTitle:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  bizRow:        { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, borderWidth: 1 },
  unreadBadge:   { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  followBtn:     { borderRadius: 14, padding: 14, borderWidth: 1, alignItems: 'center' },
  statsRow:      { flexDirection: 'row' },
  statCard:      { flex: 1, borderRadius: 16, padding: 14, borderWidth: 1, alignItems: 'center', gap: 4 },
  broadcastCard: { borderRadius: 16, padding: 16, borderWidth: 1 },
  template:      { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  broadcastInput:{ borderRadius: 12, padding: 12, fontSize: 15, minHeight: 80, marginBottom: 12 },
  broadcastBtn:  { borderRadius: 12, padding: 14, alignItems: 'center' },
  planCard:      { borderRadius: 20, padding: 20, borderWidth: 2 },
  planBadge:     { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, marginBottom: 10 },
  planPrice:     { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  planBtn:       { borderRadius: 14, padding: 14, alignItems: 'center' },
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard:     { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44 },
  modalTitle:    { fontSize: 20, fontWeight: '800', marginBottom: 20, textAlign: 'center' },
  modalInput:    { borderRadius: 14, padding: 14, fontSize: 15, marginBottom: 12 },
});
