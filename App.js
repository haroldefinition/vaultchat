import "react-native-gesture-handler";
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// VaultChat — App.js
import React, { useEffect, useState } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator }  from '@react-navigation/bottom-tabs';
import { StatusBar, Text, View, TouchableOpacity, StyleSheet, Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme } from './src/services/theme';
import { UnreadProvider, useUnread } from './src/services/unreadBadge';
import { setupPushNotifications, addNotificationResponseListener, clearBadge } from './src/services/pushNotifications';

// Sentry crash reporting. Wired by the @sentry/wizard CLI; we own
// the init config below. Sentry.wrap() at the bottom of this file
// auto-binds the React error boundary so unhandled render errors
// reach the dashboard.
//
// To set the DSN:
//   1. Go to https://sentry.io → your project → Settings → Client Keys (DSN)
//   2. Copy the DSN string (looks like https://abc@o123.ingest.us.sentry.io/456)
//   3. Replace 'YOUR_DSN_HERE' below with it
//   4. Rebuild
import * as Sentry from '@sentry/react-native';

// VaultChat Sentry DSN — registered to AUXXILUS MEDIA LLC's
// react-native project. Sentry DSNs are designed to be embedded in
// the client bundle (rate-limited per project, not secret).
const SENTRY_DSN = 'https://8c2fb572aec1eb09868874f3f4d3f629@o4511306881368064.ingest.us.sentry.io/4511306886086656';
if (SENTRY_DSN && !SENTRY_DSN.includes('YOUR_DSN_HERE')) {
  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: __DEV__ ? 'development' : 'production',
      tracesSampleRate: 0.1,
      enableNative: true,
      enableNativeCrashHandling: true,
      attachStacktrace: true,
      // Don't capture user IPs — Supabase already has those, no value
      // adding them to Sentry too.
      sendDefaultPii: false,
      // Session Replay explicitly disabled — VaultChat is privacy-
      // first and recording user sessions (even masked) is too
      // aggressive a tradeoff for an E2E messaging app. Re-enable
      // later if we ever need it for a specific debugging window,
      // but ship with it OFF.
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      integrations: (defaults) =>
        defaults.filter((i) => !i?.name?.toLowerCase?.().includes('replay')),
    });
  } catch (e) { if (__DEV__) console.warn('[sentry] init failed:', e?.message || e); }
}
import { flushQueue } from './src/services/messageQueue';
import { subscribeToInviteUrls } from './src/services/inviteLink';
import { findByHandle } from './src/services/vaultHandle';
import { ShareIntentBridge } from './src/services/shareIntent';
import { isBiometricEnabled } from './src/services/biometric';
import { connectSocket, disconnectSocket } from './src/services/socket';
import { startCallListener, stopCallListener } from './src/services/callListener';

// Single navigation ref shared with callListener so it can navigate
// from outside the React tree when a `call:incoming` arrives.
const navigationRef = createNavigationContainerRef();

// ── Core screens ──────────────────────────────────────────────
import SplashScreen        from './src/screens/SplashScreen';
import RegisterScreen      from './src/screens/RegisterScreen';
// WelcomeScreen import removed (2026-04-30) per Harold — the dark
// premium-branded landing was confusing because tapping its CTAs
// transitioned into the bright white RegisterScreen. Logged-out
// users now land directly on RegisterScreen which is the original
// "Welcome to VaultChat" white form. The WelcomeScreen.js file is
// kept on disk for future reference.
import EncryptionInfoScreen from './src/screens/EncryptionInfoScreen';
import PremiumUpgradeSplash from './src/components/PremiumUpgradeSplash';
import HistoryRestorePrompt from './src/components/HistoryRestorePrompt';
import BiometricLockScreen from './src/screens/BiometricLockScreen';
import ChatsScreen         from './src/screens/ChatsScreen';
import ChatRoomScreen      from './src/screens/ChatRoomScreen';
import CallScreen          from './src/screens/CallScreen';
import ActiveCallScreen    from './src/screens/ActiveCallScreen';
// NOTE: GroupCallScreen was an early-phase stub with MAX_PARTICIPANTS=8 and
// no wiring to the real conference engine (roomCall.js). Removed from the
// navigator in task #98 since nothing navigated to it. The real group-call
// entry point is task #63 — wire a phone icon in GroupChatScreen to
// ActiveCallScreen with mode='outgoing-conference' + the group's members.
import GroupScreen         from './src/screens/GroupScreen';
import GroupChatScreen     from './src/screens/GroupChatScreen';
import DiscoverScreen      from './src/screens/DiscoverScreen';
import SettingsScreen      from './src/screens/SettingsScreen';

// ── Stack-only screens ────────────────────────────────────────
import ProfileScreen       from './src/screens/ProfileScreen';
import NewContactScreen    from './src/screens/NewContactScreen';
import NewCallScreen       from './src/screens/NewCallScreen';
import NewMessageScreen    from './src/screens/NewMessageScreen';
import ContactPickerScreen from './src/screens/ContactPickerScreen';
import ChannelsScreen      from './src/screens/ChannelsScreen';
import PrivacyPolicyScreen  from './src/screens/PrivacyPolicyScreen';
import TermsOfServiceScreen from './src/screens/TermsOfServiceScreen';
import CommunityGuidelinesScreen from './src/screens/CommunityGuidelinesScreen';
import OfferInboxScreen    from './src/screens/OfferInboxScreen';
import BusinessScreen      from './src/screens/BusinessScreen';
import BusinessChatScreen  from './src/screens/BusinessChatScreen';
import TrendingScreen      from './src/screens/TrendingScreen';
import AIAssistantScreen   from './src/screens/AIAssistantScreen';
import NearbyScreen        from './src/screens/NearbyScreen';
import ContactViewScreen   from './src/screens/ContactViewScreen';
import ContactsScreen      from './src/screens/ContactsScreen';
import AddContactScreen    from './src/screens/AddContactScreen';
import IncomingCallScreen  from './src/screens/IncomingCallScreen';
import QRContactScreen     from './src/screens/QRContactScreen';
import FoldersScreen       from './src/screens/FoldersScreen';
import BlockedUsersScreen  from './src/screens/BlockedUsersScreen';
import ThemePickerScreen   from './src/screens/ThemePickerScreen';
import VaultScreen         from './src/screens/VaultScreen';
import LockedChatsScreen   from './src/screens/LockedChatsScreen';

// ── Premium Modal (accessed everywhere) ──────────────────────
import PremiumModal from './src/components/PremiumModal';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// ── More Screen (Business + AI + Nearby behind a "More" tab) ─
function MoreScreen({ navigation }) {
  const { bg, card, tx, sub, border, accent } = useTheme();
  const items = [
    { icon:'🏪', label:'Business',        screen:'Business',      desc:'Dashboard, inbox & plans' },
    { icon:'🤖', label:'AI Assistant',    screen:'AIAssistant',   desc:'Private, on-device AI' },
    // Discover used to be a top-level bottom tab. With the tab-bar
    // refresh it lives here in the overflow page so we keep the
    // surface accessible without crowding the bottom dock.
    { icon:'🔍', label:'Discover',        screen:'Discover',      desc:'Channels, communities, trending' },
    { icon:'📡', label:'Nearby',          screen:'Nearby',        desc:'Offline mesh messaging' },
    { icon:'🔒', label:'Privacy Policy',     screen:'PrivacyPolicy',      desc:'How we protect you' },
    { icon:'📋', label:'Terms of Service',   screen:'TermsOfService',     desc:'Usage terms & conditions' },
    { icon:'🛡️', label:'Community Guidelines',screen:'CommunityGuidelines',desc:'What is and isn’t allowed' },
    { icon:'⚙️', label:'Settings',           screen:'Settings',           desc:'Notifications, account' },
  ];
  return (
    <View style={[m.container,{backgroundColor:bg}]}>
      {/* Header now includes a back chevron — MoreScreen used to be
          a tab root, but post-refresh it's reached via a Settings
          row push, so users need a way back. canGoBack guard keeps
          the chevron hidden if it ever lands as a tab root again. */}
      <View style={[m.header,{borderBottomColor:border,backgroundColor:bg}]}>
        {navigation.canGoBack && navigation.canGoBack() ? (
          <TouchableOpacity onPress={() => navigation.goBack()} style={m.backBtn}>
            <Text style={[m.backTx,{color:accent}]}>‹</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={[m.title,{color:tx,flex:1,textAlign:navigation.canGoBack?.() ? 'center' : 'left'}]}>More</Text>
        {/* Spacer so the centered title stays optically balanced. */}
        {navigation.canGoBack && navigation.canGoBack() ? <View style={m.backBtn} /> : null}
      </View>
      <View style={{paddingHorizontal:16,paddingTop:16,gap:10}}>
        {items.map(item => (
          <TouchableOpacity key={item.label}
            style={[m.row,{backgroundColor:card,borderColor:border}]}
            onPress={() => navigation.navigate(item.screen)}
            activeOpacity={0.75}>
            <View style={[m.iconWrap,{backgroundColor:accent+'18'}]}>
              <Text style={{fontSize:22}}>{item.icon}</Text>
            </View>
            <View style={{flex:1,marginLeft:14}}>
              <Text style={[{color:tx,fontWeight:'700',fontSize:15}]}>{item.label}</Text>
              <Text style={[{color:sub,fontSize:12,marginTop:1}]}>{item.desc}</Text>
            </View>
            <Text style={{color:sub,fontSize:20,paddingRight:4}}>›</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const m = StyleSheet.create({
  container:{flex:1},
  header:   {flexDirection:'row',alignItems:'center',paddingHorizontal:14,paddingTop:60,paddingBottom:14,borderBottomWidth:StyleSheet.hairlineWidth},
  backBtn:  {width:36,height:36,alignItems:'center',justifyContent:'center'},
  backTx:   {fontSize:30,fontWeight:'bold'},
  title:    {fontSize:28,fontWeight:'800'},
  row:      {flexDirection:'row',alignItems:'center',borderRadius:18,padding:16,borderWidth:1},
  iconWrap: {width:46,height:46,borderRadius:14,alignItems:'center',justifyContent:'center'},
});

// ── Main tab navigator ────────────────────────────────────────
function MainTabs() {
  const { card, border, accent } = useTheme();
  const tabBg = card;
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor:tabBg, borderTopColor:border, borderTopWidth:0.5, height:80, paddingBottom:16, paddingTop:8 },
        tabBarActiveTintColor:   accent,
        tabBarInactiveTintColor: '#aaaaaa',
        tabBarLabelStyle: { fontSize:11, fontWeight:'600', marginTop:2 },
      }}>
      <Tab.Screen name="Chats" component={ChatsScreen} options={({ navigation }) => {
        const { count } = useUnread();
        return {
          tabBarIcon: ({ focused }) => (
            <View style={{ position: 'relative' }}>
              <Text style={{ fontSize: 26, opacity: focused ? 1 : 0.85 }}>💬</Text>
              {count > 0 && (
                // Accent-tinted dot (violet in dark, Fiji blue in light)
                // matches the mockup's premium notification indicator,
                // replacing the loud iOS-system red. Counts above 0
                // still render the number; the small dot reads cleaner
                // than the red badge against the dark canvas.
                (<View style={{
                  position: 'absolute', top: -4, right: -8,
                  backgroundColor: accent, borderRadius: 10,
                  minWidth: 18, height: 18,
                  alignItems: 'center', justifyContent: 'center',
                  paddingHorizontal: 4,
                }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                    {count > 99 ? '99+' : count}
                  </Text>
                </View>)
              )}
            </View>
          ),
        };
      }} />
      <Tab.Screen name="Calls"    component={CallScreen}     options={{ tabBarIcon:({focused})=><Text style={{fontSize:26,opacity:focused?1:0.85}}>📞</Text> }}/>
      {/* Contacts is now a top-level bottom tab per the design refresh
          (was previously a Stack screen pushed from the Chats header).
          The Stack registration further down still lives so deep links
          like ContactView → back continue to land on the same screen. */}
      <Tab.Screen name="ContactsTab" component={ContactsScreen}
        options={{
          tabBarLabel: 'Contacts',
          tabBarIcon:({focused})=><Text style={{fontSize:26,opacity:focused?1:0.85}}>👤</Text>,
        }}/>
      {/* Vault replaces the dedicated "Groups" bottom tab (per the
          premium mockup design refresh). Groups is still reachable
          via the chip row on the Chats screen + the existing Stack
          registration further below — no functionality is lost. */}
      <Tab.Screen name="VaultTab" component={VaultScreen}
        options={{
          tabBarLabel: 'Vault',
          tabBarIcon:({focused})=><Text style={{fontSize:24,opacity:focused?1:0.85}}>🛡️</Text>,
        }}/>
      {/* "Settings" replaces the old "More" tab. The MoreScreen overflow
          (Business, AI Assistant, Nearby, Discover, legal pages) is now
          reachable from a row inside SettingsScreen, so this tab leads
          straight to the user's Settings instead of an interstitial. */}
      <Tab.Screen name="SettingsTab" component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon:({focused})=>(
            <Text style={{ fontSize: 26, opacity: focused ? 1 : 0.85 }}>⚙️</Text>
          ),
        }}/>
    </Tab.Navigator>
  );
}

// ── Root app ──────────────────────────────────────────────────
// Sentry.wrap is a no-op when Sentry hasn't been init'd, so safe to
// keep here even before the DSN is filled in.
export default Sentry.wrap(function App() {
  const [ready,     setReady]     = useState(false);
  const [isLoggedIn,setIsLoggedIn]= useState(false);
  const [isLocked,  setIsLocked]  = useState(false);
  // Premium upgrade splash — fires once when the user's premium
  // flag flips false → true (purchase completes, Restore brings it
  // back, server sync confirms it). Subscribed via adsService below.
  const [showUpgradeSplash, setShowUpgradeSplash] = useState(false);

  useEffect(() => {
    (async () => {
      setupPushNotifications();
      clearBadge(); // clear badge when app opens
      flushQueue(); // retry any queued messages from offline period

      // Flush queue + clear badge on foreground.
      //
      // Real PIN / Biometric front-door lock was removed per Harold
      // (2026-04-29) — users open the app without any unlock screen.
      // Only the Vault PIN remains (it gates specific chats moved
      // into the vault, not the whole app). The 5-min lock timeout
      // logic is preserved below as a comment for easy re-enable
      // if we ever bring back the front-door lock.
      //
      //   let backgroundedAt = null;
      //   const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
      //   ... if (biometricOn) setIsLocked(true); ...
      const appStateSub = AppState.addEventListener('change', async state => {
        if (state === 'active') {
          flushQueue();
          clearBadge();
          // Silent weekly auto-backup (Apr 30). Runs on every
          // app foreground but only triggers if 7+ days have
          // elapsed since the last successful run AND the user
          // has a Vault PIN set (required to encrypt the backup).
          // No notifications, no UI — backups land in the app's
          // private documents directory and are restorable from
          // Settings → Restore Vault if ever needed.
          try {
            const last = parseInt(await AsyncStorage.getItem('vaultchat_last_auto_backup') || '0', 10);
            const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
            if (Date.now() - last >= WEEK_MS) {
              const { hasVaultPin, getPin } = require('./src/services/vault');
              const has = await hasVaultPin();
              if (has) {
                // We need the actual PIN value to derive the backup
                // encryption key. vault.js doesn't expose getPin
                // directly — pull from securePinStore via the same
                // PIN_KEY_VAULT constant.
                const { getPin: spGet, PIN_KEY_VAULT } = require('./src/services/securePinStore');
                const pin = await spGet(PIN_KEY_VAULT).catch(() => null);
                if (pin) {
                  const { silentAutoBackup } = require('./src/services/vaultBackup');
                  const r = await silentAutoBackup(pin);
                  if (r?.ok) {
                    await AsyncStorage.setItem('vaultchat_last_auto_backup', String(Date.now()));
                    if (__DEV__) console.log('[auto-backup] weekly backup written:', r.path);
                  }
                }
              }
            }
          } catch (e) {
            if (__DEV__) console.warn('[auto-backup] check failed:', e?.message || e);
          }

          // Phase 1 (90-day history): sweep all per-room and
          // per-group plaintext caches and drop entries older than
          // 90 days. Throttled to once per day inside the helper
          // so the O(rooms) AsyncStorage walk doesn't run on every
          // brief background→foreground transition.
          try {
            const { pruneOldPlaintextCaches } = require('./src/services/historyPruner');
            pruneOldPlaintextCaches().catch(() => {});
          } catch (e) {
            if (__DEV__) console.warn('[history-prune] dispatch failed:', e?.message || e);
          }

          // Phase 2 (90-day history): silent encrypted upload of the
          // 90-day plaintext snapshot to Supabase. Throttled to once
          // every 6h inside runHistoryBackup. Skipped silently if no
          // Vault PIN is set (the PIN is the encryption key) or if
          // there's nothing cached locally yet. No UI on success or
          // failure — manual "Back up Chats to Cloud" in Settings is
          // the user-visible entry point if they want feedback.
          try {
            const { hasVaultPin } = require('./src/services/vault');
            const has = await hasVaultPin();
            if (has) {
              const { getPin: spGet, PIN_KEY_VAULT } = require('./src/services/securePinStore');
              const pin = await spGet(PIN_KEY_VAULT).catch(() => null);
              if (pin) {
                const { runHistoryBackup } = require('./src/services/historyBackup');
                runHistoryBackup(pin).catch(() => {});
              }
            }
          } catch (e) {
            if (__DEV__) console.warn('[history-backup] dispatch failed:', e?.message || e);
          }
        }
      });

      const cleanup = addNotificationResponseListener(() => {});

      // Deep-link routing for vaultchat://user/<handle> URLs (task #67).
      // When someone taps a shared invite, we resolve the handle to a real
      // profile and pop NewMessage with the contact pre-filled — same shape
      // the QR scanner uses, so the in-app behavior is identical regardless
      // of how the URL was delivered (QR, link, paste, share-sheet, etc).
      const unsubInvite = subscribeToInviteUrls(async ({ handle, name }) => {
        if (!handle) return;
        const profile = await findByHandle(handle);
        const navReady = navigationRef?.isReady?.();
        const tryNav = () => {
          if (!navigationRef?.isReady?.()) {
            // Stack still warming up (cold launch via URL) — retry shortly.
            setTimeout(tryNav, 200);
            return;
          }
          navigationRef.navigate('NewMessage', {
            selectedContact: profile
              ? {
                  handle: profile.vault_handle ? `@${profile.vault_handle}` : `@${handle}`,
                  phone:  profile.phone || null,
                  name:   profile.display_name || name || `@${handle}`,
                }
              : { handle: `@${handle}`, phone: null, name: name || `@${handle}` },
          });
        };
        tryNav();
      });

      // Share extension wiring (task #83) is mounted as a
      // <ShareIntentBridge /> inside the NavigationContainer below
      // — expo-share-intent v6 is hook-only so it has to live in
      // the React tree, not be initialized imperatively from here.

      // Bootstrap socket + global call listener for an authenticated user.
      // Safe to call multiple times — both services no-op if already set up.
      const bootstrapRealtime = (userId) => {
        if (!userId) return;
        connectSocket(userId);
        // Give the socket a tick to connect before wiring the listener.
        setTimeout(() => startCallListener({ myUserId: userId, navigationRef }), 200);
        // PushKit (task #103) — registers the device for VoIP pushes
        // so cold-killed iOS apps still ring CallKit on incoming calls.
        // No-ops on Android and in Expo Go.
        try { require('./src/services/voipPushService').startVoipPush({ myUserId: userId }); } catch {}
        // IAP (task #92) — tie purchases to this user, init StoreKit,
        // pull premium status from server. All best-effort: no-op
        // gracefully when react-native-iap isn't compiled in.
        try {
          const iap = require('./src/services/iapService');
          iap.setUserId(userId);
          iap.initIAP().then(() => iap.syncPremiumFromServer()).catch(() => {});
        } catch {}
        // Hydrate the per-user block list (task #94). Re-hydrate on every
        // sign-in because the cached list is keyed per-app, not per-user.
        try { require('./src/services/blocks').hydrateBlocks(); } catch {}
        // Device integrity check (security audit fix #128). Warns once
        // if the device appears jailbroken/rooted — VaultChat's privacy
        // guarantees rely on OS sandboxing that those devices break.
        try { require('./src/services/deviceIntegrity').maybeWarnAboutDeviceIntegrity(); } catch {}
        // Session guard (security audit fix #127). Tracks app activity
        // and force-signs-out the local device after IDLE_TIMEOUT_MS
        // (7 days) of inactivity — backstop for stolen/lost devices.
        try {
          require('./src/services/sessionGuard').startSessionGuard({
            onSignedOut: () => { setIsLoggedIn(false); },
          });
        } catch {}
        // Listen for an account suspension push from the server. The server
        // emits this immediately before disconnecting a banned socket — we
        // surface a clear, modal alert so the user knows why they were
        // kicked instead of staring at a silent reconnect loop.
        setTimeout(() => {
          try {
            const sock = require('./src/services/socket').getSocket?.();
            if (!sock || sock.__suspendedBound) return;
            sock.__suspendedBound = true;
            sock.on('account:suspended', (info) => {
              const reason = info?.reason
                ? `\n\nReason: ${info.reason}`
                : '';
              try {
                require('react-native').Alert.alert(
                  'Account suspended',
                  `Your VaultChat account has been suspended for violating the Community Guidelines.${reason}\n\nIf you believe this is a mistake, contact support@vaultchat.app.`,
                  [{ text: 'OK' }],
                );
              } catch {}
            });
          } catch {}
        }, 300);
      };

      // Check auth
      try {
        const { supabase } = require('./src/services/supabase');
        const { publishMyPublicKey } = require('./src/services/keyExchange');
        // Phase MM: also publish this install's per-device key.
        // Best-effort; silently no-ops if Supabase is unreachable.
        const { publishMyDeviceKey } = require('./src/services/deviceKeys');
        // Phase YY: publish this device's Double Ratchet pre-key
        // bundle (identity_pub + signed_pre_pub). Lets peers
        // bootstrap an X3DH session for forward-secret 1:1 chats.
        const { publishMyRatchetPreKey } = require('./src/services/ratchetService');
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setIsLoggedIn(true);
          // Publish our NaCl public key so peers can encrypt to us.
          if (session.user?.id) {
            publishMyPublicKey(session.user.id).catch(() => {});
            publishMyDeviceKey(session.user.id, session.user?.phone || null).catch(() => {});
            publishMyRatchetPreKey(session.user.id).catch(() => {});
            bootstrapRealtime(session.user.id);
          }
        } else {
          const stored = await AsyncStorage.getItem('vaultchat_user');
          setIsLoggedIn(!!stored);
          if (stored) {
            try {
              const u = JSON.parse(stored);
              if (u?.id) {
                publishMyPublicKey(u.id).catch(() => {});
                bootstrapRealtime(u.id);
              }
            } catch {}
          }
        }
        supabase.auth.onAuthStateChange((_event, session) => {
          setIsLoggedIn(!!session);
          if (session?.user?.id) {
            publishMyPublicKey(session.user.id).catch(() => {});
            publishMyDeviceKey(session.user.id, session.user?.phone || null).catch(() => {});
            publishMyRatchetPreKey(session.user.id).catch(() => {});
            bootstrapRealtime(session.user.id);
          } else {
            stopCallListener();
            disconnectSocket();
            try { require('./src/services/voipPushService').stopVoipPush(); } catch {}
          }
        });
      } catch {
        const stored = await AsyncStorage.getItem('vaultchat_user');
        setIsLoggedIn(!!stored);
      }

      // Premium upgrade splash subscription. We snapshot the
      // current premium state once, then watch for the false→true
      // transition. The splash only fires on actual upgrade events,
      // not on every cold-launch where the user is already premium.
      // adsService publishes flag changes via subscribeToPremium.
      try {
        const ads = require('./src/services/adsService');
        let lastPrem = await ads.isPremiumUser();
        const unsubPrem = ads.subscribeToPremium(async (next) => {
          // false → true is the upgrade event we care about.
          if (next && !lastPrem) setShowUpgradeSplash(true);
          lastPrem = !!next;
        });
        // Cleanup is handled implicitly — the bootstrap effect runs
        // once for the lifetime of the app, so the listener should
        // live for the lifetime of the app too.
      } catch {}

      // Front-door lock removed per Harold (2026-04-29). No
      // BiometricLockScreen on launch — user goes straight in.
      // Vault PIN still gates the vault contents inside the app.
      setReady(true);
      return cleanup;
    })();
  }, []);

  // GestureHandlerRootView wraps all three return paths because
  // react-native-gesture-handler's Swipeable (used in ChatsScreen's
  // pin/archive/mark-unread actions) requires it as an ancestor or
  // gestures aren't recognized and the lib throws a render error.
  if (!ready) return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <UnreadProvider><ThemeProvider><SplashScreen /></ThemeProvider></UnreadProvider>
    </GestureHandlerRootView>
  );

  // Front-door lock disabled (2026-04-29) — branch kept defensively
  // in case `setIsLocked(true)` is ever called from another path,
  // but with the Settings toggle removed and the AppState handler
  // skipping the lock check, this should never render in practice.
  if (false && isLocked) return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <UnreadProvider>
      <ThemeProvider>
        <BiometricLockScreen onUnlock={() => setIsLocked(false)} />
      </ThemeProvider>
      </UnreadProvider>
    </GestureHandlerRootView>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <UnreadProvider>
    <ThemeProvider>
      <NavigationContainer ref={navigationRef}>
        <StatusBar barStyle="light-content" backgroundColor="#080b12" />
        {/* Share-extension bridge — listens for incoming iOS shares
            and routes them to NewMessage. Mounted inside the
            NavigationContainer so navigationRef is guaranteed live
            by the time payloads fire. Renders null. */}
        <ShareIntentBridge navigationRef={navigationRef} />
        <Stack.Navigator screenOptions={{ headerShown:false, animation:'slide_from_right' }}>
          {!isLoggedIn ? (
            <Stack.Screen name="Register">
              {props => <RegisterScreen {...props} onLoginCallback={() => setIsLoggedIn(true)} />}
            </Stack.Screen>
          ) : (
            <>
              <Stack.Screen name="Main"          component={MainTabs} />
              <Stack.Screen name="ChatRoom"      component={ChatRoomScreen} />
              <Stack.Screen name="GroupChat"     component={GroupChatScreen} />
              <Stack.Screen name="ActiveCall"    component={ActiveCallScreen}   options={{ animation:'slide_from_bottom' }} />
              <Stack.Screen name="IncomingCall"  component={IncomingCallScreen} options={{ animation:'slide_from_bottom', gestureEnabled: false }} />
              {/* GroupCall stub screen removed — real group-calling wire-up is task #63 */}
              <Stack.Screen name="NewCall"       component={NewCallScreen} />
              <Stack.Screen name="NewMessage"    component={NewMessageScreen} />
              <Stack.Screen name="NewContact"    component={NewContactScreen} />
              <Stack.Screen name="ContactPicker" component={ContactPickerScreen} />
              <Stack.Screen name="Profile"       component={ProfileScreen} />
              <Stack.Screen name="Channels"      component={ChannelsScreen} />
              <Stack.Screen name="PrivacyPolicy"       component={PrivacyPolicyScreen} />
              {/* Tap target from any chat room's 🔒 badge or from
                  Settings → Privacy & Security → "About End-to-end
                  Encryption". Pure info screen, no actions. */}
              <Stack.Screen name="EncryptionInfo"      component={EncryptionInfoScreen} />
              <Stack.Screen name="TermsOfService"      component={TermsOfServiceScreen} />
              <Stack.Screen name="CommunityGuidelines" component={CommunityGuidelinesScreen} />
              <Stack.Screen name="Settings"      component={SettingsScreen} />
              <Stack.Screen name="OfferInbox"    component={OfferInboxScreen} />
              <Stack.Screen name="Business"      component={BusinessScreen} />
              <Stack.Screen name="BusinessChat"  component={BusinessChatScreen} />
              <Stack.Screen name="Trending"      component={TrendingScreen} />
              <Stack.Screen name="AIAssistant"   component={AIAssistantScreen} />
              <Stack.Screen name="Nearby"        component={NearbyScreen} />
              {/* Discover lives in MoreScreen now (was a bottom tab),
                  so it needs a Stack registration to be navigable. */}
              <Stack.Screen name="Discover"      component={DiscoverScreen} />
              {/* MoreScreen reachable from a row in SettingsScreen so the
                  overflow items remain accessible after the tab swap. */}
              <Stack.Screen name="More"          component={MoreScreen} />
              <Stack.Screen name="ContactView"   component={ContactViewScreen} />
              <Stack.Screen name="Contacts"      component={ContactsScreen} />
              <Stack.Screen name="AddContact"    component={AddContactScreen} options={{ animation:'slide_from_bottom', presentation:'modal' }} />
              <Stack.Screen name="QRContact"     component={QRContactScreen} options={{ animation:'slide_from_bottom' }} />
              <Stack.Screen name="Folders"       component={FoldersScreen} />
              <Stack.Screen name="BlockedUsers"  component={BlockedUsersScreen} />
              <Stack.Screen name="ThemePicker"   component={ThemePickerScreen} />
              <Stack.Screen name="Vault"         component={VaultScreen} />
              <Stack.Screen name="LockedChats"   component={LockedChatsScreen} />
              {/* Groups list — pushed when the "Groups" chip on the
                  Chats screen is tapped. We removed the Groups bottom
                  tab in favor of Vault, but the chip still routes
                  here so the destination has to live in the stack. */}
              <Stack.Screen name="Groups"        component={GroupScreen} />
              <Stack.Screen name="Premium"       component={({navigation}) => {
                const [vis,setVis] = useState(true);
                return <PremiumModal visible={vis} onClose={() => navigation.goBack()} onUpgraded={() => navigation.goBack()} />;
              }} options={{ animation:'slide_from_bottom', presentation:'transparentModal' }} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>

      {/* Premium upgrade splash — sits above NavigationContainer
          so it can take over the entire screen when premium flips
          on. Auto-dismisses after 3s; user can also tap Done. */}
      <PremiumUpgradeSplash
        visible={showUpgradeSplash}
        onDone={() => setShowUpgradeSplash(false)}
      />

      {/* First-run "We found your chat backup" prompt — checks for
          a message_history_blob row on mount; if present and we
          haven't already offered restore on this install, prompts
          for the Vault PIN to restore. Self-gated: bails if the
          user isn't signed in or no backup row exists. */}
      <HistoryRestorePrompt />
    </ThemeProvider>
    </UnreadProvider>
    </GestureHandlerRootView>
  );
});
