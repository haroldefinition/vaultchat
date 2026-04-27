// ============================================================
//  ratchetService.js — Phase YY
//
//  Glue layer between the bare Double Ratchet primitives in
//  src/crypto/doubleRatchet.js and the rest of the app:
//
//    * Publishes THIS device's signed pre-key bundle to the
//      ratchet_pre_keys Supabase table on app boot.
//    * Decides per-conversation whether the ratchet path is
//      eligible (canUseRatchet) — both peers must be on a
//      single device with a published bundle, otherwise the
//      caller falls back to the multi-device (MD2) envelope.
//    * Wraps encryptForRatchet / decryptForRatchet so the
//      caller never has to think about X3DH bootstrap, state
//      persistence, or wire-format peeking.
//
//  Why single-device-only?
//    The Double Ratchet is a 1:1 protocol. Extending it across
//    multiple devices per side requires either Sesame-style
//    pairwise sessions or a per-device fan-out. Both are
//    follow-up work; v1 picks the safe subset (most users have
//    one phone) and falls through to MD2 for everyone else.
//
//  State storage:
//    Per-conversation ratchet state lives in expo-secure-store
//    keyed by `<peerUserId>:<peerDeviceId>` so adding a new
//    peer device later spawns a fresh session instead of
//    polluting the old one.
// ============================================================

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import * as SecureStore from 'expo-secure-store';
import { ensureIdentityKeys, loadIdentityKeys } from '../crypto/encryption';
import { getDeviceId } from './deviceIdentity';
import {
  initSenderState,
  initReceiverState,
  ratchetEncrypt,
  ratchetDecrypt,
  loadRatchetState,
  saveRatchetState,
  isRatchetEnvelope,
  peekRatchetEph,
} from '../crypto/doubleRatchet';

let supabase = null;
try { supabase = require('./supabase').supabase; } catch {}

const SPK_STORE_KEY = 'ratchet_signed_pre_key_v1';
const STORE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED };
const BUNDLE_CACHE_TTL_MS  = 5 * 60 * 1000;
const ELIGIBLE_CACHE_TTL_MS = 5 * 60 * 1000;

// userId|deviceId -> { bundle, ts }
const _bundleCache = new Map();
// userId -> { eligible, peerDeviceId, ts }
const _eligibleCache = new Map();

function _bkey(userId, deviceId) { return `${userId}|${deviceId}`; }
function _stateKey(peerUserId, peerDeviceId) { return `${peerUserId}:${peerDeviceId}`; }

// ── Local signed-pre-key (per-device, persisted) ─────────────
// Generated once on first publish and reused forever in v1. A
// future rotation flow can wipe SPK_STORE_KEY + republish.

async function _ensureSignedPreKey() {
  try {
    const existing = await SecureStore.getItemAsync(SPK_STORE_KEY, STORE_OPTIONS);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (parsed?.pub && parsed?.priv) return parsed;
    }
  } catch {}
  // Generate fresh.
  const kp = nacl.box.keyPair();
  const pair = {
    pub:  naclUtil.encodeBase64(kp.publicKey),
    priv: naclUtil.encodeBase64(kp.secretKey),
  };
  try {
    await SecureStore.setItemAsync(SPK_STORE_KEY, JSON.stringify(pair), STORE_OPTIONS);
  } catch {}
  return pair;
}

// ── Publish my bundle ────────────────────────────────────────

/**
 * Upsert (user_id, device_id, identity_pub, signed_pre_pub) into
 * ratchet_pre_keys. Idempotent — safe to call on every cold launch.
 *
 * Returns { ok, deviceId } on success, null on failure (caller
 * doesn't block on this — encryption falls back to MD2).
 */
export async function publishMyRatchetPreKey(myUserId /*, myPhone */) {
  if (!myUserId || !supabase) return null;
  try {
    const me       = await ensureIdentityKeys();
    const spk      = await _ensureSignedPreKey();
    const deviceId = await getDeviceId();

    const { error } = await supabase
      .from('ratchet_pre_keys')
      .upsert(
        {
          user_id:        myUserId,
          device_id:      deviceId,
          identity_pub:   me.publicKey,
          signed_pre_pub: spk.pub,
          updated_at:     new Date().toISOString(),
        },
        { onConflict: 'user_id,device_id' },
      );
    if (error) {
      if (__DEV__) console.warn('publishMyRatchetPreKey upsert:', error.message);
      return null;
    }
    // Bust any stale eligibility entry for me (cross-device flips
    // are rare but cheap to invalidate).
    _eligibleCache.delete(myUserId);
    return { ok: true, deviceId };
  } catch (e) {
    if (__DEV__) console.warn('publishMyRatchetPreKey error:', e?.message);
    return null;
  }
}

// ── Fetch a peer's bundle ────────────────────────────────────

/**
 * Returns { device_id, identity_pub, signed_pre_pub } or null.
 * Cached for 5 min per (user_id, device_id) pair.
 */
export async function getPeerRatchetBundle(peerUserId, peerDeviceId) {
  if (!peerUserId || !peerDeviceId || !supabase) return null;
  const k = _bkey(peerUserId, peerDeviceId);
  const hit = _bundleCache.get(k);
  if (hit && Date.now() - hit.ts < BUNDLE_CACHE_TTL_MS) return hit.bundle;
  try {
    const { data, error } = await supabase
      .from('ratchet_pre_keys')
      .select('device_id, identity_pub, signed_pre_pub')
      .eq('user_id', peerUserId)
      .eq('device_id', peerDeviceId)
      .maybeSingle();
    if (error || !data) {
      _bundleCache.set(k, { bundle: null, ts: Date.now() });
      return null;
    }
    _bundleCache.set(k, { bundle: data, ts: Date.now() });
    return data;
  } catch (e) {
    if (__DEV__) console.warn('getPeerRatchetBundle error:', e?.message);
    return null;
  }
}

/** Force-evict cached bundle (after a "no bundle" send error etc.). */
export function invalidateRatchetBundle(peerUserId, peerDeviceId) {
  if (peerUserId && peerDeviceId) _bundleCache.delete(_bkey(peerUserId, peerDeviceId));
}

// ── Eligibility check ────────────────────────────────────────

/**
 * The ratchet path is eligible only when:
 *   1. I have exactly one device (my deviceId is the only row).
 *   2. Peer has exactly one device with a published ratchet bundle.
 *
 * Returns { ok: bool, peerDeviceId, reason }. The caller uses
 * peerDeviceId for state-key + bundle lookup downstream.
 *
 * Cached for 5 min per peerUserId so the hot send path doesn't
 * make two extra round-trips per message.
 */
export async function canUseRatchet(myUserId, peerUserId) {
  if (!supabase || !myUserId || !peerUserId) return { ok: false, reason: 'no-supabase' };
  const cached = _eligibleCache.get(peerUserId);
  if (cached && Date.now() - cached.ts < ELIGIBLE_CACHE_TTL_MS) {
    return { ok: cached.eligible, peerDeviceId: cached.peerDeviceId, reason: cached.reason };
  }
  try {
    const myDeviceId = await getDeviceId();

    // Both queries in parallel.
    const [myBundleQ, peerBundleQ, myDevicesQ, peerDevicesQ] = await Promise.all([
      supabase.from('ratchet_pre_keys').select('device_id').eq('user_id', myUserId),
      supabase.from('ratchet_pre_keys').select('device_id, identity_pub, signed_pre_pub').eq('user_id', peerUserId),
      supabase.from('user_device_keys').select('device_id').eq('user_id', myUserId),
      supabase.from('user_device_keys').select('device_id').eq('user_id', peerUserId),
    ]);

    const myBundles    = myBundleQ.data    || [];
    const peerBundles  = peerBundleQ.data  || [];
    const myDevices    = myDevicesQ.data   || [];
    const peerDevices  = peerDevicesQ.data || [];

    const myDeviceCount   = new Set(myDevices.map(d => d.device_id)).size;
    const peerDeviceCount = new Set(peerDevices.map(d => d.device_id)).size;

    // I must have exactly one published device, and it must be me.
    if (myDeviceCount > 1) return _setEligible(peerUserId, false, null, 'self-multi-device');
    if (!myBundles.find(b => b.device_id === myDeviceId)) {
      return _setEligible(peerUserId, false, null, 'self-no-bundle');
    }

    // Peer must have exactly one device with a published bundle.
    if (peerDeviceCount > 1) return _setEligible(peerUserId, false, null, 'peer-multi-device');
    if (peerBundles.length !== 1) return _setEligible(peerUserId, false, null, 'peer-no-bundle');

    const peerBundle = peerBundles[0];
    // Pre-warm the bundle cache so encryptForRatchet doesn't refetch.
    _bundleCache.set(_bkey(peerUserId, peerBundle.device_id), { bundle: peerBundle, ts: Date.now() });
    return _setEligible(peerUserId, true, peerBundle.device_id, 'ok');
  } catch (e) {
    if (__DEV__) console.warn('canUseRatchet error:', e?.message);
    return _setEligible(peerUserId, false, null, 'error');
  }
}

function _setEligible(peerUserId, eligible, peerDeviceId, reason) {
  _eligibleCache.set(peerUserId, { eligible, peerDeviceId, reason, ts: Date.now() });
  return { ok: eligible, peerDeviceId, reason };
}

/** Force-evict cached eligibility (e.g., after we publish a new device). */
export function invalidateRatchetEligibility(peerUserId) {
  if (peerUserId) _eligibleCache.delete(peerUserId);
}

// ── Encrypt / Decrypt (state-managing wrappers) ──────────────

/**
 * Encrypt `plaintext` for (peerUserId, peerDeviceId) via the
 * Double Ratchet. Bootstraps state via X3DH on first send.
 * Returns the wire string (`RATCHET:v1...`) or throws on failure.
 */
export async function encryptForRatchet(peerUserId, peerDeviceId, plaintext) {
  const stateKey = _stateKey(peerUserId, peerDeviceId);
  let state = await loadRatchetState(stateKey);
  if (!state) {
    const bundle = await getPeerRatchetBundle(peerUserId, peerDeviceId);
    if (!bundle?.identity_pub || !bundle?.signed_pre_pub) {
      throw new Error('No peer ratchet bundle');
    }
    const me = await loadIdentityKeys();
    if (!me) throw new Error('No local identity keys');
    state = initSenderState({
      myIdentityPriv:   naclUtil.decodeBase64(me.privateKey),
      peerIdentityPub:  naclUtil.decodeBase64(bundle.identity_pub),
      peerSignedPrePub: naclUtil.decodeBase64(bundle.signed_pre_pub),
    });
  }
  const wire = ratchetEncrypt(state, plaintext);
  await saveRatchetState(stateKey, state);
  return wire;
}

/**
 * Decrypt a `RATCHET:v1` wire envelope from (peerUserId,
 * peerDeviceId). Bootstraps the receiver state if this is the
 * first message ever (uses the eph pubkey embedded in the wire
 * by the sender for X3DH). Returns plaintext.
 */
export async function decryptForRatchet(peerUserId, peerDeviceId, wire) {
  if (!isRatchetEnvelope(wire)) throw new Error('Not a ratchet envelope');
  const stateKey = _stateKey(peerUserId, peerDeviceId);
  let state = await loadRatchetState(stateKey);
  if (!state) {
    // First message ever — need to run X3DH from the receiver side.
    const eph = peekRatchetEph(wire);
    if (!eph) throw new Error('Ratchet bootstrap missing X3DH eph pub');
    const me  = await loadIdentityKeys();
    const spk = await _ensureSignedPreKey();
    const peerBundle = await getPeerRatchetBundle(peerUserId, peerDeviceId);
    if (!me)   throw new Error('No local identity keys');
    if (!peerBundle?.identity_pub) throw new Error('No peer identity pub for X3DH');
    state = initReceiverState({
      myIdentityPriv:  naclUtil.decodeBase64(me.privateKey),
      mySignedPrePriv: naclUtil.decodeBase64(spk.priv),
      mySignedPrePub:  naclUtil.decodeBase64(spk.pub),
      peerIdentityPub: naclUtil.decodeBase64(peerBundle.identity_pub),
      peerEphPub:      eph,
    });
  }
  const plaintext = ratchetDecrypt(state, wire);
  await saveRatchetState(stateKey, state);
  return plaintext;
}

/** Re-export so the receive path can detect ratchet wires without a doubleRatchet import. */
export { isRatchetEnvelope };
