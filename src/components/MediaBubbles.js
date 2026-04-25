import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, Modal, StyleSheet,
  FlatList, ScrollView, PanResponder, Animated, Dimensions, ActivityIndicator,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';

const { width: SW, height: SH } = Dimensions.get('window');
const CARD_W     = Math.min(SW * 0.64, 255);
const CARD_H     = CARD_W;
const DECK_SWIPE = CARD_W * 0.22;
const FS_SWIPE   = SW * 0.08;

function FullScreenViewer({ uris, startIndex, visible, onClose }) {
  const scrollRef = useRef(null);
  const [idx, setIdx] = useState(startIndex || 0);

  useEffect(() => {
    if (visible && uris?.length) {
      const i = startIndex || 0;
      setIdx(i);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: SW * i, animated: false });
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
        {/*
          snapToInterval + decelerationRate="fast":
          - A short flick of any length snaps to the next photo
          - No need to drag the full screen width
          - Any finger, any speed
          - disableIntervalMomentum prevents skipping multiple photos on fast flings
        */}
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
            // Each photo sits inside its own nested ScrollView so the native
            // pinch gesture (maximumZoomScale) works without fighting the outer
            // horizontal pager. The outer ScrollView still handles left/right
            // swipes between photos; the nested one handles zoom + pan within
            // a single photo.
            <ScrollView
              key={i}
              style={{ width: SW, height: SH }}
              contentContainerStyle={{ width: SW, height: SH, justifyContent: 'center', alignItems: 'center' }}
              maximumZoomScale={5}
              minimumZoomScale={1}
              pinchGestureEnabled
              bouncesZoom
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              centerContent
            >
              <Image source={{ uri }} style={fs.img} resizeMode="contain" />
            </ScrollView>
          ))}
        </ScrollView>
        {uris.length > 1 && (
          <View style={fs.hint}><Text style={fs.hintTx}>swipe to browse</Text></View>
        )}
      </View>
    </Modal>
  );
}


export function PhotoStack({ keys, onLongPress }) {
  // useTheme so the photo card border picks up the accent color (violet
  // in dark, Fiji blue in light) — gives the bubble the same premium
  // outline as the mockup. No prop drilling needed since MediaBubbles
  // is always mounted inside a ThemeProvider context.
  const { accent } = useTheme();
  const [uris,    setUris]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [topIdx,  setTopIdx]  = useState(0);
  const [fsOpen,  setFsOpen]  = useState(false);
  const [fsStart, setFsStart] = useState(0);

  const topIdxRef   = useRef(0);
  const urisRef     = useRef([]);
  const isAnimating = useRef(false);
  const panXValue   = useRef(0);

  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;

  useEffect(() => { topIdxRef.current = topIdx; }, [topIdx]);
  useEffect(() => { urisRef.current   = uris;   }, [uris]);

  useEffect(() => {
    const id = panX.addListener(({ value }) => { panXValue.current = value; });
    return () => panX.removeListener(id);
  }, [panX]);

  // Rotation/tilt during swipe disabled — Harold wants the photo to
  // travel cleanly left/right with no playing-card rotation. Kept the
  // animated value initializer (used in transform array below) but
  // anchor it to 0 so there's no visual tilt.
  const rotateCard = panX.interpolate({
    inputRange: [-CARD_W, 0, CARD_W],
    outputRange: ['0deg', '0deg', '0deg'],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setTopIdx(0);
    topIdxRef.current = 0;
    (async () => {
      const resolved = await Promise.all(keys.map(async k => {
        if (!k) return null;
        if (k.startsWith('http')) return k;  // Remote URL — always loads
        try {
          const v = await AsyncStorage.getItem(k);
          return v || null; // null = local key not in storage (old message / different device)
        } catch { return null; }
      }));
      if (!cancelled) {
        const valid = resolved.filter(Boolean);
        urisRef.current = valid;
        setUris(valid);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [keys.join(',')]);

  const advance = useCallback(() => {
    if (isAnimating.current) return;
    const count = urisRef.current.length;
    if (count <= 1) return;
    isAnimating.current = true;
    Animated.timing(panX, { toValue:-SW*1.5, duration:210, useNativeDriver:false }).start(() => {
      panX.setValue(0); panY.setValue(0); panXValue.current = 0;
      const next = (topIdxRef.current + 1) % count;
      topIdxRef.current = next; setTopIdx(next);
      isAnimating.current = false;
    });
  }, [panX, panY]);

  const goBack = useCallback(() => {
    if (isAnimating.current) return;
    const count = urisRef.current.length;
    if (count <= 1) return;
    isAnimating.current = true;
    Animated.timing(panX, { toValue:SW*1.5, duration:210, useNativeDriver:false }).start(() => {
      panX.setValue(0); panY.setValue(0); panXValue.current = 0;
      const prev = (topIdxRef.current - 1 + count) % count;
      topIdxRef.current = prev; setTopIdx(prev);
      isAnimating.current = false;
    });
  }, [panX, panY]);

  // PanResponder — pure horizontal swipe. Vertical drift removed
  // entirely so the chat list's vertical scroll never fights the
  // gesture, and the photo travels cleanly L/R without that
  // "screen sliding up" feel. We also require the gesture to be
  // strongly horizontal (dx > 2x dy) before claiming it, so a finger
  // moving mostly vertically falls through to the FlatList.
  const pr = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false, // never claim taps; let TouchableOpacity handle them
    onMoveShouldSetPanResponder:  (_, g) =>
      !isAnimating.current && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderGrant: () => {
      panX.setOffset(panXValue.current);
      panX.setValue(0);
    },
    onPanResponderMove: (_, g) => {
      // Horizontal-only — panY intentionally ignored.
      if (!isAnimating.current) { panX.setValue(g.dx); }
    },
    onPanResponderRelease: (_, g) => {
      panX.flattenOffset(); panXValue.current = 0;
      const count = urisRef.current.length;
      if (count <= 1) {
        Animated.spring(panX, { toValue:0, useNativeDriver:false }).start();
        return;
      }
      const left  = g.dx < -DECK_SWIPE || g.vx < -0.5;
      const right = g.dx >  DECK_SWIPE || g.vx >  0.5;
      if (left || right) {
        isAnimating.current = true;
        const dest = left ? -SW*1.5 : SW*1.5;
        Animated.timing(panX, { toValue:dest, duration:210, useNativeDriver:false }).start(() => {
          panX.setValue(0); panXValue.current = 0;
          const next = left
            ? (topIdxRef.current + 1) % count
            : (topIdxRef.current - 1 + count) % count;
          topIdxRef.current = next; setTopIdx(next);
          isAnimating.current = false;
        });
      } else {
        Animated.spring(panX, { toValue:0, friction:5, tension:50, useNativeDriver:false }).start();
      }
    },
    onPanResponderTerminate: () => {
      panX.flattenOffset(); panXValue.current = 0;
      Animated.spring(panX, { toValue:0, useNativeDriver:false }).start();
    },
  })).current;

  if (loading) return <View style={s.placeholder}><ActivityIndicator size="small" color="#888"/></View>;
  if (!uris.length) return null;

  const count = uris.length;
  const bg1   = count >= 2 ? uris[(topIdx + 1) % count] : null;
  const bg2   = count >= 3 ? uris[(topIdx + 2) % count] : null;

  // Bubble layout intentionally chrome-free: just the stacked photo
  // cards. The visual stack of underneath cards communicates "more
  // photos here," and tapping any card opens the FullScreenViewer
  // which has full swipe-to-browse, pinch-to-zoom, and a counter.
  // No in-bubble counter row, no dots, no arrow nav — keeps the
  // bubble visually clean like iMessage's photo stack.
  return (
    <View style={s.root}>
      <View style={s.deckArea}>
        {bg2 && <View style={[s.card,s.cardBg2]}><Image source={{uri:bg2}} style={s.cardImg} resizeMode="cover"/></View>}
        {bg1 && <View style={[s.card,s.cardBg1]}><Image source={{uri:bg1}} style={s.cardImg} resizeMode="cover"/></View>}
        <Animated.View
          style={[
            s.card, s.cardTop,
            { borderWidth: StyleSheet.hairlineWidth, borderColor: accent, shadowColor: accent, shadowOpacity: 0.28, shadowRadius: 10 },
            { transform:[{translateX:panX}] },
          ]}
          {...pr.panHandlers}>
          <TouchableOpacity style={{flex:1}} onPress={() => { setFsStart(topIdx%count); setFsOpen(true); }} onLongPress={onLongPress} delayLongPress={500} activeOpacity={0.97}>
            <Image source={{uri:uris[topIdx%count]}} style={s.cardImg} resizeMode="cover"/>
          </TouchableOpacity>
        </Animated.View>
      </View>
      <FullScreenViewer uris={uris} startIndex={fsStart} visible={fsOpen} onClose={() => setFsOpen(false)}/>
    </View>
  );
}

// Single video player — useVideoPlayer must be at top level of a component
function SingleVideoPlayer({ uri, style }) {
  const player = useVideoPlayer({ uri }, p => { p.pause(); });
  return <VideoView player={player} style={style} nativeControls contentFit="contain" />;
}

export function VideoCarousel({ uris, onLongPress }) {
  const [index, setIndex] = useState(0);
  if (!uris || !uris.length) return null;
  const count = uris.length;
  return (
    <TouchableOpacity activeOpacity={1} onLongPress={onLongPress} delayLongPress={500} style={s.vcRoot}>
      {/* key forces remount (and new useVideoPlayer) when video index changes */}
      <SingleVideoPlayer key={uris[index]} uri={uris[index]} style={s.vcVideo} />
      {count > 1 && (
        <View style={s.vcNav}>
          <TouchableOpacity style={[s.vcBtn,index===0&&{opacity:0.3}]} onPress={() => setIndex(i=>Math.max(0,i-1))} disabled={index===0}><Text style={s.vcArrow}>‹</Text></TouchableOpacity>
          <Text style={s.vcCount}>{index+1} / {count} videos</Text>
          <TouchableOpacity style={[s.vcBtn,index===count-1&&{opacity:0.3}]} onPress={() => setIndex(i=>Math.min(count-1,i+1))} disabled={index===count-1}><Text style={s.vcArrow}>›</Text></TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function ResolvedPhotoStack({ keys, onLongPress }) {
  return <PhotoStack keys={keys} onLongPress={onLongPress}/>;
}
export function ResolvedVideoCarousel({ content, onLongPress }) {
  const uris = content.replace('VIDEOS:','').split('|').filter(Boolean);
  return <VideoCarousel uris={uris} onLongPress={onLongPress}/>;
}

const s = StyleSheet.create({
  placeholder: { width:CARD_W, height:CARD_H, borderRadius:18, backgroundColor:'#1a1a2e', alignItems:'center', justifyContent:'center' },
  root:        { alignItems:'center', paddingBottom:4 },
  counterRow:  { flexDirection:'row', alignItems:'center', marginBottom:10 },
  counterTx:   { color:'#fff', fontSize:13, fontWeight:'700' },
  counterHint: { color:'rgba(255,255,255,0.45)', fontSize:11 },
  // Wider/taller than the card itself so the bg cards' translate + rotate
  // can extend past the top card without getting clipped by the parent.
  deckArea:    { width:CARD_W+50, height:CARD_H+50, alignItems:'center', justifyContent:'center' },
  card:        { position:'absolute', width:CARD_W, height:CARD_H, borderRadius:18, overflow:'hidden', backgroundColor:'#111', shadowColor:'#000', shadowOffset:{width:0,height:6}, shadowOpacity:0.4, shadowRadius:12, elevation:8 },
  cardTop:     { zIndex:10 },
  // iMessage-style stack: keep the bg cards full size (no scale) so the
  // offset actually reveals them, and push them DOWN-RIGHT under the
  // top card so the stack reads as "more photos behind this one." A
  // small opposing tilt on each card adds the playing-card depth.
  // Larger offsets + full size + tilt = visible peek without the
  // dramatic fan we had originally.
  cardBg1:     { transform:[{translateX:10},{translateY:10},{rotate:'2deg'}], zIndex:5, opacity:0.95 },
  cardBg2:     { transform:[{translateX:20},{translateY:20},{rotate:'4deg'}], zIndex:1, opacity:0.82 },
  cardImg:     { width:'100%', height:'100%' },
  cardHint:    { position:'absolute', bottom:0, left:0, right:0, backgroundColor:'rgba(0,0,0,0.42)', paddingVertical:7 },
  cardHintTx:  { color:'rgba(255,255,255,0.85)', fontSize:11, textAlign:'center', fontWeight:'500' },
  navRow:      { flexDirection:'row', alignItems:'center', marginTop:12, gap:12 },
  navBtn:      { width:36, height:36, borderRadius:18, backgroundColor:'rgba(255,255,255,0.14)', alignItems:'center', justifyContent:'center' },
  navArrow:    { color:'#fff', fontSize:24, fontWeight:'700', lineHeight:28 },
  dotRow:      { flexDirection:'row', alignItems:'center', gap:5 },
  dot:         { width:6, height:6, borderRadius:3, backgroundColor:'rgba(255,255,255,0.3)' },
  dotActive:   { backgroundColor:'#fff', width:8, height:8, borderRadius:4 },
  dotMore:     { color:'rgba(255,255,255,0.5)', fontSize:11 },
  vcRoot:      { width:CARD_W, borderRadius:16, overflow:'hidden', backgroundColor:'#080808' },
  vcVideo:     { width:CARD_W, height:CARD_H },
  vcNav:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:10, paddingVertical:10, backgroundColor:'rgba(0,0,0,0.7)' },
  vcBtn:       { width:38, height:38, borderRadius:19, backgroundColor:'rgba(255,255,255,0.15)', alignItems:'center', justifyContent:'center' },
  vcArrow:     { color:'#fff', fontSize:24, fontWeight:'700', lineHeight:28 },
  vcCount:     { color:'#fff', fontSize:12, fontWeight:'600' },
});

const fs = StyleSheet.create({
  bg:        { flex:1, backgroundColor:'#000', overflow:'hidden' },
  closeBtn:  { position:'absolute', top:52, right:20, zIndex:20, backgroundColor:'rgba(255,255,255,0.18)', borderRadius:20, paddingHorizontal:14, paddingVertical:8 },
  closeTx:   { color:'#fff', fontWeight:'700', fontSize:15 },
  counter:   { position:'absolute', top:56, left:20, zIndex:20, backgroundColor:'rgba(0,0,0,0.5)', borderRadius:12, paddingHorizontal:10, paddingVertical:4 },
  counterTx: { color:'#fff', fontSize:13, fontWeight:'700' },
  img:       { width:SW, height:SH * 0.8 },
  hint:      { position:'absolute', bottom:44, left:0, right:0, alignItems:'center' },
  hintTx:    { color:'rgba(255,255,255,0.4)', fontSize:12 },
});
