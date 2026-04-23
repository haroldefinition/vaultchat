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
  socket.on('connect', () => {
    if (__DEV__) console.log('🟢 Connected to VaultChat server');
    socket.emit('user:online', { userId });
  });

  socket.on('disconnect', (reason) => {
    if (__DEV__) console.log('🔴 Disconnected:', reason);
    // socket.io auto-reconnects — no action needed
  });

  socket.on('reconnect', (attempt) => {
    if (__DEV__) console.log(`🔄 Reconnected after ${attempt} attempts`);
    socket.emit('user:online', { userId });
  });

  socket.on('reconnect_attempt', (attempt) => {
    if (__DEV__) console.log(`🔁 Reconnection attempt ${attempt}...`);
  });

  socket.on('connect_error', (error) => {
    if (__DEV__) console.log('⚠️ Connection error:', error.message);
    // Will auto-retry — user sees "Reconnecting..." in UI
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
export function callroomUpgradeNotice({ callId, roomId, fromUserId, targetUserId }) {
  socket?.emit('callroom:upgrade', { callId, roomId, fromUserId, targetUserId });
}
