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
import DisperseDots from '../components/DisperseDots';
import * as callPeer from '../services/callPeer';
import * as roomCall from '../services/roomCall';
import { callroomUpgradeNotice } from '../services/socket';
import { getMyDisplayName } from '../services/vaultHandle';
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

// ── Circular call control button ─────────────────────────────
// Mockup-style pill button: circle icon on top, small label below.
// `active` inverts the background to highlight a pressed/on state
// (e.g. Mute on, Speaker on, Video on). Theme-aware so it works
// against both the dark-mode near-black canvas AND the light-mode
// white canvas — tinted surface + tx-colored icon + sub-colored label.
function CallBtn({ icon, label, onPress, active, activeColor, theme }) {
  const bg   = active && activeColor ? activeColor : (theme?.inputBg || 'rgba(255,255,255,0.09)');
  const ic   = active ? '#ffffff' : (theme?.tx  || '#ffffff');
  const lbl  = theme?.sub || '#cfd1d6';
  return (
    <View style={cb.col}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        style={[cb.btn, { backgroundColor: bg }]}>
        <Text style={[cb.icon, { color: ic }]}>{icon}</Text>
      </TouchableOpacity>
      <Text style={[cb.label, { color: lbl }]}>{label}</Text>
    </View>
  );
}
const cb = StyleSheet.create({
  col:   { alignItems: 'center', gap: 8, width: 80 },
  btn:   {
    width: 68, height: 68, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
  },
  icon:  { fontSize: 26 },
  label: { fontSize: 12 },
});

// ── Participant tile (for 2x2 conference grid) ────────────────
function ParticipantTile({ name, state, accent, isMe }) {
  const stateLabel =
    state === 'connected'    ? ''       :
    state === 'connecting'   ? 'Connecting…' :
    state === 'disconnected' ? 'Reconnecting…' :
    state === 'failed'       ? 'Lost'  : '';
  const dim = state === 'disconnected' || state === 'failed';
  // Self tile always shows "You" (name='You' upstream, but guard here too).
  // Remote tile shows the peer's name, or "Unknown" only if we genuinely
  // haven't received any name for them yet.
  const displayName = isMe ? 'You' : (name || 'Unknown');
  const avatarLetter = isMe ? 'Y' : (name || '?')[0]?.toUpperCase();

  return (
    <View style={[tile.wrap, { opacity: dim ? 0.55 : 1 }]}>
      <View style={[tile.avatar, { backgroundColor: accent }]}>
        <Text style={tile.letter}>{avatarLetter}</Text>
      </View>
      <Text style={tile.name} numberOfLines={1}>{displayName}</Text>
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
  const [quality,      setQuality]      = useState('HD');
  const [addModal,     setAddModal]     = useState(false);
  const [keypadModal,  setKeypadModal]  = useState(false);
  const [moreModal,    setMoreModal]    = useState(false);
  const [dtmfBuffer,   setDtmfBuffer]   = useState('');

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
        const myName = await getMyDisplayName();

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
      //    Include our display name so their tile shows us by name, not "Unknown".
      const myNameEarly = await getMyDisplayName();

      callroomUpgradeNotice({
        callId, roomId,
        fromUserId:   myUserId,
        fromUserName: myNameEarly,
        targetUserId: peerUserId,
      });

      // 2. Our handoff — transfer ownership of the pc/streams from callPeer.
      const handoff = callPeer.handoffToRoomCall();
      if (!handoff) {
        Alert.alert('Upgrade failed', 'Could not transfer the call to conference mode.');
        return;
      }

      // 3. Bootstrap roomCall from the handoff so we stay connected to the existing peer.
      await roomCall.bootstrapFromExistingPeer({
        pc:            handoff.pc,
        localStream:   handoff.localStream,
        remoteStream:  handoff.remoteStream,
        peerUserId:    handoff.peerUserId,
        peerUserName:  recipientName || '',
        callId,
        roomId,
        myUserId,
        myName:        myNameEarly,
        creatorId:     myUserId,          // I tapped + Add, so I'm the creator
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
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* E2E Encrypted header — mirrors the mockup's trust signal */}
      {!showGrid && (
        <View style={s.e2eHeader}>
          <Text style={[s.e2eText, { color: sub }]}>🔒  End-to-end Encrypted</Text>
        </View>
      )}

      {/* Rural-relay hint — only shown when the call has degraded, stays
          unobtrusive so it doesn't compete with the main call UI. */}
      {status === 'Connected' && (quality === 'Low' || quality === 'Min') && (
        <Text style={s.ruralNote}>
          📶 Routing through secure relay for low-signal areas
        </Text>
      )}
      {/* Live adaptation banner — invisible on good networks. */}
      {status === 'Connected' && <CallQualityChip />}

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
          <View style={s.avatarStage}>
            {/* Left disperse waveform dots */}
            <DisperseDots accent={accent} side="left"  active={status !== 'Connected'} />
            {/* Glow ring + avatar (centered) */}
            <Animated.View
              style={[
                s.avatarGlow,
                { borderColor: accent, shadowColor: accent,
                  transform: [{ scale: status === 'Connecting...' ? pulse : 1 }] },
              ]}>
              <View style={[s.avatar, { backgroundColor: accent }]}>
                <Text style={s.avatarTx}>{(recipientName || '?')[0]?.toUpperCase()}</Text>
              </View>
            </Animated.View>
            {/* Right disperse waveform dots */}
            <DisperseDots accent={accent} side="right" active={status !== 'Connected'} />
          </View>

          <Text style={[s.name, { color: tx }]}>{recipientName || 'Unknown'}</Text>
          <Text style={[s.status, { color: status === 'Connected' ? tx : sub }]}>
            {status === 'Connected' ? fmt(duration) : status}
          </Text>
          {onHold && <Text style={{ color: '#ff9500', fontSize: 13, marginTop: 4 }}>⏸ On Hold</Text>}
        </View>
      )}

      {/* Controls — 3x2 grid matching the voice call mockup
          Row 1:  Mute   Keypad   Speaker
          Row 2:  Video  Add Call More                          */}
      <View style={s.controls}>
        <View style={s.controlRow}>
          <CallBtn
            theme={{ tx, sub, inputBg }}
            icon={muted ? '🔇' : '🎤'}
            label={muted ? 'Unmute' : 'Mute'}
            active={muted}
            activeColor="#ff4444"
            onPress={() => {
              haptic();
              const next = !muted;
              setMuted(next);
              if (isRealCall) {
                if (isConference) roomCall.setMute?.(next, 'audio');
                else              callPeer.setMute(next, myUserId, 'audio');
              }
            }}
          />
          <CallBtn
            theme={{ tx, sub, inputBg }}
            icon="⌘"
            label="Keypad"
            onPress={() => { haptic(); setKeypadModal(true); }}
          />
          <CallBtn
            theme={{ tx, sub, inputBg }}
            icon="🔊"
            label="Speaker"
            active={speaker}
            activeColor={accent}
            onPress={() => {
              haptic();
              const next = !speaker;
              setSpeaker(next);
              (next ? setSpeakerMode() : setEarpieceMode()).catch(() => {});
            }}
          />
        </View>
        <View style={s.controlRow}>
          <CallBtn
            theme={{ tx, sub, inputBg }}
            icon={isVideo ? '📹' : '🎥'}
            label="Video"
            active={isVideo}
            activeColor={accent}
            onPress={() => {
              haptic();
              if (isVideo) {
                Alert.alert('Camera flipped');
              } else {
                Alert.alert(
                  'Video calls coming soon',
                  'Full video is on the roadmap. For now, voice calls are HD-encrypted end-to-end.',
                );
              }
            }}
          />
          <CallBtn
            theme={{ tx, sub, inputBg }}
            icon="+"
            label="Add Call"
            onPress={() => { haptic(); setAddModal(true); }}
          />
          <CallBtn
            theme={{ tx, sub, inputBg }}
            icon="⋯"
            label="More"
            onPress={() => { haptic(); setMoreModal(true); }}
          />
        </View>
      </View>

      {/* End call — dynamic label: 'End for Everyone' for conference creator,
          'Leave' for other conference members, 'End' for 1:1. */}
      <View style={s.endRow}>
        <TouchableOpacity style={s.endBtn} onPress={handleEndPress}>
          <Text style={s.endIcon}>📵</Text>
        </TouchableOpacity>
        <Text style={[s.endLabel, { color: tx }]}>{endLabel}</Text>
      </View>

      {/* Add Participant modal (search bar + keypad) */}
      <Modal visible={addModal} animationType="slide">
        <AddParticipantModal
          onClose={() => setAddModal(false)}
          onAddUser={handleAddUser}
          theme={{ tx, sub, card, accent, inputBg, border }}
        />
      </Modal>

      {/* In-call DTMF Keypad — for navigating phone menus.
          WebRTC DTMF isn't emitted over voice-only mesh calls (we'd
          need sendDTMFTones on an RTP transceiver, which isn't wired
          up yet), so this surfaces the UI + collects the buffer for
          future use. Labels are live-updated so the user at least sees
          which digits they've pressed. */}
      <Modal visible={keypadModal} animationType="slide" transparent>
        <View style={s.modalBackdrop}>
          <View style={[s.modalSheet, { backgroundColor: card }]}>
            <Text style={[s.modalTitle, { color: tx }]}>Keypad</Text>
            <Text style={[s.dtmfDisplay, { color: tx }]}>{dtmfBuffer || ' '}</Text>
            <View style={{ paddingHorizontal: 20, gap: 10 }}>
              {[
                ['1','2','3'],
                ['4','5','6'],
                ['7','8','9'],
                ['*','0','#'],
              ].map((row, ri) => (
                <View key={ri} style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  {row.map(d => (
                    <TouchableOpacity
                      key={d}
                      onPress={() => { haptic(); setDtmfBuffer(prev => prev + d); }}
                      style={[s.dtmfKey, { backgroundColor: inputBg }]}>
                      <Text style={[s.dtmfKeyTx, { color: tx }]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => { setKeypadModal(false); setDtmfBuffer(''); }}
              style={s.modalClose}>
              <Text style={{ color: accent, fontWeight: '700' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* "More" action sheet — extra in-call controls that didn't fit in
          the main 3x2 grid. Currently minimal; add items as features land. */}
      <Modal visible={moreModal} animationType="fade" transparent>
        <TouchableOpacity
          style={s.modalBackdrop}
          activeOpacity={1}
          onPress={() => setMoreModal(false)}>
          <View style={[s.moreSheet, { backgroundColor: card }]}>
            <TouchableOpacity
              style={s.moreRow}
              onPress={() => {
                setMoreModal(false);
                haptic();
                setOnHold(v => !v);
              }}>
              <Text style={s.moreIcon}>{onHold ? '▶️' : '⏸'}</Text>
              <Text style={[s.moreLabel, { color: tx }]}>{onHold ? 'Resume' : 'Hold call'}</Text>
            </TouchableOpacity>
            <View style={[s.divider, { backgroundColor: border }]} />
            <TouchableOpacity
              style={s.moreRow}
              onPress={() => { setMoreModal(false); Alert.alert('Call info', `Call ID: ${callId || '—'}\nRoom: ${roomId || '—'}\nQuality: ${quality}`); }}>
              <Text style={s.moreIcon}>ℹ️</Text>
              <Text style={[s.moreLabel, { color: tx }]}>Call info</Text>
            </TouchableOpacity>
            <View style={[s.divider, { backgroundColor: border }]} />
            <TouchableOpacity
              style={s.moreRow}
              onPress={() => setMoreModal(false)}>
              <Text style={s.moreIcon}>✕</Text>
              <Text style={[s.moreLabel, { color: sub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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

  // End-to-end encrypted header
  e2eHeader:      { paddingTop: 56, paddingBottom: 4, alignItems: 'center' },
  e2eText:        { color: '#cfd1d6', fontSize: 13, letterSpacing: 0.3 },
  ruralNote:      { fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', paddingHorizontal: 32, paddingTop: 6 },

  // Avatar stage — glow ring + disperse dots. Flex-row so the dots
  // sit to the left/right of the avatar as siblings; the row is
  // centered horizontally, which gives the dots room on both sides.
  avatarStage:    {
    flexDirection: 'row',
    marginTop: 40, marginBottom: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarGlow:     {
    width: 170, height: 170, borderRadius: 85,
    borderWidth: 3, padding: 4, alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.55, shadowRadius: 30, shadowOffset: { width: 0, height: 0 },
  },
  avatar:         { width: 154, height: 154, borderRadius: 77, alignItems: 'center', justifyContent: 'center' },

  // Controls 3x2 grid
  controls:       { paddingHorizontal: 20, paddingVertical: 28, gap: 28, alignItems: 'center' },
  controlRow:     { flexDirection: 'row', width: '100%', justifyContent: 'space-around' },

  // End button
  endRow:         { alignItems: 'center', paddingBottom: 40, gap: 6 },
  endBtn:         {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: '#ff3b30', alignItems: 'center', justifyContent: 'center',
  },
  endIcon:        { fontSize: 30 },
  endLabel:       { color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 4 },

  // Conference grid
  gridWrap:       { paddingTop: 60, paddingBottom: 14, paddingHorizontal: 12, alignItems: 'center' },
  gridRow:        { flexDirection: 'row', width: '100%', justifyContent: 'center', marginBottom: 12, gap: 12 },

  // Modal sheets (Keypad + More)
  modalBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet:     { paddingTop: 22, paddingBottom: 40, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalTitle:     { textAlign: 'center', fontSize: 16, fontWeight: '700', marginBottom: 14 },
  modalClose:     { alignSelf: 'center', marginTop: 18, paddingVertical: 8, paddingHorizontal: 28 },
  dtmfDisplay:    { color: '#fff', fontSize: 26, letterSpacing: 4, textAlign: 'center', minHeight: 34, marginBottom: 18 },
  dtmfKey:        { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  dtmfKeyTx:      { fontSize: 28, fontWeight: '400' },
  moreSheet:      { marginTop: 'auto', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 6 },
  moreRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 18, gap: 14 },
  moreIcon:       { fontSize: 22 },
  moreLabel:      { fontSize: 16, fontWeight: '500' },
  divider:        { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
});
