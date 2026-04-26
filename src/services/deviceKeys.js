// ============================================================
//  deviceKeys.js — multi-device E2E keypair management
//
//  Schema:
//    user_device_keys (user_id, device_id, public_key, ...)
//
//  Each install:
//    1. Has a stable device_id (services/deviceIdentity.js)
//    2. Has a NaCl box keypair stored locally (crypto/encryption.js
//       via ensureIdentityKeys)
//    3. On bootstrap, publishes (user_id, device_id, public_key)
//       to user_device_keys so peers can encrypt to this device.
//
//  Senders fetch ALL device keys for a recipient and encrypt the
//  message once per device. Each device decrypts with its own
//  private key.
//
//  Backwards compat: if a recipient has no rows in
//  user_device_keys yet (legacy user pre-Phase MM), the sender
//  falls back to profiles.public_key — same single-recipient
//  envelope as before.
// ============================================================

import { ensureIdentityKeys } from '../crypto/encryption';
import { getDeviceId, getDeviceLabel } from './deviceIdentity';

let supabase = null;
try { supabase = require('./supabase').supabase; } catch {}

// ── Per-user cache for hot-path lookups ────────────────────────
// userId → { devices: [{device_id, public_key}], ts }
const _devicesCache = new Map();
const CACHE_TTL_MS  = 5 * 60 * 1000;

function _cached(userId) {
  const e = _devicesCache.get(userId);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) {
    _devicesCache.delete(userId);
    return null;
  }
  return e.devices;
}

/**
 * Publish THIS device's public key to the user_device_keys table.
 * Idempotent — safe to call on every cold launch.
 *
 * Two paths (mirrors keyExchange.publishMyPublicKey):
 *   1. Direct UPSERT — works when device has a real Supabase auth
 *      session (auth.uid() = user_id, RLS policy permits).
 *   2. RPC fallback — `publish_device_key(user_id, phone, device_id,
 *      label, public_key)` SECURITY DEFINER, validates phone match.
 */
export async function publishMyDeviceKey(myUserId, myPhone) {
  if (!myUserId || !supabase) return null;
  try {
    const { publicKey } = await ensureIdentityKeys();
    const deviceId = await getDeviceId();
    const label    = await getDeviceLabel();

    // Path 1: direct upsert (auth session present).
    const { data, error } = await supabase
      .from('user_device_keys')
      .upsert(
        { user_id: myUserId, device_id: deviceId, device_label: label, public_key: publicKey, last_seen_at: new Date().toISOString() },
        { onConflict: 'user_id,device_id' },
      )
      .select('id')
      .maybeSingle();

    if (!error && data) {
      _devicesCache.delete(myUserId); // invalidate so next read sees the new row
      return { deviceId, publicKey };
    }

    // Path 2: RPC fallback (no auth session / RLS blocked).
    if (myPhone) {
      const { data: rpc, error: rpcErr } = await supabase.rpc('publish_device_key', {
        p_user_id:      myUserId,
        p_phone:        myPhone,
        p_device_id:    deviceId,
        p_device_label: label,
        p_public_key:   publicKey,
      });
      if (!rpcErr && rpc?.ok) {
        _devicesCache.delete(myUserId);
        return { deviceId, publicKey };
      }
      if (__DEV__ && rpcErr) console.warn('publish_device_key rpc:', rpcErr.message);
    }
    return null;
  } catch (e) {
    if (__DEV__) console.warn('publishMyDeviceKey error:', e?.message);
    return null;
  }
}

/**
 * Fetch every device key for a user. Returns
 * [{ device_id, public_key }, ...] — possibly empty.
 *
 * Cached for 5 minutes per user. Use invalidateUserDevices() to
 * force a refresh (e.g., after a "no peer device key" send error
 * the user might want to retry).
 */
export async function getDeviceKeysForUser(userId) {
  if (!userId || !supabase) return [];
  const hit = _cached(userId);
  if (hit) return hit;
  try {
    const { data, error } = await supabase
      .from('user_device_keys')
      .select('device_id, public_key, last_seen_at')
      .eq('user_id', userId)
      .order('last_seen_at', { ascending: false });
    if (error || !Array.isArray(data)) return [];
    const devices = data
      .filter(r => r.device_id && r.public_key)
      .map(r => ({ device_id: r.device_id, public_key: r.public_key }));
    _devicesCache.set(userId, { devices, ts: Date.now() });
    return devices;
  } catch (e) {
    if (__DEV__) console.warn('getDeviceKeysForUser error:', e?.message);
    return [];
  }
}

/**
 * Bulk variant for prefetching across an entire chat room or
 * group. Returns Map<userId, [{device_id, public_key}, ...]>.
 * One round-trip per uncached user (in parallel).
 */
export async function getDeviceKeysBulk(userIds) {
  const out = new Map();
  if (!userIds?.length || !supabase) return out;
  const uncached = [];
  for (const id of userIds) {
    if (!id) continue;
    const hit = _cached(id);
    if (hit) out.set(id, hit);
    else uncached.push(id);
  }
  if (!uncached.length) return out;
  try {
    const { data } = await supabase
      .from('user_device_keys')
      .select('user_id, device_id, public_key, last_seen_at')
      .in('user_id', uncached)
      .order('last_seen_at', { ascending: false });
    const grouped = new Map();
    for (const r of (data || [])) {
      if (!r.device_id || !r.public_key) continue;
      if (!grouped.has(r.user_id)) grouped.set(r.user_id, []);
      grouped.get(r.user_id).push({ device_id: r.device_id, public_key: r.public_key });
    }
    for (const id of uncached) {
      const devices = grouped.get(id) || [];
      _devicesCache.set(id, { devices, ts: Date.now() });
      out.set(id, devices);
    }
  } catch (e) {
    if (__DEV__) console.warn('getDeviceKeysBulk error:', e?.message);
  }
  return out;
}

/** Force-evict a user's cached device list. */
export function invalidateUserDevices(userId) {
  if (userId) _devicesCache.delete(userId);
}

/** Wipe the entire cache (sign-out / account switch). */
export function clearDeviceCache() {
  _devicesCache.clear();
}
