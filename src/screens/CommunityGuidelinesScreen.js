import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '../services/theme';

export default function CommunityGuidelinesScreen({ navigation }) {
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
        <Text style={[s.headerTitle, { color: tx }]}>Community Guidelines</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={s.heroBox}>
          <Text style={s.heroIcon}>🛡️</Text>
          <Text style={[s.heroTitle, { color: accent }]}>Community Guidelines</Text>
          <Text style={[s.heroSub, { color: sub }]}>
            Effective Date: April 22, 2026{'\n'}Last Updated: April 22, 2026
          </Text>
        </View>

        <Section title="Our Approach">
          VaultChat is a privacy-first messenger. End-to-end encryption
          means we cannot read your messages in the ordinary course. That
          makes user reports the most important tool we have for keeping
          the app safe. These Guidelines explain what is not allowed on
          VaultChat and what happens when the rules are broken.{'\n\n'}
          These Guidelines apply to every surface where VaultChat mediates
          communication — direct chats, group chats, profile names, bios,
          avatars, vault handles, group names and descriptions, and any
          media you share through VaultChat.
        </Section>

        <Section title="Child Safety — Zero Tolerance">
          The following are never allowed, ever:{'\n\n'}
          • Child sexual abuse material (CSAM) of any form, including
          photos, videos, drawings, cartoons, AI-generated imagery, or
          text that sexualizes a minor;{'\n'}
          • Sexual solicitation, grooming, or sextortion involving anyone
          under 18;{'\n'}
          • Content that sexualizes minors even without nudity (for example,
          “modeling” imagery intended for sexual purposes);{'\n'}
          • Sharing or trading links, usernames, or code words that exist
          to facilitate the above.{'\n\n'}
          When VaultChat is notified of this kind of content — through an
          in-app report, a trusted reporter, or law enforcement — we will
          terminate the accounts involved, preserve the content and
          metadata we have access to as required by 18 U.S.C. § 2258A,
          and file a report with the NCMEC CyberTipline.
        </Section>

        <Section title="Harassment, Threats, and Violence">
          Don’t use VaultChat to:{'\n\n'}
          • Threaten, stalk, or repeatedly harass another person;{'\n'}
          • Dox or expose private information (home address, workplace,
          phone, ID numbers) without consent;{'\n'}
          • Encourage self-harm or suicide, or glorify violence against
          others;{'\n'}
          • Incite or plan organized violence.
        </Section>

        <Section title="Non-Consensual Intimate Imagery">
          Do not share sexual or intimate images of any adult without their
          informed consent. This includes images that were originally
          consensual but are now being shared to harass, embarrass, or
          coerce the person depicted (sometimes called “revenge porn”).
        </Section>

        <Section title="Hate Speech">
          Don’t attack people based on race, ethnicity, national origin,
          religion, caste, sexual orientation, gender identity, serious
          disability, or serious disease. Slurs, dehumanization, and
          calls for exclusion are not acceptable.
        </Section>

        <Section title="Spam, Scams, and Fraud">
          No unsolicited bulk messaging, phishing, impersonation of
          financial institutions, crypto-investment bait, or fake “customer
          support” scams. Don’t use VaultChat to recruit people into
          pyramid or multi-level schemes.
        </Section>

        <Section title="Illegal Activity">
          Don’t use VaultChat to buy, sell, or coordinate illegal weapons,
          controlled substances (outside of jurisdictions where they are
          legal), trafficking in persons, identity theft, or other
          serious crimes.
        </Section>

        <Section title="Platform Integrity">
          Don’t probe, reverse-engineer, or try to circumvent VaultChat’s
          encryption or security. Don’t automate account creation, mass
          messaging, or other abuse at scale.
        </Section>

        <Section title="How to Report">
          In any direct chat or group chat, press and hold a message to
          open the message menu, then tap “Report.” Pick the reason that
          best describes the issue. You can optionally forward a copy of
          the reported content to our safety team — this is off by
          default, and nothing leaves your device unless you check the
          box.{'\n\n'}
          For urgent child-safety reports, you may also file directly
          with NCMEC at report.cybertip.org or 1-800-843-5678. If a child
          is in immediate danger, call 911 (United States) or your local
          emergency number.
        </Section>

        <Section title="How We Enforce">
          Depending on severity and history, we may:{'\n\n'}
          • Remove forwarded content from our moderation queue;{'\n'}
          • Warn the account;{'\n'}
          • Temporarily restrict messaging or group creation;{'\n'}
          • Suspend the account;{'\n'}
          • Permanently terminate the account and ban the associated
          phone number, email, and device identifiers where permitted.{'\n\n'}
          Violations involving CSAM, credible threats, or organized
          exploitation result in immediate termination without warning.
          We report CSAM to NCMEC as required by federal law.
        </Section>

        <Section title="Appeals">
          If you believe your account was actioned in error, email
          support@vaultchat.co with your vault handle and a short
          description. We review appeals within 7 business days.
          Terminations related to CSAM or credible threats are not
          eligible for appeal.
        </Section>

        <Section title="Changes">
          We’ll update these Guidelines as VaultChat grows. Material
          changes are announced in the app.
        </Section>

        <Section title="Contact">
          AUXXILUS MEDIA LLC{'\n'}
          11 Hetton Court, Glassboro, NJ 08028, United States{'\n'}
          support@vaultchat.co
        </Section>

        <View style={[s.footer, { borderColor: border }]}>
          <Text style={[s.footerText, { color: sub }]}>
            🛡️ Safety is the other half of privacy.
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
