// ============================================================
//  VaultChat — Incoming Call Screen (ringing UI)
//  src/screens/IncomingCallScreen.js
//
//  Fallback ringing UI for platforms without CallKit (Android,
//  and iOS when the app is foregrounded — CallKit UI is background
//  only in practice). Navigated to by callListener.js when a
//  `call:incoming` or `callroom:incoming` event arrives.
//
//  Matches the premium call-screen treatment:
//    - E2E Encrypted header
//    - Violet glow ring around the avatar
//    - Dispersing dots on both sides pulsing at the faster "ringing"
//      cadence so it visually signals urgency relative to an
//      outgoing call that's merely "Connecting…"
//    - Decline / Accept buttons at the bottom
//
//  Route params:
//    callId, roomId, myUserId, callerId, callerName, type
//    isConference — true when this invite is from callroom:incoming
// ============================================================

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Vibration } from 'react-native';
import { useTheme } from '../services/theme';
import DisperseDots from '../components/DisperseDots';
import * as callPeer from '../services/callPeer';
import * as roomCall from '../services/roomCall';

export default function IncomingCallScreen({ route, navigation }) {
  const { bg, tx, sub, accent } = useTheme();
  const {
    callId, roomId, myUserId, callerId, callerName,
    type = 'voice',
    isConference,
  } = route.params || {};
  const pulse = useRef(new Animated.Value(1)).current;
  const sawActiveStateRef = useRef(false); // ignore the initial snapshot — see note in ActiveCallScreen

  useEffect(() => {
    // Faster pulse than ActiveCallScreen — mirrors the urgent feel of a ring.
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.15, duration: 500, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 500, useNativeDriver: true }),
    ]));
    anim.start();

    // Vibrate pattern — matches an incoming-call ring feel without audio.
    const vibrateTimer = setInterval(() => Vibration.vibrate([0, 400, 300, 400]), 2200);
    Vibration.vibrate([0, 400, 300, 400]);

    // Subscribe to whichever engine owns this invite. Guard against the
    // initial 'idle' snapshot that both engines emit synchronously on
    // attach — otherwise this screen would navigate away before render.
    const engine = isConference ? roomCall : callPeer;
    const unsub = engine.subscribe((event, payload) => {
      if (event === 'state') {
        const st = payload?.state;
        if (st === 'incoming' || st === 'ringing' || st === 'accepted' ||
            st === 'connected' || st === 'joining'  || st === 'in-room') {
          sawActiveStateRef.current = true;
        } else if (st === 'idle' && sawActiveStateRef.current) {
          navigation.goBack();
        }
      } else if (event === 'ended' || event === 'room-ended') {
        navigation.goBack();
      }
    });

    return () => { anim.stop(); clearInterval(vibrateTimer); Vibration.cancel(); unsub(); };
  }, []);

  function onAccept() {
    Vibration.cancel();
    navigation.replace('ActiveCall', {
      mode:          isConference ? 'answer-conference' : 'answer',
      callId, roomId, myUserId,
      peerUserId:    callerId,
      recipientName: callerName,
      callType:      type,
      isConference:  !!isConference,
    });
  }

  function onDecline() {
    Vibration.cancel();
    if (isConference) {
      try { roomCall.declineIncoming(myUserId); } catch {}
    } else {
      try { callPeer.declineIncoming(myUserId); } catch {}
    }
    navigation.goBack();
  }

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* E2E Encrypted header — mirrors ActiveCallScreen's trust signal */}
      <View style={s.e2eHeader}>
        <Text style={[s.e2eText, { color: sub }]}>🔒  End-to-end Encrypted</Text>
      </View>

      <View style={s.top}>
        <Text style={[s.kicker, { color: sub }]}>
          {type === 'video' ? '📹 Incoming Video Call' : '📞 Incoming Call'}
        </Text>

        {/* Avatar stage — dots | glow-ring avatar | dots */}
        <View style={s.avatarStage}>
          <DisperseDots accent={accent} side="left"  active={true} speed="ringing" />
          <Animated.View
            style={[
              s.avatarGlow,
              { borderColor: accent, shadowColor: accent, transform: [{ scale: pulse }] },
            ]}>
            <View style={[s.avatar, { backgroundColor: accent }]}>
              <Text style={s.avatarTx}>{(callerName || '?')[0]?.toUpperCase()}</Text>
            </View>
          </Animated.View>
          <DisperseDots accent={accent} side="right" active={true} speed="ringing" />
        </View>

        <Text style={[s.name, { color: tx }]}>{callerName || 'Unknown'}</Text>
        <Text style={[s.subLabel, { color: sub }]}>is calling you…</Text>
      </View>

      {/* Accept / Decline */}
      <View style={s.actionsRow}>
        <View style={s.actionCol}>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#ff3b30' }]} onPress={onDecline}>
            <Text style={s.actionIcon}>📵</Text>
          </TouchableOpacity>
          <Text style={[s.actionLabel, { color: tx }]}>Decline</Text>
        </View>
        <View style={s.actionCol}>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#34C759' }]} onPress={onAccept}>
            <Text style={s.actionIcon}>📞</Text>
          </TouchableOpacity>
          <Text style={[s.actionLabel, { color: tx }]}>Accept</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, paddingBottom: 60 },

  e2eHeader:   { paddingTop: 56, paddingBottom: 4, alignItems: 'center' },
  e2eText:     { fontSize: 13, letterSpacing: 0.3 },

  top:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  kicker:      { fontSize: 13, letterSpacing: 1, marginBottom: 20 },

  // Avatar stage — identical treatment to ActiveCallScreen for visual continuity
  avatarStage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  avatarGlow:  {
    width: 170, height: 170, borderRadius: 85,
    borderWidth: 3, padding: 4, alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.55, shadowRadius: 30, shadowOffset: { width: 0, height: 0 },
  },
  avatar:      { width: 154, height: 154, borderRadius: 77, alignItems: 'center', justifyContent: 'center' },
  avatarTx:    { color: '#fff', fontSize: 52, fontWeight: '800' },

  name:        { fontSize: 28, fontWeight: '700', marginTop: 8 },
  subLabel:    { fontSize: 15 },

  actionsRow:  { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 50 },
  actionCol:   { alignItems: 'center', gap: 10 },
  actionBtn:   { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  actionIcon:  { fontSize: 30 },
  actionLabel: { fontSize: 13, fontWeight: '600' },
});
