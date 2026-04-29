// ============================================================
//  theme.js — VaultChat color tokens + premium polish
//
//  Two layers of variation:
//
//   1) Light mode vs. dark mode — toggled by the user from
//      Settings. Drives bg/card/text/border/accent.
//
//   2) Premium polish — when the local cached premium flag is
//      true, dark mode picks up a deeper purple accent, a warm
//      gold secondary (used for verified shields, crowns, and
//      "Premium Member" tags), and a subtle gradient backdrop
//      tuple (gradientBg) for hero cards.
//
//  Premium polish is *additive* — every existing token still
//  resolves to the same shape. Screens that opt into the polish
//  read the extra tokens (gold, gradientBg, isPremium) and skip
//  them otherwise. So free-mode UI never breaks.
//
//  Premium status is pulled from adsService.isPremiumUser() (the
//  local AsyncStorage flag) at mount, and re-checked on every
//  AppState foreground transition so an upgrade lights things up
//  without a full app restart.
// ============================================================

import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

// Lazy-loaded so theme.js doesn't grow a hard dep cycle. We just
// need the local cached boolean — no network call.
function readPremiumFlag() {
  try { return require('./adsService').isPremiumUser(); }
  catch { return Promise.resolve(false); }
}

// Subscribe to flag changes so the theme repaints the moment a
// purchase, restore, or sign-out flips premium — no waiting for the
// next AppState foreground transition.
function subscribePremium(cb) {
  try { return require('./adsService').subscribeToPremium(cb); }
  catch { return () => {}; }
}

export function ThemeProvider({ children }) {
  const [lightMode, setLightMode] = useState(false);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('vaultchat_light_mode').then(val => {
      if (val) setLightMode(JSON.parse(val));
    });
    readPremiumFlag().then(v => setIsPremium(!!v));

    // Re-check premium on foreground (covers external sources like a
    // Family Sharing update that happens while we're backgrounded).
    const appSub = AppState.addEventListener('change', state => {
      if (state === 'active') readPremiumFlag().then(v => setIsPremium(!!v));
    });

    // Subscribe to local premium-flag changes so a purchase or
    // restore that completes while the app is foregrounded flips
    // the polish instantly, with no AppState transition required.
    const unsub = subscribePremium(v => setIsPremium(!!v));

    return () => {
      try { appSub?.remove?.(); } catch {}
      try { unsub?.(); } catch {}
    };
  }, []);

  async function toggleLight(val) {
    setLightMode(val);
    await AsyncStorage.setItem('vaultchat_light_mode', JSON.stringify(val));
  }

  // Color strategy (2026-04-29 v2 — premium has BOTH light and dark
  // variants now; the lightMode toggle works for premium users too):
  //
  //  - FREE + DARK     → near-black canvas + violet accent
  //  - FREE + LIGHT    → bright white canvas + Fiji blue accent
  //  - PREMIUM + LIGHT → pure white canvas + royal purple (#7C3AED)
  //  - PREMIUM + DARK  → deep navy/black canvas + royal purple
  //                       (matches the dark-mode mockup — purple
  //                        accents on dark surfaces, white text)
  //
  // Premium signals its status with the PURPLE accent regardless of
  // light/dark mode. Free users get blue (light) or violet (dark).
  const premiumLight = isPremium && lightMode;
  const premiumDark  = isPremium && !lightMode;

  const theme = {
    lightMode,
    toggleLight,
    isPremium,

    // Canvases
    bg:         lightMode
                  ? (premiumLight ? '#ffffff' : '#f6faff')
                  : (premiumDark  ? '#0c0816' : '#0a0a0f'),
    card:       lightMode
                  ? '#ffffff'
                  : (premiumDark  ? '#1a1325' : '#17171f'),
    sectionBg:  lightMode
                  ? (premiumLight ? '#ffffff' : '#eaf3ff')
                  : (premiumDark  ? '#0c0816' : '#0a0a0f'),

    // Text — light mode uses navy ink, dark mode uses white
    tx:         lightMode ? '#0b2545' : '#ffffff',
    sub:        lightMode ? '#5b7793' : '#9296a0',

    // Lines & fills
    border:     lightMode
                  ? (premiumLight ? '#ece6f7' : '#d4e4f5')
                  : (premiumDark  ? '#2b1f3d' : '#23232d'),
    inputBg:    lightMode
                  ? (premiumLight ? '#f5f0fc' : '#eaf3ff')
                  : (premiumDark  ? '#1f1730' : '#1c1c26'),

    // Accent — brand color, ROYAL PURPLE for any premium variant
    accent:     isPremium
                  ? '#7C3AED'
                  : (lightMode ? '#0EA5E9' : '#8B5CF6'),

    // Chat bubble colors
    bubbleOut:  isPremium
                  ? '#7C3AED'
                  : (lightMode ? '#0EA5E9' : '#8B5CF6'),
    bubbleIn:   lightMode
                  ? '#f3f0fa'
                  : (premiumDark ? '#221833' : '#20202b'),
    bubbleOutTx:'#ffffff',
    bubbleInTx: lightMode ? '#0b2545' : '#ffffff',

    // ── Premium polish tokens ──────────────────────────────
    // `gold` token (kept for backwards-compat — Vault hero ring,
    // verified shield, crown highlights, "Premium Member" tags).
    // Per Harold: route to royal purple for ALL premium variants.
    gold:       isPremium
                  ? '#7C3AED'
                  : (lightMode ? '#0EA5E9' : '#8B5CF6'),

    // Subtle gradient tuple for hero cards. [start, end].
    gradientBg: premiumLight
                  ? ['#5B2FB8', '#7C3AED']
                  : premiumDark
                    ? ['#2B1856', '#0c0816']
                    : (lightMode ? ['#ffffff', '#eaf3ff'] : ['#17171f', '#0a0a0f']),
  };

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
