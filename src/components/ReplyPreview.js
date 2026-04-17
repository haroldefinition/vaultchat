// ReplyPreview — renders a reply quote correctly for photos, galleries, videos, and text.
// Used in both the message bubble (quoted content) and the reply bar (compose area).
import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Resolves a LOCALIMG: key to its URI from AsyncStorage
function LocalThumb({ msgKey, style }) {
  const [uri, setUri] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem(msgKey).then(v => { if (v) setUri(v); }).catch(() => {});
  }, [msgKey]);
  if (!uri) return <View style={[style, { backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator size="small" color="#555" /></View>;
  return <Image source={{ uri }} style={style} resizeMode="cover" />;
}

/**
 * ReplyPreview
 * @param {string}  content   — the raw content of the message being replied to
 * @param {string}  label     — e.g. "↩ Reply" or sender name
 * @param {string}  labelColor
 * @param {string}  textColor
 * @param {string}  borderColor — left accent border
 * @param {string}  bgColor    — background of the quote block
 */
export default function ReplyPreview({ content, label, labelColor, textColor, borderColor, bgColor }) {
  if (!content) return null;

  const THUMB = { width: 48, height: 48, borderRadius: 8 };

  const renderMedia = () => {
    const c = content || '';

    // Single local image
    if (c.startsWith('LOCALIMG:')) {
      const key = c.replace('LOCALIMG:', '').split('\n')[0];
      return (
        <View style={rp.mediaRow}>
          <LocalThumb msgKey={key} style={THUMB} />
          <Text style={[rp.mediaLabel, { color: textColor }]}>📷 Photo</Text>
        </View>
      );
    }
    // Remote image
    if (c.startsWith('IMG:')) {
      const uri = c.replace('IMG:', '').split('\n')[0];
      return (
        <View style={rp.mediaRow}>
          <Image source={{ uri }} style={THUMB} resizeMode="cover" />
          <Text style={[rp.mediaLabel, { color: textColor }]}>📷 Photo</Text>
        </View>
      );
    }
    // Gallery — show first photo + count
    if (c.startsWith('GALLERY:')) {
      const keys = c.replace('GALLERY:', '').split('\n')[0].split('|');
      const firstKey = keys[0];
      const isLocal  = !firstKey.startsWith('http');
      return (
        <View style={rp.mediaRow}>
          {isLocal
            ? <LocalThumb msgKey={firstKey} style={THUMB} />
            : <Image source={{ uri: firstKey }} style={THUMB} resizeMode="cover" />}
          <Text style={[rp.mediaLabel, { color: textColor }]}>
            🖼️ {keys.length} photo{keys.length > 1 ? 's' : ''}
          </Text>
        </View>
      );
    }
    // Single local video
    if (c.startsWith('LOCALVID:') || c.startsWith('VID:')) {
      return (
        <View style={rp.mediaRow}>
          <View style={[THUMB, { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 22 }}>▶️</Text>
          </View>
          <Text style={[rp.mediaLabel, { color: textColor }]}>🎥 Video</Text>
        </View>
      );
    }
    // Multiple videos
    if (c.startsWith('VIDEOS:')) {
      const count = c.replace('VIDEOS:', '').split('\n')[0].split('|').length;
      return (
        <View style={rp.mediaRow}>
          <View style={[THUMB, { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 22 }}>▶️</Text>
          </View>
          <Text style={[rp.mediaLabel, { color: textColor }]}>
            🎥 {count} video{count > 1 ? 's' : ''}
          </Text>
        </View>
      );
    }
    // GIF
    if (c.startsWith('http') && (c.includes('giphy') || c.includes('gif'))) {
      return (
        <View style={rp.mediaRow}>
          <Image source={{ uri: c.split('\n')[0] }} style={THUMB} resizeMode="cover" />
          <Text style={[rp.mediaLabel, { color: textColor }]}>🎭 GIF</Text>
        </View>
      );
    }
    // File
    if (c.startsWith('FILE:')) {
      const fname = c.replace('FILE:', '').split('|')[0];
      return (
        <View style={rp.mediaRow}>
          <View style={[THUMB, { backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 22 }}>📄</Text>
          </View>
          <Text style={[rp.mediaLabel, { color: textColor }]} numberOfLines={1}>{fname}</Text>
        </View>
      );
    }
    // Location
    if (c.startsWith('📍')) {
      return (
        <View style={rp.mediaRow}>
          <View style={[THUMB, { backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 22 }}>📍</Text>
          </View>
          <Text style={[rp.mediaLabel, { color: textColor }]}>Location</Text>
        </View>
      );
    }
    // Plain text — truncate
    return (
      <Text style={[rp.text, { color: textColor }]} numberOfLines={2}>
        {c.substring(0, 80)}
      </Text>
    );
  };

  return (
    <View style={[rp.wrap, { borderLeftColor: borderColor, backgroundColor: bgColor || 'transparent' }]}>
      {label ? <Text style={[rp.label, { color: labelColor }]}>{label}</Text> : null}
      {renderMedia()}
    </View>
  );
}

const rp = StyleSheet.create({
  wrap:       { borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 5, borderRadius: 4, marginBottom: 6 },
  label:      { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  mediaRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mediaLabel: { fontSize: 13, fontWeight: '600', flex: 1 },
  text:       { fontSize: 12, lineHeight: 17 },
});
