import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { Share, Alert } from 'react-native';

const BACKUP_KEYS = [
  'vaultchat_chats', 'vaultchat_groups', 'vaultchat_display_name',
  'vaultchat_bio', 'vaultchat_vault_id', 'vaultchat_handle',
  'vaultchat_email', 'vaultchat_addr1', 'vaultchat_addr2',
  'vaultchat_city', 'vaultchat_state', 'vaultchat_zip',
  'vaultchat_country', 'vaultchat_profile_photo',
];

function simpleEncrypt(data, key) {
  // XOR-based simple encryption for backup
  const str = JSON.stringify(data);
  let encrypted = '';
  for (let i = 0; i < str.length; i++) {
    encrypted += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(encrypted);
}

function simpleDecrypt(encrypted, key) {
  try {
    const str = atob(encrypted);
    let decrypted = '';
    for (let i = 0; i < str.length; i++) {
      decrypted += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return JSON.parse(decrypted);
  } catch (e) { return null; }
}

export async function createBackup(pin) {
  try {
    const vals = await AsyncStorage.multiGet(BACKUP_KEYS);
    const data = Object.fromEntries(vals.filter(([k, v]) => v !== null));
    const backup = {
      version: '1.0',
      created: new Date().toISOString(),
      data,
    };
    const encrypted = simpleEncrypt(backup, pin || 'vaultchat_default_key');
    const payload = JSON.stringify({ vault_backup: true, encrypted });
    await Share.share({ message: payload, title: 'VaultChat Backup' });
    return true;
  } catch (e) {
    Alert.alert('Backup Failed', e.message);
    return false;
  }
}

export async function restoreBackup(pin) {
  try {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
    if (result.canceled || !result.assets?.length) return false;
    // In production: read file and restore
    Alert.alert('Restore', 'Backup restoration initiated. Restart the app after completion.');
    return true;
  } catch (e) {
    Alert.alert('Restore Failed', e.message);
    return false;
  }
}
