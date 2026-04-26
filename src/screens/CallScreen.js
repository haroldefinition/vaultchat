import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Vibration,
  Modal, TextInput, ScrollView, Animated, Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../services/theme';
import { setupCallKit } from '../services/callkit';
import * as ImagePicker from 'expo-image-picker';
import ContactEditModal from '../components/ContactEditModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { placeCall } from '../services/placeCall';
import * as callLog from '../services/callLog';

// ── Humanize timestamp ────────────────────────────────────────
// "Today, 5:42 PM" / "Yesterday, 2:10 PM" / "Mon, 11:05 AM" / "Apr 3, 11:05 AM"
function formatCallTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfDay) / 86400000);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  if (dayDiff < 7)    return `${d.toLocaleDateString([], { weekday: 'short' })}, ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

function formatDuration(sec) {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// Renderer-level adapter — the log schema uses direction+status, but the
// existing row/info-modal UI was written around a single `type` field
// (incoming | outgoing | missed). Map the log entry into that shape so
// the layout code stays untouched. 'declined' and 'cancelled' both show
// as 'missed' in the list — they're all "did not connect" from the user's
// perspective, and the info modal still shows the true status underneath.
function adaptEntry(entry) {
  const isMissed = entry.status === 'missed' || entry.status === 'declined' || entry.status === 'cancelled';
  const type = isMissed
    ? 'missed'
    : (entry.direction === 'outgoing' ? 'outgoing' : 'incoming');
  return {
    id:           entry.id,
    type,
    name:         entry.peerName || entry.peerPhone || 'Unknown',
    number:       entry.peerPhone || '',
    peerUserId:   entry.peerUserId || null,
    time:         formatCallTime(entry.endedAt || entry.startedAt),
    duration:     formatDuration(entry.durationSec),
    callType:     entry.callType || 'voice',
    status:       entry.status,
    direction:    entry.direction,
    _raw:         entry,
  };
}

const VOICEMAILS = [
  { id:'vm1', from:'Mom',         phone:'+1 555 234 5678', duration:'0:42', date:'Today 9:14 AM',     read:false },
  { id:'vm2', from:'Dr. Johnson', phone:'+1 555 876 5432', duration:'1:18', date:'Yesterday 2:30 PM', read:false },
  { id:'vm3', from:'John Smith',  phone:'+1 555 345 6789', duration:'0:25', date:'Mon 11:05 AM',      read:true  },
  { id:'vm4', from:'Unknown',     phone:'+1 555 000 1234', duration:'0:12', date:'Sun 6:48 PM',       read:true  },
];

// ── Animated waveform ─────────────────────────────────────────
function Waveform({ accent }) {
  const bars = useRef(Array.from({ length: 18 }, () => new Animated.Value(0.3))).current;

  useEffect(() => {
    const anims = bars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar, { toValue: 0.3 + Math.random() * 0.7, duration: 220 + i * 25, useNativeDriver: true }),
          Animated.timing(bar, { toValue: 0.2, duration: 220 + i * 25, useNativeDriver: true }),
        ])
      )
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 22, flex: 1, paddingHorizontal: 4 }}>
      {bars.map((bar, i) => (
        <Animated.View key={i} style={{ width: 3, borderRadius: 2, backgroundColor: accent, height: 20, transform: [{ scaleY: bar }] }} />
      ))}
    </View>
  );
}

// ── Voicemail tab ─────────────────────────────────────────────
function VoicemailTab({ accent, card, tx, sub, border, inputBg, navigation }) {
  const [vms,     setVms]     = useState(VOICEMAILS);
  const [playing, setPlaying] = useState(null);

  const unread = vms.filter(v => !v.read).length;

  function markRead(id) { setVms(prev => prev.map(v => v.id === id ? { ...v, read: true } : v)); }
  function deleteVm(id) {
    Alert.alert('Delete', 'Delete this voicemail?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => setVms(prev => prev.filter(v => v.id !== id)) },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      {unread > 0 && (
        <View style={{ backgroundColor: accent + '22', marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 12 }}>
          <Text style={{ color: accent, fontWeight: '700', fontSize: 13 }}>
            {unread} new voicemail{unread > 1 ? 's' : ''}
          </Text>
        </View>
      )}
      {vms.length === 0 && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Text style={{ fontSize: 48 }}>📭</Text>
          <Text style={{ color: sub, fontSize: 15 }}>No voicemails</Text>
        </View>
      )}
      <FlatList
        data={vms}
        keyExtractor={v => v.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: border }}>
            {/* Header row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: item.read ? border : accent + '33', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20 }}>📞</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: tx, fontWeight: '700', fontSize: 15 }}>{item.from}</Text>
                  {!item.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />}
                </View>
                <Text style={{ color: sub, fontSize: 12 }}>{item.phone}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={{ color: sub, fontSize: 11 }}>{item.date}</Text>
                <Text style={{ color: sub, fontSize: 11 }}>⏱ {item.duration}</Text>
              </View>
            </View>
            {/* Controls */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: border }}>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: playing === item.id ? accent + '33' : inputBg, borderRadius: 12, paddingVertical: 10 }}
                onPress={() => { setPlaying(p => p === item.id ? null : item.id); markRead(item.id); }}>
                <Text style={{ fontSize: 16 }}>{playing === item.id ? '⏸' : '▶️'}</Text>
                {playing === item.id
                  ? <Waveform accent={accent} />
                  : <Text style={{ color: tx, fontWeight: '600', fontSize: 13 }}>Play</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: accent, borderRadius: 12 }}
                onPress={() => placeCall({ navigation, recipientName: item.from, recipientPhone: item.phone, type: 'voice' })}>
                <Text style={{ color: '#000', fontWeight: '700', fontSize: 13 }}>Call Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#ff3b3022', borderRadius: 12 }}
                onPress={() => deleteVm(item.id)}>
                <Text style={{ fontSize: 16 }}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

// ── Edit contact from call history ────────────────────────────
function CallContactEditor({ item, onClose, onSave, accent, bg, card, tx, sub, border }) {
  const [name, setName] = useState(item?.name   || '');
  const [num,  setNum]  = useState(item?.number || '');
  const [photo, setPhoto] = useState(item?.photo || null);

  async function pickPhoto() {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) { Alert.alert('Permission needed'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 1, allowsEditing: true, aspect: [1, 1] });
    if (!r.canceled && r.assets?.[0]) setPhoto(r.assets[0].uri);
  }

  return (
    <View style={{ backgroundColor: bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 44 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }}>
        <TouchableOpacity onPress={onClose}><Text style={{ color: sub, fontSize: 16 }}>Cancel</Text></TouchableOpacity>
        <Text style={{ color: tx, fontWeight: '700', fontSize: 17 }}>Edit Contact</Text>
        <TouchableOpacity onPress={() => onSave({ ...item, name, number: num, photo })}><Text style={{ color: accent, fontWeight: '700', fontSize: 16 }}>Save</Text></TouchableOpacity>
      </View>
      <View style={{ padding: 20, gap: 12 }}>
        <TouchableOpacity onPress={pickPhoto} style={{ alignItems: 'center', marginBottom: 8 }}>
          {photo
            ? <Image source={{ uri: photo }} style={{ width: 88, height: 88, borderRadius: 44 }} />
            : <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: accent + '33', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 36, color: tx, fontWeight: '700' }}>{name?.[0]?.toUpperCase() || '?'}</Text>
              </View>
          }
          <Text style={{ color: accent, fontWeight: '600', marginTop: 8 }}>{photo ? 'Change Photo' : 'Add Photo'}</Text>
        </TouchableOpacity>
        {[['Name', name, setName, 'default'], ['Phone Number', num, setNum, 'phone-pad']].map(([label, val, setter, kb]) => (
          <View key={label} style={{ backgroundColor: card, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ color: sub, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>{label.toUpperCase()}</Text>
            <TextInput style={{ color: tx, fontSize: 16 }} value={val} onChangeText={setter}
              keyboardType={kb} autoCapitalize={kb === 'default' ? 'words' : 'none'}
              placeholder={label} placeholderTextColor={sub} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Main CallScreen ───────────────────────────────────────────
export default function CallScreen({ navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [calls,          setCalls]          = useState([]);
  const [tab,            setTab]            = useState('recent');
  const [dialInput,      setDialInput]      = useState('');
  const [editCallModal,  setEditCallModal]  = useState(false);
  const [infoModal,      setInfoModal]      = useState(false);
  const [infoTarget,     setInfoTarget]     = useState(null);
  const [editCallTarget, setEditCallTarget] = useState(null);

  useEffect(() => {
    setupCallKit();
  }, []);

  // Refresh on initial mount + on tab focus + on every call log write.
  // Focus covers: returning from ActiveCallScreen after a call ends.
  // The subscribe() callback covers: in-app writes that happen while the
  // tab is already mounted (e.g. a missed call arrives while looking at
  // the Recent list — it should appear without needing a blur/focus cycle).
  useFocusEffect(
    React.useCallback(() => {
      loadCalls();
      const unsub = callLog.subscribe(loadCalls);
      return () => unsub();
    }, [])
  );

  async function loadCalls() {
    try {
      const entries = await callLog.listCalls();
      setCalls(entries.map(adaptEntry));
    } catch {
      setCalls([]);
    }
  }

  function makeCall(nameOrObj, number, type = 'voice') {
    // Accept either the legacy (name, number, type) signature OR a single
    // row object so callers can pass the adapted entry directly and we can
    // forward peerUserId to placeCall for the fast userId-first routing path.
    if (typeof nameOrObj === 'object' && nameOrObj) {
      const row = nameOrObj;
      placeCall({
        navigation,
        peerUserId:     row.peerUserId || undefined,
        recipientName:  row.name || '',
        recipientPhone: row.number || '',
        type:           type || row.callType || 'voice',
      });
      return;
    }
    if (!number && !nameOrObj) { Alert.alert('Enter a number'); return; }
    placeCall({ navigation, recipientName: nameOrObj || '', recipientPhone: number, type });
  }

  function confirmDeleteCall(item) {
    Alert.alert(
      'Delete from Recents',
      `Remove this call with ${item.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
            await callLog.deleteCall(item.id);
            // subscribe() will trigger a reload — nothing else to do.
        }},
      ]
    );
  }

  function confirmClearAll() {
    if (calls.length === 0) return;
    Alert.alert(
      'Clear all recents?',
      'This removes every call from your Recents list. Active calls aren’t affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear All', style: 'destructive', onPress: async () => { await callLog.clearCalls(); }},
      ]
    );
  }

  function addDigit(d) { Vibration.vibrate(15); setDialInput(p => p.length < 10 ? p + d : p); }
  function deleteDigit()  { setDialInput(p => p.slice(0, -1)); }

  const typeColor = type => type === 'missed' ? '#ff4444' : tx;
  const typeIcon  = type => type === 'incoming' ? '↙' : type === 'outgoing' ? '↗' : '✗';

  // Sub-line label that reflects the real underlying status (missed vs
  // declined vs cancelled all render as red 'missed' style upstream, but
  // we still want to tell the user what actually happened).
  function subLineLabel(item) {
    const { status, direction } = item;
    if (status === 'completed') return direction === 'incoming' ? 'Incoming' : 'Outgoing';
    if (status === 'missed')    return 'Missed';
    if (status === 'declined')  return direction === 'incoming' ? 'Declined' : 'Peer declined';
    if (status === 'cancelled') return 'Cancelled';
    return direction === 'incoming' ? 'Incoming' : 'Outgoing';
  }

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header — two-row layout:
          Row 1: big "Calls" title + right-aligned action icons (trash, +)
          Row 2: full-width segmented tab toggle
          This matches the iOS Phone app and stops the trash + plus from
          crowding the Voicemail/Keypad tab labels on smaller widths. */}
      <View style={[s.header, { borderBottomColor: border }]}>
        <View style={s.headerTop}>
          <Text style={[s.title, { color: accent }]}>Calls</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {tab === 'recent' && calls.length > 0 && (
              <TouchableOpacity
                style={[s.iconBtn, { backgroundColor: '#ff3b3022' }]}
                onPress={confirmClearAll}
                accessibilityLabel="Clear all recents">
                <Text style={{ fontSize: 16 }}>🗑</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.iconBtn, { backgroundColor: accent }]} onPress={() => navigation.navigate('NewCall')}>
              <Text style={s.plusCircleText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={[s.tabToggle, { backgroundColor: card, borderColor: border }]}>
          <TouchableOpacity style={[s.tabBtn, tab === 'recent'    && { backgroundColor: accent }]} onPress={() => setTab('recent')}>
            <Text style={[s.tabBtnText, { color: tab === 'recent'    ? '#fff' : sub }]}>Recent</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tabBtn, tab === 'voicemail' && { backgroundColor: accent }]} onPress={() => setTab('voicemail')}>
            <Text style={[s.tabBtnText, { color: tab === 'voicemail' ? '#fff' : sub }]}>Voicemail</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tabBtn, tab === 'keypad'    && { backgroundColor: accent }]} onPress={() => setTab('keypad')}>
            <Text style={[s.tabBtnText, { color: tab === 'keypad'    ? '#fff' : sub }]}>Keypad</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab content */}
      {tab === 'voicemail' ? (
        <VoicemailTab accent={accent} card={card} tx={tx} sub={sub} border={border} inputBg={inputBg} navigation={navigation} />
      ) : tab === 'keypad' ? (
        <View style={s.keypadPage}>
          <View style={s.displayBox}>
            <Text style={[s.displayText, { color: tx }]}>
              {dialInput
                ? `+1 ${dialInput.slice(0,3)}${dialInput.length > 3 ? ' ' : ''}${dialInput.slice(3,6)}${dialInput.length > 6 ? ' ' : ''}${dialInput.slice(6)}`
                : 'Enter number'}
            </Text>
            {/* The ⌫ button used to live here, but it was easy to miss in
                the display box. Moved to flank the green Call button below
                so it's discoverable in the same finger-zone you already
                used to dial. iPhone Phone-app style. */}
          </View>
          <View style={s.keypadGrid}>
            {[
              [{ d: '1', sub2: '' },   { d: '2', sub2: 'ABC' }, { d: '3', sub2: 'DEF' }],
              [{ d: '4', sub2: 'GHI' },{ d: '5', sub2: 'JKL' }, { d: '6', sub2: 'MNO' }],
              [{ d: '7', sub2: 'PQRS'},{ d: '8', sub2: 'TUV' }, { d: '9', sub2: 'WXYZ'}],
              [{ d: '*', sub2: '' },   { d: '0', sub2: '+' },   { d: '#', sub2: '' }],
            ].map((row, ri) => (
              <View key={ri} style={s.keyRow}>
                {row.map(({ d, sub2 }) => (
                  <TouchableOpacity key={d} style={[s.dialKey, { backgroundColor: card, borderColor: border }]} onPress={() => addDigit(d)}>
                    <Text style={[s.dialDigit, { color: tx }]}>{d}</Text>
                    {sub2 ? <Text style={[s.dialSub, { color: sub }]}>{sub2}</Text> : null}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
          {/* Three-column row centered on the green Call button:
                [spacer] [📞 Call] [⌫ Delete]
              The ⌫ button only appears once you've entered at least one
              digit — same conditional as before, just relocated to a
              spot that's actually visible. iPhone Phone-app style. */}
          <View style={s.callBtnRow}>
            <View style={s.dialSideSlot} />
            <TouchableOpacity
              style={[s.greenCallBtn, { opacity: dialInput.length >= 10 ? 1 : 0.4 }]}
              onPress={() => makeCall('', dialInput, 'voice')} disabled={dialInput.length < 10}>
              <Text style={s.greenCallIcon}>📞</Text>
            </TouchableOpacity>
            <View style={s.dialSideSlot}>
              {dialInput.length > 0 && (
                <TouchableOpacity
                  onPress={deleteDigit}
                  onLongPress={() => setDialInput('')}
                  delayLongPress={500}
                  style={s.dialDeleteBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={[s.dialDeleteIcon, { color: tx }]}>⌫</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={[s.facetimeCallBtn, { opacity: dialInput.length >= 10 ? 1 : 0.4 }]}
            onPress={() => makeCall('', dialInput, 'video')} disabled={dialInput.length < 10}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>📹 FaceTime</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            data={calls}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              // Long-press on the row → delete confirmation. Feels natural
              // for a single-row destructive action without adding swipes.
              <TouchableOpacity
                activeOpacity={0.85}
                delayLongPress={350}
                onLongPress={() => confirmDeleteCall(item)}
                onPress={() => { setInfoTarget(item); setInfoModal(true); }}>
                <View style={[s.callItem, { borderBottomColor: border }]}>
                  <TouchableOpacity
                    style={[s.avatar, { backgroundColor: item.type === 'missed' ? '#ff4444' : accent }]}
                    onPress={() => { setEditCallTarget(item); setEditCallModal(true); }}>
                    <Text style={s.avatarText}>{(item.name || '?')[0]}</Text>
                  </TouchableOpacity>
                  <View style={s.callInfo}>
                    <Text style={[s.callName, { color: typeColor(item.type) }]}>{item.name}</Text>
                    <Text style={[s.callSub, { color: sub }]}>
                      {typeIcon(item.type)} {subLineLabel(item)} · {item.callType === 'video' ? '📹 ' : ''}{item.time}
                    </Text>
                    {item.duration ? <Text style={[s.callDuration, { color: sub }]}>⏱ {item.duration}</Text> : null}
                  </View>
                  <View style={s.callActions}>
                    <TouchableOpacity
                      style={[s.infoBtn, { borderColor: accent }]}
                      onPress={() => { setInfoTarget(item); setInfoModal(true); }}>
                      <Text style={[s.infoBtnText, { color: accent }]}>i</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.callBtn, { backgroundColor: '#34C759' }]} onPress={() => makeCall(item, null, 'voice')}>
                      <Text style={{ fontSize: 18 }}>📞</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.callBtn, { backgroundColor: '#1a73e8' }]} onPress={() => makeCall(item, null, 'video')}>
                      <Text style={{ fontSize: 18 }}>📹</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={s.emptyIcon}>📞</Text>
                <Text style={[s.emptyText, { color: tx }]}>No recent calls</Text>
                <Text style={[s.emptySub, { color: sub }]}>
                  Place or receive a call and it will show up here.
                </Text>
                <TouchableOpacity
                  style={[s.emptyCta, { backgroundColor: accent }]}
                  onPress={() => navigation.navigate('NewCall')}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>＋ New Call</Text>
                </TouchableOpacity>
              </View>
            }
          />
        </View>
      )}

      {/* Call info modal */}
      <Modal visible={infoModal} transparent animationType="fade" onRequestClose={() => setInfoModal(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setInfoModal(false)}>
          <View style={[s.infoSheet, { backgroundColor: card }]}>
            {/* Caller avatar */}
            <View style={[s.infoAvatar, { backgroundColor: infoTarget?.type === 'missed' ? '#ff444433' : accent + '33' }]}>
              <Text style={[s.infoAvatarTx, { color: infoTarget?.type === 'missed' ? '#ff4444' : accent }]}>
                {(infoTarget?.name || '?')[0]}
              </Text>
            </View>
            <Text style={[s.infoName, { color: tx }]}>{infoTarget?.name || 'Unknown'}</Text>
            <Text style={[s.infoNumber, { color: sub }]}>{infoTarget?.number || ''}</Text>

            {/* Detail rows */}
            <View style={[s.infoDivider, { backgroundColor: border }]} />
            {[
              { icon: typeIcon(infoTarget?.type || 'incoming'), label: 'Type',     val: infoTarget?.type === 'incoming' ? 'Incoming Call' : infoTarget?.type === 'outgoing' ? 'Outgoing Call' : 'Missed Call' },
              { icon: '🕐',                                      label: 'Time',     val: infoTarget?.time || '—' },
              { icon: '⏱',                                      label: 'Duration', val: infoTarget?.duration || 'N/A' },
            ].map(row => (
              <View key={row.label} style={[s.infoRow, { borderBottomColor: border }]}>
                <Text style={{ fontSize: 18, width: 30 }}>{row.icon}</Text>
                <Text style={[s.infoRowLabel, { color: sub }]}>{row.label}</Text>
                <Text style={[s.infoRowVal, { color: tx }]}>{row.val}</Text>
              </View>
            ))}
            <View style={[s.infoDivider, { backgroundColor: border }]} />

            {/* Action buttons */}
            <View style={s.infoActions}>
              <TouchableOpacity style={[s.infoActionBtn, { backgroundColor: '#34C75922' }]}
                onPress={() => { setInfoModal(false); if (infoTarget) makeCall(infoTarget, null, 'voice'); }}>
                <Text style={{ fontSize: 22 }}>📞</Text>
                <Text style={{ color: '#34C759', fontSize: 12, fontWeight: '600', marginTop: 4 }}>Call Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.infoActionBtn, { backgroundColor: '#1a73e822' }]}
                onPress={() => { setInfoModal(false); if (infoTarget) makeCall(infoTarget, null, 'video'); }}>
                <Text style={{ fontSize: 22 }}>📹</Text>
                <Text style={{ color: '#1a73e8', fontSize: 12, fontWeight: '600', marginTop: 4 }}>FaceTime</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.infoActionBtn, { backgroundColor: accent + '22' }]}
                onPress={() => { setInfoModal(false); setEditCallTarget(infoTarget); setEditCallModal(true); }}>
                <Text style={{ fontSize: 22 }}>✏️</Text>
                <Text style={[{ fontSize: 12, fontWeight: '600', marginTop: 4, color: accent }]}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.infoActionBtn, { backgroundColor: '#ff3b3022' }]}
                onPress={() => { const t = infoTarget; setInfoModal(false); if (t) confirmDeleteCall(t); }}>
                <Text style={{ fontSize: 22 }}>🗑</Text>
                <Text style={{ color: '#ff3b30', fontSize: 12, fontWeight: '600', marginTop: 4 }}>Delete</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[s.infoDismiss, { borderTopColor: border }]} onPress={() => setInfoModal(false)}>
              <Text style={{ color: sub, fontWeight: '600', fontSize: 16 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Universal contact edit modal — writes the new display name back
          to the call log so it persists across restarts. renameCallPeer
          also propagates to every other entry for the same peerUserId,
          matching the iOS Recents rename UX. */}
      <ContactEditModal
        visible={editCallModal}
        contact={editCallTarget}
        onClose={() => { setEditCallModal(false); setEditCallTarget(null); }}
        onSave={async (updated) => {
          try {
            if (updated?.id && updated?.name) {
              await callLog.renameCallPeer(updated.id, updated.name);
            }
          } catch {}
          setEditCallModal(false); setEditCallTarget(null);
        }}
        colors={{ bg, card, tx, sub, border, inputBg, accent }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1 },
  header:           { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 14 },
  headerTop:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:            { fontSize: 28, fontWeight: '800' },
  iconBtn:          { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  plusCircleBtn:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  plusCircleText:   { color: '#000', fontSize: 24, fontWeight: '300', lineHeight: 28 },
  // Segmented control: equal-width flex tabs + rounded pill container.
  // padding on the container gives the iOS "inset" look around the active segment.
  tabToggle:        { flexDirection: 'row', borderRadius: 22, borderWidth: 1, padding: 3 },
  tabBtn:           { flex: 1, paddingVertical: 8, borderRadius: 19, alignItems: 'center' },
  tabBtnText:       { fontSize: 13, fontWeight: '700' },
  featureBanner:    { margin: 12, padding: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  featureText:      { fontSize: 11, fontWeight: 'bold', textAlign: 'center' },
  empty:            { alignItems: 'center', justifyContent: 'center', padding: 60 },
  emptyIcon:        { fontSize: 48, marginBottom: 12 },
  emptyText:        { fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  emptySub:         { fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
  emptyCta:         { marginTop: 20, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 22 },
  callItem:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  avatar:           { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText:       { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  callInfo:         { flex: 1, marginLeft: 14 },
  callName:         { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  callSub:          { fontSize: 13, marginBottom: 2 },
  callDuration:     { fontSize: 12 },
  callActions:      { flexDirection: 'row', gap: 8 },
  callBtn:          { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  keypadPage:       { flex: 1, alignItems: 'center', paddingTop: 20 },
  displayBox:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 60, paddingHorizontal: 24, marginBottom: 20 },
  displayText:      { fontSize: 34, fontWeight: '300', letterSpacing: 4 },
  deleteBtn:        { position: 'absolute', right: 24 },
  keypadGrid:       { width: '100%', paddingHorizontal: 40, gap: 12 },
  keyRow:           { flexDirection: 'row', justifyContent: 'space-around' },
  dialKey:          { width: 76, height: 76, borderRadius: 38, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dialDigit:        { fontSize: 28, fontWeight: '400' },
  dialSub:          { fontSize: 10 },
  callBtnRow:       {
    marginTop: 24, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  // Equal-width side slots so the green Call button stays optically
  // centered whether the ⌫ delete button is visible or not.
  dialSideSlot:     { width: 70, alignItems: 'center', justifyContent: 'center' },
  dialDeleteBtn:    { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  dialDeleteIcon:   { fontSize: 26, fontWeight: '500' },
  greenCallBtn:     { width: 70, height: 70, borderRadius: 35, backgroundColor: '#34C759', alignItems: 'center', justifyContent: 'center', marginHorizontal: 32 },
  greenCallIcon:    { fontSize: 30 },
  facetimeCallBtn:  { marginTop: 16, paddingHorizontal: 28, paddingVertical: 14, backgroundColor: '#1a73e8', borderRadius: 30, alignItems: 'center' },
  infoBtn:         { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  infoBtnText:     { fontSize: 14, fontWeight: '800', lineHeight: 18 },
  infoSheet:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 40, paddingTop: 8 },
  infoAvatar:      { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 20, marginBottom: 12 },
  infoAvatarTx:    { fontSize: 34, fontWeight: '700' },
  infoName:        { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  infoNumber:      { fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  infoDivider:     { height: 1, marginHorizontal: 0, marginVertical: 8 },
  infoRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  infoRowLabel:    { fontSize: 14, width: 70 },
  infoRowVal:      { fontSize: 14, fontWeight: '600', flex: 1 },
  infoActions:     { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 24, paddingVertical: 16 },
  infoActionBtn:   { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 18, minWidth: 90 },
  infoDismiss:     { alignItems: 'center', paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth },

});
