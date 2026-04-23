// VaultChat — services/encryption.js
//
// Thin re-export shim. Real implementation lives at `../crypto/encryption.js`
// (NaCl box / X25519 + XSalsa20-Poly1305). Old callers that still import from
// `services/encryption` get the real crypto automatically.
//
// The previous XOR "demo" code in this file has been retired. Any legacy
// `ENC:` prefixed content stored before this change is NOT readable — that
// cipher was never end-to-end anyway and only ran on the local device.

export {
  generateIdentityKeys,
  loadIdentityKeys,
  ensureIdentityKeys,
  encryptMessage,
  decryptMessage,
  safeDecrypt,
  isEncryptedEnvelope,
  generateFingerprint,
  generateVanishKey,
} from '../crypto/encryption';
