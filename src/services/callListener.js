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

  socket.on('call:incoming', _onIncoming);
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
  if (socket) socket.off('call:incoming', _onIncoming);
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
    _navigationRef?.navigate?.('IncomingCall', {
      callId, roomId, myUserId: _myUserId,
      callerId, callerName, type,
    });
  }
}

function _navigateToActiveCall({ callId, roomId, callerId, callerName, type }) {
  _navigationRef?.navigate?.('ActiveCall', {
    mode:          'answer',
    callId, roomId, myUserId: _myUserId,
    peerUserId:    callerId,
    recipientName: callerName,
    callType:      type || 'voice',
  });
}

// Convenience for external callers (e.g. ChatRoomScreen if it ever needs to
// surface "caller is on another call" UI later).
export function isListening() { return _bound; }
