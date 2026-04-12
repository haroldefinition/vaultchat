import * as Contacts from 'expo-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function requestContactsPermission() {
  const { status } = await Contacts.requestPermissionsAsync();
  return status === 'granted';
}

export async function getPhoneContacts() {
  try {
    const { status } = await Contacts.getPermissionsAsync();
    if (status !== 'granted') return [];
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Image],
    });
    return data.filter(c => c.phoneNumbers?.length > 0).map(c => ({
      id: c.id,
      name: c.name || 'Unknown',
      phone: c.phoneNumbers[0].number.replace(/\D/g, '').slice(-10),
      email: c.emails?.[0]?.email || '',
      image: c.imageAvailable ? c.image?.uri : null,
    }));
  } catch (e) {
    console.log('Contacts error:', e);
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
