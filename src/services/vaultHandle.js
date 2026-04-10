import AsyncStorage from '@react-native-async-storage/async-storage';

export async function generateHandle(name) {
  const base = name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : 'user';
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `@${base}${suffix}`;
}

export async function getMyHandle() {
  return await AsyncStorage.getItem('vaultchat_handle');
}

export async function saveHandle(handle) {
  await AsyncStorage.setItem('vaultchat_handle', handle);
}

export async function findByHandle(handle) {
  // In production this would query Supabase
  return null;
}
