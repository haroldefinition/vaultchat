import React, { useState, useCallback, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, FlatList, Image, TouchableOpacity,
  StyleSheet, ActivityIndicator, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';

// Giphy API. This is VaultChat's own SDK key, registered to
// AUXXILUS MEDIA LLC. Giphy SDK keys are designed to be embedded
// in client apps — they're not secret, they're rate-limited per
// app. If we ever need to rotate without a rebuild we can move
// this into app.json extra + Constants.expoConfig.extra.
const GIPHY_API_KEY = 'Kz1uQfMZ8KZeSKKwaKzXfrlc6spV7yKq';
const GIPHY_BASE    = 'https://api.giphy.com/v1/gifs';
const USING_PUBLIC_KEY = GIPHY_API_KEY === 'dc6zaTOxFJmzC';
const COL_WIDTH     = (Dimensions.get('window').width - 48) / 2;

// Fallback emoji GIFs shown if API fails or returns nothing
const FALLBACK_GIFS = [
  { id: 'f1', emoji: '😂', label: 'Haha'   },
  { id: 'f2', emoji: '🎉', label: 'Party'  },
  { id: 'f3', emoji: '🔥', label: 'Fire'   },
  { id: 'f4', emoji: '❤️', label: 'Love'   },
  { id: 'f5', emoji: '👏', label: 'Clap'   },
  { id: 'f6', emoji: '😎', label: 'Cool'   },
  { id: 'f7', emoji: '🤣', label: 'Lol'    },
  { id: 'f8', emoji: '💯', label: '100'    },
  { id: 'f9', emoji: '🥳', label: 'Yay'    },
  { id: 'f10',emoji: '😭', label: 'Cry'    },
  { id: 'f11',emoji: '🤯', label: 'Wow'    },
  { id: 'f12',emoji: '👀', label: 'Eyes'   },
  { id: 'f13',emoji: '🏆', label: 'Win'    },
  { id: 'f14',emoji: '🫶', label: 'Love'   },
  { id: 'f15',emoji: '💀', label: 'Dead'   },
  { id: 'f16',emoji: '🚀', label: 'Rocket' },
];

export default function GifPickerModal({ visible, onClose, onSelectGif, colors }) {
  const c = colors || {};
  const card    = c.card    || '#1C1C1E';
  const tx      = c.tx      || '#FFFFFF';
  const sub     = c.sub     || '#8E8E93';
  const inputBg = c.inputBg || '#2C2C2E';
  const border  = c.border  || '#2C2C2E';
  const accent  = c.accent  || '#00C2A8';

  const [query,    setQuery]    = useState('');
  const [gifs,     setGifs]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  // Reset and load trending GIFs every time modal opens
  useEffect(() => {
    if (visible) {
      setQuery('');
      setError(false);
      setUseFallback(false);
      setGifs([]);
      fetchGifs('');
    }
  }, [visible]);

  const fetchGifs = useCallback(async (q) => {
    setLoading(true);
    setError(false);
    try {
      const endpoint = q.trim()
        ? `${GIPHY_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=24&rating=g`
        : `${GIPHY_BASE}/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=g`;
      const res  = await fetch(endpoint);
      const json = await res.json();
      const data = json.data || [];
      if (data.length > 0) {
        setGifs(data);
        setUseFallback(false);
      } else {
        setUseFallback(true);
      }
    } catch {
      setError(true);
      setUseFallback(true);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleSelect(gif) {
    // For real Giphy GIFs
    const url = gif.images?.downsized?.url || gif.images?.fixed_height?.url || gif.images?.original?.url;
    if (url) {
      onSelectGif({ url, id: gif.id, title: gif.title || '' });
    }
    onClose();
    setQuery('');
  }

  function handleFallbackSelect(item) {
    // Send the emoji as the message content when API fails
    onSelectGif({ url: item.emoji, id: item.id, title: item.label, isEmoji: true });
    onClose();
    setQuery('');
  }

  const renderGif = ({ item }) => {
    const url = item.images?.fixed_height_small?.url || item.images?.downsized?.url;
    if (!url) return null;
    return (
      <TouchableOpacity onPress={() => handleSelect(item)} style={s.gifItem} activeOpacity={0.8}>
        <Image source={{ uri: url }} style={s.gifImg} resizeMode="cover" />
      </TouchableOpacity>
    );
  };

  const renderFallback = ({ item }) => (
    <TouchableOpacity onPress={() => handleFallbackSelect(item)}
      style={[s.fallbackItem, { backgroundColor: inputBg }]} activeOpacity={0.8}>
      <Text style={{ fontSize: 36 }}>{item.emoji}</Text>
      <Text style={{ color: sub, fontSize: 11, marginTop: 4 }}>{item.label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: card }]}>
          {/* Handle */}
          <View style={[s.handle, { backgroundColor: border }]} />

          {/* Header */}
          <View style={s.headerRow}>
            <Text style={[s.headerTitle, { color: tx }]}>GIFs & Memes</Text>
            <TouchableOpacity onPress={onClose} style={[s.closeBtn, { backgroundColor: accent }]}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Search — ALWAYS visible. Even when the Giphy API is
              rate-limited and we're showing the emoji fallback,
              keeping the search bar gives the user a path to
              retry / type a new query that may succeed. */}
          <View style={[s.searchRow, { backgroundColor: inputBg, borderColor: border }]}>
            <Text style={{ color: sub, marginRight: 8 }}>🔍</Text>
            <TextInput
              style={[s.searchInput, { color: tx }]}
              placeholder="Search GIFs and memes…"
              placeholderTextColor={sub}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => fetchGifs(query)}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); fetchGifs(''); }}>
                <Text style={{ color: sub, fontSize: 16, paddingHorizontal: 8 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* API key warning — surfaces the real cause of the
              fallback so future-you knows to drop in a real key. */}
          {(error || useFallback) && USING_PUBLIC_KEY && (
            <Text style={[s.errorText, { color: sub }]}>
              GIF service rate-limited — using the public Giphy key. Add a free key from developers.giphy.com to GifPickerModal.js for reliable search.
            </Text>
          )}
          {error && !USING_PUBLIC_KEY && (
            <Text style={[s.errorText, { color: sub }]}>
              Can’t reach the GIF service right now. Try again in a moment.
            </Text>
          )}

          {/* Required attribution — Giphy's production key review
              requires "Powered by GIPHY" or the Giphy logo to be
              visible in the picker. We render the text variant
              under the search bar so it's always visible regardless
              of whether the API succeeds, fails, or returns the
              fallback. Don't remove this without re-reading the
              Giphy SDK terms or you'll get bounced on review. */}
          <Text style={[s.attribution, { color: sub }]}>Powered by GIPHY</Text>

          {/* Content */}
          {loading ? (
            <View style={s.loader}>
              <ActivityIndicator size="large" color={accent} />
              <Text style={{ color: sub, marginTop: 12 }}>Loading…</Text>
            </View>
          ) : useFallback ? (
            <>
              <Text style={[s.sectionLabel, { color: sub }]}>QUICK REACTIONS</Text>
              <FlatList
                data={FALLBACK_GIFS}
                keyExtractor={item => item.id}
                numColumns={4}
                contentContainerStyle={s.fallbackGrid}
                renderItem={renderFallback}
                showsVerticalScrollIndicator={false}
              />
            </>
          ) : (
            <FlatList
              data={gifs}
              keyExtractor={item => item.id}
              numColumns={2}
              contentContainerStyle={s.gifGrid}
              renderItem={renderGif}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={s.emptyBox}>
                  <Text style={{ fontSize: 40, marginBottom: 10 }}>🎭</Text>
                  <Text style={{ color: sub }}>No results — try another search.</Text>
                </View>
              }
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:        { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '80%', paddingBottom: 34 },
  handle:       { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  headerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle:  { fontSize: 17, fontWeight: '700' },
  closeBtn:     { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  searchRow:    { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
  searchInput:  { flex: 1, fontSize: 15 },
  errorText:    { textAlign: 'center', fontSize: 13, marginBottom: 10, paddingHorizontal: 20 },
  loader:       { height: 200, alignItems: 'center', justifyContent: 'center' },
  gifGrid:      { paddingHorizontal: 12, gap: 6 },
  gifItem:      { width: COL_WIDTH, height: COL_WIDTH * 0.75, margin: 3, borderRadius: 12, overflow: 'hidden', backgroundColor: '#111' },
  gifImg:       { width: '100%', height: '100%' },
  attribution:  { fontSize: 10, fontWeight: '600', letterSpacing: 1, textAlign: 'center', marginBottom: 8, opacity: 0.55 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginLeft: 20, marginBottom: 10, marginTop: 4 },
  fallbackGrid: { paddingHorizontal: 16, paddingBottom: 20 },
  fallbackItem: { flex: 1, margin: 6, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  emptyBox:     { alignItems: 'center', paddingTop: 40 },
});
