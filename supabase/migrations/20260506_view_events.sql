-- ============================================================
--  20260506 — view_events table for View-Once v2 (1.0.18+)
--
--  Each row records one view of a view-once / replay-allowed
--  message by its recipient. The sender's client subscribes to
--  inserts on this table (filtered to messages they sent) so
--  Sentry / in-app toast can show "your photo was viewed".
--
--  On the recipient's FINAL view (view_number = viewLimit),
--  is_final = true is set. The consume-vonce-view edge function
--  is also invoked at that point and deletes the underlying
--  Supabase Storage object — closing the URL-exfiltration gap
--  noted in the v1 ViewOncePhoto component header.
--
--  This table is APPEND-ONLY in normal operation — no client
--  needs UPDATE or DELETE. RLS reflects that.
-- ============================================================

create table if not exists public.view_events (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null,
  viewer_id       uuid not null,
  view_number     int  not null check (view_number >= 1 and view_number <= 100),
  is_final        boolean not null default false,
  viewed_at       timestamptz not null default now()
);

-- Index for the sender's realtime subscription path: filter rows
-- to those whose underlying message was sent by the current user.
-- Realtime uses postgres_changes which respects RLS, but the
-- index helps the RLS policy's join run cheaply.
create index if not exists view_events_message_id_idx
  on public.view_events (message_id, viewed_at desc);

-- Idempotency: never record the same (message, viewer, view#) pair
-- twice. If the client retries after a network blip, we want a
-- no-op, not a duplicate notification on the sender side.
create unique index if not exists view_events_unique
  on public.view_events (message_id, viewer_id, view_number);

alter table public.view_events enable row level security;

-- INSERT: the recipient (who is viewing) records their own view.
-- Required: viewer_id = auth.uid() (so a malicious client can't
-- forge views from other users). Required: caller is a member of
-- the room the message belongs to (otherwise random users could
-- spam fake views to enumerate which message_ids exist).
drop policy if exists "view_events_insert_recipient" on public.view_events;
create policy "view_events_insert_recipient"
  on public.view_events
  for insert
  to authenticated
  with check (
    viewer_id = auth.uid()
    and exists (
      select 1
      from public.messages m
      join public.rooms r on r.id::text = m.room_id::text
      where m.id = view_events.message_id
        and auth.uid() = any(r.member_ids)
    )
  );

-- SELECT: only the SENDER of the underlying message can see who
-- viewed their content. This is what powers the realtime "your
-- message was viewed" toast.
drop policy if exists "view_events_select_sender" on public.view_events;
create policy "view_events_select_sender"
  on public.view_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = view_events.message_id
        and m.sender_id::text = auth.uid()::text
    )
  );

-- No UPDATE / DELETE policies. Append-only table; admins use
-- service-role to clean up if needed.
