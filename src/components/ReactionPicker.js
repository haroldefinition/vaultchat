// ReactionPicker — emoji reaction picker modal.
//
// Layout: [emoji 1] [emoji 2] ... [emoji 6]   |   [↩ Reply]   [⋯ More]
//
// Tapping any emoji reacts and dismisses.
// Tapping ↩ Reply opens reply mode and dismisses.
// Tapping ⋯ More opens the full action menu (Pin / Edit / Delete / Report).
//
// Reply was previously buried inside the "More" menu, which made it
// 3 taps from a long-press. Now it's 1 tap, sitting visibly alongside
// the emoji react options — so users can react OR reply in a single
// gesture without hunting for the option.
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
  onReply,       // optional () => void — opens reply mode
  onMore,        // optional () => void — opens full action menu (Pin/Edit/Delete/Report)
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

              {/* Vertical separator before the action buttons so the
                  emoji react cluster is visually distinct from the
                  reply / more cluster. */}
              {(onReply || onMore) && (
                <View style={[s.separator, { backgroundColor: accent + '40' }]} />
              )}

              {onReply && (
                <TouchableOpacity
                  style={[s.actionBtn, { borderColor: accent }]}
                  onPress={() => { onClose(); onReply(); }}
                  activeOpacity={0.7}>
                  <Text style={[s.actionIcon, { color: accent }]}>↩</Text>
                </TouchableOpacity>
              )}

              {onMore && (
                <TouchableOpacity
                  style={[s.actionBtn, { borderColor: accent }]}
                  onPress={() => { onClose(); onMore(); }}
                  activeOpacity={0.7}>
                  <Text style={[s.actionIcon, { color: accent }]}>⋯</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  picker:     {
    flexDirection: 'row',
    flexWrap: 'wrap',          // wrap on narrow screens so chips never run off-edge
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
    maxWidth: '92%',           // leave breathing room from screen edges
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  emojiBtn:   { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emoji:      { fontSize: 28 },
  separator:  { width: 1, height: 32, marginHorizontal: 6, opacity: 0.6 },
  actionBtn:  { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  actionIcon: { fontSize: 22, fontWeight: '800', lineHeight: 24 },
});
