// VaultChat — App.js
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar, Text, View, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { ThemeProvider, useTheme } from './src/services/theme';
import { setupPushNotifications, addNotificationResponseListener } from './src/services/pushNotifications';
import { isBiometricEnabled } from './src/services/biometric';

// ── Screens ──────────────────────────────────────────────────
import SplashScreen         from './src/screens/SplashScreen';
import RegisterScreen       from './src/screens/RegisterScreen';
import ChatsScreen          from './src/screens/ChatsScreen';
import ChatRoomScreen       from './src/screens/ChatRoomScreen';
import CallScreen           from './src/screens/CallScreen';
import GroupScreen          from './src/screens/GroupScreen';
import GroupChatScreen      from './src/screens/GroupChatScreen';
import GroupCallScreen      from './src/screens/GroupCallScreen';
import SettingsScreen       from './src/screens/SettingsScreen';
import ProfileScreen        from './src/screens/ProfileScreen';
import NewContactScreen     from './src/screens/NewContactScreen';
import NewCallScreen        from './src/screens/NewCallScreen';
import NewMessageScreen     from './src/screens/NewMessageScreen';
import ContactPickerScreen  from './src/screens/ContactPickerScreen';
import ActiveCallScreen     from './src/screens/ActiveCallScreen';
import ChannelsScreen       from './src/screens/ChannelsScreen';
import PrivacyPolicyScreen  from './src/screens/PrivacyPolicyScreen';
import BiometricLockScreen  from './src/screens/BiometricLockScreen';
import DiscoverScreen       from './src/screens/DiscoverScreen';
import OfferInboxScreen     from './src/screens/OfferInboxScreen';
import TrendingScreen       from './src/screens/TrendingScreen';
import BusinessScreen       from './src/screens/BusinessScreen';
import BusinessChatScreen   from './src/screens/BusinessChatScreen';
import AIAssistantScreen    from './src/screens/AIAssistantScreen';
import NearbyScreen         from './src/screens/NearbyScreen';

// Premium modal lives in components
import PremiumModal from './src/components/PremiumModal';

export const COLORS = {
  bg: '#080b12', surface: '#0e1220', s2: '#141828', s3: '#1c2236',
  accent: '#0057a8', blue: '#00b8ff', warn: '#ff6b6b', gold: '#ffd700',
  text: '#dde3f5', dim: '#6b7394', border: '#2a3050',
};

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// ── "More" sheet — Business + AI + Nearby ────────────────────
function MoreTab({ navigation }) {
  const { bg, card, tx, sub, border, accent } = useTheme();
  const ITEMS = [
    { emoji: '💼', label: 'Business',    screen: 'Business',    desc: 'Inbox · Dashboard · Plans' },
    { emoji: '🤖', label: 'AI Assistant',screen: 'AIAssistant', desc: 'Private · Zero retention'  },
    { emoji: '📡', label: 'Nearby',      screen: 'Nearby',      desc: 'Offline mesh messaging'    },
  ];
  return (
    <View style={[mt.container, { backgroundColor: bg }]}>
      <Text style={[mt.title, { color: tx, paddingTop: 56 }]}>More</Text>
      {ITEMS.map(item => (
        <TouchableOpacity key={item.screen}
          style={[mt.row, { backgroundColor: card, borderColor: border }]}
          onPress={() => navigation.navigate(item.screen)}>
          <Text style={{ fontSize: 28 }}>{item.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[mt.rowLabel, { color: tx }]}>{item.label}</Text>
            <Text style={[mt.rowDesc,  { color: sub }]}>{item.desc}</Text>
          </View>
          <Text style={{ color: sub, fontSize: 20 }}>›</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const mt = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  title:     { fontSize: 28, fontWeight: '900', marginBottom: 8, paddingHorizontal: 4 },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, borderWidth: 1, padding: 16 },
  rowLabel:  { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  rowDesc:   { fontSize: 12 },
});

// ── Main tab navigator ────────────────────────────────────────
function MainTabs() {
  const { lightMode, accent, card, border } = useTheme();
  const tabBg     = lightMode ? '#ffffff' : '#0e1220';
  const tabBorder = lightMode ? '#d0e8ff' : '#141828';
  const active    = '#0057a8';
  const inactive  = lightMode ? '#4a90d9' : '#888888';

  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: tabBg, borderTopColor: tabBorder, borderTopWidth: 0.5, height: 80, paddingBottom: 16, paddingTop: 8 },
      tabBarActiveTintColor: active,
      tabBarInactiveTintColor: inactive,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
    }}>
      <Tab.Screen name="Chats"    component={ChatsScreen}    options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.6 }}>💬</Text>, tabBarLabel: 'Chats'    }} />
      <Tab.Screen name="Calls"    component={CallScreen}     options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.6 }}>📞</Text>, tabBarLabel: 'Calls'    }} />
      <Tab.Screen name="Groups"   component={GroupScreen}    options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.6 }}>👥</Text>, tabBarLabel: 'Groups'   }} />
      <Tab.Screen name="Discover" component={DiscoverScreen} options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.6 }}>🌐</Text>, tabBarLabel: 'Discover' }} />
      <Tab.Screen name="More"     component={MoreTab}        options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.6 }}>⋯</Text>,  tabBarLabel: 'More'     }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.6 }}>⚙️</Text>, tabBarLabel: 'Settings' }} />
    </Tab.Navigator>
  );
}

// ── Root app ──────────────────────────────────────────────────
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(null);
  const [isLocked,   setIsLocked]   = useState(false);
  const [premiumModal, setPremiumModal] = useState(false);

  useEffect(() => {
    setupPushNotifications();
    const cleanup = addNotificationResponseListener(() => {});
    return cleanup;
  }, []);

  useEffect(() => {
    const { supabase } = require('./src/services/supabase');
    supabase.auth.getSession().then(({ data: { session } }) => setIsLoggedIn(!!session));
    isBiometricEnabled().then(enabled => { if (enabled) setIsLocked(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setIsLoggedIn(!!session));
    return () => subscription.unsubscribe();
  }, []);

  if (isLoggedIn === null) return <ThemeProvider><SplashScreen /></ThemeProvider>;
  if (isLocked) return (
    <ThemeProvider>
      <BiometricLockScreen onUnlock={() => setIsLocked(false)} />
    </ThemeProvider>
  );

  return (
    <ThemeProvider>
      <NavigationContainer>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          {!isLoggedIn ? (
            <Stack.Screen name="Register">
              {props => <RegisterScreen {...props} onLoginCallback={() => setIsLoggedIn(true)} />}
            </Stack.Screen>
          ) : (
            <>
              {/* Main tabs */}
              <Stack.Screen name="Main" component={MainTabs} />

              {/* Chat */}
              <Stack.Screen name="ChatRoom"      component={ChatRoomScreen} />
              <Stack.Screen name="NewMessage"    component={NewMessageScreen} />

              {/* Groups */}
              <Stack.Screen name="GroupChat"     component={GroupChatScreen} />
              <Stack.Screen name="GroupCall"     component={GroupCallScreen}  options={{ animation: 'slide_from_bottom' }} />

              {/* Calls */}
              <Stack.Screen name="ActiveCall"    component={ActiveCallScreen} options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="NewCall"       component={NewCallScreen} />

              {/* Contacts */}
              <Stack.Screen name="NewContact"    component={NewContactScreen} />
              <Stack.Screen name="ContactPicker" component={ContactPickerScreen} />
              <Stack.Screen name="Profile"       component={ProfileScreen} />

              {/* Discover & monetization */}
              <Stack.Screen name="OfferInbox"    component={OfferInboxScreen} />
              <Stack.Screen name="Trending"      component={TrendingScreen} />
              <Stack.Screen name="Premium"       component={({ navigation }) => {
                const { bg } = useTheme();
                return (
                  <View style={{ flex: 1, backgroundColor: bg }}>
                    <PremiumModal visible onClose={() => navigation.goBack()} onUpgraded={() => navigation.goBack()} />
                  </View>
                );
              }} options={{ animation: 'slide_from_bottom' }} />

              {/* Business */}
              <Stack.Screen name="Business"      component={BusinessScreen} />
              <Stack.Screen name="BusinessChat"  component={BusinessChatScreen} />

              {/* AI + Offline */}
              <Stack.Screen name="AIAssistant"   component={AIAssistantScreen} />
              <Stack.Screen name="Nearby"        component={NearbyScreen} />

              {/* Misc */}
              <Stack.Screen name="Channels"      component={ChannelsScreen} />
              <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  );
}
