// ============================================================
//  PremiumCrown — small 👑 indicator next to a user's name
//
//  Renders the crown only when the user is a premium subscriber.
//  Designed to sit inline with display-name text in chat rows,
//  contact rows, chat headers, group member lists, etc.
//
//  Usage:
//    <PremiumCrown userId={item.userId} />        // async lookup
//    <PremiumCrown isPremium={true} />            // explicit
//    <PremiumCrown isMe />                        // current user
//
//  Sizing matches the surrounding text by default; override with
//  size prop for headers / large displays.
// ============================================================

import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { isUserPremium, isUserPremiumByPhone } from '../services/premiumStatus';
import { isPremiumUser as isMeLocallyPremium } from '../services/adsService';

export default function PremiumCrown({ userId, phone, isPremium, isMe, size = 13, style }) {
  const [resolved, setResolved] = useState(isPremium);

  useEffect(() => {
    let cancelled = false;
    if (typeof isPremium === 'boolean') {
      setResolved(isPremium);
      return;
    }
    if (isMe) {
      isMeLocallyPremium().then(v => { if (!cancelled) setResolved(!!v); });
      return;
    }
    if (userId) {
      isUserPremium(userId).then(v => { if (!cancelled) setResolved(!!v); });
    } else if (phone) {
      isUserPremiumByPhone(phone).then(v => { if (!cancelled) setResolved(!!v); });
    }
    return () => { cancelled = true; };
  }, [userId, phone, isPremium, isMe]);

  if (!resolved) return null;

  // The crown emoji renders consistently across iOS and Android.
  // We give it a small marginLeft so it tucks in next to the name
  // without ever overlapping. The accessibilityLabel makes the
  // VoiceOver announcement informative for screen-reader users.
  return (
    <Text
      style={[{ fontSize: size, marginLeft: 4 }, style]}
      accessibilityLabel="Premium subscriber">
      👑
    </Text>
  );
}
