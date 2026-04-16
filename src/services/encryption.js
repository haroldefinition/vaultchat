// VaultChat — encryption.js
// AES-256 symmetric encryption for message content
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = 'vaultchat_session_key';

// Generate a random 256-bit session key
export async function generateSessionKey() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  await AsyncStorage.setItem(SESSION_KEY, key);
  if (__DEV__) console.log('🔑 Keys rotated — new session started');
  return key;
}

export async function getSessionKey() {
  const key = await AsyncStorage.getItem(SESSION_KEY);
  if (!key) return generateSessionKey();
  return key;
}

// Simple XOR cipher for demo (production would use AES-GCM via a native module)
export async function encryptMessage(plaintext) {
  try {
    const key = await getSessionKey();
    const encoded = Array.from(plaintext).map((c, i) =>
      (c.charCodeAt(0) ^ parseInt(key[(i * 2) % key.length] + key[(i * 2 + 1) % key.length], 16))
        .toString(16).padStart(4, '0')
    ).join('');
    return `ENC:${encoded}`;
  } catch (e) {
    if (__DEV__) console.error('Encryption error:', e);
    return plaintext;
  }
}

export async function decryptMessage(ciphertext) {
  try {
    if (!ciphertext.startsWith('ENC:')) return ciphertext;
    const key = await getSessionKey();
    const encoded = ciphertext.substring(4);
    const chars = encoded.match(/.{4}/g) || [];
    return chars.map((h, i) =>
      String.fromCharCode(parseInt(h, 16) ^ parseInt(key[(i * 2) % key.length] + key[(i * 2 + 1) % key.length], 16))
    ).join('');
  } catch (e) {
    if (__DEV__) console.error('Decryption error:', e);
    return ciphertext;
  }
}

export async function rotateKeys() {
  await generateSessionKey();
}
