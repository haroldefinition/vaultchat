import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, ScrollView, Image, Linking,
} from 'react-native';
import { supabase } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveHandle } from '../services/vaultHandle';

const LOGO    = require('../../assets/vaultchat-logo.png');
const BACKEND = 'https://vaultchat-production-3a96.up.railway.app';

// ── Colours (fixed — Register is always light like the website) ──
const C = {
  bg:       '#FFFFFF',
  card:     '#F2F4F8',
  blue:     '#1A7AE8',    // button + flag text + links
  blueSoft: '#EBF3FD',    // slogan box bg
  blueBorder:'#BFDBFE',  // slogan box border
  tx:       '#0F172A',    // headings
  sub:      '#64748B',    // subtitles / legal
  border:   '#E2E8F0',    // input border
  inputBg:  '#F8FAFC',    // input background
  placeholder:'#94A3B8',
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
      const res  = await fetch(`${BACKEND}/send-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+1${phone}` }),
      });
      const data = await res.json();
      if (data.success) { setStep('otp'); } else throw new Error();
    } catch {
      try {
        const { error } = await supabase.auth.signInWithOtp({ phone: `+1${phone}` });
        if (!error) { setStep('otp'); return; }
      } catch {}
      // Dev fallback — always succeeds
      setStep('otp');
    }
    setLoading(false);
  }

  // ── Verify OTP ────────────────────────────────────────────────
  async function verifyOTP() {
    if (otp.length < 6) { Alert.alert('Enter the 6-digit code'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: `+1${phone}`, token: otp, type: 'sms',
      });
      if (!error && data?.user) {
        setUserId(data.user.id);
        const { data: profile } = await supabase
          .from('profiles').select('handle').eq('id', data.user.id).single();
        if (profile?.handle) {
          await AsyncStorage.setItem('vaultchat_user', JSON.stringify({ phone: `+1${phone}`, id: data.user.id }));
          onLogin?.(); return;
        }
        setStep('handle'); setLoading(false); return;
      }
    } catch {}
    // Dev fallback: code 123456
    if (otp === '123456') {
      const testId = '550e8400-e29b-41d4-a716-' + phone.padStart(12, '0');
      setUserId(testId);
      await AsyncStorage.setItem('vaultchat_user', JSON.stringify({ phone: `+1${phone}`, id: testId }));
      setStep('handle');
    } else {
      Alert.alert('Invalid Code', 'Check the code and try again. (Use 123456 in dev)');
    }
    setLoading(false);
  }

  // ── Save handle & enter app ───────────────────────────────────
  async function saveHandleAndLogin() {
    const clean = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (clean.length < 3) { Alert.alert('Too short', 'At least 3 characters required.'); return; }
    setLoading(true);
    try {
      await fetch(`${BACKEND}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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

  // ── Phone step ────────────────────────────────────────────────
  const PhoneStep = () => (
    <View style={s.content}>
      {/* Logo */}
      <Image source={LOGO} style={s.logo} resizeMode="contain" />

      {/* Heading */}
      <Text style={s.heading}>Welcome to VaultChat</Text>
      <Text style={s.subheading}>Enter your number to get started</Text>

      {/* Slogan box */}
      <View style={s.sloganBox}>
        <Text style={s.sloganText}>
          Stay connected and secured—{'\n'}no matter how far out you are.
        </Text>
      </View>

      {/* Phone input */}
      <View style={s.inputBox}>
        <Text style={s.flagCode}>🇺🇸 +1</Text>
        <View style={s.inputDivider} />
        <TextInput
          style={s.phoneInput}
          placeholder="(000) 000-0000"
          placeholderTextColor={C.placeholder}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={v => setPhone(v.replace(/\D/g, '').slice(0, 10))}
          maxLength={10}
        />
      </View>

      {/* Legal text */}
      <Text style={s.legal}>
        By providing your phone number, you agree to receive automated promotional and personalized marketing text messages from VaultChat.co. Consent is not a condition of purchase. Msg & data rates may apply. Msg frequency varies. Reply HELP for help or STOP to cancel. View our{' '}
        <Text style={s.legalLink} onPress={() => Linking.openURL('https://encrypted-hug-chat.lovable.app/privacy')}>
          Privacy Policy
        </Text>
        {' '}and{' '}
        <Text style={s.legalLink} onPress={() => Linking.openURL('https://encrypted-hug-chat.lovable.app/terms')}>
          Terms of Service
        </Text>
        .
      </Text>

      {/* Send Code button */}
      <TouchableOpacity
        style={[s.btn, phone.length < 10 && s.btnDisabled]}
        onPress={sendOTP}
        disabled={loading || phone.length < 10}>
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.btnText}>Send Code →</Text>}
      </TouchableOpacity>

      {/* Footer badge */}
      <Text style={s.badge}>🔒 End-to-end encrypted · Metadata private · No ads</Text>
    </View>
  );

  // ── OTP step ──────────────────────────────────────────────────
  const OtpStep = () => (
    <View style={s.content}>
      <Image source={LOGO} style={s.logo} resizeMode="contain" />
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
        style={[s.btn, otp.length < 6 && s.btnDisabled]}
        onPress={verifyOTP}
        disabled={loading || otp.length < 6}>
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.btnText}>Verify →</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={s.backBtn} onPress={() => { setStep('phone'); setOtp(''); }}>
        <Text style={s.backText}>← Change number</Text>
      </TouchableOpacity>

      <Text style={s.badge}>🔒 End-to-end encrypted · Metadata private · No ads</Text>
    </View>
  );

  // ── Handle step ───────────────────────────────────────────────
  const HandleStep = () => (
    <View style={s.content}>
      <Image source={LOGO} style={s.logo} resizeMode="contain" />
      <Text style={s.heading}>Create Your Identity</Text>
      <Text style={s.subheading}>Your handle keeps your number private</Text>

      <View style={s.inputBox}>
        <Text style={s.flagCode}>@</Text>
        <View style={s.inputDivider} />
        <TextInput
          style={s.phoneInput}
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
        3–20 characters · Letters, numbers & underscores{'\n'}Your phone number stays private
      </Text>

      <TouchableOpacity
        style={[s.btn, handle.length < 3 && s.btnDisabled]}
        onPress={saveHandleAndLogin}
        disabled={loading || handle.length < 3}>
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.btnText}>Create Handle →</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={s.backBtn} onPress={skipHandle}>
        <Text style={s.backText}>Skip for now</Text>
      </TouchableOpacity>

      <Text style={s.badge}>🔒 End-to-end encrypted · Metadata private · No ads</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {step === 'phone'  && <PhoneStep />}
        {step === 'otp'    && <OtpStep />}
        {step === 'handle' && <HandleStep />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  scroll:        { flexGrow: 1, justifyContent: 'center', paddingVertical: 40 },
  content:       { alignItems: 'center', paddingHorizontal: 24 },

  // Logo
  logo:          { width: 220, height: 200, marginBottom: 4 },

  // Text
  heading:       { fontSize: 24, fontWeight: '800', color: C.tx, textAlign: 'center', marginBottom: 6 },
  subheading:    { fontSize: 15, color: C.sub, textAlign: 'center', marginBottom: 20 },

  // Slogan box
  sloganBox:     { width: '100%', backgroundColor: C.blueSoft, borderColor: C.blueBorder, borderWidth: 1, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 22, marginBottom: 20 },
  sloganText:    { fontSize: 15, color: C.blue, textAlign: 'center', lineHeight: 24, fontStyle: 'italic', fontWeight: '600' },

  // Phone/handle input row
  inputBox:      { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderColor: C.border, borderWidth: 1.5, borderRadius: 16, height: 58, marginBottom: 12, overflow: 'hidden' },
  flagCode:      { paddingHorizontal: 16, fontSize: 15, fontWeight: '700', color: C.blue },
  inputDivider:  { width: 1, height: 28, backgroundColor: C.border },
  phoneInput:    { flex: 1, paddingHorizontal: 16, fontSize: 16, color: C.tx, height: 58 },

  // OTP input
  otpInput:      { width: '100%', height: 66, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.inputBg, fontSize: 34, fontWeight: '700', letterSpacing: 14, color: C.tx, marginBottom: 16 },

  // Legal text
  legal:         { fontSize: 12, color: C.sub, lineHeight: 19, textAlign: 'left', width: '100%', marginBottom: 20 },
  legalLink:     { color: C.blue, textDecorationLine: 'underline' },

  // Button
  btn:           { width: '100%', height: 56, borderRadius: 28, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  btnDisabled:   { opacity: 0.45 },
  btnText:       { color: '#fff', fontWeight: '700', fontSize: 17, letterSpacing: 0.2 },

  // Handle
  handlePreview: { fontSize: 22, fontWeight: '800', color: C.blue, marginBottom: 6 },
  hint:          { fontSize: 12, color: C.sub, lineHeight: 20, textAlign: 'center', marginBottom: 16 },

  // Back link
  backBtn:       { alignItems: 'center', paddingVertical: 10 },
  backText:      { fontSize: 14, color: C.sub },

  // Footer badge
  badge:         { fontSize: 12, color: C.sub, textAlign: 'center', marginTop: 8 },
});
