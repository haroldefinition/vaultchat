// ============================================================
//  VaultPinSetupModal — first-run Vault PIN setup
//
//  Pops on the user's first visit to the Vault when they're
//  premium and haven't set a Vault PIN yet. Two inputs (PIN +
//  confirm) + "Create PIN" button. On success, persists via
//  vault.setVaultPin and sets a "seen" flag so this modal never
//  reappears (next visit just opens the Vault normally).
//
//  Why a separate component (vs. extending VaultPinPrompt):
//  the unlock prompt and the setup prompt have meaningfully
//  different copy + needs (no confirm field on unlock, no
//  "Open Settings" CTA on setup, etc.). Keeping them separate
//  keeps each one small.
// ============================================================

import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useTheme } from '../services/theme';
import { setVaultPin } from '../services/vault';

export default function VaultPinSetupModal({ visible, onClose, onCreated }) {
  const { card, tx, sub, border, accent, inputBg } = useTheme();
  const [pin,     setPin]     = useState('');
  const [confirm, setConfirm] = useState('');
  const [error,   setError]   = useState('');
  const [busy,    setBusy]    = useState(false);

  function reset() { setPin(''); setConfirm(''); setError(''); setBusy(false); }

  async function submit() {
    setError('');
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits.');
      return;
    }
    if (pin.length > 8) {
      setError('PIN can be at most 8 digits.');
      return;
    }
    if (!/^\d+$/.test(pin)) {
      setError('PIN must be digits only.');
      return;
    }
    if (pin !== confirm) {
      setError('PINs don’t match.');
      return;
    }
    setBusy(true);
    try {
      const ok = await setVaultPin(pin);
      if (!ok) {
        setError('Could not save your PIN. Please try again.');
        setBusy(false);
        return;
      }
      reset();
      onCreated && onCreated();
    } catch (e) {
      setError(e?.message || 'Could not save your PIN.');
      setBusy(false);
    }
  }

  function handleSkip() {
    Alert.alert(
      'Skip Vault setup?',
      'You can come back to set up a Vault PIN any time from Settings → Vault PIN.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Skip', onPress: () => { reset(); onClose && onClose(); } },
      ]
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleSkip}>
      <View style={s.overlay}>
        <View style={[s.box, { backgroundColor: card, borderColor: border }]}>
          <View style={[s.iconCircle, { backgroundColor: accent + '22' }]}>
            <Text style={{ fontSize: 28 }}>🔒</Text>
          </View>

          <Text style={[s.title, { color: tx }]}>Set up your Vault</Text>
          <Text style={[s.body,  { color: sub }]}>
            Choose a 4–8 digit PIN. You’ll use it to unlock chats you’ve moved into the vault. Keep it private — without it, vaulted chats stay hidden.
          </Text>

          <Text style={[s.label, { color: sub }]}>NEW PIN</Text>
          <TextInput
            style={[s.pinInput, { color: tx, backgroundColor: inputBg, borderColor: border }]}
            value={pin}
            onChangeText={(t) => { setPin(t.replace(/\D/g, '').slice(0, 8)); setError(''); }}
            placeholder="••••"
            placeholderTextColor={sub}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            autoFocus
          />

          <Text style={[s.label, { color: sub, marginTop: 12 }]}>CONFIRM PIN</Text>
          <TextInput
            style={[s.pinInput, { color: tx, backgroundColor: inputBg, borderColor: border }]}
            value={confirm}
            onChangeText={(t) => { setConfirm(t.replace(/\D/g, '').slice(0, 8)); setError(''); }}
            placeholder="••••"
            placeholderTextColor={sub}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            onSubmitEditing={submit}
          />

          {error ? (
            <Text style={[s.error, { color: '#ff4444' }]}>{error}</Text>
          ) : null}

          <TouchableOpacity
            style={[s.primaryBtn, { backgroundColor: accent, opacity: busy ? 0.6 : 1 }]}
            disabled={busy}
            onPress={submit}>
            <Text style={s.primaryBtnTx}>{busy ? 'Saving…' : 'Create PIN'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.secondaryBtn} onPress={handleSkip} disabled={busy}>
            <Text style={[s.secondaryBtnTx, { color: sub }]}>Set up later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  box:       { width: '100%', maxWidth: 380, borderRadius: 18, borderWidth: 1, padding: 22 },
  iconCircle:{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14 },
  title:     { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  body:      { fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 18 },
  label:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  pinInput:  { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, textAlign: 'center', letterSpacing: 8 },
  error:     { fontSize: 13, textAlign: 'center', marginTop: 12 },
  primaryBtn:{ marginTop: 18, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  primaryBtnTx:{ color: '#fff', fontSize: 15, fontWeight: '800' },
  secondaryBtn:{ paddingVertical: 12, alignItems: 'center', marginTop: 2 },
  secondaryBtnTx:{ fontSize: 13, fontWeight: '600' },
});
