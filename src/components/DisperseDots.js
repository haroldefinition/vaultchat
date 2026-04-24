// ============================================================
//  VaultChat — Dispersing-dots waveform animation
//  src/components/DisperseDots.js
//
//  Renders 7 dots on one side of an element, scaling + fading in
//  a continuous traveling-wave pattern. Used on both sides of the
//  call avatar to give the premium-mockup "pulse" feel when a call
//  is connecting, ringing, or actively ringing an invitee.
//
//  Props:
//    accent  — dot fill color (typically theme.accent)
//    side    — 'left' | 'right' (controls which dot is closest to
//              the avatar — we size them larger near the avatar)
//    active  — true = loop animation, false = settle all dots at rest
//    speed   — optional animation speed profile:
//                'calm'     — 700ms in/out, 120ms stagger (default)
//                'ringing'  — 450ms in/out, 80ms stagger  (feels urgent)
// ============================================================

import React, { useRef, useEffect } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

const DOTS = 7;

export default function DisperseDots({ accent, side = 'right', active = true, speed = 'calm' }) {
  const anims = useRef(Array.from({ length: DOTS }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (!active) { anims.forEach(a => a.setValue(0)); return; }
    const dur     = speed === 'ringing' ? 450 : 700;
    const stagger = speed === 'ringing' ?  80 : 120;
    const loops = anims.map((a, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * stagger),
        Animated.timing(a, { toValue: 1, duration: dur, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: dur, useNativeDriver: true }),
      ])),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [active, speed]);

  // When the call connects we want the dots GONE, not just dimmed. Returning
  // null here reserves no layout space — fine because the avatar stage is
  // a flex row that just collapses neatly when the dots disappear.
  if (!active) return null;

  return (
    <View style={[s.row, side === 'left' ? s.rowLeft : s.rowRight]} pointerEvents="none">
      {anims.map((a, i) => {
        // Dots further from the avatar: smaller at rest, bigger peak.
        const distanceIndex = side === 'left' ? (DOTS - 1 - i) : i;
        const baseSize = 10 - distanceIndex * 0.9;
        const scale   = a.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.2] });
        // Higher min opacity (0.35) so the dots are visible even at rest —
        // fixes the "barely there" look on light-mode backgrounds where the
        // accent color has low contrast against the canvas.
        const opacity = a.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1.0] });
        return (
          <Animated.View
            key={i}
            style={{
              width: baseSize, height: baseSize, borderRadius: baseSize / 2,
              marginHorizontal: 4, backgroundColor: accent,
              opacity, transform: [{ scale }],
            }}
          />
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center' },
  rowLeft:  { marginRight: 16, flexDirection: 'row' },
  rowRight: { marginLeft:  16, flexDirection: 'row' },
});
