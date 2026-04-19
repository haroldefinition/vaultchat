// VaultChat — App.js
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator }  from '@react-navigation/bottom-tabs';
import { StatusBar, Text, View, TouchableOpacity, StyleSheet, Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme } from './src/services/theme';
import { UnreadProvider, useUnread } from './src/services/unreadBadge';
import { setupPushNotifications, addNotificationResponseListener, clearBadge } from './src/services/pushNotifications';
import { flushQueue } from './src/services/messageQueue';
import { isBiometricEnabled } from './src/services/biometric';

// ── Core screens ──────────────────────────────────────────────
import SplashScreen        from './src/screens/SplashScreen';
import RegisterScreen      from './src/screens/RegisterScreen';
import BiometricLockScreen from './src/screens/BiometricLockScreen';
import ChatsScreen         from './src/screens/ChatsScreen';
import ChatRoomScreen      from './src/screens/ChatRoomScreen';
import CallScreen          from './src/screens/CallScreen';
import ActiveCallScreen    from './src/screens/ActiveCallScreen';
import GroupCallScreen     from './src/screens/GroupCallScreen';
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
import OfferInboxScreen    from './src/screens/OfferInboxScreen';
import BusinessScreen      from './src/screens/BusinessScreen';
import BusinessChatScreen  from './src/screens/BusinessChatScreen';
import TrendingScreen      from './src/screens/TrendingScreen';
import AIAssistantScreen   from './src/screens/AIAssistantScreen';
import NearbyScreen        from './src/screens/NearbyScreen';
import ContactViewScreen   from './src/screens/ContactViewScreen';
import ContactsScreen      from './src/screens/ContactsScreen';

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
    { icon:'📡', label:'Nearby',          screen:'Nearby',        desc:'Offline mesh messaging' },
    { icon:'🔒', label:'Privacy Policy',  screen:'PrivacyPolicy', desc:'How we protect you' },
    { icon:'📋', label:'Terms of Service',screen:'TermsOfService',desc:'Usage terms & conditions' },
    { icon:'⚙️', label:'Settings',        screen:'Settings',      desc:'Notifications, account' },
  ];
  return (
    <View style={[m.container,{backgroundColor:bg}]}>
      <View style={[m.header,{borderBottomColor:border,backgroundColor:bg}]}>
        <Text style={[m.title,{color:tx}]}>More</Text>
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
  header:   {paddingHorizontal:20,paddingTop:60,paddingBottom:14,borderBottomWidth:StyleSheet.hairlineWidth},
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
                <View style={{
                  position: 'absolute', top: -4, right: -8,
                  backgroundColor: '#ff3b30', borderRadius: 10,
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
      <Tab.Screen name="Calls"    component={CallScreen}    options={{ tabBarIcon:({focused})=><Text style={{fontSize:26,opacity:focused?1:0.85}}>📞</Text> }}/>
      <Tab.Screen name="Groups"   component={GroupScreen}   options={{ tabBarIcon:({focused})=><Text style={{fontSize:26,opacity:focused?1:0.85}}>👥</Text> }}/>
      <Tab.Screen name="Discover" component={DiscoverScreen}options={{ tabBarIcon:({focused})=><Text style={{fontSize:26,opacity:focused?1:0.85}}>🔍</Text> }}/>
      <Tab.Screen name="More"     component={MoreScreen}    options={{ tabBarIcon:({focused})=><Text style={{fontSize:26,opacity:focused?1:0.85}}>⋯</Text> }}/>
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

      // Flush queue + clear badge when app comes back to foreground
      const appStateSub = AppState.addEventListener('change', state => {
        if (state === 'active') { flushQueue(); clearBadge(); }
      });

      const cleanup = addNotificationResponseListener(() => {});

      // Check auth
      try {
        const { supabase } = require('./src/services/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        if (session) { setIsLoggedIn(true); }
        else {
          const stored = await AsyncStorage.getItem('vaultchat_user');
          setIsLoggedIn(!!stored);
        }
        supabase.auth.onAuthStateChange((_event, session) => {
          setIsLoggedIn(!!session);
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

  if (!ready) return <UnreadProvider><ThemeProvider><SplashScreen /></ThemeProvider></UnreadProvider>;

  if (isLocked) return (
    <UnreadProvider>
    <ThemeProvider>
      <BiometricLockScreen onUnlock={() => setIsLocked(false)} />
    </ThemeProvider>
    </UnreadProvider>
  );

  return (
    <UnreadProvider>
    <ThemeProvider>
      <NavigationContainer>
        <StatusBar barStyle="light-content" backgroundColor="#080b12" />
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
              <Stack.Screen name="GroupCall"     component={GroupCallScreen}    options={{ animation:'slide_from_bottom' }} />
              <Stack.Screen name="NewCall"       component={NewCallScreen} />
              <Stack.Screen name="NewMessage"    component={NewMessageScreen} />
              <Stack.Screen name="NewContact"    component={NewContactScreen} />
              <Stack.Screen name="ContactPicker" component={ContactPickerScreen} />
              <Stack.Screen name="Profile"       component={ProfileScreen} />
              <Stack.Screen name="Channels"      component={ChannelsScreen} />
              <Stack.Screen name="PrivacyPolicy"  component={PrivacyPolicyScreen} />
              <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
              <Stack.Screen name="Settings"      component={SettingsScreen} />
              <Stack.Screen name="OfferInbox"    component={OfferInboxScreen} />
              <Stack.Screen name="Business"      component={BusinessScreen} />
              <Stack.Screen name="BusinessChat"  component={BusinessChatScreen} />
              <Stack.Screen name="Trending"      component={TrendingScreen} />
              <Stack.Screen name="AIAssistant"   component={AIAssistantScreen} />
              <Stack.Screen name="Nearby"        component={NearbyScreen} />
              <Stack.Screen name="ContactView"   component={ContactViewScreen} />
              <Stack.Screen name="Contacts"      component={ContactsScreen} />
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
  );
}
