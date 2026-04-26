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

  // Color strategy (2026-04 refresh to match premium mockups):
  //  - DARK MODE  → near-black canvases + violet accent (premium / "vault" feel)
  //  - LIGHT MODE → bright white canvases + Fiji blue accent (clean / tropical)
  //  - PREMIUM + DARK → deeper royal purple accent, warm gold secondary,
  //    and a subtle gradient backdrop tuple for hero surfaces.
  //
  // The `accent` token drives outgoing chat bubbles, tab-bar highlights,
  // avatar fallback backgrounds, unread badges, the shield mark next to the
  // app name, and the glowing ring around call avatars — so one value
  // ripples through the whole UI.
  const premiumDark = isPremium && !lightMode;

  const theme = {
    lightMode,
    toggleLight,
    isPremium,

    // Canvases
    bg:         lightMode ? '#f6faff' : (premiumDark ? '#0c0816' : '#0a0a0f'),
    card:       lightMode ? '#ffffff' : (premiumDark ? '#1a1325' : '#17171f'),
    sectionBg:  lightMode ? '#eaf3ff' : (premiumDark ? '#0c0816' : '#0a0a0f'),

    // Text
    tx:         lightMode ? '#0b2545' : '#ffffff',
    sub:        lightMode ? '#5b7793' : '#9296a0',

    // Lines & fills
    border:     lightMode ? '#d4e4f5' : (premiumDark ? '#2b1f3d' : '#23232d'),
    inputBg:    lightMode ? '#eaf3ff' : (premiumDark ? '#1f1730' : '#1c1c26'),

    // Accent — brand color (changes the whole app's vibe)
    //   Light  → Fiji blue
    //   Dark   → Violet-500
    //   Premium dark → richer royal purple
    accent:     lightMode
                  ? '#0EA5E9'
                  : (premiumDark ? '#A855F7' : '#8B5CF6'),

    // Chat bubble colors — split from accent so we can tune contrast later
    bubbleOut:  lightMode ? '#0EA5E9' : (premiumDark ? '#A855F7' : '#8B5CF6'),
    bubbleIn:   lightMode ? '#f0f4f9' : (premiumDark ? '#221833' : '#20202b'),
    bubbleOutTx:'#ffffff',
    bubbleInTx: lightMode ? '#0b2545' : '#ffffff',

    // ── Premium polish tokens ──────────────────────────────
    // Gold — used for the verified shield, the crown highlight,
    // "Premium Member" tags, and the Vault hero ring. Falls back
    // to accent for non-premium surfaces so screens that read
    // `gold` don't have to branch.
    gold:       premiumDark ? '#FFD166' : (isPremium ? '#B8860B' : (lightMode ? '#0EA5E9' : '#8B5CF6')),

    // Subtle gradient tuple for hero cards. [start, end].
    // Free + dark → flat single color; premium + dark → deep
    // purple → near-black so cards feel sunken-into-velvet.
    gradientBg: premiumDark
                  ? ['#2B1856', '#0c0816']
                  : (lightMode ? ['#ffffff', '#eaf3ff'] : ['#17171f', '#0a0a0f']),
  };

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
