// offlineQueue.js — offline message queue + nearby detection
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'vaultchat_offline_queue';

export async function isOnline() {
  try {
    const r = await fetch('https://www.google.com', { method: 'HEAD' });
    return r.ok;
  } catch { return false; }
}

export async function queueMessage(msg) {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const q   = raw ? JSON.parse(raw) : [];
  q.push({ ...msg, queued_at: new Date().toISOString() });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export async function getQueue() {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function getQueueCount() {
  const q = await getQueue();
  return q.length;
}

export async function markDelivered(id) {
  const q = await getQueue();
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q.filter(m => m.id !== id)));
}

export function scanNearbyDevices() {
  // Simulated nearby device scan — replace with BLE in production
  return [
    { id: 'nearby_1', name: 'VaultUser_A3F2', signal: -62, online: false },
    { id: 'nearby_2', name: 'VaultUser_9B1C', signal: -78, online: false },
  ];
}
