// ============================================================
//  VaultChat — Presence tracking
//  src/services/presence.js
//
//  Tracks "is this peer online right now?" and "when were they last
//  seen?" using a combination of:
//    - On-demand `presence:check` socket request (returns current state)
//    - `user:status` broadcasts (online/offline events from the server)
//    - Polling every 30s while the consumer is mounted (keeps the
//      "Last seen Xm ago" label fresh without waiting for an event)
//
//  Privacy:
//    - Consumers should respect the user's `vaultchat_show_presence`
//      setting — if off, don't render anything derived from this hook.
//    - The server doesn't enforce privacy today (it always answers
//      presence:check with the real state). Layer-1 privacy is
//      client-side "I refuse to show you this" and is enough for
//      social-expectation privacy. Full server enforcement is a
//      later task if needed.
// ============================================================

import { useEffect, useState, useRef } from 'react';
import { getSocket } from './socket';

const POLL_INTERVAL_MS = 30_000;

/**
 * Ask the server whether a user is online + get their last-seen time.
 * Returns a promise that resolves to { online, lastSeenAt } or null
 * on socket unavailability.
 */
export function checkPresence(userId) {
  return new Promise((resolve) => {
    const socket = getSocket();
    if (!socket || !userId) { resolve(null); return; }
    // socket.io v4+ supports ack callbacks as last arg
    socket.emit('presence:check', { userId }, (reply) => {
      resolve(reply || null);
    });
    // Fail-safe: if no ack in 2s, resolve with null
    setTimeout(() => resolve(null), 2000);
  });
}

/**
 * Turn an ISO timestamp into a short human-friendly "last seen" label.
 * Tries to match iMessage-ish brevity: "just now" / "5m" / "3h" / "2d".
 */
export function formatLastSeen(isoTs) {
  if (!isoTs) return '';
  const then = new Date(isoTs).getTime();
  if (!then) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60)       return 'just now';
  const mins = Math.floor(diffSec / 60);
  if (mins  < 60)         return `${mins}m ago`;
  const hrs  = Math.floor(mins / 60);
  if (hrs   < 24)         return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days  < 7)          return `${days}d ago`;
  return new Date(isoTs).toLocaleDateString();
}

/**
 * React hook — subscribes to presence for a given userId. Returns
 *   { online, lastSeenAt, label }
 * where `label` is the ready-to-render string: "Online", "Last seen 3h ago",
 * or '' if unknown.
 *
 * Hook is safe to unmount/remount; it manages its own subscription
 * lifecycle via AbortController-style flags.
 */
export function usePresence(userId) {
  const [state, setState] = useState({ online: false, lastSeenAt: null });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!userId) {
      setState({ online: false, lastSeenAt: null });
      return;
    }

    let cancelled = false;
    const socket = getSocket();

    const refresh = async () => {
      const snap = await checkPresence(userId);
      if (cancelled || !mountedRef.current) return;
      if (snap) setState({ online: !!snap.online, lastSeenAt: snap.lastSeenAt });
    };

    refresh();                                  // initial
    const interval = setInterval(refresh, POLL_INTERVAL_MS);

    // React to live status broadcasts too — cheaper than waiting for the poll.
    const onStatus = (payload) => {
      if (!payload || payload.userId !== userId) return;
      if (payload.status === 'online')  setState(prev => ({ ...prev, online: true }));
      if (payload.status === 'offline') setState(prev => ({ ...prev, online: false, lastSeenAt: new Date().toISOString() }));
    };
    socket?.on?.('user:status', onStatus);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      clearInterval(interval);
      socket?.off?.('user:status', onStatus);
    };
  }, [userId]);

  const label = state.online
    ? 'Online'
    : (state.lastSeenAt ? `Last seen ${formatLastSeen(state.lastSeenAt)}` : '');

  return { online: state.online, lastSeenAt: state.lastSeenAt, label };
}
