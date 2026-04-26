// ============================================================
//  BlockedUsersScreen — task #94
//  Settings → Privacy → Blocked Users
//
//  Lists every user the current account has blocked. Each row
//  shows the blocked person's display name, handle/vault id,
//  and a one-tap Unblock button. Source of truth is the
//  Supabase `blocked_users` table (joined to `profiles` for
//  the display fields). Falls back to the local cache when
//  Supabase is unreachable so the screen still renders.
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useTheme } from '../services/theme';
import { taptic } from '../services/haptics';
import { listBlockedUsers, unblockUser, subscribe as subscribeBlocks } from '../services/blocks';

export default function BlockedUsersScreen({ navigation }) {
  const { bg, card, tx, sub, border, accent } = useTheme();
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await listBlockedUsers();
    setRows(data || []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    // Re-load whenever the blocks cache changes (e.g., after unblock,
    // or after a Block-with-report flow elsewhere in the app).
    const unsub = subscribeBlocks(() => load());
    return unsub;
  }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const confirmUnblock = (row) => {
    const name =
      row?.profiles?.display_name ||
      row?.profiles?.handle ||
      'this user';
    Alert.alert(
      `Unblock ${name}?`,
      'They’ll be able to message and call you again. They aren’t notified that they were blocked.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: async () => {
            taptic();
            await unblockUser(row.blocked_id);
            // The subscribe() listener triggers reload, but call load()
            // directly too for instant UI feedback in case the listener
            // fires after the optimistic cache update.
            load();
          },
        },
      ],
    );
  };

  const renderRow = ({ item }) => {
    const name =
      item?.profiles?.display_name ||
      item?.profiles?.handle ||
      'Unknown user';
    const handle =
      item?.profiles?.handle ||
      item?.profiles?.vault_id ||
      item.blocked_id;
    return (
      <View style={[s.row, { borderBottomColor: border }]}>
        <View style={[s.avatar, { backgroundColor: accent + '33' }]}>
          <Text style={[s.avatarTx, { color: accent }]}>
            {name?.[0]?.toUpperCase() || '?'}
          </Text>
        </View>
        <View style={s.info}>
          <Text style={[s.name, { color: tx }]} numberOfLines={1}>{name}</Text>
          <Text style={[s.handle, { color: sub }]} numberOfLines={1}>{handle}</Text>
        </View>
        <TouchableOpacity
          style={[s.unblockBtn, { borderColor: accent }]}
          onPress={() => confirmUnblock(item)}>
          <Text style={[s.unblockTx, { color: accent }]}>Unblock</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <View style={[s.header, { borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerBtn}>
          <Text style={[s.headerBtnTx, { color: accent }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: tx }]}>Blocked Users</Text>
        <View style={s.headerBtn} />
      </View>

      {loading ? (
        <View style={s.loading}>
          <ActivityIndicator color={accent} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => r.id || r.blocked_id || String(i)}
          renderItem={renderRow}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🛡️</Text>
              <Text style={[s.emptyTitle, { color: tx }]}>No one blocked</Text>
              <Text style={[s.emptySub, { color: sub }]}>
                Anyone you block will show up here. Tap a message and choose
                Report → “Also block this user” to add someone.
              </Text>
            </View>
          }
          contentContainerStyle={rows.length === 0 ? { flexGrow: 1, justifyContent: 'center' } : null}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1 },
  headerBtn:  { minWidth: 60 },
  headerBtnTx:{ fontSize: 16, fontWeight: '600' },
  title:      { fontSize: 18, fontWeight: '700' },
  loading:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row:        { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, gap: 12 },
  avatar:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarTx:   { fontWeight: '800', fontSize: 18 },
  info:       { flex: 1 },
  name:       { fontSize: 15, fontWeight: '700' },
  handle:     { fontSize: 12, marginTop: 2 },
  unblockBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1.5 },
  unblockTx:  { fontWeight: '700', fontSize: 13 },
  empty:      { alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub:   { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
