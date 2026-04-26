// ============================================================
//  VaultChat — Dispersing-dots waveform animation
//  src/components/DisperseDots.js
//
//  Renders 7 dots on one side of an element, scaling + fading in
//  a continuous traveling-wave pattern. Used on both sides of the
//  call avatar to give the premium-mockup "pulse" feel when a call
//  is connecting, ringing, or actively ringing an invitee.
//
//  Two layout shapes:
//    • Free      → flat horizontal line of dots (the original).
//    • Premium   → curved arc that disperses outward from the
//                  avatar in a parabolic shape, matching Harold's
//                  premium call-screen mockup. We add a vertical
//                  offset per dot derived from a sine curve so the
//                  dots draw a visible arc rather than a straight
//                  bar of light.
//
//  Props:
//    accent  — dot fill color (typically theme.accent)
//    side    — 'left' | 'right' (controls which dot is closest to
//              the avatar — we size them larger near the avatar)
//    active  — true = loop animation, false = settle all dots at rest
//    speed   — optional animation speed profile:
//                'calm'     — 700ms in/out, 120ms stagger (default)
//                'ringing'  — 450ms in/out, 80ms stagger  (feels urgent)
//    shape   — 'line' | 'arc' (default 'line'). Premium callers pass
//              'arc' to get the dispersing curve from the mockup.
// ============================================================

import React, { useRef, useEffect } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

const DOTS = 7;

export default function DisperseDots({ accent, side = 'right', active = true, speed = 'calm', shape = 'line' }) {
  const anims = useRef(Array.from({ length: DOTS }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (!active) { anims.forEach(a => a.setValue(0)); return; }
    const dur     = speed === 'ringing' ? 450 : 700;
    const stagger = speed === 'ringing' ?  80 : 120;
    // Every dot shares the same loop period (up + down). The per-dot
    // delay is applied as a setTimeout *start* offset, so the wave
    // stays phase-stable indefinitely — see commit notes for the bug
    // this replaces (drift after the first cycle).
    const loops = anims.map(a =>
      Animated.loop(Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: dur, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: dur, useNativeDriver: true }),
      ])),
    );
    const timeouts = loops.map((l, i) => setTimeout(() => l.start(), i * stagger));
    return () => {
      timeouts.forEach(clearTimeout);
      loops.forEach(l => l.stop());
    };
  }, [active, speed]);

  if (!active) return null;

  return (
    <View style={[s.row, side === 'left' ? s.rowLeft : s.rowRight]} pointerEvents="none">
      {anims.map((a, i) => {
        // Dots further from the avatar: smaller at rest, bigger peak.
        const distanceIndex = side === 'left' ? (DOTS - 1 - i) : i;
        const baseSize = 10 - distanceIndex * 0.9;
        const scale   = a.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.2] });
        const opacity = a.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1.0] });

        // ── Arc layout for premium ────────────────────────────
        // The closest dot to the avatar sits on the centerline,
        // and each dot further out climbs along a parabola so the
        // row of dots draws a visible curve. The peak of the arc
        // is roughly 14px above the centerline at the farthest
        // dot — enough for the "dispersing in a shape" read Harold
        // wants without taking the dots out of horizontal flow.
        let translateY = 0;
        if (shape === 'arc') {
          const t = distanceIndex / (DOTS - 1);     // 0 (close) → 1 (far)
          translateY = -14 * (t * t);               // parabola climbs as we move outward
        }

        return (
          <Animated.View
            key={i}
            style={{
              width: baseSize, height: baseSize, borderRadius: baseSize / 2,
              marginHorizontal: 4, backgroundColor: accent,
              opacity,
              transform: [{ translateY }, { scale }],
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
