import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, FlatList, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import { isPremiumUser } from '../services/adsService';

const FEATURED = [
  { id: 'f1', tag: 'UPGRADE',     color: '#00ffa3', title: 'Go Premium', sub: 'Remove ads · Priority calls · Full encryption shield', action: 'premium' },
  { id: 'f2', tag: 'SPONSORED',   color: '#6C63FF', title: 'Auxxilus Fitnesswear', sub: 'Gear up in style — use code VAULT10 for 10% off', url: 'https://auxxilus.com' },
  { id: 'f3', tag: 'NEW FEATURE', color: '#00b8ff', title: 'Offline Messaging', sub: 'Send messages to nearby VaultChat users — no internet needed' },
];

const CATEGORIES = ['All','Business','Health','Tech','Finance','Lifestyle','Community','Privacy','Travel'];

const DEFAULT_CHANNELS = [
  { id:'c1', name:'VaultChat News',       emoji:'📢', members:12400, cat:'Community', desc:'Official updates and announcements', joined:false },
  { id:'c2', name:'Privacy First',        emoji:'🔒', members:8900,  cat:'Privacy',   desc:'Tips to protect your digital life', joined:false },
  { id:'c3', name:'Rural Tech',           emoji:'🌾', members:3200,  cat:'Tech',      desc:'Tech that works without 5G', joined:false },
  { id:'c4', name:'Small Biz Owners',     emoji:'🏪', members:5600,  cat:'Business',  desc:'Private business community', joined:false },
  { id:'c5', name:'Wellness Circle',      emoji:'🧘', members:7100,  cat:'Health',    desc:'Mental health & wellness', joined:false },
  { id:'c6', name:'Finance Underground',  emoji:'💰', members:9800,  cat:'Finance',   desc:'Personal finance, no fluff', joined:false },
  { id:'c7', name:'Off the Grid',         emoji:'🏕️', members:2300,  cat:'Lifestyle', desc:'Minimalism & outdoor living', joined:false },
  { id:'c8', name:'Travel Collective',    emoji:'✈️', members:6700,  cat:'Travel',    desc:'Destinations & hidden gems', joined:false },
];

export default function DiscoverScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [search,    setSearch]    = useState('');
  const [cat,       setCat]       = useState('All');
  const [channels,  setChannels]  = useState(DEFAULT_CHANNELS);
  const [featIdx,   setFeatIdx]   = useState(0);
  const [adModal,   setAdModal]   = useState(false);
  const [adName,    setAdName]    = useState('');
  const [adMsg,     setAdMsg]     = useState('');
  const [adUrl,     setAdUrl]     = useState('');
  // Premium gate — paying users skip the SPONSORED rotation entirely
  // ("Remove all ads" benefit). Refreshed on focus so an upgrade
  // takes effect immediately.
  const [premium,   setPremium]   = useState(false);

  useEffect(() => {
    loadUserChannels();
    isPremiumUser().then(setPremium);
    const focusUnsub = navigation?.addListener?.('focus', () => isPremiumUser().then(setPremium));
    const t = setInterval(() => setFeatIdx(i => (i + 1) % Math.max(1, visibleFeatured.length)), 4000);
    return () => { clearInterval(t); try { focusUnsub?.(); } catch {} };
  }, [navigation]);

  // Featured rotation visible to the user — premium users see the
  // non-sponsored entries only (filters out anything tagged
  // SPONSORED so the carousel skips ads automatically).
  const visibleFeatured = premium
    ? FEATURED.filter(f => f.tag !== 'SPONSORED')
    : FEATURED;

  async function loadUserChannels() {
    const raw = await AsyncStorage.getItem('vaultchat_user_channels');
    if (!raw) return;
    const user = JSON.parse(raw);
    setChannels(prev => {
      const ids = new Set(prev.map(c => c.id));
      const merged = [...prev];
      user.forEach(c => { if (!ids.has(c.id)) merged.push(c); });
      return merged;
    });
  }

  function toggleJoin(id) {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, joined: !c.joined, members: c.joined ? c.members - 1 : c.members + 1 } : c));
    Alert.alert('Done', channels.find(c=>c.id===id)?.joined ? 'Left channel.' : 'Joined channel!');
  }

  async function submitAd() {
    if (!adName.trim() || !adMsg.trim()) { Alert.alert('Fill in all fields'); return; }
    Alert.alert('Submitted!', "Your ad has been submitted for review. We'll reach out within 48 hours.");
    setAdModal(false); setAdName(''); setAdMsg(''); setAdUrl('');
  }

  // Use the premium-filtered list so paying users never see a
  // sponsored card flash by during the rotation.
  const feat = visibleFeatured[featIdx % visibleFeatured.length];
  const filtered = channels.filter(c =>
    (cat === 'All' || c.cat === cat) &&
    (c.name.toLowerCase().includes(search.toLowerCase()) || c.desc.toLowerCase().includes(search.toLowerCase()))
  );
  const trending = [...channels].sort((a,b) => b.members - a.members).slice(0,5);

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header — back chevron added for the Stack-push entry path
          (Discover used to be a tab root; canGoBack guard keeps the
          chevron hidden if it ever lands as a tab again). */}
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        {navigation.canGoBack && navigation.canGoBack() ? (
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Text style={[s.backTx, { color: accent }]}>‹</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={[s.headerTitle, { color: tx }]}>Discover</Text>
        <TouchableOpacity style={[s.offersBtn, { backgroundColor: accent }]} onPress={() => navigation.navigate('OfferInbox')}>
          <Text style={{ color: '#000', fontWeight: '800', fontSize: 13 }}>🎁 Offers</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Featured carousel */}
        <View style={[s.featCard, { backgroundColor: card, borderColor: border }]}>
          <View style={[s.featTag, { backgroundColor: feat.color + '22' }]}>
            <Text style={[s.featTagTx, { color: feat.color }]}>{feat.tag}</Text>
          </View>
          <Text style={[s.featTitle, { color: tx }]}>{feat.title}</Text>
          <Text style={[s.featSub, { color: sub }]}>{feat.sub}</Text>
          <TouchableOpacity style={[s.featBtn, { backgroundColor: feat.color }]}
            onPress={() => {
              if (feat.action === 'premium') navigation.navigate('Premium');
              else if (feat.url) Linking.openURL(feat.url);
            }}>
            <Text style={{ color: '#000', fontWeight: '700', fontSize: 13 }}>
              {feat.action === 'premium' ? 'Upgrade Now' : feat.url ? 'Learn More' : 'Explore'}
            </Text>
          </TouchableOpacity>
          <View style={s.dots}>
            {visibleFeatured.map((_, i) => <View key={i} style={[s.dot, { backgroundColor: i===featIdx % Math.max(1, visibleFeatured.length) ? accent : border }]} />)}
          </View>
        </View>

        {/* Trending */}
        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={[s.sectionTitle, { color: tx }]}>🔥 Trending Now</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Trending')}>
              <Text style={[s.seeAll, { color: accent }]}>See All</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {trending.map(c => (
              <TouchableOpacity key={c.id} style={[s.trendCard, { backgroundColor: card, borderColor: border }]}
                onPress={() => toggleJoin(c.id)}>
                <Text style={{ fontSize: 28 }}>{c.emoji}</Text>
                <Text style={[s.trendName, { color: tx }]} numberOfLines={1}>{c.name}</Text>
                <Text style={[s.trendMembers, { color: sub }]}>{(c.members/1000).toFixed(1)}k members</Text>
                <View style={[s.joinBtn, { backgroundColor: c.joined ? border : accent }]}>
                  <Text style={{ color: c.joined ? sub : '#000', fontWeight: '700', fontSize: 12 }}>
                    {c.joined ? 'Joined' : 'Join'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Search */}
        <View style={[s.searchWrap, { backgroundColor: inputBg, borderColor: border }]}>
          <Text style={{ color: sub }}>🔍  </Text>
          <TextInput style={[s.searchInput, { color: tx }]} placeholder="Search channels…"
            placeholderTextColor={sub} value={search} onChangeText={setSearch} />
        </View>

        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {CATEGORIES.map(c => (
            <TouchableOpacity key={c} style={[s.chip, { backgroundColor: cat===c ? accent : card, borderColor: border }]}
              onPress={() => setCat(c)}>
              <Text style={{ color: cat===c ? '#000' : sub, fontWeight: '600', fontSize: 12 }}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Channel list */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: tx }]}>Public Channels</Text>
          {filtered.map(c => (
            <View key={c.id} style={[s.channelRow, { backgroundColor: card, borderColor: border }]}>
              <Text style={{ fontSize: 26, marginRight: 12 }}>{c.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.channelName, { color: tx }]}>{c.name}</Text>
                <Text style={[s.channelDesc, { color: sub }]}>{c.desc}</Text>
                <Text style={[s.channelMembers, { color: sub }]}>{c.members.toLocaleString()} members</Text>
              </View>
              <TouchableOpacity style={[s.joinBtn, { backgroundColor: c.joined ? border : accent }]}
                onPress={() => toggleJoin(c.id)}>
                <Text style={{ color: c.joined ? sub : '#000', fontWeight: '700', fontSize: 12 }}>
                  {c.joined ? 'Joined' : 'Join'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Advertise CTA */}
        <TouchableOpacity style={[s.advertiseBtn, { backgroundColor: card, borderColor: border }]}
          onPress={() => setAdModal(true)}>
          <Text style={[{ color: tx, fontWeight: '700' }]}>📣 Advertise Your Brand</Text>
          <Text style={[{ color: sub, fontSize: 12, marginTop: 4 }]}>Reach VaultChat's privacy-conscious audience</Text>
        </TouchableOpacity>

        <Text style={[s.privacyNote, { color: sub }]}>
          🔒 Ads never appear in your private chats. You are in control.
        </Text>
      </ScrollView>

      {/* Ad submission modal */}
      {adModal && (
        <View style={[s.modal, { backgroundColor: bg }]}>
          <View style={[s.modalCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.modalTitle, { color: tx }]}>Advertise Your Brand</Text>
            <TextInput style={[s.modalInput, { color: tx, backgroundColor: inputBg }]}
              placeholder="Brand name" placeholderTextColor={sub} value={adName} onChangeText={setAdName} />
            <TextInput style={[s.modalInput, { color: tx, backgroundColor: inputBg, height: 80 }]}
              placeholder="Your message" placeholderTextColor={sub} value={adMsg} onChangeText={setAdMsg} multiline />
            <TextInput style={[s.modalInput, { color: tx, backgroundColor: inputBg }]}
              placeholder="URL (optional)" placeholderTextColor={sub} value={adUrl} onChangeText={setAdUrl} keyboardType="url" autoCapitalize="none" />
            <TouchableOpacity style={[s.modalBtn, { backgroundColor: accent }]} onPress={submitAd}>
              <Text style={{ color: '#000', fontWeight: '700' }}>Submit for Review</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAdModal(false)} style={{ alignItems: 'center', padding: 12 }}>
              <Text style={{ color: sub }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, gap: 8 },
  backBtn:       { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTx:        { fontSize: 30, fontWeight: 'bold' },
  headerTitle:   { flex: 1, fontSize: 24, fontWeight: '800' },
  offersBtn:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  featCard:      { margin: 16, borderRadius: 20, padding: 20, borderWidth: 1 },
  featTag:       { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 10 },
  featTagTx:     { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  featTitle:     { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  featSub:       { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  featBtn:       { alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  dots:          { flexDirection: 'row', gap: 6, marginTop: 16 },
  dot:           { width: 6, height: 6, borderRadius: 3 },
  section:       { paddingHorizontal: 16, marginBottom: 20 },
  sectionRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:  { fontSize: 17, fontWeight: '700' },
  seeAll:        { fontSize: 13, fontWeight: '600' },
  trendCard:     { width: 140, borderRadius: 16, padding: 14, borderWidth: 1, alignItems: 'center', gap: 6 },
  trendName:     { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  trendMembers:  { fontSize: 11 },
  joinBtn:       { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 10 },
  searchWrap:    { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
  searchInput:   { flex: 1, fontSize: 15 },
  chips:         { paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  chip:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  channelRow:    { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1 },
  channelName:   { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  channelDesc:   { fontSize: 12, marginBottom: 2 },
  channelMembers:{ fontSize: 11 },
  advertiseBtn:  { margin: 16, borderRadius: 16, padding: 18, borderWidth: 1, alignItems: 'center' },
  privacyNote:   { textAlign: 'center', fontSize: 12, marginBottom: 32, paddingHorizontal: 24 },
  modal:         { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)' },
  modalCard:     { width: '88%', borderRadius: 24, padding: 24, borderWidth: 1 },
  modalTitle:    { fontSize: 18, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  modalInput:    { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, fontSize: 15 },
  modalBtn:      { borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 4 },
});
