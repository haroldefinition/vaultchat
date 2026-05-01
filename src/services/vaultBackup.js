// ============================================================
//  vaultBackup.js — encrypted, user-controlled vault backup
//
//  What gets backed up:
//    - The list of vaulted chat IDs (from vault.listVaultedIds)
//    - The set Vault PIN itself? NO — too dangerous to round-trip;
//      the user must remember it. The PIN is the encryption key.
//    - Future: secure notes, vault file metadata
//
//  Security model:
//    - Backup file = AES-GCM-256 ciphertext of a JSON snapshot.
//    - Key derivation: PBKDF2-HMAC-SHA512(pin, salt, 200000) → 32B key.
//    - Salt is random per-export and stored in the file header so
//      restore can re-derive the same key.
//    - Wire format (base64-encoded inside the file):
//        VBACKUP1:{salt_b64}:{nonce_b64}:{ciphertext_b64}
//
//  Restore:
//    - User picks the file via the system picker.
//    - We read the salt + nonce, derive the key from the entered PIN,
//      decrypt. On auth failure (wrong PIN) we surface a clear error
//      instead of importing garbage.
//
//  Distribution:
//    - export() writes to FileSystem.documentDirectory/vaultchat-backup-<ts>.vchat
//      then opens the iOS Share Sheet so the user picks where to put
//      the file (iCloud Drive / Files / Mail / AirDrop / Save...).
//    - restore() takes a local file URI from the document picker and
//      reads its contents.
// ============================================================

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import * as FileSystem from 'expo-file-system';
import { Share, Platform } from 'react-native';
import { listVaultedIds, addToVault } from './vault';
import { deriveSecretboxKey } from './pbkdf2';

const HEADER  = 'VBACKUP1:';
// Iteration count baked into the V1 wire format. Don't change
// this without also bumping HEADER + adding parse-time iter
// detection — existing .vchat files would otherwise become
// undecryptable. The new chat-history backup
// (services/historyBackup.js) uses a different scheme where
// per-row iters are stored alongside the ciphertext, which is
// the right way to make this kind of change in the future.
const PBKDF2_ITERS = 200000;

// PBKDF2 lives in services/pbkdf2.js (shared with historyBackup.js).
// The deriveSecretboxKey wrapper handles the 32-byte AES key
// derivation from a string PIN + salt. Yieldy + supports
// onProgress + isCancelled via the opts arg.
function _deriveKey(pin, salt, opts) {
  return deriveSecretboxKey(pin, salt, PBKDF2_ITERS, opts);
}

// ── Snapshot collection / application ─────────────────────────

async function _collectSnapshot() {
  const vaultedIds = await listVaultedIds().catch(() => []);
  return {
    v: 1,
    exported_at: new Date().toISOString(),
    vaulted_ids: Array.isArray(vaultedIds) ? vaultedIds : [],
  };
}

async function _applySnapshot(snap) {
  if (!snap || snap.v !== 1) throw new Error('Unsupported backup version');
  const ids = Array.isArray(snap.vaulted_ids) ? snap.vaulted_ids : [];
  let restored = 0;
  for (const id of ids) {
    try { await addToVault(id); restored++; } catch {}
  }
  return restored;
}

// ── Export ────────────────────────────────────────────────────

/**
 * Export the user's vault state as a PIN-encrypted file and
 * present the iOS Share Sheet so they can save it wherever they
 * want (iCloud Drive, Files, Mail, AirDrop).
 *
 * Returns { ok, path, message } so the caller can show a toast
 * or alert.
 */
export async function exportVaultBackup(pin, opts = {}) {
  const { onProgress, isCancelled } = opts;
  if (!pin || String(pin).length < 4) {
    return { ok: false, message: 'PIN required to encrypt the backup.' };
  }
  try {
    const snap   = await _collectSnapshot();
    const json   = JSON.stringify(snap);
    const data   = naclUtil.decodeUTF8(json);
    const salt   = nacl.randomBytes(16);
    const nonce  = nacl.randomBytes(nacl.secretbox.nonceLength);
    const key    = await _deriveKey(pin, salt, { onProgress, isCancelled });
    if (typeof isCancelled === 'function' && isCancelled()) {
      return { ok: false, code: 'CANCELLED', message: 'Cancelled.' };
    }
    const cipher = nacl.secretbox(data, nonce, key);
    if (!cipher) throw new Error('Encryption failed');

    const blob = HEADER +
      naclUtil.encodeBase64(salt)   + ':' +
      naclUtil.encodeBase64(nonce)  + ':' +
      naclUtil.encodeBase64(cipher);

    const ts = Date.now();
    const filename = `vaultchat-backup-${ts}.vchat`;
    const dir  = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    const uri  = `${dir}${filename}`;
    await FileSystem.writeAsStringAsync(uri, blob, { encoding: FileSystem.EncodingType.UTF8 });

    // Pop iOS Share Sheet so the user can save the file out of the app.
    try {
      await Share.share({
        url: Platform.OS === 'ios' ? uri : undefined,
        message: Platform.OS === 'android' ? `VaultChat backup saved at ${uri}` : undefined,
        title: 'VaultChat Vault Backup',
      });
    } catch {}

    return { ok: true, path: uri, message: 'Vault backup ready to save.' };
  } catch (e) {
    if (e?.message === 'CANCELLED') {
      return { ok: false, code: 'CANCELLED', message: 'Cancelled.' };
    }
    if (__DEV__) console.warn('exportVaultBackup error:', e?.message);
    return { ok: false, message: 'Couldn’t create backup.' };
  }
}

// ── Silent weekly auto-backup (Apr 30 launch addition) ─────────
//
// Same encryption + write as exportVaultBackup, but:
//   - never pops the Share sheet (silent — no UI, no nudges)
//   - writes to a stable rotating filename inside the app's
//     sandboxed documents directory (auto-backup-N.vchat)
//   - keeps the last 4 weekly backups, deletes older
//   - skips if no PIN supplied (can't encrypt without one)
//
// Triggered from App.js on app foreground when 7+ days have
// passed since the last successful backup. Tracked via
// AsyncStorage `vaultchat_last_auto_backup` timestamp.
//
// Files live in iOS/Android private app sandbox so they're
// protected by the OS and aren't visible in Files / iCloud
// Drive unless the user manually exports via the Settings →
// Backup Vault flow (which still uses the Share-sheet path).

const AUTO_BACKUP_KEEP = 4;          // keep last 4 weeks
const AUTO_BACKUP_PREFIX = 'auto-backup-';

export async function silentAutoBackup(pin) {
  if (!pin || String(pin).length < 4) {
    return { ok: false, message: 'Skipped — no Vault PIN set.' };
  }
  try {
    const snap   = await _collectSnapshot();
    const json   = JSON.stringify(snap);
    const data   = naclUtil.decodeUTF8(json);
    const salt   = nacl.randomBytes(16);
    const nonce  = nacl.randomBytes(nacl.secretbox.nonceLength);
    const key    = await _deriveKey(pin, salt);
    const cipher = nacl.secretbox(data, nonce, key);
    if (!cipher) throw new Error('Encryption failed');

    const blob = HEADER +
      naclUtil.encodeBase64(salt)   + ':' +
      naclUtil.encodeBase64(nonce)  + ':' +
      naclUtil.encodeBase64(cipher);

    const ts       = Date.now();
    const filename = `${AUTO_BACKUP_PREFIX}${ts}.vchat`;
    const dir      = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    const uri      = `${dir}${filename}`;
    await FileSystem.writeAsStringAsync(uri, blob, { encoding: FileSystem.EncodingType.UTF8 });

    // Rotation — keep the last AUTO_BACKUP_KEEP, delete older.
    try {
      const list = await FileSystem.readDirectoryAsync(dir);
      const autos = list
        .filter(n => n.startsWith(AUTO_BACKUP_PREFIX) && n.endsWith('.vchat'))
        .sort()      // ts in filename → lexicographic sort works
        .reverse();  // newest first
      const toDelete = autos.slice(AUTO_BACKUP_KEEP);
      for (const name of toDelete) {
        try { await FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true }); } catch {}
      }
    } catch {}

    return { ok: true, path: uri, message: 'Silent backup written.' };
  } catch (e) {
    if (__DEV__) console.warn('silentAutoBackup error:', e?.message);
    return { ok: false, message: 'Silent backup failed.' };
  }
}

// ── Restore ───────────────────────────────────────────────────

/**
 * Read an encrypted backup file at `uri`, decrypt with the PIN,
 * and apply the snapshot to local vault state.
 *
 * Returns { ok, restored, message }. `restored` = number of
 * vaulted chat IDs successfully restored.
 */
export async function restoreVaultBackup(uri, pin, opts = {}) {
  const { onProgress, isCancelled } = opts;
  if (!uri) return { ok: false, message: 'No backup file selected.' };
  if (!pin) return { ok: false, message: 'PIN required to decrypt the backup.' };
  try {
    const blob = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
    if (!blob.startsWith(HEADER)) {
      return { ok: false, message: 'Not a VaultChat backup file.' };
    }
    const parts = blob.slice(HEADER.length).split(':');
    if (parts.length !== 3) return { ok: false, message: 'Backup file is malformed.' };
    const [saltB64, nonceB64, ctB64] = parts;
    const salt   = naclUtil.decodeBase64(saltB64);
    const nonce  = naclUtil.decodeBase64(nonceB64);
    const cipher = naclUtil.decodeBase64(ctB64);

    const key   = await _deriveKey(pin, salt, { onProgress, isCancelled });
    if (typeof isCancelled === 'function' && isCancelled()) {
      return { ok: false, code: 'CANCELLED', message: 'Cancelled.' };
    }
    const plain = nacl.secretbox.open(cipher, nonce, key);
    if (!plain) {
      return { ok: false, message: 'Wrong PIN — couldn’t decrypt the backup.' };
    }
    const json = naclUtil.encodeUTF8(plain);
    const snap = JSON.parse(json);
    const restored = await _applySnapshot(snap);
    return { ok: true, restored, message: `${restored} vaulted chat${restored === 1 ? '' : 's'} restored.` };
  } catch (e) {
    if (e?.message === 'CANCELLED') {
      return { ok: false, code: 'CANCELLED', message: 'Cancelled.' };
    }
    if (__DEV__) console.warn('restoreVaultBackup error:', e?.message);
    return { ok: false, message: 'Couldn’t restore backup.' };
  }
}
