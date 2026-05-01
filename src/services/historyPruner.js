// ============================================================
//  historyPruner.js — 90-day sweep across plaintext caches
//
//  Phase 1 of the 90-day-history feature.
//
//  ChatRoomScreen + GroupChatScreen each prune their own per-room
//  cache during hydrate (i.e. only when the user opens that chat).
//  This service handles the "user hasn't opened that chat in
//  months" case: walks every vaultchat_plain_<roomId> and
//  vaultchat_gplain_<groupId> entry in AsyncStorage and drops
//  anything older than 90 days, regardless of whether the chat
//  has been opened recently.
//
//  Throttled to once per day so we don't run the full O(rooms)
//  scan every time the user briefly backgrounds + foregrounds
//  the app. Tracked via AsyncStorage `vaultchat_last_history_prune`.
//
//  Wired in App.js from the AppState 'active' handler.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

const TTL_MS         = 90 * 24 * 60 * 60 * 1000;  // 90 days
const PRUNE_EVERY_MS = 24 * 60 * 60 * 1000;       // once / day
const LAST_RUN_KEY   = 'vaultchat_last_history_prune';
const KEY_PREFIXES   = ['vaultchat_plain_', 'vaultchat_gplain_'];

/**
 * Walk every plaintext-cache key in AsyncStorage and drop entries
 * older than 90 days. Throttled to once per day. Best-effort:
 * any error in a single key is logged in dev and skipped.
 *
 * Returns { ok, scanned, droppedKeys, droppedEntries, skipped }.
 */
export async function pruneOldPlaintextCaches({ force = false } = {}) {
  try {
    if (!force) {
      const lastRaw = await AsyncStorage.getItem(LAST_RUN_KEY);
      const last = parseInt(lastRaw || '0', 10);
      if (Date.now() - last < PRUNE_EVERY_MS) {
        return { ok: true, skipped: true, reason: 'throttled' };
      }
    }

    const allKeys = await AsyncStorage.getAllKeys();
    const targets = (allKeys || []).filter(k =>
      KEY_PREFIXES.some(p => typeof k === 'string' && k.startsWith(p))
    );

    let scanned = 0;
    let droppedKeys = 0;
    let droppedEntries = 0;
    const now = Date.now();

    for (const key of targets) {
      scanned++;
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;
        const map = JSON.parse(raw);
        if (!map || typeof map !== 'object') continue;
        const out = {};
        let kept = 0, dropped = 0;
        for (const [id, v] of Object.entries(map)) {
          if (typeof v === 'string') {
            // Legacy/no-ts entry — keep but stamp it so it can age
            // out next sweep. The cache writers will refresh ts on
            // the next decrypt that touches this id.
            out[id] = { t: v, ts: now };
            kept++;
          } else if (v && typeof v === 'object' && typeof v.t === 'string') {
            const ts = typeof v.ts === 'number' ? v.ts : now;
            if (now - ts > TTL_MS) { dropped++; continue; }
            out[id] = { t: v.t, ts };
            kept++;
          }
        }
        droppedEntries += dropped;
        if (kept === 0) {
          // Whole cache aged out — remove the key entirely.
          await AsyncStorage.removeItem(key).catch(() => {});
          droppedKeys++;
        } else if (dropped > 0) {
          await AsyncStorage.setItem(key, JSON.stringify(out)).catch(() => {});
        }
      } catch (e) {
        if (__DEV__) console.warn('[historyPruner] error on', key, e?.message);
      }
    }

    await AsyncStorage.setItem(LAST_RUN_KEY, String(Date.now())).catch(() => {});
    if (__DEV__) {
      console.log('[historyPruner] swept', scanned, 'caches, dropped',
                  droppedKeys, 'whole keys and', droppedEntries, 'entries');
    }
    return { ok: true, scanned, droppedKeys, droppedEntries };
  } catch (e) {
    if (__DEV__) console.warn('[historyPruner] sweep failed:', e?.message);
    return { ok: false, message: e?.message || 'prune failed' };
  }
}
