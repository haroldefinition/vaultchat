// ============================================================
//  VaultChat — Call log (Recents) persistence
//  src/services/callLog.js
//
//  Tiny AsyncStorage-backed journal of every call the user places
//  or receives. Powers the "Recent" tab in CallScreen.js (task #71).
//
//  Storage shape (under key `vaultchat_calls`): an array of entries,
//  newest-first order is enforced only on read — writes go through
//  `upsertCall` which keys by `id` so the same call's entry is never
//  duplicated as it moves through the ring → answer → end lifecycle.
//
//  Entry:
//  {
//    id:           callId (uuid from placeCall/makeCallId)
//    direction:    'outgoing' | 'incoming'
//    status:       'completed' | 'missed' | 'declined' | 'cancelled'
//    peerUserId:   other party's auth.users.id (null in mock/legacy flows)
//    peerName:     display name at call time (cached so log survives
//                  the peer renaming themselves)
//    peerPhone:    phone if known (null for userId-only calls)
//    callType:     'voice' | 'video'
//    startedAt:    ISO — when ringing began
//    answeredAt:   ISO | null — null means the call was never picked up
//    endedAt:      ISO — when the call fully tore down
//    durationSec:  integer — 0 if not answered
//  }
//
//  Privacy note: this is intentionally LOCAL-ONLY (AsyncStorage),
//  mirroring how the iOS native Phone app treats Recents. The
//  Supabase `call_records` table exists but storing every ring in
//  the cloud would leak a lot of metadata for very little value —
//  revisit only if cross-device sync becomes a real ask.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'vaultchat_calls';
const MAX_ENTRIES = 200;

// Plain set of listeners called (arg-less) after every write. CallScreen
// subscribes so the Recent tab updates live when a call ends without us
// having to rely solely on useFocusEffect.
const listeners = new Set();

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // Defensive filter — legacy/sample records (no `id`, no `direction`) get dropped.
    return arr.filter(e => e && e.id && e.direction);
  } catch {
    return [];
  }
}

async function writeAll(arr) {
  try {
    // Cap retained entries so the log doesn't grow unbounded.
    await AsyncStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX_ENTRIES)));
  } catch {}
  for (const cb of listeners) {
    try { cb(); } catch {}
  }
}

/**
 * Returns newest-first array of call entries. Sorted by endedAt (fall back
 * to startedAt so an in-flight entry still ranks correctly).
 */
export async function listCalls() {
  const arr = await readAll();
  return arr.sort((a, b) => {
    const ta = new Date(a.endedAt || a.startedAt || 0).getTime();
    const tb = new Date(b.endedAt || b.startedAt || 0).getTime();
    return tb - ta;
  });
}

/**
 * Insert-or-update by id. Merges partial entries so repeat writes during
 * a call's lifecycle (ring → answer → end) compose cleanly.
 */
export async function upsertCall(entry) {
  if (!entry?.id) return null;
  const arr = await readAll();
  const idx = arr.findIndex(e => e.id === entry.id);
  if (idx >= 0) arr[idx] = { ...arr[idx], ...entry };
  else arr.unshift(entry);
  await writeAll(arr);
  return entry;
}

/**
 * Patch just the `peerName` of an existing entry. Used when the user
 * renames a contact from the call-info modal — we want future list
 * renders to reflect the new name without touching the history status.
 */
export async function renameCallPeer(id, newName) {
  if (!id) return;
  const arr = await readAll();
  let changed = false;
  for (const e of arr) {
    if (e.peerUserId && e.id && id === e.id) {
      e.peerName = newName || e.peerName;
      changed = true;
    }
  }
  // Also rename ALL entries for the same peerUserId so renaming propagates
  // across the recents list (matching iOS's Recents-rename behavior).
  const target = arr.find(e => e.id === id);
  if (target?.peerUserId) {
    for (const e of arr) {
      if (e.peerUserId === target.peerUserId) {
        e.peerName = newName || e.peerName;
        changed = true;
      }
    }
  }
  if (changed) await writeAll(arr);
}

export async function deleteCall(id) {
  if (!id) return;
  const arr = await readAll();
  await writeAll(arr.filter(e => e.id !== id));
}

export async function clearCalls() {
  await writeAll([]);
}

export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ── Lifecycle helper ────────────────────────────────────────
//
// Typical usage from a call screen:
//
//   const handle = callLog.beginCall({ id: callId, direction: 'outgoing',
//     peerUserId, peerName, peerPhone, callType });
//   // on state → connected
//   handle.markAnswered();
//   // on declined event
//   handle.markDeclined();
//   // on teardown
//   handle.markEnded();
//
// Internally it just closes over a mutable record and upserts on every
// transition. Idempotent — multiple calls to markEnded() are harmless.

export function beginCall({ id, direction, peerUserId, peerName, peerPhone, callType }) {
  if (!id || !direction) return noopHandle;

  const startedAt = new Date().toISOString();
  // Sensible defaults: outgoing-that-never-connected = 'cancelled' (I hung up
  // before they answered); incoming-that-never-connected = 'missed' (I didn't
  // pick up). These flip to 'completed'/'declined' as the call progresses.
  let answeredAtMs = null;
  let status = direction === 'incoming' ? 'missed' : 'cancelled';
  let finalized = false;

  const flush = async () => {
    const now = Date.now();
    const durationSec = answeredAtMs ? Math.max(0, Math.round((now - answeredAtMs) / 1000)) : 0;
    await upsertCall({
      id,
      direction,
      status,
      peerUserId: peerUserId || null,
      peerName:   peerName   || null,
      peerPhone:  peerPhone  || null,
      callType:   callType   || 'voice',
      startedAt,
      answeredAt: answeredAtMs ? new Date(answeredAtMs).toISOString() : null,
      endedAt:    new Date(now).toISOString(),
      durationSec,
    });
  };

  // Write an initial entry immediately so even a force-quit mid-call leaves
  // a record (it'll show with status='cancelled'/'missed' and duration 0).
  flush().catch(() => {});

  return {
    markAnswered() {
      if (answeredAtMs) return;
      answeredAtMs = Date.now();
      status = 'completed';
      flush().catch(() => {});
    },
    markDeclined() {
      status = 'declined';
      flush().catch(() => {});
    },
    markMissed() {
      if (status === 'cancelled' || status === 'missed') {
        status = 'missed';
        flush().catch(() => {});
      }
    },
    markEnded() {
      if (finalized) return;
      finalized = true;
      flush().catch(() => {});
    },
  };
}

const noopHandle = {
  markAnswered() {}, markDeclined() {}, markMissed() {}, markEnded() {},
};
