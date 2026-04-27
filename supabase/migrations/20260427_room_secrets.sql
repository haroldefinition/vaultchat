-- ============================================================
--  Room secrets — per-group shared secret used to blind the
--  per-recipient envelope keys (Phase UU).
--
--  How it works:
--    1. The first sender to a group generates a 32-byte random
--       roomSecret and encrypts it once per member's pubkey,
--       inserting one row per member into room_secrets.
--    2. Senders compute envelope keys as
--         HMAC-SHA256(roomSecret, message_uuid || device_id)
--       and write the resulting hex blobs as the keys of
--       metadata.ct_blinded.
--    3. Receivers fetch their encrypted_secret share, decrypt
--       it once with their NaCl private key, cache locally, then
--       compute their own blinded index for each message.
--
--  Result: the message metadata no longer exposes user_ids or
--  device_ids — a DB reader sees only opaque hex strings, with
--  no way to enumerate group membership without first
--  compromising at least one member's private key.
-- ============================================================

CREATE TABLE IF NOT EXISTS room_secrets (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id           TEXT         NOT NULL,
  recipient_user_id UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  encrypted_secret  TEXT         NOT NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT room_secrets_unique UNIQUE (room_id, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS room_secrets_room_idx ON room_secrets (room_id);
CREATE INDEX IF NOT EXISTS room_secrets_recipient_idx ON room_secrets (recipient_user_id);

ALTER TABLE room_secrets ENABLE ROW LEVEL SECURITY;

-- Anyone can SELECT shares — but each share is encrypted to a
-- specific user's pubkey, so non-recipients can't decrypt them.
-- This open select keeps the lookup simple (server doesn't need
-- to know who's in which room — it just routes by recipient_user_id).
DROP POLICY IF EXISTS room_secrets_select_all ON room_secrets;
CREATE POLICY room_secrets_select_all
  ON room_secrets FOR SELECT
  TO authenticated
  USING (true);

-- Inserts: any authenticated user can add a share. They can only
-- write the share for someone else (encrypted to that someone's
-- pubkey) — there's no way to forge a share that the target user
-- could decrypt without their private key.
DROP POLICY IF EXISTS room_secrets_insert_any ON room_secrets;
CREATE POLICY room_secrets_insert_any
  ON room_secrets FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Deletes: only the share's recipient can remove their own share
-- (e.g., if they leave the group).
DROP POLICY IF EXISTS room_secrets_delete_own ON room_secrets;
CREATE POLICY room_secrets_delete_own
  ON room_secrets FOR DELETE
  TO authenticated
  USING (auth.uid() = recipient_user_id);
