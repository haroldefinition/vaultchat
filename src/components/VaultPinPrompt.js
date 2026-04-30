// ============================================================
//  VaultPinPrompt — reusable modal for Vault PIN entry / setup
//
//  Used from:
//    - LockedChatsScreen (when the user taps a locked chat row
//      while the vault is locked — surfaces the unlock action
//      inline instead of bouncing them to long-press the Chats
//      title)
//    - VaultScreen protection banner (the lock button at the
//      right of the bottom banner — opens this when the vault
//      is locked, calls lockVault when it isn't)
//
//  The component handles BOTH unlock and first-time setup in one
//  place — when hasVaultPin is false we render a PIN + confirm
//  form right inside this prompt so the user never has to leave
//  to set up. On successful create, we call setVaultPin then
//  immediately mark the vault unlocked and fire onUnlocked.
// ============================================================

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../services/theme';
import { unlock as unlockVault, hasVaultPin, setVaultPin } from '../services/vault';

export default function VaultPinPrompt({ visible, onClose, onUnlocked }) {
  const { card, tx, sub, border, accent, inputBg } = useTheme();
  const [pin,     setPin]     = useState('');
  const [confirm, setConfirm] = useState('');
  const [error,   setError]   = useState('');
  const [hasPin,  setHasPin]  = useState(true); // assume true so we don't flash the setup form
  const [busy,    setBusy]    = useState(false);

  // Reset state every time the prompt opens, and check whether the
  // user has even set a PIN yet — drives whether we render the
  // unlock form or the setup form.
  useEffect(() => {
    if (!visible) return;
    setPin(''); setConfirm(''); setError(''); setBusy(false);
    hasVaultPin().then(setHasPin).catch(() => setHasPin(false));
  }, [visible]);

  async function submitUnlock() {
    setBusy(true);
    const ok = await unlockVault(pin);
    setBusy(false);
    if (ok) { setPin(''); setError(''); onUnlocked && onUnlocked(); }
    else    { setError('Wrong PIN'); setPin(''); }
  }

  async function submitSetup() {
    setError('');
    if (pin.length < 4) { setError('PIN must be at least 4 digits.'); return; }
    if (pin.length > 8) { setError('PIN can be at most 8 digits.'); return; }
    if (!/^\d+$/.test(pin)) { setError('PIN must be digits only.'); return; }
    if (pin !== confirm) { setError('PINs don’t match.'); return; }
    setBusy(true);
    try {
      const created = await setVaultPin(pin);
      if (!created) { setError('Could not save your PIN. Try again.'); setBusy(false); return; }
      // Auto-unlock with the PIN we just set so the user lands
      // exactly where they were trying to go.
      const unlocked = await unlockVault(pin);
      setBusy(false);
      setPin(''); setConfirm(''); setHasPin(true);
      if (unlocked) onUnlocked && onUnlocked();
      else          onClose    && onClose();
    } catch (e) {
      setError(e?.message || 'Could not save your PIN.'); setBusy(false);
    }
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
                style={[s.input, { color: tx, backgroundColor: inputBg, borderColor: border }]}
                value={pin}
                onChangeText={(t) => { setPin(t.replace(/\D/g, '').slice(0, 8)); setError(''); }}
                placeholder="••••"
                placeholderTextColor={sub}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
                autoFocus
                onSubmitEditing={submitUnlock}
              />
              {error ? (
                <Text style={[s.errorTx, { color: '#ff4444' }]}>{error}</Text>
              ) : null}
              <TouchableOpacity
                style={[s.btn, { borderTopColor: border, borderTopWidth: 1, opacity: busy ? 0.6 : 1 }]}
                disabled={busy}
                onPress={submitUnlock}>
                <Text style={[s.btnTx, { color: accent }]}>{busy ? 'Unlocking…' : 'Unlock'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btn} onPress={onClose} disabled={busy}>
                <Text style={[s.btnTx, { color: sub, fontWeight: '500' }]}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[s.title, { color: tx }]}>Set up Vault PIN</Text>
              <Text style={[s.body, { color: sub }]}>
                Choose a 4–8 digit PIN for your vault. You’ll use it to unlock chats you’ve moved here.
              </Text>
              <TextInput
                style={[s.input, { color: tx, backgroundColor: inputBg, borderColor: border, marginBottom: 8 }]}
                value={pin}
                onChangeText={(t) => { setPin(t.replace(/\D/g, '').slice(0, 8)); setError(''); }}
                placeholder="New PIN"
                placeholderTextColor={sub}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
                autoFocus
              />
              <TextInput
                style={[s.input, { color: tx, backgroundColor: inputBg, borderColor: border }]}
                value={confirm}
                onChangeText={(t) => { setConfirm(t.replace(/\D/g, '').slice(0, 8)); setError(''); }}
                placeholder="Confirm PIN"
                placeholderTextColor={sub}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
                onSubmitEditing={submitSetup}
              />
              {error ? (
                <Text style={[s.errorTx, { color: '#ff4444' }]}>{error}</Text>
              ) : null}
              <TouchableOpacity
                style={[s.btn, { borderTopColor: border, borderTopWidth: 1, opacity: busy ? 0.6 : 1 }]}
                disabled={busy}
                onPress={submitSetup}>
                <Text style={[s.btnTx, { color: accent }]}>{busy ? 'Saving…' : 'Create PIN'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btn} onPress={onClose} disabled={busy}>
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
  input:    {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 18, textAlign: 'center', letterSpacing: 8,
    marginHorizontal: 16, marginBottom: 8,
  },
  errorTx:  { textAlign: 'center', marginTop: 0, marginBottom: 8, fontSize: 13 },
  btn:      { paddingVertical: 14, alignItems: 'center' },
  btnTx:    { fontSize: 15, fontWeight: '700' },
});
