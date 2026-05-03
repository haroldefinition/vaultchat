import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, ScrollView, Image, Linking, Dimensions,
} from 'react-native';
import { supabase } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveHandle } from '../services/vaultHandle';
import { publishMyPublicKey } from '../services/keyExchange';
import { publishMyDeviceKey } from '../services/deviceKeys';
import { hasVaultPin, setVaultPin } from '../services/vault';

const LOGO    = require('../../assets/vaultchat-logo.png');
const SW      = Dimensions.get('window').width;
const BACKEND = 'https://vaultchat-production-3a96.up.railway.app';

// Fixed colours — Register is always light (matching the website)
// Palette restored to original light/Fiji-blue treatment per
// Harold (2026-04-30). The dark variant we briefly tried to match
// the dark WelcomeScreen was scrapped because the WelcomeScreen
// itself was removed from the logged-out flow — users land
// directly here, on the white "Welcome to VaultChat" form.
const C = {
  bg:          '#FFFFFF',
  blue:        '#1A7AE8',
  blueSoft:    '#EBF3FD',
  blueBorder:  '#BFDBFE',
  tx:          '#0F172A',
  sub:         '#64748B',
  border:      '#E2E8F0',
  inputBg:     '#F8FAFC',
  placeholder: '#94A3B8',
  toggleBg:    '#F1F5F9',
};

export default function RegisterScreen({ route, onLoginCallback }) {
  const onLogin = onLoginCallback || route?.params?.onLogin;

  const [method,  setMethod]  = useState('phone');  // 'phone' | 'email'
  const [phone,   setPhone]   = useState('');
  const [email,   setEmail]   = useState('');
  const [otp,     setOtp]     = useState('');
  const [handle,  setHandle]  = useState('');
  // identifier → otp → pin → handle
  // (pin step is skipped if hasVaultPin() returns true, which
  // is the case for users who already set up a PIN on this
  // install — including any existing user signing back in
  // after we've already migrated them through the PIN step.)
  const [step,    setStep]    = useState('identifier');
  const [loading, setLoading] = useState(false);
  const [userId,  setUserId]  = useState('');
  const [pin,         setPin]         = useState('');
  const [pinConfirm,  setPinConfirm]  = useState('');
  const [pinErr,      setPinErr]      = useState('');
  // Carry the existing-handle flag forward from the OTP step so
  // saveVaultPinAndContinue knows whether to advance to handle
  // creation or jump straight into the app.
  const [hasExistingHandle, setHasExistingHandle] = useState(false);

  // Which identifier is locked in for this attempt (stored so OTP/handle steps know)
  const [sentTo, setSentTo] = useState({ method: 'phone', value: '' });

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // ── Send OTP ──────────────────────────────────────────────────
  async function sendOTP() {
    if (method === 'phone') {
      if (phone.length < 10) {
        Alert.alert('Invalid Number', 'Enter a valid 10-digit phone number.');
        return;
      }
      setLoading(true);
      const fullPhone = `+1${phone}`;
      setSentTo({ method: 'phone', value: fullPhone });
      try {
        const res = await fetch(`${BACKEND}/send-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: fullPhone }),
        });
        const data = await res.json();
        if (data.success) { setLoading(false); setStep('otp'); return; }
      } catch {}
      try {
        const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone });
        if (!error) { setLoading(false); setStep('otp'); return; }
      } catch {}
      // Dev fallback — always moves forward
      setLoading(false);
      setStep('otp');
      return;
    }

    // Email path
    if (!emailValid) {
      Alert.alert('Invalid Email', 'Enter a valid email address.');
      return;
    }
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    setSentTo({ method: 'email', value: cleanEmail });
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: true },
      });
      if (!error) { setLoading(false); setStep('otp'); return; }
    } catch {}
    // Dev fallback — always moves forward so 123456 still lets you in
    setLoading(false);
    setStep('otp');
  }

  // Derive a sensible default handle from whichever identifier the user
  // signed up with — email local-part ('jvibesengineer@gmail.com' →
  // 'jvibesengineer') or 'user' + the last 4 phone digits. The handle
  // step shows this pre-filled so users can accept it with one tap, but
  // they're always free to edit before continuing.
  function suggestHandle() {
    if (sentTo?.method === 'phone') {
      const digits = (phone || '').replace(/\D/g, '');
      return `user${digits.slice(-4) || 'new'}`;
    }
    const srcEmail  = email || sentTo?.value || '';
    const localPart = srcEmail.split('@')[0] || '';
    const cleaned   = localPart.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return cleaned || 'user';
  }

  // ── Verify OTP ────────────────────────────────────────────────
  async function verifyOTP() {
    if (otp.length < 6) {
      Alert.alert('Enter the 6-digit code');
      return;
    }
    setLoading(true);

    // Phase ZZ-bugfix: dev shortcut REMOVED.
    // The old code accepted OTP=123456 and synthesized a fake user_id
    // ('550e8400-e29b-41d4-a716-<seed>') without calling Supabase's
    // verifyOtp. Result: no real auth session, no JWT, every RLS-gated
    // call (publish_public_key upsert, message inserts, etc.) silently
    // failed. To accept OTP=123456 in dev, configure Supabase →
    // Authentication → Phone → Test Phone Numbers. The real verifyOtp
    // call below now handles whitelisted test numbers cleanly AND
    // establishes a real Supabase auth session that JWT-gated paths
    // can rely on.

    // Real Supabase OTP verification — branches on method
    try {
      const verifyArgs = sentTo.method === 'phone'
        ? { phone: sentTo.value, token: otp, type: 'sms' }
        : { email: sentTo.value, token: otp, type: 'email' };

      const { data, error } = await supabase.auth.verifyOtp(verifyArgs);
      if (!error && data?.user) {
        setUserId(data.user.id);
        // Persist the auth pointer first — same shape as before.
        // Whether we advance to PIN, handle, or straight into the
        // app, this row needs to exist for subsequent screens to
        // know who's signed in.
        await AsyncStorage.setItem(
          'vaultchat_user',
          JSON.stringify(
            sentTo.method === 'phone'
              ? { phone: sentTo.value, id: data.user.id }
              : { email: sentTo.value, id: data.user.id }
          )
        );
        // Fetch the existing profile row (if any) and rehydrate the
        // device-local cache. Two bugs lived here pre-2026-05-03:
        //   (1) we queried `handle` — a column that doesn't exist on
        //       profiles (the actual column is `vault_handle`), so
        //       `handleAlreadySet` was *always* false for every user;
        //   (2) even if it had been correct, we never wrote the
        //       existing handle / display_name back to AsyncStorage
        //       on a returning-user sign-in. After uninstall (which
        //       wipes AsyncStorage on Android), Edit Profile, the
        //       Settings handle field, and chat headers all rendered
        //       blank — *and* SettingsScreen's "no local handle, but
        //       I do have a display_name" fallback would generate a
        //       random new @handle and overwrite the user's original
        //       vault_handle in Supabase, freeing it up to be claimed
        //       by another user. Catastrophic identity-loss vector
        //       triggered just by opening Settings post-reinstall.
        // Hydrate aggressively here so every downstream screen sees
        // the right values from first paint.
        const { data: profile } = await supabase
          .from('profiles')
          .select('vault_handle, vault_id, display_name, avatar_url, bio')
          .eq('id', data.user.id)
          .maybeSingle();
        const existingHandle = profile?.vault_handle || profile?.vault_id || null;
        const handleAlreadySet = !!existingHandle;
        setHasExistingHandle(handleAlreadySet);

        if (handleAlreadySet) {
          // Mirror saveHandle()'s on-disk format: the handle key
          // includes the leading '@'; vault_id mirrors the same
          // value so SettingsScreen's identifier field doesn't drift.
          try { await AsyncStorage.setItem('vaultchat_handle',  `@${existingHandle.replace(/^@+/, '')}`); } catch {}
          try { await AsyncStorage.setItem('vaultchat_vault_id', `@${existingHandle.replace(/^@+/, '')}`); } catch {}
        }
        if (profile?.display_name) {
          try { await AsyncStorage.setItem('vaultchat_display_name', profile.display_name); } catch {}
        }
        if (profile?.avatar_url) {
          try { await AsyncStorage.setItem('vaultchat_profile_photo', profile.avatar_url); } catch {}
        }
        if (profile?.bio) {
          try { await AsyncStorage.setItem('vaultchat_bio', profile.bio); } catch {}
        }

        // If a Vault PIN is already set on this install, skip the
        // PIN step. (This covers returning users who already went
        // through PIN setup on a prior login.)
        const pinAlreadySet = await hasVaultPin().catch(() => false);
        if (pinAlreadySet) {
          if (handleAlreadySet) {
            setLoading(false);
            onLogin?.();
            return;
          }
          setLoading(false);
          setHandle(prev => prev || suggestHandle());
          setStep('handle');
          return;
        }

        // No PIN yet — every user must set one before continuing.
        // The PIN doubles as the encryption key for the cloud
        // chat history backup (services/historyBackup.js), so
        // making it a required step right after verification means
        // backup runs automatically from day one.
        setLoading(false);
        setPin(''); setPinConfirm(''); setPinErr('');
        setStep('pin');
        return;
      }
    } catch {}
    setLoading(false);
    Alert.alert('Invalid Code', 'The code didn\'t match. Double-check the SMS we sent and try again.');
  }

  // ── Save Vault PIN & advance ──────────────────────────────────
  // Called from the PIN step. Validates exactly-4 digits + match,
  // persists via setVaultPin (which wires both the secure-store
  // entry AND the hasVaultPin() flag), then routes to either the
  // handle step (new user) or straight into the app (existing
  // account that just needed PIN migration).
  async function saveVaultPinAndContinue() {
    setPinErr('');
    if (!/^\d{4}$/.test(pin)) {
      setPinErr('Enter a 4-digit PIN.');
      return;
    }
    if (pin !== pinConfirm) {
      setPinErr('PINs don\'t match.');
      return;
    }
    setLoading(true);
    try {
      await setVaultPin(pin);
    } catch (e) {
      setLoading(false);
      setPinErr(e?.message || 'Couldn\'t save PIN. Try again.');
      return;
    }
    setLoading(false);
    if (hasExistingHandle) {
      onLogin?.();
      return;
    }
    setHandle(prev => prev || suggestHandle());
    setStep('handle');
  }

  // ── Save handle & enter app ───────────────────────────────────
  async function saveHandleAndLogin() {
    const clean = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (clean.length < 3) {
      Alert.alert('Too short', 'At least 3 characters required.');
      return;
    }
    setLoading(true);
    try {
      const body = sentTo.method === 'phone'
        ? { user_id: userId, handle: `@${clean}`, phone: sentTo.value }
        : { user_id: userId, handle: `@${clean}`, email: sentTo.value };
      await fetch(`${BACKEND}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await saveHandle(`@${clean}`);
      await AsyncStorage.setItem('vaultchat_display_name', clean);
      // Publish this device's NaCl public key so peers can encrypt to us.
      // Best-effort — never blocks login.
      publishMyPublicKey(userId).catch(() => {});
      // Bug fix #131 follow-up: also publish the per-device key
      // (multi-device E2E support — services/deviceKeys.js). Previously
      // device keys only got published when the user opened a chat,
      // which meant a fresh install + sign-in had ZERO published device
      // keys until they tapped into a conversation. Peers messaging the
      // new install would encrypt to the OLD device's public key
      // (still cached server-side), and the new install couldn't
      // decrypt — silent message drop after the blanket-hide filter.
      // Calling publishMyDeviceKey here ensures the new device is
      // discoverable the moment sign-in completes.
      const myPhone = sentTo.method === 'phone' ? sentTo.value : null;
      publishMyDeviceKey(userId, myPhone).catch(() => {});
    } catch {}
    setLoading(false);
    onLogin?.();
  }

  async function skipHandle() {
    // Derive a default handle from whichever identifier the user used
    const tail = sentTo.method === 'phone'
      ? phone.slice(-4)
      : (email.split('@')[0] || 'user').replace(/[^a-z0-9]/gi, '').slice(-6) || 'user';
    const auto = `@user${tail}`;
    await saveHandle(auto);
    await AsyncStorage.setItem('vaultchat_display_name', `user${tail}`);
    onLogin?.();
  }

  // ── Shared logo block ─────────────────────────────────────────
  const LogoBlock = (
    <View style={s.logoContainer}>
      <Image source={LOGO} style={s.logo} resizeMode="contain" />
    </View>
  );

  // ── Method toggle (Phone | Email) ─────────────────────────────
  const MethodToggle = (
    <View style={s.toggleRow}>
      <TouchableOpacity
        style={[s.toggleBtn, method === 'phone' && s.toggleBtnActive]}
        onPress={() => setMethod('phone')}
        activeOpacity={0.8}>
        <Text style={[s.toggleTx, method === 'phone' && s.toggleTxActive]}>📱  Phone</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.toggleBtn, method === 'email' && s.toggleBtnActive]}
        onPress={() => setMethod('email')}
        activeOpacity={0.8}>
        <Text style={[s.toggleTx, method === 'email' && s.toggleTxActive]}>✉️  Email</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}>
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        {/* ── IDENTIFIER STEP (phone or email) ──────────────── */}
        {step === 'identifier' && (
          <View style={s.content}>
            {LogoBlock}

            <Text style={s.heading}>Welcome to VaultChat</Text>
            <Text style={s.subheading}>
              {method === 'phone'
                ? 'Enter your number to get started'
                : 'Enter your email to get started'}
            </Text>

            {/* Slogan */}
            <View style={s.sloganBox}>
              <Text style={s.sloganText}>
                Stay connected and secured—{'\n'}no matter how far out you are.
              </Text>
            </View>

            {MethodToggle}

            {/* Input — phone or email */}
            {method === 'phone' ? (
              <View key="phone-input-row" style={s.inputBox}>
                <Text style={s.flagCode}>🇺🇸  +1</Text>
                <View style={s.divider} />
                <TextInput
                  key="phone-input"
                  style={s.textInput}
                  placeholder="(000) 000-0000"
                  placeholderTextColor={C.placeholder}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={v => setPhone(v.replace(/\D/g, '').slice(0, 10))}
                  maxLength={10}
                  autoFocus={false}
                />
              </View>
            ) : (
              <View key="email-input-row" style={s.inputBox}>
                <Text style={s.flagCode}>✉️</Text>
                <View style={s.divider} />
                <TextInput
                  key="email-input"
                  style={s.textInput}
                  placeholder="you@example.com"
                  placeholderTextColor={C.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  textContentType="none"
                  importantForAutofill="no"
                  spellCheck={false}
                  value={email}
                  onChangeText={setEmail}
                  autoFocus={false}
                />
              </View>
            )}

            {/* Legal — scoped to actual SMS use (account verification + security alerts) */}
            <Text style={s.legal}>
              {method === 'phone' ? (
                <>
                  By providing your phone number, you consent to receive SMS messages
                  from VaultChat (operated by AUXXILUS MEDIA LLC) for account
                  verification and account security alerts. Consent is not required
                  to create or use your account — you may use Email instead. Msg & data
                  rates may apply. Msg frequency varies. Reply HELP for help or STOP
                  to cancel. View our{' '}
                </>
              ) : (
                <>
                  By continuing, you agree to our{' '}
                </>
              )}
              <Text
                style={s.legalLink}
                onPress={() => Linking.openURL('https://vaultchat.co/privacy')}>
                Privacy Policy
              </Text>
              {' '}and{' '}
              <Text
                style={s.legalLink}
                onPress={() => Linking.openURL('https://vaultchat.co/terms')}>
                Terms of Service
              </Text>
              .
            </Text>

            {/* Button */}
            <TouchableOpacity
              style={[
                s.btn,
                ((method === 'phone' && phone.length < 10) ||
                 (method === 'email' && !emailValid)) && s.btnOff,
              ]}
              onPress={sendOTP}
              disabled={
                loading ||
                (method === 'phone' && phone.length < 10) ||
                (method === 'email' && !emailValid)
              }>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnTx}>Send Code →</Text>}
            </TouchableOpacity>

            <Text style={s.badge}>
              🔒 End-to-end encrypted · Metadata private · No ads
            </Text>
          </View>
        )}

        {/* ── OTP STEP ──────────────────────────────────────── */}
        {step === 'otp' && (
          <View style={s.content}>
            {LogoBlock}

            <Text style={s.heading}>
              {sentTo.method === 'phone' ? 'Verify Your Number' : 'Verify Your Email'}
            </Text>
            <Text style={s.subheading}>
              Code sent to {sentTo.value}
            </Text>

            <TextInput
              style={s.otpInput}
              placeholder="123456"
              placeholderTextColor={C.placeholder}
              keyboardType="number-pad"
              value={otp}
              onChangeText={setOtp}
              maxLength={6}
              autoFocus
              textAlign="center"
            />

            <TouchableOpacity
              style={[s.btn, otp.length < 6 && s.btnOff]}
              onPress={verifyOTP}
              disabled={loading || otp.length < 6}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnTx}>Verify →</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={s.backBtn}
              onPress={() => { setStep('identifier'); setOtp(''); }}>
              <Text style={s.backTx}>
                ← {sentTo.method === 'phone' ? 'Change number' : 'Change email'}
              </Text>
            </TouchableOpacity>

            <Text style={s.badge}>
              🔒 End-to-end encrypted · Metadata private · No ads
            </Text>
          </View>
        )}

        {/* ── PIN STEP ───────────────────────────────────────
            Required 4-digit Vault PIN. Inserted between OTP
            verification and @handle creation per Harold's product
            call (2026-04-30): "users will forget about backups so
            that has to be done automatically." Setting the PIN at
            registration means the cloud history backup
            (services/historyBackup.js) has an encryption key from
            day one and runs silently in the background. */}
        {step === 'pin' && (
          <View style={s.content}>
            {LogoBlock}

            <Text style={s.heading}>Set Up Your Vault PIN</Text>
            <Text style={s.subheading}>
              Encrypts your chats so only you can read them — and lets you back them up to the cloud safely.
            </Text>

            <View style={s.inputBox}>
              <TextInput
                style={[s.textInput, { textAlign: 'center', letterSpacing: 8, fontSize: 22, paddingLeft: 0 }]}
                placeholder="4-digit PIN"
                placeholderTextColor={C.placeholder}
                value={pin}
                onChangeText={t => setPin((t || '').replace(/\D/g, '').slice(0, 4))}
                maxLength={4}
                keyboardType="number-pad"
                secureTextEntry
                autoFocus
              />
            </View>

            <View style={[s.inputBox, { marginTop: 12 }]}>
              <TextInput
                style={[s.textInput, { textAlign: 'center', letterSpacing: 8, fontSize: 22, paddingLeft: 0 }]}
                placeholder="Confirm PIN"
                placeholderTextColor={C.placeholder}
                value={pinConfirm}
                onChangeText={t => setPinConfirm((t || '').replace(/\D/g, '').slice(0, 4))}
                maxLength={4}
                keyboardType="number-pad"
                secureTextEntry
              />
            </View>

            {!!pinErr && (
              <Text style={[s.hint, { color: '#DC2626', marginTop: 10 }]}>{pinErr}</Text>
            )}

            <Text style={s.hint}>
              Pick something you'll remember — you'll need it to restore your chat history on a new device. We never see your PIN.
            </Text>

            <TouchableOpacity
              style={[s.btn, (pin.length < 4 || pinConfirm.length < 4) && s.btnOff]}
              onPress={saveVaultPinAndContinue}
              disabled={loading || pin.length < 4 || pinConfirm.length < 4}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnTx}>Continue →</Text>}
            </TouchableOpacity>

            <Text style={s.badge}>
              🔒 PIN-derived key encrypts your backup · Server can't read it
            </Text>
          </View>
        )}

        {/* ── HANDLE STEP ───────────────────────────────────── */}
        {step === 'handle' && (
          <View style={s.content}>
            {LogoBlock}

            <Text style={s.heading}>Create Your Identity</Text>
            <Text style={s.subheading}>
              {sentTo.method === 'phone'
                ? 'Your handle keeps your number private'
                : 'Your handle keeps your email private'}
            </Text>

            <View style={s.inputBox}>
              <Text style={s.flagCode}>@</Text>
              <View style={s.divider} />
              <TextInput
                style={s.textInput}
                placeholder="yourhandle"
                placeholderTextColor={C.placeholder}
                value={handle}
                onChangeText={t => setHandle(t.replace(/[^a-zA-Z0-9_]/g, ''))}
                maxLength={20}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
            </View>

            {handle.length > 0 && (
              <Text style={s.handlePreview}>@{handle.toLowerCase()}</Text>
            )}

            <Text style={s.hint}>
              3–20 characters · Letters, numbers & underscores{'\n'}
              Your {sentTo.method === 'phone' ? 'phone number' : 'email address'} stays private
            </Text>

            <TouchableOpacity
              style={[s.btn, handle.length < 3 && s.btnOff]}
              onPress={saveHandleAndLogin}
              disabled={loading || handle.length < 3}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnTx}>Create Handle →</Text>}
            </TouchableOpacity>

            {/* "Skip for now" was removed — every user must pick their
                own @handle at signup so it's the same on iPhone and
                Android, drives contact discovery (other users find them
                by typing @handle), and keeps the Vault ID = @handle
                invariant. Auto-suffixed handles like @user1234 made
                the system feel sloppy and produced duplicate handles
                via collision-resolution. */}

            <Text style={s.badge}>
              🔒 End-to-end encrypted · Metadata private · No ads
            </Text>
          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg },
  scroll:         { flexGrow: 1 },
  content:        { alignItems: 'center', paddingHorizontal: 24 },

  // Logo — dark rounded container hides the PNG's black background
  logoContainer:  {
    width: SW * 0.75,
    height: SW * 0.75 * 1.4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -12,
  },
  logo:           { width: SW * 0.75, height: SW * 0.75 * 1.4 },

  // Headings
  heading:        { fontSize: 26, fontWeight: '800', color: C.tx, textAlign: 'center', marginBottom: 4 },
  subheading:     { fontSize: 15, color: C.sub, textAlign: 'center', marginBottom: 22 },

  // Slogan box
  sloganBox:      { width: '100%', backgroundColor: C.blueSoft, borderColor: C.blueBorder, borderWidth: 1, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 22, marginBottom: 18 },
  sloganText:     { fontSize: 15, color: C.blue, textAlign: 'center', lineHeight: 24, fontStyle: 'italic', fontWeight: '600' },

  // Phone/Email toggle
  toggleRow:      { flexDirection: 'row', backgroundColor: C.toggleBg, borderRadius: 14, padding: 4, width: '100%', marginBottom: 14 },
  toggleBtn:      { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 10 },
  toggleBtnActive:{ backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  toggleTx:       { fontSize: 14, fontWeight: '700', color: C.sub },
  toggleTxActive: { color: C.blue },

  // Input row
  inputBox:       { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderColor: C.border, borderWidth: 1.5, borderRadius: 16, height: 58, marginBottom: 14, overflow: 'hidden' },
  flagCode:       { paddingHorizontal: 14, fontSize: 15, fontWeight: '700', color: C.blue },
  divider:        { width: 1, height: 28, backgroundColor: C.border },
  textInput:      { flex: 1, paddingHorizontal: 14, fontSize: 16, color: C.tx, height: 58 },

  // OTP
  otpInput:       { width: '100%', height: 68, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.inputBg, fontSize: 36, fontWeight: '700', letterSpacing: 14, color: C.tx, marginBottom: 18 },

  // Legal
  legal:          { fontSize: 12, color: C.sub, lineHeight: 19, textAlign: 'left', width: '100%', marginBottom: 22 },
  legalLink:      { color: C.blue, textDecorationLine: 'underline' },

  // Button
  btn:            { width: '100%', height: 56, borderRadius: 28, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  btnOff:         { opacity: 0.4 },
  btnTx:          { color: '#fff', fontWeight: '700', fontSize: 17 },

  // Handle
  handlePreview:  { fontSize: 22, fontWeight: '800', color: C.blue, marginBottom: 8 },
  hint:           { fontSize: 12, color: C.sub, lineHeight: 20, textAlign: 'center', marginBottom: 18 },

  // Back
  backBtn:        { alignItems: 'center', paddingVertical: 10 },
  backTx:         { fontSize: 14, color: C.sub },

  // Badge
  badge:          { fontSize: 12, color: C.sub, textAlign: 'center', marginTop: 12 },
});
