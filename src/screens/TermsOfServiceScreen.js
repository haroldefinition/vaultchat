import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
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
          <Text style={s.heroIcon}>📜</Text>
          <Text style={[s.heroTitle, { color: accent }]}>VaultChat Terms of Service</Text>
          <Text style={[s.heroSub, { color: sub }]}>
            Effective Date: April 22, 2026{'\n'}Last Updated: April 22, 2026
          </Text>
        </View>

        <Section title="1. Acceptance of Terms">
          VaultChat is operated by AUXXILUS MEDIA LLC (“VaultChat”, “we”, “us”).
          By creating an account or using VaultChat, you agree to these Terms
          of Service and to our Community Guidelines and Privacy Policy,
          which are incorporated here by reference. If you do not agree, do
          not use VaultChat.
        </Section>

        <Section title="2. Eligibility and Age">
          You must be at least 13 years old to create a VaultChat account.
          Users aged 13–17 may only use VaultChat with the consent of a
          parent or legal guardian. We may terminate any account we
          reasonably believe belongs to a user under 13.
        </Section>

        <Section title="3. Your Account">
          You are responsible for keeping your credentials, PIN, and device
          secure. You are responsible for all activity on your account.
          Notify us immediately at support@vaultchat.co if your account is
          compromised.
        </Section>

        <Section title="4. Acceptable Use">
          You agree not to use VaultChat to:{'\n\n'}
          • send, share, receive, or store child sexual abuse material (CSAM),
          child sexual exploitation material, or any sexual content involving
          a minor — including drawings, cartoons, AI-generated imagery, or
          text depictions;{'\n'}
          • distribute non-consensual intimate imagery (sometimes called
          “revenge porn”);{'\n'}
          • sexually solicit, groom, or “sextort” any person;{'\n'}
          • harass, threaten, stalk, or incite violence against any person
          or group;{'\n'}
          • promote terrorism, organized violence, or other unlawful
          activity;{'\n'}
          • distribute malware, phishing content, spam, or fraud;{'\n'}
          • impersonate another person or entity;{'\n'}
          • attempt to break, probe, reverse-engineer, or circumvent our
          encryption, security, or access controls.{'\n\n'}
          See our Community Guidelines for the full policy and examples.
        </Section>

        <Section title="5. Zero Tolerance for Child Sexual Abuse Material">
          VaultChat has zero tolerance for child sexual abuse material of
          any kind.{'\n\n'}
          If a user reports CSAM through the in-app reporting flow, if our
          safety team otherwise becomes aware of CSAM on VaultChat, or if we
          are notified by a trusted reporter:{'\n\n'}
          • We will suspend or permanently terminate the account(s) involved.{'\n'}
          • We will preserve the reported content and associated metadata as
          required by 18 U.S.C. § 2258A.{'\n'}
          • We will report the incident to the National Center for Missing
          & Exploited Children (NCMEC) CyberTipline.{'\n'}
          • We will cooperate with law enforcement requests that comply with
          applicable law.{'\n\n'}
          Because VaultChat is end-to-end encrypted, we cannot read your
          messages in the ordinary course. When a user uses the in-app
          “Report” flow and voluntarily forwards a copy of content to our
          safety team, we can review that forwarded copy. This is the only
          circumstance in which we have access to message content.
        </Section>

        <Section title="6. Reporting Violations">
          To report a message, use the long-press “Report” action in any
          direct chat or group chat. You can choose whether to forward a
          copy of the reported content to our safety team; metadata-only
          reports are also accepted. For urgent child-safety reports you may
          also file directly with NCMEC at report.cybertip.org or
          1-800-843-5678. In an emergency where a child is in immediate
          danger, call 911.
        </Section>

        <Section title="7. Enforcement">
          We may remove content that we have access to (for example,
          content forwarded through a report), restrict features, suspend
          an account, or permanently terminate an account for violations
          of these Terms or our Community Guidelines. Violations involving
          CSAM, credible threats of violence, or organized exploitation
          result in immediate termination without prior warning.
        </Section>

        <Section title="8. Messaging and Verification SMS">
          VaultChat sends SMS verification codes and security alerts through
          Twilio when you choose phone-based sign-in. Message and data rates
          may apply. You can reply STOP to opt out of these messages; you
          can also verify using email instead of SMS. SMS is used only for
          verification and security — no marketing or promotional messages
          are sent.
        </Section>

        <Section title="9. End-to-End Encryption">
          VaultChat messages are end-to-end encrypted using the Signal
          Protocol. Encryption keys live only on your device. Our servers
          store only ciphertext. We cannot read your messages even when
          compelled by subpoena, with one narrow exception: content that
          you, the user, choose to forward to us through the in-app
          reporting flow.
        </Section>

        <Section title="10. Intellectual Property">
          VaultChat, the VaultChat name, logo, and all associated
          trademarks, software, and design are owned by AUXXILUS MEDIA LLC.
          You retain ownership of the content you create and send; you
          grant us the minimal license necessary to deliver that content
          to your intended recipients.
        </Section>

        <Section title="11. Disclaimers">
          VaultChat is provided “as is.” We work hard to keep the service
          reliable, but we do not guarantee uninterrupted or error-free
          operation. To the maximum extent permitted by law, AUXXILUS
          MEDIA LLC disclaims all implied warranties.
        </Section>

        <Section title="12. Limitation of Liability">
          To the maximum extent permitted by law, AUXXILUS MEDIA LLC is
          not liable for any indirect, incidental, special, consequential,
          or punitive damages arising out of your use of VaultChat. Our
          total liability for any claim will not exceed the greater of
          $100 USD or the amount you paid us in the twelve months before
          the event giving rise to the claim.
        </Section>

        <Section title="13. Termination">
          You may delete your account at any time from Settings. We may
          suspend or terminate your access for violations of these Terms,
          for legal or security reasons, or if we discontinue the service.
          Sections that by their nature should survive termination
          (ownership, disclaimers, liability limits, dispute resolution)
          will survive.
        </Section>

        <Section title="14. Governing Law and Disputes">
          These Terms are governed by the laws of the State of New Jersey,
          United States, without regard to conflict-of-law rules. Disputes
          will be resolved in the state or federal courts located in New
          Jersey, and you consent to personal jurisdiction there.
        </Section>

        <Section title="15. Changes to These Terms">
          We may update these Terms from time to time. Material changes
          will be announced in the app. Continued use after the effective
          date of a change means you accept the updated Terms.
        </Section>

        <Section title="16. Contact">
          AUXXILUS MEDIA LLC{'\n'}
          11 Hetton Court, Glassboro, NJ 08028, United States{'\n'}
          support@vaultchat.co{'\n'}
          privacy@vaultchat.co
        </Section>

        <View style={[s.footer, { borderColor: border }]}>
          <Text style={[s.footerText, { color: sub }]}>
            © 2026 AUXXILUS MEDIA LLC. All rights reserved.
          </Text>
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
