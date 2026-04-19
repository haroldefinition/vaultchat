// ReactionBar — displays aggregated emoji reactions below a message bubble.
// Groups reactions by emoji, shows count, highlights ones the current user made.
// Tap an emoji to toggle your own reaction (add if not reacted, remove if already reacted).
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function ReactionBar({ reactions, myUserId, onReact, accent, card }) {
  if (!reactions || reactions.length === 0) return null;

  // Group by emoji: { '❤️': [{ user_id, ... }, ...], ... }
  const groups = reactions.reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r);
    return acc;
  }, {});

  return (
    <View style={s.row}>
      {Object.entries(groups).map(([emoji, list]) => {
        const iMine = list.some(r => r.user_id === myUserId);
        return (
          <TouchableOpacity
            key={emoji}
            style={[
              s.pill,
              { backgroundColor: iMine ? accent + '28' : card },
              iMine && { borderColor: accent, borderWidth: 1.5 },
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
  row:   { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, marginHorizontal: 4 },
  pill:  { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4, gap: 3 },
  emoji: { fontSize: 16 },
  count: { fontSize: 12, fontWeight: '700' },
});
