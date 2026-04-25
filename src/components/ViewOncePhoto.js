// ============================================================
//  VaultChat — View-Once Photo / Video Bubble (task #85)
//  src/components/ViewOncePhoto.js
//
//  A bubble that hides its content behind a tap-to-reveal
//  placeholder. Tapping opens fullscreen; on close, the bubble
//  marks itself as "viewed" in AsyncStorage and from that point
//  on shows an "Opened" placeholder — the recipient cannot replay
//  the content.
//
//  - Sender sees the same placeholder but can always re-open it
//    (they sent it, no privacy reason to lock them out). The
//    "Opened" marker only applies to recipients.
//  - View state is tracked locally per messageId. If the user
//    reinstalls or signs in on a new device, the marker is gone
//    — fine because the URL itself remains in the message body
//    only; without local content state there's nothing to gate.
//    A more bulletproof implementation would also delete the
//    storage object server-side after first view; that's a
//    follow-up. For now this matches Snapchat-style "view once"
//    semantics within this device's session.
//
//  Wire format: VONCE:<url>|<kind>   where kind is 'image' | 'video'
//
//  Props:
//    messageId    — used as the AsyncStorage key for view state
//    url          — https URL of the photo/video
//    kind         — 'image' (default) | 'video'
//    isMe         — true if I sent this; sender bypasses the
//                   one-shot lock (can always reopen)
//    accent       — theme accent color
//    onOpenImage  — function(url) — opens the existing fullscreen
//                   image viewer in the parent screen
//    onPlayVideo  — function(url) — opens the existing fullscreen
//                   video player in the parent screen
// ============================================================

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Eye, EyeOff } from 'lucide-react-native';

const STORAGE_PREFIX = 'vaultchat_viewed:';

export default function ViewOncePhoto({ messageId, url, kind = 'image', isMe, accent, onOpenImage, onPlayVideo }) {
  const [viewed, setViewed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Hydrate viewed state on mount. Each bubble owns its own slot in
  // AsyncStorage keyed by messageId — cheap reads, never collides
  // with anything else.
  useEffect(() => {
    if (!messageId) { setLoading(false); return; }
    AsyncStorage.getItem(STORAGE_PREFIX + messageId)
      .then(v => setViewed(v === '1'))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [messageId]);

  // Recipient + already viewed → permanently locked. Sender can
  // always re-open even after their first reveal.
  const isLocked = viewed && !isMe;

  function handleTap() {
    if (isLocked || loading) return;
    if (kind === 'video') onPlayVideo?.(url);
    else                  onOpenImage?.(url);
    // Mark as viewed only for the recipient. Sender doesn't get
    // locked out of their own content.
    if (!isMe && messageId) {
      AsyncStorage.setItem(STORAGE_PREFIX + messageId, '1').catch(() => {});
      setViewed(true);
    }
  }

  // Placeholder content varies based on state:
  //   loading      → just the empty pill so the layout doesn't jump
  //   isLocked     → "Opened" with crossed-eye icon, gray, dimmed
  //   default      → "View Once" with eye icon, accent color, tappable
  const label =
    loading  ? '…' :
    isLocked ? 'Opened' :
               (kind === 'video' ? 'Tap to play once' : 'Tap to view once');

  const Icon = isLocked ? EyeOff : Eye;
  const color = isLocked ? '#888' : accent;

  return (
    <TouchableOpacity
      onPress={handleTap}
      activeOpacity={isLocked ? 1 : 0.7}
      disabled={isLocked || loading}
      style={[
        s.pill,
        { borderColor: color, backgroundColor: color + '14' },
        isLocked && s.lockedDim,
      ]}>
      <View style={[s.iconCircle, { backgroundColor: color + '22' }]}>
        <Icon size={18} color={color} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.label, { color }]}>{label}</Text>
        <Text style={[s.sub, { color: '#888' }]}>
          {kind === 'video' ? 'Video · view once' : 'Photo · view once'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 18, borderWidth: 1,
    minWidth: 220,
  },
  lockedDim: { opacity: 0.7 },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 15, fontWeight: '700' },
  sub:   { fontSize: 11, marginTop: 2 },
});
