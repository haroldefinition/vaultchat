// ============================================================
//  VaultChat — Multi-Party Conference Call Engine
//  src/services/roomCall.js
//
//  Parallel engine to callPeer.js, shaped the same way (subscribe
//  + getState + imperative methods), but manages a MESH of up to
//  4 participants via one RTCPeerConnection per remote peer.
//
//  Why mesh and not SFU:
//    - At 6 kbps Opus × ≤3 remote peers, bandwidth is negligible
//      (~18 kbps up / ~18 kbps down on a 4-way call).
//    - No new backend infrastructure required — extends the same
//      Railway signaling server.
//    - Audio mixing is free: native WebRTC engine mixes incoming
//      streams automatically into one output.
//    - Ceiling of 4 keeps us inside mesh's comfort zone; if we
//      ever need 5+ we'd move to an SFU (LiveKit, mediasoup).
//
//  Relationship to callPeer.js:
//    - callPeer handles pure 1:1 calls (unchanged, still the
//      default path).
//    - roomCall handles conferences from the start, OR takes over
//      from callPeer when the user taps "Add Participant" on a
//      1:1 (via bootstrapFromExistingPeer — see session-3 wiring).
//
//  State machine (simplified):
//     idle → joining → in-room → idle
//     idle → incoming → accepted → in-room → idle
//
//  Signaling convention:
//    - NEWCOMER sends `callroom:join` when they're ready to
//      connect. Server fans out `callroom:participant-joined` to
//      all existing members.
//    - EXISTING MEMBERS create the offer for the newcomer on
//      receipt of `participant-joined`. Newcomers are passive.
//      (This avoids glare — both sides offering simultaneously.)
//
//  Peer map shape (`_peers`):
//    userId → {
//      userName, pc, remoteStream, pendingCandidates,
//      state: 'connecting' | 'connected' | 'disconnected' | 'failed',
//      isInitiator: boolean,
//    }
// ============================================================

import { mediaDevices, RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc';
import {
  getSocket,
  sendWebRTCOffer,
  sendWebRTCAnswer,
  sendICECandidate,
  callroomJoin,
  callroomLeave,
  callroomInvite,
  callroomEndForEveryone,
  broadcastMute,
  broadcastUnmute,
  declineCall,
} from './socket';
import {
  getRTCConfig,
  enableOpusFec,
  applyOpusBaseline,
} from './callQuality';
import { setupAudioSession, releaseAudioSession } from './audioSession';

// ── Hard cap ─────────────────────────────────────────────────
// Mesh stays comfortable up to 6 total participants (incl. self) for
// voice-only calls. At 6 people each client maintains 5 peer connections:
//   - Upstream: 5x Opus @ ~12 kbps each = ~60 kbps total upstream
//   - Downstream: 5x Opus @ ~12 kbps each = ~60 kbps total downstream
//   - CPU: 5 encode + 5 decode tracks — fine on modern mobile
// Beyond 6 (voice) or at any point for video, mesh starts to strain
// mobile bandwidth; we'd need an SFU (media server) to go higher.
// If an (N+1)th tries to join, we decline on their behalf.
const MAX_PARTICIPANTS = 6;

// ── Internal state ───────────────────────────────────────────
let _state = 'idle';           // idle | joining | incoming | in-room
let _callId = null;
let _roomId = null;             // the call's roomId (deterministic hash)
let _myUserId = null;
let _myName = null;
let _creatorId = null;          // who started the conference (for end-for-everyone)
let _callType = 'voice';        // 'voice' | 'video' (video reserved for later)
let _localStream = null;        // opened once, reused across all peer connections
let _peers = new Map();         // userId → peer object (see shape above)
// Name cache populated from `callroom:participants` (the snapshot the server
// sends to a newcomer on join). Lets _ensurePeer fall back to a known name
// when `webrtc:offer` arrives from a peer whose userName we otherwise never
// carried. Kept separate from _peers so we don't have to pre-create pcs.
let _participantNames = new Map();
let _socketBound = false;
let _listeners = new Set();
// Staging for an incoming invite before accept() is called — the
// invitee only knows the basics until they join.
let _pendingInvite = null;

// ── Event bus ────────────────────────────────────────────────

function emit(event, payload) {
  for (const cb of _listeners) {
    try { cb(event, payload); } catch (e) { /* never let a subscriber break the lifecycle */ }
  }
}

export function subscribe(cb) {
  _listeners.add(cb);
  try { cb('state', _snapshot()); } catch {}
  return () => _listeners.delete(cb);
}

function _snapshot() {
  return {
    state: _state,
    callId: _callId,
    roomId: _roomId,
    myUserId: _myUserId,
    creatorId: _creatorId,
    participants: Array.from(_peers.values()).map(p => ({
      userId: p.userId,
      userName: p.userName,
      state: p.state,
      hasStream: !!p.remoteStream,
    })),
    participantCount: _peers.size + (_state === 'in-room' ? 1 : 0), // +1 for self
  };
}

export function getState() {
  return _snapshot();
}

// Convenience for UI — list the remote participants.
export function getParticipants() {
  return _snapshot().participants;
}

// ── Outgoing — start a conference from scratch ───────────────

/**
 * Start a multi-party call. Opens mic, binds the socket, joins the
 * callroom, and fires invites to each initial target. Existing-member
 * offer logic fires when the targets accept and join.
 *
 * @param {object} args
 * @param {string} args.callId
 * @param {string} args.roomId
 * @param {string} args.myUserId
 * @param {string} args.myName
 * @param {Array<{userId, userName}>} args.initialParticipants — peers to ring
 * @param {'voice'|'video'} [args.type='voice']
 */
export async function startConference({ callId, roomId, myUserId, myName, initialParticipants = [], type = 'voice' }) {
  if (_state !== 'idle') throw new Error(`roomCall busy (state=${_state})`);
  if (!myUserId) throw new Error('roomCall.startConference: myUserId required');
  if (initialParticipants.length === 0) throw new Error('Need at least one participant to ring');
  if (initialParticipants.length + 1 > MAX_PARTICIPANTS) {
    throw new Error(`Conference cap is ${MAX_PARTICIPANTS} participants`);
  }

  _state = 'joining';
  _callId = callId;
  _roomId = roomId;
  _myUserId = myUserId;
  _myName = myName || '';
  _creatorId = myUserId; // whoever starts owns "end for everyone"
  _callType = type;
  _peers = new Map();
  emit('state', _snapshot());

  try {
    await setupAudioSession();
    await _openLocalMedia(type);
    _bindSocket();

    // Join the room on the server so membership is tracked.
    callroomJoin({ callId, roomId, userId: myUserId, userName: _myName });

    // Ring each initial target. When they accept + join, the server
    // fans out `callroom:participant-joined` back to us, which kicks
    // off _onParticipantJoined → _createOfferFor(peer).
    for (const p of initialParticipants) {
      callroomInvite({
        callId, roomId,
        inviterId: myUserId,
        inviterName: _myName,
        targetUserId: p.userId,
        type,
        existingParticipants: [{ userId: myUserId, userName: _myName }],
      });
    }

    _state = 'in-room';
    emit('state', _snapshot());
  } catch (e) {
    _cleanup();
    throw e;
  }
}

// ── Incoming — stage + accept ────────────────────────────────

/**
 * Called by the app-level listener (callListener.js) when a
 * `call:incoming` arrives with an `isRoom` marker. Stages state so
 * the UI can show ringing. accept() must be called to actually join.
 */
export function handleIncomingInvite({ callId, roomId, inviterId, inviterName, type = 'voice', existingParticipants = [] }) {
  if (_state !== 'idle') {
    // Already on a call (1:1 via callPeer, or already in another room).
    // Auto-decline — reuse the 1:1 decline emit so the inviter gets a
    // consistent `call:declined` no matter which path they took.
    try { declineCall({ callId, roomId, userId: inviterId }); } catch {}
    return;
  }
  _state = 'incoming';
  _callId = callId;
  _roomId = roomId;
  _callType = type;
  _pendingInvite = { inviterId, inviterName: inviterName || '', existingParticipants };
  emit('state', _snapshot());
  emit('incoming', { callId, roomId, inviterId, inviterName, type, existingParticipants });
}

/**
 * User tapped "Accept" on the ringing screen for a conference invite.
 * Opens mic, joins the room, and waits for participant-joined fan-out.
 */
export async function accept({ myUserId, myName }) {
  if (_state !== 'incoming') throw new Error(`Can't accept from state=${_state}`);
  if (!_pendingInvite) throw new Error('No pending invite to accept');

  _myUserId = myUserId;
  _myName = myName || '';
  _creatorId = _pendingInvite.inviterId; // the inviter owns end-for-everyone
  _peers = new Map();

  try {
    await setupAudioSession();
    await _openLocalMedia(_callType);
    _bindSocket();

    // We don't create peer connections for existingParticipants here.
    // Convention: existing members initiate offers to us on their side
    // when the server fans out `callroom:participant-joined` for our
    // join. We stay passive and answer whatever offers arrive.
    callroomJoin({ callId: _callId, roomId: _roomId, userId: myUserId, userName: _myName });

    _state = 'in-room';
    _pendingInvite = null;
    emit('state', _snapshot());
  } catch (e) {
    _cleanup();
    throw e;
  }
}

/** User tapped "Decline" on the ringing screen. */
export function declineIncoming(myUserId) {
  if (_state !== 'incoming') { _cleanup(); return; }
  try {
    declineCall({ callId: _callId, roomId: _roomId, userId: myUserId });
  } catch {}
  _cleanup();
}

// ── Add / remove participants mid-call ───────────────────────

/**
 * Invite another participant to the active conference. No-op if the
 * conference is already at the cap.
 *
 * @param {object} target
 * @param {string} target.userId
 * @param {string} target.userName
 */
export function inviteParticipant({ userId, userName }) {
  if (_state !== 'in-room') throw new Error(`inviteParticipant from state=${_state}`);
  if (!userId) return;
  if (_peers.has(userId) || userId === _myUserId) return; // already in
  if (_peers.size + 1 >= MAX_PARTICIPANTS) {
    // +1 for self; if adding would exceed cap, refuse.
    emit('cap-reached', { max: MAX_PARTICIPANTS });
    return;
  }
  callroomInvite({
    callId: _callId,
    roomId: _roomId,
    inviterId: _myUserId,
    inviterName: _myName,
    targetUserId: userId,
    type: _callType,
    existingParticipants: [
      { userId: _myUserId, userName: _myName },
      ...Array.from(_peers.values()).map(p => ({ userId: p.userId, userName: p.userName })),
    ],
  });
  emit('invite-sent', { userId, userName });
}

// ── Bootstrap from an existing 1:1 callPeer session ──────────

/**
 * Used when the user promotes a 1:1 call to a conference via "Add
 * Participant". The caller (the UI layer) must first unbind callPeer's
 * socket listeners and hand us the live pc + localStream. We take over
 * ownership — pc is not re-created, so no audio drops.
 *
 * After this returns, you can call inviteParticipant() to add more
 * peers and the normal roomCall flow kicks in.
 *
 * @param {object} args
 * @param {RTCPeerConnection} args.pc        — existing 1:1 pc (unclosed)
 * @param {MediaStream}        args.localStream
 * @param {MediaStream|null}   args.remoteStream
 * @param {string}             args.peerUserId
 * @param {string}             [args.peerUserName]
 * @param {string}             args.callId
 * @param {string}             args.roomId
 * @param {string}             args.myUserId
 * @param {string}             args.myName
 * @param {string}             [args.creatorId] — explicit creator userId.
 *   The UPGRADER (the one who tapped + Add) passes their own userId here.
 *   The RECEIVER of a callroom:upgrade event passes the upgrader's userId
 *   (the `fromUserId` on the upgrade payload), so they don't mistakenly
 *   think they're the creator. Defaults to myUserId for back-compat if
 *   callers omit it.
 */
export function bootstrapFromExistingPeer({
  pc, localStream, remoteStream, peerUserId, peerUserName,
  callId, roomId, myUserId, myName, creatorId,
}) {
  if (_state !== 'idle') throw new Error(`bootstrap from state=${_state}`);
  if (!pc || !localStream) throw new Error('bootstrap: need pc + localStream');

  _state = 'in-room';
  _callId = callId;
  _roomId = roomId;
  _myUserId = myUserId;
  _myName = myName || '';
  _creatorId = creatorId || myUserId;
  _callType = 'voice';
  _localStream = localStream;
  _peers = new Map();

  // Re-attach our event listeners to the existing pc so roomCall can
  // observe state changes and incoming tracks (the old callPeer listeners
  // were already unbound by the caller before handing us the pc).
  _attachPcListeners(pc, peerUserId);

  _peers.set(peerUserId, {
    userId: peerUserId,
    userName: peerUserName || '',
    pc,
    remoteStream: remoteStream || null,
    state: 'connected', // it was already connected as a 1:1
    pendingCandidates: [],
    isInitiator: true,
  });

  _bindSocket();
  // Tell the server we're now in a callroom (it may not have tracked
  // this callId as a room before). Membership flushes upward from here.
  callroomJoin({ callId, roomId, userId: myUserId, userName: _myName });

  emit('state', _snapshot());
  emit('peer-state', { userId: peerUserId, state: 'connected' });
}

// ── Leave / end ──────────────────────────────────────────────

/** Leave the conference. Others remain connected if ≥2 stay behind. */
export function leaveRoom() {
  if (_state === 'idle') return;
  try {
    if (_callId && _roomId && _myUserId) {
      callroomLeave({ callId: _callId, roomId: _roomId, userId: _myUserId });
    }
  } catch {}
  _cleanup();
}

/**
 * Creator-only: terminate the call for every participant. Server
 * verifies the requester is the creator before fanning out, so a
 * non-creator calling this will be silently ignored server-side.
 */
export function endForEveryone() {
  if (_state === 'idle') return;
  if (_myUserId !== _creatorId) {
    emit('error', { code: 'not-creator', message: 'Only the creator can end for everyone' });
    return;
  }
  try {
    callroomEndForEveryone({ callId: _callId, roomId: _roomId, userId: _myUserId });
  } catch {}
  _cleanup();
}

// ── Mute / unmute ────────────────────────────────────────────

export function setMute(muted, track = 'audio') {
  if (!_localStream) return;
  for (const t of _localStream.getTracks()) {
    if (t.kind === track) t.enabled = !muted;
  }
  try {
    if (muted) broadcastMute(_callId, _roomId, _myUserId, track);
    else       broadcastUnmute(_callId, _roomId, _myUserId, track);
  } catch {}
  emit('self-mute', { muted, track });
}

// ── Participant-joined / -left handlers (from server fan-out) ─

function _onParticipantJoined({ callId, roomId, userId, userName }) {
  if (callId !== _callId || roomId !== _roomId) return;
  if (userId === _myUserId) return; // server echoing our own join
  if (_peers.has(userId)) return;  // already tracked
  if (_peers.size + 1 >= MAX_PARTICIPANTS) {
    // Shouldn't happen if inviters respect the cap, but defend anyway.
    if (__DEV__) console.warn('[roomCall] participant-joined over cap, ignoring:', userId);
    return;
  }
  // We're an existing member — create an offer for the newcomer.
  _createOfferFor({ userId, userName: userName || '' }).catch(e => {
    if (__DEV__) console.warn('[roomCall] createOfferFor failed:', e?.message || e);
  });
}

// Server sends this to a newcomer right after they join — it's the snapshot
// of everyone ALREADY in the room. We cache the names so when the offers
// eventually roll in from those peers, _ensurePeer picks up the right label
// instead of falling back to "Unknown".
function _onParticipantsSnapshot({ callId, roomId, participants }) {
  if (callId !== _callId || roomId !== _roomId) return;
  if (!Array.isArray(participants)) return;
  for (const p of participants) {
    if (!p?.userId) continue;
    _participantNames.set(p.userId, p.userName || '');
    // If we already have a peer entry (e.g. created by an early-arriving
    // offer), backfill the name.
    const existing = _peers.get(p.userId);
    if (existing && !existing.userName && p.userName) existing.userName = p.userName;
  }
  emit('state', _snapshot());
}

function _onParticipantLeft({ callId, roomId, userId }) {
  if (callId !== _callId || roomId !== _roomId) return;
  const peer = _peers.get(userId);
  if (!peer) return;
  try { peer.pc?.close(); } catch {}
  _peers.delete(userId);
  emit('peer-left', { userId });
  emit('state', _snapshot());

  // If I'm the only one left in the room, tear down locally too —
  // no point holding a mic open for an empty room.
  if (_peers.size === 0) {
    leaveRoom();
  }
}

function _onRoomEnded({ callId, roomId, endedBy }) {
  if (callId !== _callId || roomId !== _roomId) return;
  emit('room-ended', { endedBy });
  _cleanup();
}

// ── Offer / answer / ICE (shared per-peer routing) ───────────

async function _createOfferFor({ userId, userName }) {
  const peer = _ensurePeer(userId, userName, true);
  try {
    let offer = await peer.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: _callType === 'video' });
    offer = { ...offer, sdp: enableOpusFec(offer.sdp) };
    await peer.pc.setLocalDescription(offer);
    sendWebRTCOffer(userId, offer, _callId);
  } catch (e) {
    if (__DEV__) console.warn('[roomCall] offer error for', userId, e?.message || e);
    peer.state = 'failed';
    emit('peer-state', { userId, state: 'failed' });
  }
}

async function _onOffer({ offer, callId, fromUserId }) {
  if (callId !== _callId || !fromUserId) return;
  if (_state !== 'in-room') return;
  if (fromUserId === _myUserId) return;

  // Passive side — answer the offer, spinning up a pc if this is the
  // first we've heard of this peer.
  const peer = _ensurePeer(fromUserId, '', false);
  try {
    await peer.pc.setRemoteDescription(new RTCSessionDescription(offer));
    await _flushPendingCandidates(peer);

    let answer = await peer.pc.createAnswer();
    answer = { ...answer, sdp: enableOpusFec(answer.sdp) };
    await peer.pc.setLocalDescription(answer);
    sendWebRTCAnswer(fromUserId, answer, _callId);
  } catch (e) {
    if (__DEV__) console.warn('[roomCall] onOffer error for', fromUserId, e?.message || e);
    peer.state = 'failed';
    emit('peer-state', { userId: fromUserId, state: 'failed' });
  }
}

async function _onAnswer({ answer, callId, fromUserId }) {
  if (callId !== _callId || !fromUserId) return;
  const peer = _peers.get(fromUserId);
  if (!peer) return;
  try {
    await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
    await _flushPendingCandidates(peer);
  } catch (e) {
    if (__DEV__) console.warn('[roomCall] onAnswer error for', fromUserId, e?.message || e);
  }
}

async function _onIce({ candidate, fromUserId }) {
  if (!fromUserId || !candidate) return;
  const peer = _peers.get(fromUserId);
  if (!peer) return;
  try {
    if (!peer.pc.remoteDescription) {
      peer.pendingCandidates.push(candidate);
      return;
    }
    await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {
    if (__DEV__) console.warn('[roomCall] onIce error for', fromUserId, e?.message || e);
  }
}

async function _flushPendingCandidates(peer) {
  const pending = peer.pendingCandidates;
  peer.pendingCandidates = [];
  for (const c of pending) {
    try { await peer.pc.addIceCandidate(new RTCIceCandidate(c)); }
    catch (e) { if (__DEV__) console.warn('[roomCall] flushPending error:', e?.message || e); }
  }
}

// ── Peer factory + pc event wiring ───────────────────────────

function _ensurePeer(userId, userName, isInitiator) {
  let peer = _peers.get(userId);
  if (peer) {
    // Upgrade the name lazily if we didn't have one before but do now.
    if (!peer.userName && userName) peer.userName = userName;
    return peer;
  }

  const resolvedName = userName || _participantNames.get(userId) || '';
  const pc = new RTCPeerConnection(getRTCConfig());
  peer = {
    userId,
    userName: resolvedName,
    pc,
    remoteStream: null,
    state: 'connecting',
    pendingCandidates: [],
    isInitiator,
  };
  _peers.set(userId, peer);

  // Attach our local tracks so the SDP includes outgoing media.
  if (_localStream) {
    for (const track of _localStream.getTracks()) {
      try { pc.addTrack(track, _localStream); } catch {}
    }
  }

  _attachPcListeners(pc, userId);
  emit('peer-joined', { userId, userName: peer.userName });
  emit('state', _snapshot());
  return peer;
}

function _attachPcListeners(pc, userId) {
  pc.addEventListener('track', (event) => {
    const peer = _peers.get(userId);
    if (!peer) return;
    const stream = event.streams && event.streams[0];
    if (stream && stream !== peer.remoteStream) {
      peer.remoteStream = stream;
      emit('peer-stream', { userId, stream });
      emit('state', _snapshot());
    }
  });

  pc.addEventListener('icecandidate', (event) => {
    if (event.candidate) {
      sendICECandidate(userId, event.candidate);
    }
  });

  pc.addEventListener('iceconnectionstatechange', () => {
    const peer = _peers.get(userId);
    if (!peer) return;
    const s = pc.iceConnectionState;
    if (s === 'connected' || s === 'completed') {
      if (peer.state !== 'connected') {
        peer.state = 'connected';
        emit('peer-state', { userId, state: 'connected' });
        emit('state', _snapshot());
        // Pin Opus baseline per pc. (Skipping autoAdapt in mesh v1 —
        // mesh bitrate tuning with multiple pcs is its own rabbit hole.)
        applyOpusBaseline(pc).catch(() => {});
      }
    } else if (s === 'failed' || s === 'closed') {
      if (peer.state !== 'failed') {
        peer.state = 'failed';
        emit('peer-state', { userId, state: 'failed' });
        // Failed mesh peer: drop the connection locally. The peer may
        // rejoin via ICE restart in a future version; for now, drop.
        try { pc.close(); } catch {}
        _peers.delete(userId);
        emit('peer-left', { userId, reason: 'failed' });
        emit('state', _snapshot());
      }
    } else if (s === 'disconnected') {
      // Transient — don't tear down; it often self-heals within a few sec.
      peer.state = 'disconnected';
      emit('peer-state', { userId, state: 'disconnected' });
      emit('state', _snapshot());
    }
  });
}

// ── Media ─────────────────────────────────────────────────────

async function _openLocalMedia(type) {
  if (_localStream) return; // bootstrap path already supplied the stream
  const constraints = {
    audio: true,
    video: type === 'video' ? { facingMode: 'user' } : false,
  };
  _localStream = await mediaDevices.getUserMedia(constraints);
  emit('localStream', _localStream);
}

// ── Socket binding ───────────────────────────────────────────

function _bindSocket() {
  if (_socketBound) return;
  const socket = getSocket();
  if (!socket) return;
  socket.on('webrtc:offer',                _onOffer);
  socket.on('webrtc:answer',               _onAnswer);
  socket.on('webrtc:ice',                  _onIce);
  socket.on('callroom:participants',       _onParticipantsSnapshot);
  socket.on('callroom:participant-joined', _onParticipantJoined);
  socket.on('callroom:participant-left',   _onParticipantLeft);
  socket.on('callroom:ended',              _onRoomEnded);
  _socketBound = true;
}

function _unbindSocket() {
  if (!_socketBound) return;
  const socket = getSocket();
  if (socket) {
    socket.off('webrtc:offer',                _onOffer);
    socket.off('webrtc:answer',               _onAnswer);
    socket.off('webrtc:ice',                  _onIce);
    socket.off('callroom:participants',       _onParticipantsSnapshot);
    socket.off('callroom:participant-joined', _onParticipantJoined);
    socket.off('callroom:participant-left',   _onParticipantLeft);
    socket.off('callroom:ended',              _onRoomEnded);
  }
  _socketBound = false;
}

// ── Teardown ─────────────────────────────────────────────────

function _cleanup() {
  // Close every peer connection
  for (const peer of _peers.values()) {
    try { peer.pc?.close(); } catch {}
  }
  _peers = new Map();
  _participantNames = new Map();

  try {
    if (_localStream) for (const t of _localStream.getTracks()) t.stop();
  } catch {}
  releaseAudioSession().catch(() => {});
  _unbindSocket();

  _localStream = null;
  _pendingInvite = null;

  const wasState = _state;
  _state = 'idle';
  emit('state', { ..._snapshot(), wasState });
  _callId = null;
  _roomId = null;
  _myUserId = null;
  _myName = null;
  _creatorId = null;
  _callType = 'voice';
}

// Exposed for the app-level listener so a room-scoped incoming invite
// can be handed in without the UI being mounted yet, and for forced
// cleanup if app state needs to reset (logout, fatal error).
export const _internal = { cleanup: _cleanup };
