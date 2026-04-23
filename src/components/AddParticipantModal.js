// ============================================================
//  VaultChat — Add Participant Modal
//  src/components/AddParticipantModal.js
//
//  Full-screen modal surfaced from ActiveCallScreen when the user
//  taps "+ Add" during a call. Lets them enter a peer via either:
//    - @handle (text input)
//    - phone number (text input OR the numeric keypad)
//  On submit: resolves to a profile via vaultHandle.findByHandleOrPhone
//  and fires onAddUser({ id, name, handle, phone }).
//
//  Does NOT place the call itself — the parent screen decides whether
//  to invite via roomCall.inviteParticipant (already a conference) or
//  trigger the 1:1 → conference upgrade path.
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Alert,
  Vibration, StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { findByHandleOrPhone } from '../services/vaultHandle';

const KEYS = [
  ['1', ''],    ['2', 'ABC'],  ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'],  ['6', 'MNO'],
  ['7', 'PQRS'],['8', 'TUV'],  ['9', 'WXYZ'],
  ['*', ''],    ['0', '+'],    ['#', ''],
];

async function haptic() {
  try {
    const v = await AsyncStorage.getItem('vaultchat_haptic');
    if (v === null || JSON.parse(v)) Vibration.vibrate(15);
  } catch { Vibration.vibrate(15); }
}

/**
 * @param {object} props
 * @param {() => void}          props.onClose    — dismiss handler
 * @param {(user) => void}      props.onAddUser  — fired with { id, vault_handle, display_name, phone } on successful resolve
 * @param {object}              props.theme      — { tx, sub, card, accent, inputBg, border }
 */
export default function AddParticipantModal({ onClose, onAddUser, theme }) {
  const { tx, sub, card, accent, inputBg, border } = theme;
  const [input,  setInput]  = useState('');
  const [busy,   setBusy]   = useState(false);

  const canSubmit = input.trim().length >= 3 && !busy;

  function appendDigit(d) {
    // Keypad feeds the same input box — if the user has typed an @handle and
    // then starts tapping digits, we append onto it. That's fine; the
    // resolver picks the mode (handle vs phone) on submit, not during entry.
    setInput(prev => prev + d);
    haptic();
  }

  function backspace() {
    setInput(prev => prev.slice(0, -1));
    haptic();
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const peer = await findByHandleOrPhone(input.trim());
      if (!peer?.id) {
        Alert.alert(
          'User not found',
          `No VaultChat user matches "${input.trim()}". Double-check the @handle or phone number.`,
        );
        return;
      }
      onAddUser(peer);
    } catch (e) {
      Alert.alert('Lookup failed', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[s.container, { backgroundColor: card }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: border }]}>
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: accent, fontSize: 16 }}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={{ color: tx, fontWeight: '700', fontSize: 18 }}>Add to Call</Text>
        <TouchableOpacity onPress={submit} disabled={!canSubmit}>
          <Text style={{ color: canSubmit ? accent : sub, fontWeight: '700', fontSize: 16 }}>
            {busy ? '…' : 'Add'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Phone number or @handle"
          placeholderTextColor={sub}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
          style={[s.input, { color: tx, backgroundColor: inputBg, borderColor: border }]}
        />
        <Text style={[s.hint, { color: sub }]}>
          Type a @handle or tap digits below to dial by number.
        </Text>
      </View>

      {/* Live display over keypad (matches iOS Phone app feel) */}
      <View style={s.display}>
        <Text style={[s.displayText, { color: tx }]}>
          {input || ' '}
        </Text>
        {input.length > 0 && (
          <TouchableOpacity onPress={backspace} style={{ marginTop: 6 }}>
            <Text style={{ color: sub, fontSize: 22 }}>⌫</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Keypad */}
      <View style={{ paddingHorizontal: 40, gap: 12 }}>
        {[KEYS.slice(0, 3), KEYS.slice(3, 6), KEYS.slice(6, 9), KEYS.slice(9, 12)].map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            {row.map(([digit, letters]) => (
              <TouchableOpacity
                key={digit}
                style={[s.key, { backgroundColor: inputBg }]}
                onPress={() => appendDigit(digit)}>
                <Text style={[s.keyDigit, { color: tx }]}>{digit}</Text>
                {letters ? <Text style={[s.keyLetters, { color: sub }]}>{letters}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      {/* Green add-to-call button */}
      <TouchableOpacity
        style={[s.callBtn, { opacity: canSubmit ? 1 : 0.4 }]}
        onPress={submit}
        disabled={!canSubmit}>
        <Text style={s.callIcon}>➕</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1 },
  header:     {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14,
    borderBottomWidth: 1,
  },
  input:      {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 17,
  },
  hint:       { fontSize: 11, marginTop: 6, opacity: 0.7 },
  display:    { alignItems: 'center', paddingVertical: 16 },
  displayText:{ fontSize: 32, fontWeight: '300', letterSpacing: 5, minHeight: 42 },
  key:        {
    width: 76, height: 76, borderRadius: 38,
    alignItems: 'center', justifyContent: 'center',
  },
  keyDigit:   { fontSize: 28, fontWeight: '400' },
  keyLetters: { fontSize: 10, marginTop: -2, letterSpacing: 1 },
  callBtn:    {
    alignSelf: 'center', marginTop: 20, marginBottom: 40,
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: '#34C759', alignItems: 'center', justifyContent: 'center',
  },
  callIcon:   { fontSize: 32, color: '#fff' },
});
