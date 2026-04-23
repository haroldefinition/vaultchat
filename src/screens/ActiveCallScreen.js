import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  TextInput, Animated, Modal, KeyboardAvoidingView, Platform, Vibration,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import { profileForSignal } from '../services/callQuality';
import CallQualityChip from '../components/CallQualityChip';
import AddParticipantModal from '../components/AddParticipantModal';
import * as callPeer from '../services/callPeer';
import * as roomCall from '../services/roomCall';
import { callroomUpgradeNotice } from '../services/socket';
import { setEarpieceMode, setSpeakerMode } from '../services/audioSession';
import netQ from '../services/networkQuality';

// ── Enhanced quality badge with relay info ────────────────────
function QualityBadge({ quality, routing }) {
  const colorMap = { HD: '#00ffa3', SD: '#ffd700', Low: '#ff9500', Min: '#ff3b30' };
  const labelMap = {
    HD:  'HD · Excellent signal',
    SD:  'SD · Good signal',
    Low: 'Low · Weak signal',
    Min: 'Min · Rural relay active',
  };
  const color = colorMap[quality] || '#00ffa3';
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View style={[qb.badge, { backgroundColor: color + '22', borderColor: color }]}>
        <View style={[qb.dot, { backgroundColor: color }]} />
        <Text style={[qb.label, { color }]}>{quality}</Text>
        {quality === 'Low' || quality === 'Min' ? (
          <Text style={[qb.relay, { color }]}>📡 Relay</Text>
        ) : (
          <Text style={[qb.relay, { color }]}>✓ Direct</Text>
        )}
      </View>
      <Text style={qb.subLabel}>{labelMap[quality]}</Text>
    </View>
  );
}
const qb = StyleSheet.create({
  badge:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  dot:      { width: 7, height: 7, borderRadius: 4 },
  label:    { fontSize: 12, fontWeight: '800' },
  relay:    { fontSize: 11, fontWeight: '600', opacity: 0.85 },
  subLabel: { fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.3 },
});

// ── Participant tile (for 2x2 conference grid) ────────────────
function ParticipantTile({ name, state, accent, isMe }) {
  const stateLabel =
    state === 'connected'    ? ''       :
    state === 'connecting'   ? 'Connecting…' :
    state === 'disconnected' ? 'Reconnecting…' :
    state === 'failed'       ? 'Lost'  : '';
  const dim = state === 'disconnected' || state === 'failed';

  return (
    <View style={[tile.wrap, { opacity: dim ? 0.55 : 1 }]}>
      <View style={[tile.avatar, { backgroundColor: accent }]}>
        <Text style={tile.letter}>{(name || '?')[0]?.toUpperCase()}</Text>
      </View>
      <Text style={tile.name} numberOfLines={1}>
        {name || 'Unknown'}{isMe ? ' (you)' : ''}
      </Text>
      {stateLabel ? <Text style={tile.sub}>{stateLabel}</Text> : null}
    </View>
  );
}
const tile = StyleSheet.create({
  wrap:   { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 8, gap: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  letter: { color: '#fff', fontSize: 28, fontWeight: '700' },
  name:   { color: '#fff', fontSize: 13, fontWeight: '600', maxWidth: '90%' },
  sub:    { color: '#aaa', fontSize: 10 },
});

// ── Main ActiveCallScreen ─────────────────────────────────────
//
// Route params:
//   mode:           'outgoing' | 'answer'   — how this screen was entered
//   callId:         uuid                    — generated caller-side
//   roomId:         string                  — 1:1 chat roomId
//   myUserId:       string                  — my profiles.id
//   peerUserId:     string                  — the other side's profiles.id
//   recipientName:  string                  — displayed in the title
//   recipientPhone: string                  — displayed beneath the name
//   callType:       'voice' | 'video'       — voice for Phase 1; video stubbed
//
// Legacy calls (from the sample "Recent" list in CallScreen) still pass
// just recipientName/recipientPhone/callType — we treat those as "mock
// only" and show the UI without actually placing a call.
export default function ActiveCallScreen({ route, navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const {
    mode, callId, roomId, myUserId, peerUserId,
    recipientName, recipientPhone, callType,
    isConference: isConfParam,
  } = route.params || {};

  // Conference mode when the route says so, OR when the mode string carries it.
  const startedAsConference = !!isConfParam || mode === 'outgoing-conference' || mode === 'answer-conference';

  const isRealCall = !!(mode && callId && myUserId);

  const [status,    setStatus]    = useState(
    mode === 'answer' || mode === 'answer-conference' ? 'Connecting...' : 'Ringing...'
  );
  const [duration,  setDuration]  = useState(0);
  const [muted,     setMuted]     = useState(false);
  const [speaker,   setSpeaker]   = useState(false);
  const [onHold,    setOnHold]    = useState(false);
  const [quality,   setQuality]   = useState('HD');
  const [addModal,  setAddModal]  = useState(false);

  // Conference state — mirrors roomCall.getParticipants().
  // For 1:1 calls we synthesize a 2-entry list from route params so the
  // grid can still render if/when the call upgrades.
  const [isConference, setIsConference] = useState(startedAsConference);
  const [creatorId,    setCreatorId]    = useState(null);
  const [participants, setParticipants] = useState([
    { userId: peerUserId || 'peer', userName: recipientName || 'Unknown', state: 'connecting', hasStream: false },
  ]);

  const pulse = useRef(new Animated.Value(1)).current;
  const timer = useRef(null);
  const hungUpRef = useRef(false); // guard against double-hangup in unmount
  const sawActiveStateRef = useRef(false); // true once we've seen any non-idle state (prevents initial-snapshot teardown)

  // Derived: am I the conference creator? Only then do we show "End for Everyone".
  const isCreator = isConference && creatorId && creatorId === myUserId;
  // Participant count for grid rendering (includes me).
  const partyCount = (isConference ? participants.length : 2); // 1:1 shows 2 tiles when we render the grid

  // ── Start the call (real lifecycle) + subscribe to callPeer events ──
  useEffect(() => {
    // Avatar pulse while pre-connected
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.15, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 800, useNativeDriver: true }),
    ]));
    anim.start();

    // Mock-only path (no real peerUserId) — keep old UX for sample call
    // history entries until NewCall/Contacts route through the real path.
    if (!isRealCall) {
      const connect = setTimeout(() => { setStatus('Connected'); anim.stop(); }, 2000);
      const qualTimer = setInterval(() => {
        const p = profileForSignal(Math.floor(Math.random() * 5));
        if      (p.maxBitrate >= 1000000) setQuality('HD');
        else if (p.maxBitrate >= 500000)  setQuality('SD');
        else if (p.maxBitrate >= 200000)  setQuality('Low');
        else                              setQuality('Min');
      }, 7000);
      return () => { clearTimeout(connect); clearInterval(qualTimer); anim.stop(); };
    }

    // Real call path — subscribe FIRST so we catch the state flip.
    // NB: callPeer.subscribe emits the current state synchronously on attach.
    // Before startOutgoing/accept has run, that snapshot is `idle`. We must
    // not treat that initial idle as "call ended" — only transitions to idle
    // that happen AFTER we've seen an active state count as a real teardown.
    //
    // When callPeer emits state=idle with `handedOff: true`, that's a handoff
    // to roomCall (1:1 → conference upgrade) — don't treat it as teardown.
    const unsub = callPeer.subscribe((event, payload) => {
      if (event === 'state') {
        const st = payload?.state;
        if (st === 'ringing')        { sawActiveStateRef.current = true; setStatus('Ringing...'); }
        else if (st === 'placing')   { sawActiveStateRef.current = true; setStatus('Ringing...'); }
        else if (st === 'incoming')  { sawActiveStateRef.current = true; }
        else if (st === 'accepted')  { sawActiveStateRef.current = true; setStatus('Connecting...'); }
        else if (st === 'connected') { sawActiveStateRef.current = true; setStatus('Connected'); anim.stop(); }
        else if (st === 'idle')      {
          if (!sawActiveStateRef.current) return;
          if (payload?.handedOff) return;                  // upgrade in progress, not an end
          if (isConference) return;                         // roomCall has taken over
          if (!hungUpRef.current) {
            hungUpRef.current = true;
            navigation.goBack();
          }
        }
      } else if (event === 'declined') {
        Alert.alert('Call declined', 'The recipient declined the call.');
        hungUpRef.current = true;
        navigation.goBack();
      } else if (event === 'ended') {
        hungUpRef.current = true;
        navigation.goBack();
      } else if (event === 'connectionLost') {
        Alert.alert('Call ended', 'The connection was lost.');
        hungUpRef.current = true;
        navigation.goBack();
      }
    });

    // roomCall subscription — drives conference state (participants + creatorId).
    // Runs always; it's a no-op until roomCall.startConference / bootstrap / accept fires.
    const unsubRoom = roomCall.subscribe((event, payload) => {
      if (event === 'state') {
        const snap = roomCall.getState();
        if (snap?.state && snap.state !== 'idle') {
          sawActiveStateRef.current = true;
          setIsConference(true);
          if (snap.creatorId) setCreatorId(snap.creatorId);
          // Map roomCall states → UI status text.
          if (snap.state === 'connecting') setStatus('Connecting...');
          else if (snap.state === 'connected') { setStatus('Connected'); anim.stop(); }
          else if (snap.state === 'ringing')   setStatus('Ringing...');
          // Refresh participants.
          setParticipants(roomCall.getParticipants() || []);
        } else if (snap?.state === 'idle' && isConference) {
          // Conference ended.
          if (!hungUpRef.current) {
            hungUpRef.current = true;
            navigation.goBack();
          }
        }
      } else if (
        event === 'peer-joined' ||
        event === 'peer-state'  ||
        event === 'peer-stream' ||
        event === 'peer-left'
      ) {
        setParticipants(roomCall.getParticipants() || []);
      } else if (event === 'room-ended') {
        Alert.alert('Call ended', 'The host ended the call.');
        hungUpRef.current = true;
        navigation.goBack();
      } else if (event === 'cap-reached') {
        Alert.alert('Room full', 'This call already has the maximum number of participants.');
      } else if (event === 'error') {
        if (__DEV__) console.warn('roomCall error:', payload);
      }
    });

    // Live quality from getStats()
    const unsubQuality = netQ.subscribe(({ quality: q }) => {
      // networkQuality.js emits 'good' | 'poor' | 'critical' — map onto the badge states.
      if (q === 'good')     setQuality('HD');
      else if (q === 'poor') setQuality('Low');
      else                   setQuality('Min');
    });

    // Kick off the call.
    // Modes:
    //   'outgoing'            — 1:1 caller side (callPeer)
    //   'answer'              — 1:1 callee side (callPeer, invite already staged)
    //   'outgoing-conference' — conference creator (roomCall.startConference)
    //   'answer-conference'   — conference invitee (roomCall.accept, invite staged in callListener)
    (async () => {
      try {
        let myName = 'VaultChat User';
        try {
          const stored = await AsyncStorage.getItem('vaultchat_display_name');
          if (stored) myName = stored;
        } catch {}

        if (mode === 'outgoing') {
          await callPeer.startOutgoing({
            callId, roomId, callerId: myUserId, callerName: myName,
            peerUserId, type: callType || 'voice',
          });
        } else if (mode === 'answer') {
          await callPeer.accept(myUserId);
        } else if (mode === 'outgoing-conference') {
          await roomCall.startConference({
            callId, roomId, myUserId, myName,
            initialParticipants: route.params?.initialParticipants || [],
            type: callType || 'voice',
          });
        } else if (mode === 'answer-conference') {
          await roomCall.accept({ myUserId, myName });
        }
      } catch (e) {
        Alert.alert('Call failed', e?.message || 'Unable to start the call');
        hungUpRef.current = true;
        navigation.goBack();
      }
    })();

    return () => {
      unsub();
      unsubRoom();
      unsubQuality();
      anim.stop();
      clearInterval(timer.current);
      // If the screen unmounts while we're still in a call, tear it down.
      if (!hungUpRef.current) {
        hungUpRef.current = true;
        if (isConference) {
          try { roomCall.leaveRoom(); } catch {}
        } else {
          try { callPeer.hangup(); } catch {}
        }
      }
    };
  }, []);

  // Call timer starts once we actually connect
  useEffect(() => {
    if (status === 'Connected') {
      timer.current = setInterval(() => setDuration(d => d + 1), 1000);
    }
    return () => clearInterval(timer.current);
  }, [status]);

  async function haptic() {
    try {
      const v = await AsyncStorage.getItem('vaultchat_haptic');
      if (v === null || JSON.parse(v)) Vibration.vibrate(15);
    } catch { Vibration.vibrate(15); }
  }

  function fmt(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  // Called from AddParticipantModal once the user has been resolved to a real
  // VaultChat profile. Two paths:
  //   a) call is already a conference → roomCall.inviteParticipant
  //   b) call is still 1:1 → upgrade:
  //         1. tell existing peer via callroom:upgrade
  //         2. handoff our live pc/streams from callPeer → roomCall
  //         3. invite the new user
  async function handleAddUser(peer) {
    setAddModal(false);
    if (!peer?.id) return;
    if (peer.id === myUserId) { Alert.alert('Nice try', 'You\'re already on the call.'); return; }
    // Block adding the 1:1 peer, or anyone already in the conference.
    if (peer.id === peerUserId) { Alert.alert('Already on call', 'That person is already connected.'); return; }
    if (isConference && participants.some(p => p.userId === peer.id)) {
      Alert.alert('Already on call', 'That person is already on the conference.');
      return;
    }

    const peerName   = peer.display_name || (peer.vault_handle ? `@${peer.vault_handle}` : peer.phone || 'VaultChat User');

    try {
      // Already a conference → just invite.
      if (isConference) {
        roomCall.inviteParticipant({ userId: peer.id, userName: peerName });
        return;
      }

      // 1:1 upgrade path.
      if (!peerUserId || !callId || !roomId) {
        Alert.alert('Not ready', 'Please wait until the call is connected before adding.');
        return;
      }

      // 1. Tell the existing 1:1 peer to prepare for upgrade (they'll do the
      //    same handoff + bootstrap on their side when callroom:upgrade arrives).
      callroomUpgradeNotice({
        callId, roomId,
        fromUserId:   myUserId,
        targetUserId: peerUserId,
      });

      // 2. Our handoff — transfer ownership of the pc/streams from callPeer.
      const handoff = callPeer.handoffToRoomCall();
      if (!handoff) {
        Alert.alert('Upgrade failed', 'Could not transfer the call to conference mode.');
        return;
      }

      // 3. Bootstrap roomCall from the handoff so we stay connected to the existing peer.
      let myName = 'VaultChat User';
      try {
        const stored = await AsyncStorage.getItem('vaultchat_display_name');
        if (stored) myName = stored;
      } catch {}

      await roomCall.bootstrapFromExistingPeer({
        pc:            handoff.pc,
        localStream:   handoff.localStream,
        remoteStream:  handoff.remoteStream,
        peerUserId:    handoff.peerUserId,
        peerUserName:  recipientName || '',
        callId,
        roomId,
        myUserId,
        myName,
      });

      // 4. Now invite the new person.
      roomCall.inviteParticipant({ userId: peer.id, userName: peerName });
    } catch (e) {
      Alert.alert('Add failed', e?.message || 'Unable to add participant.');
    }
  }

  // Unified end button — dynamic label + handler.
  function handleEndPress() {
    clearInterval(timer.current);
    if (hungUpRef.current) { navigation.goBack(); return; }
    hungUpRef.current = true;

    if (isConference) {
      try { isCreator ? roomCall.endForEveryone() : roomCall.leaveRoom(); } catch {}
    } else if (isRealCall) {
      try { callPeer.hangup(); } catch {}
    }
    navigation.goBack();
  }

  const endLabel = isConference
    ? (isCreator ? 'End for Everyone' : 'Leave')
    : 'End';

  const isVideo = callType === 'video';
  // Show the 2x2 grid in conference mode OR once we have more than one remote peer.
  const showGrid = isConference && participants.length >= 1;

  return (
    <View style={[s.container, { backgroundColor: '#07091a' }]}>
      {/* Quality badge — shows signal + routing info */}
      {status === 'Connected' && (
        <View style={s.qualityRow}>
          <QualityBadge quality={quality} />
          {(quality === 'Low' || quality === 'Min') && (
            <Text style={s.ruralNote}>
              📶 Routing through secure relay for low-signal areas
            </Text>
          )}
          {/* Live adaptation banner — invisible on good networks, shows when
              Opus bitrate has been adjusted for the current call path. */}
          <CallQualityChip />
        </View>
      )}

      {/* Top section — single-avatar for 1:1, or 2x2 grid for conference */}
      {showGrid ? (
        <View style={s.gridWrap}>
          <Text style={s.callTypeLabel}>
            {isVideo ? '📹 Video Call' : '📞 Voice Call'} · {participants.length + 1} people
          </Text>
          <Text style={[s.status, { color: status === 'Connected' ? '#00ffa3' : '#aaa', marginBottom: 14 }]}>
            {status === 'Connected' ? fmt(duration) : status}
          </Text>
          {/* 2x2 grid — renders self + up to 3 remote peers. Row layout:
              2 people = 1 row of 2. 3 = 1 row of 2 + 1 centered. 4 = 2 rows of 2. */}
          {(() => {
            const allTiles = [
              { userId: myUserId, userName: 'You', state: 'connected', hasStream: true, isMe: true },
              ...participants,
            ];
            const rows = [];
            for (let i = 0; i < allTiles.length; i += 2) rows.push(allTiles.slice(i, i + 2));
            return rows.map((row, ri) => (
              <View key={ri} style={s.gridRow}>
                {row.map(p => (
                  <ParticipantTile
                    key={p.userId}
                    name={p.userName}
                    state={p.state}
                    accent={accent}
                    isMe={p.isMe}
                  />
                ))}
                {row.length === 1 && <View style={{ flex: 1 }} />}
              </View>
            ));
          })()}
        </View>
      ) : (
        <View style={s.top}>
          <Text style={s.callTypeLabel}>{isVideo ? '📹 Video Call' : '📞 Voice Call'}</Text>
          <Animated.View style={[s.avatar, { transform: [{ scale: status === 'Connecting...' ? pulse : 1 }], backgroundColor: accent }]}>
            <Text style={s.avatarTx}>{(recipientName || '?')[0]?.toUpperCase()}</Text>
          </Animated.View>
          <Text style={s.name}>{recipientName || 'Unknown'}</Text>
          <Text style={[s.status, { color: status === 'Connected' ? '#00ffa3' : '#aaa' }]}>
            {status === 'Connected' ? fmt(duration) : status}
          </Text>
          {onHold && <Text style={{ color: '#ff9500', fontSize: 13, marginTop: 4 }}>⏸ On Hold</Text>}
        </View>
      )}

      {/* Controls */}
      <View style={s.controls}>
        <View style={s.controlRow}>
          <TouchableOpacity style={[s.btn, muted && { backgroundColor: '#ff4444' }]}
            onPress={() => {
              haptic();
              const next = !muted;
              setMuted(next);
              if (isRealCall) callPeer.setMute(next, myUserId, 'audio');
            }}>
            <Text style={s.btnIcon}>{muted ? '🔇' : '🎤'}</Text>
            <Text style={s.btnLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, speaker && { backgroundColor: accent }]}
            onPress={() => {
              haptic();
              const next = !speaker;
              setSpeaker(next);
              // Switch the audio route at the OS level — earpiece vs speakerphone.
              (next ? setSpeakerMode() : setEarpieceMode()).catch(() => {});
            }}>
            <Text style={s.btnIcon}>🔊</Text>
            <Text style={s.btnLabel}>Speaker</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, onHold && { backgroundColor: '#ff9500' }]}
            onPress={() => { haptic(); setOnHold(v => !v); }}>
            <Text style={s.btnIcon}>{onHold ? '▶️' : '⏸'}</Text>
            <Text style={s.btnLabel}>{onHold ? 'Resume' : 'Hold'}</Text>
          </TouchableOpacity>
        </View>
        <View style={s.controlRow}>
          {/* + Add opens AddParticipantModal (search bar + keypad) */}
          <TouchableOpacity style={s.btn} onPress={() => { haptic(); setAddModal(true); }}>
            <Text style={s.btnIcon}>➕</Text>
            <Text style={s.btnLabel}>Add</Text>
          </TouchableOpacity>
          {isVideo && (
            <TouchableOpacity style={s.btn} onPress={() => { haptic(); Alert.alert('Camera flipped'); }}>
              <Text style={s.btnIcon}>🔄</Text>
              <Text style={s.btnLabel}>Flip</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* End call — dynamic label: 'End for Everyone' for conference creator,
          'Leave' for other conference members, 'End' for 1:1. */}
      <View style={s.endRow}>
        <TouchableOpacity style={s.endBtn} onPress={handleEndPress}>
          <Text style={s.endIcon}>📵</Text>
        </TouchableOpacity>
        <Text style={s.endLabel}>{endLabel}</Text>
      </View>

      {/* Add Participant modal (search bar + keypad) */}
      <Modal visible={addModal} animationType="slide">
        <AddParticipantModal
          onClose={() => setAddModal(false)}
          onAddUser={handleAddUser}
          theme={{ tx, sub, card, accent, inputBg, border }}
        />
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1 },
  qualityRow:     { alignItems: 'center', paddingTop: 56, paddingBottom: 4, gap: 6 },
  ruralNote:      { fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', paddingHorizontal: 32 },
  top:            { alignItems: 'center', paddingTop: 20, paddingBottom: 24 },
  callTypeLabel:  { color: '#aaa', fontSize: 13, marginBottom: 20, letterSpacing: 1 },
  avatar:         { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  avatarTx:       { color: '#fff', fontSize: 42, fontWeight: 'bold' },
  name:           { color: '#fff', fontSize: 26, fontWeight: 'bold', marginBottom: 8 },
  status:         { fontSize: 16, letterSpacing: 1 },
  participantsRow:{ maxHeight: 90, marginBottom: 10 },
  participant:    { width: 64, height: 80, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 8 },
  partTx:         { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  partName:       { color: '#fff', fontSize: 10, marginTop: 4 },
  controls:       { flex: 1, justifyContent: 'center', paddingHorizontal: 40, gap: 24 },
  controlRow:     { flexDirection: 'row', justifyContent: 'space-around' },
  btn:            { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', gap: 4 },
  btnIcon:        { fontSize: 26 },
  btnLabel:       { color: '#aaa', fontSize: 11 },
  endRow:         { alignItems: 'center', paddingBottom: 40, gap: 6 },
  endBtn:         { width: 72, height: 72, borderRadius: 36, backgroundColor: '#ff3b30', alignItems: 'center', justifyContent: 'center' },
  endIcon:        { fontSize: 30 },
  endLabel:       { color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 4 },
  // Conference grid
  gridWrap:       { paddingTop: 20, paddingBottom: 14, paddingHorizontal: 12, alignItems: 'center' },
  gridRow:        { flexDirection: 'row', width: '100%', justifyContent: 'center', marginBottom: 12, gap: 12 },
});
