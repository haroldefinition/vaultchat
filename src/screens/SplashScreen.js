import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../services/theme';

export default function SplashScreen() {
  const { bg, accent } = useTheme();
  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <Text style={[s.title, { color: accent }]}>VaultChat</Text>
      <Text style={s.sub}>End-to-end encrypted messaging</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 36, fontWeight: 'bold' },
  sub: { fontSize: 14, color: '#888', marginTop: 8 },
});
