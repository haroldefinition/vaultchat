// ============================================================
//  GroupMemberMigrationModal
//
//  One-time-per-group helper that turns legacy bare-name members
//  into resolved identities (user_id + vault_handle + phone +
//  public_key) so the per-recipient envelope encryption in
//  groupCrypto.js can actually fire on send.
//
//  The legacy member shape was just `string` (e.g. "John") because
//  GroupScreen's add UI only captured a name. That's not enough to
//  encrypt — we need each recipient's NaCl pubkey. This modal lists
//  every unresolved member, lets the user type their @handle or
//  phone, looks the profile up via findByHandleOrPhone, fetches
//  the pubkey, and writes the enriched member list back to
//  AsyncStorage's `vaultchat_groups`.
//
//  After a successful migration:
//    • The group's stored members carry user_id + public_key
//    • encryptForGroup() succeeds on the next send
//    • GroupChatScreen's amber banner flips green
//
//  The user can resolve members one at a time (each row has its
//  own Resolve button + status) and save partial progress — even
//  a single resolved member means messages can be encrypted to
//  them while the rest stay queued for plaintext until they're
//  resolved later.
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput, StyleSheet,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';
import { findByHandleOrPhone } from '../services/vaultHandle';
import { getPublicKey } from '../services/keyExchange';

const GROUPS_KEY = 'vaultchat_groups';

export default function GroupMemberMigrationModal({ visible, groupId, onClose, onMigrated }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();

  // [{ name, lookup, status: 'idle'|'resolving'|'ok'|'fail', resolved? }]
  const [rows,    setRows]    = useState([]);
  const [saving,  setSaving]  = useState(false);

  // Load the current group's members on open
  useEffect(() => {
    if (!visible || !groupId) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(GROUPS_KEY);
        const groups = raw ? JSON.parse(raw) : [];
        const g = groups.find(x => x.id === groupId);
        if (!g) { setRows([]); return; }
        const seeded = (Array.isArray(g.members) ? g.members : []).map(m => {
          const obj = typeof m === 'string' ? { name: m } : { ...m };
          return {
            name:   obj.name || obj.vault_handle || obj.phone || 'Member',
            // Pre-fill the lookup field with whatever identity we
            // already have on record so the user just has to confirm.
            lookup: obj.vault_handle ? `@${obj.vault_handle}` : (obj.phone || ''),
            status: obj.user_id && obj.public_key ? 'ok' : 'idle',
            resolved: obj.user_id && obj.public_key ? obj : null,
          };
        });
        setRows(seeded);
      } catch {
        setRows([]);
      }
    })();
  }, [visible, groupId]);

  // Resolve a single row by looking up its lookup string.
  async function resolveOne(idx) {
    const row = rows[idx];
    if (!row || !row.lookup?.trim()) return;
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, status: 'resolving' } : r));
    try {
      const profile = await findByHandleOrPhone(row.lookup.trim());
      if (!profile?.id) {
        setRows(prev => prev.map((r, i) => i === idx ? { ...r, status: 'fail', resolved: null } : r));
        return;
      }
      const pk = await getPublicKey(profile.id);
      const resolved = {
        name:         row.name,
        user_id:      profile.id,
        vault_handle: profile.vault_handle || null,
        phone:        profile.phone || null,
        public_key:   pk || null,
      };
      setRows(prev => prev.map((r, i) => i === idx ? { ...r, status: 'ok', resolved } : r));
    } catch {
      setRows(prev => prev.map((r, i) => i === idx ? { ...r, status: 'fail', resolved: null } : r));
    }
  }

  // Save the resolved entries back to AsyncStorage. Unresolved rows
  // keep their original {name} shape so we don't lose the entry —
  // they'll just continue to fall back to plaintext for that member
  // until the user resolves them next time.
  async function saveAll() {
    setSaving(true);
    try {
      const raw = await AsyncStorage.getItem(GROUPS_KEY);
      const groups = raw ? JSON.parse(raw) : [];
      const idx = groups.findIndex(g => g.id === groupId);
      if (idx < 0) {
        Alert.alert('Group not found', 'This group is no longer in your local storage.');
        setSaving(false);
        return;
      }
      const enriched = rows.map(r => r.resolved || { name: r.name });
      groups[idx] = { ...groups[idx], members: enriched };
      await AsyncStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
      const okCount = rows.filter(r => r.status === 'ok').length;
      setSaving(false);
      onMigrated && onMigrated(enriched, okCount);
      onClose && onClose();
      // Soft confirmation — useful for the first migration so the
      // user sees the encryption is now wired.
      if (okCount > 0) {
        Alert.alert(
          'Encryption ready',
          `${okCount} member${okCount === 1 ? '' : 's'} resolved. Future messages to this group will be end-to-end encrypted.`,
        );
      }
    } catch {
      setSaving(false);
      Alert.alert('Couldn’t save', 'Try again in a moment.');
    }
  }

  const okCount = rows.filter(r => r.status === 'ok').length;
  const canSave = okCount > 0 && !saving;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: bg }]}>
          {/* Header */}
          <View style={[s.header, { borderBottomColor: border }]}>
            <TouchableOpacity onPress={onClose}>
              <Text style={[s.cancelTx, { color: accent }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[s.title, { color: tx }]}>Set Up Encryption</Text>
            <TouchableOpacity onPress={saveAll} disabled={!canSave}>
              {saving
                ? <ActivityIndicator color={accent} size="small" />
                : <Text style={[s.saveTx, { color: canSave ? accent : sub }]}>Save</Text>}
            </TouchableOpacity>
          </View>

          {/* Intro */}
          <Text style={[s.intro, { color: sub }]}>
            We need each member's @handle or phone to encrypt messages for them. Resolved members will receive end-to-end encrypted messages going forward.
          </Text>

          {/* Member list */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled">
            {rows.length === 0 && (
              <Text style={[s.empty, { color: sub }]}>This group has no members to migrate.</Text>
            )}
            {rows.map((r, i) => (
              <View key={i} style={[s.row, { backgroundColor: card, borderColor: border }]}>
                <View style={s.rowHeader}>
                  <Text style={[s.rowName, { color: tx }]} numberOfLines={1}>{r.name}</Text>
                  <StatusPill status={r.status} accent={accent} sub={sub} />
                </View>
                <View style={s.rowInputRow}>
                  <TextInput
                    style={[s.input, { color: tx, backgroundColor: inputBg, borderColor: border }]}
                    placeholder="@handle or phone"
                    placeholderTextColor={sub}
                    value={r.lookup}
                    onChangeText={txt => setRows(prev => prev.map((x, j) => j === i ? { ...x, lookup: txt, status: 'idle' } : x))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={() => resolveOne(i)}
                    editable={r.status !== 'resolving'}
                  />
                  <TouchableOpacity
                    style={[s.resolveBtn, { backgroundColor: accent, opacity: r.lookup?.trim() && r.status !== 'resolving' ? 1 : 0.5 }]}
                    onPress={() => resolveOne(i)}
                    disabled={!r.lookup?.trim() || r.status === 'resolving'}>
                    <Text style={s.resolveBtnTx}>Resolve</Text>
                  </TouchableOpacity>
                </View>
                {r.status === 'fail' && (
                  <Text style={[s.errTx, { color: '#ef4444' }]}>
                    No VaultChat user matches that handle / phone.
                  </Text>
                )}
                {r.status === 'ok' && r.resolved?.vault_handle && (
                  <Text style={[s.okTx, { color: '#10B981' }]}>
                    Linked to @{r.resolved.vault_handle}
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function StatusPill({ status, accent, sub }) {
  let label, color, bgC;
  switch (status) {
    case 'ok':        label = '✓ Linked';   color = '#10B981'; bgC = '#10B981' + '22'; break;
    case 'resolving': label = '…';          color = accent;    bgC = accent    + '22'; break;
    case 'fail':      label = '✕ No match'; color = '#ef4444'; bgC = '#ef4444' + '22'; break;
    default:          label = 'Pending';    color = sub;       bgC = sub       + '22'; break;
  }
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: bgC }}>
      <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 22, borderTopRightRadius: 22, height: '85%', overflow: 'hidden' },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title:      { fontSize: 17, fontWeight: '700' },
  cancelTx:   { fontSize: 16 },
  saveTx:     { fontSize: 16, fontWeight: '700' },
  intro:      { fontSize: 13, lineHeight: 18, paddingHorizontal: 18, paddingVertical: 14 },
  row:        { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10 },
  rowHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  rowName:    { fontSize: 15, fontWeight: '700', flex: 1, marginRight: 10 },
  rowInputRow:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  input:      { flex: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, fontSize: 14 },
  resolveBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  resolveBtnTx:{ color: '#fff', fontWeight: '700', fontSize: 13 },
  errTx:      { fontSize: 11, marginTop: 6, fontWeight: '600' },
  okTx:       { fontSize: 11, marginTop: 6, fontWeight: '600' },
  empty:      { fontSize: 14, textAlign: 'center', paddingVertical: 30 },
});
