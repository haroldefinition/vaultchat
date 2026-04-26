// ============================================================
//  ReportMessageModal
//  Shared component for reporting a message or media from a
//  direct chat or group chat.
//
//  Consent model:
//    - Reporter picks a reason category.
//    - Optional description box for context.
//    - Opt-in checkbox to include a copy of the message/media
//      with the report. Default OFF — the reporter must
//      explicitly consent to forward content. This preserves
//      end-to-end encryption for normal traffic: nothing
//      reaches the moderation backend unless the user who
//      witnessed the content personally chooses to share it.
//
//  CSAM reports are flagged priority=urgent so they surface
//  at the top of the moderation queue.
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import { blockUser, isBlockedSync } from '../services/blocks';

let supabase = null;
try { supabase = require('../services/supabase').supabase; } catch (e) {}

// ── Reason catalog ────────────────────────────────────────────
// Keep in sync with the reports.reason_category enum in
// vaultchat-supabase-schema-fixed.sql.
export const REPORT_REASONS = [
  {
    id: 'csam',
    label: 'Child sexual abuse material',
    sub: 'Sexual content involving anyone under 18 — including drawings or AI-generated imagery.',
    emoji: '🚨',
    priority: 'urgent',
  },
  {
    id: 'harassment',
    label: 'Harassment or threats',
    sub: 'Targeted abuse, stalking, threats of violence, or doxxing.',
    emoji: '⚠️',
    priority: 'high',
  },
  {
    id: 'violence_self_harm',
    label: 'Violence or self-harm',
    sub: 'Graphic violence, encouragement of self-harm, or glorification of harm.',
    emoji: '🩹',
    priority: 'high',
  },
  {
    id: 'hate',
    label: 'Hate speech',
    sub: 'Attacks on people based on protected characteristics.',
    emoji: '🛑',
    priority: 'high',
  },
  {
    id: 'spam',
    label: 'Spam or scam',
    sub: 'Unsolicited promotions, phishing, or fraud attempts.',
    emoji: '🧹',
    priority: 'normal',
  },
  {
    id: 'impersonation',
    label: 'Impersonation',
    sub: 'Pretending to be another person or organization.',
    emoji: '🎭',
    priority: 'normal',
  },
  {
    id: 'other',
    label: 'Something else',
    sub: 'Doesn’t fit the categories above.',
    emoji: '💬',
    priority: 'normal',
  },
];

const BACKEND = 'https://vaultchat-production-3a96.up.railway.app';

export default function ReportMessageModal({
  visible,
  message,       // the offending message object { id, content, sender_id, sender_handle? }
  roomId,
  roomType,      // 'dm' | 'group'
  reportedUserId,
  reportedUserName,
  onClose,
  onSubmitted,
}) {
  const { bg, card, tx, sub, border, accent, inputBg } = useTheme();
  const [reasonId, setReasonId]       = useState(null);
  const [detail, setDetail]           = useState('');
  const [consent, setConsent]         = useState(false);  // default OFF
  const [submitting, setSubmitting]   = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  // Block-with-report toggle (task #94). Default ON because the user
  // is already opening the report flow — they almost certainly don't
  // want to keep hearing from this person. Unidirectional block stored
  // in `blocked_users` (per-user, not a platform ban).
  const targetUserId = reportedUserId || message?.sender_id || null;
  const [alsoBlock, setAlsoBlock] = useState(
    targetUserId ? !isBlockedSync(targetUserId) : false,
  );

  const reset = () => {
    setReasonId(null);
    setDetail('');
    setConsent(false);
    setConfirmation(false);
    setSubmitting(false);
  };

  const close = () => { reset(); onClose && onClose(); };

  const submit = async () => {
    if (!reasonId) {
      Alert.alert('Pick a reason', 'Please choose what kind of issue you want to report.');
      return;
    }
    const reason = REPORT_REASONS.find(r => r.id === reasonId);
    setSubmitting(true);

    // Build report payload
    const reporter = await getCurrentUser();
    const now      = new Date().toISOString();
    const payload  = {
      reporter_id:        reporter.id,
      reporter_handle:    reporter.handle,
      reported_user_id:   reportedUserId || message?.sender_id || null,
      reported_user_name: reportedUserName || message?.sender_handle || null,
      reported_message_id: message?.id || null,
      room_id:            roomId || null,
      room_type:          roomType || 'dm',
      reason_category:    reason.id,
      reason_detail:      detail.trim() || null,
      priority:           reason.priority,
      consent_to_forward: !!consent,
      // Only include a copy of the content if the reporter
      // consented — otherwise we send metadata only.
      forwarded_content:  consent ? (message?.content || null) : null,
      created_at:         now,
      status:             'pending',
    };

    let delivered = false;

    // 1. Preferred path: Supabase reports table
    if (supabase) {
      try {
        const { error } = await supabase.from('reports').insert(payload);
        if (!error) delivered = true;
      } catch (e) { console.warn('report supabase insert failed:', e); }
    }

    // 2. Fallback: VaultChat backend /report endpoint
    if (!delivered) {
      try {
        const res = await fetch(`${BACKEND}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) delivered = true;
      } catch (e) { console.warn('report backend post failed:', e); }
    }

    // 3. Last-ditch: queue locally so we can retry later.
    if (!delivered) {
      try {
        const raw = await AsyncStorage.getItem('vaultchat_pending_reports');
        const queue = raw ? JSON.parse(raw) : [];
        queue.push(payload);
        await AsyncStorage.setItem('vaultchat_pending_reports', JSON.stringify(queue));
        delivered = true;  // queued for retry; still acknowledge to user
      } catch (e) { console.warn('report local queue failed:', e); }
    }

    // 4. Optionally block the reported user. We do this AFTER the
    // report attempt so the report payload always carries our prior
    // (un-blocked) state — it'd be confusing to the moderator to see
    // a blocked relationship pre-existing the report. Block insert
    // is best-effort; we never let it fail the report flow.
    if (alsoBlock && targetUserId) {
      try {
        await blockUser(targetUserId, {
          reason: `Reported for ${reasonId}`,
          // sourceReportId would require Supabase to return the inserted
          // row's id — we skip the round-trip and leave it null. The
          // moderator dashboard can still join via reported_user_id.
          sourceReportId: null,
        });
      } catch (e) { console.warn('block-with-report failed:', e); }
    }

    setSubmitting(false);

    if (delivered) {
      setConfirmation(true);
      onSubmitted && onSubmitted(payload);
    } else {
      Alert.alert(
        'Couldn’t send report',
        'We couldn’t reach the moderation service. Please check your connection and try again.',
      );
    }
  };

  async function getCurrentUser() {
    try {
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('handle, display_name')
            .eq('id', user.id)
            .single();
          return { id: user.id, handle: profile?.handle || profile?.display_name || 'user' };
        }
      }
    } catch (e) {}
    try {
      const raw  = await AsyncStorage.getItem('vaultchat_user');
      const name = await AsyncStorage.getItem('vaultchat_display_name');
      if (raw) {
        const p = JSON.parse(raw);
        return { id: p.id || p.phone || 'local', handle: name || p.phone || 'user' };
      }
    } catch (e) {}
    return { id: 'unknown', handle: 'user' };
  }

  // ── Confirmation step ───────────────────────────────────────
  if (confirmation) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <View style={s.overlay}>
          <View style={[s.card, { backgroundColor: card }]}>
            <Text style={[s.confirmIcon]}>✓</Text>
            <Text style={[s.confirmTitle, { color: tx }]}>Report sent</Text>
            <Text style={[s.confirmText, { color: sub }]}>
              Thank you. Our safety team reviews reports around the clock. For
              urgent threats to a child’s safety, please also contact local
              authorities or the NCMEC CyberTipline at 1-800-843-5678.
            </Text>
            <TouchableOpacity style={[s.primaryBtn, { backgroundColor: accent }]} onPress={close}>
              <Text style={s.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // ── Main form ───────────────────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: card }]}>
          <View style={[s.handle, { backgroundColor: border }]} />
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            <Text style={[s.title, { color: tx }]}>Report message</Text>
            <Text style={[s.subtitle, { color: sub }]}>
              Your report is confidential. The reported user is not notified.
            </Text>

            {message?.content ? (
              <View style={[s.quote, { backgroundColor: inputBg, borderColor: border }]}>
                <Text style={[s.quoteLabel, { color: sub }]}>Message being reported</Text>
                <Text style={[s.quoteText, { color: tx }]} numberOfLines={3}>
                  {previewOf(message.content)}
                </Text>
              </View>
            ) : null}

            <Text style={[s.sectionLabel, { color: tx }]}>What’s wrong?</Text>
            {REPORT_REASONS.map(r => {
              const selected = reasonId === r.id;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[
                    s.reasonRow,
                    { borderColor: selected ? accent : border, backgroundColor: selected ? accent + '18' : 'transparent' },
                  ]}
                  onPress={() => setReasonId(r.id)}
                  activeOpacity={0.85}
                >
                  <Text style={s.reasonEmoji}>{r.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.reasonLabel, { color: tx }]}>{r.label}</Text>
                    <Text style={[s.reasonSub, { color: sub }]}>{r.sub}</Text>
                  </View>
                  <View style={[s.radio, { borderColor: selected ? accent : border }]}>
                    {selected ? <View style={[s.radioDot, { backgroundColor: accent }]} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}

            <Text style={[s.sectionLabel, { color: tx, marginTop: 14 }]}>Anything else we should know? (optional)</Text>
            <TextInput
              value={detail}
              onChangeText={setDetail}
              multiline
              maxLength={500}
              placeholder="Add context that helps us review this faster…"
              placeholderTextColor={sub}
              style={[s.detailInput, { backgroundColor: inputBg, color: tx, borderColor: border }]}
            />

            <TouchableOpacity
              style={[s.consentRow, { borderColor: border, backgroundColor: inputBg }]}
              onPress={() => setConsent(c => !c)}
              activeOpacity={0.85}
            >
              <View style={[s.checkbox, { borderColor: consent ? accent : border, backgroundColor: consent ? accent : 'transparent' }]}>
                {consent ? <Text style={s.checkmark}>✓</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.consentTitle, { color: tx }]}>
                  Include a copy of this message/media with my report
                </Text>
                <Text style={[s.consentText, { color: sub }]}>
                  VaultChat normally cannot read your messages because they are
                  end-to-end encrypted. Checking this box voluntarily forwards
                  a copy of the reported content to our safety team so they can
                  review it. Leave unchecked to send only metadata (message ID,
                  timestamp, reason).
                </Text>
              </View>
            </TouchableOpacity>

            {/* Block-with-report toggle. Hidden when there's no target
                user we can block (e.g., a system-message report). */}
            {targetUserId ? (
              <TouchableOpacity
                style={[s.consentRow, { borderColor: border, backgroundColor: inputBg }]}
                onPress={() => setAlsoBlock(b => !b)}
                activeOpacity={0.85}
              >
                <View style={[s.checkbox, { borderColor: alsoBlock ? '#ff4444' : border, backgroundColor: alsoBlock ? '#ff4444' : 'transparent' }]}>
                  {alsoBlock ? <Text style={s.checkmark}>✓</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.consentTitle, { color: tx }]}>
                    Also block {reportedUserName || 'this user'}
                  </Text>
                  <Text style={[s.consentText, { color: sub }]}>
                    They won’t be able to send you messages or call you.
                    They aren’t notified. You can unblock anytime in
                    Settings → Privacy → Blocked Users.
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {reasonId === 'csam' ? (
              <View style={[s.csamBanner, { borderColor: '#ff4444' }]}>
                <Text style={[s.csamTitle]}>This is a child-safety report.</Text>
                <Text style={[s.csamText]}>
                  If a child is in immediate danger, call 911. You can also
                  report directly to the NCMEC CyberTipline at
                  report.cybertip.org or 1-800-843-5678. VaultChat will file a
                  CyberTipline report and preserve evidence as required by
                  federal law.
                </Text>
              </View>
            ) : null}

            <View style={s.actions}>
              <TouchableOpacity style={[s.secondaryBtn, { borderColor: border }]} onPress={close} disabled={submitting}>
                <Text style={[s.secondaryBtnText, { color: sub }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: reasonId ? accent : border, opacity: submitting ? 0.6 : 1 }]}
                onPress={submit}
                disabled={!reasonId || submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.primaryBtnText}>Submit report</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function previewOf(content) {
  if (!content) return '';
  if (content.startsWith('REPLY:')) {
    const pipe = content.indexOf('|');
    return content.substring(pipe + 1);
  }
  if (content.startsWith('LOCALIMG:') || content.startsWith('IMG:'))  return '📷 Image';
  if (content.startsWith('LOCALVID:') || content.startsWith('VID:'))  return '🎥 Video';
  if (content.startsWith('FILE:'))                                     return '📎 File';
  return content;
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 34 : 18, maxHeight: '92%' },
  card: { width: '86%', alignSelf: 'center', borderRadius: 20, padding: 24, alignItems: 'center' },
  handle: { width: 44, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 14, lineHeight: 18 },
  quote: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 16 },
  quoteLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  quoteText: { fontSize: 14 },
  sectionLabel: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, marginBottom: 8 },
  reasonEmoji: { fontSize: 22, width: 28, textAlign: 'center' },
  reasonLabel: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  reasonSub: { fontSize: 12, lineHeight: 16 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  detailInput: { minHeight: 80, borderWidth: 1, borderRadius: 12, padding: 12, textAlignVertical: 'top', fontSize: 14, marginBottom: 16 },
  consentRow: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkmark: { color: '#fff', fontWeight: '800' },
  consentTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  consentText: { fontSize: 12, lineHeight: 17 },
  csamBanner: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14, backgroundColor: 'rgba(255,68,68,0.08)' },
  csamTitle: { color: '#ff4444', fontWeight: '700', marginBottom: 4, fontSize: 13 },
  csamText: { color: '#ff8a8a', fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  primaryBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { fontWeight: '700', fontSize: 15 },
  confirmIcon: { fontSize: 48, color: '#26d07c', marginBottom: 8 },
  confirmTitle: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
  confirmText: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 20 },
});
