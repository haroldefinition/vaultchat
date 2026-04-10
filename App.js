// ============================================================
//  VaultChat Mobile App — App.js
//  Main entry point — handles navigation between all screens
// ============================================================

import React, { useEffect, useState } from 'react';
import { NavigationContainer }         from '@react-navigation/native';
import { createNativeStackNavigator }  from '@react-navigation/native-stack';
import { createBottomTabNavigator }    from '@react-navigation/bottom-tabs';
import AsyncStorage                    from '@react-native-async-storage/async-storage';
import { StatusBar, Text }             from 'react-native';
import { ThemeProvider } from './src/services/theme';
import { setupPushNotifications, addNotificationResponseListener } from './src/services/pushNotifications';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import BiometricLockScreen from './src/screens/BiometricLockScreen';
import { isBiometricEnabled } from './src/services/biometric';

// ── Screens ──────────────────────────────────────────────────
import SplashScreen     from './src/screens/SplashScreen';
import RegisterScreen   from './src/screens/RegisterScreen';
import ChatsScreen      from './src/screens/ChatsScreen';
import ChatRoomScreen   from './src/screens/ChatRoomScreen';
import CallScreen       from './src/screens/CallScreen';
import GroupScreen      from './src/screens/GroupScreen';
import ChannelsScreen   from './src/screens/ChannelsScreen';
import SettingsScreen   from './src/screens/SettingsScreen';
import ProfileScreen    from './src/screens/ProfileScreen';
import NewContactScreen from './src/screens/NewContactScreen';
import ActiveCallScreen from './src/screens/ActiveCallScreen';

// ── Theme colors (matches our prototype) ─────────────────────
export const COLORS = {
  bg:      '#080b12',
  surface: '#0e1220',
  s2:      '#141828',
  s3:      '#1c2236',
  accent:  '#00ffa3',
  blue:    '#00b8ff',
  warn:    '#ff6b6b',
  gold:    '#ffd700',
  text:    '#dde3f5',
  dim:     '#6b7394',
  border:  '#2a3050',
};

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// ── Bottom tab navigator (main app after login) ───────────────
function MainTabs() {
  const { useTheme } = require('./src/services/theme');
  const { lightMode, accent, card, border } = useTheme();
  const tabBg = lightMode ? '#ffffff' : '#0e1220';
  const tabBorder = lightMode ? '#d0e8ff' : '#141828';
  const activeColor = '#0057a8';
  const inactiveColor = lightMode ? '#4a90d9' : '#888888';
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: tabBg,
          borderTopColor: tabBorder,
          borderTopWidth: 1,
          height: 88,
          paddingBottom: 14,
          paddingTop: 10,
        },
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '700', marginTop: 4 },
        tabBarIconStyle: { marginBottom: 0 },
      }}
    >
      <Tab.Screen name="Chats"    component={ChatsScreen}    options={{ tabBarIcon: () => <Text style={{ fontSize: 28 }}>💬</Text>, tabBarLabel: 'Chats'    }} />
      <Tab.Screen name="Calls"    component={CallScreen}     options={{ tabBarIcon: () => <Text style={{ fontSize: 28 }}>📞</Text>, tabBarLabel: 'Calls'    }} />
      <Tab.Screen name="Groups"   component={GroupScreen}    options={{ tabBarIcon: () => <Text style={{ fontSize: 28 }}>👥</Text>, tabBarLabel: 'Groups'   }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: () => <Text style={{ fontSize: 28 }}>⚙️</Text>, tabBarLabel: 'Settings' }} />
    </Tab.Navigator>
  );
}

// ── Root app ─────────────────────────────────────────────────
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(null);
  useEffect(() => {
    setupPushNotifications();
    const cleanup = addNotificationResponseListener(response => {
      console.log('Notification tapped:', response);
    });
    return cleanup;
  }, []);
  const [isLocked, setIsLocked] = useState(false);
  const [decoyMode, setDecoyMode] = useState(false);

  useEffect(() => {
    // Check Supabase session
    const { supabase } = require('./src/services/supabase');
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
    isBiometricEnabled().then(enabled => { if (enabled) setIsLocked(true); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isLoggedIn === null) return <ThemeProvider><SplashScreen /></ThemeProvider>;
  if (isLocked) return <ThemeProvider><BiometricLockScreen onUnlock={(mode) => { setIsLocked(false); setDecoyMode(mode === 'decoy'); }} /></ThemeProvider>;

  return (
    <ThemeProvider>
      <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {!isLoggedIn ? (
          <Stack.Screen name="Register" component={RegisterScreen}
            initialParams={{ onLogin: () => setIsLoggedIn(true) }} />
        ) : (
          <>
            <Stack.Screen name="Main"     component={MainTabs}    />
            <Stack.Screen name="ChatRoom" component={ChatRoomScreen} />
            <Stack.Screen name="Channels" component={ChannelsScreen} />
            <Stack.Screen name="Profile"  component={ProfileScreen}  />
            <Stack.Screen name="NewContact" component={NewContactScreen} />
            <Stack.Screen name="ActiveCall" component={ActiveCallScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
            <Stack.Screen name="Call"     component={CallScreen} options={{ animation: 'slide_from_bottom' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
      </ThemeProvider>
  );
}
