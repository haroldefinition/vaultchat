import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
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
          <Text style={[s.heroSub, { color: sub }]}>
            Effective Date: April 10, 2026{'\n'}Last Updated: April 17, 2026
          </Text>
        </View>

        <Section title="1. Our Privacy Commitment">
          VaultChat is built on a foundation of privacy-first design. We believe your conversations are yours alone. We do not read, sell, or share your messages with anyone — ever. Our architecture is designed so that we technically cannot access your message content even if we wanted to.
        </Section>

        <Section title="2. End-to-End Encryption">
          All messages sent through VaultChat are protected by end-to-end encryption using the Signal Protocol. This means:{'\n\n'}
          {'  '}• Messages are encrypted on your device before transmission{'\n'}
          {'  '}• Only you and your recipient can read messages{'\n'}
          {'  '}• Even VaultChat servers cannot decrypt your messages{'\n'}
          {'  '}• Encryption keys are stored only on your device
        </Section>

        <Section title="3. Notification and Security">
          Unlike other messaging apps, VaultChat never includes message content in push notifications. This directly counters known iOS notification storage vulnerabilities that allow message extraction from device logs. Our notifications only say "New message received" — the actual content is only accessible after biometric authentication within the app.
        </Section>

        <Section title="4. Information We Collect">
          We collect the minimum information necessary to provide our secure services:{'\n\n'}
          {'  '}• Phone Number: Required for account verification and SMS service delivery.{'\n'}
          {'  '}• Vault Handle: Your chosen username.{'\n'}
          {'  '}• Profile Information: Name, bio, or photo you voluntarily provide.{'\n'}
          {'  '}• Message Metadata: Timestamps and delivery status.
        </Section>

        <Section title="5. SMS & Mobile Privacy (Carrier Compliance)">
          VaultChat uses SMS via Twilio solely for account verification and security alerts.{'\n\n'}
          No Sharing of Mobile Data: No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.{'\n\n'}
          Exclusion: All the above categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.
        </Section>

        <Section title="6. Data Storage & Retention">
          {'  '}• Message Content: Stored only on your device. We use Supabase for secure cloud infrastructure for metadata delivery.{'\n'}
          {'  '}• Backups: Encrypted with your personal PIN before leaving your device.{'\n'}
          {'  '}• Retention: Messages are deleted when you delete them. Server logs are retained for 30 days for security purposes only. Account data is retained until you delete your account.
        </Section>

        <Section title="7. Third-Party Services">
          VaultChat uses the following third-party services to function:{'\n\n'}
          {'  '}• Twilio: For SMS verification codes only. Twilio does not have access to your messages.{'\n'}
          {'  '}• Supabase: For secure cloud database infrastructure.{'\n'}
          {'  '}• Apple/Google: For push notification delivery (content is never included).{'\n\n'}
          Note: We do not use any advertising networks or analytics trackers.
        </Section>

        <Section title="8. Your Rights & Account Deletion">
          You have the right to access, delete, or export your data at any time.{'\n\n'}
          {'  '}• In-app deletion: open Settings → scroll to the bottom → tap Delete Account. The deletion completes immediately and removes your profile, @handle, encryption keys (per-device + ratchet pre-keys), folders, chat preferences, block list, cached contacts, and your authentication record.{'\n'}
          {'  '}• Web deletion (no install required): visit{' '}
          <Text style={[s.link, { color: accent }]} onPress={() => Linking.openURL('https://vaultchat.co/delete-account')}>
            vaultchat.co/delete-account
          </Text>
          {' '}and submit the form. We confirm and complete the deletion within 30 days.{'\n\n'}
          What stays after deletion:{'\n'}
          {'  '}• Messages you sent to other people remain on their devices — that's how end-to-end encryption works; we cannot reach into someone else's phone to delete a message we never had access to.{'\n'}
          {'  '}• Anonymized aggregate metrics (e.g. "5,000 active users last week") that don't identify you personally.{'\n'}
          {'  '}• Records we're legally required to keep — for example, safety reports filed under federal child-protection law (NCMEC reports). These are retained for the period required by law and no longer.{'\n\n'}
          SMS Opt-Out: You can cancel the SMS service at any time by texting "STOP" to our number.{'\n\n'}
          Assistance: Text "HELP" for more info or contact{' '}
          <Text style={[s.link, { color: accent }]} onPress={() => Linking.openURL('mailto:privacy@vaultchat.co')}>
            privacy@vaultchat.co
          </Text>
        </Section>

        <Section title="9. Biometric Data">
          Face ID and Touch ID authentication is processed entirely on your device by Apple's Secure Enclave. VaultChat never receives, stores, or transmits your biometric data.
        </Section>

        <Section title="10. Contact Us">
          {'  '}• Email:{' '}
          <Text style={[s.link, { color: accent }]} onPress={() => Linking.openURL('mailto:privacy@vaultchat.co')}>
            privacy@vaultchat.co
          </Text>{'\n'}
          {'  '}• Website:{' '}
          <Text style={[s.link, { color: accent }]} onPress={() => Linking.openURL('https://vaultchat.co')}>
            vaultchat.co
          </Text>{'\n'}
          {'  '}• Address: 104 S 20th St, Philadelphia, PA 19103
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
