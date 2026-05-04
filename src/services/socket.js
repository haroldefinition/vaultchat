// ============================================================
//  VaultChat — Server Connection
//  src/services/socket.js
//
//  Manages the real-time connection to your Railway server
//  Handles: reconnection, weak network fallback, call signaling
// ============================================================

import { io }        from 'socket.io-client';
import AsyncStorage  from '@react-native-async-storage/async-storage';

// ── YOUR RAILWAY SERVER URL ───────────────────────────────────
// This points to the server you just deployed!
const SERVER_URL = 'https://vaultchat-production-3a96.up.railway.app';

let socket = null;

// ── Connect to server ─────────────────────────────────────────
export function connectSocket(userId) {
  if (socket?.connected) return socket;

  socket = io(SERVER_URL, {
    // ── Weak network resilience settings ──────────────────
    transports:          ['websocket', 'polling'], // falls back to polling on weak signal
    reconnection:        true,
    reconnectionAttempts: Infinity,  // never stop trying to reconnect
    reconnectionDelay:   1000,       // wait 1s between attempts
    reconnectionDelayMax: 5000,      // max 5s between attempts
    timeout:             20000,      // 20s connection timeout
    forceNew:            false,
  });

  // ── Connection events ──────────────────────────────────────
  // All handlers below capture the socket via the module-level `socket`
  // variable, which can be nulled out by disconnectSocket() between the
  // event firing and the handler running. Sentry caught a real
  // 'TypeError: Cannot read property emit of null' on iOS 26.4 in 1.0.3
  // (debug build, REACT-NATIVE-6, event 7fc90e60) when a disconnect →
  // reconnect cycle happened mid-AppState transition. Each handler now
  // null-guards the emit call AND wraps the body in try/catch so any
  // unhandled error inside socket.io's internal Manager#onopen chain
  // can't bubble up as an unhandled promise rejection.
  socket.on('connect', () => {
    try {
      if (__DEV__) console.log('🟢 Connected to VaultChat server (socketId=' + socket?.id + ')');
      socket?.emit('user:online', { userId });
    } catch (e) {
      if (__DEV__) console.log('socket connect handler error:', e?.message);
    }
  });

  socket.on('disconnect', (reason) => {
    try {
      if (__DEV__) console.log('🔴 Disconnected:', reason);
      // socket.io auto-reconnects — no action needed
    } catch (e) {
      if (__DEV__) console.log('socket disconnect handler error:', e?.message);
    }
  });

  socket.on('reconnect', (attempt) => {
    try {
      if (__DEV__) console.log(`🔄 Reconnected after ${attempt} attempts`);
      socket?.emit('user:online', { userId });
    } catch (e) {
      if (__DEV__) console.log('socket reconnect handler error:', e?.message);
    }
  });

  socket.on('reconnect_attempt', (attempt) => {
    try {
      if (__DEV__) console.log(`🔁 Reconnection attempt ${attempt}...`);
    } catch {}
  });

  socket.on('connect_error', (error) => {
    try {
      if (__DEV__) console.log('⚠️ Connection error:', error?.message);
      // Will auto-retry — user sees "Reconnecting..." in UI
    } catch {}
  });

  return socket;
}

// ── Get the active socket ─────────────────────────────────────
export function getSocket() {
  return socket;
}

// ── Disconnect cleanly ────────────────────────────────────────
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// ── JOIN a chat room ──────────────────────────────────────────
export function joinRoom(roomId, userId) {
  socket?.emit('room:join', { roomId, userId });
}

// ── SEND a message (already encrypted by the time it gets here)
export function sendMessage(payload) {
  socket?.emit('message:send', payload);
}

// ── EDIT a sent message ───────────────────────────────────────
export function editMessage(roomId, messageId, newContent, editedBy) {
  socket?.emit('message:edit', { roomId, messageId, newContent, editedBy });
}

// ── VANISH message viewed — destroys it forever ───────────────
export function markVanishViewed(roomId, messageId, viewerId) {
  socket?.emit('message:vanish:viewed', { roomId, messageId, viewerId });
}

// ── TYPING indicators ─────────────────────────────────────────
export function sendTypingStart(roomId, userId, username) {
  socket?.emit('typing:start', { roomId, userId, username });
}
export function sendTypingStop(roomId, userId) {
  socket?.emit('typing:stop', { roomId, userId });
}

// ── READ receipts ──────────────────────────────────────────────
export function sendReadReceipt(roomId, messageId, userId) {
  socket?.emit('message:read', { roomId, messageId, userId });
}

// ── Cold-message UX (Feature 3) ────────────────────────────────
// Subscribe globally to `message:new` events fanned out by the
// server when ANY room you're a member of receives a new message.
// Distinct from the per-room INSERT subscription used inside
// ChatRoomScreen — this fires regardless of whether the recipient
// has the chat open, and includes enough metadata (senderName,
// senderHandle, senderPhone) for the chat list to render a fresh
// row when the room is brand new (Adam → Jesse first contact).
//
// Returns a cleanup function. Safe to call before connectSocket()
// returns — the listener attaches when the socket finally exists.
// Re-attaching survives reconnects because socket.io preserves
// listeners across the reconnect lifecycle.
export function subscribeMessageNew(handler) {
  if (typeof handler !== 'function') return () => {};
  // Wrap so we can swallow handler exceptions without taking down the
  // socket's event loop. The receipt-logging that used to live here
  // was diagnostic for the 1.0.12 transport-upgrade bug and was
  // stripped in 1.0.14 once the listener-on-connect pattern below
  // was verified working in production.
  const wrapped = (evt) => {
    try { handler(evt); } catch (e) {
      if (__DEV__) try { console.log('[message:new] handler threw:', e?.message); } catch {}
    }
  };
  handler.__wrappedMessageNew = wrapped;

  // Listeners attached to socket.io before the socket finishes its
  // transport upgrade get orphaned — the engine.io upgrade swaps the
  // active transport from polling → websocket, and listeners that
  // existed only on the polling transport's queue don't always make
  // it across. Symptom in 1.0.10 testing on Android: onAny INSIDE a
  // 'connect' handler fired correctly, but socket.on('message:new')
  // attached BEFORE 'connect' silently never fired. Fix: register
  // the typed listener inside a 'connect' handler so it re-attaches
  // on every transport upgrade AND every reconnect, then ALSO attach
  // it now if the socket is already fully connected (covers callers
  // that subscribe after first-connect has already fired).
  function attachIfMissing(s) {
    if (!s) return;
    // socket.io listeners() returns the array of registered handlers
    // for an event. Skip if our wrapper is already in the list to
    // avoid stacking duplicates on every reconnect cycle.
    try {
      const existing = (typeof s.listeners === 'function') ? s.listeners('message:new') : [];
      if (existing.includes(wrapped)) return;
    } catch {}
    try { s.on('message:new', wrapped); } catch {}
  }

  // Re-attach on every 'connect' fire. Captured in a separate
  // function so we can detach it cleanly during teardown.
  const connectListener = function () { attachIfMissing(socket); };

  function bind() {
    if (!socket) return false;
    // If socket has already fired 'connect' before we got here,
    // attach immediately. socket.connected becomes true on first
    // connect and stays true through transport upgrades.
    if (socket.connected) attachIfMissing(socket);
    socket.on('connect', connectListener);
    return true;
  }

  if (!bind()) {
    // socket not yet created; poll until it exists, then bind.
    const pollId = setInterval(() => {
      if (bind()) clearInterval(pollId);
    }, 250);
    handler.__pollId = pollId;
  }

  return () => {
    try { if (handler.__pollId) clearInterval(handler.__pollId); } catch {}
    try { socket?.off?.('connect', connectListener); } catch {}
    try { socket?.off?.('message:new', wrapped); } catch {}
  };
}

// ════════════════════════════════════════════════════════════
//  CALL SIGNALING
//  These emit/receive WebRTC signals for video & voice calls
// ════════════════════════════════════════════════════════════

export function inviteToCall({ roomId, callId, callerId, callerName, type, participants }) {
  socket?.emit('call:invite', { roomId, callId, callerId, callerName, type, participants });
}

// `toUserId` = the peer we need the server to forward the event to.
// Without this the server can only broadcast to the shared chat `roomId`,
// which is empty if neither side joined it (e.g. dev panel, cold call).
export function acceptCall({ callId, roomId, userId, toUserId }) {
  socket?.emit('call:accept', { callId, roomId, userId, toUserId });
}

export function declineCall({ callId, roomId, userId, toUserId }) {
  socket?.emit('call:decline', { callId, roomId, userId, toUserId });
}

export function endCall({ callId, roomId, userId, toUserId }) {
  if (__DEV__) {
    try {
      const stack = (new Error().stack || '').split('\n').slice(2, 10).join('\n');
      console.log('[socket] endCall emit callId=' + callId + ' userId=' + userId + ' toUserId=' + toUserId + '\n' + stack);
    } catch {}
  }
  socket?.emit('call:end', { callId, roomId, userId, toUserId });
}

export function sendWebRTCOffer(targetId, offer, callId) {
  socket?.emit('webrtc:offer', { targetId, offer, callId });
}

export function sendWebRTCAnswer(targetId, answer, callId) {
  socket?.emit('webrtc:answer', { targetId, answer, callId });
}

export function sendICECandidate(targetId, candidate) {
  socket?.emit('webrtc:ice', { targetId, candidate });
}

export function broadcastMute(callId, roomId, userId, track) {
  socket?.emit('call:mute', { callId, roomId, userId, track });
}

export function broadcastUnmute(callId, roomId, userId, track) {
  socket?.emit('call:unmute', { callId, roomId, userId, track });
}

// ════════════════════════════════════════════════════════════
//  CONFERENCE ROOM SIGNALING (multi-party calls, up to 4 peers)
//
//  Separate `callroom:*` namespace so these don't collide with
//  the chat-level `room:join` used for message delivery.
//  Server (Railway) maintains per-callroom participant sets and
//  fans out joined/left/ended notifications to members.
// ════════════════════════════════════════════════════════════

export function callroomJoin({ callId, roomId, userId, userName }) {
  socket?.emit('callroom:join', { callId, roomId, userId, userName });
}

export function callroomLeave({ callId, roomId, userId }) {
  socket?.emit('callroom:leave', { callId, roomId, userId });
}

export function callroomInvite({ callId, roomId, inviterId, inviterName, targetUserId, type, existingParticipants }) {
  socket?.emit('callroom:invite', { callId, roomId, inviterId, inviterName, targetUserId, type, existingParticipants });
}

export function callroomEndForEveryone({ callId, roomId, userId }) {
  socket?.emit('callroom:end', { callId, roomId, userId });
}

// Sent by the upgrader (who first tapped "Add Participant") to the
// existing 1:1 peer — tells them to transfer their callPeer pc into
// roomCall so the mesh can grow. Routed via targetId → userId-as-room.
export function callroomUpgradeNotice({ callId, roomId, fromUserId, fromUserName, targetUserId }) {
  socket?.emit('callroom:upgrade', { callId, roomId, fromUserId, fromUserName, targetUserId });
}
