// mediaUpload.js — Upload media to Supabase Storage from React Native
// Uses FileSystem.uploadAsync with BINARY_CONTENT (numeric 0) to avoid
// enum resolution issues across expo-file-system versions.
//
// NOTE: as of expo-file-system SDK 54, uploadAsync moved to the
// legacy submodule. The new File/Directory API doesn't expose
// streaming uploads yet — until it does, the legacy import is the
// supported path. Importing from 'expo-file-system' (without the
// /legacy suffix) throws a deprecation error at call time in SDK 54+.
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

const BUCKET       = 'vaultchat-media';
const SUPABASE_URL = 'https://fakxhdwbyiarrnhyskoe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZha3hoZHdieWlhcnJuaHlza29lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MzU1ODksImV4cCI6MjA5MTExMTU4OX0.GzVnQJLZDGJXrO5HCkUbZjA8xyzBeudToLa7zfoYKuw';

// FileSystemUploadType.BINARY_CONTENT = 0
// Using the numeric value directly avoids enum resolution issues
// across different expo-file-system versions.
const BINARY_CONTENT = 0;

/**
 * Upload a local file URI to Supabase Storage.
 * @param {string} uri   — local file:// URI from ImagePicker / DocumentPicker
 * @param {string} type  — 'image' | 'video' | 'file'
 * @returns {Promise<string|null>} permanent public https:// URL or null on failure
 */
export async function uploadMedia(uri, type) {
  try {
    const rawExt  = uri.split('.').pop()?.toLowerCase().split('?')[0] || '';
    const ext     = rawExt || (
      type === 'video' ? 'mp4' :
      type === 'voice' ? 'm4a' :
      type === 'file'  ? 'bin' : 'jpg'
    );
    const folder  = (
      type === 'video' ? 'videos' :
      type === 'voice' ? 'voice'  :
      type === 'file'  ? 'files'  : 'images'
    );
    const fname   = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path    = `${folder}/${fname}`;

    const mime = type === 'video'
      ? (ext === 'mov' ? 'video/quicktime' : 'video/mp4')
      : type === 'voice'
        ? (ext === 'caf' ? 'audio/x-caf' : ext === 'mp3' ? 'audio/mpeg' : 'audio/m4a')
        : type === 'file'
          ? 'application/octet-stream'
          : (['png', 'gif', 'webp'].includes(ext) ? `image/${ext}` : 'image/jpeg');

    // Get auth token — use session JWT if available, anon key as fallback
    let token = SUPABASE_ANON_KEY;
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) token = data.session.access_token;
    } catch {}

    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;

    // FileSystem.uploadAsync is the correct React Native upload method.
    // BINARY_CONTENT = 0 sends raw bytes without multipart encoding.
    const result = await FileSystem.uploadAsync(uploadUrl, uri, {
      httpMethod: 'POST',
      uploadType: BINARY_CONTENT,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': mime,
        'x-upsert': 'true',
      },
    });

    if (result.status !== 200 && result.status !== 201) {
      if (__DEV__) console.warn('[uploadMedia] FAIL', { type, ext, mime, path, status: result.status, body: (result.body || '').slice(0, 400) });
      return null;
    }
    if (__DEV__) console.log('[uploadMedia] OK', { type, path, status: result.status });

    // Construct public URL directly — no extra round-trip needed
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

  } catch (e) {
    if (__DEV__) console.warn('[uploadMedia] EXCEPTION', { type, message: e?.message || String(e) });
    return null;
  }
}
