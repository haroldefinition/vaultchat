-- ============================================================
--  Cross-device sync of pin / archive / folder assignment + folders
--  (Phase OO)
--
--  Two new tables:
--    user_chat_prefs  — per-user, per-room state (pinned/archived/folder)
--    user_folders     — per-user folder list (id, name, emoji, position)
--
--  Both have RLS so a user can only read/write their own rows.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_folders (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  emoji       TEXT,
  position    INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_folders_user_pos_idx ON user_folders (user_id, position);

ALTER TABLE user_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_folders_owner_all ON user_folders;
CREATE POLICY user_folders_owner_all
  ON user_folders FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS user_chat_prefs (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  room_id     TEXT         NOT NULL,
  pinned      BOOLEAN      NOT NULL DEFAULT FALSE,
  archived    BOOLEAN      NOT NULL DEFAULT FALSE,
  hide_alerts BOOLEAN      NOT NULL DEFAULT FALSE,
  marked_unread BOOLEAN    NOT NULL DEFAULT FALSE,
  folder_id   UUID         REFERENCES user_folders(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT user_chat_prefs_unique UNIQUE (user_id, room_id)
);
CREATE INDEX IF NOT EXISTS user_chat_prefs_user_updated_idx
  ON user_chat_prefs (user_id, updated_at DESC);

ALTER TABLE user_chat_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_chat_prefs_owner_all ON user_chat_prefs;
CREATE POLICY user_chat_prefs_owner_all
  ON user_chat_prefs FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Touch trigger keeps updated_at fresh on every UPDATE so the
-- client can sort by recency in any future "recent activity" UI.
CREATE OR REPLACE FUNCTION user_chat_prefs_touch_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_chat_prefs_touch_updated ON user_chat_prefs;
CREATE TRIGGER user_chat_prefs_touch_updated
  BEFORE UPDATE ON user_chat_prefs
  FOR EACH ROW EXECUTE FUNCTION user_chat_prefs_touch_updated();

DROP TRIGGER IF EXISTS user_folders_touch_updated ON user_folders;
CREATE TRIGGER user_folders_touch_updated
  BEFORE UPDATE ON user_folders
  FOR EACH ROW EXECUTE FUNCTION user_chat_prefs_touch_updated();
