// ============================================================
//  VaultChat — Global Incoming Call Listener
//  src/services/callListener.js
//
//  Mount once from App.js right after auth + socket are ready.
//  Responsibilities:
//    1. Subscribe to `call:incoming` on the socket. The socket
//       server fans these out to the callee's userId-as-room.
//    2. Stage the invite in callPeer (`handleIncomingInvite`).
//    3. iOS: show the CallKit system UI via callkit.js. CallKit's
//       `answerCall` event then navigates to ActiveCall(mode=answer);
//       `endCall` tells callPeer to decline.
//    4. Non-iOS (or iOS foreground): navigate to the IncomingCall
//       screen which provides Accept/Decline buttons.
//
//  Depends on a NavigationContainer ref so we can navigate from
//  outside the React tree (socket events arrive there).
// ============================================================

import { Platform } from 'react-native';
import { getSocket } from './socket';
import * as callPeer from './callPeer';
import * as roomCall from './roomCall';
import { getMyDisplayName } from './vaultHandle';
import {
  setupCallKit,
  displayIncomingCall,
  endCall as callkitEndCall,
  onCallKeepEvents,
} from './callkit';

let _bound = false;
let _navigationRef = null;
let _myUserId = null;
let _unCallKit = null;
let _pendingInvite = null; // keeps { callId, roomId, callerId, callerName, type } for CallKit answer events

// React Navigation's container ref throws "The 'navigation' object hasn't
// been initialized yet" if you call navigate() before NavigationContainer
// has attached + the root navigator has registered. In practice that's
// only a tiny window at app boot, but socket events can race it. This
// helper retries up to ~1 second then gives up quietly.
function _safeNavigate(screen, params, _attempt = 0) {
  if (!_navigationRef) return;
  try {
    if (typeof _navigationRef.isReady === 'function' && !_navigationRef.isReady()) {
      if (_attempt < 10) setTimeout(() => _safeNavigate(screen, params, _attempt + 1), 100);
      return;
    }
    _navigationRef.navigate(screen, params);
  } catch (e) {
    if (__DEV__) console.warn('[callListener] navigate failed:', e?.message || e);
  }
}

// Only iOS currently has a working CallKit wrapper in callkit.js.
// In dev mode we always fall back to the JS IncomingCall screen because
// CallKit's displayIncomingCall is a silent no-op on iOS simulators
// (the native system UI cannot render there). Production builds still
// use CallKit on real iOS devices.
function _useCallKit() {
  if (__DEV__) return false;
  return Platform.OS === 'ios';
}

/**
 * Mount the global listener. Safe to call multiple times — no-ops
 * after the first successful bind.
 *
 * @param {object} opts
 * @param {string} opts.myUserId          — current user's profiles.id
 * @param {object} opts.navigationRef     — from createNavigationContainerRef()
 */
export function startCallListener({ myUserId, navigationRef }) {
  if (_bound) return;
  const socket = getSocket();
  if (!socket || !myUserId || !navigationRef) return;

  _myUserId = myUserId;
  _navigationRef = navigationRef;

  if (_useCallKit()) setupCallKit();

  socket.on('call:incoming',      _onIncoming);
  socket.on('callroom:incoming',  _onRoomIncoming);
  socket.on('callroom:upgrade',   _onRoomUpgrade);
  _bound = true;

  // CallKit event wiring — iOS uses the native system UI for the ring.
  if (_useCallKit()) {
    _unCallKit = onCallKeepEvents({
      onAnswer: ({ callUUID }) => {
        // User tapped answer on the CallKit UI.
        if (!_pendingInvite || _pendingInvite.callId !== callUUID) return;
        const inv = _pendingInvite;
        _pendingInvite = null;
        _navigateToActiveCall(inv);
      },
      onEnd: ({ callUUID }) => {
        // User tapped decline / hung up from CallKit.
        if (_pendingInvite && _pendingInvite.callId === callUUID) {
          callPeer.declineIncoming(_myUserId);
          _pendingInvite = null;
        } else {
          // Mid-call end — have callPeer tear down.
          callPeer.hangup();
        }
      },
    });
  }
}

export function stopCallListener() {
  if (!_bound) return;
  const socket = getSocket();
  if (socket) {
    socket.off('call:incoming',     _onIncoming);
    socket.off('callroom:incoming', _onRoomIncoming);
    socket.off('callroom:upgrade',  _onRoomUpgrade);
  }
  if (_unCallKit) { try { _unCallKit(); } catch {} _unCallKit = null; }
  _bound = false;
  _pendingInvite = null;
  _myUserId = null;
  _navigationRef = null;
}

// ── Handlers ────────────────────────────────────────────────

function _onIncoming(payload) {
  const { callId, roomId, callerId, callerName, type } = payload || {};
  if (!callId || !callerId) return;

  // Stage the invite in callPeer so accept()/declineIncoming() know the IDs.
  callPeer.handleIncomingInvite({ callId, roomId, callerId, type });

  _pendingInvite = { callId, roomId, callerId, callerName, type };

  if (_useCallKit()) {
    // System UI — handle is the caller's display name (falls back to id).
    displayIncomingCall(callId, callerId, callerName || 'VaultChat');
    // iOS will hit onAnswer/onEnd via the event listeners wired above.
  } else {
    // Push the in-app ringing screen.
    _safeNavigate('IncomingCall', {
      callId, roomId, myUserId: _myUserId,
      callerId, callerName, type,
    });
  }
}

function _navigateToActiveCall({ callId, roomId, callerId, callerName, type, isConference }) {
  _safeNavigate('ActiveCall', {
    mode:          isConference ? 'answer-conference' : 'answer',
    callId, roomId, myUserId: _myUserId,
    peerUserId:    callerId,
    recipientName: callerName,
    callType:      type || 'voice',
    isConference:  !!isConference,
  });
}

// ── Conference incoming ─────────────────────────────────────
//
// Someone invited us into a multi-peer callroom. Payload shape mirrors
// server.on('callroom:invite') → emit('callroom:incoming', ...):
//   { callId, roomId, inviterId, inviterName, type, existingParticipants }
//
// We ring through the same JS IncomingCall screen as 1:1, but pass
// `isConference: true` so ActiveCallScreen knows to route through roomCall.

function _onRoomIncoming(payload) {
  const {
    callId, roomId, inviterId, inviterName,
    type, existingParticipants,
  } = payload || {};
  if (!callId || !inviterId) return;

  // Stage in roomCall so accept() knows the IDs.
  roomCall.handleIncomingInvite({
    callId, roomId, inviterId, inviterName, type,
    existingParticipants: existingParticipants || [],
  });

  _pendingInvite = {
    callId, roomId,
    callerId:      inviterId,
    callerName:    inviterName || 'VaultChat User',
    type:          type || 'voice',
    isConference:  true,
  };

  if (_useCallKit()) {
    displayIncomingCall(callId, inviterId, inviterName || 'VaultChat');
  } else {
    _safeNavigate('IncomingCall', {
      callId, roomId, myUserId: _myUserId,
      callerId:      inviterId,
      callerName:    inviterName || 'VaultChat User',
      type:          type || 'voice',
      isConference:  true,
    });
  }
}

// ── 1:1 → conference upgrade (receiver side) ────────────────
//
// The other 1:1 peer tapped "+ Add" and triggered the upgrade. We now:
//   1. Handoff our live callPeer pc/streams to roomCall
//   2. Bootstrap roomCall from that handoff
//   3. Join the server-side callroom so the new participant can find us
//
// No UI change — ActiveCallScreen subscribes to roomCall events, so the
// tile grid will render once roomCall takes over.

async function _onRoomUpgrade(payload) {
  const { callId, roomId, fromUserId, fromUserName } = payload || {};
  if (!callId || !roomId) return;

  const handoff = callPeer.handoffToRoomCall();
  if (!handoff) {
    if (__DEV__) console.warn('callroom:upgrade received but no live 1:1 call to hand off');
    return;
  }

  try {
    // Stash my display name for the bootstrap (falls back to @handle, then
    // 'VaultChat User' — centralized in vaultHandle.getMyDisplayName).
    const myName = await getMyDisplayName();

    await roomCall.bootstrapFromExistingPeer({
      pc:            handoff.pc,
      localStream:   handoff.localStream,
      remoteStream:  handoff.remoteStream,
      peerUserId:    handoff.peerUserId,
      peerUserName:  fromUserName || '', // the upgrader's display name — unblocks tile label
      callId,
      roomId,
      myUserId:      _myUserId,
      myName,
      creatorId:     fromUserId,         // the upgrader is the creator (they tapped + Add)
    });
  } catch (e) {
    if (__DEV__) console.warn('callroom:upgrade bootstrap error:', e?.message || e);
  }
}

// Convenience for external callers (e.g. ChatRoomScreen if it ever needs to
// surface "caller is on another call" UI later).
export function isListening() { return _bound; }
