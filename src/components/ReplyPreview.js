// ReplyPreview — renders reply quotes at the same size as the original media bubbles.
// Used in ChatRoomScreen and GroupChatScreen in both the message bubble and compose bar.
import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SW = Dimensions.get('window').width;

// Same widths as the actual chat bubbles (max ~82% of screen, matches bubble maxWidth)
const PHOTO_W = Math.min(SW * 0.72, 240);
const PHOTO_H = PHOTO_W * 0.78;          // same ~4:3 ratio as bubble photos
const VIDEO_W = PHOTO_W;
const VIDEO_H = PHOTO_W * 0.58;          // same aspect as video bubbles

// Loads a local image from AsyncStorage by key
function LocalThumb({ msgKey, style }) {
  const [uri, setUri] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem(msgKey).then(v => { if (v) setUri(v); }).catch(() => {});
  }, [msgKey]);
  if (!uri) return (
    <View style={[style, rp.loadingBg]}>
      <ActivityIndicator size="small" color="#888" />
    </View>
  );
  return <Image source={{ uri }} style={style} resizeMode="cover" />;
}

/**
 * ReplyPreview
 * @param {string} content     — raw content of the message being replied to
 * @param {string} label       — "↩ Reply" or "↩ Username"
 * @param {string} labelColor
 * @param {string} textColor
 * @param {string} borderColor — left accent bar color
 */
export default function ReplyPreview({ content, label, labelColor, textColor, borderColor }) {
  if (!content) return null;
  const c = (content || '').trim();

  const PHOTO_STYLE  = { width: PHOTO_W, height: PHOTO_H, borderRadius: 12 };
  const VIDEO_STYLE  = { width: VIDEO_W, height: VIDEO_H, borderRadius: 12 };

  const renderMedia = () => {

    // ── Single local photo ──────────────────────────────────────
    if (c.startsWith('LOCALIMG:')) {
      const key = c.replace('LOCALIMG:', '').split('\n')[0].trim();
      return (
        <View>
          <LocalThumb msgKey={key} style={PHOTO_STYLE} />
          <View style={rp.mediaTag}>
            <Text style={rp.mediaTagTx}>📷 Photo</Text>
          </View>
        </View>
      );
    }

    // ── Remote single photo ─────────────────────────────────────
    if (c.startsWith('IMG:')) {
      const uri = c.replace('IMG:', '').split('\n')[0].trim();
      return (
        <View>
          <Image source={{ uri }} style={PHOTO_STYLE} resizeMode="cover" />
          <View style={rp.mediaTag}>
            <Text style={rp.mediaTagTx}>📷 Photo</Text>
          </View>
        </View>
      );
    }

    // ── Gallery (multiple photos) ───────────────────────────────
    if (c.startsWith('GALLERY:')) {
      const keys  = c.replace('GALLERY:', '').split('\n')[0].split('|').filter(Boolean);
      const count = keys.length;
      const first = keys[0];
      const isLocal = first && !first.startsWith('http');
      const second  = count > 1 ? keys[1] : null;
      const HALF_W  = (PHOTO_W - 4) / 2;

      return (
        <View>
          <View style={[rp.galleryRow, { width: PHOTO_W, height: PHOTO_H }]}>
            {/* First photo — full width if only 1, half width if 2+ */}
            <View style={{ width: second ? HALF_W : PHOTO_W, height: PHOTO_H, borderRadius: 12, overflow: 'hidden' }}>
              {isLocal
                ? <LocalThumb msgKey={first} style={{ width: '100%', height: '100%' }} />
                : <Image source={{ uri: first }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />}
            </View>

            {/* Second photo with +N overlay if more remain */}
            {second && (
              <View style={{ width: HALF_W, height: PHOTO_H, borderRadius: 12, overflow: 'hidden', marginLeft: 4 }}>
                {second.startsWith('http')
                  ? <Image source={{ uri: second }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  : <LocalThumb msgKey={second} style={{ width: '100%', height: '100%' }} />}
                {count > 2 && (
                  <View style={rp.countOverlay}>
                    <Text style={rp.countTx}>+{count - 1}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
          <View style={rp.mediaTag}>
            <Text style={rp.mediaTagTx}>🖼️ {count} photo{count > 1 ? 's' : ''}</Text>
          </View>
        </View>
      );
    }

    // ── Single video ────────────────────────────────────────────
    if (c.startsWith('LOCALVID:') || c.startsWith('VID:')) {
      return (
        <View>
          <View style={[VIDEO_STYLE, rp.videoBg]}>
            <View style={rp.playCircle}>
              <Text style={rp.playIcon}>▶</Text>
            </View>
          </View>
          <View style={rp.mediaTag}>
            <Text style={rp.mediaTagTx}>🎥 Video</Text>
          </View>
        </View>
      );
    }

    // ── Multiple videos ─────────────────────────────────────────
    if (c.startsWith('VIDEOS:')) {
      const count = c.replace('VIDEOS:', '').split('\n')[0].split('|').filter(Boolean).length;
      return (
        <View>
          <View style={[VIDEO_STYLE, rp.videoBg]}>
            <View style={rp.playCircle}>
              <Text style={rp.playIcon}>▶</Text>
            </View>
          </View>
          <View style={rp.mediaTag}>
            <Text style={rp.mediaTagTx}>🎥 {count} video{count > 1 ? 's' : ''}</Text>
          </View>
        </View>
      );
    }

    // ── File ────────────────────────────────────────────────────
    if (c.startsWith('FILE:')) {
      const fname = c.replace('FILE:', '').split('|')[0].trim();
      return (
        <View style={rp.fileRow}>
          <Text style={{ fontSize: 28 }}>📄</Text>
          <Text style={[rp.fileLabel, { color: textColor }]} numberOfLines={2}>{fname}</Text>
        </View>
      );
    }

    // ── Location ────────────────────────────────────────────────
    if (c.startsWith('📍')) {
      return (
        <View style={rp.fileRow}>
          <Text style={{ fontSize: 28 }}>📍</Text>
          <Text style={[rp.fileLabel, { color: textColor }]}>Location</Text>
        </View>
      );
    }

    // ── Plain text ──────────────────────────────────────────────
    return (
      <Text style={[rp.textPreview, { color: textColor }]} numberOfLines={3}>
        {c}
      </Text>
    );
  };

  return (
    <View style={[rp.wrap, { borderLeftColor: borderColor }]}>
      {label ? <Text style={[rp.label, { color: labelColor }]}>{label}</Text> : null}
      {renderMedia()}
    </View>
  );
}

const rp = StyleSheet.create({
  wrap:        { borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 6, borderRadius: 4, marginBottom: 8 },
  label:       { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  // Gallery
  galleryRow:  { flexDirection: 'row', overflow: 'hidden', borderRadius: 12 },
  countOverlay:{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  countTx:     { color: '#fff', fontSize: 20, fontWeight: '800' },
  // Video
  videoBg:     { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  playCircle:  { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  playIcon:    { color: '#fff', fontSize: 24, marginLeft: 4 },
  // Tag beneath media
  mediaTag:    { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  mediaTagTx:  { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },
  // Loading placeholder
  loadingBg:   { backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  // File / location row
  fileRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  fileLabel:   { fontSize: 14, fontWeight: '600', flex: 1 },
  // Text
  textPreview: { fontSize: 13, lineHeight: 18 },
});
