// contactsSync.js — bidirectional sync between AsyncStorage and Supabase contacts table
// AsyncStorage is always written first (instant) then Supabase syncs in background.
// On load: AsyncStorage first (fast), Supabase merges on top (fresh).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const LOCAL_KEY = 'vaultchat_contacts';

// ── Get owner_id (Supabase user id or local phone-derived id) ─
async function getOwnerId() {
  // Only return a real Supabase UUID — phone-derived IDs can't be stored in uuid column
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) return data.user.id;
  } catch {}
  // Fallback: check stored user id (may be a real uuid from prior auth)
  try {
    const raw = await AsyncStorage.getItem('vaultchat_user');
    if (raw) {
      const u = JSON.parse(raw);
      // Only use if it looks like a UUID (8-4-4-4-12 hex format)
      if (u.id && /^[0-9a-f-]{36}$/.test(u.id)) return u.id;
    }
  } catch {}
  return null; // no valid UUID — Supabase sync skipped, AsyncStorage still works
}

// ── Load contacts ─────────────────────────────────────────────
// Returns AsyncStorage list immediately; Supabase merge happens async.
export async function loadContacts() {
  const raw   = await AsyncStorage.getItem(LOCAL_KEY).catch(() => null);
  const local = raw ? JSON.parse(raw) : [];
  // Kick off Supabase sync in background — don't await
  syncFromSupabase().catch(() => {});
  return local;
}

// ── Sync from Supabase → merge into AsyncStorage ──────────────
export async function syncFromSupabase() {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return;
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('owner_id', ownerId);
    if (error || !data) return;

    const raw   = await AsyncStorage.getItem(LOCAL_KEY).catch(() => null);
    const local = raw ? JSON.parse(raw) : [];

    // Merge: Supabase wins for matching contacts, keep local-only entries
    const merged = [...local];
    data.forEach(remote => {
      const idx = merged.findIndex(
        l => l.id === remote.id || (l.phone && l.phone === remote.phone)
      );
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], ...remote };
      } else {
        merged.push(remote);
      }
    });
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(merged)).catch(() => {});
    return merged;
  } catch {}
}

// ── Save a single contact ─────────────────────────────────────
export async function saveContact(contact) {
  // 1. Save locally first (instant)
  const raw   = await AsyncStorage.getItem(LOCAL_KEY).catch(() => null);
  const list  = raw ? JSON.parse(raw) : [];
  const idx   = list.findIndex(c => c.id === contact.id || (c.phone && c.phone === contact.phone));
  const record = { ...contact, id: contact.id || `contact_${Date.now()}`, updated_at: new Date().toISOString() };

  if (idx >= 0) list[idx] = record;
  else list.push(record);
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(list)).catch(() => {});

  // 2. Sync to Supabase in background
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return record;
    const payload = {
      id:         record.id,
      owner_id:   ownerId,
      first_name: record.firstName || record.name?.split(' ')[0] || '',
      last_name:  record.lastName  || record.name?.split(' ').slice(1).join(' ') || '',
      phone:      record.phone     || record.mobile || '',
      email:      record.email     || '',
      address:    record.address   || '',
      birthday:   record.birthday  || '',
      url:        record.url       || '',
      notes:      record.notes     || '',
      photo_url:  record.photo     || null,
      updated_at: record.updated_at,
    };
    await supabase.from('contacts').upsert(payload, { onConflict: 'id' });
  } catch {}

  return record;
}

// ── Delete a contact ──────────────────────────────────────────
export async function deleteContact(contactId, phone) {
  // Delete locally
  const raw  = await AsyncStorage.getItem(LOCAL_KEY).catch(() => null);
  const list = raw ? JSON.parse(raw) : [];
  const next = list.filter(c => c.id !== contactId && c.phone !== phone);
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(next)).catch(() => {});

  // Delete from Supabase
  try {
    if (contactId) await supabase.from('contacts').delete().eq('id', contactId);
  } catch {}

  return next;
}

// ── SQL to create the contacts table in Supabase ──────────────
// Run this in Supabase SQL Editor:
export const CONTACTS_TABLE_SQL = `
-- VaultChat contacts table
-- Run in Supabase Dashboard → SQL Editor

create table if not exists contacts (
  id          text primary key,
  owner_id    uuid not null,
  first_name  text default '',
  last_name   text default '',
  phone       text default '',
  email       text default '',
  address     text default '',
  birthday    text default '',
  url         text default '',
  notes       text default '',
  photo_url   text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Index for fast owner lookups
create index if not exists contacts_owner_idx on contacts (owner_id);

-- Row-level security: each user sees only their contacts
alter table contacts enable row level security;

create policy "Users see own contacts"
  on contacts for all
  using (owner_id = auth.uid());
`;
