-- ============================================================
--  Multi-device E2E keys (Phase MM)
--  Each user can have multiple devices. Each device generates its
--  own NaCl box keypair on first launch and publishes its public
--  key here. Senders look up ALL of a recipient's devices and
--  encrypt the message N times — once per recipient device — so
--  every device can decrypt with its own private key.
--
--  We deliberately do NOT delete profiles.public_key — it stays
--  as the "primary device" backstop so old clients (pre-Phase MM)
--  can keep sending to a user via the legacy single-recipient
--  envelope until they upgrade. The new client always prefers
--  user_device_keys when present.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_device_keys (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id   TEXT         NOT NULL,
  device_label TEXT,
  public_key  TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_device_keys_unique UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS user_device_keys_user_idx
  ON user_device_keys (user_id, last_seen_at DESC);

-- ── Row-Level Security ───────────────────────────────────────
ALTER TABLE user_device_keys ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can READ device keys (you need to look up
-- a recipient's keys to encrypt to them — same disclosure model
-- as profiles.public_key today).
DROP POLICY IF EXISTS user_device_keys_select_all ON user_device_keys;
CREATE POLICY user_device_keys_select_all
  ON user_device_keys FOR SELECT
  TO authenticated
  USING (true);

-- Users can only INSERT/UPDATE/DELETE their own device entries.
-- The (auth.uid() = user_id) check makes it impossible for a user
-- to publish a key under someone else's user_id.
DROP POLICY IF EXISTS user_device_keys_insert_own ON user_device_keys;
CREATE POLICY user_device_keys_insert_own
  ON user_device_keys FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_device_keys_update_own ON user_device_keys;
CREATE POLICY user_device_keys_update_own
  ON user_device_keys FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_device_keys_delete_own ON user_device_keys;
CREATE POLICY user_device_keys_delete_own
  ON user_device_keys FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ── Touch trigger ────────────────────────────────────────────
-- Keep updated_at fresh on every UPDATE so the client can sort
-- a user's devices by recency in any future device-mgmt UI.
CREATE OR REPLACE FUNCTION user_device_keys_touch_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_device_keys_touch_updated ON user_device_keys;
CREATE TRIGGER user_device_keys_touch_updated
  BEFORE UPDATE ON user_device_keys
  FOR EACH ROW EXECUTE FUNCTION user_device_keys_touch_updated();

-- ── publish_device_key RPC ───────────────────────────────────
-- SECURITY DEFINER fallback for clients without an active auth
-- session (e.g. legacy /register flow). Validates the caller's
-- phone matches their profile so an attacker can't spoof another
-- user's device_id.
CREATE OR REPLACE FUNCTION publish_device_key(
  p_user_id     UUID,
  p_phone       TEXT,
  p_device_id   TEXT,
  p_device_label TEXT,
  p_public_key  TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone TEXT;
BEGIN
  SELECT phone INTO v_phone FROM profiles WHERE id = p_user_id;
  IF v_phone IS NULL OR v_phone <> p_phone THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_mismatch');
  END IF;

  INSERT INTO user_device_keys (user_id, device_id, device_label, public_key)
  VALUES (p_user_id, p_device_id, p_device_label, p_public_key)
  ON CONFLICT (user_id, device_id) DO UPDATE
    SET public_key   = EXCLUDED.public_key,
        device_label = COALESCE(EXCLUDED.device_label, user_device_keys.device_label),
        last_seen_at = NOW();

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION publish_device_key(UUID, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated;
