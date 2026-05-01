// ============================================================
//  pbkdf2.js — shared yieldy async PBKDF2-HMAC-SHA512
//
//  Pure-JS PBKDF2 built on tweetnacl primitives. We can't move
//  the work off the JS thread (no native crypto bridge, no JS
//  worker threads in RN), but we can chunk the iteration loop
//  and await between chunks so the UI stays interactive — the
//  cancel button stays tappable, progress callbacks can fire
//  and re-render, and the user doesn't see a frozen "Working…".
//
//  Used by:
//    - services/historyBackup.js   (cloud chat-history backup)
//    - services/vaultBackup.js     (file-based vault backup)
//
//  Future: drop in react-native-quick-crypto's hardware-backed
//  PBKDF2 here for a 10-100× speedup. Should be a single-file
//  swap because everything routes through deriveKey() below.
// ============================================================

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

const CHUNK = 2000;  // ~30-50 yield points across 100k iters

function _u8(arr) { return arr instanceof Uint8Array ? arr : new Uint8Array(arr); }

function _hmacSha512(key, data) {
  const BLOCK = 128;
  let k = _u8(key);
  if (k.length > BLOCK) k = nacl.hash(k);
  if (k.length < BLOCK) {
    const padded = new Uint8Array(BLOCK);
    padded.set(k, 0);
    k = padded;
  }
  const ipad = new Uint8Array(BLOCK);
  const opad = new Uint8Array(BLOCK);
  for (let i = 0; i < BLOCK; i++) {
    ipad[i] = k[i] ^ 0x36;
    opad[i] = k[i] ^ 0x5c;
  }
  const inner = new Uint8Array(BLOCK + data.length);
  inner.set(ipad, 0); inner.set(data, BLOCK);
  const innerHash = nacl.hash(inner);
  const outer = new Uint8Array(BLOCK + innerHash.length);
  outer.set(opad, 0); outer.set(innerHash, BLOCK);
  return nacl.hash(outer); // 64 bytes
}

function _yield() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Async, yieldy PBKDF2-HMAC-SHA512.
 *
 * @param {Uint8Array} pinBytes  UTF-8 bytes of the password/PIN.
 * @param {Uint8Array} salt      Random salt (≥ 16 bytes recommended).
 * @param {number}     iters     Iteration count.
 * @param {number}     dkLen     Output key length in bytes.
 * @param {object}     [opts]
 * @param {(pct:number)=>void} [opts.onProgress]   0..100 reporter
 * @param {()=>boolean}        [opts.isCancelled]  early-exit check
 * @returns {Promise<Uint8Array>} derived key
 *
 * Throws Error('CANCELLED') if isCancelled() returns true between chunks.
 */
export async function pbkdf2HmacSha512(pinBytes, salt, iters, dkLen, opts = {}) {
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  const isCancelled = typeof opts.isCancelled === 'function' ? opts.isCancelled : () => false;
  const out = new Uint8Array(dkLen);
  let blockIdx = 1;
  let outOffset = 0;
  let totalDone = 0;
  // Total iterations across all output blocks. For dkLen ≤ 64 this
  // is just `iters`; for longer keys we do `iters` per 64-byte block.
  const blocks = Math.ceil(dkLen / 64);
  const totalWork = iters * blocks;

  while (outOffset < dkLen) {
    const blockBE = new Uint8Array([(blockIdx>>24)&0xff,(blockIdx>>16)&0xff,(blockIdx>>8)&0xff,blockIdx&0xff]);
    const saltConcat = new Uint8Array(salt.length + 4);
    saltConcat.set(salt, 0); saltConcat.set(blockBE, salt.length);
    let u = _hmacSha512(pinBytes, saltConcat);
    let t = u.slice();

    let i = 1;
    while (i < iters) {
      const prevI = i;
      const stop = Math.min(i + CHUNK, iters);
      while (i < stop) {
        u = _hmacSha512(pinBytes, u);
        for (let j = 0; j < t.length; j++) t[j] ^= u[j];
        i++;
      }
      totalDone += (i - prevI);
      if (isCancelled()) throw new Error('CANCELLED');
      if (onProgress) {
        const pct = Math.min(99, Math.round((totalDone / totalWork) * 100));
        try { onProgress(pct); } catch {}
      }
      await _yield();
    }

    const copyLen = Math.min(t.length, dkLen - outOffset);
    out.set(t.subarray(0, copyLen), outOffset);
    outOffset += copyLen;
    blockIdx += 1;
  }
  if (onProgress) { try { onProgress(100); } catch {} }
  return out;
}

/**
 * Convenience wrapper: derive a 32-byte key for nacl.secretbox
 * from a string PIN.
 */
export async function deriveSecretboxKey(pin, salt, iters, opts) {
  const pinBytes = naclUtil.decodeUTF8(String(pin));
  return pbkdf2HmacSha512(pinBytes, salt, iters, nacl.secretbox.keyLength, opts);
}
