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
const SERVER_URL = 'https://vaultchat-server-production.up.railway.app';

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
    console.log('🟢 Connected to VaultChat server');
    socket.emit('user:online', { userId });
  });

  socket.on('disconnect', (reason) => {
    console.log('🔴 Disconnected:', reason);
    // socket.io auto-reconnects — no action needed
  });

  socket.on('reconnect', (attempt) => {
    console.log(`🔄 Reconnected after ${attempt} attempts`);
    socket.emit('user:online', { userId });
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`🔁 Reconnection attempt ${attempt}...`);
  });

  socket.on('connect_error', (error) => {
    console.log('⚠️ Connection error:', error.message);
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

export function acceptCall({ callId, roomId, userId }) {
  socket?.emit('call:accept', { callId, roomId, userId });
}

export function declineCall({ callId, roomId, userId }) {
  socket?.emit('call:decline', { callId, roomId, userId });
}

export function endCall({ callId, roomId, userId }) {
  socket?.emit('call:end', { callId, roomId, userId });
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
