// ============================================================
//  VaultPinPrompt — reusable modal that takes the user's Vault
//  PIN and unlocks the vault on success.
//
//  Used from:
//    - LockedChatsScreen (when the user taps a locked chat row
//      while the vault is locked — used to throw an Alert telling
//      them to long-press the Chats title; this surfaces the unlock
//      action inline instead)
//    - VaultScreen protection banner (the lock button at the right
//      of the bottom banner — opens this when the vault is locked,
//      calls lockVault when it isn't)
//
//  If the user hasn't set a Vault PIN yet (hasVaultPin → false),
//  the prompt offers a "Set up in Settings" CTA instead of asking
//  for an empty PIN. Routing to the Settings screen lets them set
//  one in the existing Vault PIN row, then come back.
// ============================================================

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../services/theme';
import { unlock as unlockVault, hasVaultPin } from '../services/vault';

export default function VaultPinPrompt({ visible, onClose, onUnlocked, onSetup }) {
  const { card, tx, sub, border, accent, inputBg } = useTheme();
  const [pin,    setPin]    = useState('');
  const [error,  setError]  = useState('');
  const [hasPin, setHasPin] = useState(true); // assume true so we don't flash the setup CTA

  // Reset state every time the prompt opens, and check whether the
  // user has even set a PIN yet — if not, we show a CTA instead.
  useEffect(() => {
    if (!visible) return;
    setPin(''); setError('');
    hasVaultPin().then(setHasPin).catch(() => setHasPin(false));
  }, [visible]);

  async function submit() {
    const ok = await unlockVault(pin);
    if (ok) { setPin(''); setError(''); onUnlocked && onUnlocked(); }
    else    { setError('Wrong PIN'); setPin(''); }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <View
          // Prevent backdrop tap-through from closing when tapping on
          // the actual sheet body.
          onStartShouldSetResponder={() => true}
          style={[s.box, { backgroundColor: card, borderColor: border }]}>
          {hasPin ? (
            <>
              <Text style={[s.title, { color: tx }]}>Enter Vault PIN</Text>
              <Text style={[s.body, { color: sub }]}>
                Enter your PIN to unlock the vault.
              </Text>
              <TextInput
                style={{
                  borderWidth: 1, borderColor: border, borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 10,
                  color: tx, backgroundColor: inputBg,
                  fontSize: 18, textAlign: 'center', letterSpacing: 8,
                  marginHorizontal: 16, marginBottom: 8,
                }}
                value={pin}
                onChangeText={(t) => { setPin(t); setError(''); }}
                placeholder="••••"
                placeholderTextColor={sub}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
                autoFocus
              />
              {error ? (
                <Text style={[s.errorTx, { color: '#ff4444' }]}>{error}</Text>
              ) : null}
              <TouchableOpacity
                style={[s.btn, { borderTopColor: border, borderTopWidth: 1 }]}
                onPress={submit}>
                <Text style={[s.btnTx, { color: accent }]}>Unlock</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btn} onPress={onClose}>
                <Text style={[s.btnTx, { color: sub, fontWeight: '500' }]}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[s.title, { color: tx }]}>Set up Vault PIN</Text>
              <Text style={[s.body, { color: sub }]}>
                Create a 4–8 digit PIN in Settings to lock and hide chats. Once set, you can unlock the vault from here.
              </Text>
              <TouchableOpacity
                style={[s.btn, { borderTopColor: border, borderTopWidth: 1 }]}
                onPress={() => { onClose && onClose(); onSetup && onSetup(); }}>
                <Text style={[s.btnTx, { color: accent }]}>Open Settings</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btn} onPress={onClose}>
                <Text style={[s.btnTx, { color: sub, fontWeight: '500' }]}>Not now</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  box:      { width: '100%', maxWidth: 360, borderRadius: 16, borderWidth: 1, paddingTop: 18, overflow: 'hidden' },
  title:    { fontSize: 17, fontWeight: '800', textAlign: 'center', paddingHorizontal: 16, marginBottom: 6 },
  body:     { fontSize: 13, textAlign: 'center', paddingHorizontal: 22, marginBottom: 14, lineHeight: 18 },
  errorTx:  { textAlign: 'center', marginTop: 0, marginBottom: 8, fontSize: 13 },
  btn:      { paddingVertical: 14, alignItems: 'center' },
  btnTx:    { fontSize: 15, fontWeight: '700' },
});
