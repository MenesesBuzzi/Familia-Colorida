// Arquivos de áudio no Supabase Storage (buckets "radio", "voz" e "lobo-sons").
import { File } from 'expo-file-system';
import { supabase } from '../supabase';

/** Lê um arquivo local (file://, content://) como ArrayBuffer para enviar ao Storage. */
export async function readBytes(uri) {
  try {
    return await new File(uri).arrayBuffer();
  } catch (e) {
    console.log('[arquivo] File falhou, tentando fetch:', e?.message || e);
    const res = await fetch(uri);
    return await res.arrayBuffer();
  }
}

/** Envia um arquivo local para o bucket. path SEMPRE começa com o id do usuário (regra do Storage). */
export async function uploadFile(bucket, path, uri, contentType) {
  const body = await readBytes(uri);
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

export async function removeFile(bucket, path) {
  if (!path) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) console.log('[arquivo] não apagou', path, error.message);
}

/** Link público (buckets "radio" e "lobo-sons"). */
export function publicUrl(bucket, path) {
  if (!path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl || null;
}

const signedCache = new Map();

/** Link assinado (bucket privado "voz"), guardado por 50 min. */
export async function signedUrl(bucket, path) {
  if (!path) return null;
  const key = `${bucket}/${path}`;
  const hit = signedCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  signedCache.set(key, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}
