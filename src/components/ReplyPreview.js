// ReplyPreview — renders reply quotes with actual photo/gallery/video previews.
// Used in both ChatRoomScreen and GroupChatScreen:
//   1. Inside the sent message bubble (viewing a reply)
//   2. In the compose reply bar (before typing a reply)
import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Loads a local image stored in AsyncStorage by key
function LocalThumb({ msgKey, style }) {
  const [uri, setUri] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem(msgKey).then(v => { if (v) setUri(v); }).catch(() => {});
  }, [msgKey]);
  if (!uri) return (
    <View style={[style, rp.loadingThumb]}>
      <ActivityIndicator size="small" color="#555" />
    </View>
  );
  return <Image source={{ uri }} style={style} resizeMode="cover" />;
}

/**
 * ReplyPreview
 * @param {string} content      — raw content of the message being replied to
 * @param {string} label        — e.g. "↩ Reply" or "↩ Username"
 * @param {string} labelColor   — color for the label text
 * @param {string} textColor    — color for the description text
 * @param {string} borderColor  — left accent border color
 */
export default function ReplyPreview({ content, label, labelColor, textColor, borderColor }) {
  if (!content) return null;

  // Larger thumbnail — 80×80 so it's clearly visible
  const THUMB = { width: 80, height: 80, borderRadius: 10 };

  const renderContent = () => {
    const c = (content || '').trim();

    // ── Single local photo ──────────────────────────────────────
    if (c.startsWith('LOCALIMG:')) {
      const key = c.replace('LOCALIMG:', '').split('\n')[0].trim();
      return (
        <View style={rp.mediaRow}>
          <LocalThumb msgKey={key} style={THUMB} />
          <View style={rp.mediaMeta}>
            <Text style={{ fontSize: 22 }}>📷</Text>
            <Text style={[rp.mediaLabel, { color: textColor }]}>Photo</Text>
          </View>
        </View>
      );
    }

    // ── Remote single photo ─────────────────────────────────────
    if (c.startsWith('IMG:')) {
      const uri = c.replace('IMG:', '').split('\n')[0].trim();
      return (
        <View style={rp.mediaRow}>
          <Image source={{ uri }} style={THUMB} resizeMode="cover" />
          <View style={rp.mediaMeta}>
            <Text style={{ fontSize: 22 }}>📷</Text>
            <Text style={[rp.mediaLabel, { color: textColor }]}>Photo</Text>
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
      return (
        <View style={rp.mediaRow}>
          <View style={rp.galleryWrap}>
            {/* First photo — full size */}
            {isLocal
              ? <LocalThumb msgKey={first} style={THUMB} />
              : <Image source={{ uri: first }} style={THUMB} resizeMode="cover" />}
            {/* Second photo peeking if there are 2+ */}
            {count > 1 && keys[1] && (
              <View style={[rp.galleryPeek, { width: THUMB.width * 0.55, height: THUMB.height, borderRadius: THUMB.borderRadius }]}>
                {keys[1].startsWith('http')
                  ? <Image source={{ uri: keys[1] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  : <LocalThumb msgKey={keys[1]} style={StyleSheet.absoluteFill} />}
                {count > 2 && (
                  <View style={rp.countOverlay}>
                    <Text style={rp.countTx}>+{count - 1}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
          <View style={rp.mediaMeta}>
            <Text style={{ fontSize: 22 }}>🖼️</Text>
            <Text style={[rp.mediaLabel, { color: textColor }]}>
              {count} photo{count > 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      );
    }

    // ── Single local video ──────────────────────────────────────
    if (c.startsWith('LOCALVID:') || c.startsWith('VID:')) {
      return (
        <View style={rp.mediaRow}>
          <View style={[THUMB, rp.videoBg]}>
            <View style={rp.playCircle}>
              <Text style={{ fontSize: 26, marginLeft: 3 }}>▶</Text>
            </View>
          </View>
          <View style={rp.mediaMeta}>
            <Text style={{ fontSize: 22 }}>🎥</Text>
            <Text style={[rp.mediaLabel, { color: textColor }]}>Video</Text>
          </View>
        </View>
      );
    }

    // ── Multiple videos ─────────────────────────────────────────
    if (c.startsWith('VIDEOS:')) {
      const count = c.replace('VIDEOS:', '').split('\n')[0].split('|').filter(Boolean).length;
      return (
        <View style={rp.mediaRow}>
          <View style={[THUMB, rp.videoBg]}>
            <View style={rp.playCircle}>
              <Text style={{ fontSize: 26, marginLeft: 3 }}>▶</Text>
            </View>
          </View>
          <View style={rp.mediaMeta}>
            <Text style={{ fontSize: 22 }}>🎥</Text>
            <Text style={[rp.mediaLabel, { color: textColor }]}>
              {count} video{count > 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      );
    }

    // ── File ────────────────────────────────────────────────────
    if (c.startsWith('FILE:')) {
      const fname = c.replace('FILE:', '').split('|')[0].trim();
      return (
        <View style={rp.mediaRow}>
          <View style={[THUMB, rp.fileBg]}>
            <Text style={{ fontSize: 32 }}>📄</Text>
          </View>
          <View style={rp.mediaMeta}>
            <Text style={{ fontSize: 22 }}>📁</Text>
            <Text style={[rp.mediaLabel, { color: textColor }]} numberOfLines={2}>{fname}</Text>
          </View>
        </View>
      );
    }

    // ── Location ────────────────────────────────────────────────
    if (c.startsWith('📍')) {
      return (
        <View style={rp.mediaRow}>
          <View style={[THUMB, rp.fileBg]}>
            <Text style={{ fontSize: 32 }}>📍</Text>
          </View>
          <View style={rp.mediaMeta}>
            <Text style={{ fontSize: 22 }}>🗺️</Text>
            <Text style={[rp.mediaLabel, { color: textColor }]}>Location</Text>
          </View>
        </View>
      );
    }

    // ── Plain text / emoji / GIF emoji ─────────────────────────
    return (
      <Text style={[rp.textPreview, { color: textColor }]} numberOfLines={2}>
        {c.startsWith('REPLY:') ? c.substring(c.indexOf('|') + 1) : c}
      </Text>
    );
  };

  return (
    <View style={[rp.wrap, { borderLeftColor: borderColor }]}>
      {label ? (
        <Text style={[rp.label, { color: labelColor }]}>{label}</Text>
      ) : null}
      {renderContent()}
    </View>
  );
}

const rp = StyleSheet.create({
  wrap:         { borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 6, borderRadius: 4, marginBottom: 8 },
  label:        { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  // Media rows
  mediaRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mediaMeta:    { flex: 1, gap: 4 },
  mediaLabel:   { fontSize: 14, fontWeight: '600' },
  // Gallery
  galleryWrap:  { flexDirection: 'row', borderRadius: 10, overflow: 'hidden' },
  galleryPeek:  { overflow: 'hidden', marginLeft: 3, position: 'relative' },
  countOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  countTx:      { color: '#fff', fontSize: 14, fontWeight: '800' },
  // Video
  videoBg:      { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  playCircle:   { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  // File / location
  fileBg:       { backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  // Loading
  loadingThumb: { backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' },
  // Text
  textPreview:  { fontSize: 13, lineHeight: 18 },
});
