import AsyncStorage from '@react-native-async-storage/async-storage';

const PREMIUM_KEY = 'vaultchat_premium';

const SPONSORED_MESSAGES = [
  {
    id: 'ad_1',
    isAd: true,
    sponsor: 'Auxxilus Fitnesswear',
    text: '💪 Gear up in style. Shop performance activewear at auxxilus.com — use code VAULT10 for 10% off.',
    url: 'https://auxxilus.com',
  },
  {
    id: 'ad_2',
    isAd: true,
    sponsor: 'Sponsored',
    text: '🔒 VaultChat Premium — Remove ads, unlock priority features. Tap to upgrade.',
    url: null,
    isUpgradeAd: true,
  },
  {
    id: 'ad_3',
    isAd: true,
    sponsor: 'iO SKIN™',
    text: '✨ Skincare that works. Try iO SKIN™ — nature-powered formulas for every skin type. Learn more →',
    url: null,
  },
];

let adIndex = 0;

export const getNextAd = () => {
  const ad = SPONSORED_MESSAGES[adIndex % SPONSORED_MESSAGES.length];
  adIndex++;
  return { ...ad, id: `${ad.id}_${Date.now()}` };
};

export const isPremiumUser = async () => {
  try {
    const val = await AsyncStorage.getItem(PREMIUM_KEY);
    return val === 'true';
  } catch {
    return false;
  }
};

export const setPremiumUser = async (value) => {
  try {
    await AsyncStorage.setItem(PREMIUM_KEY, value ? 'true' : 'false');
  } catch {}
};

export const injectAds = (messages, isPremium, every = 8) => {
  if (isPremium || !messages.length) return messages;
  const result = [];
  messages.forEach((msg, i) => {
    result.push(msg);
    if ((i + 1) % every === 0) result.push(getNextAd());
  });
  return result;
};

export const injectChatListAds = (chats, isPremium, every = 5) => {
  if (isPremium || !chats.length) return chats;
  const result = [];
  chats.forEach((chat, i) => {
    result.push(chat);
    if ((i + 1) % every === 0) {
      result.push({
        id: `chatad_${i}`,
        isAd: true,
        sponsor: SPONSORED_MESSAGES[i % SPONSORED_MESSAGES.length].sponsor,
        text: SPONSORED_MESSAGES[i % SPONSORED_MESSAGES.length].text,
      });
    }
  });
  return result;
};
