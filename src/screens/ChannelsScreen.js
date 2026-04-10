import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ChannelsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ChannelsScreen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
});
