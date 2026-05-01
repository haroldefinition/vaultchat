// ============================================================
//  HistoryRestorePrompt — first-run "We found your chat backup"
//
//  Phase 2 of the 90-day-history feature.
//
//  Renders a modal on the first foreground after sign-in IF:
//    - The user is signed in
//    - We haven't already offered restore on this install
//      (gate via AsyncStorage `vaultchat_history_restore_offered_v1`)
//    - There's a row in message_history_blob for this user
//
//  UX: PIN input → tap Restore → progress label → success or
//  error. "Not now" dismisses but keeps the offer alive (we only
//  flip the offered flag after the user actually acts so a sign-
//  out + sign-in still re-presents on a different account).
//
//  Mounted in App.js next to the PremiumUpgradeSplash. Both rely
//  on a tiny listener hook so the modal lives outside the main
//  screen graph.
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchHistoryBackupMeta, runHistoryRestore } from '../services/historyBackup';

const OFFERED_KEY = 'vaultchat_history_restore_offered_v1';

const PURPLE = '#7C3AED';
const GOLD   = '#F5C518';

export default function HistoryRestorePrompt() {
  const [visible, setVisible] = useState(false);
  const [meta, setMeta]       = useState(null);
  const [pin, setPin]         = useState('');
  const [busy, setBusy]       = useState(false);

  // One-shot probe: on mount, see if a backup exists and we
  // haven't already offered to restore it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const offered = await AsyncStorage.getItem(OFFERED_KEY);
        if (offered === '1') return;
        const m = await fetchHistoryBackupMeta();
        if (cancelled) return;
        if (m?.ok && m.exists) {
          setMeta(m);
          setVisible(true);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const dismiss = useCallback((markOffered) => {
    setVisible(false);
    if (markOffered) {
      AsyncStorage.setItem(OFFERED_KEY, '1').catch(() => {});
    }
  }, []);

  const onRestore = useCallback(async () => {
    if (!pin) return;
    setBusy(true);
    try {
      const r = await runHistoryRestore(pin);
      setBusy(false);
      if (r.ok) {
        await AsyncStorage.setItem(OFFERED_KEY, '1').catch(() => {});
        Alert.alert(
          'Restored',
          `${r.restored || 0} message${r.restored === 1 ? '' : 's'} merged into this device. Open a chat to see your history.`,
        );
        setVisible(false);
      } else if (r.code === 'WRONG_PIN') {
        Alert.alert('Wrong PIN', 'That PIN didn\'t decrypt the backup. Try again or skip for now.');
      } else if (r.code === 'NO_BACKUP') {
        // Race: backup deleted between the meta check and now. Mark
        // offered so we don't keep prompting.
        await AsyncStorage.setItem(OFFERED_KEY, '1').catch(() => {});
        setVisible(false);
      } else {
        Alert.alert('Restore failed', r.message || 'Try again from Settings → Restore Chats from Cloud.');
      }
    } catch (e) {
      setBusy(false);
      Alert.alert('Error', e?.message || 'Something went wrong.');
    }
  }, [pin]);

  if (!visible) return null;

  // Format updated_at for the body copy. Keeps the user oriented
  // about how recent the backup is.
  let when = '';
  if (meta?.updatedAt) {
    try {
      const d = new Date(meta.updatedAt);
      const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
      when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
    } catch {}
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => dismiss(false)}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.icon}>☁️</Text>
          <Text style={s.title}>We found your chat backup</Text>
          <Text style={s.body}>
            Your VaultChat account has an encrypted backup of your last 90 days of chats
            {when ? ` (last updated ${when})` : ''}. Enter your Vault PIN to restore your history on this device.
          </Text>

          <TextInput
            value={pin}
            onChangeText={setPin}
            placeholder="Vault PIN"
            placeholderTextColor="#888"
            secureTextEntry
            keyboardType="number-pad"
            maxLength={12}
            autoFocus
            editable={!busy}
            style={s.input}
          />

          <TouchableOpacity
            style={[s.primary, { opacity: pin && !busy ? 1 : 0.55 }]}
            disabled={!pin || busy}
            onPress={onRestore}
            activeOpacity={0.85}
          >
            {busy
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.primaryTx}>Restore my chats</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => dismiss(true)} disabled={busy} style={s.secondary}>
            <Text style={s.secondaryTx}>Not now</Text>
          </TouchableOpacity>

          <Text style={s.fineprint}>
            We never see your PIN or messages. The backup is end-to-end encrypted —
            forgetting your PIN means the backup can{'’'}t be recovered.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#0f0f1a',
    borderRadius: 22, padding: 26, width: '100%',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.35)',
  },
  icon:    { fontSize: 38, textAlign: 'center', marginBottom: 8 },
  title:   { color: '#fff', fontSize: 19, fontWeight: '900', textAlign: 'center', marginBottom: 8, letterSpacing: 0.2 },
  body:    { color: 'rgba(255,255,255,0.72)', fontSize: 13.5, lineHeight: 19, textAlign: 'center', marginBottom: 18 },
  input:   {
    backgroundColor: '#1a1a2e', color: '#fff',
    borderColor: '#2a2a4a', borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 18,
    textAlign: 'center', letterSpacing: 4, marginBottom: 14,
  },
  primary: {
    backgroundColor: PURPLE, paddingVertical: 14,
    borderRadius: 14, alignItems: 'center', marginBottom: 6,
    shadowColor: PURPLE, shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 14,
    elevation: 4,
  },
  primaryTx: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },
  secondary: { alignItems: 'center', paddingVertical: 12, marginTop: 2 },
  secondaryTx: { color: 'rgba(255,255,255,0.55)', fontSize: 14 },
  fineprint: {
    color: 'rgba(255,255,255,0.4)', fontSize: 11.5, textAlign: 'center',
    marginTop: 14, lineHeight: 16,
  },
});
