// ============================================================
//  WelcomeScreen — premium-branded landing card shown to logged-
//  out users before RegisterScreen. Replaces the cold drop into
//  the registration form with a proper introduction:
//
//   - Crown VaultChat logo
//   - "VAULTCHAT PREMIUM" wordmark + "Secure. Private. Premium."
//   - "Create Account" primary button
//   - "Sign In" secondary outline button
//   - "End-to-End Encrypted" trust badge at the bottom
//
//  Both buttons route to RegisterScreen — Supabase's OTP flow
//  resolves "new user vs returning user" automatically, so we
//  don't need separate stacks. We pass route.params.intent so
//  the registration screen can subtly tweak copy ("Welcome back!"
//  vs "Welcome to VaultChat") if it cares to.
// ============================================================

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, StatusBar, Platform } from 'react-native';
import { useTheme } from '../services/theme';

export default function WelcomeScreen({ navigation }) {
  const { bg, tx, sub, accent, isPremium } = useTheme();

  // The premium accent (#7C3AED) is the brand color shown in the
  // mockup. We pull it from the theme so a future re-skin only
  // needs to touch theme.js. Free users (who'll likely never see
  // this screen because they upgrade after signup) still get a
  // sensible accent.
  const brand = isPremium ? '#7C3AED' : accent;

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <StatusBar barStyle="light-content" />

      {/* Top spacer pushes content down a bit from the notch */}
      <View style={{ flex: 0.6 }} />

      {/* Logo + wordmark block — vertically centered hero */}
      <View style={s.hero}>
        {/* Real brand logo (assets/vaultchat-logo.png) — blue shield
            with lock + chat bubble. Replaces the placeholder
            crown+V monogram. */}
        <Image
          source={require('../../assets/vaultchat-logo.png')}
          style={s.logoImg}
          resizeMode="contain"
        />

        <Text style={[s.brandName, { color: tx }]}>VAULTCHAT</Text>
        <Text style={[s.brandSuffix, { color: brand }]}>PREMIUM</Text>
        <Text style={[s.tagline, { color: sub }]}>Secure. Private. Premium.</Text>
      </View>

      {/* Primary + secondary CTAs */}
      <View style={s.ctas}>
        <TouchableOpacity
          style={[s.primaryBtn, { backgroundColor: brand }]}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Register', { intent: 'signup' })}>
          <Text style={s.primaryBtnTx}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.secondaryBtn, { borderColor: brand }]}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Register', { intent: 'signin' })}>
          <Text style={[s.secondaryBtnTx, { color: brand }]}>Sign In</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom trust badge */}
      <View style={s.trustRow}>
        <Text style={[s.trustIcon, { color: sub }]}>🔒</Text>
        <Text style={[s.trustText, { color: sub }]}>End-to-End Encrypted</Text>
      </View>

      {/* Bottom safe-area padding */}
      <View style={{ height: Platform.OS === 'ios' ? 24 : 12 }} />
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, paddingHorizontal: 32 },

  hero:         { alignItems: 'center', flex: 1 },
  // Brand logo — doubled from 160 → 320 per Harold so it dominates
  // the welcome page. resizeMode="contain" keeps the shield crisp
  // at any density. On narrow devices the View paddingHorizontal:
  // 32 still leaves it inside safe bounds.
  logoImg:      { width: 320, height: 320, marginBottom: 8 },

  brandName:    { fontSize: 26, fontWeight: '900', letterSpacing: 4, marginBottom: 2 },
  brandSuffix:  { fontSize: 13, fontWeight: '800', letterSpacing: 6, marginBottom: 14 },
  tagline:      { fontSize: 14, fontWeight: '500', letterSpacing: 0.4 },

  ctas:         { width: '100%', marginBottom: 24 },
  primaryBtn:   {
    paddingVertical: 16, borderRadius: 14,
    alignItems: 'center', marginBottom: 12,
    shadowColor: '#7C3AED', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 6 }, shadowRadius: 16,
    elevation: 4,
  },
  primaryBtnTx: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    paddingVertical: 15, borderRadius: 14,
    alignItems: 'center', borderWidth: 1.5,
  },
  secondaryBtnTx:{ fontSize: 16, fontWeight: '700' },

  trustRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 },
  trustIcon:    { fontSize: 14 },
  trustText:    { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
});
