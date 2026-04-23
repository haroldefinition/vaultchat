// ============================================================
//  VaultChat — Incoming Call Screen (ringing UI)
//  src/screens/IncomingCallScreen.js
//
//  Fallback ringing UI for platforms without CallKit (Android,
//  and iOS when the app is foregrounded — CallKit UI is background
//  only in practice). Navigated to by callListener.js when a
//  `call:incoming` event arrives.
//
//  Route params:
//    callId, roomId, myUserId, callerId, callerName, type
//
//  Actions:
//    Accept  → navigation.replace('ActiveCall', { mode: 'answer', ... })
//    Decline → callPeer.declineIncoming(myUserId); navigation.goBack()
// ============================================================

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Vibration } from 'react-native';
import * as callPeer from '../services/callPeer';
import * as roomCall from '../services/roomCall';

export default function IncomingCallScreen({ route, navigation }) {
  const {
    callId, roomId, myUserId, callerId, callerName,
    type = 'voice',
    isConference,
  } = route.params || {};
  const pulse = useRef(new Animated.Value(1)).current;
  const sawActiveStateRef = useRef(false); // ignore the initial idle snapshot

  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.12, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 650, useNativeDriver: true }),
    ]));
    anim.start();
    const vibrateTimer = setInterval(() => Vibration.vibrate([0, 400, 300, 400]), 2200);
    Vibration.vibrate([0, 400, 300, 400]);

    // Subscribe to the right engine. Both engines emit `state` + `ended`.
    // IMPORTANT: both emit a snapshot synchronously on attach — if we don't
    // guard with sawActiveStateRef, that initial 'idle' would fire goBack()
    // and this screen would never render.
    const engine = isConference ? roomCall : callPeer;
    const unsub = engine.subscribe((event, payload) => {
      if (event === 'state') {
        const st = payload?.state;
        if (st === 'incoming' || st === 'ringing' || st === 'accepted' ||
            st === 'connected' || st === 'joining' || st === 'in-room') {
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
    // For conference, ActiveCallScreen(mode='answer-conference') calls
    // roomCall.accept() on mount. For 1:1, mode='answer' calls callPeer.accept().
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
    <View style={s.container}>
      <View style={s.top}>
        <Text style={s.kicker}>{type === 'video' ? '📹 Incoming Video Call' : '📞 Incoming Call'}</Text>
        <Animated.View style={[s.avatar, { transform: [{ scale: pulse }] }]}>
          <Text style={s.avatarTx}>{(callerName || '?')[0]?.toUpperCase()}</Text>
        </Animated.View>
        <Text style={s.name}>{callerName || 'Unknown'}</Text>
        <Text style={s.subLabel}>is calling you…</Text>
      </View>

      <View style={s.actionsRow}>
        <View style={s.actionCol}>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#ff3b30' }]} onPress={onDecline}>
            <Text style={s.actionIcon}>📵</Text>
          </TouchableOpacity>
          <Text style={s.actionLabel}>Decline</Text>
        </View>
        <View style={s.actionCol}>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#34C759' }]} onPress={onAccept}>
            <Text style={s.actionIcon}>📞</Text>
          </TouchableOpacity>
          <Text style={s.actionLabel}>Accept</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#07091a', paddingTop: 80, paddingBottom: 60 },
  top:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  kicker:      { color: '#aaa', fontSize: 13, letterSpacing: 1, marginBottom: 12 },
  avatar:      { width: 120, height: 120, borderRadius: 60, backgroundColor: '#1A7AE8', alignItems: 'center', justifyContent: 'center' },
  avatarTx:    { color: '#fff', fontSize: 52, fontWeight: '800' },
  name:        { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 8 },
  subLabel:    { color: '#888', fontSize: 15 },
  actionsRow:  { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 50 },
  actionCol:   { alignItems: 'center', gap: 10 },
  actionBtn:   { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  actionIcon:  { fontSize: 30 },
  actionLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
