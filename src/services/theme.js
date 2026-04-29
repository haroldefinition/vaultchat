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

  // Color strategy (2026-04-29 refresh — premium gets a dedicated light
  // variant, NOT a darker dark mode):
  //
  //  - FREE + DARK   → near-black canvases + violet accent
  //  - FREE + LIGHT  → bright white canvases + Fiji blue accent (clean / tropical)
  //  - PREMIUM       → ALWAYS uses the light/white layout with PURPLE accents
  //                    (deep purple gradient header, pure white message rows,
  //                     navy-ink primary text). The `lightMode` toggle is
  //                     ignored for premium users — premium is its own
  //                     branded look that signals paid status visually.
  //
  // The `accent` token drives outgoing chat bubbles, tab-bar highlights,
  // avatar fallback backgrounds, unread badges, the shield mark next to the
  // app name, and the glowing ring around call avatars — so one value
  // ripples through the whole UI.
  //
  // `premiumLight` is the new "always-on" premium look. `premiumDark` is
  // kept around for screens that haven't been retrofitted yet, but new
  // screens should branch on `isPremium` and use the premiumLight palette.
  const premiumLight = isPremium;
  const useWhiteCanvas = lightMode || premiumLight;

  const theme = {
    lightMode,
    toggleLight,
    isPremium,

    // Canvases — premium ALWAYS gets the white/light surfaces, regardless
    // of lightMode toggle. Free dark users keep the dark palette.
    bg:         useWhiteCanvas ? (premiumLight ? '#ffffff' : '#f6faff') : '#0a0a0f',
    card:       useWhiteCanvas ? '#ffffff' : '#17171f',
    sectionBg:  useWhiteCanvas ? (premiumLight ? '#ffffff' : '#eaf3ff') : '#0a0a0f',

    // Text — premium uses the same navy ink as light mode for max contrast
    tx:         useWhiteCanvas ? '#0b2545' : '#ffffff',
    sub:        useWhiteCanvas ? '#5b7793' : '#9296a0',

    // Lines & fills — softer borders for premium so the white cards feel
    // light and airy, not like they have heavy outlines.
    border:     premiumLight ? '#ece6f7' : (lightMode ? '#d4e4f5' : '#23232d'),
    inputBg:    premiumLight ? '#f5f0fc' : (lightMode ? '#eaf3ff' : '#1c1c26'),

    // Accent — brand color
    //   Free + Light  → Fiji blue
    //   Free + Dark   → Violet-500
    //   PREMIUM       → Royal purple (regardless of lightMode toggle —
    //                   premium IS the purple brand)
    accent:     premiumLight
                  ? '#7C3AED'
                  : (lightMode ? '#0EA5E9' : '#8B5CF6'),

    // Chat bubble colors — split from accent so we can tune contrast later
    bubbleOut:  premiumLight ? '#7C3AED' : (lightMode ? '#0EA5E9' : '#8B5CF6'),
    bubbleIn:   useWhiteCanvas ? '#f3f0fa' : '#20202b',
    bubbleOutTx:'#ffffff',
    bubbleInTx: useWhiteCanvas ? '#0b2545' : '#ffffff',

    // ── Premium polish tokens ──────────────────────────────
    // "gold" is a misnomer kept for backwards-compat with screens
    // that already read this token (Vault hero ring, verified shield,
    // crown highlights, "Premium Member" tags). For premium users we
    // route this to the SAME royal purple as `accent` — Harold's
    // direction was "the purple feels more premium" so we kill the
    // yellow/gold accent across the premium UI.
    gold:       isPremium ? '#7C3AED' : (lightMode ? '#0EA5E9' : '#8B5CF6'),

    // Subtle gradient tuple for hero cards. [start, end].
    // Premium → deep purple gradient like the screenshot header band.
    // Free dark → flat single color, free light → soft blue gradient.
    gradientBg: premiumLight
                  ? ['#5B2FB8', '#7C3AED']
                  : (lightMode ? ['#ffffff', '#eaf3ff'] : ['#17171f', '#0a0a0f']),
  };

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
