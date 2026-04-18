import React, { useEffect, useRef } from 'react';
import { View, Image, Text, StyleSheet, Animated, Dimensions } from 'react-native';

const LOGO = require('../../assets/vaultchat-logo.png');
const SW   = Dimensions.get('window').width;

export default function SplashScreen() {
  const fade  = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={s.container}>
      <Animated.View style={{ opacity: fade, transform: [{ scale }], alignItems: 'center' }}>
        {/* Logo — the PNG includes the shield + "VaultChat" text */}
        <Image source={LOGO} style={s.logo} resizeMode="contain" />

        {/* Privacy badge — matches website footer tag */}
        <Text style={s.badge}>🔒  End-to-end encrypted · No ads · No metadata</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: SW,
    height: SW * 1.4,
    marginBottom: 32,
  },
  badge: {
    fontSize: 12,
    color: 'rgba(144, 213, 255, 0.55)',  // light blue tint matching accent
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
