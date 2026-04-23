-- =====================================================================
--  2026-04-23 — Vault handle lookup + phone reassignment
--
--  Two changes in one migration (they're applied together in task #54):
--
--    1. Move phone +16092330963 from orphaned phone-auth account
--       `cf0fd701` onto the current email-signup account `c654d407`
--       (Harold's "love" profile), so phone-based lookup finds the
--       currently-logged-in identity.
--
--    2. Add `profiles.vault_handle` for @handle-based user discovery,
--       with a case-insensitive unique index. Backfill known handles
--       for the two active test accounts.
--
--  Applied live in Supabase via MCP on 2026-04-23; this file exists so
--  the migration is captured in git for replay on other environments.
-- =====================================================================

BEGIN;

-- 1. Reassign phone from ghost phone-auth profile to current love profile.
--    Order matters: clear the old row first to free the UNIQUE constraint
--    on profiles.phone before we try to set it on the new row.
UPDATE profiles
SET    phone = NULL
WHERE  id = 'cf0fd701-1a18-488c-b2cd-7fc38815a1cd';

UPDATE profiles
SET    phone = '+16092330963'
WHERE  id = 'c654d407-a4fe-4344-8d41-fa21e89dc1b5';

-- 2. Vault handle column + case-insensitive unique index.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS vault_handle text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_vault_handle_ci_unique
  ON profiles (lower(vault_handle))
  WHERE vault_handle IS NOT NULL;

-- 3. Backfill known handles for the active test accounts.
UPDATE profiles SET vault_handle = 'love6362' WHERE id = 'c654d407-a4fe-4344-8d41-fa21e89dc1b5';
UPDATE profiles SET vault_handle = 'hjero7'    WHERE id = 'd7d2aad4-01ce-4092-8f8a-438c7e459f3b';

COMMIT;
