import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://fakxhdwbyiarrnhyskoe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZha3hoZHdieWlhcnJuaHlza29lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MzU1ODksImV4cCI6MjA5MTExMTU4OX0.GzVnQJLZDGJXrO5HCkUbZjA8xyzBeudToLa7zfoYKuw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
