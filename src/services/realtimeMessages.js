// realtimeMessages.js — Supabase Realtime subscriptions for instant messaging
// Replaces setInterval polling with push-based WebSocket updates.
// Falls back silently if Realtime is not enabled on the table.
import { supabase } from './supabase';

/**
 * Subscribe to new messages in a 1:1 chat room.
 * @param {string}   roomId   — the chat room ID
 * @param {Function} onInsert — called with the new message row
 * @param {Function} onUpdate — called when a message is edited/updated
 * @returns cleanup function — call on component unmount
 */
export function subscribeToRoom(roomId, onInsert, onUpdate) {
  const channel = supabase
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
      payload => { if (payload.new) onInsert(payload.new); }
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
  const channel = supabase
    .channel(`group:${groupId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
      payload => { if (payload.new) onInsert(payload.new); }
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
  const channel = supabase
    .channel(`typing:${roomId}`)
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload) onTyping(payload);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}
