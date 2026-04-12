import React, { useState, useCallback } from 'react';
import { Modal, View, Text, TextInput, FlatList, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Dimensions, KeyboardAvoidingView, Platform } from 'react-native';

const GIPHY_API_KEY = 'dc6zaTOxFJmzC';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';
const COL_WIDTH = (Dimensions.get('window').width - 48) / 2;

export default function GifPickerModal({ visible, onClose, onSelectGif, colors }) {
  const c = colors || { card: '#1C1C1E', text: '#FFFFFF', muted: '#8E8E93', input: '#2C2C2E' };
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const fetchGifs = useCallback(async (q) => {
    setLoading(true);
    try {
      const endpoint = q.trim()
        ? `${GIPHY_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=20&rating=g`
        : `${GIPHY_BASE}/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=g`;
      const res = await fetch(endpoint);
      const json = await res.json();
      setGifs(json.data || []);
      setSearched(true);
    } catch (e) {
      console.warn('GIF fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelect = (gif) => {
    const url = gif.images?.downsized?.url || gif.images?.fixed_height?.url;
    onSelectGif({ url, id: gif.id, title: gif.title });
    onClose();
    setQuery('');
  };

  const renderGif = ({ item }) => {
    const url = item.images?.fixed_height_small?.url || item.images?.downsized?.url;
    return (
      <TouchableOpacity style={styles.gifCell} onPress={() => handleSelect(item)}>
        <Image source={{ uri: url }} style={styles.gifImage} resizeMode="cover" />
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} onShow={() => { if (!searched) fetchGifs(''); }}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { backgroundColor: c.card }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: c.text }]}>GIFs</Text>
            <TouchableOpacity onPress={onClose}><Text style={[styles.close, { color: c.muted }]}>✕</Text></TouchableOpacity>
          </View>
          <View style={[styles.searchRow, { backgroundColor: c.input }]}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={[styles.searchInput, { color: c.text }]}
              placeholder="Search GIFs..."
              placeholderTextColor={c.muted}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => fetchGifs(query)}
              returnKeyType="search"
            />
          </View>
          {loading ? (
            <View style={styles.center}><ActivityIndicator color="#6C63FF" size="large" /></View>
          ) : (
            <FlatList
              data={gifs}
              keyExtractor={(item) => item.id}
              renderItem={renderGif}
              numColumns={2}
              columnWrapperStyle={styles.row}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}
              ListEmptyComponent={searched ? <View style={styles.center}><Text style={{ color: c.muted }}>No GIFs found</Text></View> : null}
            />
          )}
          <Text style={[styles.powered, { color: c.muted }]}>Powered by GIPHY</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { height: '75%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  close: { fontSize: 18, fontWeight: '600', padding: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, height: 42, marginBottom: 12 },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15 },
  row: { justifyContent: 'space-between', marginBottom: 8 },
  gifCell: { width: COL_WIDTH, height: COL_WIDTH * 0.7, borderRadius: 10, overflow: 'hidden', backgroundColor: '#2C2C2E' },
  gifImage: { width: '100%', height: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  powered: { fontSize: 11, textAlign: 'center', marginTop: 8 },
});
