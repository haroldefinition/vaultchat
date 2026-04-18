// mediaUpload.js — Upload media to Supabase Storage from React Native
// Uses expo-file-system uploadAsync which is the most reliable method
// for React Native. fetch().blob() and manual base64 decode are both
// unreliable across iOS/Android/Hermes combinations.
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';

const BUCKET    = 'vaultchat-media';
const SUPABASE_URL = 'https://fakxhdwbyiarrnhyskoe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZha3hoZHdieWlhcnJuaHlza29lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MzU1ODksImV4cCI6MjA5MTExMTU4OX0.GzVnQJLZDGJXrO5HCkUbZjA8xyzBeudToLa7zfoYKuw';

/**
 * Upload a local file URI to Supabase Storage.
 * @param {string} uri   — local file:// URI from ImagePicker / DocumentPicker
 * @param {string} type  — 'image' | 'video' | 'file'
 * @returns {Promise<string|null>} permanent public https:// URL or null on failure
 */
export async function uploadMedia(uri, type) {
  try {
    const rawExt    = uri.split('.').pop()?.toLowerCase().split('?')[0] || '';
    const ext       = rawExt || (type === 'video' ? 'mp4' : type === 'file' ? 'bin' : 'jpg');
    const folder    = type === 'video' ? 'videos' : type === 'file' ? 'files' : 'images';
    const filename  = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `${folder}/${filename}`;

    const mimeType  = type === 'video'
      ? (ext === 'mov' ? 'video/quicktime' : 'video/mp4')
      : type === 'file'
        ? 'application/octet-stream'
        : (['png', 'gif', 'webp'].includes(ext) ? `image/${ext}` : 'image/jpeg');

    // Get current auth token (may be null for anonymous users — that's ok,
    // the anon key allows uploads when the INSERT policy is set to true)
    let authHeader = `Bearer ${SUPABASE_ANON_KEY}`;
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        authHeader = `Bearer ${data.session.access_token}`;
      }
    } catch {}

    // Use FileSystem.uploadAsync — the most reliable upload method in React Native.
    // It handles binary data correctly without fetch().blob() or manual base64 decode.
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`;
    const result = await FileSystem.uploadAsync(uploadUrl, uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        'Authorization': authHeader,
        'Content-Type': mimeType,
        'x-upsert': 'true',
      },
    });

    if (result.status !== 200 && result.status !== 201) {
      if (__DEV__) console.warn('Upload failed:', result.status, result.body);
      return null;
    }

    // Return the permanent public URL
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
    return publicUrl;

  } catch (e) {
    if (__DEV__) console.warn('uploadMedia error:', e?.message || e);
    return null;
  }
}
