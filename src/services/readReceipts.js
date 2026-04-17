// readReceipts.js — Mark messages as read, update status in Supabase
// Status flow: 'sent' → 'delivered' → 'read'
// The 'messages' table needs a 'status' column (text, default 'sent').
// SQL to add: ALTER TABLE messages ADD COLUMN IF NOT EXISTS status text DEFAULT 'sent';
import { supabase } from './supabase';

/**
 * Mark all unread messages in a room as 'read' by the current user.
 * Call when the user opens a chat room.
 */
export async function markRoomAsRead(roomId, myUserId) {
  if (!roomId || !myUserId) return;
  try {
    await supabase
      .from('messages')
      .update({ status: 'read' })
      .eq('room_id', roomId)
      .neq('sender_id', myUserId)   // only mark others' messages
      .in('status', ['sent', 'delivered']); // don't re-mark already-read
  } catch {}
}

/**
 * Mark a single message as 'delivered' when received by the other party.
 * Call from the Realtime INSERT handler.
 */
export async function markDelivered(messageId, myUserId, senderId) {
  if (!messageId || myUserId === senderId) return; // don't mark own messages
  try {
    await supabase
      .from('messages')
      .update({ status: 'delivered' })
      .eq('id', messageId)
      .eq('status', 'sent'); // only upgrade, never downgrade
  } catch {}
}

/**
 * Returns the receipt icon for a sent message:
 *   '✓'  = sent (stored in Supabase)
 *   '✓✓' = delivered (other device received it)
 *   blue ✓✓ = read
 */
export function receiptIcon(status) {
  if (!status || status === 'sent')      return { icon: '✓',  color: 'rgba(255,255,255,0.6)' };
  if (status === 'delivered')             return { icon: '✓✓', color: 'rgba(255,255,255,0.6)' };
  if (status === 'read')                  return { icon: '✓✓', color: '#60c8ff' };
  return { icon: '✓', color: 'rgba(255,255,255,0.6)' };
}
