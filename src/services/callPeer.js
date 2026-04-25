// ============================================================
//  VaultChat — WebRTC Peer Connection Lifecycle
//  src/services/callPeer.js
//
//  Single-active-call manager. Wraps RTCPeerConnection, owns the
//  socket signaling lifecycle, and integrates the pieces that
//  were already built separately:
//    - callQuality.getRTCConfig()   → ICE servers (STUN + TURN)
//    - callQuality.enableOpusFec()  → SDP munge for Opus inband FEC + DTX
//    - callQuality.applyOpusBaseline + autoAdapt → bitrate control
//    - networkQuality.start(pc)     → live quality classifier
//
//  Scope:
//    - 1:1 audio only (Phase 1)
//    - Video + group calls are later phases — the hooks are here
//      (just flip the getUserMedia constraints) but the UI wiring
//      is deferred
//
//  State machine (simplified):
//     idle → placing → ringing → connected → hungup → idle
//     idle → incoming → accepted → connected → hungup → idle
//
//  The singleton is intentional — only one call at a time on the
//  device, and every surface (ActiveCallScreen, CallKit handlers,
//  incoming-call modal) needs to talk to the same instance.
// ============================================================

import { mediaDevices, RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc';
import {
  getSocket,
  sendWebRTCOffer,
  sendWebRTCAnswer,
  sendICECandidate,
  inviteToCall,
  acceptCall,
  declineCall,
  endCall,
  broadcastMute,
  broadcastUnmute,
} from './socket';
import {
  getRTCConfig,
  enableOpusFec,
  applyOpusBaseline,
  autoAdapt,
} from './callQuality';
import netQ from './networkQuality';
import { setupAudioSession, releaseAudioSession } from './audioSession';

// ── Internal state ──────────────────────────────────────────
// We keep this as module-local rather than exposing it — external
// callers go through the exported API so lifecycle order is enforced.
let _pc = null;                // RTCPeerConnection
let _localStream = null;       // MediaStream (mic only for now)
let _remoteStream = null;      // set when first ontrack fires
let _socketBound = false;      // socket listeners attached?
let _state = 'idle';           // see state machine above
let _callId = null;
let _roomId = null;
let _peerUserId = null;        // the remote user's userId
let _callType   = 'voice';     // 'voice' | 'video' — needed by _onCallAccepted
                                // and accept() to decide SDP video direction
                                // and whether to open the camera
let _stopAutoAdapt = null;     // autoAdapt() returns an unsubscribe fn
let _pendingCandidates = [];   // ICE received before remoteDescription is set
let _listeners = new Set();    // external subscribers (UI)

// ── Event bus ───────────────────────────────────────────────
// The UI (ActiveCallScreen) wants to know when state flips, when
// the remote stream shows up, when quality changes, when the
// remote hangs up. Rather than prop-drilling, we expose a tiny
// subscription API — same pattern as networkQuality.js.

function emit(event, payload) {
  for (const cb of _listeners) {
    try { cb(event, payload); } catch (e) { /* never let a subscriber break the lifecycle */ }
  }
}

export function subscribe(cb) {
  _listeners.add(cb);
  // Emit current snapshot immediately so late subscribers see state.
  try { cb('state', { state: _state, callId: _callId, peerUserId: _peerUserId }); } catch {}
  return () => _listeners.delete(cb);
}

export function getState() {
  return { state: _state, callId: _callId, peerUserId: _peerUserId, roomId: _roomId };
}

// ── Lifecycle — place an outgoing call ──────────────────────

/**
 * Start an outgoing 1:1 audio call. Emits `call:invite` so the peer
 * rings, then waits for the peer to accept before sending the
 * WebRTC offer. (The "wait for accept" gate keeps us from wasting
 * TURN credits / ICE traversal on rings that get declined.)
 *
 * @param {object} args
 * @param {string} args.callId       — caller-generated uuid
 * @param {string} args.roomId       — 1:1 roomId
 * @param {string} args.callerId     — my userId
 * @param {string} args.callerName   — my display name
 * @param {string} args.peerUserId   — the other side's userId
 * @param {'voice'|'video'} [args.type='voice']
 */
export async function startOutgoing({ callId, roomId, callerId, callerName, peerUserId, type = 'voice' }) {
  // Idempotent: if we're already running THIS call (same callId), no-op.
  // Guards against React StrictMode double-mount of ActiveCallScreen, which
  // would otherwise throw "busy (state=ringing)" on the second effect run.
  if (_state !== 'idle') {
    if (_callId && _callId === callId) return;
    throw new Error(`callPeer busy (state=${_state})`);
  }
  _state = 'placing';
  _callId = callId;
  _roomId = roomId;
  _peerUserId = peerUserId;
  _callType = type;
  _pendingCandidates = [];
  emit('state', { state: _state, callId, peerUserId });

  try {
    await setupAudioSession();
    await _openLocalMedia(type);
    await _createPeerConnection();

    // Attach local tracks BEFORE creating the offer so the SDP has m-lines
    // for everything we plan to send.
    for (const track of _localStream.getTracks()) {
      _pc.addTrack(track, _localStream);
    }

    _bindSocket();

    // Ring the peer. We don't create the offer yet — wait for 'call:accepted'
    // via the socket listener; _onCallAccepted will kick off createOffer.
    inviteToCall({
      roomId, callId,
      callerId,
      callerName: callerName || '',
      type,
      participants: [callerId, peerUserId],
    });

    _state = 'ringing';
    emit('state', { state: _state, callId, peerUserId });
  } catch (e) {
    _cleanup();
    throw e;
  }
}

// Triggered when the socket reports the peer accepted — now create + send offer.
async function _onCallAccepted({ callId }) {
  if (__DEV__) console.log('[callPeer] call:accepted received callId=', callId, 'our callId=', _callId, 'pc?', !!_pc);
  if (!_pc || callId !== _callId) return;
  try {
    // offerToReceiveVideo flips on for video calls so the SDP m-line
    // for video is included and the peer knows to send video back.
    let offer = await _pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: _callType === 'video' });
    offer = { ...offer, sdp: enableOpusFec(offer.sdp) };
    await _pc.setLocalDescription(offer);
    sendWebRTCOffer(_peerUserId, offer, _callId);
    if (__DEV__) console.log('[callPeer] sent webrtc:offer to', _peerUserId);
  } catch (e) {
    if (__DEV__) console.warn('callPeer offer error:', e?.message || e);
    hangup();
  }
}

// ── Lifecycle — receive an incoming call ────────────────────

/**
 * Handle a `call:incoming` that was just picked up by the app-level
 * listener. This DOES NOT accept the call — it just stages state so
 * the UI can show the ringing screen. Call `accept()` when the user
 * taps answer, `declineIncoming()` if they tap decline.
 */
export function handleIncomingInvite({ callId, roomId, callerId, type = 'voice' }) {
  if (_state !== 'idle') {
    // Already on a call — auto-decline. (Future: "busy here" signaling.)
    declineCall({ callId, roomId, userId: callerId });
    return;
  }
  _state = 'incoming';
  _callId = callId;
  _roomId = roomId;
  _peerUserId = callerId;
  _callType   = type;   // remembered so accept() opens the camera
                         // for video calls and the SDP answer carries
                         // a video m-line.
  _pendingCandidates = [];
  emit('state', { state: _state, callId, peerUserId: callerId, type });
}

/**
 * User tapped "Accept" on the ringing screen. Opens the mic, builds
 * the peer connection, sends `call:accept` so the caller creates
 * their offer. The offer arrives via `webrtc:offer` → _onOffer.
 *
 * @param {string} myUserId — for the accept emit
 */
export async function accept(myUserId) {
  if (_state !== 'incoming') throw new Error(`Can't accept from state=${_state}`);
  try {
    await setupAudioSession();
    // Use the type from the staged invite — opens the camera if this
    // is a video call, mic-only if it's voice. Without this, accept()
    // would always open mic-only and the answer SDP wouldn't carry a
    // video m-line, so the caller would never receive video back.
    await _openLocalMedia(_callType);
    await _createPeerConnection();
    for (const track of _localStream.getTracks()) {
      _pc.addTrack(track, _localStream);
    }
    _bindSocket();
    acceptCall({ callId: _callId, roomId: _roomId, userId: myUserId, toUserId: _peerUserId });
    _state = 'accepted';
    emit('state', { state: _state, callId: _callId, peerUserId: _peerUserId });
  } catch (e) {
    _cleanup();
    throw e;
  }
}

/** User tapped "Decline" on the ringing screen. */
export function declineIncoming(myUserId) {
  if (!_callId || !_roomId) { _cleanup(); return; }
  declineCall({ callId: _callId, roomId: _roomId, userId: myUserId, toUserId: _peerUserId });
  _cleanup();
}

// ── Inbound offer/answer/ICE handlers (socket events) ──────

async function _onOffer({ offer, callId, fromUserId }) {
  if (!_pc || callId !== _callId || fromUserId !== _peerUserId) return;
  try {
    await _pc.setRemoteDescription(new RTCSessionDescription(offer));
    await _flushPendingCandidates();

    let answer = await _pc.createAnswer();
    answer = { ...answer, sdp: enableOpusFec(answer.sdp) };
    await _pc.setLocalDescription(answer);
    sendWebRTCAnswer(_peerUserId, answer, _callId);
  } catch (e) {
    if (__DEV__) console.warn('callPeer onOffer error:', e?.message || e);
    hangup();
  }
}

async function _onAnswer({ answer, callId, fromUserId }) {
  if (__DEV__) console.log('[callPeer] webrtc:answer received from=', fromUserId, 'our peer=', _peerUserId, 'callId match?', callId === _callId);
  if (!_pc || callId !== _callId || fromUserId !== _peerUserId) return;
  try {
    await _pc.setRemoteDescription(new RTCSessionDescription(answer));
    await _flushPendingCandidates();
    if (__DEV__) console.log('[callPeer] remote description set, awaiting ICE');
  } catch (e) {
    if (__DEV__) console.warn('callPeer onAnswer error:', e?.message || e);
  }
}

async function _onIce({ candidate, fromUserId }) {
  if (!_pc || fromUserId !== _peerUserId || !candidate) return;
  try {
    // If we don't have a remote description yet, buffer the candidate —
    // adding before remoteDescription is set throws InvalidStateError.
    if (!_pc.remoteDescription) {
      _pendingCandidates.push(candidate);
      return;
    }
    await _pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {
    if (__DEV__) console.warn('callPeer onIce error:', e?.message || e);
  }
}

async function _flushPendingCandidates() {
  const pending = _pendingCandidates;
  _pendingCandidates = [];
  for (const c of pending) {
    try { await _pc.addIceCandidate(new RTCIceCandidate(c)); }
    catch (e) { if (__DEV__) console.warn('flushPending error:', e?.message || e); }
  }
}

function _onCallDeclined({ callId }) {
  if (__DEV__) console.log('[callPeer] call:declined received callId=', callId, 'our=', _callId);
  if (callId !== _callId) return;
  emit('declined', { callId });
  _cleanup();
}

function _onCallEnded({ callId, endedBy }) {
  if (__DEV__) console.log('[callPeer] call:ended received callId=', callId, 'endedBy=', endedBy, 'our=', _callId);
  if (callId !== _callId) return;
  emit('ended', { callId, endedBy });
  _cleanup();
}

// ── Controls ────────────────────────────────────────────────

export function hangup() {
  if (__DEV__) {
    try {
      const stack = (new Error().stack || '').split('\n').slice(2, 8).join('\n');
      console.log('[callPeer] hangup called, state=' + _state + '\n' + stack);
    } catch {}
  }
  if (_state === 'idle') return;
  try {
    if (_callId && _roomId && _peerUserId) {
      // userId = who is ending (me). toUserId = the peer to notify.
      endCall({ callId: _callId, roomId: _roomId, userId: _peerUserId, toUserId: _peerUserId });
    }
  } catch {}
  _cleanup();
}

export function setMute(muted, myUserId, track = 'audio') {
  if (!_localStream) return;
  for (const t of _localStream.getTracks()) {
    if (t.kind === track) t.enabled = !muted;
  }
  try {
    if (muted) broadcastMute(_callId, _roomId, myUserId, track);
    else       broadcastUnmute(_callId, _roomId, myUserId, track);
  } catch {}
}

// ── Internals ───────────────────────────────────────────────

async function _openLocalMedia(type) {
  const constraints = {
    audio: true,
    video: type === 'video' ? { facingMode: 'user' } : false,
  };
  _localStream = await mediaDevices.getUserMedia(constraints);
  emit('localStream', _localStream);
}

async function _createPeerConnection() {
  _pc = new RTCPeerConnection(getRTCConfig());

  _pc.addEventListener('track', (event) => {
    // First-track-wins: RN-WebRTC sometimes fires per track; we only keep
    // the stream it came with so UI can attach RTCView to it.
    const stream = event.streams && event.streams[0];
    if (stream && stream !== _remoteStream) {
      _remoteStream = stream;
      emit('remoteStream', stream);
    }
  });

  _pc.addEventListener('icecandidate', (event) => {
    if (event.candidate && _peerUserId) {
      sendICECandidate(_peerUserId, event.candidate);
    }
  });

  _pc.addEventListener('iceconnectionstatechange', () => {
    const s = _pc?.iceConnectionState;
    if (__DEV__) console.log('[callPeer] iceConnectionState →', s);
    emit('iceState', s);
    if (s === 'connected' || s === 'completed') {
      if (_state !== 'connected') {
        _state = 'connected';
        emit('state', { state: _state, callId: _callId, peerUserId: _peerUserId });
        // Start bitrate adaptation + quality classifier now that media is flowing.
        applyOpusBaseline(_pc).catch(() => {});
        netQ.start(_pc);
        _stopAutoAdapt = autoAdapt(_pc, netQ);
      }
    } else if (s === 'failed' || s === 'disconnected' || s === 'closed') {
      // Disconnected can be transient; failed/closed are terminal.
      if (s === 'failed' || s === 'closed') {
        emit('connectionLost', s);
        _cleanup();
      }
    }
  });
}

function _bindSocket() {
  if (_socketBound) return;
  const socket = getSocket();
  if (!socket) return;
  socket.on('webrtc:offer',   _onOffer);
  socket.on('webrtc:answer',  _onAnswer);
  socket.on('webrtc:ice',     _onIce);
  socket.on('call:accepted',  _onCallAccepted);
  socket.on('call:declined',  _onCallDeclined);
  socket.on('call:ended',     _onCallEnded);
  _socketBound = true;
}

function _unbindSocket() {
  if (!_socketBound) return;
  const socket = getSocket();
  if (socket) {
    socket.off('webrtc:offer',   _onOffer);
    socket.off('webrtc:answer',  _onAnswer);
    socket.off('webrtc:ice',     _onIce);
    socket.off('call:accepted',  _onCallAccepted);
    socket.off('call:declined',  _onCallDeclined);
    socket.off('call:ended',     _onCallEnded);
  }
  _socketBound = false;
}

function _cleanup() {
  try { _stopAutoAdapt?.(); } catch {}
  _stopAutoAdapt = null;
  try { netQ.stop(); } catch {}
  try {
    if (_localStream) for (const t of _localStream.getTracks()) t.stop();
  } catch {}
  try { _pc?.close(); } catch {}
  releaseAudioSession().catch(() => {});
  _unbindSocket();

  _pc = null;
  _localStream = null;
  _remoteStream = null;
  _pendingCandidates = [];

  const wasState = _state;
  _state = 'idle';
  emit('state', { state: _state, wasState, callId: _callId, peerUserId: _peerUserId });
  _callId = null;
  _roomId = null;
  _peerUserId = null;
  _callType = 'voice';
}

// Exposed for the incoming-call entry point so the app-level listener
// can hand us the invite without the UI being mounted yet.
export const _internal = { cleanup: _cleanup };

/**
 * Transfer ownership of the live 1:1 peer connection + streams to roomCall
 * for a 1:1 → conference upgrade. After this call, callPeer returns to
 * idle state WITHOUT closing the pc or stopping tracks — the caller (roomCall)
 * takes over media lifecycle.
 *
 * Returns the handoff payload shaped exactly for roomCall.bootstrapFromExistingPeer:
 *   { pc, localStream, remoteStream, peerUserId, callId, roomId }
 * or null if there's nothing live to hand off.
 */
export function handoffToRoomCall() {
  if (!_pc || !_localStream || _state === 'idle') return null;

  const handoff = {
    pc:           _pc,
    localStream:  _localStream,
    remoteStream: _remoteStream,
    peerUserId:   _peerUserId,
    callId:       _callId,
    roomId:       _roomId,
  };

  // Stop autoAdapt / netQ but DO NOT stop tracks or close pc — roomCall owns
  // them now and will tear them down as part of its own lifecycle.
  try { _stopAutoAdapt?.(); } catch {}
  _stopAutoAdapt = null;
  try { netQ.stop(); } catch {}
  _unbindSocket();

  // Null out our references — roomCall now owns the pc/streams.
  _pc = null;
  _localStream = null;
  _remoteStream = null;
  _pendingCandidates = [];
  _callId = null;
  _roomId = null;
  _peerUserId = null;
  _callType = 'voice';

  const wasState = _state;
  _state = 'idle';
  emit('state', { state: _state, wasState, handedOff: true });

  return handoff;
}
