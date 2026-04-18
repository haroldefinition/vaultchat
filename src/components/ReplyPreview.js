// ReplyPreview — full-size reply quotes with tappable fullscreen viewer.
// Tap any photo/gallery/video to open fullscreen. Gallery supports finger swipe.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Image, StyleSheet, ActivityIndicator, Dimensions,
  Modal, TouchableOpacity, ScrollView,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SW       = Dimensions.get('window').width;
const SH       = Dimensions.get('window').height;
const FS_SWIPE = SW * 0.08;

// Media sizes match actual chat bubble dimensions
const PHOTO_W = Math.min(SW * 0.72, 240);
const PHOTO_H = Math.round(PHOTO_W * 0.78);
const VIDEO_W = PHOTO_W;
const VIDEO_H = Math.round(PHOTO_W * 0.58);

// ── Loads a local image from AsyncStorage ──────────────────────
function LocalImg({ msgKey, style }) {
  const [uri, setUri] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem(msgKey).then(v => { if (v) setUri(v); }).catch(() => {});
  }, [msgKey]);
  if (!uri) return (
    <View style={[style, rp.loadingBg]}><ActivityIndicator size="small" color="#888" /></View>
  );
  return <Image source={{ uri }} style={style} resizeMode="cover" />;
}

// ── Resolves a gallery key list to URIs ────────────────────────
// Returns array of { uri, isLocal }
function useResolvedKeys(keys) {
  const [uris, setUris] = useState([]);
  useEffect(() => {
    if (!keys || !keys.length) return;
    Promise.all(keys.map(async k => {
      if (k.startsWith('http')) return k;
      const v = await AsyncStorage.getItem(k).catch(() => null);
      return v || null;
    })).then(resolved => setUris(resolved.filter(Boolean)));
  }, [keys?.join('|')]);
  return uris;
}

// ── Fullscreen photo gallery — snap swipe (short flick = next photo) ──
function FullscreenGallery({ uris, startIndex = 0, visible, onClose }) {
  const scrollRef = useRef(null);
  const [idx, setIdx] = useState(startIndex);

  useEffect(() => {
    if (visible && uris?.length) {
      setIdx(startIndex);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: SW * startIndex, animated: false });
      }, 50);
    }
  }, [visible, startIndex]);

  if (!visible || !uris?.length) return null;

  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose}>
      <View style={fs.bg}>
        <TouchableOpacity style={fs.closeBtn} onPress={onClose}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
          <Text style={fs.closeTx}>✕  Close</Text>
        </TouchableOpacity>
        {uris.length > 1 && (
          <View style={fs.counter}>
            <Text style={fs.counterTx}>{idx + 1} / {uris.length}</Text>
          </View>
        )}
        <ScrollView
          ref={scrollRef}
          horizontal
          snapToInterval={SW}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={e => {
            const i = Math.round(e.nativeEvent.contentOffset.x / SW);
            setIdx(i);
          }}
          contentContainerStyle={{ alignItems: 'center' }}
        >
          {uris.map((uri, i) => (
            <View key={i} style={{ width: SW, height: SH, justifyContent: 'center', alignItems: 'center' }}>
              <Image source={{ uri }} style={fs.img} resizeMode="contain" />
            </View>
          ))}
        </ScrollView>
        {uris.length > 1 && (
          <Text style={fs.hint}>swipe to browse</Text>
        )}
      </View>
    </Modal>
  );
}

// ── Fullscreen single photo ────────────────────────────────────
function FullscreenPhoto({ uri, visible, onClose }) {
  if (!visible || !uri) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={fs.bg}>
        <TouchableOpacity style={fs.closeBtn} onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
          <Text style={fs.closeTx}>✕  Close</Text>
        </TouchableOpacity>
        <Image source={{ uri }} style={fs.img} resizeMode="contain" />
      </View>
    </Modal>
  );
}

// ── Fullscreen video player ────────────────────────────────────
// useVideoPlayer must be at top-level of a component
function VideoPlayerInner({ uri, style }) {
  const player = useVideoPlayer({ uri }, p => { p.play(); });
  return <VideoView player={player} style={style} nativeControls contentFit="contain" />;
}

function FullscreenVideo({ uri, visible, onClose }) {
  if (!visible || !uri) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={fs.bg}>
        <TouchableOpacity style={fs.closeBtn} onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
          <Text style={fs.closeTx}>✕  Close</Text>
        </TouchableOpacity>
        <VideoPlayerInner uri={uri} style={{ width: SW, height: SH * 0.55 }} />
      </View>
    </Modal>
  );
}

// ── Main ReplyPreview ──────────────────────────────────────────
export default function ReplyPreview({ content, label, labelColor, textColor, borderColor }) {
  if (!content) return null;

  const [fsPhotoUri,   setFsPhotoUri]   = useState(null);
  const [fsGallery,    setFsGallery]    = useState(null);  // { uris, startIndex }
  const [fsVideoUri,   setFsVideoUri]   = useState(null);

  const c = (content || '').trim();

  const PHOTO_STYLE = { width: PHOTO_W, height: PHOTO_H, borderRadius: 12 };
  const VIDEO_STYLE = { width: VIDEO_W, height: VIDEO_H, borderRadius: 12 };

  // ── Resolve gallery keys for tapping fullscreen ────────────
  const galleryKeys = c.startsWith('GALLERY:')
    ? c.replace('GALLERY:', '').split('\n')[0].split('|').filter(Boolean)
    : [];
  const resolvedGallery = useResolvedKeys(galleryKeys);

  // ── Resolve single local image URI for fullscreen ──────────
  const [resolvedSingle, setResolvedSingle] = useState(null);
  useEffect(() => {
    if (c.startsWith('LOCALIMG:')) {
      const key = c.replace('LOCALIMG:', '').split('\n')[0].trim();
      AsyncStorage.getItem(key).then(v => { if (v) setResolvedSingle(v); }).catch(() => {});
    } else if (c.startsWith('IMG:')) {
      setResolvedSingle(c.replace('IMG:', '').split('\n')[0].trim());
    }
  }, [c]);

  const openSinglePhoto = () => {
    if (resolvedSingle) setFsPhotoUri(resolvedSingle);
  };

  const openGallery = () => {
    if (resolvedGallery.length > 0) {
      setFsGallery({ uris: resolvedGallery, startIndex: 0 });
    }
  };

  const openVideo = () => {
    let uri = null;
    if (c.startsWith('LOCALVID:')) uri = c.replace('LOCALVID:', '').split('\n')[0].trim();
    else if (c.startsWith('VID:'))  uri = c.replace('VID:', '').split('\n')[0].trim();
    else if (c.startsWith('VIDEOS:')) uri = c.replace('VIDEOS:', '').split('\n')[0].split('|')[0].trim();
    if (uri) setFsVideoUri(uri);
  };

  // ── Render media ───────────────────────────────────────────
  const renderContent = () => {

    // Single local photo
    if (c.startsWith('LOCALIMG:')) {
      const key = c.replace('LOCALIMG:', '').split('\n')[0].trim();
      return (
        <TouchableOpacity onPress={openSinglePhoto} activeOpacity={0.88}>
          <LocalImg msgKey={key} style={PHOTO_STYLE} />
          <View style={rp.mediaTag}><Text style={rp.mediaTagTx}>📷 Photo  · tap to expand</Text></View>
        </TouchableOpacity>
      );
    }

    // Remote single photo
    if (c.startsWith('IMG:')) {
      const uri = c.replace('IMG:', '').split('\n')[0].trim();
      return (
        <TouchableOpacity onPress={openSinglePhoto} activeOpacity={0.88}>
          <Image source={{ uri }} style={PHOTO_STYLE} resizeMode="cover" />
          <View style={rp.mediaTag}><Text style={rp.mediaTagTx}>📷 Photo  · tap to expand</Text></View>
        </TouchableOpacity>
      );
    }

    // Gallery
    if (c.startsWith('GALLERY:')) {
      const keys  = c.replace('GALLERY:', '').split('\n')[0].split('|').filter(Boolean);
      const count = keys.length;
      const first = keys[0];
      const second = count > 1 ? keys[1] : null;
      const isLocal = first && !first.startsWith('http');
      const HALF_W  = (PHOTO_W - 4) / 2;

      return (
        <TouchableOpacity onPress={openGallery} activeOpacity={0.88}>
          <View style={[rp.galleryRow, { width: PHOTO_W, height: PHOTO_H }]}>
            <View style={{ width: second ? HALF_W : PHOTO_W, height: PHOTO_H, borderRadius: 12, overflow: 'hidden' }}>
              {isLocal
                ? <LocalImg msgKey={first} style={{ width: '100%', height: '100%' }} />
                : <Image source={{ uri: first }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />}
            </View>
            {second && (
              <View style={{ width: HALF_W, height: PHOTO_H, borderRadius: 12, overflow: 'hidden', marginLeft: 4, position: 'relative' }}>
                {second.startsWith('http')
                  ? <Image source={{ uri: second }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  : <LocalImg msgKey={second} style={{ width: '100%', height: '100%' }} />}
                {count > 2 && (
                  <View style={rp.countOverlay}>
                    <Text style={rp.countTx}>+{count - 1}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
          <View style={rp.mediaTag}>
            <Text style={rp.mediaTagTx}>🖼️ {count} photo{count > 1 ? 's' : ''}  · tap to browse</Text>
          </View>
        </TouchableOpacity>
      );
    }

    // Single video
    if (c.startsWith('LOCALVID:') || c.startsWith('VID:')) {
      return (
        <TouchableOpacity onPress={openVideo} activeOpacity={0.88}>
          <View style={[VIDEO_STYLE, rp.videoBg]}>
            <View style={rp.playCircle}>
              <Text style={rp.playIcon}>▶</Text>
            </View>
          </View>
          <View style={rp.mediaTag}><Text style={rp.mediaTagTx}>🎥 Video  · tap to play</Text></View>
        </TouchableOpacity>
      );
    }

    // Multiple videos — play first
    if (c.startsWith('VIDEOS:')) {
      const parts = c.replace('VIDEOS:', '').split('\n')[0].split('|').filter(Boolean);
      return (
        <TouchableOpacity onPress={openVideo} activeOpacity={0.88}>
          <View style={[VIDEO_STYLE, rp.videoBg]}>
            <View style={rp.playCircle}>
              <Text style={rp.playIcon}>▶</Text>
            </View>
          </View>
          <View style={rp.mediaTag}>
            <Text style={rp.mediaTagTx}>🎥 {parts.length} video{parts.length > 1 ? 's' : ''}  · tap to play</Text>
          </View>
        </TouchableOpacity>
      );
    }

    // File
    if (c.startsWith('FILE:')) {
      const fname = c.replace('FILE:', '').split('|')[0].trim();
      return (
        <View style={rp.fileRow}>
          <Text style={{ fontSize: 28 }}>📄</Text>
          <Text style={[rp.fileLabel, { color: textColor }]} numberOfLines={2}>{fname}</Text>
        </View>
      );
    }

    // Location
    if (c.startsWith('📍')) {
      return (
        <View style={rp.fileRow}>
          <Text style={{ fontSize: 28 }}>📍</Text>
          <Text style={[rp.fileLabel, { color: textColor }]}>Location</Text>
        </View>
      );
    }

    // Plain text
    return (
      <Text style={[rp.textPreview, { color: textColor }]} numberOfLines={3}>{c}</Text>
    );
  };

  return (
    <View style={[rp.wrap, { borderLeftColor: borderColor }]}>
      {label ? <Text style={[rp.label, { color: labelColor }]}>{label}</Text> : null}
      {renderContent()}

      {/* Fullscreen viewers */}
      <FullscreenPhoto
        uri={fsPhotoUri}
        visible={!!fsPhotoUri}
        onClose={() => setFsPhotoUri(null)}
      />
      <FullscreenGallery
        uris={fsGallery?.uris || []}
        startIndex={fsGallery?.startIndex || 0}
        visible={!!fsGallery}
        onClose={() => setFsGallery(null)}
      />
      <FullscreenVideo
        uri={fsVideoUri}
        visible={!!fsVideoUri}
        onClose={() => setFsVideoUri(null)}
      />
    </View>
  );
}

// ── Fullscreen styles ──────────────────────────────────────────
const fs = StyleSheet.create({
  bg:       { flex: 1, backgroundColor: '#000' },
  closeBtn: { position: 'absolute', top: 56, right: 20, zIndex: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  closeTx:  { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  counter:  { position: 'absolute', top: 62, left: 20, zIndex: 20 },
  counterTx:{ color: '#fff', fontSize: 15, fontWeight: '700' },
  img:      { width: SW, height: SH * 0.75 },
  hint:     { position: 'absolute', bottom: 48, color: 'rgba(255,255,255,0.4)', fontSize: 13, alignSelf: 'center' },
});

// ── Preview styles ─────────────────────────────────────────────
const rp = StyleSheet.create({
  wrap:         { borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 6, borderRadius: 4, marginBottom: 8 },
  label:        { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  galleryRow:   { flexDirection: 'row', overflow: 'hidden', borderRadius: 12 },
  countOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  countTx:      { color: '#fff', fontSize: 20, fontWeight: '800' },
  videoBg:      { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  playCircle:   { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  playIcon:     { color: '#fff', fontSize: 24, marginLeft: 4 },
  mediaTag:     { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  mediaTagTx:   { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600' },
  loadingBg:    { backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  fileRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  fileLabel:    { fontSize: 14, fontWeight: '600', flex: 1 },
  textPreview:  { fontSize: 13, lineHeight: 18 },
});
