// callQuality.js — STUN/TURN config + adaptive bitrate for rural/weak-signal areas
// Multiple TURN servers ensure calls route even on 1-bar or satellite connections

export const ICE_SERVERS = [
  // Google STUN — worldwide, fast
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // Twilio STUN — global edge network
  { urls: 'stun:global.stun.twilio.com:3478' },
  // OpenRelay TURN — UDP (fastest), TCP (firewall bypass), TLS (encrypted)
  { urls: 'turn:openrelay.metered.ca:80',    username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',   username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:443',  username: 'openrelayproject', credential: 'openrelayproject' },
  // Metered TURN — additional relay for rural/satellite areas
  { urls: 'turn:a.relay.metered.ca:80',      username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:a.relay.metered.ca:443',     username: 'openrelayproject', credential: 'openrelayproject' },
];

// Adaptive bitrate profiles — matched to real-world rural signal conditions
export const QUALITY_PROFILES = {
  HD:  { label: 'HD',  maxBitrate: 1200000, width: 1280, height: 720,  frameRate: 30, audioKbps: 128 },
  SD:  { label: 'SD',  maxBitrate: 500000,  width: 640,  height: 480,  frameRate: 24, audioKbps: 64  },
  Low: { label: 'Low', maxBitrate: 200000,  width: 426,  height: 240,  frameRate: 15, audioKbps: 32  },
  Min: { label: 'Min', maxBitrate: 60000,   width: 176,  height: 144,  frameRate: 8,  audioKbps: 16  },
};

// Map signal bars (0–4) to quality profile
// Even 0 bars (countryside edge) gets Min quality rather than dropping
export function profileForSignal(bars) {
  if (bars >= 4) return QUALITY_PROFILES.HD;
  if (bars === 3) return QUALITY_PROFILES.HD;
  if (bars === 2) return QUALITY_PROFILES.SD;
  if (bars === 1) return QUALITY_PROFILES.Low;
  return QUALITY_PROFILES.Min; // 0 bars — still tries via TURN relay
}

// RTCPeerConnection config — use all ICE servers for maximum connectivity
export function getRTCConfig() {
  return {
    iceServers:           ICE_SERVERS,
    iceCandidatePoolSize: 10,
    bundlePolicy:         'max-bundle',
    rtcpMuxPolicy:        'require',
    // Aggressive ICE for rural/NAT scenarios
    iceTransportPolicy:   'all', // try STUN first, fall back to TURN
  };
}

// Human-readable quality label for UI badge
export function qualityLabel(profile) {
  return profile?.label || 'HD';
}

// Simulate signal strength reading (replace with NetInfo in production)
export function getSimulatedSignal() {
  return Math.floor(Math.random() * 5); // 0–4 bars
}
