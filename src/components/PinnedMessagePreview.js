// PinnedMessagePreview — renders the inline preview shown in a chat's
// pinned banner. For text messages it returns the truncated text. For
// media messages (single photo, photo gallery, single video, video
// carousel) it returns an actual thumbnail of the media so the user
// recognizes what they pinned at a glance — instead of a generic
// "📷 Photo" label.
//
// Local-key images (LOCALIMG:<key>) are looked up from AsyncStorage;
// remote images (IMG:https://...) load directly. For galleries and
// video carousels, we render the first item as the thumbnail so the
// banner stays a fixed size.
//
// Used in:
//   - ChatRoomScreen pinned banner
//   - GroupChatScreen pinned banner

import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THUMB_SIZE = 38;

// Resolve a single LOCALIMG/IMG content into a usable URI.
function useResolvedUri(content, kind) {
  const [uri, setUri] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let raw = content || '';
      // GALLERY:<key>|<key>|... — pick first
      if (raw.startsWith('GALLERY:')) {
        const first = raw.replace('GALLERY:', '').split('|')[0] || '';
        raw = first.startsWith('http') ? `IMG:${first}` : `LOCALIMG:${first}`;
      } else if (raw.startsWith('VIDEOS:')) {
        // First entry of VIDEOS: format. We can't easily make video
        // thumbnails inline (no native API in React Native without
        // expo-video-thumbnails), so we just render a video placeholder.
        if (!cancelled) setUri('__VIDEO_PLACEHOLDER__');
        return;
      } else if (raw.startsWith('LOCALVID:') || raw.startsWith('VID:')) {
        if (!cancelled) setUri('__VIDEO_PLACEHOLDER__');
        return;
      }

      if (raw.startsWith('IMG:')) {
        if (!cancelled) setUri(raw.replace('IMG:', ''));
      } else if (raw.startsWith('LOCALIMG:')) {
        const key = raw.replace('LOCALIMG:', '');
        try {
          const v = await AsyncStorage.getItem(key);
          if (!cancelled) setUri(v || null);
        } catch {
          if (!cancelled) setUri(null);
        }
      } else if (!cancelled) {
        setUri(null);
      }
    })();
    return () => { cancelled = true; };
  }, [content, kind]);
  return uri;
}

// Returns one of: 'text' | 'photo' | 'gallery' | 'video' | 'videos' | 'voice' | 'file' | 'reply'
function detectKind(content) {
  const raw = content || '';
  if (raw.startsWith('REPLY:'))                                  return 'reply';
  if (raw.startsWith('GALLERY:'))                                return 'gallery';
  if (raw.startsWith('VIDEOS:'))                                 return 'videos';
  if (raw.startsWith('LOCALIMG:') || raw.startsWith('IMG:'))     return 'photo';
  if (raw.startsWith('LOCALVID:') || raw.startsWith('VID:'))     return 'video';
  if (raw.startsWith('VOICE:'))                                  return 'voice';
  if (raw.startsWith('FILE:'))                                   return 'file';
  return 'text';
}

function unwrapReply(raw) {
  if (!raw.startsWith('REPLY:')) return raw;
  const ci = raw.indexOf(':', 6);
  if (ci < 0) return raw;
  const qLen = parseInt(raw.substring(6, ci)) || 0;
  return raw.substring(ci + 1 + qLen);
}

export default function PinnedMessagePreview({ content, accent, tx, sub }) {
  const kind = detectKind(content);
  // Reply messages: unwrap and re-detect the inner content, so a reply
  // to a photo still renders a photo thumbnail in the pin banner.
  const innerContent = kind === 'reply' ? unwrapReply(content || '') : (content || '');
  const innerKind = kind === 'reply' ? detectKind(innerContent) : kind;

  const uri = useResolvedUri(innerContent, innerKind);

  // Photos / galleries with a usable URI: render image thumbnail
  if ((innerKind === 'photo' || innerKind === 'gallery') && uri && uri !== '__VIDEO_PLACEHOLDER__') {
    return (
      <View style={s.row}>
        <View style={[s.thumb, { borderColor: accent }]}>
          <Image source={{ uri }} style={s.img} resizeMode="cover" />
          {innerKind === 'gallery' && (
            <View style={s.galleryBadge}>
              <Text style={s.galleryBadgeTx}>+</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.label, { color: accent }]}>Pinned {innerKind === 'gallery' ? 'Gallery' : 'Photo'}</Text>
          <Text style={[s.preview, { color: tx }]} numberOfLines={1}>
            {innerKind === 'gallery' ? 'Photo gallery' : 'Photo'}
          </Text>
        </View>
      </View>
    );
  }

  // Videos: dark thumbnail with a play icon (we can't extract a frame
  // without a thumbnail-extraction lib, so this is the best we can do
  // without adding another native dep)
  if ((innerKind === 'video' || innerKind === 'videos') ) {
    return (
      <View style={s.row}>
        <View style={[s.thumb, s.videoThumb, { borderColor: accent }]}>
          <Text style={s.playIcon}>▶</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.label, { color: accent }]}>Pinned {innerKind === 'videos' ? 'Videos' : 'Video'}</Text>
          <Text style={[s.preview, { color: tx }]} numberOfLines={1}>
            {innerKind === 'videos' ? 'Video carousel' : 'Video'}
          </Text>
        </View>
      </View>
    );
  }

  // Voice notes / files / text — fallback to the small icon + text style
  let icon = '📌';
  let label = 'Pinned Message';
  let preview = innerContent.substring(0, 60);
  if (innerKind === 'voice') { icon = '🎙'; label = 'Pinned Voice Note'; preview = 'Voice note'; }
  else if (innerKind === 'file') { icon = '📎'; label = 'Pinned File'; const parts = innerContent.replace('FILE:', '').split('|'); preview = parts[0] || 'File'; }
  // Photo/gallery without a usable URI (e.g. local image not in this session) — fall through here
  else if (innerKind === 'photo')   { icon = '📷'; label = 'Pinned Photo';   preview = 'Photo'; }
  else if (innerKind === 'gallery') { icon = '🖼'; label = 'Pinned Gallery'; preview = 'Photo gallery'; }

  return (
    <View style={s.row}>
      <Text style={s.icon}>{icon}</Text>
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text style={[s.label, { color: accent }]}>{label}</Text>
        <Text style={[s.preview, { color: tx }]} numberOfLines={1}>{preview}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', flex: 1 },
  thumb: {
    width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 8,
    borderWidth: 1.5, overflow: 'hidden', marginRight: 10,
    backgroundColor: '#1a1a2e',
  },
  img:   { width: '100%', height: '100%' },
  galleryBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  galleryBadgeTx: { color: '#fff', fontSize: 10, fontWeight: '900', lineHeight: 12 },
  videoThumb: { backgroundColor: '#0a0a14', alignItems: 'center', justifyContent: 'center' },
  playIcon:   { color: 'rgba(255,255,255,0.85)', fontSize: 16, marginLeft: 2 },
  icon:       { fontSize: 14 },
  label:      { fontSize: 11, fontWeight: '700', marginBottom: 1 },
  preview:    { fontSize: 13 },
});
