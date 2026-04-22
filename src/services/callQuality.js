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
