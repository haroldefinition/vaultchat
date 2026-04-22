// networkQuality.js — Live call-path quality classifier.
//
// Drives adaptive bitrate / FEC by sampling WebRTC's own RTCPeerConnection.getStats()
// every 2 seconds and categorizing the call path as 'good' | 'poor' | 'critical'.
//
// No netinfo dep — we measure the *actual* media path (RTT, jitter, loss) instead of
// guessing from wifi-vs-cellular. Works identically on home WiFi, LTE, 3G, or satellite.
//
// Thresholds tuned for Opus VoIP at 6 kbps + FEC:
//   good:      RTT < 150 ms,  loss < 2%,  jitter < 30 ms
//   poor:      RTT 150–400 ms, loss 2–8%,  jitter 30–60 ms  (→ enable FEC, hint jitter buffer)
//   critical:  RTT > 400 ms,  loss > 8%,  jitter > 60 ms   (→ drop to min bitrate, force FEC)
//
// Usage:
//   import netQ from './networkQuality';
//   netQ.start(peerConnection);
//   const unsub = netQ.subscribe(({ quality, stats }) => { ... });
//   netQ.stop();

const SAMPLE_INTERVAL_MS = 2000;

// Thresholds — measured values crossing these push us to the next tier.
const THRESHOLDS = {
  rttMs:   { good: 150,  poor: 400  }, // ms
  lossPct: { good: 2,    poor: 8    }, // percent packets lost
  jitterMs:{ good: 30,   poor: 60   }, // ms
};

function classify({ rttMs, lossPct, jitterMs }) {
  // Any one axis can downgrade quality — weakest link wins.
  const axes = [];
  if (rttMs    != null) axes.push(rttMs    > THRESHOLDS.rttMs.poor    ? 'critical' : rttMs    > THRESHOLDS.rttMs.good    ? 'poor' : 'good');
  if (lossPct  != null) axes.push(lossPct  > THRESHOLDS.lossPct.poor  ? 'critical' : lossPct  > THRESHOLDS.lossPct.good  ? 'poor' : 'good');
  if (jitterMs != null) axes.push(jitterMs > THRESHOLDS.jitterMs.poor ? 'critical' : jitterMs > THRESHOLDS.jitterMs.good ? 'poor' : 'good');

  if (!axes.length) return 'good'; // no data yet — assume good
  if (axes.includes('critical')) return 'critical';
  if (axes.includes('poor'))     return 'poor';
  return 'good';
}

// Parse WebRTC getStats() report → flat { rttMs, lossPct, jitterMs, outBitrateKbps }
function parseStats(report, prev) {
  let rttMs = null;
  let jitterMs = null;
  let packetsReceived = 0;
  let packetsLost = 0;
  let bytesSent = 0;
  let timestamp = null;

  report.forEach(stat => {
    if (stat.type === 'candidate-pair' && (stat.state === 'succeeded' || stat.nominated)) {
      if (typeof stat.currentRoundTripTime === 'number') {
        rttMs = Math.max(rttMs ?? 0, stat.currentRoundTripTime * 1000);
      }
    }
    if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
      if (typeof stat.jitter === 'number') jitterMs = Math.max(jitterMs ?? 0, stat.jitter * 1000);
      if (typeof stat.packetsReceived === 'number') packetsReceived += stat.packetsReceived;
      if (typeof stat.packetsLost     === 'number') packetsLost     += stat.packetsLost;
    }
    if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
      if (typeof stat.bytesSent === 'number') bytesSent += stat.bytesSent;
      if (typeof stat.timestamp === 'number') timestamp = stat.timestamp;
    }
  });

  // Packet loss percentage (cumulative — fine for coarse classification).
  const totalPackets = packetsReceived + packetsLost;
  const lossPct = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : null;

  // Outbound bitrate (kbps) — derived from delta vs previous sample.
  let outBitrateKbps = null;
  if (prev && prev.bytesSent != null && prev.timestamp != null && timestamp && timestamp > prev.timestamp) {
    const deltaBytes = bytesSent - prev.bytesSent;
    const deltaSec   = (timestamp - prev.timestamp) / 1000;
    if (deltaSec > 0 && deltaBytes >= 0) outBitrateKbps = (deltaBytes * 8) / 1000 / deltaSec;
  }

  return { rttMs, lossPct, jitterMs, outBitrateKbps, bytesSent, timestamp };
}

class NetworkQuality {
  constructor() {
    this._pc = null;
    this._timer = null;
    this._listeners = new Set();
    this._lastRaw = null;
    this._lastQuality = 'good';
    this._lastStats = { rttMs: null, lossPct: null, jitterMs: null, outBitrateKbps: null };
  }

  start(peerConnection) {
    this.stop();
    if (!peerConnection) return;
    this._pc = peerConnection;
    this._lastRaw = null;
    this._timer = setInterval(() => this._sample(), SAMPLE_INTERVAL_MS);
    // Take an immediate first sample so subscribers aren't blind for 2s.
    this._sample();
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._pc = null;
    this._lastRaw = null;
  }

  subscribe(cb) {
    this._listeners.add(cb);
    // Emit last known state immediately so UI doesn't have to wait for next sample.
    try { cb({ quality: this._lastQuality, stats: this._lastStats }); } catch {}
    return () => this._listeners.delete(cb);
  }

  getQuality() { return this._lastQuality; }
  getStats()   { return this._lastStats; }

  async _sample() {
    if (!this._pc) return;
    try {
      const report = await this._pc.getStats();
      const parsed = parseStats(report, this._lastRaw);
      this._lastRaw = { bytesSent: parsed.bytesSent, timestamp: parsed.timestamp };
      const quality = classify(parsed);
      this._lastStats = {
        rttMs:          parsed.rttMs,
        lossPct:        parsed.lossPct,
        jitterMs:       parsed.jitterMs,
        outBitrateKbps: parsed.outBitrateKbps,
      };
      this._lastQuality = quality;
      for (const cb of this._listeners) {
        try { cb({ quality, stats: this._lastStats }); } catch {}
      }
    } catch (e) {
      if (__DEV__) console.warn('networkQuality sample error:', e?.message || e);
    }
  }
}

// Single shared instance — there's only ever one active call at a time.
const netQ = new NetworkQuality();
export default netQ;
