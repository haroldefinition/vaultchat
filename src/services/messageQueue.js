// messageQueue.js — Retry queue for messages that failed to send
// Messages that fail Supabase insert are queued locally and retried
// automatically when connectivity returns.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const QUEUE_KEY = 'vaultchat_send_queue';

/** Add a failed message to the retry queue */
export async function enqueue(msg) {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const q   = raw ? JSON.parse(raw) : [];
    // Avoid duplicates
    if (!q.find(m => m.tempId === msg.tempId)) {
      q.push({ ...msg, queuedAt: Date.now(), retries: 0 });
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    }
  } catch {}
}

/** Attempt to flush the queue — call on app foreground or connectivity restore */
export async function flushQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return;
    const q = JSON.parse(raw);
    if (!q.length) return;

    const failed = [];
    for (const msg of q) {
      try {
        const { error } = await supabase
          .from(msg.table || 'messages')
          .insert(msg.payload);
        if (error) {
          // Keep in queue, bump retry count
          if (msg.retries < 10) failed.push({ ...msg, retries: msg.retries + 1 });
          // After 10 retries (~10 minutes), drop it
        }
        // else: sent successfully — don't add to failed
      } catch {
        if (msg.retries < 10) failed.push({ ...msg, retries: msg.retries + 1 });
      }
    }
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failed));
    return q.length - failed.length; // how many were sent
  } catch { return 0; }
}

/** How many messages are waiting to send */
export async function queueLength() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw).length : 0;
  } catch { return 0; }
}

/** Clear the queue (e.g. on logout) */
export async function clearQueue() {
  await AsyncStorage.removeItem(QUEUE_KEY).catch(() => {});
}
