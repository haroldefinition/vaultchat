// ============================================================
//  VaultChat — View-Once Photo / Video Bubble (1.0.18+ v2)
//  src/components/ViewOncePhoto.js
//
//  A bubble that hides its content behind a tap-to-reveal
//  placeholder. Tapping opens fullscreen; on close, the bubble
//  records the view in AsyncStorage. After the configured view
//  limit is reached, the bubble shows an "Opened" placeholder
//  forever — the recipient cannot replay the content.
//
//  v2 (1.0.18+): adds a viewLimit prop so a single component
//  handles both "View Once" (viewLimit=1) and "Replay" (viewLimit
//  >=2). The placeholder shows "X views remaining" while the
//  counter is live; on the last view it becomes "Opened".
//
//  - Sender sees the same placeholder but can always re-open it
//    until the recipient consumes the final view. After that the
//    storage object may be deleted server-side, in which case the
//    fullscreen open will simply fail to fetch — same UX outcome.
//  - View state is tracked locally per messageId. If the user
//    reinstalls or signs in on a new device, the marker is gone.
//    The server-side delete (called on the recipient's final
//    view) is what enforces the privacy property; the local
//    counter is just UX.
//
//  Wire format: VONCE:<url>|<kind>|<viewLimit>
//    - kind     = 'image' | 'video'
//    - viewLimit = '1' (View Once) or '3' (Replay) — optional;
//                  missing = 1 for backwards-compat with v1 wires.
//
//  Props:
//    messageId    — used as the AsyncStorage key for view state
//    url          — https URL of the photo/video
//    kind         — 'image' (default) | 'video'
//    viewLimit    — total views allowed (default 1)
//    isMe         — true if I sent this; sender bypasses the
//                   one-shot lock (can always reopen until the
//                   final consume)
//    accent       — theme accent color
//    onOpenImage  — function(url) — opens the existing fullscreen
//                   image viewer in the parent screen
//    onPlayVideo  — function(url) — opens the existing fullscreen
//                   video player in the parent screen
//    onConsumeView — optional callback fired after each successful
//                    view, with { messageId, viewsConsumed,
//                    viewsRemaining, isFinal }. The parent screen
//                    uses it to invoke the consume-vonce-view edge
//                    function for sender notification + storage
//                    delete on the final view.
// ============================================================

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Eye, EyeOff } from 'lucide-react-native';

const STORAGE_PREFIX = 'vaultchat_viewed:';

export default function ViewOncePhoto({
  messageId,
  url,
  kind = 'image',
  viewLimit = 1,
  isMe,
  accent,
  onOpenImage,
  onPlayVideo,
  onConsumeView,
}) {
  const [viewsConsumed, setViewsConsumed] = useState(0);
  const [loading, setLoading] = useState(true);

  // Hydrate view count on mount. Each bubble owns its own slot in
  // AsyncStorage keyed by messageId — cheap reads, never collides
  // with anything else.
  //
  // Backwards-compat: the v1 implementation stored '1' as a boolean
  // meaning "viewed". For v1 wires (viewLimit=1) that string parses
  // as count=1, which equals the limit, which correctly renders as
  // "Opened". So no migration needed — the same storage key serves
  // both formats.
  useEffect(() => {
    if (!messageId) { setLoading(false); return; }
    AsyncStorage.getItem(STORAGE_PREFIX + messageId)
      .then(v => {
        const n = parseInt(v, 10);
        setViewsConsumed(Number.isFinite(n) ? n : 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [messageId]);

  const limit = Math.max(1, parseInt(viewLimit, 10) || 1);
  const viewsRemaining = Math.max(0, limit - viewsConsumed);
  // Recipient + exhausted → permanently locked. Sender can keep
  // opening their own content until the recipient consumes the
  // final view (at which point the storage object may have been
  // deleted server-side — fetch will return 404 and the open will
  // silently fail).
  const isLocked = viewsRemaining <= 0 && !isMe;

  function handleTap() {
    if (isLocked || loading) return;
    if (kind === 'video') onPlayVideo?.(url);
    else                  onOpenImage?.(url);

    // Only the recipient consumes views — sender's reopens don't
    // decrement the counter (they sent it, no privacy reason to
    // lock them out of their own content within the live window).
    if (!isMe && messageId) {
      const next = viewsConsumed + 1;
      AsyncStorage.setItem(STORAGE_PREFIX + messageId, String(next)).catch(() => {});
      setViewsConsumed(next);
      const isFinal = next >= limit;
      onConsumeView?.({
        messageId,
        viewsConsumed: next,
        viewsRemaining: Math.max(0, limit - next),
        isFinal,
      });
    }
  }

  // Placeholder content varies based on state:
  //   loading      → just the empty pill so the layout doesn't jump
  //   isLocked     → "Opened" with crossed-eye icon, gray, dimmed
  //   live counter → "Tap to view (X remaining)" while replays left
  //   single-view  → "Tap to view once" if limit is 1
  let label;
  if (loading) {
    label = '…';
  } else if (isLocked) {
    label = 'Opened';
  } else if (limit === 1) {
    label = (kind === 'video') ? 'Tap to play once' : 'Tap to view once';
  } else {
    const action = (kind === 'video') ? 'Tap to play' : 'Tap to view';
    label = `${action} · ${viewsRemaining} ${viewsRemaining === 1 ? 'view' : 'views'} remaining`;
  }

  // Sub-line communicates the mode to the recipient even before
  // they open it, so they understand what they're tapping into.
  const modeText =
    limit === 1 ? 'View once' : `Replay · up to ${limit} views`;
  const sub =
    (kind === 'video' ? 'Video · ' : 'Photo · ') + modeText;

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
        <Text style={[s.sub, { color: '#888' }]}>{sub}</Text>
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
