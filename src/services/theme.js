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

  const theme = {
    lightMode,
    toggleLight,
    bg:        lightMode ? '#f0f8ff' : '#080b12',
    card:      lightMode ? '#ffffff' : '#0e1220',
    tx:        lightMode ? '#003580' : '#ffffff',
    sub:       lightMode ? '#4a90d9' : '#888888',
    border:    lightMode ? '#d0e8ff' : '#1a2035',
    inputBg:   lightMode ? '#e8f4ff' : '#141828',
    // Fiji teal — tropical blue-green, bright and vibrant
    accent:    lightMode ? '#0079bf' : '#00C2A8',
    sectionBg: lightMode ? '#ddeeff' : '#080b12',
  };

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
