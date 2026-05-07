// ReactionBar — displays aggregated emoji reactions below (or
// overlaid on) a message bubble.
//
// Default "inline" mode: row sits below the bubble with a small
// negative marginTop that pulls it up into the bubble's bottom
// edge so chips visibly straddle the boundary. This is the layout
// used for text bubbles.
//
// "overlayMode" (1.0.19+): when set, the row is rendered with no
// margin tweaks. The PARENT screen places this row inside an
// absolutely-positioned wrapper that floats the chips on top of
// the photo's bottom-edge corner. Used for media bubbles (photos
// + galleries) so the reactions look like iMessage/WhatsApp's
// floating chip rather than a separate row beneath the photo.
//
// Tap an emoji to toggle your own reaction (add if not present,
// remove if already present).
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function ReactionBar({ reactions, myUserId, onReact, accent, card, overlayMode }) {
  if (!reactions || reactions.length === 0) return null;

  // Group by emoji: { '❤️': [{ user_id, ... }, ...], ... }
  const groups = reactions.reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r);
    return acc;
  }, {});

  return (
    <View style={[s.row, overlayMode && s.rowOverlay]}>
      {Object.entries(groups).map(([emoji, list]) => {
        const iMine = list.some(r => r.user_id === myUserId);
        return (
          <TouchableOpacity
            key={emoji}
            style={[
              s.pill,
              { backgroundColor: iMine ? accent + '28' : card },
              iMine && { borderColor: accent, borderWidth: 1.5 },
              overlayMode && s.pillOverlay,
            ]}
            onPress={() => onReact(emoji)}
            activeOpacity={0.75}>
            <Text style={s.emoji}>{emoji}</Text>
            {list.length > 1 && (
              <Text style={[s.count, { color: iMine ? accent : '#888' }]}>
                {list.length}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  // Default inline mode (text bubbles): the reactions row is pulled
  // UP into the bubble's bottom edge via a negative marginTop, so
  // the chips sit on top of the lower corner of the message rather
  // than below it. The bubble remains fully readable because the
  // chips are small and anchored to the corner — they only cover a
  // thin strip of padding at the bottom of the bubble, not the
  // message text.
  row:   {
    flexDirection: 'row', flexWrap: 'wrap', gap: 4,
    marginTop: -14,          // pull into bubble
    marginHorizontal: 8,
    marginBottom: 4,         // restores space before the timestamp
    zIndex: 2,               // float above the bubble
  },
  // Overlay mode (media bubbles): no margin tweaks. The parent
  // wraps this in a position:absolute container so the chips
  // visibly float over the photo's bottom corner — matches
  // iMessage / WhatsApp / Telegram photo-reaction UX.
  rowOverlay: {
    marginTop: 0, marginHorizontal: 0, marginBottom: 0,
    flexWrap: 'nowrap',
  },
  pill:  {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 8, paddingVertical: 4,
    gap: 3,
    // Subtle shadow makes the chip feel like it's floating over the bubble.
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  // Overlay-mode pills get a stronger shadow + slightly larger
  // padding so they read clearly against busy photo content.
  pillOverlay: {
    shadowOpacity: 0.45, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  emoji: { fontSize: 16 },
  count: { fontSize: 12, fontWeight: '700' },
});
