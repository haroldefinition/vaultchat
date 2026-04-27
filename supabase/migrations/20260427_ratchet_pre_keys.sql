-- ============================================================
--  Ratchet pre-keys (Phase YY) — per-device signed pre-key
--  bundle for X3DH initial handshake of the Double Ratchet
--  forward-secrecy protocol.
--
--  Each device publishes:
--    identity_pub    — long-term Curve25519 box pubkey
--                      (mirrors profiles.public_key /
--                       user_device_keys.public_key — kept here
--                       so peers can fetch identity + pre-key in
--                       a single round-trip)
--    signed_pre_pub  — rotating ratchet pre-key for this device
--
--  Senders fetch a peer's bundle, run X3DH against (identity_pub +
--  signed_pre_pub), and bootstrap a per-conversation Double
--  Ratchet state. Once bootstrapped, ongoing messages use only
--  the ratchet — root key + chain keys evolve every send/receive,
--  so a future private-key compromise can't decrypt past traffic.
-- ============================================================

CREATE TABLE IF NOT EXISTS ratchet_pre_keys (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id       TEXT         NOT NULL,
  identity_pub    TEXT         NOT NULL,
  signed_pre_pub  TEXT         NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT ratchet_pre_keys_unique UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS ratchet_pre_keys_lookup_idx
  ON ratchet_pre_keys (user_id, device_id);

ALTER TABLE ratchet_pre_keys ENABLE ROW LEVEL SECURITY;

-- Open SELECT — same disclosure model as user_device_keys; the
-- pubkeys are public by design (otherwise senders can't encrypt
-- to peers).
DROP POLICY IF EXISTS ratchet_pre_keys_select_all ON ratchet_pre_keys;
CREATE POLICY ratchet_pre_keys_select_all
  ON ratchet_pre_keys FOR SELECT
  TO authenticated
  USING (true);

-- Write only own bundle.
DROP POLICY IF EXISTS ratchet_pre_keys_insert_own ON ratchet_pre_keys;
CREATE POLICY ratchet_pre_keys_insert_own
  ON ratchet_pre_keys FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ratchet_pre_keys_update_own ON ratchet_pre_keys;
CREATE POLICY ratchet_pre_keys_update_own
  ON ratchet_pre_keys FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ratchet_pre_keys_delete_own ON ratchet_pre_keys;
CREATE POLICY ratchet_pre_keys_delete_own
  ON ratchet_pre_keys FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Touch trigger — keeps updated_at fresh on key rotation.
CREATE OR REPLACE FUNCTION ratchet_pre_keys_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ratchet_pre_keys_touch ON ratchet_pre_keys;
CREATE TRIGGER ratchet_pre_keys_touch
  BEFORE UPDATE ON ratchet_pre_keys
  FOR EACH ROW EXECUTE FUNCTION ratchet_pre_keys_touch();
