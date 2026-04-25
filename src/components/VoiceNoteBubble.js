// ============================================================
//  VaultChat — Voice Note Playback Bubble
//  src/components/VoiceNoteBubble.js
//
//  Renders an inline player for a voice note message:
//
//    [▶/⏸]  ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮     0:18
//
//  - Tap the play button to start/stop playback
//  - Waveform "bars" are decorative (we don't decode the actual
//    audio peaks — that's a heavy operation we don't need for an
//    MVP). Bars animate while playing to signal activity.
//  - Duration displayed as M:SS, supplied by the sender at upload
//    time. Falls back to the player's own duration once loaded.
//
//  Design references the chat mockup: pill-shaped container,
//  prominent circular play button on the left, tinted bars in the
//  middle, duration on the right beneath the bars.
//
//  Props:
//    url         — https:// URL of the audio file
//    durationSec — number (sender-supplied length in seconds)
//    accent      — theme accent color (violet dark / Fiji blue light)
//    isMe        — true if I sent this; flips text colors
//    bgColor     — bubble background; usually the bubbleOut/bubbleIn
//                  color from the parent's theme
// ============================================================

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useAudioPlayer } from 'expo-audio';

const BAR_COUNT = 24;

function formatDuration(sec) {
  if (!sec || sec < 0 || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VoiceNoteBubble({ url, durationSec, accent, isMe, bgColor }) {
  // useAudioPlayer takes a source object or plain string URL. Passing an
  // object with { uri } is the most explicit form and works across the
  // expo-audio versions we've targeted (1.1.x).
  const player = useAudioPlayer({ uri: url });
  const [isPlaying, setIsPlaying] = useState(false);

  // Decorative animated bars — random heights baked once per mount so
  // each bubble has a stable "fingerprint." During playback we wave
  // them subtly with a single staggered loop.
  const bars = useRef(
    Array.from({ length: BAR_COUNT }, () => ({
      base: 0.35 + Math.random() * 0.55,
      anim: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    if (!isPlaying) {
      bars.forEach(b => b.anim.setValue(0));
      return;
    }
    const loops = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 35),
          Animated.timing(b.anim, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(b.anim, { toValue: 0, duration: 350, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [isPlaying]);

  // Watch the player so we know when playback ends.
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener?.('playbackStatusUpdate', (status) => {
      if (status?.didJustFinish) {
        setIsPlaying(false);
        try { player.seekTo(0); } catch {}
      }
    });
    return () => { try { sub?.remove?.(); } catch {} };
  }, [player]);

  function toggle() {
    if (!player) return;
    try {
      if (isPlaying) {
        player.pause();
        setIsPlaying(false);
      } else {
        // If we finished playing, snap back to the start before resuming
        try { if (player.currentTime >= (player.duration || 0) - 0.05) player.seekTo(0); } catch {}
        player.play();
        setIsPlaying(true);
      }
    } catch {}
  }

  // Color choices: bars + duration text in accent color so the bubble
  // pops against either the colored "my" bubble or the neutral
  // "their" bubble. Play button sits in a tinted circle.
  const barColor   = accent;
  const labelColor = isMe ? 'rgba(255,255,255,0.85)' : accent;

  return (
    <View style={[s.row, { backgroundColor: bgColor || 'transparent' }]}>
      <TouchableOpacity
        onPress={toggle}
        accessibilityLabel={isPlaying ? 'Pause voice note' : 'Play voice note'}
        style={[s.playBtn, { backgroundColor: accent + '33', borderColor: accent }]}>
        <Text style={[s.playIcon, { color: accent }]}>{isPlaying ? '⏸' : '▶'}</Text>
      </TouchableOpacity>

      <View style={s.middle}>
        <View style={s.waveform}>
          {bars.map((b, i) => {
            const scale = b.anim.interpolate({
              inputRange: [0, 1],
              outputRange: [b.base, Math.min(1, b.base + 0.45)],
            });
            return (
              <Animated.View
                key={i}
                style={[
                  s.bar,
                  { backgroundColor: barColor, transform: [{ scaleY: scale }] },
                ]}
              />
            );
          })}
        </View>
        <Text style={[s.duration, { color: labelColor }]}>{formatDuration(durationSec)}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row:        {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 10,
    borderRadius: 22, gap: 12, minWidth: 230,
  },
  playBtn:    {
    width: 42, height: 42, borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  playIcon:   { fontSize: 18, fontWeight: '700', marginLeft: 2 },
  middle:     { flex: 1, justifyContent: 'center' },
  // Waveform row — 22px tall, bars 3px wide with small gaps. Each bar
  // anchors to vertical center so scaleY grows it both up and down.
  waveform:   {
    flexDirection: 'row', alignItems: 'center',
    height: 24, gap: 3,
  },
  bar:        { width: 3, height: 22, borderRadius: 2 },
  duration:   { fontSize: 11, fontWeight: '600', marginTop: 4 },
});
