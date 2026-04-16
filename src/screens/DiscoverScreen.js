// VaultChat — DiscoverScreen
// Monetization hub: featured carousel, trending channels, public channels, Offer Inbox
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  FlatList, TextInput, Modal, Alert, Linking, Animated,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';

const { width: SW } = Dimensions.get('window');

const FEATURED = [
  { id: 'f1', tag: 'UPGRADE',  color: '#0057a8', emoji: '⚡', title: 'Go Premium',        sub: 'Remove ads · HD calls · Privacy shield', action: 'premium' },
  { id: 'f2', tag: 'SPONSORED',color: '#7c3aed', emoji: '💪', title: 'Auxxilus Fitnesswear', sub: 'Performance gear. Code VAULT10 → 10% off', action: 'url', url: 'https://auxxilus.com' },
  { id: 'f3', tag: 'NEW',      color: '#0e7490', emoji: '🗺️', title: 'Offline Messaging',  sub: 'Send messages without internet — try Nearby', action: 'nearby' },
];

const TRENDING_CHANNELS = [
  { id: 'tc1', name: 'Privacy First',    emoji: '🛡️', members: 12400, category: 'Privacy'   },
  { id: 'tc2', name: 'Rural Connect',    emoji: '🌾', members: 8700,  category: 'Community' },
  { id: 'tc3', name: 'VaultBiz',         emoji: '💼', members: 5300,  category: 'Business'  },
  { id: 'tc4', name: 'Crypto Signals',   emoji: '📈', members: 19200, category: 'Finance'   },
  { id: 'tc5', name: 'Health Vault',     emoji: '🏥', members: 4100,  category: 'Health'    },
  { id: 'tc6', name: 'Dev Corner',       emoji: '💻', members: 7800,  category: 'Tech'      },
];

const PUBLIC_CHANNELS = [
  { id: 'pc1',  name: 'Privacy News',      emoji: '🔏', members: 8900,  category: 'Privacy'   },
  { id: 'pc2',  name: 'Small Business Hub',emoji: '🏪', members: 3200,  category: 'Business'  },
  { id: 'pc3',  name: 'Rural Living',      emoji: '🌄', members: 5600,  category: 'Community' },
  { id: 'pc4',  name: 'Fintech Talk',      emoji: '💳', members: 11200, category: 'Finance'   },
  { id: 'pc5',  name: 'Wellness Daily',    emoji: '🧘', members: 6700,  category: 'Health'    },
  { id: 'pc6',  name: 'AI & Ethics',       emoji: '🤖', members: 14300, category: 'Tech'      },
  { id: 'pc7',  name: 'Travel Vault',      emoji: '✈️', members: 9100,  category: 'Travel'    },
  { id: 'pc8',  name: 'Lifestyle Secure',  emoji: '🌿', members: 4400,  category: 'Lifestyle' },
  { id: 'pc9',  name: 'Community Watch',   emoji: '👁️', members: 2800,  category: 'Community' },
  { id: 'pc10', name: 'Secure Finance',    emoji: '🏦', members: 7600,  category: 'Finance'   },
];

const CATEGORIES = ['All','Business','Health','Tech','Finance','Lifestyle','Community','Privacy','Travel'];

export default function DiscoverScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [search,   setSearch]   = useState('');
  const [category, setCategory] = useState('All');
  const [joined,   setJoined]   = useState({});
  const [adModal,  setAdModal]  = useState(false);
  const [adName,   setAdName]   = useState('');
  const [adEmoji,  setAdEmoji]  = useState('');
  const [adMsg,    setAdMsg]    = useState('');
  const [adUrl,    setAdUrl]    = useState('');
  const [featIdx,  setFeatIdx]  = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem('vaultchat_joined_channels').then(s => {
      if (s) setJoined(JSON.parse(s));
    });
    const timer = setInterval(() => setFeatIdx(i => (i + 1) % FEATURED.length), 4000);
    return () => clearInterval(timer);
  }, []);

  async function toggleJoin(id) {
    const next = { ...joined, [id]: !joined[id] };
    setJoined(next);
    await AsyncStorage.setItem('vaultchat_joined_channels', JSON.stringify(next));
  }

  function handleFeaturedTap(item) {
    if (item.action === 'premium')  navigation.navigate('Premium');
    else if (item.action === 'url') Linking.openURL(item.url);
    else if (item.action === 'nearby') navigation.navigate('Nearby');
  }

  async function submitAd() {
    if (!adName.trim() || !adMsg.trim()) { Alert.alert('Fill in name and message'); return; }
    try {
      const { supabase } = require('../services/supabase');
      await supabase.from('brand_ads').insert({ name: adName.trim(), emoji: adEmoji.trim() || '📢', message: adMsg.trim(), url: adUrl.trim(), status: 'pending' });
    } catch {}
    await AsyncStorage.setItem(`ad_submission_${Date.now()}`, JSON.stringify({ name: adName, emoji: adEmoji, message: adMsg, url: adUrl }));
    Alert.alert('Submitted!', 'Your ad will be reviewed before appearing in Discover.');
    setAdModal(false); setAdName(''); setAdEmoji(''); setAdMsg(''); setAdUrl('');
  }

  const filtered = PUBLIC_CHANNELS.filter(c =>
    (category === 'All' || c.category === category) &&
    (c.name.toLowerCase().includes(search.toLowerCase()))
  );

  const feat = FEATURED[featIdx];

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <Text style={[s.headerTitle, { color: tx }]}>Discover</Text>
        <TouchableOpacity style={[s.offerBtn, { backgroundColor: accent }]}
          onPress={() => navigation.navigate('OfferInbox')}>
          <Text style={[s.offerBtnTx, { color: '#fff' }]}>🎁 Offers</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Featured carousel */}
        <TouchableOpacity style={[s.featCard, { backgroundColor: feat.color }]} activeOpacity={0.9} onPress={() => handleFeaturedTap(feat)}>
          <View style={[s.featTag, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={s.featTagTx}>{feat.tag}</Text>
          </View>
          <Text style={s.featEmoji}>{feat.emoji}</Text>
          <Text style={s.featTitle}>{feat.title}</Text>
          <Text style={s.featSub}>{feat.sub}</Text>
          <View style={s.featDots}>
            {FEATURED.map((_, i) => (
              <View key={i} style={[s.featDot, i === featIdx && s.featDotActive]} />
            ))}
          </View>
        </TouchableOpacity>

        {/* Trending Now */}
        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={[s.sectionTitle, { color: tx }]}>🔥 Trending Now</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Trending')}>
              <Text style={[s.seeAll, { color: accent }]}>See All</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
            {TRENDING_CHANNELS.map(ch => (
              <View key={ch.id} style={[s.trendCard, { backgroundColor: card, borderColor: border }]}>
                <Text style={s.trendEmoji}>{ch.emoji}</Text>
                <Text style={[s.trendName, { color: tx }]} numberOfLines={1}>{ch.name}</Text>
                <Text style={[s.trendMembers, { color: sub }]}>{(ch.members / 1000).toFixed(1)}K members</Text>
                <TouchableOpacity
                  style={[s.joinBtn, { backgroundColor: joined[ch.id] ? border : accent }]}
                  onPress={() => toggleJoin(ch.id)}>
                  <Text style={[s.joinBtnTx, { color: joined[ch.id] ? sub : '#fff' }]}>
                    {joined[ch.id] ? 'Joined' : 'Join'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Search */}
        <View style={[s.searchRow, { paddingHorizontal: 16 }]}>
          <View style={[s.searchBox, { backgroundColor: inputBg, borderColor: border }]}>
            <Text style={{ color: sub }}>🔍</Text>
            <TextInput
              style={[s.searchInput, { color: tx }]}
              placeholder="Search channels…"
              placeholderTextColor={sub}
              value={search} onChangeText={setSearch}
            />
          </View>
        </View>

        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity key={cat}
              style={[s.chip, { backgroundColor: category === cat ? accent : card, borderColor: border }]}
              onPress={() => setCategory(cat)}>
              <Text style={[s.chipTx, { color: category === cat ? '#fff' : sub }]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Public channels list */}
        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {filtered.map(ch => (
            <View key={ch.id} style={[s.pubRow, { backgroundColor: card, borderColor: border }]}>
              <Text style={s.pubEmoji}>{ch.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.pubName, { color: tx }]}>{ch.name}</Text>
                <Text style={[s.pubMeta, { color: sub }]}>{ch.category} · {ch.members.toLocaleString()} members</Text>
              </View>
              <TouchableOpacity
                style={[s.joinSmall, { backgroundColor: joined[ch.id] ? border : accent }]}
                onPress={() => toggleJoin(ch.id)}>
                <Text style={[s.joinSmallTx, { color: joined[ch.id] ? sub : '#fff' }]}>
                  {joined[ch.id] ? '✓' : 'Join'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Advertise CTA */}
        <TouchableOpacity style={[s.adCta, { backgroundColor: card, borderColor: border }]}
          onPress={() => setAdModal(true)}>
          <Text style={[s.adCtaTx, { color: tx }]}>📣 Advertise Your Brand</Text>
          <Text style={[s.adCtaSub, { color: sub }]}>Reach privacy-focused users · Submit for review</Text>
        </TouchableOpacity>

        {/* Privacy note */}
        <Text style={[s.privacyNote, { color: sub }]}>🔒 Ads never appear in your private chats</Text>
      </ScrollView>

      {/* Ad submission modal */}
      <Modal visible={adModal} transparent animationType="slide" onRequestClose={() => setAdModal(false)}>
        <View style={[s.modalOverlay]}>
          <View style={[s.modalSheet, { backgroundColor: card }]}>
            <Text style={[s.modalTitle, { color: tx }]}>Advertise Your Brand</Text>
            {[
              { placeholder: 'Brand name', value: adName, set: setAdName },
              { placeholder: 'Emoji (optional)', value: adEmoji, set: setAdEmoji },
              { placeholder: 'Your message (max 120 chars)', value: adMsg, set: setAdMsg, multi: true },
              { placeholder: 'Website URL (optional)', value: adUrl, set: setAdUrl, kb: 'url' },
            ].map((f, i) => (
              <TextInput key={i}
                style={[s.modalInput, { backgroundColor: inputBg, color: tx, borderColor: border }]}
                placeholder={f.placeholder} placeholderTextColor={sub}
                value={f.value} onChangeText={f.set}
                multiline={f.multi} keyboardType={f.kb || 'default'}
                maxLength={f.multi ? 120 : 80}
              />
            ))}
            <TouchableOpacity style={[s.submitBtn, { backgroundColor: accent }]} onPress={submitAd}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>Submit for Review</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAdModal(false)} style={{ marginTop: 10, alignItems: 'center' }}>
              <Text style={{ color: sub }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle:  { fontSize: 24, fontWeight: '800' },
  offerBtn:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  offerBtnTx:   { fontSize: 13, fontWeight: '700' },
  featCard:     { margin: 16, borderRadius: 20, padding: 20, minHeight: 160 },
  featTag:      { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginBottom: 10 },
  featTagTx:    { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  featEmoji:    { fontSize: 36, marginBottom: 8 },
  featTitle:    { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  featSub:      { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  featDots:     { flexDirection: 'row', gap: 6, marginTop: 14 },
  featDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  featDotActive:{ backgroundColor: '#fff', width: 18 },
  section:      { marginTop: 8 },
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  seeAll:       { fontSize: 13, fontWeight: '600' },
  trendCard:    { width: 140, borderRadius: 16, borderWidth: 1, padding: 14, alignItems: 'center' },
  trendEmoji:   { fontSize: 28, marginBottom: 6 },
  trendName:    { fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  trendMembers: { fontSize: 11, marginBottom: 10 },
  joinBtn:      { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 14 },
  joinBtnTx:    { fontSize: 12, fontWeight: '700' },
  searchRow:    { marginTop: 12 },
  searchBox:    { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput:  { flex: 1, fontSize: 14 },
  chip:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipTx:       { fontSize: 12, fontWeight: '600' },
  pubRow:       { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 12, gap: 12 },
  pubEmoji:     { fontSize: 24 },
  pubName:      { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  pubMeta:      { fontSize: 11 },
  joinSmall:    { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12 },
  joinSmallTx:  { fontSize: 12, fontWeight: '700' },
  adCta:        { margin: 16, borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'center' },
  adCtaTx:      { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  adCtaSub:     { fontSize: 12, textAlign: 'center' },
  privacyNote:  { textAlign: 'center', fontSize: 12, marginBottom: 8, paddingHorizontal: 32 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 },
  modalTitle:   { fontSize: 18, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  modalInput:   { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 10 },
  submitBtn:    { borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 6 },
});
