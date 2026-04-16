// callQuality.js — STUN/TURN config + adaptive bitrate for rural areas
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'turn:openrelay.metered.ca:80',    username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',   username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:443',  username: 'openrelayproject', credential: 'openrelayproject' },
];

export const QUALITY_PROFILES = {
  HD:  { maxBitrate: 1500000, width: 1280, height: 720,  frameRate: 30 },
  SD:  { maxBitrate: 600000,  width: 640,  height: 480,  frameRate: 24 },
  Low: { maxBitrate: 250000,  width: 426,  height: 240,  frameRate: 15 },
  Min: { maxBitrate: 80000,   width: 176,  height: 144,  frameRate: 10 },
};

// Returns profile based on signal strength (0–4 bars)
export function profileForSignal(bars) {
  if (bars >= 3) return QUALITY_PROFILES.HD;
  if (bars === 2) return QUALITY_PROFILES.SD;
  if (bars === 1) return QUALITY_PROFILES.Low;
  return QUALITY_PROFILES.Min;
}

export function getRTCConfig() {
  return { iceServers: ICE_SERVERS, iceCandidatePoolSize: 10, bundlePolicy: 'max-bundle' };
}
