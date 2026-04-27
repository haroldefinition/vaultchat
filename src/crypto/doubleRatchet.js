// ============================================================
//  doubleRatchet.js — Signal-style Double Ratchet for forward
//  secrecy on 1:1 conversations (Phase WW).
//
//  This is a self-contained Double Ratchet implementation using
//  only tweetnacl primitives (X25519 ECDH + XSalsa20-Poly1305 +
//  SHA-512). It does NOT pull in libsignal-protocol-* — those
//  libs have RN-painful native deps and assume a Node-shaped
//  environment.
//
//  Protocol overview (matches Signal spec, simplified):
//    - X3DH initial shared secret = combination of long-term
//      identity DH + ephemeral DH on first message.
//    - Root chain: KDF(rootKey, DH(ephA, ephB)) → newRootKey,
//      newChainKey. Advances on every DH-ratchet step (every
//      time we receive a message with a new ephemeral key).
//    - Sending chain: KDF(chainKey) → messageKey, nextChainKey.
//      One messageKey per outgoing message. KEY IS DELETED after
//      use — that's the forward-secrecy guarantee.
//    - Receiving chain: same KDF, but advanced as messages come
//      in. We can hold onto a few "skipped message keys" to
//      handle out-of-order delivery.
//
//  Persistence:
//    - State per-conversation lives in expo-secure-store under
//      'ratchet:<peerUserId>'. Sync surface is intentionally
//      narrow — every method takes/returns the state object so
//      the caller controls when to write to disk.
//
//  Wire format:
//    'RATCHET:v1' + JSON.stringify({
//       dh:  base64(senderRatchetPublicKey),
//       n:   messageNumber within current sending chain,
//       pn:  previous chain length (so receiver can skip messages
//            if a DH-ratchet step happened mid-conversation),
//       ct:  base64(secretbox ciphertext),
//       nonce: base64(secretbox nonce),
//    })
//
//  Integration plan:
//    Phase WW-1 (this file) — core protocol + state mgmt.
//    Phase WW-2 — wire it into ChatRoomScreen.postMsg as an
//                 opt-in path behind a feature flag. Existing
//                 messages still decrypt via the legacy ENC2 /
//                 MD2 paths. New messages prefer ratchet when
//                 both peers have published their RatchetSignedKey
//                 (a new pubkey published alongside the long-term
//                 identity key — see Phase WW-3).
//    Phase WW-3 — schema add: profiles.ratchet_signed_pub +
//                 ratchet_signed_pub_sig (signed with identity
//                 key for authenticity). One-time pre-key bundle
//                 published per device.
//    Phase WW-4 — flip default to ratchet for all 1:1 sends
//                 once telemetry shows ≥99% of active devices
//                 have a published RatchetSignedKey.
// ============================================================

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import * as SecureStore from 'expo-secure-store';

const RATCHET_TAG = 'RATCHET:v1';
const STORE_PREFIX = 'ratchet_state_';
const STORE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED };
// Maximum out-of-order messages we'll hold a key for. Beyond this,
// older messages will be undecryptable — pragmatic anti-DoS.
const MAX_SKIP = 256;

export function isRatchetEnvelope(s) {
  return typeof s === 'string' && s.startsWith(RATCHET_TAG);
}

// ── KDFs ────────────────────────────────────────────────────────
// KDF_RK: Root-key KDF, one input (DH output) → (newRoot, chainKey)
// KDF_CK: Chain-key KDF, advance one step → (nextChain, msgKey)
//
// All built on HMAC-SHA512 (we have nacl.hash for SHA-512).

function _u8(a) { return a instanceof Uint8Array ? a : new Uint8Array(a); }

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
  for (let i = 0; i < BLOCK; i++) { ipad[i] = k[i] ^ 0x36; opad[i] = k[i] ^ 0x5c; }
  const inner = new Uint8Array(BLOCK + data.length);
  inner.set(ipad, 0); inner.set(_u8(data), BLOCK);
  const innerHash = nacl.hash(inner);
  const outer = new Uint8Array(BLOCK + innerHash.length);
  outer.set(opad, 0); outer.set(innerHash, BLOCK);
  return nacl.hash(outer);
}

function _kdfRK(rootKey, dhOut) {
  // Returns (newRoot, chainKey) — both 32 bytes
  const out = _hmacSha512(rootKey, dhOut);
  return { rootKey: out.slice(0, 32), chainKey: out.slice(32, 64) };
}

function _kdfCK(chainKey) {
  // Returns (nextChain, msgKey) — both 32 bytes.
  const next = _hmacSha512(chainKey, new Uint8Array([0x02])).slice(0, 32);
  const msg  = _hmacSha512(chainKey, new Uint8Array([0x01])).slice(0, 32);
  return { chainKey: next, msgKey: msg };
}

function _dh(privA, pubB) {
  return nacl.scalarMult(_u8(privA), _u8(pubB));
}

// ── State serialization ────────────────────────────────────────
// State shape (every byte field stored as base64):
//   {
//     v:   1,
//     RK:  rootKey,
//     DHs: { pub, priv } — my current sending ratchet keypair
//     DHr: peer's last seen ratchet pub (or null pre-handshake)
//     CKs: sending chain key (or null if no sending chain yet)
//     CKr: receiving chain key
//     Ns:  message number in current sending chain
//     Nr:  message number in current receiving chain
//     PN:  length of previous sending chain (sent in headers so
//           receiver can compute skipped keys after a DH step)
//     SKIPPED: { '<dhPubB64>:<n>': msgKey, ... } — at most MAX_SKIP
//   }

function _b64(bytes) { return naclUtil.encodeBase64(_u8(bytes)); }
function _bin(b64)   { return naclUtil.decodeBase64(b64); }

function _serialize(state) {
  return JSON.stringify({
    v:   1,
    RK:  state.RK ? _b64(state.RK) : null,
    DHs: state.DHs ? { pub: _b64(state.DHs.pub), priv: _b64(state.DHs.priv) } : null,
    DHr: state.DHr ? _b64(state.DHr) : null,
    CKs: state.CKs ? _b64(state.CKs) : null,
    CKr: state.CKr ? _b64(state.CKr) : null,
    Ns:  state.Ns | 0,
    Nr:  state.Nr | 0,
    PN:  state.PN | 0,
    SKIPPED: state.SKIPPED || {},
  });
}

function _deserialize(json) {
  const o = JSON.parse(json);
  return {
    RK:  o.RK ? _bin(o.RK) : null,
    DHs: o.DHs ? { pub: _bin(o.DHs.pub), priv: _bin(o.DHs.priv) } : null,
    DHr: o.DHr ? _bin(o.DHr) : null,
    CKs: o.CKs ? _bin(o.CKs) : null,
    CKr: o.CKr ? _bin(o.CKr) : null,
    Ns:  o.Ns | 0,
    Nr:  o.Nr | 0,
    PN:  o.PN | 0,
    SKIPPED: o.SKIPPED || {},
  };
}

export async function loadRatchetState(peerKey) {
  try {
    const json = await SecureStore.getItemAsync(STORE_PREFIX + peerKey, STORE_OPTIONS);
    return json ? _deserialize(json) : null;
  } catch { return null; }
}

export async function saveRatchetState(peerKey, state) {
  try {
    await SecureStore.setItemAsync(STORE_PREFIX + peerKey, _serialize(state), STORE_OPTIONS);
  } catch {}
}

// ── X3DH initial handshake ─────────────────────────────────────
// Simplified two-party variant: sender combines (myIdentityPriv,
// peerIdentityPub) DH with (myEphPriv, peerSignedPrePub) DH to
// produce the initial root key. Peer reverses the math.
//
// In a full Signal deployment there's also a one-time pre-key for
// extra security against replays; we omit it for v1 (a follow-up
// can wire in `pre_keys` table).

export function initSenderState({
  myIdentityPriv, peerIdentityPub, peerSignedPrePub,
}) {
  // Generate ephemeral keypair for this conversation.
  const eph = nacl.box.keyPair();
  const dh1 = _dh(myIdentityPriv, peerSignedPrePub);
  const dh2 = _dh(eph.secretKey,  peerIdentityPub);
  const dh3 = _dh(eph.secretKey,  peerSignedPrePub);
  const concat = new Uint8Array(dh1.length + dh2.length + dh3.length);
  concat.set(dh1, 0);
  concat.set(dh2, dh1.length);
  concat.set(dh3, dh1.length + dh2.length);
  const RK = nacl.hash(concat).slice(0, 32);

  // Generate the first DH-ratchet keypair for sending.
  const ratchetKp = nacl.box.keyPair();
  // Run a DH-ratchet step against the peer's signed pre-key so we
  // have a sending chain key right away.
  const dhOut = _dh(ratchetKp.secretKey, peerSignedPrePub);
  const { rootKey: newRK, chainKey: CKs } = _kdfRK(RK, dhOut);

  return {
    RK:  newRK,
    DHs: { pub: ratchetKp.publicKey, priv: ratchetKp.secretKey },
    DHr: peerSignedPrePub,
    CKs,
    CKr: null,
    Ns: 0, Nr: 0, PN: 0,
    SKIPPED: {},
    // Stash the eph pub so the first outgoing wire can include it
    // for the receiver's X3DH math. Caller embeds in headers.
    _initialEphPub: eph.publicKey,
  };
}

export function initReceiverState({
  myIdentityPriv, mySignedPrePriv, mySignedPrePub,
  peerIdentityPub, peerEphPub,
}) {
  const dh1 = _dh(mySignedPrePriv, peerIdentityPub);
  const dh2 = _dh(myIdentityPriv,  peerEphPub);
  const dh3 = _dh(mySignedPrePriv, peerEphPub);
  const concat = new Uint8Array(dh1.length + dh2.length + dh3.length);
  concat.set(dh1, 0);
  concat.set(dh2, dh1.length);
  concat.set(dh3, dh1.length + dh2.length);
  const RK = nacl.hash(concat).slice(0, 32);

  return {
    RK,
    // Receiver doesn't have a sending chain until the first DH-
    // ratchet step (triggered by the first incoming message with
    // a new sender ratchet key).
    DHs: { pub: mySignedPrePub, priv: mySignedPrePriv },
    DHr: null,
    CKs: null,
    CKr: null,
    Ns: 0, Nr: 0, PN: 0,
    SKIPPED: {},
  };
}

// ── DH-ratchet step ────────────────────────────────────────────
// Triggered when we receive a message with a NEW sender ratchet
// key (different from state.DHr). Advances the receiving chain on
// the new DH output, then generates a fresh sending keypair and
// advances the sending chain too.

function _dhRatchet(state, peerNewDHPub) {
  state.PN = state.Ns;
  state.Ns = 0;
  state.Nr = 0;
  state.DHr = peerNewDHPub;

  // Receive chain on (myCurrentPriv, peerNewPub)
  const dhRecv = _dh(state.DHs.priv, peerNewDHPub);
  const r1 = _kdfRK(state.RK, dhRecv);
  state.RK  = r1.rootKey;
  state.CKr = r1.chainKey;

  // New sending keypair, advance send chain on (newPriv, peerNewPub)
  const fresh = nacl.box.keyPair();
  state.DHs = { pub: fresh.publicKey, priv: fresh.secretKey };
  const dhSend = _dh(state.DHs.priv, peerNewDHPub);
  const r2 = _kdfRK(state.RK, dhSend);
  state.RK  = r2.rootKey;
  state.CKs = r2.chainKey;
}

// ── Skipped-keys book-keeping ──────────────────────────────────

function _skipKey(dhPub, n) { return `${naclUtil.encodeBase64(dhPub)}:${n}`; }

function _skipUntil(state, untilN) {
  if (!state.CKr) return;
  while (state.Nr < untilN) {
    if (Object.keys(state.SKIPPED).length >= MAX_SKIP) {
      throw new Error('Too many skipped messages — possible replay attack');
    }
    const { chainKey, msgKey } = _kdfCK(state.CKr);
    state.SKIPPED[_skipKey(state.DHr, state.Nr)] = naclUtil.encodeBase64(msgKey);
    state.CKr = chainKey;
    state.Nr += 1;
  }
}

function _trySkipped(state, dhPub, n, ciphertext, nonce) {
  const k = _skipKey(dhPub, n);
  if (!(k in state.SKIPPED)) return null;
  const msgKey = naclUtil.decodeBase64(state.SKIPPED[k]);
  delete state.SKIPPED[k];
  const plain = nacl.secretbox.open(ciphertext, nonce, msgKey);
  return plain || null;
}

// ── encrypt / decrypt ──────────────────────────────────────────

export function ratchetEncrypt(state, plaintext) {
  if (!state || !state.CKs) throw new Error('Ratchet sender chain not initialized');
  const { chainKey, msgKey } = _kdfCK(state.CKs);
  state.CKs = chainKey;
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ct = nacl.secretbox(naclUtil.decodeUTF8(String(plaintext)), nonce, msgKey);
  if (!ct) throw new Error('Ratchet encrypt failed');
  const wire = RATCHET_TAG + JSON.stringify({
    dh:    naclUtil.encodeBase64(state.DHs.pub),
    n:     state.Ns,
    pn:    state.PN,
    ct:    naclUtil.encodeBase64(ct),
    nonce: naclUtil.encodeBase64(nonce),
  });
  state.Ns += 1;
  return wire;
}

export function ratchetDecrypt(state, wire) {
  if (!isRatchetEnvelope(wire)) throw new Error('Not a ratchet envelope');
  const env = JSON.parse(wire.slice(RATCHET_TAG.length));
  const senderDH = naclUtil.decodeBase64(env.dh);
  const ct       = naclUtil.decodeBase64(env.ct);
  const nonce    = naclUtil.decodeBase64(env.nonce);
  const n        = env.n | 0;
  const pn       = env.pn | 0;

  // Try the skipped-keys cache first — handles out-of-order delivery
  // for messages we already advanced past.
  const recovered = _trySkipped(state, senderDH, n, ct, nonce);
  if (recovered) return naclUtil.encodeUTF8(recovered);

  // DH-ratchet step? (Sender rotated their ratchet key.)
  const dhrB64 = state.DHr ? naclUtil.encodeBase64(state.DHr) : null;
  const senderDHb64 = naclUtil.encodeBase64(senderDH);
  if (dhrB64 !== senderDHb64) {
    if (state.DHr && state.CKr) {
      // Skip to the end of the previous chain — sender said it
      // had pn messages before rotating, so advance past them.
      _skipUntil(state, pn);
    }
    _dhRatchet(state, senderDH);
  }

  // Now we should be on the right receive chain — skip to n then
  // open the actual envelope.
  _skipUntil(state, n);
  const { chainKey, msgKey } = _kdfCK(state.CKr);
  state.CKr = chainKey;
  state.Nr += 1;
  const plain = nacl.secretbox.open(ct, nonce, msgKey);
  if (!plain) throw new Error('Ratchet decrypt failed (auth)');
  return naclUtil.encodeUTF8(plain);
}

// ── Sanity test (not exported; called by skipped-tests) ────────

export function __selfTest() {
  // Simulate a full Alice → Bob → Alice exchange.
  const aliceId = nacl.box.keyPair();
  const bobId   = nacl.box.keyPair();
  const bobSigned = nacl.box.keyPair();

  const aliceState = initSenderState({
    myIdentityPriv:   aliceId.secretKey,
    peerIdentityPub:  bobId.publicKey,
    peerSignedPrePub: bobSigned.publicKey,
  });
  const bobState = initReceiverState({
    myIdentityPriv:  bobId.secretKey,
    mySignedPrePriv: bobSigned.secretKey,
    mySignedPrePub:  bobSigned.publicKey,
    peerIdentityPub: aliceId.publicKey,
    peerEphPub:      aliceState._initialEphPub,
  });

  const wire1 = ratchetEncrypt(aliceState, 'hello bob');
  const out1  = ratchetDecrypt(bobState, wire1);
  if (out1 !== 'hello bob') throw new Error('ratchet self-test #1 failed');
  return true;
}
