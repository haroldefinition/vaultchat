import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [lightMode, setLightMode] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('vaultchat_light_mode').then(val => {
      if (val) setLightMode(JSON.parse(val));
    });
  }, []);

  async function toggleLight(val) {
    setLightMode(val);
    await AsyncStorage.setItem('vaultchat_light_mode', JSON.stringify(val));
  }

  // Color strategy (2026-04 refresh to match premium mockups):
  //  - DARK MODE  → near-black canvases + violet accent (premium / "vault" feel)
  //  - LIGHT MODE → bright white canvases + Fiji blue accent (clean / tropical)
  //
  // The `accent` token drives outgoing chat bubbles, tab-bar highlights,
  // avatar fallback backgrounds, unread badges, the shield mark next to the
  // app name, and the glowing ring around call avatars — so one value
  // ripples through the whole UI.
  const theme = {
    lightMode,
    toggleLight,

    // Canvases
    bg:         lightMode ? '#f6faff' : '#0a0a0f', // page background
    card:       lightMode ? '#ffffff' : '#17171f', // chat rows, modals, surfaces
    sectionBg:  lightMode ? '#eaf3ff' : '#0a0a0f', // behind section groups in Settings

    // Text
    tx:         lightMode ? '#0b2545' : '#ffffff', // primary text
    sub:        lightMode ? '#5b7793' : '#9296a0', // secondary/muted text

    // Lines & fills
    border:     lightMode ? '#d4e4f5' : '#23232d', // hairlines, dividers
    inputBg:    lightMode ? '#eaf3ff' : '#1c1c26', // text fields, filter chips, keypad keys

    // Accent — brand color (changes the whole app's vibe)
    accent:     lightMode ? '#0EA5E9' : '#8B5CF6', // Fiji blue / Violet-500

    // Chat bubble colors — split from accent so we can tune contrast later
    bubbleOut:  lightMode ? '#0EA5E9' : '#8B5CF6', // outgoing (mine)
    bubbleIn:   lightMode ? '#f0f4f9' : '#20202b', // incoming (theirs)
    bubbleOutTx:'#ffffff',                         // text on outgoing bubbles
    bubbleInTx: lightMode ? '#0b2545' : '#ffffff', // text on incoming bubbles
  };

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
