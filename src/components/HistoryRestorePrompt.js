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

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { fetchHistoryBackupMeta, runHistoryRestore } from '../services/historyBackup';

const OFFERED_KEY = 'vaultchat_history_restore_offered_v1';

const PURPLE = '#7C3AED';
const GOLD   = '#F5C518';

export default function HistoryRestorePrompt() {
  const [visible, setVisible] = useState(false);
  const [meta, setMeta]       = useState(null);
  const [pin, setPin]         = useState('');
  const [busy, setBusy]       = useState(false);
  // 0..100 progress during PBKDF2 derivation. null when idle.
  const [progress, setProgress] = useState(null);
  // Cancellation token shared with runHistoryRestore. Mutating
  // .cancelled flips the flag the yieldy PBKDF2 checks between
  // chunks (no effect on the native fast path which is too quick
  // to need cancelling). Ref so the captured callback sees fresh
  // values without re-renders.
  const cancelRef = useRef({ cancelled: false });

  // Run the backup probe whenever the user's auth state changes
  // to "signed in". On a cold app start during registration the
  // user isn't signed in yet — we'd run the check too early and
  // fetchHistoryBackupMeta would return NOT_SIGNED_IN. Listening
  // to onAuthStateChange means we re-run after OTP verification
  // even if the prompt mounted before sign-in completed.
  useEffect(() => {
    let cancelled = false;

    async function probe() {
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
    }

    // Initial probe (covers the case where the user is already
    // signed in when the app cold-starts).
    probe();

    // Re-probe whenever auth flips. SIGNED_IN is the event we
    // want; ignore SIGNED_OUT / TOKEN_REFRESHED.
    let sub;
    try {
      const r = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN') probe();
      });
      sub = r?.data?.subscription || r?.subscription || null;
    } catch {}

    return () => {
      cancelled = true;
      try { sub?.unsubscribe?.(); } catch {}
    };
  }, []);

  const dismiss = useCallback((markOffered) => {
    setVisible(false);
    if (markOffered) {
      AsyncStorage.setItem(OFFERED_KEY, '1').catch(() => {});
    }
  }, []);

  const onRestore = useCallback(async () => {
    if (!pin) return;
    cancelRef.current = { cancelled: false };
    setProgress(0);
    setBusy(true);
    try {
      const r = await runHistoryRestore(pin, {
        onProgress: pct => setProgress(pct),
        isCancelled: () => cancelRef.current.cancelled,
      });
      setProgress(null);
      setBusy(false);
      if (r.code === 'CANCELLED') {
        // User aborted — stay in the modal so they can try again.
        return;
      }
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
      setProgress(null);
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
          <Text style={s.title}>Restore your chat history?</Text>
          <Text style={s.body}>
            We found an encrypted backup of your previous chats
            {when ? ` (last updated ${when})` : ''}. Enter your Vault PIN to restore them on this device.
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

          {/* Primary CTA — Restore. Full-width purple. */}
          <TouchableOpacity
            style={[s.primary, { opacity: pin && !busy ? 1 : 0.55 }]}
            disabled={!pin || busy}
            onPress={onRestore}
            activeOpacity={0.85}
          >
            {busy
              ? (
                  <View style={s.primaryBusy}>
                    <ActivityIndicator color="#fff" />
                    <Text style={s.primaryTx}>
                      {`Decrypting…${progress != null ? ' ' + progress + '%' : ''}`}
                    </Text>
                  </View>
                )
              : <Text style={s.primaryTx}>Restore</Text>}
          </TouchableOpacity>

          {/* Progress bar — only while busy. Determinate fill from
              the PBKDF2 onProgress callback. The native fast path
              completes too quickly to render visible progress; the
              JS fallback (Simulator quirk, missing native module)
              ticks 0 → 99 over ~10s so the user sees movement. */}
          {busy && progress != null && (
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progress}%` }]} />
            </View>
          )}

          {/* While busy: the secondary becomes a Stop affordance that
              cancels PBKDF2 in flight (modal stays open so user can
              retry without retyping PIN). When idle: a prominent
              "Skip — start fresh" gray button (1.0.17 polish — was
              previously a small "Not now" link, easy to miss, leading
              to the prompt re-presenting on subsequent sessions). */}
          {busy ? (
            <TouchableOpacity
              onPress={() => { cancelRef.current.cancelled = true; }}
              style={s.tertiary}
            >
              <Text style={s.tertiaryTx}>Stop</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => dismiss(true)}
                style={s.secondary}
                activeOpacity={0.85}
              >
                <Text style={s.secondaryTx}>Skip — start fresh</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => dismiss(false)}
                style={s.tertiary}
              >
                <Text style={s.tertiaryTx}>Not now</Text>
              </TouchableOpacity>
            </>
          )}

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
  primaryBusy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryTx: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },
  progressTrack: {
    marginTop: 10, height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: PURPLE },
  // 1.0.17: secondary is now a prominent gray button (was a small
  // link). Tapping it sets the offered flag so the prompt never re-
  // presents on this install. Visually de-emphasised vs the purple
  // primary but unmistakable as a real action.
  secondary: {
    backgroundColor: '#2a2a3e',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  secondaryTx: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
  // Tertiary = the small "Not now" / "Stop" link below the secondary.
  // Keeps the deferral option alive without shouting.
  tertiary:   { alignItems: 'center', paddingVertical: 10, marginTop: 2 },
  tertiaryTx: { color: 'rgba(255,255,255,0.45)', fontSize: 13 },
  fineprint: {
    color: 'rgba(255,255,255,0.4)', fontSize: 11.5, textAlign: 'center',
    marginTop: 14, lineHeight: 16,
  },
});
