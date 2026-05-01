// ============================================================
//  RequiredPinSetupGate — first-foreground PIN migration
//
//  Existing signed-in users (who never went through the new
//  RegisterScreen PIN step because they were already authenticated
//  when the feature shipped) get a non-dismissible modal asking
//  them to set a 4-digit Vault PIN before they can use the app.
//
//  Without this, returning users would never get a Vault PIN set,
//  which means cloud chat backup (services/historyBackup.js) would
//  silently no-op for them — exactly the "users will forget about
//  backups" failure mode this feature was built to prevent.
//
//  Gate logic (re-checks on Supabase auth SIGNED_IN):
//    1. supabase.auth.getUser() must return a real user
//    2. hasVaultPin() must return false
//
//  When both true → modal opens, blocks the app via a full-screen
//  Modal (no Cancel button, no backdrop dismiss). Once the user
//  sets a PIN, the gate disappears and the app proceeds normally.
//
//  Mounted in App.js next to PremiumUpgradeSplash and
//  HistoryRestorePrompt.
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from '../services/supabase';
import { hasVaultPin, setVaultPin } from '../services/vault';

const PURPLE = '#7C3AED';

export default function RequiredPinSetupGate() {
  const [needsPin, setNeedsPin] = useState(false);
  const [pin, setPin]           = useState('');
  const [confirm, setConfirm]   = useState('');
  const [err, setErr]           = useState('');
  const [busy, setBusy]         = useState(false);

  // Probe on mount + on every SIGNED_IN auth event.
  useEffect(() => {
    let cancelled = false;

    async function probe() {
      try {
        const { data: { user } = {} } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user?.id) {
          // Not signed in — gate doesn't apply.
          setNeedsPin(false);
          return;
        }
        const has = await hasVaultPin().catch(() => false);
        if (cancelled) return;
        setNeedsPin(!has);
      } catch {
        if (!cancelled) setNeedsPin(false);
      }
    }

    probe();

    let sub;
    try {
      const r = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') probe();
        if (event === 'SIGNED_OUT') setNeedsPin(false);
      });
      sub = r?.data?.subscription || r?.subscription || null;
    } catch {}

    return () => {
      cancelled = true;
      try { sub?.unsubscribe?.(); } catch {}
    };
  }, []);

  const onSave = useCallback(async () => {
    setErr('');
    if (!/^\d{4}$/.test(pin)) {
      setErr('Enter a 4-digit PIN.');
      return;
    }
    if (pin !== confirm) {
      setErr('PINs don\'t match.');
      return;
    }
    setBusy(true);
    try {
      await setVaultPin(pin);
      setBusy(false);
      setNeedsPin(false);
    } catch (e) {
      setBusy(false);
      setErr(e?.message || 'Couldn\'t save PIN. Try again.');
    }
  }, [pin, confirm]);

  if (!needsPin) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.icon}>🛡️</Text>
          <Text style={s.title}>Set Up Your Vault PIN</Text>
          <Text style={s.body}>
            VaultChat now backs up your chats automatically — encrypted with a PIN only you know. Set a 4-digit PIN to continue.
          </Text>

          <TextInput
            value={pin}
            onChangeText={t => setPin((t || '').replace(/\D/g, '').slice(0, 4))}
            placeholder="4-digit PIN"
            placeholderTextColor="#888"
            secureTextEntry
            keyboardType="number-pad"
            maxLength={4}
            autoFocus
            editable={!busy}
            style={s.input}
          />
          <TextInput
            value={confirm}
            onChangeText={t => setConfirm((t || '').replace(/\D/g, '').slice(0, 4))}
            placeholder="Confirm PIN"
            placeholderTextColor="#888"
            secureTextEntry
            keyboardType="number-pad"
            maxLength={4}
            editable={!busy}
            style={[s.input, { marginTop: 10 }]}
          />

          {!!err && <Text style={s.err}>{err}</Text>}

          <TouchableOpacity
            style={[s.primary, { opacity: pin.length === 4 && confirm.length === 4 && !busy ? 1 : 0.55 }]}
            disabled={pin.length < 4 || confirm.length < 4 || busy}
            onPress={onSave}
            activeOpacity={0.85}
          >
            {busy
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.primaryTx}>Set PIN & continue</Text>}
          </TouchableOpacity>

          <Text style={s.fineprint}>
            We never see your PIN. Forgetting it means your cloud backup can{'’'}t be recovered — pick something memorable.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#0f0f1a',
    borderRadius: 22, padding: 26, width: '100%',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)',
  },
  icon:   { fontSize: 38, textAlign: 'center', marginBottom: 8 },
  title:  { color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 8, letterSpacing: 0.2 },
  body:   { color: 'rgba(255,255,255,0.72)', fontSize: 13.5, lineHeight: 19, textAlign: 'center', marginBottom: 18 },
  input:  {
    backgroundColor: '#1a1a2e', color: '#fff',
    borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 22,
    textAlign: 'center', letterSpacing: 8,
  },
  err:    { color: '#FCA5A5', fontSize: 12.5, textAlign: 'center', marginTop: 10 },
  primary:{
    backgroundColor: PURPLE, paddingVertical: 14,
    borderRadius: 14, alignItems: 'center', marginTop: 18,
    shadowColor: PURPLE, shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 14,
    elevation: 4,
  },
  primaryTx: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },
  fineprint: {
    color: 'rgba(255,255,255,0.4)', fontSize: 11.5, textAlign: 'center',
    marginTop: 14, lineHeight: 16,
  },
});
