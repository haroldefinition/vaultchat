import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';

export default function RegisterScreen({ navigation, route }) {
  const onLogin = route?.params?.onLogin;
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('phone');
  const [loading, setLoading] = useState(false);

  async function sendOTP() {
    if (!phone || phone.length < 10) { Alert.alert('Error', 'Enter a valid 10-digit phone number'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ 
        phone: `+1${phone}`,
        options: { channel: 'sms' }
      });
      if (error) {
        // Fallback to test mode if Twilio not yet activated
        console.log('OTP error:', error.message);
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
    // Try real OTP first
    const { data, error } = await supabase.auth.verifyOtp({ phone: `+1${phone}`, token: otp, type: 'sms' });
    if (!error && data?.user) {
      await AsyncStorage.setItem('vaultchat_user', JSON.stringify({ phone: `+1${phone}`, id: data.user.id }));
      setLoading(false);
      if (onLogin) onLogin();
      return;
    }
    // Fallback: test mode bypass with code 123456
    if (otp === '123456') {
      const testUserId = '550e8400-e29b-41d4-a716-' + phone.padStart(12, '0');
      await AsyncStorage.setItem('vaultchat_user', JSON.stringify({ phone: `+1${phone}`, id: testUserId }));
      setLoading(false);
      if (onLogin) onLogin();
      return;
    }
    setLoading(false);
    Alert.alert('Error', 'Invalid code. In test mode use 123456.');
  }

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <Text style={s.logo}>🔒</Text>
      <Text style={[s.title, { color: accent }]}>{step === 'phone' ? 'Enter Your Number' : 'Enter Code'}</Text>
      <Text style={[s.sub, { color: sub }]}>{step === 'phone' ? "We'll send you a verification code" : `Code sent to +1${phone}`}</Text>
      {step === 'phone' ? (
        <>
          <TextInput style={[s.input, { backgroundColor: inputBg, color: tx, borderColor: border }]} placeholder="10-digit phone number" placeholderTextColor={sub} keyboardType="phone-pad" value={phone} onChangeText={setPhone} maxLength={10} />
          <TouchableOpacity style={[s.button, { backgroundColor: accent }]} onPress={sendOTP} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Send Code →</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput style={[s.input, { backgroundColor: inputBg, color: tx, borderColor: border }]} placeholder="6-digit code" placeholderTextColor={sub} keyboardType="number-pad" value={otp} onChangeText={setOtp} maxLength={6} />
          <TouchableOpacity style={[s.button, { backgroundColor: accent }]} onPress={verifyOTP} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Verify →</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep('phone')}>
            <Text style={[s.back, { color: sub }]}>← Change number</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  sub: { fontSize: 14, marginBottom: 24, textAlign: 'center' },
  input: { width: '100%', padding: 16, borderRadius: 12, marginBottom: 16, fontSize: 16, borderWidth: 1 },
  button: { width: '100%', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  buttonText: { fontWeight: 'bold', fontSize: 16, color: '#fff' },
  back: { fontSize: 14 },
});
