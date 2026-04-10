import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '../services/theme';

export default function PrivacyPolicyScreen({ navigation }) {
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
        <Text style={[s.headerTitle, { color: tx }]}>Privacy Policy</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={s.heroBox}>
          <Text style={s.heroIcon}>🔒</Text>
          <Text style={[s.heroTitle, { color: accent }]}>VaultChat Privacy Policy</Text>
          <Text style={[s.heroSub, { color: sub }]}>Effective Date: April 10, 2026{'\n'}Last Updated: April 10, 2026</Text>
        </View>

        <Section title="1. Our Privacy Commitment">
          VaultChat is built on a foundation of privacy-first design. We believe your conversations are yours alone. We do not read, sell, or share your messages with anyone — ever. Our architecture is designed so that we technically cannot access your message content even if we wanted to.
        </Section>

        <Section title="2. End-to-End Encryption">
          All messages sent through VaultChat are protected by end-to-end encryption using the Signal Protocol. This means:{'\n\n'}
          • Messages are encrypted on your device before transmission{'\n'}
          • Only you and your recipient can read messages{'\n'}
          • Even VaultChat servers cannot decrypt your messages{'\n'}
          • Encryption keys are stored only on your device{'\n\n'}
          Your messages exist only on your device and your recipient's device.
        </Section>

        <Section title="3. Notification Security">
          Unlike other messaging apps, VaultChat never includes message content in push notifications. This directly counters known iOS notification storage vulnerabilities that allow message extraction from device logs. Our notifications only say "New message received" — the actual content is only accessible after biometric authentication within the app.
        </Section>

        <Section title="4. Information We Collect">
          We collect the minimum information necessary:{'\n\n'}
          • Phone number (for account verification only){'\n'}
          • Vault Handle (your chosen username){'\n'}
          • Profile information you voluntarily provide (name, bio, photo){'\n'}
          • Message metadata (timestamps, delivery status){'\n\n'}
          We do NOT collect:{'\n'}
          • Message content{'\n'}
          • Contact lists{'\n'}
          • Location data (unless you share it in a message){'\n'}
          • Behavioral tracking data{'\n'}
          • Advertising identifiers
        </Section>

        <Section title="5. Data Storage">
          Message content is stored only on your device. Our servers store only encrypted metadata necessary for message delivery. We use Supabase for secure cloud infrastructure with industry-standard security practices. Backups are encrypted with your personal PIN before leaving your device.
        </Section>

        <Section title="6. Data Retention">
          • Messages: Stored on your device only, deleted when you delete them{'\n'}
          • Account data: Retained until you delete your account{'\n'}
          • Vanish Mode messages: Automatically deleted after viewing{'\n'}
          • Server logs: Retained for 30 days for security purposes only{'\n'}
          • Backups: Stored encrypted, deleted on request
        </Section>

        <Section title="7. Third-Party Services">
          VaultChat uses the following third-party services:{'\n\n'}
          • Twilio: For SMS verification codes only. Twilio does not have access to your messages.{'\n'}
          • Supabase: For secure cloud database infrastructure.{'\n'}
          • Apple/Google: For push notification delivery (notification content is never included).{'\n\n'}
          We do not use any advertising networks or analytics trackers.
        </Section>

        <Section title="8. Your Rights">
          You have the right to:{'\n\n'}
          • Access your personal data{'\n'}
          • Delete your account and all associated data{'\n'}
          • Export your data at any time{'\n'}
          • Opt out of any non-essential data collection{'\n'}
          • Request correction of inaccurate data{'\n\n'}
          To exercise these rights, contact us at privacy@vaultchat.app
        </Section>

        <Section title="9. Children's Privacy">
          VaultChat is not intended for users under the age of 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, please contact us immediately.
        </Section>

        <Section title="10. Biometric Data">
          Face ID and Touch ID biometric authentication is processed entirely on your device by Apple's secure enclave. VaultChat never receives, stores, or transmits your biometric data. Biometric processing is handled exclusively by iOS.
        </Section>

        <Section title="11. Changes to This Policy">
          We will notify you of any material changes to this Privacy Policy through the app. Continued use of VaultChat after changes constitutes acceptance of the updated policy.
        </Section>

        <Section title="12. Contact Us">
          For privacy-related questions or concerns:{'\n\n'}
          Email: privacy@vaultchat.app{'\n'}
          Website: vaultchat.app{'\n'}
          Address: Philadelphia/New Jersey Area, United States{'\n\n'}
          We respond to all privacy inquiries within 48 hours.
        </Section>

        <View style={[s.footer, { borderColor: border }]}>
          <Text style={[s.footerText, { color: sub }]}>🔒 VaultChat — Your conversations, your privacy.</Text>
          <Text style={[s.footerText, { color: sub }]}>Built with Signal Protocol encryption.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 16, fontWeight: 'bold' },
  heroBox: { alignItems: 'center', padding: 24, marginBottom: 8 },
  heroIcon: { fontSize: 48, marginBottom: 12 },
  heroTitle: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  heroSub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  section: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 10 },
  sectionText: { fontSize: 14, lineHeight: 22 },
  footer: { borderTopWidth: 1, paddingTop: 20, marginTop: 8, alignItems: 'center', gap: 6 },
  footerText: { fontSize: 13, textAlign: 'center' },
});
