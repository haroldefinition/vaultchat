import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let RNCallKeep;
try { RNCallKeep = require('react-native-callkeep').default; } catch (e) { RNCallKeep = null; }

export function setupCallKit() {
  if (!RNCallKeep || Platform.OS !== 'ios') return;
  try {
    RNCallKeep.setup({
      ios: {
        appName: 'VaultChat',
        supportsVideo: true,
        maximumCallsPerCallGroup: 1,
        maximumCallGroups: 1,
      },
    });
    RNCallKeep.setAvailable(true);
  } catch (e) { console.log('CallKit setup error:', e); }
}

export function startCall(callId, handle, name) {
  if (!RNCallKeep || Platform.OS !== 'ios') {
    Alert.alert('📞 Call Started', `Calling ${name || handle}...`);
    return;
  }
  try {
    RNCallKeep.startCall(callId, handle, name || handle, 'number', true);
  } catch (e) { Alert.alert('📞 Call Started', `Calling ${name || handle}...`); }
}

export function endCall(callId) {
  if (!RNCallKeep || Platform.OS !== 'ios') return;
  try { RNCallKeep.endCall(callId); } catch (e) {}
}

export function holdCall(callId, onHold) {
  if (!RNCallKeep || Platform.OS !== 'ios') {
    Alert.alert(onHold ? '⏸ Call on Hold' : '▶ Call Resumed');
    return;
  }
  try { RNCallKeep.setOnHold(callId, onHold); } catch (e) {}
}

export function muteCall(callId, muted) {
  if (!RNCallKeep || Platform.OS !== 'ios') return;
  try { RNCallKeep.setMutedCall(callId, muted); } catch (e) {}
}

export function displayIncomingCall(callId, handle, name) {
  if (!RNCallKeep || Platform.OS !== 'ios') {
    Alert.alert('📞 Incoming Call', `${name || handle} is calling...`, [
      { text: 'Decline', style: 'destructive' },
      { text: 'Accept', style: 'default' },
    ]);
    return;
  }
  try { RNCallKeep.displayIncomingCall(callId, handle, name || handle, 'number', true); } catch (e) {}
}

export function onCallKeepEvents(handlers) {
  if (!RNCallKeep || Platform.OS !== 'ios') return () => {};
  const { onAnswer, onEnd, onHold } = handlers;
  if (onAnswer) RNCallKeep.addEventListener('answerCall', onAnswer);
  if (onEnd) RNCallKeep.addEventListener('endCall', onEnd);
  if (onHold) RNCallKeep.addEventListener('didToggleHoldCallAction', onHold);
  return () => {
    RNCallKeep.removeEventListener('answerCall');
    RNCallKeep.removeEventListener('endCall');
    RNCallKeep.removeEventListener('didToggleHoldCallAction');
  };
}
