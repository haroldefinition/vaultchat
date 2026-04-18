// mediaUpload.js — Upload media to Supabase Storage from React Native
// Uses expo-file-system to read files as base64, then decodes to Uint8Array.
// fetch().blob() is unreliable in React Native — this is the correct approach.
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';

/**
 * Upload a local file URI to Supabase Storage.
 * @param {string} uri   — local file:// URI from ImagePicker or DocumentPicker
 * @param {string} type  — 'image' | 'video' | 'file'
 * @returns {Promise<string|null>} public https:// URL or null on failure
 */
export async function uploadMedia(uri, type) {
  try {
    // Detect extension and content-type
    const rawExt     = uri.split('.').pop()?.toLowerCase().split('?')[0] || '';
    const ext        = rawExt || (type === 'video' ? 'mp4' : type === 'file' ? 'bin' : 'jpg');
    const folder     = type === 'video' ? 'videos' : type === 'file' ? 'files' : 'images';
    const filename   = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path       = `${folder}/${filename}`;

    const contentType = type === 'video'
      ? (ext === 'mov' ? 'video/quicktime' : 'video/mp4')
      : type === 'file'
        ? 'application/octet-stream'
        : (['png', 'gif', 'webp'].includes(ext) ? `image/${ext}` : 'image/jpeg');

    // Read file as base64 using expo-file-system (reliable in React Native)
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Decode base64 → Uint8Array for Supabase upload
    const byteChars = atob(base64);
    const bytes     = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      bytes[i] = byteChars.charCodeAt(i);
    }

    // Upload to Supabase Storage
    const { error } = await supabase.storage
      .from('vaultchat-media')
      .upload(path, bytes, { contentType, upsert: false });

    if (error) {
      if (__DEV__) console.warn('Supabase upload error:', error.message);
      return null;
    }

    // Return permanent public URL
    const { data: urlData } = supabase.storage
      .from('vaultchat-media')
      .getPublicUrl(path);

    return urlData?.publicUrl || null;
  } catch (e) {
    if (__DEV__) console.warn('uploadMedia error:', e?.message || e);
    return null;
  }
}
