// SwipeableRow — swipe right on a message bubble to reply to it.
// Uses PanResponder for the swipe gesture only — the gesture is
// strictly horizontal so it never conflicts with the parent FlatList's
// vertical scroll. A reply arrow icon slides in from behind the bubble
// as the user drags right, giving clear visual feedback.
import React, { useRef } from 'react';
import { Animated, PanResponder, View, Text, StyleSheet } from 'react-native';

const TRIGGER_DIST = 72; // how far right to drag before reply fires

export default function SwipeableRow({ children, onReply, disabled = false }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const triggered  = useRef(false);

  const panResponder = useRef(PanResponder.create({
    // Only claim the gesture if it's clearly horizontal (dx > dy)
    onMoveShouldSetPanResponder: (_, g) =>
      !disabled &&
      g.dx > 8 &&
      Math.abs(g.dx) > Math.abs(g.dy) * 1.5,

    onPanResponderGrant: () => {
      triggered.current = false;
    },

    onPanResponderMove: (_, g) => {
      if (g.dx < 0) return; // only allow rightward swipe
      const clamped = Math.min(g.dx, TRIGGER_DIST + 16);
      translateX.setValue(clamped);

      // Fire reply callback once when threshold is crossed
      if (!triggered.current && g.dx >= TRIGGER_DIST) {
        triggered.current = true;
        if (onReply) onReply();
      }
    },

    onPanResponderRelease: () => {
      // Snap back regardless
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        friction: 6,
        tension: 80,
      }).start();
    },

    onPanResponderTerminate: () => {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    },
  })).current;

  // Reply icon opacity and position track the drag
  const iconOpacity = translateX.interpolate({
    inputRange: [0, 24, TRIGGER_DIST],
    outputRange: [0, 0.4, 1],
    extrapolate: 'clamp',
  });
  const iconTranslate = translateX.interpolate({
    inputRange: [0, TRIGGER_DIST],
    outputRange: [-20, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={s.container}>
      {/* Reply icon — sits behind the bubble, revealed on swipe */}
      <Animated.View style={[s.replyIcon, { opacity: iconOpacity, transform: [{ translateX: iconTranslate }] }]}>
        <Text style={s.replyEmoji}>↩</Text>
      </Animated.View>

      {/* The bubble itself slides right */}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { position: 'relative' },
  replyIcon: {
    position: 'absolute',
    left: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 32,
  },
  replyEmoji: { fontSize: 20, color: '#90D5FF' },
});
