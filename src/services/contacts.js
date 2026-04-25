import * as Contacts from 'expo-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const FRIENDS_KEY = 'vaultchat_friends';

export async function requestContactsPermission() {
  const { status } = await Contacts.requestPermissionsAsync();
  return status === 'granted';
}

// Normalize a raw phone string to E.164 (+1XXXXXXXXXX). Returns null
// if the input doesn't have enough digits to be a real phone number.
// Profiles.phone in Supabase is already stored in E.164, so matching is
// a direct equality check once both sides are normalized.
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('+')) {
    // Already E.164-ish — strip non-digits except the leading +
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return digits.length >= 7 ? `+${digits}` : null;
  }
  // US-only fallback for now (matches placeCall.normalizePhone). Strip
  // everything non-numeric and prepend +1. International handling will
  // need country-code detection later.
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10) return null;
  // If 11 digits and starts with 1, treat as already including country code
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+1${digits.slice(-10)}`;
}

export async function getPhoneContacts() {
  try {
    const { status } = await Contacts.getPermissionsAsync();
    if (status !== 'granted') return [];
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Image],
    });
    return data.filter(c => c.phoneNumbers?.length > 0).map(c => {
      const raw = c.phoneNumbers[0].number || '';
      return {
        id: c.id,
        name: c.name || 'Unknown',
        phone:    raw.replace(/\D/g, '').slice(-10),  // legacy 10-digit form (kept for back-compat with existing callers)
        phoneE164: normalizePhone(raw),                // E.164 form for matching against profiles.phone
        email: c.emails?.[0]?.email || '',
        image: c.imageAvailable ? c.image?.uri : null,
      };
    });
  } catch (e) {
    if (__DEV__) console.warn('Contacts error:', e);
    return [];
  }
}

export async function syncContacts() {
  const contacts = await getPhoneContacts();
  await AsyncStorage.setItem('vaultchat_phone_contacts', JSON.stringify(contacts));
  return contacts;
}

export async function getCachedContacts() {
  const saved = await AsyncStorage.getItem('vaultchat_phone_contacts');
  return saved ? JSON.parse(saved) : [];
}

// ── Match phone contacts against VaultChat profiles (task #66) ─────
//
// Sync the user's address book, normalize each phone to E.164, and ask
// Supabase which of those numbers belong to a VaultChat profile.
// Returns { friends, totalContacts } where `friends` is the list of
// matched profile rows enriched with the contact's local display name
// (so the UI can show "Mom" instead of just "@mom42") plus the canonical
// VaultChat identity (vault_handle, display_name, id).
//
// Privacy note: phone numbers are sent over TLS to OUR Supabase
// instance only. They never touch a third party. A future hardening
// step would hash each number client-side and have the server compare
// hashes — Signal's contact-discovery pattern — but for MVP the direct
// query is safe given (a) we control the server and (b) the user
// explicitly tapped "Find Friends" to opt into this lookup.
//
// Result is also cached to AsyncStorage under FRIENDS_KEY so other
// screens (e.g. a future "Friends" tab, or NewMessage suggestions) can
// read the list without re-running the sync every time.
export async function findFriendsOnVaultChat() {
  // 1. Pull contacts from device. Falls back to cached if permission
  //    was previously granted but the OS isn't returning new ones.
  let contacts = await getPhoneContacts();
  if (contacts.length === 0) contacts = await getCachedContacts();

  // 2. Collect unique normalized phone numbers. Drop the user's own
  //    number so we never "find" ourselves as a friend.
  let myPhone = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      const { data } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', session.user.id)
        .maybeSingle();
      myPhone = data?.phone || null;
    }
  } catch {}

  const phones = Array.from(new Set(
    contacts
      .map(c => c.phoneE164 || normalizePhone(c.phone))
      .filter(p => p && p !== myPhone)
  ));

  if (phones.length === 0) {
    await AsyncStorage.setItem(FRIENDS_KEY, JSON.stringify([]));
    return { friends: [], totalContacts: contacts.length };
  }

  // 3. Query in chunks. Supabase IN clauses can technically take
  //    thousands of values, but URL length limits start biting around
  //    300-500 phone-shaped strings — chunking at 200 keeps us well
  //    under the URL ceiling regardless of address-book size.
  const matched = [];
  const CHUNK = 200;
  for (let i = 0; i < phones.length; i += CHUNK) {
    const slice = phones.slice(i, i + CHUNK);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, vault_handle, display_name, phone')
        .in('phone', slice);
      if (!error && Array.isArray(data)) matched.push(...data);
    } catch {}
  }

  // 4. Enrich each matched profile with the contact's local name so
  //    the UI can show "Mom" instead of "@mom42". Map by phone for
  //    O(1) lookup during enrichment.
  const byPhone = new Map(contacts.map(c => [c.phoneE164 || normalizePhone(c.phone), c]));
  const friends = matched.map(p => {
    const local = byPhone.get(p.phone);
    return {
      id:           p.id,
      vault_handle: p.vault_handle,
      display_name: p.display_name,
      phone:        p.phone,
      contact_name: local?.name || null,
      contact_image: local?.image || null,
    };
  });

  await AsyncStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
  return { friends, totalContacts: contacts.length };
}

export async function getCachedFriends() {
  try {
    const saved = await AsyncStorage.getItem(FRIENDS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}
