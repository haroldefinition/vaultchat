import AsyncStorage from '@react-native-async-storage/async-storage';

const PREMIUM_KEY = 'vaultchat_premium';

// ── Premium-change pub/sub ─────────────────────────────────────
// Surfaces (theme.js, PremiumCrown isMe mode, header chips) need
// to react the *moment* a purchase completes — waiting for the
// next AppState foreground means the gold polish doesn't show up
// until the user backgrounds the app, which feels broken right
// after they tap Subscribe. Anything that flips the local premium
// flag (purchase success, restore, server sync, sign-out) calls
// `setPremiumUser(value)` which writes the key AND notifies every
// subscribed listener synchronously.
const _premiumListeners = new Set();
export function subscribeToPremium(cb) {
  _premiumListeners.add(cb);
  return () => _premiumListeners.delete(cb);
}
function _notifyPremium(value) {
  for (const cb of _premiumListeners) {
    try { cb(!!value); } catch {}
  }
}

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
  // Fan-out to every subscriber so theme polish, crowns, and any
  // other premium-aware surface re-render without waiting for an
  // AppState transition.
  _notifyPremium(!!value);
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
