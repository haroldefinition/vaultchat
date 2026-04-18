// StagedPhotosPicker — iMessage-style staged photo gallery
// Thumbnails in a horizontal scroll. Tap a thumbnail → expands to large preview.
// Tap the same thumbnail again (or the X on the preview) → collapses back.
// X badge on thumbnail → removes that photo from staged list.
// + button → pick more photos.
import React, { useState } from 'react';
import {
  View, Image, TouchableOpacity, Text, StyleSheet,
  ScrollView, Modal, Dimensions, TouchableWithoutFeedback,
} from 'react-native';

const { width: SW, height: SH } = Dimensions.get('window');
const THUMB = 88;

export default function StagedPhotosPicker({
  photos,          // [{ uri, key }]
  onRemove,        // (index) => void
  onAddMore,       // () => void  — opens picker
  accent,
  inputBg,
  border,
  sub,
  tx,
}) {
  const [previewIdx, setPreviewIdx] = useState(null); // index of expanded photo, null = collapsed

  function handleThumbPress(i) {
    // Tap same thumb → collapse; tap different → expand that one
    setPreviewIdx(prev => (prev === i ? null : i));
  }

  return (
    <View>
      {/* ── Large preview (iMessage-style expand on tap) ─────── */}
      {previewIdx !== null && photos[previewIdx] && (
        <View style={s.previewWrap}>
          {/* Tapping the large photo again collapses it */}
          <TouchableWithoutFeedback onPress={() => setPreviewIdx(null)}>
            <Image
              source={{ uri: photos[previewIdx].uri }}
              style={s.previewImg}
              resizeMode="contain"
            />
          </TouchableWithoutFeedback>

          {/* ✕ to close preview */}
          <TouchableOpacity
            style={[s.previewClose, { backgroundColor: accent }]}
            onPress={() => setPreviewIdx(null)}>
            <Text style={s.previewCloseTx}>✕</Text>
          </TouchableOpacity>

          {/* Counter */}
          {photos.length > 1 && (
            <View style={[s.previewCounter, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
              <Text style={s.previewCounterTx}>{previewIdx + 1} / {photos.length}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Thumbnail strip ──────────────────────────────────── */}
      <View style={{ position: 'relative' }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, padding: 10 }}>

          {photos.map((p, i) => (
            <View key={i} style={{ position: 'relative' }}>
              {/* Thumbnail — tap to expand/collapse preview */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleThumbPress(i)}>
                <Image
                  source={{ uri: p.uri }}
                  style={[
                    s.thumb,
                    previewIdx === i && { borderWidth: 2.5, borderColor: accent },
                  ]}
                  resizeMode="cover"
                />
              </TouchableOpacity>

              {/* ✕ badge — removes photo from list */}
              <TouchableOpacity
                style={s.removeBadge}
                onPress={() => {
                  if (previewIdx === i) setPreviewIdx(null);
                  else if (previewIdx !== null && previewIdx > i)
                    setPreviewIdx(prev => prev - 1);
                  onRemove(i);
                }}>
                <Text style={s.removeTx}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Add more button */}
          {photos.length < 20 && (
            <TouchableOpacity
              style={[s.addMore, { backgroundColor: inputBg, borderColor: border }]}
              onPress={onAddMore}>
              <Text style={{ fontSize: 22, color: sub }}>+</Text>
              <Text style={{ fontSize: 10, color: sub }}>Add</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Photo count badge */}
        <View style={[s.countBadge, { backgroundColor: accent }]}>
          <Text style={s.countTx}>
            {photos.length} photo{photos.length > 1 ? 's' : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // Large preview
  previewWrap:      { width: '100%', height: SW * 0.75, backgroundColor: '#000', position: 'relative', justifyContent: 'center', alignItems: 'center' },
  previewImg:       { width: SW, height: SW * 0.75 },
  previewClose:     { position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  previewCloseTx:   { color: '#000', fontWeight: '900', fontSize: 13 },
  previewCounter:   { position: 'absolute', top: 10, left: 10, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  previewCounterTx: { color: '#fff', fontSize: 12, fontWeight: '700' },
  // Thumbnails
  thumb:            { width: THUMB, height: THUMB, borderRadius: 12 },
  removeBadge:      { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#ff3b30', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  removeTx:         { color: '#fff', fontSize: 11, fontWeight: '900' },
  addMore:          { width: THUMB, height: THUMB, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2 },
  countBadge:       { position: 'absolute', top: 14, left: 14, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countTx:          { color: '#000', fontSize: 11, fontWeight: '800' },
});
