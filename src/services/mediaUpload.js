import { supabase } from './supabase';

export async function uploadMedia(uri, type) {
  try {
    const filename = `${Date.now()}_${uri.split('/').pop()}`;
    const folder = type === 'video' ? 'videos' : type === 'file' ? 'files' : 'images';
    const path = `${folder}/${filename}`;

    const response = await fetch(uri);
    const blob = await response.blob();

    const ext = uri.split('.').pop()?.toLowerCase().split('?')[0] || 'jpg';
    const contentType = type === 'video'
      ? (ext === 'mov' ? 'video/quicktime' : 'video/mp4')
      : type === 'file'
        ? 'application/octet-stream'
        : (['png','gif','webp'].includes(ext) ? `image/${ext}` : 'image/jpeg');

    const { data, error } = await supabase.storage
      .from('vaultchat-media')
      .upload(path, blob, { contentType, upsert: false });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('vaultchat-media')
      .getPublicUrl(path);


    return urlData.publicUrl;
  } catch (e) {
    if (__DEV__) console.warn('uploadMedia error:', e?.message || e);
    return null;
  }
}
