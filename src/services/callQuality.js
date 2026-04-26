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

// Adaptive bitrate profiles — matched to real-world signal conditions.
// FHD (1080p @ 5 Mbps) is the new ceiling for 5G / strong-Wi-Fi calls
// (task #120 — "crystal clear" video). Lower tiers stay where they were
// so weak / rural signals still degrade gracefully via the same map.
export const QUALITY_PROFILES = {
  FHD: { label: 'HD+', maxBitrate: 5000000, width: 1920, height: 1080, frameRate: 30, audioKbps: 128 },
  HD:  { label: 'HD',  maxBitrate: 2500000, width: 1280, height: 720,  frameRate: 30, audioKbps: 128 },
  SD:  { label: 'SD',  maxBitrate: 800000,  width: 640,  height: 480,  frameRate: 24, audioKbps: 64  },
  Low: { label: 'Low', maxBitrate: 250000,  width: 426,  height: 240,  frameRate: 15, audioKbps: 32  },
  Min: { label: 'Min', maxBitrate: 60000,   width: 176,  height: 144,  frameRate: 8,  audioKbps: 16  },
};

// Map signal bars (0–4) to quality profile.
// 4 bars on Wi-Fi / 5G earns the new FHD tier; 3 bars stays HD so we don't
// promise 1080p on a connection that can't sustain it (would just thrash).
export function profileForSignal(bars) {
  if (bars >= 4) return QUALITY_PROFILES.FHD;
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

// ───────────────────────────────────────────────────────────────────────────
// Adaptive Opus bitrate + FEC (Harold's "VaultChat Blueprint")
// ───────────────────────────────────────────────────────────────────────────
//
// Baseline: Opus at 6 kbps with inband FEC on — prioritized per blueprint.
// On good networks we let bitrate float UP for crisper voice; on poor/critical
// we pin to the floor. This is fully automatic — no user toggle.

// Per-tier Opus target bitrate in bits-per-second (consumed by networkQuality.js output).
export const OPUS_BITRATE = {
  good:     24000, // 24 kbps — crisp voice on home WiFi / LTE
  poor:      8000, // 8 kbps  — minor degradation, still fully intelligible
  critical:  6000, // 6 kbps  — baseline floor (blueprint)
};

/**
 * Rewrite an SDP to force Opus inband FEC + DTX + max average bitrate.
 * Call this on BOTH local offer/answer SDPs before setLocalDescription.
 *   let offer = await pc.createOffer();
 *   offer.sdp = enableOpusFec(offer.sdp);
 *   await pc.setLocalDescription(offer);
 */
export function enableOpusFec(sdp) {
  if (!sdp || typeof sdp !== 'string') return sdp;
  const lines = sdp.split(/\r?\n/);
  // Find Opus payload type (48000 Hz stereo or mono)
  let opusPt = null;
  for (const line of lines) {
    const m = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (m) { opusPt = m[1]; break; }
  }
  if (!opusPt) return sdp;

  const fecParams = 'useinbandfec=1;usedtx=1;maxaveragebitrate=24000;stereo=0;cbr=0';
  const fmtpIdx = lines.findIndex(l => l.startsWith(`a=fmtp:${opusPt}`));
  if (fmtpIdx >= 0) {
    // Append our params, skipping any already present.
    const existing = lines[fmtpIdx];
    const additions = fecParams
      .split(';')
      .filter(p => !existing.includes(p.split('=')[0] + '='));
    if (additions.length) lines[fmtpIdx] = `${existing};${additions.join(';')}`;
  } else {
    const rtpmapIdx = lines.findIndex(l => l.startsWith(`a=rtpmap:${opusPt} `));
    if (rtpmapIdx >= 0) lines.splice(rtpmapIdx + 1, 0, `a=fmtp:${opusPt} ${fecParams}`);
  }
  return lines.join('\r\n');
}

/**
 * Apply baseline Opus encoder params on call start — must be called AFTER the
 * PC is connected and the audio sender exists.
 */
export async function applyOpusBaseline(pc) {
  if (!pc || typeof pc.getSenders !== 'function') return;
  const senders = pc.getSenders();
  for (const sender of senders) {
    if (!sender?.track || sender.track.kind !== 'audio') continue;
    try {
      const params = sender.getParameters() || {};
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate  = OPUS_BITRATE.good;
      params.encodings[0].priority    = 'high';
      params.encodings[0].networkPriority = 'high';
      await sender.setParameters(params);
    } catch (e) {
      if (__DEV__) console.warn('applyOpusBaseline error:', e?.message || e);
    }
  }
}

/**
 * Live adapt bitrate based on quality tier from networkQuality.js.
 * Safe to call every 2s — exits early if bitrate hasn't changed.
 */
export async function applyAdaptation(pc, quality) {
  if (!pc || typeof pc.getSenders !== 'function') return;
  const target = OPUS_BITRATE[quality] ?? OPUS_BITRATE.good;
  const senders = pc.getSenders();
  for (const sender of senders) {
    if (!sender?.track || sender.track.kind !== 'audio') continue;
    try {
      const params = sender.getParameters() || {};
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      if (params.encodings[0].maxBitrate === target) continue; // no-op
      params.encodings[0].maxBitrate = target;
      await sender.setParameters(params);
    } catch (e) {
      if (__DEV__) console.warn('applyAdaptation error:', e?.message || e);
    }
  }
}

/**
 * Convenience: wire networkQuality.js → live adaptation. Returns an unsubscribe fn.
 *   import netQ from './networkQuality';
 *   const stop = autoAdapt(pc, netQ);
 *   // ...on hangup: stop();
 */
export function autoAdapt(pc, netQ) {
  if (!pc || !netQ) return () => {};
  return netQ.subscribe(({ quality }) => { applyAdaptation(pc, quality); });
}

// ───────────────────────────────────────────────────────────────────────────
// Video sender baseline (task #120)
// ───────────────────────────────────────────────────────────────────────────
//
// Apply once after the PC is connected and the video sender exists. Sets a
// generous 5 Mbps cap so 1080p has room to breathe on Wi-Fi / 5G, and pins
// `degradationPreference` to 'maintain-resolution' so when bandwidth dips
// the encoder drops framerate (30 → 20fps) instead of dropping resolution
// (1080p → 480p). Most users prefer "sharp but slightly choppy" over
// "smooth but pixelated" on a video call. The networkQuality auto-adapt
// path can still LOWER the bitrate at runtime — this function only sets
// the ceiling.
export const VIDEO_MAX_BITRATE = 5_000_000; // 5 Mbps — caps 1080p ceiling
export const VIDEO_MIN_BITRATE = 300_000;   // floor below which we'd rather drop
export const VIDEO_MAX_FRAMERATE = 30;

export async function applyVideoBaseline(pc) {
  if (!pc || typeof pc.getSenders !== 'function') return;
  const senders = pc.getSenders();
  for (const sender of senders) {
    if (!sender?.track || sender.track.kind !== 'video') continue;
    try {
      const params = sender.getParameters() || {};
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate    = VIDEO_MAX_BITRATE;
      params.encodings[0].minBitrate    = VIDEO_MIN_BITRATE;
      params.encodings[0].maxFramerate  = VIDEO_MAX_FRAMERATE;
      params.encodings[0].priority         = 'high';
      params.encodings[0].networkPriority  = 'high';
      // 'maintain-resolution' = sacrifice fps before dropping resolution.
      // The other options ('balanced', 'maintain-framerate') would drop
      // pixels first, which is the opposite of what we want here.
      params.degradationPreference = 'maintain-resolution';
      await sender.setParameters(params);
    } catch (e) {
      if (__DEV__) console.warn('applyVideoBaseline error:', e?.message || e);
    }
  }
}
