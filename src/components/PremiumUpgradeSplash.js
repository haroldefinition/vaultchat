// ============================================================
//  PremiumUpgradeSplash — full-screen "You're now Premium"
//  celebration shown when the user's premium flag flips from
//  false → true (purchase, restore, or server-confirmed sync).
//
//  Per Harold's branding direction:
//    - Blue shield (vaultchat-logo.png) is the CORE brand —
//      always shown for app icon, Welcome, and free-tier
//      surfaces.
//    - V+crown identity is the PREMIUM mark — only appears in
//      premium spaces (this splash, premium-mode chrome).
//    - This splash makes upgrade feel like an event, not a
//      toggle: dark canvas, large mark, fade animation, 3s
//      auto-dismiss with a "Done" tap escape.
//
//  Wired in App.js:
//    const splash = useUpgradeSplashListener();  // false→true detect
//    {splash.visible && <PremiumUpgradeSplash onDone={splash.dismiss} />}
//
//  TODO (Harold to save asset): drop a real V+crown PNG into
//  assets/vaultchat-premium-mark.png and replace the emoji+text
//  fallback below with <Image source={require(...)} />. The
//  fallback ships with the same shape so the swap is one line.
// ============================================================

import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Text, Image, StyleSheet, Animated, TouchableOpacity, Dimensions, StatusBar,
} from 'react-native';

// Premium V+crown brand mark — saved by Harold to assets/.
const PREMIUM_MARK = require('../../assets/vaultchat-premium-mark.png');

const PURPLE = '#7C3AED';
const GOLD   = '#F5C518';

export default function PremiumUpgradeSplash({ visible, onDone }) {
  const fade  = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
  const glow  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    // Fade + scale in, then a slow shimmer on the glow ring.
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
    // Auto-dismiss after 3s — the user can also tap Done early.
    const t = setTimeout(() => dismiss(), 3000);
    return () => clearTimeout(t);
  }, [visible]);

  function dismiss() {
    Animated.timing(fade, { toValue: 0, duration: 300, useNativeDriver: true })
      .start(() => onDone && onDone());
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss}>
      <Animated.View style={[s.backdrop, { opacity: fade }]}>
        <StatusBar barStyle="light-content" />

        {/* Glow ring pulsing behind the mark */}
        <Animated.View style={[
          s.glowRing,
          {
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] }),
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
          },
        ]} />

        {/* The mark — real brand asset. Saved by Harold at
            assets/vaultchat-premium-mark.png. */}
        <Animated.View style={[s.markWrap, { transform: [{ scale }] }]}>
          <Image source={PREMIUM_MARK} style={s.markImg} resizeMode="contain" />
        </Animated.View>

        <Animated.Text style={[s.title, { opacity: fade }]}>You’re now Premium</Animated.Text>
        <Animated.Text style={[s.tagline, { opacity: fade }]}>Welcome to the gold tier of VaultChat.</Animated.Text>

        <Animated.View style={{ opacity: fade }}>
          <TouchableOpacity style={s.doneBtn} onPress={dismiss} activeOpacity={0.85}>
            <Text style={s.doneTx}>Done</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const { width } = Dimensions.get('window');

const s = StyleSheet.create({
  backdrop:   {
    flex: 1,
    backgroundColor: '#0a0a0f',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  glowRing:   {
    position: 'absolute',
    width: width * 0.78, height: width * 0.78,
    borderRadius: width * 0.78,
    backgroundColor: PURPLE,
    top: undefined, // sits behind the mark — flex centering handles vertical
  },
  markWrap:   {
    width: 220, height: 220,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 56, position: 'relative',
    // Rounded corners + matching overflow:hidden so the V+crown
    // image's baked-in dark square background reads as a tasteful
    // app-icon-style mark instead of a square clashing with the
    // round glow ring behind it. 28px radius gives the same "soft
    // squircle" feel as iOS app icons.
    borderRadius: 28,
    overflow: 'hidden',
  },
  markImg:    { width: '100%', height: '100%' },
  title:      { color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 8, letterSpacing: 0.3 },
  tagline:    { color: 'rgba(255,255,255,0.65)', fontSize: 14, textAlign: 'center', marginBottom: 36 },
  doneBtn:    {
    paddingHorizontal: 38, paddingVertical: 14,
    borderRadius: 28, backgroundColor: PURPLE,
    shadowColor: PURPLE, shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 6 }, shadowRadius: 18,
    elevation: 6,
  },
  doneTx:     { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
});
