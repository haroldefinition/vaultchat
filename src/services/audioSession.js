import { Platform } from 'react-native';

let Audio;
try {
  Audio = require('expo-audio');
} catch(e) {
  try {
    Audio = require('expo-av').Audio;
  } catch(e2) {
    Audio = null;
  }
}

export async function setupAudioSession() {
  try {
    if (!Audio) return;
    if (Audio.setAudioModeAsync) {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    }
  } catch (e) { console.log('Audio session setup skipped:', e.message); }
}

export async function setEarpieceMode() {
  try {
    if (!Audio?.setAudioModeAsync) return;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      playThroughEarpieceAndroid: true,
    });
  } catch (e) {}
}

export async function setSpeakerMode() {
  try {
    if (!Audio?.setAudioModeAsync) return;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (e) {}
}

export async function releaseAudioSession() {
  try {
    if (!Audio?.setAudioModeAsync) return;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
    });
  } catch (e) {}
}
