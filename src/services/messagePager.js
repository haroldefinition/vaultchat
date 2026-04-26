// ============================================================
//  messagePager.js — cursor-based message-history pagination
//
//  Replaces the "select * from messages where room_id = ?" full-
//  table fetch in ChatRoomScreen / GroupChatScreen with a
//  cursor (created_at) + limit pattern:
//
//    1. On screen mount → loadLatest(roomId, limit=50) → newest 50.
//    2. On scroll-up to top → loadOlder(roomId, oldestSeen, limit)
//       → next-oldest 50.
//    3. Realtime subscription (separate) handles NEW messages
//       arriving after the latest cursor.
//
//  The same shape works for both `messages` (1:1) and
//  `group_messages` (groups) — pass `table` to switch.
//
//  Returns rows in CHRONOLOGICAL order (oldest → newest) so the
//  caller can directly setMessages(rows) without re-sorting.
// ============================================================

let supabase = null;
try { supabase = require('./supabase').supabase; } catch {}

const DEFAULT_LIMIT = 50;

/**
 * Fetch the most recent `limit` messages for a room.
 * Returns: { items, oldestCursor, hasMore }
 */
export async function loadLatest({ roomId, table = 'messages', roomColumn = 'room_id', limit = DEFAULT_LIMIT } = {}) {
  if (!supabase || !roomId) return { items: [], oldestCursor: null, hasMore: false };
  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(roomColumn, roomId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return { items: [], oldestCursor: null, hasMore: false };
    // Server returned newest-first; flip to chronological for the UI.
    const items = [...data].reverse();
    return {
      items,
      oldestCursor: items[0]?.created_at || null,
      hasMore: data.length === limit,
    };
  } catch (e) {
    if (__DEV__) console.warn('loadLatest error:', e?.message);
    return { items: [], oldestCursor: null, hasMore: false };
  }
}

/**
 * Fetch the next batch of OLDER messages — everything strictly
 * before `cursor` (an ISO timestamp string).
 * Returns: { items, oldestCursor, hasMore }
 */
export async function loadOlder({ roomId, table = 'messages', roomColumn = 'room_id', cursor, limit = DEFAULT_LIMIT } = {}) {
  if (!supabase || !roomId || !cursor) return { items: [], oldestCursor: cursor, hasMore: false };
  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(roomColumn, roomId)
      .lt('created_at', cursor)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return { items: [], oldestCursor: cursor, hasMore: false };
    const items = [...data].reverse();
    return {
      items,
      oldestCursor: items[0]?.created_at || cursor,
      hasMore: data.length === limit,
    };
  } catch (e) {
    if (__DEV__) console.warn('loadOlder error:', e?.message);
    return { items: [], oldestCursor: cursor, hasMore: false };
  }
}

/**
 * Fetch only NEWER messages (used by reconnect-after-background:
 * we know the newest cursor, want anything since).
 * Returns: { items, newestCursor }
 */
export async function loadNewer({ roomId, table = 'messages', roomColumn = 'room_id', sinceCursor } = {}) {
  if (!supabase || !roomId || !sinceCursor) return { items: [], newestCursor: sinceCursor };
  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(roomColumn, roomId)
      .gt('created_at', sinceCursor)
      .order('created_at', { ascending: true });
    if (error || !Array.isArray(data)) return { items: [], newestCursor: sinceCursor };
    return {
      items: data,
      newestCursor: data[data.length - 1]?.created_at || sinceCursor,
    };
  } catch (e) {
    if (__DEV__) console.warn('loadNewer error:', e?.message);
    return { items: [], newestCursor: sinceCursor };
  }
}
