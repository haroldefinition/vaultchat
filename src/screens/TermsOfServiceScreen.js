import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useTheme } from '../services/theme';

export default function TermsOfServiceScreen({ navigation }) {
  const { bg, card, tx, sub, border, accent } = useTheme();

  const Section = ({ title, children }) => (
    <View style={[s.section, { backgroundColor: card, borderColor: border }]}>
      <Text style={[s.sectionTitle, { color: accent }]}>{title}</Text>
      <Text style={[s.sectionText, { color: tx }]}>{children}</Text>
    </View>
  );

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: accent, fontSize: 16 }}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tx }]}>Terms of Service</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={s.heroBox}>
          <Text style={s.heroIcon}>📋</Text>
          <Text style={[s.heroTitle, { color: accent }]}>VaultChat Terms of Service</Text>
          <Text style={[s.heroSub, { color: sub }]}>Effective Date: April 17, 2026</Text>
        </View>

        <Section title="1. Acceptance of Terms">
          By accessing or using VaultChat ("the Service"), you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these terms, you may not use the Service.
        </Section>

        <Section title="2. Eligibility and Account Security">
          You must be at least 13 years of age to use VaultChat. You are responsible for maintaining the security of your device and your account. Because VaultChat uses end-to-end encryption, you acknowledge that if you lose your device and do not have an encrypted backup, VaultChat cannot recover your messages or account data for you.
        </Section>

        <Section title="3. SMS Service and User Consent">
          VaultChat utilizes SMS for secure account verification and system alerts.{'\n\n'}
          {'  '}• Consent: By providing your phone number, you explicitly consent to receive automated text messages from VaultChat for verification purposes.{'\n\n'}
          {'  '}• Opt-Out: You may opt-out at any time by texting "STOP" to our number. Note that opting out may prevent you from verifying your account or accessing certain secure features.{'\n\n'}
          {'  '}• Help: Text "HELP" for assistance.{'\n\n'}
          {'  '}• Rates: Standard message and data rates may apply. Message frequency varies based on your usage and security needs.
        </Section>

        <Section title="4. User Conduct">
          You agree not to use VaultChat for any unlawful purpose, including but not limited to:{'\n\n'}
          {'  '}• The transmission of malware, viruses, or any destructive code.{'\n'}
          {'  '}• Engaging in harassment, threats, or the distribution of illegal content.{'\n'}
          {'  '}• Attempting to bypass the Service's encryption or security architecture.
        </Section>

        <Section title="5. Intellectual Property">
          The VaultChat name, the lock icon branding, and all proprietary software associated with the Service are the exclusive property of VaultChat. Your use of the Service does not grant you ownership of any intellectual property rights in our Service or the content you access.
        </Section>

        <Section title="6. Termination">
          We reserve the right to suspend or terminate your access to the Service at our discretion, without notice, if we believe you have violated these Terms.
        </Section>

        <Section title="7. Limitation of Liability">
          VaultChat is provided "as is" and "as available." While we utilize the Signal Protocol for industry-leading security, we do not guarantee that the Service will be 100% uninterrupted. To the maximum extent permitted by law, VaultChat and its affiliates shall not be liable for any indirect, incidental, or consequential damages resulting from your use of the Service.
        </Section>

        <Section title="8. Governing Law">
          These Terms shall be governed by and construed in accordance with the laws of the Commonwealth of Pennsylvania, without regard to its conflict of law principles.
        </Section>

        <Section title="9. Contact Information">
          For any questions regarding these Terms, please contact us at:{'\n\n'}
          {'  '}• Email:{' '}
          <Text
            style={[s.link, { color: accent }]}
            onPress={() => Linking.openURL('mailto:support@vaultchat.co')}>
            support@vaultchat.co
          </Text>
        </Section>

        <View style={[s.footer, { borderColor: border }]}>
          <Text style={[s.footerText, { color: sub }]}>🔒 VaultChat — Encrypted. Private. Secure.</Text>
          <Text style={[s.footerText, { color: sub }]}>© 2026 VaultChat. All rights reserved.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle:  { fontSize: 16, fontWeight: 'bold' },
  heroBox:      { alignItems: 'center', padding: 24, marginBottom: 8 },
  heroIcon:     { fontSize: 48, marginBottom: 12 },
  heroTitle:    { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  heroSub:      { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  section:      { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 10 },
  sectionText:  { fontSize: 14, lineHeight: 22 },
  link:         { textDecorationLine: 'underline', fontWeight: '600' },
  footer:       { borderTopWidth: 1, paddingTop: 20, marginTop: 8, alignItems: 'center', gap: 6 },
  footerText:   { fontSize: 13, textAlign: 'center' },
});
