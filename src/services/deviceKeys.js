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
import { getDeviceId, getDeviceLabel, rotateDeviceId } from './deviceIdentity';

let supabase = null;
try { supabase = require('./supabase').supabase; } catch {}

// ── Per-user cache for hot-path lookups ────────────────────────
// userId → { devices: [{device_id, public_key}], ts }
//
// Bug fix #131: TTL reduced from 5 min → 30 sec. Reason: when a peer
// signs in on a fresh install (new device_id, new keypair), the
// sender's cached device list goes stale and they encrypt to the
// peer's old device keys only. The new install can't decrypt, and
// the blanket-hide-undecryptables filter (task #46) made the failed
// messages invisible — looked like messaging was just broken. With
// a 30-sec TTL the worst-case stale-key window is short enough that
// users barely notice. Bandwidth cost: ~4× more device-key fetches
// vs the old TTL, but still ~2/min per active peer in a busy chat.
// Negligible at our scale. (1:1 chats also force-invalidate at
// chat-open — see ChatRoomScreen useEffect — for the most common
// "I just reinstalled, why are messages broken" case.)
const _devicesCache = new Map();
const CACHE_TTL_MS  = 30 * 1000;

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
    let { publicKey } = await ensureIdentityKeys();
    let deviceId      = await getDeviceId();
    const label       = await getDeviceLabel();

    // 1.0.18 fix: verify-and-rotate publish.
    //
    // The previous (1.0.17 and earlier) publish was a single upsert
    // that we trusted blindly. On iOS reinstall, expo-secure-store
    // (Keychain) preserves device_id but AsyncStorage wipes the
    // identity keypair. Result on next sign-in: a fresh local
    // keypair gets paired with an OLD device_id. The upsert SHOULD
    // have UPDATEd the row's public_key to the new value — but in
    // practice we observed the bug "Sam can't decrypt anything from
    // peers after reinstall" (2026-05-06 paired-device session).
    // Whether the upsert silently failed the UPDATE (RLS quirk,
    // replication lag) or the public_key column simply wasn't
    // updated, the symptom is identical: peers encrypt to a
    // published pubkey that doesn't correspond to any local
    // private key.
    //
    // Strategy: write, then read back. If the published row's
    // public_key doesn't match our local one, rotate the device_id
    // and INSERT a fresh row. This sidesteps any UPDATE-blocking
    // RLS quirk because we never UPDATE — we always INSERT a row
    // whose primary key is brand new.
    //
    // The orphan rows from past installs stay in user_device_keys
    // forever (we don't have permission to delete other users'
    // rows, and our own old device row is technically still ours).
    // Peers see all rows and encrypt to all of them; they can't
    // reach this install through the stale rows but they CAN reach
    // it through the new row (the only one whose public_key
    // matches a local private key). At worst we waste a few
    // bytes per send per stale row. A future cleanup task can
    // garbage-collect stale rows by last_seen_at age.

    const writePayload = (id) => ({
      user_id:       myUserId,
      device_id:     id,
      device_label:  label,
      public_key:    publicKey,
      last_seen_at:  new Date().toISOString(),
    });

    // 1.0.18 diagnostic: log local key fingerprint + device_id so
    // we can see exactly what's happening when publish runs.
    const localPkPrefix = (publicKey || '').slice(0, 16);
    const deviceIdPrefix = (deviceId || '').slice(0, 8);
    if (__DEV__) {
      console.warn(
        `[publishMyDeviceKey] start — user=${myUserId.slice(0,8)} device=${deviceIdPrefix} localPk=${localPkPrefix}`
      );
    }

    // 1.0.18 collision-rotation: detect cross-user device_id reuse.
    // iOS Simulator (and some real-device edge cases — Family Sharing
    // restored devices, dev-environment Keychain sharing) can give
    // the SAME device_id to two different accounts on the same
    // physical install. ct_for_devices in encryptForGroup is keyed
    // by raw device_id, so when one user encrypts to a member whose
    // device_id collides with their own self-encrypt, the self loop
    // overwrites the member's envelope. The recipient looks up their
    // slot, gets the sender's self-encryption (encrypted to a pubkey
    // they don't hold), fails decryption, and the FlatList placeholder
    // filter hides the message. Symptom: "I send to peer, peer sees
    // it; peer sends to me, I see nothing."
    //
    // Fix: before publishing, query if our device_id is already in
    // use by a DIFFERENT user_id. If yes, rotate to a fresh id so
    // every (user_id, device_id) pair is globally unique.
    try {
      const { data: collisions } = await supabase
        .from('user_device_keys')
        .select('user_id')
        .eq('device_id', deviceId)
        .neq('user_id', myUserId)
        .limit(1);
      if (Array.isArray(collisions) && collisions.length > 0) {
        if (__DEV__) {
          console.warn(
            `[publishMyDeviceKey] device_id ${deviceIdPrefix} is already in use by user ${collisions[0].user_id?.slice(0,8)}. Rotating to avoid envelope overwrite.`
          );
        }
        deviceId = await rotateDeviceId();
      }
    } catch {}

    // Step 1 — try the upsert path (Path 1). Select `public_key`
    // in the response so we can verify the round-trip without a
    // second query in the happy path.
    const { data: upsertActual, error: upsertErr } = await supabase
      .from('user_device_keys')
      .upsert(writePayload(deviceId), { onConflict: 'user_id,device_id' })
      .select('id, public_key')
      .maybeSingle();

    const upsertPkPrefix = (upsertActual?.public_key || '').slice(0, 16);
    if (__DEV__) {
      console.warn(
        `[publishMyDeviceKey] upsert returned — err=${upsertErr?.message || 'none'} publishedPk=${upsertPkPrefix} matches=${upsertActual?.public_key === publicKey}`
      );
    }

    if (!upsertErr && upsertActual?.public_key === publicKey) {
      // Happy path — Supabase round-tripped our intended pubkey.
      _devicesCache.delete(myUserId);
      return { deviceId, publicKey };
    }

    // Step 2 — independent read-back. On some Supabase responses
    // the `.select(...)` after an upsert may return the row that
    // was already there (RLS UPDATE silently rejected, replication
    // lag) without setting `error`. Re-query the canonical row so
    // we know whether our pubkey is actually live.
    let { data: actual } = await supabase
      .from('user_device_keys')
      .select('public_key')
      .eq('user_id', myUserId)
      .eq('device_id', deviceId)
      .maybeSingle();

    if (!upsertErr && actual?.public_key === publicKey) {
      _devicesCache.delete(myUserId);
      return { deviceId, publicKey };
    }

    // Step 3 — Path 2 (RPC fallback). Only if Path 1 errored AND we
    // have the user's phone for the SECURITY DEFINER RPC's phone
    // validation. (When called without phone, we skip Path 2 and
    // go straight to rotation.)
    if (upsertErr && myPhone) {
      const { data: rpc, error: rpcErr } = await supabase.rpc('publish_device_key', {
        p_user_id:      myUserId,
        p_phone:        myPhone,
        p_device_id:    deviceId,
        p_device_label: label,
        p_public_key:   publicKey,
      });
      if (!rpcErr && rpc?.ok) {
        // Re-verify after RPC.
        ({ data: actual } = await supabase
          .from('user_device_keys')
          .select('public_key')
          .eq('user_id', myUserId)
          .eq('device_id', deviceId)
          .maybeSingle());
        if (actual?.public_key === publicKey) {
          _devicesCache.delete(myUserId);
          return { deviceId, publicKey };
        }
      }
      if (__DEV__ && rpcErr) console.warn('publish_device_key rpc:', rpcErr.message);
    }

    // Step 4 — Rotation fallback. Either:
    //   - The upsert succeeded but didn't actually replace the
    //     public_key column (the original orphaned-key bug).
    //   - The upsert errored AND the RPC fallback wasn't available
    //     or also didn't write our value.
    // Either way, give up on this device_id. Generate a fresh one,
    // INSERT a brand-new row with our local pubkey. Insert (not
    // upsert) so a stale row at the new id can't shadow us.
    if (__DEV__) {
      console.warn(
        'publishMyDeviceKey: published pubkey did not match local. ' +
        'Rotating device_id to recover from orphaned-key state.'
      );
    }
    deviceId = await rotateDeviceId();

    // Insert new row.
    const { data: inserted, error: insertErr } = await supabase
      .from('user_device_keys')
      .insert(writePayload(deviceId))
      .select('id, public_key')
      .maybeSingle();

    if (!insertErr && inserted?.public_key === publicKey) {
      _devicesCache.delete(myUserId);
      return { deviceId, publicKey, rotated: true };
    }

    // Last-resort: try the RPC with the new device_id (handles RLS
    // INSERT denial the same way the original Path 2 did).
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
        return { deviceId, publicKey, rotated: true };
      }
    }

    if (__DEV__) {
      console.warn('publishMyDeviceKey: rotation insert also failed; giving up.');
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
