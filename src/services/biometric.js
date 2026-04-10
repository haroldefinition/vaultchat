import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function isBiometricEnabled() {
  const val = await AsyncStorage.getItem('vaultchat_biometric');
  return val === 'true';
}

export async function checkBiometricSupport() {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return compatible && enrolled;
}

export async function authenticateWithBiometric() {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock VaultChat',
      fallbackLabel: 'Use PIN',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch (e) {
    return false;
  }
}
