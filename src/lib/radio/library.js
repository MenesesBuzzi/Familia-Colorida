// Rádio Amigo v3: Biblioteca de MP3, fila com votos, controle do dono e walkie-talkie (Supabase).
import { createAudioPlayer } from 'expo-audio';
import { supabase } from '../supabase';
import { publicUrl, removeFile, uploadFile } from '../audio/files';
import { pickFallbackTrack, pickNext, rankQueue, safeFileName } from './queue';

export const RADIO_BUCKET = 'radio';
export const VOICE_BUCKET = 'voz';

function check({ data, error }) {
  if (error) throw error;
  return data;
}

// ------------------------------------------------------------------ Biblioteca
export async function listLibrary() {
  return check(await supabase.from('radio_library').select('*').order('created_at', { ascending: false }).limit(1000)) || [];
}

export function trackUrl(path) {
  return publicUrl(RADIO_BUCKET, path);
}

/** Descobre a duração do MP3 (segundos) abrindo um player rapidinho. null se não conseguir em 5 s. */
export function probeDuration(uri, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let player = null;
    let sub = null;
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      try {
        sub?.remove();
        player?.remove();
      } catch {
        // ignora
      }
      resolve(v);
    };
    try {
      player = createAudioPlayer({ uri }, { updateInterval: 250 });
      sub = player.addListener('playbackStatusUpdate', (s) => {
        if (s?.isLoaded && s.duration > 0) finish(s.duration);
      });
      if (player.isLoaded && player.duration > 0) finish(player.duration);
    } catch {
      finish(null);
    }
    setTimeout(() => finish(null), timeoutMs);
  });
}

/**
 * Envia um MP3 para a Biblioteca (bucket "radio" + tabela radio_library).
 * file = { uri, name, size, mimeType } do expo-document-picker.
 */
export async function uploadTrack({ file, title, artist, userId, nickname }) {
  const path = `${userId}/${Date.now()}-${safeFileName(title || file.name, 'mp3')}`;
  const duration = await probeDuration(file.uri).catch(() => null);
  await uploadFile(RADIO_BUCKET, path, file.uri, 'audio/mpeg');
  try {
    return check(
      await supabase
        .from('radio_library')
        .insert({
          title: String(title || 'Música').trim().slice(0, 120),
          artist: String(artist || '').trim().slice(0, 120) || null,
          uploader_id: userId,
          uploader_name: nickname || null,
          duration_sec: duration,
          size_bytes: file.size || null,
          storage_path: path,
        })
        .select()
        .single()
    );
  } catch (e) {
    await removeFile(RADIO_BUCKET, path);
    throw e;
  }
}

export async function deleteTrack(track) {
  check(await supabase.from('radio_library').delete().eq('id', track.id));
  await removeFile(RADIO_BUCKET, track.storage_path);
}

// ------------------------------------------------------------------ Fila da rádio
/** Fila + votos + últimas falas do walkie-talkie. */
export async function loadLive(roomId) {
  const [queue, votes, voice] = await Promise.all([
    supabase
      .from('radio_queue')
      .select('*, track:radio_library(title, artist, duration_sec, storage_path)')
      .eq('room_id', roomId)
      .order('created_at'),
    supabase.from('radio_queue_votes').select('queue_id,user_id,value').eq('room_id', roomId),
    supabase.from('radio_voice').select('*').eq('room_id', roomId).order('id', { ascending: false }).limit(8),
  ]);
  const q = (check(queue) || []).map(({ track, ...row }) => ({
    ...row,
    title: track?.title ?? 'Música removida',
    artist: track?.artist ?? '',
    duration_sec: track?.duration_sec ?? null,
    storage_path: track?.storage_path ?? null,
  }));
  return { queue: q, votes: check(votes) || [], voice: check(voice) || [] };
}

/** Coloca na fila. Devolve o id ou null se a música já estava na fila. */
export async function addToQueue(roomId, trackId) {
  return check(await supabase.rpc('add_radio_queue', { p_room: roomId, p_track: trackId }));
}

export async function removeFromQueue(queueId) {
  check(await supabase.from('radio_queue').delete().eq('id', queueId));
}

/** value: 1 (👍), -1 (👎) ou 0 (retira o voto). */
export async function voteQueue(roomId, queueId, userId, value) {
  check(
    await supabase
      .from('radio_queue_votes')
      .upsert(
        { queue_id: queueId, room_id: roomId, user_id: userId, value, updated_at: new Date().toISOString() },
        { onConflict: 'queue_id,user_id' }
      )
  );
}

// ------------------------------------------------------------------ Controle (só o dono)
export async function radioControl(roomId, action, { offset = 0, queueId = null, trackId = null } = {}) {
  check(
    await supabase.rpc('radio_control', {
      p_room: roomId,
      p_action: action,
      p_offset: offset,
      p_queue: queueId,
      p_track: trackId,
    })
  );
}

/**
 * Pula para a próxima: a mais votada da fila; fila vazia -> uma música aleatória da Biblioteca;
 * Biblioteca vazia -> para. Devolve o que vai tocar (ou null).
 */
export async function advanceRadio(room) {
  const live = await loadLive(room.id);
  const next = pickNext(rankQueue(live.queue, live.votes));
  if (next) {
    await radioControl(room.id, 'queue', { queueId: next.id });
    return next;
  }
  const lib = await listLibrary();
  const pick = pickFallbackTrack(lib, [room.now_track_id, ...(room.recent_tracks || [])].filter(Boolean));
  if (pick) {
    await radioControl(room.id, 'track', { trackId: pick.id });
    return pick;
  }
  await radioControl(room.id, 'stop');
  return null;
}

export async function saveDuration(trackId, sec) {
  if (!trackId || !(sec > 0)) return;
  await supabase.rpc('set_radio_duration', { p_track: trackId, p_sec: sec });
}

// ------------------------------------------------------------------ Walkie-talkie
export async function setMic(roomId, userId, on) {
  check(await supabase.rpc('set_radio_mic', { p_room: roomId, p_user: userId, p_on: on }));
}

/** Envia uma fala gravada (m4a) para a rádio: Storage "voz" + linha em radio_voice (realtime avisa todos). */
export async function sendVoice({ roomId, userId, nickname, uri, durationMs }) {
  const path = `${userId}/radio/${roomId}/${Date.now()}.m4a`;
  await uploadFile(VOICE_BUCKET, path, uri, 'audio/mp4');
  try {
    check(
      await supabase.from('radio_voice').insert({
        room_id: roomId,
        user_id: userId,
        nickname: String(nickname || 'Jogador').slice(0, 30),
        storage_path: path,
        duration_ms: Math.min(120000, Math.round(durationMs || 0)),
      })
    );
  } catch (e) {
    await removeFile(VOICE_BUCKET, path);
    throw e;
  }
}
