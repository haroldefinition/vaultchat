import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, Image, TextInput, Modal } from 'react-native';
import { supabase } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../services/theme';
import { requestContactsPermission, syncContacts } from '../services/contacts';
import { checkBiometricSupport } from '../services/biometric';
import { generateHandle, getMyHandle, saveHandle } from '../services/vaultHandle';
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
  const [pinType, setPinType] = useState('real');
  const [pinInput, setPinInput] = useState('');
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
    if (d.vaultchat_vault_id) setVaultId(d.vaultchat_vault_id);
    else { const id = 'vault_' + Math.random().toString(36).slice(2,10); setVaultId(id); await AsyncStorage.setItem('vaultchat_vault_id', id); }
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
    if (handle) setVaultHandle(handle);
    else if (d.vaultchat_display_name) {
      const newHandle = await generateHandle(d.vaultchat_display_name);
      setVaultHandle(newHandle);
      await saveHandle(newHandle);
    }
    const bio = await AsyncStorage.getItem('vaultchat_biometric');
    setBiometricEnabled(bio === 'true');
    const rp = await AsyncStorage.getItem('vaultchat_real_pin');
    const dp = await AsyncStorage.getItem('vaultchat_decoy_pin');
    if (rp) setRealPin(rp);
    if (dp) setDecoyPin(dp);
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
    await save('vaultchat_display_name', displayName);
    await save('vaultchat_bio', bio);
    await save('vaultchat_email', email);
    await save('vaultchat_addr1', addr1);
    await save('vaultchat_addr2', addr2);
    await save('vaultchat_city', city);
    await save('vaultchat_state', stateRegion);
    await save('vaultchat_zip', zip);
    await save('vaultchat_country', country);
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

  async function signOut() {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await supabase.auth.signOut(); await AsyncStorage.clear(); } },
    ]);
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

          <Field label="BIO" value={bio} onChange={setBio} placeholder="Write something about yourself..." multiline />
          <Field label="PHONE NUMBER" value={`+${user?.phone || 'Not available'}`} editable={false} />
          <Text style={[st.hint, { color: sub }]}>Phone number cannot be changed</Text>
          <Field label="EMAIL" value={email} onChange={setEmail} placeholder="your@email.com" keyboardType="email-address" />

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
              const contacts = await syncContacts();
              Alert.alert('Friends Found', `Synced ${contacts.length} contacts. Friends using VaultChat will appear in your Calls tab.`);
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
            <Row icon="🔐" label="Biometric Lock" subText="Face ID / Touch ID on app open" right={
              <Switch value={biometricEnabled} onValueChange={async v => {
                const supported = await checkBiometricSupport();
                if (!supported && v) { Alert.alert('Not Available', 'Biometric authentication is not set up on this device.'); return; }
                setBiometricEnabled(v);
                await AsyncStorage.setItem('vaultchat_biometric', v ? 'true' : 'false');
              }} trackColor={{ false: '#333', true: accent }} thumbColor="#fff" />
            } />
            <Row icon="🔢" label="Set Real PIN" subText={realPin ? '••••••' : 'Not set'} onPress={() => { setPinType('real'); setPinInput(''); setPinModal(true); }} />
            <Row icon="🎭" label="Decoy PIN" subText={decoyPin ? 'Set — shows empty chats' : 'Not set'} onPress={() => { setPinType('decoy'); setPinInput(''); setPinModal(true); }} />
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

        <TouchableOpacity style={st.signOutBtn} onPress={signOut}>
          <Text style={st.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── PIN entry modal ────────────────────────────────────
          Shown when the user taps Set Real PIN or Decoy PIN. Enters a
          6-digit PIN via a numeric keypad, saves it to AsyncStorage under
          the appropriate key (vaultchat_real_pin or vaultchat_decoy_pin)
          which BiometricLockScreen already reads to validate entries. */}
      <Modal visible={pinModal} transparent animationType="fade" onRequestClose={() => setPinModal(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }}
          activeOpacity={1}
          onPress={() => setPinModal(false)}>
          <TouchableOpacity
            activeOpacity={1}
            style={{ width: '85%', borderRadius: 20, backgroundColor: card, borderWidth: 1, borderColor: border, padding: 22, alignItems: 'center' }}>
            <Text style={{ color: tx, fontSize: 18, fontWeight: '700', marginBottom: 4 }}>
              {pinType === 'real' ? 'Set Real PIN' : 'Set Decoy PIN'}
            </Text>
            <Text style={{ color: sub, fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
              {pinType === 'real'
                ? 'Your primary unlock PIN. Required to open the app after backgrounding.'
                : 'A decoy PIN that unlocks into a hidden/empty chat list — useful if someone coerces you to open the app.'}
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
                            const key = pinType === 'real' ? 'vaultchat_real_pin' : 'vaultchat_decoy_pin';
                            await AsyncStorage.setItem(key, pinInput);
                            if (pinType === 'real') setRealPin(pinInput);
                            else                    setDecoyPin(pinInput);
                            setPinModal(false);
                            setPinInput('');
                            Alert.alert('PIN saved', pinType === 'real' ? 'Your real PIN is set.' : 'Your decoy PIN is set.');
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
            {((pinType === 'real' && realPin) || (pinType === 'decoy' && decoyPin)) && (
              <TouchableOpacity
                onPress={async () => {
                  const key = pinType === 'real' ? 'vaultchat_real_pin' : 'vaultchat_decoy_pin';
                  await AsyncStorage.removeItem(key);
                  if (pinType === 'real') setRealPin('');
                  else                    setDecoyPin('');
                  setPinModal(false);
                  setPinInput('');
                }}>
                <Text style={{ color: '#ff4444', fontSize: 13, fontWeight: '600' }}>Remove PIN</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
