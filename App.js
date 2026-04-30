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
                <View style={{
                  position: 'absolute', top: -4, right: -8,
                  backgroundColor: accent, borderRadius: 10,
                  minWidth: 18, height: 18,
                  alignItems: 'center', justifyContent: 'center',
                  paddingHorizontal: 4,
                }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                    {count > 99 ? '99+' : count}
                  </Text>
                </View>
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
export default function App() {
  const [ready,     setReady]     = useState(false);
  const [isLoggedIn,setIsLoggedIn]= useState(false);
  const [isLocked,  setIsLocked]  = useState(false);

  useEffect(() => {
    (async () => {
      setupPushNotifications();
      clearBadge(); // clear badge when app opens
      flushQueue(); // retry any queued messages from offline period

      // Flush queue + clear badge + enforce 5-min lock timeout on foreground
      let backgroundedAt = null;
      const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

      const appStateSub = AppState.addEventListener('change', async state => {
        if (state === 'background' || state === 'inactive') {
          backgroundedAt = Date.now();
        } else if (state === 'active') {
          flushQueue();
          clearBadge();
          // Lock if biometric is enabled and app was backgrounded for >5 minutes
          if (backgroundedAt !== null) {
            const elapsed = Date.now() - backgroundedAt;
            backgroundedAt = null;
            if (elapsed >= LOCK_TIMEOUT_MS) {
              const biometricOn = await isBiometricEnabled();
              if (biometricOn) setIsLocked(true);
            }
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

      const locked = await isBiometricEnabled();
      if (locked) setIsLocked(true);
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

  if (isLocked) return (
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
    </ThemeProvider>
    </UnreadProvider>
    </GestureHandlerRootView>
  );
}
