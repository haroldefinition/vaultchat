// CallQualityChip.js — Tiny, unobtrusive banner that surfaces live call-path
// quality adaptation. Stays invisible on good networks; appears only when
// VaultChat has downshifted the codec to keep the call clear on a weak path.
//
// Source of truth: services/networkQuality.js (fed by RTCPeerConnection.getStats).
// Adaptation itself happens in services/callQuality.js::applyAdaptation.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import netQ from '../services/networkQuality';

const COPY = {
  good:     null, // invisible — no banner needed
  poor:     { icon: '📡', text: 'Optimizing for your connection',   color: '#ffd700' },
  critical: { icon: '📶', text: 'Low-bandwidth mode · staying clear', color: '#ff9500' },
};

export default function CallQualityChip() {
  const [quality, setQuality] = useState(netQ.getQuality());
  const [fade] = useState(new Animated.Value(0));

  useEffect(() => {
    const unsub = netQ.subscribe(({ quality: q }) => setQuality(q));
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  const visible = quality !== 'good';
  useEffect(() => {
    Animated.timing(fade, {
      toValue: visible ? 1 : 0,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [visible, fade]);

  const copy = COPY[quality];
  if (!copy) return null;

  return (
    <Animated.View style={[s.wrap, { opacity: fade, borderColor: copy.color, backgroundColor: copy.color + '1C' }]}>
      <Text style={s.icon}>{copy.icon}</Text>
      <Text style={[s.text, { color: copy.color }]}>{copy.text}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              8,
    paddingHorizontal:14,
    paddingVertical:  7,
    borderRadius:     18,
    borderWidth:      1,
    alignSelf:        'center',
    marginTop:        6,
  },
  icon: { fontSize: 13 },
  text: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
});
