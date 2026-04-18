import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, Modal, StyleSheet,
  Animated, PanResponder, Dimensions, ActivityIndicator,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SW, height: SH } = Dimensions.get('window');
const CARD_W     = Math.min(SW * 0.64, 255);
const CARD_H     = CARD_W;
const DECK_SWIPE = CARD_W * 0.22;
const FS_SWIPE   = SW * 0.20;

function FullScreenViewer({ uris, startIndex, visible, onClose }) {
  const [idx, setIdx] = useState(0);
  const idxRef      = useRef(0);
  const urisRef     = useRef([]);
  const animatingFS = useRef(false);
  const slideX      = useRef(new Animated.Value(0)).current;

  useEffect(() => { idxRef.current  = idx;  }, [idx]);
  useEffect(() => { urisRef.current = uris; }, [uris]);

  useEffect(() => {
    if (visible) {
      const start = startIndex || 0;
      idxRef.current = start;
      setIdx(start);
      slideX.setValue(0);
      animatingFS.current = false;
    }
  }, [visible, startIndex]);

  const commitFS = useCallback((dir) => {
    if (animatingFS.current) return;
    const count = urisRef.current.length;
    if (count <= 1) return;
    animatingFS.current = true;
    const dest = dir === 'left' ? -SW : SW;
    Animated.timing(slideX, { toValue:dest, duration:220, useNativeDriver:true }).start(() => {
      const next = dir === 'left'
        ? (idxRef.current + 1) % count
        : (idxRef.current - 1 + count) % count;
      idxRef.current = next;
      setIdx(next);
      slideX.setValue(0);
      animatingFS.current = false;
    });
  }, [slideX]);

  const fsPR = useRef(PanResponder.create({
    onStartShouldSetPanResponder:  () => false,
    onMoveShouldSetPanResponder:   (_, g) =>
      !animatingFS.current && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove:  (_, g) => { if (!animatingFS.current) slideX.setValue(g.dx); },
    onPanResponderRelease: (_, g) => {
      const count = urisRef.current.length;
      if (count <= 1) { Animated.spring(slideX, { toValue:0, useNativeDriver:true }).start(); return; }
      if      (g.dx < -FS_SWIPE || g.vx < -0.6) commitFS('left');
      else if (g.dx >  FS_SWIPE || g.vx >  0.6) commitFS('right');
      else Animated.spring(slideX, { toValue:0, friction:6, tension:60, useNativeDriver:true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(slideX, { toValue:0, useNativeDriver:true }).start(),
  })).current;

  if (!visible || !uris || !uris.length) return null;

  const count   = uris.length;
  const current = uris[idx % count];
  const prev    = count > 1 ? uris[(idx - 1 + count) % count] : null;
  const next    = count > 1 ? uris[(idx + 1) % count]         : null;

  const prevX = slideX.interpolate({ inputRange:[-SW,0,SW], outputRange:[-SW*2,-SW,0],   extrapolate:'clamp' });
  const currX = slideX.interpolate({ inputRange:[-SW,0,SW], outputRange:[-SW,0,SW],      extrapolate:'clamp' });
  const nextX = slideX.interpolate({ inputRange:[-SW,0,SW], outputRange:[0,SW,SW*2],     extrapolate:'clamp' });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={fs.bg} {...fsPR.panHandlers}>
        <TouchableOpacity style={fs.closeBtn} onPress={onClose}>
          <Text style={fs.closeTx}>✕  Close</Text>
        </TouchableOpacity>
        {count > 1 && (
          <View style={fs.counter}>
            <Text style={fs.counterTx}>{(idx % count) + 1} / {count}</Text>
          </View>
        )}
        {prev && <Animated.Image source={{uri:prev}} style={[fs.img,{transform:[{translateX:prevX}]}]} resizeMode="contain"/>}
        <Animated.Image source={{uri:current}} style={[fs.img,{transform:[{translateX:currX}]}]} resizeMode="contain"/>
        {next && <Animated.Image source={{uri:next}} style={[fs.img,{transform:[{translateX:nextX}]}]} resizeMode="contain"/>}
        {count > 1 && <View style={fs.hint}><Text style={fs.hintTx}>← swipe to browse →</Text></View>}
      </View>
    </Modal>
  );
}

export function PhotoStack({ keys, onLongPress }) {
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

  const rotateCard = panX.interpolate({
    inputRange: [-CARD_W, 0, CARD_W],
    outputRange: ['-16deg', '0deg', '16deg'],
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

  const pr = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !isAnimating.current,
    onMoveShouldSetPanResponder:  (_, g) =>
      !isAnimating.current && Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderGrant: () => {
      panX.setOffset(panXValue.current);
      panX.setValue(0);
    },
    onPanResponderMove: (_, g) => {
      if (!isAnimating.current) { panX.setValue(g.dx); panY.setValue(g.dy * 0.25); }
    },
    onPanResponderRelease: (_, g) => {
      panX.flattenOffset(); panXValue.current = 0;
      const count = urisRef.current.length;
      if (count <= 1) {
        Animated.spring(panX, { toValue:0, useNativeDriver:false }).start();
        Animated.spring(panY, { toValue:0, useNativeDriver:false }).start();
        return;
      }
      const left  = g.dx < -DECK_SWIPE || g.vx < -0.5;
      const right = g.dx >  DECK_SWIPE || g.vx >  0.5;
      if (left || right) {
        isAnimating.current = true;
        const dest = left ? -SW*1.5 : SW*1.5;
        Animated.timing(panX, { toValue:dest, duration:210, useNativeDriver:false }).start(() => {
          panX.setValue(0); panY.setValue(0); panXValue.current = 0;
          const next = left
            ? (topIdxRef.current + 1) % count
            : (topIdxRef.current - 1 + count) % count;
          topIdxRef.current = next; setTopIdx(next);
          isAnimating.current = false;
        });
      } else {
        Animated.spring(panX, { toValue:0, friction:5, tension:50, useNativeDriver:false }).start();
        Animated.spring(panY, { toValue:0, friction:5, tension:50, useNativeDriver:false }).start();
      }
    },
    onPanResponderTerminate: () => {
      panX.flattenOffset(); panXValue.current = 0;
      Animated.spring(panX, { toValue:0, useNativeDriver:false }).start();
      Animated.spring(panY, { toValue:0, useNativeDriver:false }).start();
    },
  })).current;

  if (loading) return <View style={s.placeholder}><ActivityIndicator size="small" color="#888"/></View>;
  if (!uris.length) return null;

  const count = uris.length;
  const bg1   = count >= 2 ? uris[(topIdx + 1) % count] : null;
  const bg2   = count >= 3 ? uris[(topIdx + 2) % count] : null;

  return (
    <View style={s.root}>
      <View style={s.counterRow}>
        <Text style={s.counterTx}>{(topIdx % count) + 1} / {count}</Text>
        {count > 1 && <Text style={s.counterHint}>  swipe left or right</Text>}
      </View>
      <View style={s.deckArea}>
        {bg2 && <View style={[s.card,s.cardBg2]}><Image source={{uri:bg2}} style={s.cardImg} resizeMode="cover"/></View>}
        {bg1 && <View style={[s.card,s.cardBg1]}><Image source={{uri:bg1}} style={s.cardImg} resizeMode="cover"/></View>}
        <Animated.View style={[s.card,s.cardTop,{transform:[{translateX:panX},{translateY:panY},{rotate:rotateCard}]}]} {...pr.panHandlers}>
          <TouchableOpacity style={{flex:1}} onPress={() => { setFsStart(topIdx%count); setFsOpen(true); }} onLongPress={onLongPress} delayLongPress={500} activeOpacity={0.97}>
            <Image source={{uri:uris[topIdx%count]}} style={s.cardImg} resizeMode="cover"/>
            <View style={s.cardHint}><Text style={s.cardHintTx}>Tap to expand  ·  swipe to browse</Text></View>
          </TouchableOpacity>
        </Animated.View>
      </View>
      {count > 1 && (
        <View style={s.navRow}>
          <TouchableOpacity style={s.navBtn} onPress={goBack}><Text style={s.navArrow}>‹</Text></TouchableOpacity>
          <View style={s.dotRow}>
            {Array.from({length:Math.min(count,8)}).map((_,i) => (
              <View key={i} style={[s.dot, i===(topIdx%Math.min(count,8))&&s.dotActive]}/>
            ))}
            {count > 8 && <Text style={s.dotMore}>+{count-8}</Text>}
          </View>
          <TouchableOpacity style={s.navBtn} onPress={advance}><Text style={s.navArrow}>›</Text></TouchableOpacity>
        </View>
      )}
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
  deckArea:    { width:CARD_W+30, height:CARD_H+30, alignItems:'center', justifyContent:'center' },
  card:        { position:'absolute', width:CARD_W, height:CARD_H, borderRadius:18, overflow:'hidden', backgroundColor:'#111', shadowColor:'#000', shadowOffset:{width:0,height:6}, shadowOpacity:0.4, shadowRadius:12, elevation:8 },
  cardTop:     { zIndex:10 },
  cardBg1:     { transform:[{rotate:'3.5deg'},{scale:0.96},{translateY:-4}], zIndex:5, opacity:0.82 },
  cardBg2:     { transform:[{rotate:'-3.5deg'},{scale:0.92},{translateY:-9}], zIndex:1, opacity:0.60 },
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
  img:       { position:'absolute', width:SW, height:SH, top:0, left:0 },
  hint:      { position:'absolute', bottom:44, left:0, right:0, alignItems:'center' },
  hintTx:    { color:'rgba(255,255,255,0.4)', fontSize:12 },
});
