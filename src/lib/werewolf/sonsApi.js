// Sons enviados para a trilha do Lobisomem (bucket "lobo-sons" + tabela lobo_sons).
import { supabase } from '../supabase';
import { removeFile, uploadFile } from '../audio/files';
import { safeFileName } from '../radio/queue';

const BUCKET = 'lobo-sons';
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav' };

export async function listLoboSons() {
  const { data, error } = await supabase.from('lobo_sons').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  return data || [];
}

/** Confere o arquivo escolhido. Devolve { ext, type } ou lança erro amigável. */
export function checkSoundFile(file) {
  const ext = (/\.([a-z0-9]{2,4})$/i.exec(String(file?.name || ''))?.[1] || '').toLowerCase();
  if (!TYPES[ext]) throw new Error('Use um arquivo .mp3, .m4a ou .wav');
  if (Number(file?.size) > MAX_BYTES) throw new Error('Som grande demais (máximo 5 MB).');
  return { ext, type: TYPES[ext] };
}

export async function uploadLoboSom({ file, title, userId, nickname }) {
  const { ext, type } = checkSoundFile(file);
  const name = String(title || file.name || 'som').replace(/\.[a-z0-9]{2,4}$/i, '').trim().slice(0, 80) || 'Som';
  const path = `${userId}/${Date.now()}-${safeFileName(name, ext)}`;
  await uploadFile(BUCKET, path, file.uri, type);
  const { data, error } = await supabase
    .from('lobo_sons')
    .insert({ title: name, uploader_id: userId, uploader_name: nickname || null, storage_path: path })
    .select()
    .single();
  if (error) {
    await removeFile(BUCKET, path);
    throw error;
  }
  return data;
}
