// ============================================================
//  VaultChat — Biometric + PIN Lock Screen
//  src/screens/BiometricLockScreen.js
//
//  Shown by App.js when `isLocked` is true:
//    - On cold launch, if Settings → "Require Face ID" is on
//    - On resume from background after LOCK_TIMEOUT_MS
//
//  Attempts Face ID automatically on mount (if supported + enrolled),
//  then falls back to a 6-digit PIN keypad. Supports a dual-PIN
//  system (real + decoy) as groundwork for Vault mode — real PIN
//  unlocks everything, decoy PIN calls onUnlock('decoy') so a future
//  Vault-aware UI can hide vaulted chats.
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authenticateWithBiometric, checkBiometricSupport } from '../services/biometric';
import { useTheme } from '../services/theme';

export default function BiometricLockScreen({ onUnlock }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [pin, setPin] = useState('');
  const [decoyPin, setDecoyPin] = useState('');
  const [realPin, setRealPin] = useState('');
  const [error, setError] = useState('');
  const [biometricSupported, setBiometricSupported] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadPins();
  }, []);

  async function loadPins() {
    const rPin = await AsyncStorage.getItem('vaultchat_real_pin');
    const dPin = await AsyncStorage.getItem('vaultchat_decoy_pin');
    if (rPin) setRealPin(rPin);
    if (dPin) setDecoyPin(dPin);
    const supported = await checkBiometricSupport();
    setBiometricSupported(supported);
    if (supported) setTimeout(() => tryBiometric(), 300);
  }

  async function tryBiometric() {
    const success = await authenticateWithBiometric();
    if (success) onUnlock('real');
    else showError('Biometric failed. Enter PIN.');
  }

  function shake() {
    Vibration.vibrate([0, 50, 50, 50]);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }

  function showError(msg) { setError(msg); setTimeout(() => setError(''), 2500); }

  function addDigit(d) {
    if (pin.length >= 6) return;
    const newPin = pin + d;
    setPin(newPin);
    if (newPin.length === 6) {
      setTimeout(() => checkPin(newPin), 150);
    }
  }

  function checkPin(enteredPin) {
    if (!realPin) {
      onUnlock('real');
      return;
    }
    if (enteredPin === realPin) {
      onUnlock('real');
    } else if (decoyPin && enteredPin === decoyPin) {
      onUnlock('decoy');
    } else {
      shake();
      showError('Incorrect PIN. Try again.');
      setPin('');
    }
  }

  function deleteDigit() { setPin(p => p.slice(0, -1)); }

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <Text style={s.logo}>🔒</Text>
      <Text style={[s.title, { color: accent }]}>VaultChat</Text>
      <Text style={[s.sub, { color: sub }]}>Enter your PIN to unlock</Text>

      <Animated.View style={[s.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
        {[0,1,2,3,4,5].map(i => (
          <View
            key={i}
            style={[
              s.dot,
              { borderColor: accent },
              pin.length > i && { backgroundColor: accent, borderColor: accent },
            ]}
          />
        ))}
      </Animated.View>

      {error ? <Text style={s.error}>{error}</Text> : <Text style={s.errorPlaceholder}> </Text>}

      <View style={s.keypad}>
        {[
          ['1','2','3'],
          ['4','5','6'],
          ['7','8','9'],
          ['bio','0','⌫'],
        ].map((row, i) => (
          <View key={i} style={s.keyRow}>
            {row.map((d, j) => {
              if (d === 'bio') {
                return (
                  <TouchableOpacity
                    key={j}
                    style={[s.key, { backgroundColor: inputBg }]}
                    onPress={tryBiometric}
                    disabled={!biometricSupported}>
                    <Text style={[s.keySpecial, { color: biometricSupported ? accent : border }]}>
                      {biometricSupported ? '👁️' : '  '}
                    </Text>
                    {biometricSupported && (
                      <Text style={{ color: accent, fontSize: 9, marginTop: 2 }}>Face ID</Text>
                    )}
                  </TouchableOpacity>
                );
              }
              if (d === '⌫') {
                return (
                  <TouchableOpacity
                    key={j}
                    style={[s.key, { backgroundColor: inputBg }]}
                    onPress={deleteDigit}>
                    <Text style={[s.keyDelete, { color: tx }]}>⌫</Text>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={j}
                  style={[s.key, { backgroundColor: inputBg }]}
                  onPress={() => addDigit(d)}>
                  <Text style={[s.keyText, { color: tx }]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {!realPin && (
        <TouchableOpacity style={s.skipBtn} onPress={() => onUnlock('real')}>
          <Text style={[s.skipText, { color: sub }]}>Skip (No PIN set)</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  logo:             { fontSize: 56, marginBottom: 12 },
  title:            { fontSize: 30, fontWeight: 'bold' },
  sub:              { fontSize: 15, marginTop: 6, marginBottom: 36 },
  dotsRow:          { flexDirection: 'row', gap: 18, marginBottom: 12 },
  dot:              { width: 18, height: 18, borderRadius: 9, borderWidth: 2, backgroundColor: 'transparent' },
  error:            { color: '#ff4444', fontSize: 14, height: 20 },
  errorPlaceholder: { height: 20 },
  keypad:           { gap: 14, marginTop: 20 },
  keyRow:           { flexDirection: 'row', gap: 16 },
  key:              { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  keyText:          { fontSize: 30, fontWeight: '400' },
  keySpecial:       { fontSize: 30 },
  keyDelete:        { fontSize: 26 },
  skipBtn:          { marginTop: 32 },
  skipText:         { fontSize: 14 },
});
