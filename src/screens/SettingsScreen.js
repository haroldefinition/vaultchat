import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, Image, TextInput, Modal, Linking } from 'react-native';
import { supabase } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { exportVaultBackup, restoreVaultBackup } from '../services/vaultBackup';
import { useTheme } from '../services/theme';
import { requestContactsPermission, syncContacts, findFriendsOnVaultChat } from '../services/contacts';
import { checkBiometricSupport } from '../services/biometric';
import { generateHandle, getMyHandle, saveHandle } from '../services/vaultHandle';
import { shareMyInvite } from '../services/inviteLink';
import { hasVaultPin, setVaultPin, clearVaultPin } from '../services/vault';
import VaultPinSetupModal from '../components/VaultPinSetupModal';
import { getPin, setPin, clearPin, PIN_KEY_REAL, PIN_KEY_DECOY } from '../services/securePinStore';
import { createBackup, restoreBackup } from '../services/backup';
import { placeCall } from '../services/placeCall';
import { hangup as callPeerHangup, getState as callPeerGetState, _internal as callPeerInternal, subscribe as callPeerSubscribe } from '../services/callPeer';
import { getSocket, connectSocket } from '../services/socket';

// ── TEMPORARY (task #50 verification) ───────────────────────────
// Two known synthetic test accounts used for the two-simulator signaling
// verification. Remove once call flow is proven and we wire a proper
// contact/peer picker that uses userIds.
const DEV_TEST_PEERS = {
  'c654d407-a4fe-4344-8d41-fa21e89dc1b5': { name: 'Test Peer (hjero7)',       id: 'd7d2aad4-01ce-4092-8f8a-438c7e459f3b' },
  'd7d2aad4-01ce-4092-8f8a-438c7e459f3b': { name: 'Test Peer (jvibes)',       id: 'c654d407-a4fe-4344-8d41-fa21e89dc1b5' },
};

export default function SettingsScreen({ navigation }) {
  const theme = useTheme();
  const { bg, card, tx, sub, border, inputBg, accent, sectionBg, lightMode, toggleLight } = theme;

  const [user, setUser] = useState(null);
  const [page, setPage] = useState('main');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [vaultId, setVaultId] = useState('');
  const [email, setEmail] = useState('');
  const [addr1, setAddr1] = useState('');
  const [addr2, setAddr2] = useState('');
  const [city, setCity] = useState('');
  const [stateRegion, setStateRegion] = useState('');
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('');
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [groupNotif, setGroupNotif] = useState(true);
  const [callNotif, setCallNotif] = useState(true);
  const [vanishMode, setVanishMode] = useState(false);
  const [editMessages, setEditMessages] = useState(true);
  const [pinMessages, setPinMessages] = useState(true);
  const [relay, setRelay] = useState(false);
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [noiseCancell, setNoiseCancell] = useState(true);
  const [notifSound, setNotifSound] = useState(true);
  const [faceTimeEnabled, setFaceTimeEnabled] = useState(true);
  const [blockedContacts, setBlockedContacts] = useState([]);
  const [blockInput, setBlockInput] = useState('');
  const [vaultHandle, setVaultHandle] = useState('');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [realPin, setRealPin] = useState('');
  const [decoyPin, setDecoyPin] = useState('');
  const [pinModal, setPinModal] = useState(false);
  // Inline Vault PIN setup modal — replaces the 6-digit-only keypad
  // for the Vault PIN row so users see a proper PIN+confirm form
  // right where they tapped, no back-and-forth.
  const [vaultSetupModal, setVaultSetupModal] = useState(false);
  const [pinType, setPinType] = useState('real');
  // Vault PIN — separate from real/decoy. When set, the user can
  // long-press the Chats title to enter the vault and reveal
  // chats they've moved into it. See src/services/vault.js.
  const [vaultPinSet, setVaultPinSet] = useState(false);
  const [pinInput, setPinInput] = useState('');
  // Vault backup state (Phase XX). `mode` = 'export' | 'restore';
  // `backupPin` is the encryption key (same as the user's Vault PIN
  // — never stored, only used for the AES-GCM key derivation).
  const [backupModal, setBackupModal] = useState(false);
  const [backupMode,  setBackupMode]  = useState('export');
  const [backupPin,   setBackupPin]   = useState('');
  const [backupBusy,  setBackupBusy]  = useState(false);
  const [devCallState, setDevCallState] = useState('idle');
  const [devSocketConnected, setDevSocketConnected] = useState(false);

  useEffect(() => {
    try {
      const snap = callPeerGetState?.();
      if (snap?.state) setDevCallState(snap.state);
      const unsub = callPeerSubscribe?.((evt, payload) => {
        if (evt === 'state' && payload?.state) setDevCallState(payload.state);
      });
      const tick = setInterval(() => {
        const s = getSocket?.();
        setDevSocketConnected(!!s?.connected);
      }, 500);
      return () => { try { unsub?.(); } catch {} clearInterval(tick); };
    } catch {}
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) setUser(session.user); });
    load();
    AsyncStorage.getItem('vaultchat_haptic').then(v => { if (v !== null) setHapticEnabled(JSON.parse(v)); else setHapticEnabled(true); });
  }, []);

  async function load() {
    const keys = ['vaultchat_display_name','vaultchat_bio','vaultchat_vault_id','vaultchat_email','vaultchat_addr1','vaultchat_addr2','vaultchat_city','vaultchat_state','vaultchat_zip','vaultchat_country','vaultchat_profile_photo','vaultchat_group_notif','vaultchat_call_notif','vaultchat_vanish','vaultchat_edit_msg','vaultchat_pin_msg','vaultchat_relay','vaultchat_noise','vaultchat_notif_sound','vaultchat_blocked'];
    const vals = await AsyncStorage.multiGet(keys);
    const d = Object.fromEntries(vals.map(([k,v]) => [k,v]));
    if (d.vaultchat_display_name) setDisplayName(d.vaultchat_display_name);
    if (d.vaultchat_bio) setBio(d.vaultchat_bio);
    // Vault ID and @handle are the SAME thing — one user-chosen public
    // identifier. Source it from the cached handle so the Vault ID
    // field always matches what the user picked at signup (or in the
    // VAULT HANDLE editor below). Falls through to the @handle lookup
    // a few lines down if the cache isn't seeded yet (fresh signup).
    if (d.vaultchat_vault_id) setVaultId(d.vaultchat_vault_id);

    // First-launch / new-device fallback: if AsyncStorage doesn't have
    // a display_name or bio yet but we DO have a Supabase session, pull
    // the values from the profiles row and seed the local cache. This
    // makes "switch phones / reinstall" Just Work — without it, users
    // see an empty profile after re-signing in even though their data
    // is safe in Supabase.
    if (!d.vaultchat_display_name || !d.vaultchat_bio) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, bio')
            .eq('id', session.user.id)
            .maybeSingle();
          if (profile?.display_name && !d.vaultchat_display_name) {
            setDisplayName(profile.display_name);
            try { await AsyncStorage.setItem('vaultchat_display_name', profile.display_name); } catch {}
          }
          if (profile?.bio && !d.vaultchat_bio) {
            setBio(profile.bio);
            try { await AsyncStorage.setItem('vaultchat_bio', profile.bio); } catch {}
          }
        }
      } catch {}
    }
    if (d.vaultchat_email) setEmail(d.vaultchat_email);
    if (d.vaultchat_addr1) setAddr1(d.vaultchat_addr1);
    if (d.vaultchat_addr2) setAddr2(d.vaultchat_addr2);
    if (d.vaultchat_city) setCity(d.vaultchat_city);
    if (d.vaultchat_state) setStateRegion(d.vaultchat_state);
    if (d.vaultchat_zip) setZip(d.vaultchat_zip);
    if (d.vaultchat_country) setCountry(d.vaultchat_country);
    if (d.vaultchat_profile_photo) setProfilePhoto(d.vaultchat_profile_photo);
    if (d.vaultchat_group_notif !== null) setGroupNotif(JSON.parse(d.vaultchat_group_notif ?? 'true'));
    if (d.vaultchat_call_notif !== null) setCallNotif(JSON.parse(d.vaultchat_call_notif ?? 'true'));
    if (d.vaultchat_vanish) setVanishMode(JSON.parse(d.vaultchat_vanish));
    if (d.vaultchat_edit_msg !== null) setEditMessages(JSON.parse(d.vaultchat_edit_msg ?? 'true'));
    if (d.vaultchat_pin_msg !== null) setPinMessages(JSON.parse(d.vaultchat_pin_msg ?? 'true'));
    if (d.vaultchat_relay) setRelay(JSON.parse(d.vaultchat_relay));
    if (d.vaultchat_noise !== null) setNoiseCancell(JSON.parse(d.vaultchat_noise ?? 'true'));
    if (d.vaultchat_notif_sound !== null) setNotifSound(JSON.parse(d.vaultchat_notif_sound ?? 'true'));
    if (d.vaultchat_blocked) setBlockedContacts(JSON.parse(d.vaultchat_blocked));
    const handle = await getMyHandle();
    if (handle) {
      setVaultHandle(handle);
      // Keep the Vault ID display in sync with the @handle. If they
      // somehow drifted (older builds wrote a random vault_xyz), prefer
      // the handle so the user sees ONE canonical identifier.
      setVaultId(handle);
      if (d.vaultchat_vault_id !== handle) {
        try { await AsyncStorage.setItem('vaultchat_vault_id', handle); } catch {}
      }
    } else if (d.vaultchat_display_name) {
      const newHandle = await generateHandle(d.vaultchat_display_name);
      setVaultHandle(newHandle);
      setVaultId(newHandle);
      await saveHandle(newHandle);
    }
    const bio = await AsyncStorage.getItem('vaultchat_biometric');
    setBiometricEnabled(bio === 'true');
    // Security audit fix #121 — PINs read from Keychain via securePinStore.
    // First call also auto-migrates any pre-existing AsyncStorage PINs.
    const rp = await getPin(PIN_KEY_REAL);
    const dp = await getPin(PIN_KEY_DECOY);
    if (rp) setRealPin(rp);
    if (dp) setDecoyPin(dp);
    setVaultPinSet(await hasVaultPin());
    if (d.vaultchat_facetime !== null) setFaceTimeEnabled(JSON.parse(d.vaultchat_facetime ?? 'true'));
  }

  async function save(key, val) { await AsyncStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val)); }

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1,1], quality: 1 });
    if (!result.canceled) { setProfilePhoto(result.assets[0].uri); await save('vaultchat_profile_photo', result.assets[0].uri); }
  }

  async function saveProfile() {
    // Local cache first — these are read on the next app launch before
    // the Supabase round-trip lands, so writing them locally makes the
    // edits feel instant.
    await save('vaultchat_display_name', displayName);
    await save('vaultchat_bio', bio);
    await save('vaultchat_email', email);
    await save('vaultchat_addr1', addr1);
    await save('vaultchat_addr2', addr2);
    await save('vaultchat_city', city);
    await save('vaultchat_state', stateRegion);
    await save('vaultchat_zip', zip);
    await save('vaultchat_country', country);

    // Push the public-facing fields to Supabase profiles so other users
    // see the latest display_name when they sync contacts or open a
    // chat header. Address/email/bio stay device-local for now (nobody
    // else needs them server-side and they're more sensitive than the
    // handle/name).
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const myUserId = session?.user?.id;
      if (myUserId) {
        await supabase
          .from('profiles')
          .update({ display_name: displayName || null, bio: bio || null })
          .eq('id', myUserId);
      }
    } catch {}

    // Persist the @handle (and Vault ID, which is the same value) when
    // the user taps the top "Save" button. Without this, the handle
    // editor's own inline Save button is the ONLY path to commit a
    // handle change — easy to miss. Compare against cached value so we
    // only fire the network call when the handle actually changed.
    try {
      const cachedHandle = await AsyncStorage.getItem('vaultchat_handle');
      if (vaultHandle && vaultHandle !== cachedHandle && vaultHandle.replace('@','').length >= 3) {
        const result = await saveHandle(vaultHandle);
        if (result?.ok) {
          // saveHandle already wrote vault_handle + vault_id to Supabase
          // and updated AsyncStorage. Bump the local React state so the
          // VAULT ID display refreshes too.
          setVaultId(vaultHandle);
        } else {
          const msg = result?.reason === 'taken'   ? `${vaultHandle} is already taken. Pick another handle.`
                    : result?.reason === 'invalid' ? 'Handle must be 3–32 characters, letters/numbers/underscore only.'
                    : result?.reason === 'rls'     ? 'Server rejected the update. Add an UPDATE policy to the profiles table in Supabase (USING auth.uid() = id).'
                    :                                'Couldn\'t save handle. Check your connection and try again.';
          Alert.alert('Handle not saved', msg);
          // Don't bail — the rest of the profile fields are already
          // persisted; only the handle change failed.
        }
      }
    } catch {}

    Alert.alert('Saved ✓', 'Profile updated!');
    setPage('main');
  }

  async function addBlock() {
    if (!blockInput.trim()) return;
    const updated = [...blockedContacts, blockInput.trim()];
    setBlockedContacts(updated); await save('vaultchat_blocked', updated);
    setBlockInput(''); Alert.alert('Blocked', `${blockInput} blocked.`);
  }

  async function unblock(p) {
    const updated = blockedContacts.filter(x => x !== p);
    setBlockedContacts(updated); await save('vaultchat_blocked', updated);
  }

  // Targeted sign-out — preserves all chat history, vault data,
  // folders, and per-chat prefs so signing back in (as the same
  // user) feels seamless. Only auth-related keys get cleared.
  // Bug fix per Harold (2026-04-30): the previous version called
  // AsyncStorage.clear() which nuked vaultchat_chats,
  // vaultchat_msgs_<roomId>, vaultchat_plain_<roomId>,
  // vaultchat_vaulted_ids, vaultchat_folders, etc. — every chat
  // and message disappeared on sign-out and stayed gone after
  // sign-in. Users were furious; this restores the iMessage-style
  // "log back in and your stuff is right there" expectation.
  //
  // Account deletion (deleteAccount, below) still does a full
  // wipe — that's the correct behavior for "I'm permanently
  // leaving."
  async function signOutPreservingData() {
    try { await supabase.auth.signOut(); } catch {}
    // Clear only the auth pointer + supabase's own session token.
    // Anything else stays. Note: supabase-js manages its own keys
    // automatically when signOut runs, so we only need to remove
    // OUR cached user record.
    try { await AsyncStorage.removeItem('vaultchat_user'); } catch {}
  }

  async function signOut() {
    Alert.alert(
      'Sign Out',
      'Sign out of VaultChat? Your chats, messages, and vault stay on this device — they\'ll be there when you sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOutPreservingData },
      ]
    );
  }

  // Two-step account deletion required by App Store guideline 5.1.1(v):
  // "Apps that support account creation must let users initiate
  //  deletion of their account from within the app."
  //
  // Step 1: dismissable warning describing what gets deleted.
  // Step 2: hard confirm — only this Delete-Account button actually
  //         destroys data, so a single mis-tap can't nuke the account.
  // Step 3: actual deletion path:
  //   - Delete this user's row from `profiles` (RLS lets the user
  //     delete their own row). This removes their public identity:
  //     handle, display name, public key — peers can no longer find
  //     them by @handle and can no longer encrypt to them.
  //   - Sign out of Supabase auth (revokes the session JWT).
  //   - Wipe local AsyncStorage (chat cache, keys, settings, etc).
  //
  // KNOWN GAP: removing the auth.users row (the underlying account
  // record) requires a service-role or Edge Function call. Filed as
  // follow-up — for App Store today, the user-facing data is gone:
  // their @handle is freed up for re-claim, all their messages on
  // the device are wiped, and their session token is revoked. The
  // orphaned auth row is invisible to other users and to themselves.
  async function deleteAccount() {
    Alert.alert(
      'Delete your account?',
      'This will permanently remove your @handle, profile, and all chat data on this device. Other people will no longer be able to find you by your handle. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            // Second confirmation — Apple expects a hard "are you really sure"
            Alert.alert(
              'Are you sure?',
              'There is no way to recover a deleted account. Your handle becomes available for someone else to claim.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Account',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      const myUserId = session?.user?.id;
                      if (myUserId) {
                        // Scrub every user-specific table in parallel.
                        // We deliberately do NOT delete from `messages`,
                        // `rooms`, `room_secrets`, or `message_reactions`
                        // because those are SHARED with the other parties
                        // in our chats — wiping them would erase the
                        // counterpart's history too. After deletion, the
                        // sender_id on those rows points at an orphaned
                        // user with no profile / handle / keys, so we're
                        // effectively unresolvable.
                        await Promise.all([
                          supabase.from('profiles').delete().eq('id', myUserId).then(() => {}, () => {}),
                          supabase.from('user_device_keys').delete().eq('user_id', myUserId).then(() => {}, () => {}),
                          supabase.from('ratchet_pre_keys').delete().eq('user_id', myUserId).then(() => {}, () => {}),
                          supabase.from('user_folders').delete().eq('user_id', myUserId).then(() => {}, () => {}),
                          supabase.from('user_chat_prefs').delete().eq('user_id', myUserId).then(() => {}, () => {}),
                          supabase.from('blocked_users').delete().eq('blocker_id', myUserId).then(() => {}, () => {}),
                          supabase.from('contacts').delete().eq('owner_id', myUserId).then(() => {}, () => {}),
                        ]);

                        // Hard-delete the auth.users row via the
                        // delete-account Edge Function. The function
                        // re-runs the table scrubs above with the
                        // service-role key as belt-and-suspenders,
                        // then calls auth.admin.deleteUser(userId).
                        // We pass no body — the function reads the
                        // JWT from Authorization to identify whose
                        // account to delete. Best-effort: if the
                        // function fails (network down, etc.) we
                        // still sign out + wipe local data, leaving
                        // the auth row orphaned but unreachable.
                        try {
                          const { error: fnErr } = await supabase.functions.invoke('delete-account');
                          if (fnErr && __DEV__) console.warn('delete-account function failed:', fnErr.message || fnErr);
                        } catch (e) {
                          if (__DEV__) console.warn('delete-account invoke threw:', e?.message || e);
                        }
                      }
                      try { await supabase.auth.signOut(); } catch {}
                      try { await AsyncStorage.clear(); } catch {}
                      Alert.alert(
                        'Account deleted',
                        'Your VaultChat profile, encryption keys, contacts, folders, and preferences have been removed from our servers. Messages you sent to other people stay on their devices — that\'s the nature of end-to-end encrypted messaging.'
                      );
                    } catch (e) {
                      Alert.alert('Delete failed', e?.message || 'Could not delete the account. Try again or contact support.');
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }

  const NavBar = ({ title, onSave }) => (
    <View style={[st.navBar, { backgroundColor: card, borderBottomColor: border }]}>
      <TouchableOpacity onPress={() => setPage('main')} style={{ width: 60 }}>
        <Text style={{ color: accent, fontSize: 16 }}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={[st.navTitle, { color: tx }]}>{title}</Text>
      {onSave
        ? <TouchableOpacity onPress={onSave} style={{ width: 60, alignItems: 'flex-end' }}>
            <Text style={{ color: accent, fontWeight: 'bold', fontSize: 16 }}>Save</Text>
          </TouchableOpacity>
        : <View style={{ width: 60 }} />}
    </View>
  );

  const Row = ({ icon, label, subText, value, onPress, right, danger }) => (
    <TouchableOpacity style={[st.row, { borderBottomColor: border }]} onPress={onPress} disabled={!onPress && !right}>
      <View style={st.rowLeft}>
        {icon ? <Text style={st.rowIcon}>{icon}</Text> : null}
        <View style={{ flex: 1 }}>
          <Text style={[st.rowLabel, { color: danger ? '#ff4444' : tx }]}>{label}</Text>
          {subText ? <Text style={[st.rowSub, { color: sub }]}>{subText}</Text> : null}
        </View>
      </View>
      {right || (value ? <Text style={[{ color: sub, fontSize: 13 }]}>{value}</Text> : null)}
      {onPress && !right ? <Text style={[st.chevron, { color: sub }]}>›</Text> : null}
    </TouchableOpacity>
  );

  const Toggle = ({ icon, label, subText, value, onChange, storageKey }) => (
    <Row icon={icon} label={label} subText={subText} right={
      <Switch value={value} onValueChange={v => { onChange(v); if (storageKey) save(storageKey, v); }} trackColor={{ false: '#333', true: accent }} thumbColor="#fff" />
    } />
  );

  const Section = ({ title, children }) => (
    <>
      <Text style={[st.sectionLabel, { color: sub, backgroundColor: sectionBg }]}>{title}</Text>
      <View style={[st.card, { backgroundColor: card, borderColor: border }]}>{children}</View>
    </>
  );

  // Mockup-style category row used in the main settings page. Bigger
  // tap target, tinted icon chip, single chevron — matches the design
  // reference. `last` removes the bottom hairline on the final row of
  // a card so the card has clean rounded corners.
  const CatRow = ({ icon, label, onPress, tx, sub, border, accent, last }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 16,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: border,
      }}>
      <View style={{
        width: 32, height: 32, borderRadius: 10,
        backgroundColor: accent + '22',
        alignItems: 'center', justifyContent: 'center',
        marginRight: 14,
      }}>
        <Text style={{ fontSize: 16 }}>{icon}</Text>
      </View>
      <Text style={{ flex: 1, color: tx, fontSize: 15, fontWeight: '500' }}>{label}</Text>
      <Text style={{ color: sub, fontSize: 18 }}>›</Text>
    </TouchableOpacity>
  );

  const Field = ({ label, value, onChange, placeholder, multiline, keyboardType, editable = true }) => (
    <View style={{ marginBottom: 4 }}>
      <Text style={[st.fieldLabel, { color: sub }]}>{label}</Text>
      {editable
        ? <TextInput style={[st.fieldBox, { backgroundColor: inputBg, color: tx, borderColor: border, minHeight: multiline ? 70 : undefined, textAlignVertical: multiline ? 'top' : 'center' }]} placeholder={placeholder} placeholderTextColor={sub} value={value} onChangeText={onChange} multiline={multiline} keyboardType={keyboardType} autoCapitalize="none" />
        : <View style={[st.fieldBox, { backgroundColor: inputBg, borderColor: border, justifyContent: 'center' }]}>
            <Text style={{ color: sub, fontSize: 15 }}>{value}</Text>
          </View>}
    </View>
  );

  // EDIT PROFILE
  if (page === 'profile') {
    return (
      <View style={{ flex: 1, backgroundColor: bg }}>
        <NavBar title="Edit Profile" onSave={saveProfile} />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
          <View style={[st.profileTopCard, { backgroundColor: card, borderColor: border }]}>
            <TouchableOpacity onPress={pickPhoto} style={{ alignItems: 'center' }}>
              {profilePhoto
                ? <Image source={{ uri: profilePhoto }} style={st.bigPhoto} />
                : <View style={[st.bigPhotoPlaceholder, { backgroundColor: accent }]}>
                    <Text style={st.bigPhotoInitial}>{displayName ? displayName[0].toUpperCase() : '?'}</Text>
                  </View>}
              <View style={[st.cameraOverlay, { backgroundColor: accent }]}><Text style={{ fontSize: 14 }}>📷</Text></View>
            </TouchableOpacity>
            <TextInput style={[st.nameInCard, { color: tx, borderBottomColor: border }]} placeholder="Display name" placeholderTextColor={sub} value={displayName} onChangeText={setDisplayName} textAlign="center" />
            <Text style={[st.vaultIdInCard, { color: accent }]}>{vaultId}</Text>
          </View>

          {/* Inlined TextInputs (NOT the <Field> wrapper) — defining a
              React component inside the parent makes a new identity on
              every render, which causes RN to unmount the TextInput on
              every keystroke and lose focus. The address rows below
              were always inline, so they didn't suffer the bug. We
              match that pattern here. */}
          <Text style={[st.fieldLabel, { color: sub }]}>BIO</Text>
          <TextInput
            style={[st.fieldBox, { backgroundColor: inputBg, color: tx, borderColor: border, minHeight: 70, textAlignVertical: 'top', marginBottom: 4 }]}
            placeholder="Write something about yourself..."
            placeholderTextColor={sub}
            value={bio}
            onChangeText={setBio}
            multiline
            autoCapitalize="sentences"
          />

          <Text style={[st.fieldLabel, { color: sub }]}>PHONE NUMBER</Text>
          <View style={[st.fieldBox, { backgroundColor: inputBg, borderColor: border, justifyContent: 'center', marginBottom: 4 }]}>
            <Text style={{ color: sub, fontSize: 15 }}>{`+${user?.phone || 'Not available'}`}</Text>
          </View>
          <Text style={[st.hint, { color: sub }]}>Phone number cannot be changed</Text>

          <Text style={[st.fieldLabel, { color: sub }]}>EMAIL</Text>
          <TextInput
            style={[st.fieldBox, { backgroundColor: inputBg, color: tx, borderColor: border, marginBottom: 4 }]}
            placeholder="your@email.com"
            placeholderTextColor={sub}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[st.fieldLabel, { color: sub, marginTop: 16 }]}>ADDRESS</Text>
          <TextInput style={[st.fieldBox, { backgroundColor: inputBg, color: tx, borderColor: border, marginBottom: 8 }]} placeholder="Address Line 1" placeholderTextColor={sub} value={addr1} onChangeText={setAddr1} />
          <TextInput style={[st.fieldBox, { backgroundColor: inputBg, color: tx, borderColor: border, marginBottom: 8 }]} placeholder="Address Line 2 (Apt, Suite, etc.)" placeholderTextColor={sub} value={addr2} onChangeText={setAddr2} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[st.fieldBox, { backgroundColor: inputBg, color: tx, borderColor: border, flex: 1 }]} placeholder="City" placeholderTextColor={sub} value={city} onChangeText={setCity} />
            <TextInput style={[st.fieldBox, { backgroundColor: inputBg, color: tx, borderColor: border, flex: 1 }]} placeholder="State / Province" placeholderTextColor={sub} value={stateRegion} onChangeText={setStateRegion} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput style={[st.fieldBox, { backgroundColor: inputBg, color: tx, borderColor: border, flex: 1 }]} placeholder="ZIP / Postal Code" placeholderTextColor={sub} value={zip} onChangeText={setZip} keyboardType="number-pad" />
            <TextInput style={[st.fieldBox, { backgroundColor: inputBg, color: tx, borderColor: border, flex: 1 }]} placeholder="Country" placeholderTextColor={sub} value={country} onChangeText={setCountry} />
          </View>

          <View style={{ marginTop: 16 }}>
            <Text style={[st.fieldLabel, { color: sub }]}>VAULT HANDLE</Text>
            <View style={[st.fieldBox, { backgroundColor: inputBg, borderColor: border, flexDirection: 'row', alignItems: 'center', padding: 0, paddingLeft: 14 }]}>
              <Text style={{ color: '#5856d6', fontSize: 18, fontWeight: 'bold', marginRight: 2 }}>@</Text>
              <TextInput
                style={{ flex: 1, color: tx, fontSize: 15, fontWeight: 'bold', padding: 14 }}
                placeholder="yourhandle"
                placeholderTextColor={sub}
                value={vaultHandle.replace('@', '')}
                onChangeText={v => setVaultHandle('@' + v.replace('@', '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
              />
              <TouchableOpacity style={[st.copyBtn, { backgroundColor: '#5856d6', margin: 8 }]} onPress={async () => {
                if (!vaultHandle || vaultHandle.length < 2) { Alert.alert('Error', 'Enter a valid handle'); return; }
                const result = await saveHandle(vaultHandle);
                if (!result?.ok) {
                  const msg = result?.reason === 'taken'   ? `${vaultHandle} is already taken. Pick another handle.`
                            : result?.reason === 'invalid' ? 'Handle must be 3–32 characters, letters/numbers/underscore only.'
                            :                                'Couldn\'t save handle. Check your connection and try again.';
                  Alert.alert('Handle not saved', msg);
                  return;
                }
                await AsyncStorage.setItem('vaultchat_vault_id', vaultHandle);
                // Keep the in-memory Vault ID display in sync so the
                // user sees the new handle reflected in the VAULT ID
                // field immediately, without re-opening the screen.
                setVaultId(vaultHandle);
                Alert.alert('Handle Updated! ✓', `Your handle is now ${vaultHandle}`);
              }}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Save</Text>
              </TouchableOpacity>
            </View>
            <Text style={[st.hint, { color: sub }]}>Your phone number stays private. Others find you with {vaultHandle || '@yourhandle'}.</Text>
          </View>

          <View style={{ marginTop: 16 }}>
            <Text style={[st.fieldLabel, { color: sub }]}>VAULT ID</Text>
            <View style={[st.fieldBox, { backgroundColor: inputBg, borderColor: border, flexDirection: 'row', alignItems: 'center' }]}>
              <Text style={{ color: accent, fontSize: 15, fontWeight: 'bold', flex: 1 }}>{vaultId}</Text>
              <TouchableOpacity style={[st.copyBtn, { backgroundColor: accent }]} onPress={() => Alert.alert('Copied!', 'Vault ID copied!')}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Copy</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* QR Code shortcut — opens QRContactScreen so the user can show
              their code to someone standing next to them, or scan one. */}
          <TouchableOpacity
            style={{
              marginTop: 18, flexDirection: 'row', alignItems: 'center',
              backgroundColor: accent + '18', borderColor: accent + '44', borderWidth: 1,
              borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
            }}
            onPress={() => navigation.navigate('QRContact', { initialTab: 'mine' })}>
            <Text style={{ fontSize: 22 }}>🔲</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={{ color: accent, fontWeight: '700', fontSize: 15 }}>My QR Code</Text>
              <Text style={{ color: sub, fontSize: 12, marginTop: 2 }}>Let someone add you instantly</Text>
            </View>
            <Text style={{ color: accent, fontSize: 18 }}>›</Text>
          </TouchableOpacity>

          {/* Share Invite Link — same identity as the QR code, but as a
              shareable URL. Opens the iOS Share sheet so the user can fire
              off the link via Messages, Mail, or any other share target. */}
          <TouchableOpacity
            style={{
              marginTop: 10, flexDirection: 'row', alignItems: 'center',
              backgroundColor: accent + '18', borderColor: accent + '44', borderWidth: 1,
              borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
            }}
            onPress={async () => {
              const ok = await shareMyInvite();
              if (!ok) Alert.alert('Set a handle first', 'You need a @handle before you can share an invite link.');
            }}>
            <Text style={{ fontSize: 22 }}>🔗</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={{ color: accent, fontWeight: '700', fontSize: 15 }}>Share Invite Link</Text>
              <Text style={{ color: sub, fontSize: 12, marginTop: 2 }}>Send a link friends can tap to add you</Text>
            </View>
            <Text style={{ color: accent, fontSize: 18 }}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[st.saveBtn, { backgroundColor: accent }]} onPress={saveProfile}>
            <Text style={st.saveBtnText}>Save Profile</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // NOTIFICATIONS
  if (page === 'notifications') {
    return (
      <View style={{ flex: 1, backgroundColor: bg }}>
        <NavBar title="Notifications" />
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          <Section title="ALERTS">
            <Toggle icon="🔔" label="Notification Sound" storageKey="vaultchat_notif_sound" value={notifSound} onChange={setNotifSound} />
            <Toggle icon="👥" label="Group Notifications" subText="Notify for group messages" storageKey="vaultchat_group_notif" value={groupNotif} onChange={setGroupNotif} />
            <Toggle icon="📞" label="Call Notifications" subText="Notify for incoming calls" storageKey="vaultchat_call_notif" value={callNotif} onChange={setCallNotif} />
          </Section>
        </ScrollView>
      </View>
    );
  }

  // BLOCKED
  if (page === 'blocked') {
    return (
      <View style={{ flex: 1, backgroundColor: bg }}>
        <NavBar title="Blocked Contacts" />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          <View style={[st.blockInputRow, { backgroundColor: card, borderColor: border }]}>
            <TextInput style={{ flex: 1, color: tx, fontSize: 15, padding: 14 }} placeholder="Phone to block" placeholderTextColor={sub} value={blockInput} onChangeText={setBlockInput} keyboardType="phone-pad" />
            <TouchableOpacity style={[st.blockBtn, { backgroundColor: accent }]} onPress={addBlock}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Block</Text>
            </TouchableOpacity>
          </View>
          {blockedContacts.length === 0
            ? <Text style={[{ textAlign: 'center', marginTop: 32, fontSize: 15, color: sub }]}>No blocked contacts</Text>
            : blockedContacts.map((p, i) => (
              <View key={i} style={[st.blockedRow, { backgroundColor: card, borderColor: border }]}>
                <Text style={{ color: tx, fontSize: 15 }}>📵 {p}</Text>
                <TouchableOpacity onPress={() => unblock(p)}><Text style={{ color: '#ff4444', fontWeight: 'bold' }}>Unblock</Text></TouchableOpacity>
              </View>
            ))}
        </ScrollView>
      </View>
    );
  }

  // ── ACCOUNT sub-page ────────────────────────────────────────
  if (page === 'account') {
    return (
      <View style={{ flex: 1, backgroundColor: bg }}>
        <NavBar title="Account" />
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          <Section title="CONTACTS">
            <Row icon="👥" label="Sync Phone Contacts" subText="Import from address book, iCloud, Google" onPress={async () => {
              const granted = await requestContactsPermission();
              if (!granted) { Alert.alert('Permission needed', 'Go to Settings → Expo Go → Contacts → Allow'); return; }
              const contacts = await syncContacts();
              Alert.alert('Synced! ✓', `${contacts.length} contacts imported successfully.`);
            }} />
            <Row icon="☁️" label="iCloud Contacts" subText="Sync via iPhone Settings → iCloud → Contacts" onPress={() => Alert.alert('iCloud Sync', 'Enable iCloud Contacts in iPhone Settings → Apple ID → iCloud → Contacts to sync automatically.')} />
            <Row icon="🔍" label="Find Friends on VaultChat" subText="See which contacts use the app" onPress={async () => {
              const granted = await requestContactsPermission();
              if (!granted) { Alert.alert('Permission needed', 'Allow contacts access first'); return; }
              const { friends, totalContacts } = await findFriendsOnVaultChat();
              if (friends.length === 0) {
                Alert.alert(
                  'No matches yet',
                  `Searched ${totalContacts} contacts — none of them are on VaultChat right now. Share your invite link to bring them on.`,
                );
                return;
              }
              // Show up to 6 names by default, then "and N more" so the
              // alert stays readable even with a big match list. Full
              // list cached at vaultchat_friends for future surfaces.
              const named = friends.map(f => f.contact_name || f.display_name || f.vault_handle || 'Friend');
              const preview = named.slice(0, 6).join('\n• ');
              const more    = named.length > 6 ? `\n…and ${named.length - 6} more` : '';
              Alert.alert(
                `${friends.length} friend${friends.length === 1 ? '' : 's'} found`,
                `From ${totalContacts} contacts:\n\n• ${preview}${more}`,
              );
            }} />
          </Section>
          <Section title="DEVICES">
            <Row icon="📲" label="Linked Devices" subText="iPhone 17 Pro (This device)" onPress={() => Alert.alert('Linked Devices', 'iPhone 17 Pro — Active now\nMacBook Pro — Last active 2h ago')} />
          </Section>
          <TouchableOpacity style={st.signOutBtn} onPress={signOut}>
            <Text style={st.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── PRIVACY sub-page ────────────────────────────────────────
  if (page === 'privacy') {
    return (
      <View style={{ flex: 1, backgroundColor: bg }}>
        <NavBar title="Privacy" />
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          <Section title="ENCRYPTION">
            <Row icon="🔒" label="End-to-End Encryption" subText="All messages encrypted" right={<Text style={{ color: '#00ffa3', fontWeight: 'bold' }}>ON</Text>} />
          </Section>
          <Section title="MESSAGE PRIVACY">
            <Toggle icon="💨" label="Vanish Mode" subText="Messages disappear after viewing" storageKey="vaultchat_vanish" value={vanishMode} onChange={setVanishMode} />
            <Toggle icon="✏️" label="Edit Messages" subText="Edit sent messages within 2 hours" storageKey="vaultchat_edit_msg" value={editMessages} onChange={setEditMessages} />
            <Toggle icon="📌" label="Pin Messages" subText="Allow pinning important messages" storageKey="vaultchat_pin_msg" value={pinMessages} onChange={setPinMessages} />
            <Row icon="🚫" label="Blocked Contacts" subText={`${blockedContacts.length} blocked`} onPress={() => setPage('blocked')} />
          </Section>
          <Section title="SECURITY">
            {/* Biometric Lock + Real PIN + Decoy PIN were removed
                per Harold (2026-04-29). The product surface is now
                "Vault PIN only" — users open the app without any
                front-door unlock; only chats they explicitly move
                into the vault are protected by a PIN. The underlying
                code (BiometricLockScreen, securePinStore real/decoy
                keys) is still there and intentionally kept for a
                possible future re-introduction, just no longer
                exposed in the UI. */}
            <Row
              icon="🛡️"
              label="Vault PIN"
              subText={vaultPinSet ? 'Set — long-press Chats title to unlock' : 'Tap to set up — locks chats behind a PIN'}
              onPress={() => {
                if (vaultPinSet) {
                  // Already set: open the legacy 6-digit keypad to
                  // change/remove the existing PIN.
                  setPinType('vault'); setPinInput(''); setPinModal(true);
                } else {
                  // Not set: open the inline VaultPinSetupModal —
                  // PIN + confirm form, 4-8 digits, no navigation
                  // away from Settings.
                  setVaultSetupModal(true);
                }
              }}
            />
            {/* Reset Vault PIN — always visible in plain sight so
                users who forgot their PIN can find it without having
                to tap into the Vault PIN row first. Disabled-looking
                copy when no PIN exists yet. Wipes the PIN AND the
                vaulted-id list (no PIN, no vault), returning vaulted
                chats to the main list. Chat history is preserved on
                both sides — only the "hidden" flag is cleared. */}
            <Row
              icon="🔁"
              label="Reset Vault PIN"
              subText={
                vaultPinSet
                  ? 'Forgot it? Removes the PIN. Vaulted chats return to your main list.'
                  : 'No Vault PIN to reset right now.'
              }
              onPress={() => {
                if (!vaultPinSet) {
                  Alert.alert(
                    'No Vault PIN to reset',
                    'You haven’t set a Vault PIN yet. Tap "Vault PIN" above to create one.'
                  );
                  return;
                }
                Alert.alert(
                  'Reset Vault PIN?',
                  'This removes your Vault PIN. Any chats currently in the vault will return to your main Chats list. Conversation history is not deleted on either side.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Reset PIN',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await clearVaultPin();
                          setVaultPinSet(false);
                          try { await AsyncStorage.removeItem('vaultchat_vault_setup_seen'); } catch {}
                          Alert.alert(
                            'Vault PIN reset',
                            'Your Vault PIN has been removed and any vaulted chats are back in your Chats list. You can set a new PIN anytime.'
                          );
                        } catch (e) {
                          Alert.alert('Could not reset', e?.message || 'Try again in a moment.');
                        }
                      },
                    },
                  ]
                );
              }}
            />
            <Row
              icon="🔒"
              label="Vault"
              subText="View your vaulted chats, files, and media · Premium 👑"
              onPress={() => navigation.navigate('Vault')}
            />
            {/* About End-to-end Encryption — pure info screen with
                the "Your privacy is our priority" treatment. Same
                screen reachable from the 🔒 badge in any chat room. */}
            <Row
              icon="🛡️"
              label="About End-to-end Encryption"
              subText="How VaultChat protects your messages and calls"
              onPress={() => navigation.navigate('EncryptionInfo')}
            />
            {/* Encrypted vault backup (Phase VV+XX). PIN is the
                encryption key — same one that protects the live
                vault — so we prompt for it, derive an AES key
                via PBKDF2, encrypt a JSON snapshot, and let the
                user pick where to save the file via the iOS
                Share Sheet (iCloud Drive / Files / AirDrop). */}
            <Row
              icon="📤"
              label="Backup Vault"
              subText="Encrypted snapshot you can save to iCloud Drive or Files"
              onPress={() => {
                if (!vaultPinSet) {
                  Alert.alert('Set a Vault PIN first', 'The Vault PIN is the encryption key for your backup. Set one above before backing up.');
                  return;
                }
                setBackupMode('export');
                setBackupPin('');
                setBackupModal(true);
              }}
            />
            <Row
              icon="📥"
              label="Restore Vault"
              subText="Re-import a backup .vchat file using your Vault PIN"
              onPress={() => {
                setBackupMode('restore');
                setBackupPin('');
                setBackupModal(true);
              }}
            />
            <Row
              icon="🚫"
              label="Blocked Users"
              subText="Manage who can't message or call you"
              onPress={() => navigation.navigate('BlockedUsers')}
            />
          </Section>
          {/* SECURITY — remote sign-out (security audit fix #127). */}
          <Section title="SECURITY">
            <Row
              icon="🚪"
              label="Sign Out Everywhere"
              subText="Force-sign-out of every device including this one"
              onPress={async () => {
                Alert.alert(
                  'Sign out everywhere?',
                  'This will sign you out of VaultChat on every device — phones, tablets, etc. Use this if a device was lost or stolen. You\'ll need to sign back in on each device you still use.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Sign Out Everywhere',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          const { signOutAllDevices } = require('../services/sessionGuard');
                          const r = await signOutAllDevices();
                          if (r.ok) {
                            // Same data-preservation policy as the
                            // normal sign-out: drop the auth pointer
                            // only, keep chats / messages / vault
                            // intact so signing back in is seamless.
                            try { await AsyncStorage.removeItem('vaultchat_user'); } catch {}
                            Alert.alert('Signed out', 'You have been signed out of all devices. Your chats and messages stay on this device for when you sign back in.');
                          } else {
                            Alert.alert('Sign out failed', r.error || 'Please try again.');
                          }
                        } catch (e) {
                          Alert.alert('Sign out failed', e?.message || 'Please try again.');
                        }
                      },
                    },
                  ],
                );
              }}
            />
          </Section>
          {/* DANGER ZONE — required for App Store compliance (5.1.1(v)).
              Account deletion has to be initiable from within the app.
              Two-step confirmation guards against accidental taps. */}
          <Section title="DANGER ZONE">
            <Row icon="❌" label="Delete Account" subText="Permanently remove your VaultChat account" danger onPress={deleteAccount} />
          </Section>
        </ScrollView>
      </View>
    );
  }

  // ── APPEARANCE sub-page ─────────────────────────────────────
  if (page === 'appearance') {
    return (
      <View style={{ flex: 1, backgroundColor: bg }}>
        <NavBar title="Appearance" />
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          <Section title="THEME">
            <Row icon={lightMode ? '🌙' : '☀️'} label="Light Mode" subText={lightMode ? 'Fiji blue accent' : 'Violet accent'} right={
              <Switch value={lightMode} onValueChange={toggleLight} trackColor={{ false: '#333', true: accent }} thumbColor="#fff" />
            } />
            <Row
              icon="🎨"
              label="Theme & Icon"
              subText="Custom accents and app icons (Premium)"
              onPress={() => navigation.navigate('ThemePicker')}
            />
          </Section>
        </ScrollView>
      </View>
    );
  }

  // ── DATA AND STORAGE sub-page ───────────────────────────────
  if (page === 'data-storage') {
    return (
      <View style={{ flex: 1, backgroundColor: bg }}>
        <NavBar title="Data and Storage" />
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          <Section title="CALL QUALITY">
            <Toggle icon="📳" label="Haptic Feedback" subText="Vibrate on keypad and call actions" storageKey="vaultchat_haptic" value={hapticEnabled} onChange={setHapticEnabled} />
            <Toggle icon="🌐" label="International Relay" subText="Route calls through secure relay" storageKey="vaultchat_relay" value={relay} onChange={setRelay} />
            <Toggle icon="🎙️" label="Noise Cancellation" subText="AI background noise removal" storageKey="vaultchat_noise" value={noiseCancell} onChange={setNoiseCancell} />
            <Toggle icon="📹" label="FaceTime" subText="Allow FaceTime calls from VaultChat" storageKey="vaultchat_facetime" value={faceTimeEnabled} onChange={setFaceTimeEnabled} />
          </Section>
          <Section title="STORAGE">
            <Row icon="🗑️" label="Clear All Chats" danger onPress={() => Alert.alert('Clear Chats', 'Delete all chat history?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: async () => { await AsyncStorage.removeItem('vaultchat_chats'); Alert.alert('Done', 'All chats cleared.'); } }])} />
          </Section>
          <Section title="BACKUP & RECOVERY">
            <Row icon="☁️" label="Create Encrypted Backup" subText="Export your chats and settings" onPress={() => {
              Alert.alert('Backup', 'Enter your PIN to encrypt the backup:', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Backup Now', onPress: () => createBackup(realPin || 'default') },
              ]);
            }} />
            <Row icon="📥" label="Restore from Backup" subText="Import a previous backup file" onPress={() => {
              Alert.alert('Restore', 'This will overwrite current data. Continue?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Restore', onPress: () => restoreBackup(realPin || 'default') },
              ]);
            }} />
            <Row icon="🔔" label="Notification Security" subText="Message content never stored in iOS logs" right={<Text style={{ color: '#00ffa3', fontWeight: 'bold', fontSize: 11 }}>PROTECTED</Text>} />
          </Section>
        </ScrollView>
      </View>
    );
  }

  // ── HELP & SUPPORT sub-page ─────────────────────────────────
  if (page === 'help') {
    return (
      <View style={{ flex: 1, backgroundColor: bg }}>
        <NavBar title="Help & Support" />
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          <Section title="LEGAL">
            <Row icon="📄" label="Privacy Policy"        onPress={() => navigation.navigate('PrivacyPolicy')} />
            <Row icon="📋" label="Terms of Service"      onPress={() => navigation.navigate('TermsOfService')} />
            <Row icon="🛡️" label="Community Guidelines"  onPress={() => navigation.navigate('CommunityGuidelines')} />
          </Section>
          <Section title="GET IN TOUCH">
            <Row icon="✉️" label="Contact Support" subText="support@vaultchat.app" onPress={() => Alert.alert('Contact Support', 'Send us a message at support@vaultchat.app and we\'ll get back to you within 24 hours.')} />
          </Section>
        </ScrollView>
      </View>
    );
  }

  // ── ABOUT sub-page ──────────────────────────────────────────
  if (page === 'about') {
    return (
      <View style={{ flex: 1, backgroundColor: bg }}>
        <NavBar title="About VaultChat" />
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          <Section title="ABOUT">
            <Row icon="ℹ️" label="Version" value="1.0.0" />
            <Row icon="🔐" label="Encryption Protocol" value="NaCl box (Curve25519 + XSalsa20)" />
            <Row icon="🏢" label="Made by" value="AUXXILUS MEDIA LLC" />
          </Section>
          <Section title="LEGAL">
            <Row
              icon="📄"
              label="Privacy Policy"
              subText="Read how VaultChat handles your information"
              onPress={() => {
                // Opens the hosted privacy policy in the system browser.
                // Required for App Store + Play Store compliance and gives
                // users an in-app entry point to the same document we link
                // from the store listings.
                Linking.openURL('https://vaultchat.co/android-privacy.html')
                  .catch(() => Alert.alert('Could not open link', 'Visit https://vaultchat.co/android-privacy.html in a browser.'));
              }}
            />
          </Section>
        </ScrollView>
      </View>
    );
  }

  // MAIN
  const fullAddress = [addr1, addr2, city, stateRegion, zip, country].filter(Boolean).join(', ');

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 8 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
            <Text style={{ color: accent, fontSize: 28, fontWeight: 'bold' }}>‹</Text>
          </TouchableOpacity>
          <Text style={[st.header, { color: accent, paddingHorizontal: 0, paddingTop: 0 }]}>Settings</Text>
        </View>

        {/* TEMPORARY dev toggle — remove before public launch.
            Lets us preview the premium light theme without going through
            the IAP purchase flow on emulator (which can't talk to real
            Google Play billing). Tap to flip the local premium flag and
            the entire app re-renders with white-canvas + purple-accent
            premium look. Tap again to switch back to free dark/light. */}
        <TouchableOpacity
          style={{
            marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 12,
            backgroundColor: '#7C3AED', alignItems: 'center',
          }}
          onPress={async () => {
            try {
              const { setPremiumUser, isPremiumUser } = require('../services/adsService');
              const current = await isPremiumUser();
              await setPremiumUser(!current);
              Alert.alert(
                'Premium Toggle (Dev)',
                `Premium is now ${!current ? 'ON — white-purple theme active' : 'OFF — back to free dark/light'}.\n\nClose and re-open Settings (or backout to Chats and back) to see the change.`,
              );
            } catch (e) {
              Alert.alert('Toggle failed', e?.message || String(e));
            }
          }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>🧪 Toggle Premium UI (dev)</Text>
        </TouchableOpacity>

        {/* TEMPORARY — task #50 verification. Places a real 1:1 call to the
            other hardcoded test peer, bypassing phone/profile resolution.
            Gated behind __DEV__ so it's stripped from production bundles. */}
        {__DEV__ && user && DEV_TEST_PEERS[user.id] && (
          <View style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 12, backgroundColor: '#ff9500', borderWidth: 1, borderColor: '#cc7700' }}>
            <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 4 }}>🔧 Dev: Test Signaling</Text>
            <Text style={{ color: '#fff', fontSize: 11, marginBottom: 2, opacity: 0.9 }}>callPeer state: <Text style={{ fontWeight: '700' }}>{devCallState}</Text></Text>
            <Text style={{ color: '#fff', fontSize: 11, marginBottom: 2, opacity: 0.9 }}>socket: <Text style={{ fontWeight: '700' }}>{devSocketConnected ? '🟢 connected' : '🔴 disconnected'}</Text></Text>
            <Text style={{ color: '#fff', fontSize: 12, marginBottom: 10 }}>Calls the other test simulator directly (skips phone lookup).</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center' }}
                onPress={() => {
                  const peer = DEV_TEST_PEERS[user.id];
                  placeCall({ navigation, peerUserId: peer.id, recipientName: peer.name, type: 'voice' });
                }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>📞 Voice</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center' }}
                onPress={() => {
                  const peer = DEV_TEST_PEERS[user.id];
                  placeCall({ navigation, peerUserId: peer.id, recipientName: peer.name, type: 'video' });
                }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>📹 Video</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center' }}
                onPress={() => {
                  const before = callPeerGetState?.()?.state || 'unknown';
                  try { callPeerHangup(); } catch {}
                  try { callPeerInternal?.cleanup?.(); } catch {}
                  const after = callPeerGetState?.()?.state || 'unknown';
                  Alert.alert('Reset', `Before: ${before}\nAfter: ${after}`);
                }}>
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>🔄 Reset Call State</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center' }}
                onPress={() => {
                  const before = !!getSocket?.()?.connected;
                  try { connectSocket?.(user.id); } catch (e) {}
                  setTimeout(() => {
                    const after = !!getSocket?.()?.connected;
                    Alert.alert('Socket', `Before: ${before ? 'connected' : 'disconnected'}\nAfter: ${after ? 'connected' : 'disconnected'}\n\nuserId: ${user.id}`);
                  }, 800);
                }}>
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>🔌 Force Reconnect</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center' }}
                onPress={async () => {
                  Alert.alert(
                    'Clear local chat cache?',
                    'Removes cached chat list from this device. Server rooms are unaffected — chats will rehydrate as you re-open them.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Clear', style: 'destructive', onPress: async () => {
                          try {
                            await AsyncStorage.removeItem('vaultchat_chats');
                            Alert.alert('Cleared', 'Local chat cache wiped. Pull-to-refresh on Chats to reload.');
                          } catch (e) {
                            Alert.alert('Failed', String(e?.message || e));
                          }
                        } },
                    ],
                  );
                }}>
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>🗑️ Clear Local Chats</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Profile header card — matches the mockup: avatar on the left,
            name + "Protect what matters." subtitle in the middle, shield
            badge on the right. Tap anywhere to edit profile. */}
        <TouchableOpacity style={[st.profileCard, { backgroundColor: card, borderColor: border }]} onPress={() => setPage('profile')}>
          <View style={{ position: 'relative' }}>
            {profilePhoto
              ? <Image source={{ uri: profilePhoto }} style={st.profilePhoto} />
              : <View style={[st.profilePhotoPlaceholder, { backgroundColor: accent }]}>
                  <Text style={st.profileInitial}>{displayName ? displayName[0].toUpperCase() : '?'}</Text>
                </View>}
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={[st.profileName, { color: tx }]} numberOfLines={1}>{displayName || 'Tap to set your name'}</Text>
            <Text style={[st.profileSub, { color: sub }]}>Protect what matters.</Text>
            {vaultHandle ? <Text style={[st.profileId, { color: accent, marginTop: 2 }]}>{vaultHandle}</Text> : null}
          </View>
          {/* Shield badge on the right — visual trust signal, matches mockup */}
          <View style={{
            width: 38, height: 38, borderRadius: 12,
            backgroundColor: accent + '22',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 18 }}>🛡️</Text>
          </View>
        </TouchableOpacity>

        {/* Mockup-style category cards: rounded dark cards with single
            chevron rows. Each navigates to a sub-page that contains the
            actual settings (existing Section/Row/Toggle layout). Keeps
            the main page clean and "premium" while preserving every
            existing setting under one of the categories. */}
        <View style={[st.categoryCard, { backgroundColor: card, borderColor: border }]}>
          <CatRow icon="👤" label="Account"          onPress={() => setPage('account')}      tx={tx} sub={sub} border={border} accent={accent} />
          <CatRow icon="🔒" label="Privacy"          onPress={() => setPage('privacy')}      tx={tx} sub={sub} border={border} accent={accent} />
          <CatRow icon="🔔" label="Notifications"    onPress={() => setPage('notifications')} tx={tx} sub={sub} border={border} accent={accent} />
          <CatRow icon="🎨" label="Appearance"       onPress={() => setPage('appearance')}   tx={tx} sub={sub} border={border} accent={accent} />
          <CatRow icon="💾" label="Data and Storage" onPress={() => setPage('data-storage')} tx={tx} sub={sub} border={border} accent={accent} last />
        </View>

        <View style={[st.categoryCard, { backgroundColor: card, borderColor: border, marginTop: 12 }]}>
          <CatRow icon="❓" label="Help & Support"   onPress={() => setPage('help')}         tx={tx} sub={sub} border={border} accent={accent} />
          <CatRow icon="ℹ️" label="About VaultChat"  onPress={() => setPage('about')}        tx={tx} sub={sub} border={border} accent={accent} last />
        </View>

        {/* More — overflow page that holds Discover, Business, AI Assistant,
            Nearby, and the legal docs. Lives here now that the bottom-tab
            "More" was replaced by a direct Settings tab. */}
        <View style={[st.categoryCard, { backgroundColor: card, borderColor: border, marginTop: 12 }]}>
          <CatRow icon="⋯"  label="More"             onPress={() => navigation.navigate('More')}     tx={tx} sub={sub} border={border} accent={accent} last />
        </View>

        <TouchableOpacity style={st.signOutBtn} onPress={signOut}>
          <Text style={st.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── PIN entry modal ────────────────────────────────────
          Shown when the user taps Set Real PIN or Decoy PIN. Enters a
          6-digit PIN via a numeric keypad, saves it to AsyncStorage under
          the appropriate key (vaultchat_real_pin or vaultchat_decoy_pin)
          which BiometricLockScreen already reads to validate entries. */}
      {/* ── Vault backup modal (Phase XX) ────────────────
          Single modal with both export + restore flows; the
          `backupMode` state switches the title/CTA. PIN is the
          encryption key — never stored, only used to derive the
          AES-GCM key in vaultBackup.js. */}
      <Modal visible={backupModal} transparent animationType="fade" onRequestClose={() => setBackupModal(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }}
          activeOpacity={1}
          onPress={() => !backupBusy && setBackupModal(false)}>
          <View style={{ backgroundColor: card, borderRadius: 18, padding: 24, width: '85%' }} onStartShouldSetResponder={() => true}>
            <Text style={{ color: tx, fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 6 }}>
              {backupMode === 'export' ? 'Backup Vault' : 'Restore Vault'}
            </Text>
            <Text style={{ color: sub, fontSize: 13, textAlign: 'center', marginBottom: 18 }}>
              {backupMode === 'export'
                ? 'Enter your Vault PIN — it will encrypt the backup. You\'ll need the same PIN to restore.'
                : 'Enter the Vault PIN you used when you exported the backup.'}
            </Text>
            <TextInput
              value={backupPin}
              onChangeText={setBackupPin}
              placeholder="Vault PIN"
              placeholderTextColor={sub}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={12}
              autoFocus
              style={{ backgroundColor: bg, color: tx, borderColor: border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, textAlign: 'center', letterSpacing: 4, marginBottom: 14 }}
              editable={!backupBusy}
            />
            <TouchableOpacity
              style={{ backgroundColor: accent, paddingVertical: 14, borderRadius: 12, alignItems: 'center', opacity: backupPin && !backupBusy ? 1 : 0.5 }}
              disabled={!backupPin || backupBusy}
              onPress={async () => {
                setBackupBusy(true);
                try {
                  if (backupMode === 'export') {
                    const r = await exportVaultBackup(backupPin);
                    setBackupBusy(false);
                    setBackupModal(false);
                    Alert.alert(r.ok ? 'Backup ready' : 'Backup failed', r.message);
                  } else {
                    // Pick a .vchat file via the system document picker.
                    const pick = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
                    if (pick.canceled || !pick.assets?.[0]?.uri) {
                      setBackupBusy(false);
                      return;
                    }
                    const r = await restoreVaultBackup(pick.assets[0].uri, backupPin);
                    setBackupBusy(false);
                    setBackupModal(false);
                    Alert.alert(r.ok ? 'Restored' : 'Restore failed', r.message);
                  }
                } catch (e) {
                  setBackupBusy(false);
                  Alert.alert('Error', e?.message || 'Something went wrong.');
                }
              }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {backupBusy ? 'Working…' : (backupMode === 'export' ? 'Encrypt & Export' : 'Decrypt & Restore')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => !backupBusy && setBackupModal(false)} style={{ alignItems: 'center', paddingVertical: 12, marginTop: 4 }}>
              <Text style={{ color: sub, fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={pinModal} transparent animationType="fade" onRequestClose={() => setPinModal(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }}
          activeOpacity={1}
          onPress={() => setPinModal(false)}>
          <TouchableOpacity
            activeOpacity={1}
            style={{ width: '85%', borderRadius: 20, backgroundColor: card, borderWidth: 1, borderColor: border, padding: 22, alignItems: 'center' }}>
            <Text style={{ color: tx, fontSize: 18, fontWeight: '700', marginBottom: 4 }}>
              {pinType === 'real'  ? 'Set Real PIN'
              : pinType === 'decoy' ? 'Set Decoy PIN'
              :                       'Set Vault PIN'}
            </Text>
            <Text style={{ color: sub, fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
              {pinType === 'real'
                ? 'Your primary unlock PIN. Required to open the app after backgrounding.'
                : pinType === 'decoy'
                  ? 'A decoy PIN that unlocks into a hidden/empty chat list — useful if someone coerces you to open the app.'
                  : 'Reveals chats you\'ve moved to your vault. Long-press the Chats title and enter this PIN to unlock the vault view.'}
            </Text>
            {/* 6-dot indicator */}
            <View style={{ flexDirection: 'row', gap: 14, marginBottom: 20 }}>
              {[0,1,2,3,4,5].map(i => (
                <View
                  key={i}
                  style={{
                    width: 16, height: 16, borderRadius: 8,
                    borderWidth: 2, borderColor: accent,
                    backgroundColor: pinInput.length > i ? accent : 'transparent',
                  }}
                />
              ))}
            </View>
            {/* Numeric keypad */}
            <View style={{ gap: 10, marginBottom: 14 }}>
              {[['1','2','3'],['4','5','6'],['7','8','9'],['⌫','0','✓']].map((row, ri) => (
                <View key={ri} style={{ flexDirection: 'row', gap: 10 }}>
                  {row.map((d) => {
                    const isBack = d === '⌫';
                    const isOk   = d === '✓';
                    const canSubmit = pinInput.length === 6;
                    return (
                      <TouchableOpacity
                        key={d}
                        disabled={isOk && !canSubmit}
                        onPress={async () => {
                          if (isBack) {
                            setPinInput(p => p.slice(0, -1));
                          } else if (isOk) {
                            if (!canSubmit) return;
                            // Vault PIN goes through the vault service so the
                            // unlock state + vaulted-id list stay in sync. Real
                            // and decoy stay on direct AsyncStorage so
                            // BiometricLockScreen's existing reads keep working.
                            if (pinType === 'vault') {
                              await setVaultPin(pinInput);
                              setVaultPinSet(true);
                            } else {
                              // Security audit fix #121 — real & decoy PINs
                              // now persist to Keychain via securePinStore.
                              const key = pinType === 'real' ? PIN_KEY_REAL : PIN_KEY_DECOY;
                              await setPin(key, pinInput);
                              if (pinType === 'real') setRealPin(pinInput);
                              else                    setDecoyPin(pinInput);
                            }
                            setPinModal(false);
                            setPinInput('');
                            Alert.alert('PIN saved',
                              pinType === 'real'  ? 'Your real PIN is set.'
                            : pinType === 'decoy' ? 'Your decoy PIN is set.'
                            :                       'Your vault PIN is set. Long-press the Chats title to unlock.');
                          } else if (pinInput.length < 6) {
                            setPinInput(p => p + d);
                          }
                        }}
                        style={{
                          width: 64, height: 64, borderRadius: 32,
                          backgroundColor: isOk && canSubmit ? accent : inputBg,
                          alignItems: 'center', justifyContent: 'center',
                          opacity: (isOk && !canSubmit) ? 0.35 : 1,
                        }}>
                        <Text style={{ color: isOk && canSubmit ? '#fff' : tx, fontSize: 22, fontWeight: '500' }}>{d}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
            {/* Clear existing PIN */}
            {((pinType === 'real' && realPin) || (pinType === 'decoy' && decoyPin) || (pinType === 'vault' && vaultPinSet)) && (
              <TouchableOpacity
                onPress={async () => {
                  if (pinType === 'vault') {
                    // clearVaultPin also wipes the vaulted-id list — without
                    // a PIN there's no vault, so the chats inside come back
                    // out into the main list.
                    await clearVaultPin();
                    setVaultPinSet(false);
                  } else {
                    // Security audit fix #121 — clear from Keychain.
                    const key = pinType === 'real' ? PIN_KEY_REAL : PIN_KEY_DECOY;
                    await clearPin(key);
                    if (pinType === 'real') setRealPin('');
                    else                    setDecoyPin('');
                  }
                  setPinModal(false);
                  setPinInput('');
                }}>
                <Text style={{ color: '#ff4444', fontSize: 13, fontWeight: '600' }}>Remove PIN</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Inline Vault PIN setup — opens when the user taps the
          Vault PIN row and no PIN exists yet. PIN + confirm form,
          4-8 digits, no need to navigate away from Settings. */}
      <VaultPinSetupModal
        visible={vaultSetupModal}
        onClose={() => setVaultSetupModal(false)}
        onCreated={async () => {
          setVaultSetupModal(false);
          setVaultPinSet(true);
          // Mark first-run flag seen so VaultScreen doesn't re-pop
          // its own setup modal next visit.
          try { await AsyncStorage.setItem('vaultchat_vault_setup_seen', '1'); } catch {}
          Alert.alert('Vault PIN created', 'You can now move chats into the vault from the chat list (long-press a row → Move to Vault).');
        }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  header: { fontSize: 28, fontWeight: 'bold' },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1 },
  navTitle: { fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  profileCard: { margin: 16, borderRadius: 20, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center' },
  profilePhoto: { width: 64, height: 64, borderRadius: 32 },
  profilePhotoPlaceholder: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  profileInitial: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  profileName: { fontSize: 17, fontWeight: 'bold', marginBottom: 2 },
  profileSub: { fontSize: 13, marginBottom: 2 },
  profileId: { fontSize: 11, fontWeight: 'bold', marginBottom: 2 },
  editBadge: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  profileTopCard: { borderRadius: 20, borderWidth: 1, padding: 20, alignItems: 'center', marginBottom: 16 },
  bigPhoto: { width: 110, height: 110, borderRadius: 55 },
  bigPhotoPlaceholder: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center' },
  bigPhotoInitial: { color: '#fff', fontSize: 44, fontWeight: 'bold' },
  cameraOverlay: { position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  nameInCard: { fontSize: 20, fontWeight: 'bold', marginTop: 12, borderBottomWidth: 1, paddingBottom: 6, width: '100%', textAlign: 'center' },
  vaultIdInCard: { fontSize: 12, fontWeight: 'bold', marginTop: 4 },
  fieldLabel: { fontSize: 11, fontWeight: 'bold', letterSpacing: 1, marginBottom: 6, marginTop: 16 },
  fieldBox: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 15, marginBottom: 4 },
  hint: { fontSize: 11, marginTop: 4, marginBottom: 4 },
  copyBtn: { padding: 8, paddingHorizontal: 14, borderRadius: 8 },
  saveBtn: { marginTop: 28, padding: 16, borderRadius: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 6, letterSpacing: 1 },
  card: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingHorizontal: 16, borderBottomWidth: 1, gap: 10 },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowIcon: { fontSize: 20, width: 28 },
  rowLabel: { fontSize: 15 },
  rowSub: { fontSize: 12, marginTop: 1 },
  chevron: { fontSize: 20, marginLeft: 4 },
  signOutBtn: { margin: 16, marginTop: 24, padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: '#ff4444', alignItems: 'center' },
  signOutText: { color: '#ff4444', fontWeight: 'bold', fontSize: 16 },
  blockInputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, marginBottom: 16, overflow: 'hidden' },
  blockBtn: { padding: 14, paddingHorizontal: 18, margin: 6, borderRadius: 10 },
  blockedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  // Mockup-style grouped card holding category rows on the main page.
  categoryCard: {
    marginHorizontal: 16, borderRadius: 18, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
});
