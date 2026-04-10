import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Vibration } from 'react-native';
import { authenticateWithBiometric, checkBiometricSupport } from '../services/biometric';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function BiometricLockScreen({ onUnlock }) {
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
    <View style={s.container}>
      <Text style={s.logo}>🔒</Text>
      <Text style={s.title}>VaultChat</Text>
      <Text style={s.sub}>Enter your PIN to unlock</Text>

      <Animated.View style={[s.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
        {[0,1,2,3,4,5].map(i => (
          <View key={i} style={[s.dot, pin.length > i && s.dotFilled]} />
        ))}
      </Animated.View>

      {error ? <Text style={s.error}>{error}</Text> : <Text style={s.errorPlaceholder}> </Text>}

      <View style={s.keypad}>
        {[
          ['1','2','3'],
          ['4','5','6'],
          ['7','8','9'],
          ['bio','0','⌫']
        ].map((row, i) => (
          <View key={i} style={s.keyRow}>
            {row.map((d, j) => {
              if (d === 'bio') {
                return (
                  <TouchableOpacity key={j} style={s.key} onPress={tryBiometric} disabled={!biometricSupported}>
                    <Text style={[s.keySpecial, { color: biometricSupported ? '#0057a8' : '#333' }]}>
                      {biometricSupported ? '👁️' : '  '}
                    </Text>
                    {biometricSupported && <Text style={{ color: '#0057a8', fontSize: 9, marginTop: 2 }}>Face ID</Text>}
                  </TouchableOpacity>
                );
              }
              if (d === '⌫') {
                return (
                  <TouchableOpacity key={j} style={s.key} onPress={deleteDigit}>
                    <Text style={s.keyDelete}>⌫</Text>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity key={j} style={s.key} onPress={() => addDigit(d)}>
                  <Text style={s.keyText}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {!realPin && (
        <TouchableOpacity style={s.skipBtn} onPress={() => onUnlock('real')}>
          <Text style={s.skipText}>Skip (No PIN set)</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080b12', alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  logo: { fontSize: 56, marginBottom: 12 },
  title: { color: '#0057a8', fontSize: 30, fontWeight: 'bold' },
  sub: { color: '#888', fontSize: 15, marginTop: 6, marginBottom: 36 },
  dotsRow: { flexDirection: 'row', gap: 18, marginBottom: 12 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#0057a8', backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: '#0057a8', borderColor: '#0057a8' },
  error: { color: '#ff4444', fontSize: 14, height: 20 },
  errorPlaceholder: { height: 20 },
  keypad: { gap: 14, marginTop: 20 },
  keyRow: { flexDirection: 'row', gap: 16 },
  key: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#0e1220', alignItems: 'center', justifyContent: 'center' },
  keyText: { color: '#fff', fontSize: 30, fontWeight: '400' },
  keySpecial: { fontSize: 30 },
  keyDelete: { color: '#fff', fontSize: 26 },
  skipBtn: { marginTop: 32 },
  skipText: { color: '#555', fontSize: 14 },
});
