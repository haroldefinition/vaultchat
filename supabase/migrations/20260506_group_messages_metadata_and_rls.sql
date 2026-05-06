-- ============================================================
--  20260506 — group_messages metadata column + RLS policies
--
--  Discovered 2026-05-06 during paired-device verification
--  that group chat had been silently broken since 1.0.14:
--
--    1. group_messages had no `metadata` jsonb column, so the
--       client's INSERT (which writes per-recipient envelopes
--       under metadata.ct_for_devices / .ct_for_recipients /
--       .ct_blinded) failed with "column does not exist" —
--       swallowed by the optimistic-update code path.
--
--    2. group_messages had RLS enabled but ZERO policies, so
--       the default-deny RLS rejected every authenticated
--       INSERT and SELECT. Even if the column had existed,
--       no client could have written to or read from the
--       table.
--
--  Net effect: every group message INSERT failed silently for
--  the entire history of the app. Group chat appeared to work
--  in single-device demos via the optimistic-render path but
--  no message ever reached the server, so cross-device delivery
--  was 0%.
--
--  Fix:
--    - Add metadata jsonb column.
--    - Add 4 policies (SELECT/INSERT/UPDATE/DELETE) using the
--      same `auth.uid() = ANY(rooms.member_ids)` predicate as
--      the existing rooms_member policy. Cast rooms.id::text =
--      group_messages.group_id since rooms.id is uuid but
--      group_messages.group_id is text.
--
--  Applied to production via Supabase SQL Editor 2026-05-06.
--  This file is the canonical record so future deployments
--  reproduce the schema.
-- ============================================================

-- 1. Add the metadata jsonb column the client has been writing
--    since 1.0.14 (Phase MM rollout).
alter table public.group_messages
  add column if not exists metadata jsonb;

-- 2. RLS policies — assumes RLS is already enabled on the table
--    (it was, just with no policies; default-deny applied).
--    Use `if not exists` semantics by dropping any existing
--    policy with the same name before recreating; idempotent
--    re-runs land cleanly.

drop policy if exists "group_messages_select_member" on public.group_messages;
create policy "group_messages_select_member"
  on public.group_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.rooms r
      where r.id::text = group_messages.group_id
        and auth.uid() = any(r.member_ids)
    )
  );

drop policy if exists "group_messages_insert_member" on public.group_messages;
create policy "group_messages_insert_member"
  on public.group_messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()::text
    and exists (
      select 1 from public.rooms r
      where r.id::text = group_messages.group_id
        and auth.uid() = any(r.member_ids)
    )
  );

drop policy if exists "group_messages_update_sender" on public.group_messages;
create policy "group_messages_update_sender"
  on public.group_messages
  for update
  to authenticated
  using (sender_id = auth.uid()::text)
  with check (sender_id = auth.uid()::text);

drop policy if exists "group_messages_delete_sender" on public.group_messages;
create policy "group_messages_delete_sender"
  on public.group_messages
  for delete
  to authenticated
  using (sender_id = auth.uid()::text);
