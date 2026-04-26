// realtimeMessages.js — Supabase Realtime subscriptions for instant messaging
// Replaces setInterval polling with push-based WebSocket updates.
// Falls back silently if Realtime is not enabled on the table.
import { supabase } from './supabase';
import { isBlockedSync } from './blocks';

// Wrap an onInsert handler so messages from blocked users are silently
// dropped on the client side. Server-side enforcement is the primary
// gate (server.js drops `message:send` from banned users) but per-user
// blocks travel through Supabase Realtime which can race the server's
// blocked_users cache. This is the belt-and-suspenders client filter.
function _filterByBlocks(onInsert, getSenderId = (row) => row?.sender_id) {
  if (!onInsert) return onInsert;
  return (row) => {
    try {
      const sid = getSenderId(row);
      if (sid && isBlockedSync(sid)) return; // drop silently
    } catch {}
    onInsert(row);
  };
}

// Supabase Realtime v2.x throws ("cannot add postgres_changes
// callbacks ... after subscribe()") if .on() is called on a channel
// that's already in a subscribed state. supabase.channel(name) returns
// the EXISTING channel if one with that name already exists in the
// client's cache — so a stale channel from a prior screen mount will
// trip the guard on the next subscribe call. This helper finds any
// channel with the same topic and tears it down first, guaranteeing
// .channel() returns a fresh, unsubscribed instance every time.
export function freshChannel(name) {
  try {
    const channels = supabase.getChannels?.() || [];
    for (const c of channels) {
      // Channel topics in Supabase v2 are prefixed with "realtime:".
      if (c?.topic === `realtime:${name}` || c?.topic === name) {
        try { supabase.removeChannel(c); } catch {}
      }
    }
  } catch {}
  return supabase.channel(name);
}

/**
 * Subscribe to new messages in a 1:1 chat room.
 * @param {string}   roomId   — the chat room ID
 * @param {Function} onInsert — called with the new message row
 * @param {Function} onUpdate — called when a message is edited/updated
 * @returns cleanup function — call on component unmount
 */
export function subscribeToRoom(roomId, onInsert, onUpdate) {
  const filteredInsert = _filterByBlocks(onInsert);
  const channel = freshChannel(`room:${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
      payload => { if (payload.new) filteredInsert(payload.new); }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
      payload => { if (payload.new && onUpdate) onUpdate(payload.new); }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/**
 * Subscribe to new messages in a group.
 * @param {string}   groupId  — the group ID
 * @param {Function} onInsert — called with the new group_message row
 * @param {Function} onUpdate — called when a message is edited
 * @returns cleanup function
 */
export function subscribeToGroup(groupId, onInsert, onUpdate) {
  const filteredInsert = _filterByBlocks(onInsert);
  const channel = freshChannel(`group:${groupId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
      payload => { if (payload.new) filteredInsert(payload.new); }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
      payload => { if (payload.new && onUpdate) onUpdate(payload.new); }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/**
 * Broadcast typing indicator.
 * @param {string} roomId
 * @param {string} userId
 * @param {string} handle
 * @param {boolean} isTyping
 */
export function broadcastTyping(roomId, userId, handle, isTyping) {
  const channel = supabase.channel(`typing:${roomId}`);
  channel.send({
    type: 'broadcast',
    event: 'typing',
    payload: { userId, handle, isTyping },
  }).catch(() => {});
  // Don't subscribe — fire and forget
  supabase.removeChannel(channel);
}

/**
 * Listen for typing indicators in a room.
 * @param {string}   roomId
 * @param {Function} onTyping — called with { userId, handle, isTyping }
 * @returns cleanup function
 */
export function subscribeToTyping(roomId, onTyping) {
  const channel = freshChannel(`typing:${roomId}`)
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload) onTyping(payload);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}
