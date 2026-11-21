// Rádio Amigo: chamadas ao Supabase (tabelas radio_* e RPCs do schema.sql).
import { supabase } from '../supabase';
import { cleanSuggestions, suggestionPayload } from './ranking';

const AI_TIMEOUT_MS = 20000;

function check({ data, error }) {
  if (error) throw error;
  return data;
}

/** Cria a rádio. Retorna { id, code }. */
export async function createRadio(name, nickname) {
  return check(await supabase.rpc('create_radio_room', { p_name: name, p_nickname: nickname }));
}

/** Entra pelo código. Retorna o id da rádio. */
export async function joinRadio(code, nickname) {
  return check(await supabase.rpc('join_radio_room', { p_code: code, p_nickname: nickname }));
}

/** Rádios de que participo (mais novas primeiro). */
export async function myRadios(userId) {
  const mem = check(await supabase.from('radio_members').select('room_id').eq('user_id', userId));
  const ids = (mem || []).map((m) => m.room_id);
  if (!ids.length) return [];
  const rooms = check(await supabase.from('radio_rooms').select('*').in('id', ids));
  return (rooms || []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

/** Tudo de uma rádio: { room, members, songs, votes }. */
export async function loadRadio(roomId) {
  const [room, members, songs, votes] = await Promise.all([
    supabase.from('radio_rooms').select('*').eq('id', roomId).maybeSingle(),
    supabase.from('radio_members').select('*').eq('room_id', roomId).order('joined_at'),
    supabase.from('radio_songs').select('*').eq('room_id', roomId).order('created_at'),
    supabase.from('radio_votes').select('song_id,user_id,value').eq('room_id', roomId),
  ]);
  return { room: check(room), members: check(members) || [], songs: check(songs) || [], votes: check(votes) || [] };
}

/** Adiciona música. Retorna o id, ou null se ela já estava na fila. */
export async function addSong(roomId, title, artist, source = 'membro', reason = null) {
  return check(
    await supabase.rpc('add_radio_song', {
      p_room: roomId,
      p_title: title,
      p_artist: artist,
      p_source: source,
      p_reason: reason,
    })
  );
}

export async function removeSong(songId) {
  check(await supabase.from('radio_songs').delete().eq('id', songId));
}

/** value: 1 (👍), -1 (👎) ou 0 (retira o voto). */
export async function vote(roomId, songId, userId, value) {
  check(
    await supabase
      .from('radio_votes')
      .upsert(
        { song_id: songId, room_id: roomId, user_id: userId, value, updated_at: new Date().toISOString() },
        { onConflict: 'song_id,user_id' }
      )
  );
}

export async function leaveRadio(roomId, userId) {
  check(await supabase.from('radio_members').delete().eq('room_id', roomId).eq('user_id', userId));
}

export async function deleteRadio(roomId) {
  check(await supabase.from('radio_rooms').delete().eq('id', roomId));
}

/**
 * Pede 5 sugestões à IA (Edge Function narrador, modo radio_sugestoes) e coloca na fila.
 * Retorna quantas entraram.
 */
export async function suggestWithAI(roomId, ranked) {
  const call = supabase.functions.invoke('narrador', { body: { mode: 'radio_sugestoes', data: suggestionPayload(ranked) } });
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('A IA demorou demais. Tente de novo.')), AI_TIMEOUT_MS));
  const { data, error } = await Promise.race([call, timeout]);
  if (error) throw error;
  if (data?.error && !(data.items || []).length) throw new Error(data.error);
  const items = cleanSuggestions(data?.items, ranked);
  if (!items.length) throw new Error('A IA não trouxe músicas novas desta vez.');
  let added = 0;
  for (const it of items) {
    try {
      const id = await addSong(roomId, it.title, it.artist, 'ia', it.reason || null);
      if (id) added += 1;
    } catch (e) {
      console.log('[radio] sugestão ignorada:', e?.message || e);
    }
  }
  return added;
}
