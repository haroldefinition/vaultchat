import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';

const ALL_CHANNELS = [
  { id:'c1', name:'VaultChat News', emoji:'📢', members:12400, cat:'Community', trending:true },
  { id:'c2', name:'Privacy First',  emoji:'🔒', members:8900,  cat:'Privacy',   trending:true },
  { id:'c3', name:'Rural Tech',     emoji:'🌾', members:3200,  cat:'Tech',      trending:false },
  { id:'c4', name:'Small Biz',      emoji:'🏪', members:5600,  cat:'Business',  trending:true },
  { id:'c5', name:'Wellness Circle',emoji:'🧘', members:7100,  cat:'Health',    trending:false },
  { id:'c6', name:'Finance Underground',emoji:'💰',members:9800,cat:'Finance',  trending:true },
  { id:'c7', name:'Off the Grid',   emoji:'🏕️', members:2300,  cat:'Lifestyle', trending:false },
  { id:'c8', name:'Travel Collective',emoji:'✈️',members:6700, cat:'Travel',    trending:true },
];

export default function TrendingScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [filter,  setFilter]  = useState('All');
  const [search,  setSearch]  = useState('');
  const [channels,setChannels]= useState(ALL_CHANNELS);
  const [createModal, setCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji,setNewEmoji]= useState('');
  const [newDesc, setNewDesc] = useState('');

  const FILTERS = ['All','Trending','My Channels'];

  const displayed = channels.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    if (filter === 'Trending')    return matchSearch && c.trending;
    if (filter === 'My Channels') return matchSearch && c.joined;
    return matchSearch;
  });

  function toggleJoin(id) {
    setChannels(prev => prev.map(c => c.id===id ? {...c,joined:!c.joined,members:c.joined?c.members-1:c.members+1} : c));
  }

  async function createChannel() {
    if (!newName.trim()) { Alert.alert('Enter a name'); return; }
    const newCh = { id:`user_${Date.now()}`, name:newName, emoji:newEmoji||'📣', members:1, cat:'Community', trending:false, joined:true, userCreated:true };
    setChannels(prev => [...prev, newCh]);
    const raw  = await AsyncStorage.getItem('vaultchat_user_channels');
    const list = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem('vaultchat_user_channels', JSON.stringify([...list, newCh]));
    setCreateModal(false); setNewName(''); setNewEmoji(''); setNewDesc('');
    Alert.alert('Channel Created!', `"${newCh.name}" is live in Discover.`);
  }

  return (
    <View style={[s.container,{backgroundColor:bg}]}>
      <View style={[s.header,{backgroundColor:card,borderBottomColor:border}]}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={[s.back,{color:accent}]}>‹</Text></TouchableOpacity>
        <Text style={[s.title,{color:tx}]}>Channels</Text>
        <TouchableOpacity style={[s.createBtn,{backgroundColor:accent}]} onPress={() => setCreateModal(true)}>
          <Text style={{color:'#000',fontWeight:'700',fontSize:13}}>+ Create</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.searchRow,{backgroundColor:inputBg,borderColor:border,margin:16,marginBottom:8}]}>
        <Text style={{color:sub}}>🔍  </Text>
        <TextInput style={[s.searchInput,{color:tx}]} placeholder="Search channels…" placeholderTextColor={sub} value={search} onChangeText={setSearch}/>
      </View>

      <View style={[s.filterRow,{borderBottomColor:border}]}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f} style={[s.filterTab, filter===f&&{borderBottomColor:accent,borderBottomWidth:2}]} onPress={() => setFilter(f)}>
            <Text style={[s.filterTx,{color:filter===f?accent:sub}]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={displayed}
        keyExtractor={item => item.id}
        contentContainerStyle={{padding:16,gap:10}}
        renderItem={({item}) => (
          <View style={[s.row,{backgroundColor:card,borderColor:border}]}>
            <Text style={{fontSize:28}}>{item.emoji}</Text>
            <View style={{flex:1,marginLeft:14}}>
              <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                <Text style={[{color:tx,fontWeight:'700',fontSize:14}]}>{item.name}</Text>
                {item.trending && <View style={[s.trendBadge,{backgroundColor:accent+'22'}]}><Text style={[{color:accent,fontSize:10,fontWeight:'700'}]}>🔥</Text></View>}
                {item.userCreated && <View style={[s.trendBadge,{backgroundColor:'#6C63FF22'}]}><Text style={[{color:'#6C63FF',fontSize:10,fontWeight:'700'}]}>MINE</Text></View>}
              </View>
              <Text style={[{color:sub,fontSize:12}]}>{item.members.toLocaleString()} members · {item.cat}</Text>
            </View>
            <TouchableOpacity style={[s.joinBtn,{backgroundColor:item.joined?border:accent}]} onPress={() => toggleJoin(item.id)}>
              <Text style={{color:item.joined?sub:'#000',fontWeight:'700',fontSize:12}}>{item.joined?'Joined':'Join'}</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={[{color:sub,textAlign:'center',paddingTop:40}]}>No channels found</Text>}
      />

      <Modal visible={createModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{backgroundColor:bg}]}>
            <Text style={[s.modalTitle,{color:tx}]}>Create a Channel</Text>
            <TextInput style={[s.modalInput,{backgroundColor:card,color:tx}]} placeholder="Channel name" placeholderTextColor={sub} value={newName} onChangeText={setNewName}/>
            <TextInput style={[s.modalInput,{backgroundColor:card,color:tx}]} placeholder="Emoji (e.g. 🚀)" placeholderTextColor={sub} value={newEmoji} onChangeText={setNewEmoji}/>
            <TextInput style={[s.modalInput,{backgroundColor:card,color:tx,height:70}]} placeholder="Description" placeholderTextColor={sub} value={newDesc} onChangeText={setNewDesc} multiline/>
            <TouchableOpacity style={[s.createConfirm,{backgroundColor:accent}]} onPress={createChannel}>
              <Text style={{color:'#000',fontWeight:'700'}}>Create Channel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCreateModal(false)} style={{alignItems:'center',padding:12}}>
              <Text style={{color:sub}}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:   {flex:1},
  header:      {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:56,paddingBottom:12,borderBottomWidth:1,gap:12},
  back:        {fontSize:30,fontWeight:'bold'},
  title:       {flex:1,fontSize:20,fontWeight:'800'},
  createBtn:   {paddingHorizontal:14,paddingVertical:7,borderRadius:14},
  searchRow:   {flexDirection:'row',alignItems:'center',borderRadius:14,paddingHorizontal:14,paddingVertical:10,borderWidth:1},
  searchInput: {flex:1,fontSize:15},
  filterRow:   {flexDirection:'row',borderBottomWidth:1,marginBottom:4},
  filterTab:   {flex:1,alignItems:'center',paddingVertical:12},
  filterTx:    {fontWeight:'700',fontSize:13},
  row:         {flexDirection:'row',alignItems:'center',borderRadius:16,padding:14,borderWidth:1},
  trendBadge:  {paddingHorizontal:6,paddingVertical:2,borderRadius:6},
  joinBtn:     {paddingHorizontal:16,paddingVertical:7,borderRadius:10},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.6)',justifyContent:'flex-end'},
  modalCard:   {borderTopLeftRadius:28,borderTopRightRadius:28,padding:24,paddingBottom:44},
  modalTitle:  {fontSize:20,fontWeight:'800',marginBottom:20,textAlign:'center'},
  modalInput:  {borderRadius:14,padding:14,fontSize:15,marginBottom:12},
  createConfirm:{borderRadius:14,padding:14,alignItems:'center'},
});
