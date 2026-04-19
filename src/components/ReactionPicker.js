// ReactionPicker — emoji reaction picker modal.
// Shows 6 quick-react emojis in a floating row above the tapped message.
// Tapping an emoji the user already reacted with removes their reaction.
// Tapping a new emoji adds it.
import React from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';

const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

export default function ReactionPicker({
  visible,
  onClose,
  onReact,       // (emoji) => void
  myReaction,    // the emoji this user already reacted with, or null
  card,
  accent,
}) {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.overlay}>
          <TouchableWithoutFeedback>
            <View style={[s.picker, { backgroundColor: card }]}>
              {REACTIONS.map(emoji => {
                const selected = myReaction === emoji;
                return (
                  <TouchableOpacity
                    key={emoji}
                    style={[s.emojiBtn, selected && { backgroundColor: accent + '30', borderColor: accent, borderWidth: 1.5 }]}
                    onPress={() => { onReact(emoji); onClose(); }}
                    activeOpacity={0.7}>
                    <Text style={s.emoji}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  picker:   { flexDirection: 'row', borderRadius: 40, paddingVertical: 10, paddingHorizontal: 8, gap: 4, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  emojiBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emoji:    { fontSize: 28 },
});
