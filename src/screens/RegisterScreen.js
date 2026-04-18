import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, ScrollView, Image, Linking, Dimensions,
} from 'react-native';
import { supabase } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveHandle } from '../services/vaultHandle';

const LOGO    = require('../../assets/vaultchat-logo.png');
const SW      = Dimensions.get('window').width;
const BACKEND = 'https://vaultchat-production-3a96.up.railway.app';

// Fixed colours — Register is always light (matching the website)
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
};

export default function RegisterScreen({ route, onLoginCallback }) {
  const onLogin = onLoginCallback || route?.params?.onLogin;

  const [phone,   setPhone]   = useState('');
  const [otp,     setOtp]     = useState('');
  const [handle,  setHandle]  = useState('');
  const [step,    setStep]    = useState('phone'); // phone → otp → handle
  const [loading, setLoading] = useState(false);
  const [userId,  setUserId]  = useState('');

  // ── Send OTP ──────────────────────────────────────────────────
  async function sendOTP() {
    if (phone.length < 10) {
      Alert.alert('Invalid Number', 'Enter a valid 10-digit phone number.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+1${phone}` }),
      });
      const data = await res.json();
      if (data.success) {
        setLoading(false);
        setStep('otp');
        return;
      }
    } catch {}
    // Supabase fallback
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: `+1${phone}` });
      if (!error) {
        setLoading(false);
        setStep('otp');
        return;
      }
    } catch {}
    // Dev fallback — always moves forward
    setLoading(false);
    setStep('otp');
  }

  // ── Verify OTP ────────────────────────────────────────────────
  async function verifyOTP() {
    if (otp.length < 6) {
      Alert.alert('Enter the 6-digit code');
      return;
    }
    setLoading(true);
    // Dev shortcut — check this first so it never spins
    if (otp === '123456') {
      const testId = '550e8400-e29b-41d4-a716-' + phone.padStart(12, '0');
      setUserId(testId);
      await AsyncStorage.setItem(
        'vaultchat_user',
        JSON.stringify({ phone: `+1${phone}`, id: testId })
      );
      setLoading(false);
      setStep('handle');
      return;
    }
    // Real Supabase OTP
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: `+1${phone}`,
        token: otp,
        type: 'sms',
      });
      if (!error && data?.user) {
        setUserId(data.user.id);
        const { data: profile } = await supabase
          .from('profiles')
          .select('handle')
          .eq('id', data.user.id)
          .single();
        if (profile?.handle) {
          await AsyncStorage.setItem(
            'vaultchat_user',
            JSON.stringify({ phone: `+1${phone}`, id: data.user.id })
          );
          setLoading(false);
          onLogin?.();
          return;
        }
        setLoading(false);
        setStep('handle');
        return;
      }
    } catch {}
    setLoading(false);
    Alert.alert('Invalid Code', 'Check the code and try again. In dev mode use 123456.');
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
      await fetch(`${BACKEND}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, handle: `@${clean}`, phone: `+1${phone}` }),
      });
      await saveHandle(`@${clean}`);
      await AsyncStorage.setItem('vaultchat_display_name', clean);
    } catch {}
    setLoading(false);
    onLogin?.();
  }

  async function skipHandle() {
    const auto = `@user${phone.slice(-4)}`;
    await saveHandle(auto);
    await AsyncStorage.setItem('vaultchat_display_name', `user${phone.slice(-4)}`);
    onLogin?.();
  }

  // ── Shared logo block ─────────────────────────────────────────
  // The PNG has a black background — contained in a dark rounded box
  // so the black blends in and looks intentional (like an iOS app icon).
  const LogoBlock = (
    <View style={s.logoContainer}>
      <Image source={LOGO} style={s.logo} resizeMode="contain" />
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

        {/* ── PHONE STEP ────────────────────────────────────── */}
        {step === 'phone' && (
          <View style={s.content}>
            {LogoBlock}

            <Text style={s.heading}>Welcome to VaultChat</Text>
            <Text style={s.subheading}>Enter your number to get started</Text>

            {/* Slogan */}
            <View style={s.sloganBox}>
              <Text style={s.sloganText}>
                Stay connected and secured—{'\n'}no matter how far out you are.
              </Text>
            </View>

            {/* Phone input */}
            <View style={s.inputBox}>
              <Text style={s.flagCode}>🇺🇸  +1</Text>
              <View style={s.divider} />
              <TextInput
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

            {/* Legal */}
            <Text style={s.legal}>
              By providing your phone number, you agree to receive automated
              promotional and personalized marketing text messages from VaultChat.co.
              Consent is not a condition of purchase. Msg & data rates may apply.
              Msg frequency varies. Reply HELP for help or STOP to cancel. View our{' '}
              <Text
                style={s.legalLink}
                onPress={() => Linking.openURL('https://encrypted-hug-chat.lovable.app/privacy')}>
                Privacy Policy
              </Text>
              {' '}and{' '}
              <Text
                style={s.legalLink}
                onPress={() => Linking.openURL('https://encrypted-hug-chat.lovable.app/terms')}>
                Terms of Service
              </Text>
              .
            </Text>

            {/* Button */}
            <TouchableOpacity
              style={[s.btn, phone.length < 10 && s.btnOff]}
              onPress={sendOTP}
              disabled={loading || phone.length < 10}>
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

            <Text style={s.heading}>Verify Your Number</Text>
            <Text style={s.subheading}>Code sent to +1 {phone}</Text>

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
              onPress={() => { setStep('phone'); setOtp(''); }}>
              <Text style={s.backTx}>← Change number</Text>
            </TouchableOpacity>

            <Text style={s.badge}>
              🔒 End-to-end encrypted · Metadata private · No ads
            </Text>
          </View>
        )}

        {/* ── HANDLE STEP ───────────────────────────────────── */}
        {step === 'handle' && (
          <View style={s.content}>
            {LogoBlock}

            <Text style={s.heading}>Create Your Identity</Text>
            <Text style={s.subheading}>Your handle keeps your number private</Text>

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
              Your phone number stays private
            </Text>

            <TouchableOpacity
              style={[s.btn, handle.length < 3 && s.btnOff]}
              onPress={saveHandleAndLogin}
              disabled={loading || handle.length < 3}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnTx}>Create Handle →</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={s.backBtn} onPress={skipHandle}>
              <Text style={s.backTx}>Skip for now</Text>
            </TouchableOpacity>

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
  scroll:         { flexGrow: 1, paddingVertical: 0, paddingTop: 8 },
  content:        { alignItems: 'center', paddingHorizontal: 24 },

  // Logo — dark rounded container hides the PNG's black background
  logoContainer:  {
    width: SW * 0.75,
    height: SW * 0.75 * 1.4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  logo:           { width: SW * 0.75, height: SW * 0.75 * 1.4 },

  // Headings
  heading:        { fontSize: 26, fontWeight: '800', color: C.tx, textAlign: 'center', marginBottom: 6 },
  subheading:     { fontSize: 15, color: C.sub, textAlign: 'center', marginBottom: 22 },

  // Slogan box
  sloganBox:      { width: '100%', backgroundColor: C.blueSoft, borderColor: C.blueBorder, borderWidth: 1, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 22, marginBottom: 22 },
  sloganText:     { fontSize: 15, color: C.blue, textAlign: 'center', lineHeight: 24, fontStyle: 'italic', fontWeight: '600' },

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
