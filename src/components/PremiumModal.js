import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { setPremiumUser } from '../services/adsService';

const PERKS = [
  { emoji: '🚫', label: 'Remove all ads' },
  { emoji: '📌', label: 'Unlimited pinned chats' },
  { emoji: '🎨', label: 'Exclusive themes & icons' },
  { emoji: '🔒', label: 'Priority encrypted backup' },
  { emoji: '📞', label: 'HD voice & video calls' },
  { emoji: '⚡', label: 'Faster message delivery' },
];

export default function PremiumModal({ visible, onClose, onUpgraded, colors }) {
  const c = colors || { card: '#1C1C1E', text: '#FFFFFF', muted: '#8E8E93', border: '#38383A' };
  const handleSubscribe = async (plan) => {
    Alert.alert('Confirm Purchase', `Subscribe for ${plan === 'monthly' ? '$2.99/month' : '$19.99/year'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Subscribe', onPress: async () => { await setPremiumUser(true); onUpgraded && onUpgraded(); onClose(); Alert.alert('Welcome to Premium! 🎉', 'Ads removed. Enjoy VaultChat.'); } },
    ]);
  };
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: c.card }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={onClose}><Text style={[styles.closeX, { color: c.muted }]}>✕</Text></TouchableOpacity>
          </View>
          <Text style={styles.crown}>👑</Text>
          <Text style={[styles.title, { color: c.text }]}>VaultChat Premium</Text>
          <Text style={[styles.subtitle, { color: c.muted }]}>Ad-free messaging. Elevated everything.</Text>
          <ScrollView style={styles.perksList} showsVerticalScrollIndicator={false}>
            {PERKS.map((p) => (
              <View key={p.label} style={styles.perkRow}>
                <Text style={styles.perkEmoji}>{p.emoji}</Text>
                <Text style={[styles.perkLabel, { color: c.text }]}>{p.label}</Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={[styles.btn, { backgroundColor: '#6C63FF' }]} onPress={() => handleSubscribe('yearly')}>
            <Text style={styles.btnText}>$19.99 / year</Text>
            <Text style={styles.btnSub}>Best value — save 44%</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnOutline, { borderColor: c.border }]} onPress={() => handleSubscribe('monthly')}>
            <Text style={[styles.btnOutlineText, { color: c.text }]}>$2.99 / month</Text>
          </TouchableOpacity>
          <Text style={[styles.legal, { color: c.muted }]}>Subscriptions auto-renew. Cancel anytime in App Store settings.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, minHeight: 520 },
  headerRow: { alignItems: 'flex-end', marginBottom: 4 },
  closeX: { fontSize: 18, fontWeight: '600', padding: 4 },
  crown: { fontSize: 44, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', marginTop: 6, marginBottom: 20 },
  perksList: { marginBottom: 20, maxHeight: 200 },
  perkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  perkEmoji: { fontSize: 18, marginRight: 12, width: 28, textAlign: 'center' },
  perkLabel: { fontSize: 15, fontWeight: '500' },
  btn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  btnOutline: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, marginBottom: 16 },
  btnOutlineText: { fontSize: 15, fontWeight: '600' },
  legal: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
