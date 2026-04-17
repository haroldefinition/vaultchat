import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import { saveHandle } from '../services/vaultHandle';

const BACKEND = 'https://vaultchat-production-3a96.up.railway.app';

export default function RegisterScreen({ route, onLoginCallback }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const onLogin = onLoginCallback || route?.params?.onLogin;
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [handle, setHandle] = useState('');
  const [step, setStep] = useState('phone'); // phone → otp → handle
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState('');

  async function sendOTP() {
    if (!phone || phone.length < 10) { Alert.alert('Error', 'Enter a valid 10-digit phone number'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: `+1${phone}`,
        options: { channel: 'sms' }
      });
      if (error) {
        Alert.alert('Code Sent', 'Enter 123456 (test mode — real SMS pending Twilio activation)');
      } else {
        Alert.alert('Code Sent', 'Check your phone for the verification code.');
      }
    } catch (e) {
      Alert.alert('Code Sent', 'Enter 123456 (test mode)');
    }
    setLoading(false);
    setStep('otp');
  }

  async function verifyOTP() {
    if (!otp || otp.length < 6) { Alert.alert('Error', 'Enter the 6-digit code'); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({ phone: `+1${phone}`, token: otp, type: 'sms' });
    if (!error && data?.user) {
      const id = data.user.id;
      setUserId(id);
      await AsyncStorage.setItem('vaultchat_user', JSON.stringify({ phone: `+1${phone}`, id }));
      setLoading(false);
      setStep('handle');
      return;
    }
    if (otp === '123456') {
      const testId = '550e8400-e29b-41d4-a716-' + phone.padStart(12, '0');
      setUserId(testId);
      await AsyncStorage.setItem('vaultchat_user', JSON.stringify({ phone: `+1${phone}`, id: testId }));
      setLoading(false);
      setStep('handle');
      return;
    }
    setLoading(false);
    Alert.alert('Error', 'Invalid code. In test mode use 123456.');
  }

  async function checkHandleAvailable(h) {
    try {
      const res = await fetch(`${BACKEND}/handle/${encodeURIComponent(h)}`);
      const data = await res.json();
      return !data.id; // if no ID returned, handle is available
    } catch (e) {
      return true; // assume available if error
    }
  }

  async function saveHandleAndLogin() {
    if (!handle || handle.length < 3) { Alert.alert('Error', 'Handle must be at least 3 characters'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(handle)) { Alert.alert('Error', 'Handle can only contain letters, numbers and underscores'); return; }
    setLoading(true);
    const fullHandle = `@${handle.toLowerCase()}`;
    const available = await checkHandleAvailable(fullHandle);
    if (!available) {
      setLoading(false);
      Alert.alert('Handle taken', `${fullHandle} is already taken. Try another one.`);
      return;
    }
    await saveHandle(fullHandle);
    await AsyncStorage.setItem('vaultchat_display_name', handle);
    try {
      await fetch(`${BACKEND}/handle/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, handle: fullHandle, phone: `+1${phone}` }),
      });
    } catch (e) {}
    setLoading(false);
    if (onLogin) onLogin();
  }

  async function skipHandle() {
    const autoHandle = `@user${phone.slice(-4)}`;
    await saveHandle(autoHandle);
    await AsyncStorage.setItem('vaultchat_display_name', `user${phone.slice(-4)}`);
    if (onLogin) onLogin();
  }

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <Text style={s.logo}>🔒</Text>
      <Text style={[s.title, { color: accent }]}>
        {step === 'phone' ? 'Enter Your Number' : step === 'otp' ? 'Enter Code' : 'Create Your Handle'}
      </Text>
      <Text style={[s.sub, { color: sub }]}>
        {step === 'phone' ? "We'll send you a verification code"
          : step === 'otp' ? `Code sent to +1${phone}`
          : 'Choose a unique handle so others can find you without knowing your number'}
      </Text>

      {step === 'phone' && (
        <Text style={[s.slogan, { color: sub }]}>
          Stay connected and secured—{'\n'}no matter how far out you are.
        </Text>
      )}

      {step === 'phone' && (
        <>
          <TextInput
            style={[s.input, { backgroundColor: inputBg, color: tx, borderColor: border }]}
            placeholder="10-digit phone number"
            placeholderTextColor={sub}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            maxLength={10}
          />
          <TouchableOpacity style={[s.button, { backgroundColor: accent }]} onPress={sendOTP} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Send Code →</Text>}
          </TouchableOpacity>
        </>
      )}

      {step === 'otp' && (
        <>
          <TextInput
            style={[s.input, { backgroundColor: inputBg, color: tx, borderColor: border }]}
            placeholder="6-digit code"
            placeholderTextColor={sub}
            keyboardType="number-pad"
            value={otp}
            onChangeText={setOtp}
            maxLength={6}
          />
          <TouchableOpacity style={[s.button, { backgroundColor: accent }]} onPress={verifyOTP} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Verify →</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep('phone')}>
            <Text style={[s.back, { color: sub }]}>← Change number</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'handle' && (
        <>
          <View style={[s.handleRow, { backgroundColor: inputBg, borderColor: border }]}>
            <Text style={[s.atSign, { color: accent }]}>@</Text>
            <TextInput
              style={[s.handleInput, { color: tx }]}
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
          <Text style={[s.handleHint, { color: sub }]}>
            • 3-20 characters{'\n'}
            • Letters, numbers and underscores only{'\n'}
            • Others can find you with @{handle.toLowerCase() || 'yourhandle'}{'\n'}
            • Your phone number stays private
          </Text>
          <TouchableOpacity style={[s.button, { backgroundColor: accent }]} onPress={saveHandleAndLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Create Handle →</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={skipHandle}>
            <Text style={[s.back, { color: sub }]}>Skip for now</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  sub:    { fontSize: 14, marginBottom: 12, textAlign: 'center', lineHeight: 20 },
  slogan: { fontSize: 13, textAlign: 'center', lineHeight: 20, fontStyle: 'italic', marginBottom: 24, opacity: 0.75 },
  input: { width: '100%', padding: 16, borderRadius: 14, marginBottom: 16, fontSize: 16, borderWidth: 1 },
  button: { width: '100%', padding: 16, borderRadius: 14, alignItems: 'center', marginBottom: 12 },
  buttonText: { fontWeight: 'bold', fontSize: 16, color: '#fff' },
  back: { fontSize: 14, marginTop: 8 },
  handleRow: { width: '100%', flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, marginBottom: 8, paddingHorizontal: 16 },
  atSign: { fontSize: 24, fontWeight: 'bold', marginRight: 4 },
  handleInput: { flex: 1, padding: 16, fontSize: 20, fontWeight: 'bold' },
  handlePreview: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  handleHint: { fontSize: 13, lineHeight: 22, marginBottom: 24, alignSelf: 'flex-start' },
});
