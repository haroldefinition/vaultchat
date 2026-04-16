// VaultChat — TrendingScreen
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';

const ALL_CHANNELS = [
  { id:'a1',  name:'Privacy First',      emoji:'🛡️', members:12400, category:'Privacy',   trending:true  },
  { id:'a2',  name:'Rural Connect',      emoji:'🌾', members:8700,  category:'Community', trending:true  },
  { id:'a3',  name:'VaultBiz',           emoji:'💼', members:5300,  category:'Business',  trending:true  },
  { id:'a4',  name:'Crypto Signals',     emoji:'📈', members:19200, category:'Finance',   trending:true  },
  { id:'a5',  name:'Health Vault',       emoji:'🏥', members:4100,  category:'Health',    trending:false },
  { id:'a6',  name:'Dev Corner',         emoji:'💻', members:7800,  category:'Tech',      trending:true  },
  { id:'a7',  name:'Privacy News',       emoji:'🔏', members:8900,  category:'Privacy',   trending:false },
  { id:'a8',  name:'Small Business Hub', emoji:'🏪', members:3200,  category:'Business',  trending:false },
  { id:'a9',  name:'Rural Living',       emoji:'🌄', members:5600,  category:'Community', trending:false },
  { id:'a10', name:'Fintech Talk',       emoji:'💳', members:11200, category:'Finance',   trending:true  },
  { id:'a11', name:'Wellness Daily',     emoji:'🧘', members:6700,  category:'Health',    trending:false },
  { id:'a12', name:'AI & Ethics',        emoji:'🤖', members:14300, category:'Tech',      trending:true  },
];

const CATEGORIES = ['All','Business','Health','Tech','Finance','Lifestyle','Community','Privacy','Travel'];

export default function TrendingScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [search,      setSearch]      = useState('');
  const [filter,      setFilter]      = useState('All');     // All / Trending / Mine
  const [category,    setCategory]    = useState('All');
  const [joined,      setJoined]      = useState({});
  const [createModal, setCreateModal] = useState(false);
  const [chName,      setChName]      = useState('');
  const [chEmoji,     setChEmoji]     = useState('');
  const [chDesc,      setChDesc]      = useState('');
  const [chCat,       setChCat]       = useState('Community');
  const [myChannels,  setMyChannels]  = useState([]);

  useEffect(() => {
    AsyncStorage.getItem('vaultchat_joined_channels').then(s => { if (s) setJoined(JSON.parse(s)); });
    AsyncStorage.getItem('vaultchat_my_channels').then(s => { if (s) setMyChannels(JSON.parse(s)); });
  }, []);

  async function toggleJoin(id) {
    const next = { ...joined, [id]: !joined[id] };
    setJoined(next);
    await AsyncStorage.setItem('vaultchat_joined_channels', JSON.stringify(next));
  }

  async function createChannel() {
    if (!chName.trim()) { Alert.alert('Enter a channel name'); return; }
    const newCh = {
      id: `my_${Date.now()}`,
      name: chName.trim(),
      emoji: chEmoji.trim() || '📢',
      category: chCat,
      desc: chDesc.trim(),
      members: 1,
      trending: false,
      isOwned: true,
    };
    const updated = [...myChannels, newCh];
    setMyChannels(updated);
    await AsyncStorage.setItem('vaultchat_my_channels', JSON.stringify(updated));
    setCreateModal(false); setChName(''); setChEmoji(''); setChDesc('');
    Alert.alert('Created!', `#${newCh.name} is live in Discover.`);
  }

  const allChannels = [...ALL_CHANNELS, ...myChannels];
  const filtered = allChannels.filter(ch => {
    const matchSearch = ch.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'All' || ch.category === category;
    const matchFilter = filter === 'All' ? true : filter === 'Trending' ? ch.trending : (joined[ch.id] || ch.isOwned);
    return matchSearch && matchCat && matchFilter;
  });

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={[s.backTx, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tx }]}>Trending</Text>
        <TouchableOpacity style={[s.createBtn, { backgroundColor: accent }]} onPress={() => setCreateModal(true)}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>+ Create</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.searchBox, { backgroundColor: inputBg, borderColor: border, marginHorizontal: 16, marginTop: 12 }]}>
        <Text style={{ color: sub }}>🔍</Text>
        <TextInput style={[s.searchInput, { color: tx }]} placeholder="Search channels…" placeholderTextColor={sub} value={search} onChangeText={setSearch} />
      </View>

      <View style={[s.filterRow]}>
        {['All','Trending','Mine'].map(f => (
          <TouchableOpacity key={f} style={[s.filterBtn, filter === f && { backgroundColor: accent }]} onPress={() => setFilter(f)}>
            <Text style={[s.filterTx, { color: filter === f ? '#fff' : sub }]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity key={cat} style={[s.chip, { backgroundColor: category === cat ? accent : card, borderColor: border }]} onPress={() => setCategory(cat)}>
            <Text style={[s.chipTx, { color: category === cat ? '#fff' : sub }]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item }) => (
          <View style={[s.chRow, { backgroundColor: card, borderColor: border }]}>
            <Text style={s.chEmoji}>{item.emoji}</Text>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[s.chName, { color: tx }]}>{item.name}</Text>
                {item.trending && <View style={[s.trendBadge, { backgroundColor: '#ff6b0020' }]}><Text style={{ color: '#ff6b00', fontSize: 10, fontWeight: '700' }}>🔥 HOT</Text></View>}
                {item.isOwned && <View style={[s.trendBadge, { backgroundColor: accent + '20' }]}><Text style={{ color: accent, fontSize: 10, fontWeight: '700' }}>YOURS</Text></View>}
              </View>
              <Text style={[s.chMeta, { color: sub }]}>{item.category} · {(item.members / 1000).toFixed(1)}K members</Text>
            </View>
            <TouchableOpacity style={[s.joinBtn, { backgroundColor: (joined[item.id] || item.isOwned) ? border : accent }]}
              onPress={() => !item.isOwned && toggleJoin(item.id)}>
              <Text style={[s.joinTx, { color: (joined[item.id] || item.isOwned) ? sub : '#fff' }]}>
                {item.isOwned ? 'Owner' : joined[item.id] ? '✓' : 'Join'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<View style={s.empty}><Text style={{ fontSize: 32 }}>🔍</Text><Text style={[s.emptyTx, { color: sub }]}>No channels found</Text></View>}
      />

      <Modal visible={createModal} transparent animationType="slide" onRequestClose={() => setCreateModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: card }]}>
            <Text style={[s.modalTitle, { color: tx }]}>Create Channel</Text>
            {[
              { ph: 'Channel name *', val: chName, set: setChName },
              { ph: 'Emoji (optional)', val: chEmoji, set: setChEmoji },
              { ph: 'Description (optional)', val: chDesc, set: setChDesc, multi: true },
            ].map((f, i) => (
              <TextInput key={i} style={[s.modalInput, { backgroundColor: inputBg, color: tx, borderColor: border }]}
                placeholder={f.ph} placeholderTextColor={sub} value={f.val} onChangeText={f.set} multiline={f.multi} />
            ))}
            <Text style={[s.catLabel, { color: sub }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 16 }}>
              {CATEGORIES.slice(1).map(cat => (
                <TouchableOpacity key={cat} style={[s.chip, { backgroundColor: chCat === cat ? accent : inputBg, borderColor: border }]} onPress={() => setChCat(cat)}>
                  <Text style={[s.chipTx, { color: chCat === cat ? '#fff' : sub }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[s.createConfirmBtn, { backgroundColor: accent }]} onPress={createChannel}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Create Channel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCreateModal(false)} style={{ marginTop: 10, alignItems: 'center' }}>
              <Text style={{ color: sub }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1 },
  header:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  backBtn:         { padding: 4 },
  backTx:          { fontSize: 28, fontWeight: 'bold' },
  headerTitle:     { flex: 1, fontSize: 20, fontWeight: '800' },
  createBtn:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
  searchBox:       { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput:     { flex: 1, fontSize: 14 },
  filterRow:       { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 10, gap: 8 },
  filterBtn:       { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  filterTx:        { fontSize: 13, fontWeight: '600' },
  chip:            { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipTx:          { fontSize: 12, fontWeight: '600' },
  chRow:           { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 12, gap: 12 },
  chEmoji:         { fontSize: 26 },
  chName:          { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  chMeta:          { fontSize: 11 },
  trendBadge:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  joinBtn:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12 },
  joinTx:          { fontSize: 13, fontWeight: '700' },
  empty:           { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTx:         { fontSize: 14 },
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 },
  modalTitle:      { fontSize: 18, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  modalInput:      { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 10 },
  catLabel:        { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  createConfirmBtn:{ borderRadius: 14, padding: 14, alignItems: 'center' },
});
