import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Animated, KeyboardAvoidingView,
  Platform, Dimensions, Image,
} from 'react-native';
import { supabase } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import { saveHandle } from '../services/vaultHandle';

const LOGO    = require('../../assets/vaultchat-logo.png');
const BACKEND  = 'https://vaultchat-production-3a96.up.railway.app';
const { width } = Dimensions.get('window');

export default function RegisterScreen({ route, onLoginCallback }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const onLogin = onLoginCallback || route?.params?.onLogin;

  const [phone,   setPhone]   = useState('');
  const [otp,     setOtp]     = useState('');
  const [handle,  setHandle]  = useState('');
  const [step,    setStep]    = useState('phone'); // phone → otp → handle
  const [loading, setLoading] = useState(false);
  const [userId,  setUserId]  = useState('');

  // Animation values
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();
  }, [step]);

  const animateStep = (nextStep) => {
    fadeAnim.setValue(0);
    slideAnim.setValue(24);
    setStep(nextStep);
  };

  async function sendOTP() {
    if (!phone || phone.length < 10) {
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
      if (data.success) {
        Alert.alert('Code Sent', 'Check your phone for the verification code.');
        animateStep('otp');
      } else {
        // Fallback: try Supabase
        const { error } = await supabase.auth.signInWithOtp({ phone: `+1${phone}` });
        if (!error) {
          Alert.alert('Code Sent', 'Check your phone for the verification code.');
          animateStep('otp');
        } else throw new Error(error.message);
      }
    } catch {
      // Dev fallback
      Alert.alert('Code Sent (Dev)', 'Use code 123456 to continue.');
      animateStep('otp');
    }
    setLoading(false);
  }

  async function verifyOTP() {
    if (!otp || otp.length < 6) { Alert.alert('Enter the 6-digit code'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: `+1${phone}`, token: otp, type: 'sms',
      });
      if (!error && data?.user) {
        setUserId(data.user.id);
        // Check if handle already set
        const { data: profile } = await supabase.from('profiles').select('handle').eq('id', data.user.id).single();
        if (profile?.handle) {
          await AsyncStorage.setItem('vaultchat_user', JSON.stringify({ phone: `+1${phone}`, id: data.user.id }));
          onLogin?.();
          return;
        }
        animateStep('handle');
        return;
      }
    } catch {}
    // Dev fallback
    if (otp === '123456') {
      const testId = '550e8400-e29b-41d4-a716-' + phone.padStart(12, '0');
      setUserId(testId);
      await AsyncStorage.setItem('vaultchat_user', JSON.stringify({ phone: `+1${phone}`, id: testId }));
      animateStep('handle');
    } else {
      Alert.alert('Invalid Code', 'Check the code and try again.');
    }
    setLoading(false);
  }

  async function saveHandleAndLogin() {
    const cleanHandle = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanHandle.length < 3) { Alert.alert('Handle too short', 'At least 3 characters.'); return; }
    setLoading(true);
    try {
      await fetch(`${BACKEND}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, handle: `@${cleanHandle}`, phone: `+1${phone}` }),
      });
      await saveHandle(`@${cleanHandle}`);
      await AsyncStorage.setItem('vaultchat_user', JSON.stringify({ phone: `+1${phone}`, id: userId }));
      await AsyncStorage.setItem('vaultchat_display_name', cleanHandle);
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

  // Step metadata
  const stepConfig = {
    phone:  { title: 'Welcome to VaultChat',   sub: 'Enter your number to get started' },
    otp:    { title: 'Verify Your Number',      sub: `Code sent to +1 ${phone}` },
    handle: { title: 'Create Your Identity',    sub: 'Your handle keeps your number private' },
  };
  const cfg = stepConfig[step];

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

      {/* Background decorative circles */}
      <View style={[s.circle1, { borderColor: accent + '18' }]} />
      <View style={[s.circle2, { borderColor: accent + '10' }]} />

      <Animated.View style={[s.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

        {/* VaultChat logo — PNG includes shield icon + text */}
        <Image source={LOGO} style={s.logo} resizeMode="contain" />

        {/* Title */}
        <Text style={[s.title, { color: tx }]}>{cfg.title}</Text>
        <Text style={[s.sub, { color: sub }]}>{cfg.sub}</Text>

        {/* Slogan — only on phone step */}
        {step === 'phone' && (
          <View style={[s.sloganWrap, { borderColor: accent + '30', backgroundColor: accent + '08' }]}>
            <Text style={[s.sloganText, { color: accent }]}>
              Stay connected and secured—{'\n'}no matter how far out you are.
            </Text>
          </View>
        )}

        {/* Phone input step */}
        {step === 'phone' && (
          <View style={s.inputGroup}>
            <View style={[s.phoneRow, { backgroundColor: inputBg, borderColor: border }]}>
              <Text style={[s.countryCode, { color: accent }]}>🇺🇸 +1</Text>
              <View style={[s.divider, { backgroundColor: border }]} />
              <TextInput
                style={[s.phoneInput, { color: tx }]}
                placeholder="(000) 000-0000"
                placeholderTextColor={sub}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={v => setPhone(v.replace(/\D/g, '').slice(0, 10))}
                maxLength={10}
              />
            </View>
            <TouchableOpacity
              style={[s.btn, { backgroundColor: phone.length === 10 ? accent : accent + '60' }]}
              onPress={sendOTP} disabled={loading || phone.length < 10}>
              {loading
                ? <ActivityIndicator color="#000" />
                : <Text style={s.btnText}>Send Code  →</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* OTP step */}
        {step === 'otp' && (
          <View style={s.inputGroup}>
            <TextInput
              style={[s.otpInput, { backgroundColor: inputBg, color: tx, borderColor: border }]}
              placeholder="123456"
              placeholderTextColor={sub}
              keyboardType="number-pad"
              value={otp}
              onChangeText={setOtp}
              maxLength={6}
              autoFocus
              textAlign="center"
            />
            <TouchableOpacity
              style={[s.btn, { backgroundColor: otp.length === 6 ? accent : accent + '60' }]}
              onPress={verifyOTP} disabled={loading || otp.length < 6}>
              {loading
                ? <ActivityIndicator color="#000" />
                : <Text style={s.btnText}>Verify  →</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => animateStep('phone')} style={s.linkBtn}>
              <Text style={[s.linkText, { color: sub }]}>← Change number</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Handle step */}
        {step === 'handle' && (
          <View style={s.inputGroup}>
            <View style={[s.phoneRow, { backgroundColor: inputBg, borderColor: border }]}>
              <Text style={[s.countryCode, { color: accent }]}>@</Text>
              <View style={[s.divider, { backgroundColor: border }]} />
              <TextInput
                style={[s.phoneInput, { color: tx }]}
                placeholder="yourhandle"
                placeholderTextColor={sub}
                value={handle}
                onChangeText={t => setHandle(t.replace(/[^a-zA-Z0-9_]/g, ''))}
                maxLength={20}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
            </View>
            {handle.length > 0 && (
              <Text style={[s.handlePreview, { color: accent }]}>@{handle.toLowerCase()}</Text>
            )}
            <Text style={[s.hint, { color: sub }]}>
              3–20 characters · Letters, numbers & underscores{'\n'}
              Your phone number stays private
            </Text>
            <TouchableOpacity
              style={[s.btn, { backgroundColor: handle.length >= 3 ? accent : accent + '60' }]}
              onPress={saveHandleAndLogin} disabled={loading || handle.length < 3}>
              {loading
                ? <ActivityIndicator color="#000" />
                : <Text style={s.btnText}>Create Handle  →</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={skipHandle} style={s.linkBtn}>
              <Text style={[s.linkText, { color: sub }]}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Privacy note */}
        <Text style={[s.privacy, { color: sub }]}>
          🔒 End-to-end encrypted · Metadata private · No ads in chats
        </Text>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Decorative background rings
  circle1:       { position: 'absolute', width: width * 1.4, height: width * 1.4, borderRadius: width * 0.7, borderWidth: 1, top: -width * 0.5, left: -width * 0.2, opacity: 0.6 },
  circle2:       { position: 'absolute', width: width * 1.0, height: width * 1.0, borderRadius: width * 0.5, borderWidth: 1, bottom: -width * 0.3, right: -width * 0.2, opacity: 0.4 },
  content:       { width: '100%', paddingHorizontal: 28, alignItems: 'center' },
  // Logo
  logo:          { width: 200, height: 200, marginBottom: 8 },
  // Text
  title:         { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  sub:           { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  // Slogan
  sloganWrap:    { borderWidth: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 20, marginBottom: 24, width: '100%' },
  sloganText:    { fontSize: 14, textAlign: 'center', lineHeight: 22, fontStyle: 'italic', fontWeight: '500' },
  // Inputs
  inputGroup:    { width: '100%', gap: 12 },
  phoneRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1.5, overflow: 'hidden', height: 56 },
  countryCode:   { paddingHorizontal: 16, fontSize: 16, fontWeight: '700' },
  divider:       { width: 1, height: 30 },
  phoneInput:    { flex: 1, paddingHorizontal: 16, fontSize: 17, height: 56 },
  otpInput:      { width: '100%', height: 64, borderRadius: 16, borderWidth: 1.5, fontSize: 32, fontWeight: '700', letterSpacing: 12 },
  // Button
  btn:           { width: '100%', height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  btnText:       { color: '#000', fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },
  // Handle
  handlePreview: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  hint:          { fontSize: 12, lineHeight: 20, textAlign: 'center' },
  // Links
  linkBtn:       { alignItems: 'center', paddingVertical: 8 },
  linkText:      { fontSize: 14 },
  // Footer
  privacy:       { fontSize: 11, textAlign: 'center', marginTop: 32, lineHeight: 18, opacity: 0.6 },
});
