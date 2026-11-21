// App Chat (v3): chamadas ao Supabase (tabelas chat_* e RPCs do schema.sql).
import { supabase } from '../supabase';
import { removeFile, uploadFile } from '../audio/files';
import { cleanText } from './logic';

export const CHAT_VOICE_BUCKET = 'voz';

function check({ data, error }) {
  if (error) throw error;
  return data;
}

/** Minhas conversas (Família + salas + privadas) com prévia e "não lidas". */
export async function myChatRooms() {
  return check(await supabase.rpc('my_chat_rooms')) || [];
}

export async function createChatRoom(name, nickname) {
  return check(await supabase.rpc('create_chat_room', { p_name: name, p_nickname: nickname }));
}

export async function joinChatRoom(code, nickname) {
  return check(await supabase.rpc('join_chat_room', { p_code: code, p_nickname: nickname }));
}

/** Abre (ou cria) a conversa privada com outra pessoa. Retorna o id da sala. */
export async function openDM(otherId) {
  return check(await supabase.rpc('open_dm', { p_other: otherId }));
}

export async function loadRoom(roomId) {
  const [room, members] = await Promise.all([
    supabase.from('chat_rooms').select('*').eq('id', roomId).maybeSingle(),
    supabase.from('chat_members').select('*').eq('room_id', roomId).order('joined_at'),
  ]);
  return { room: check(room), members: check(members) || [] };
}

export async function loadMessages(roomId, limit = 120) {
  const rows = check(
    await supabase.from('chat_messages').select('*').eq('room_id', roomId).order('id', { ascending: false }).limit(limit)
  );
  return (rows || []).slice().reverse();
}

export async function sendText(roomId, { userId, nickname, avatarUrl }, text) {
  const body = cleanText(text);
  if (!body) return null;
  return check(
    await supabase
      .from('chat_messages')
      .insert({ room_id: roomId, user_id: userId, nickname: String(nickname || 'Jogador').slice(0, 30), avatar_url: avatarUrl || null, kind: 'texto', body })
      .select()
      .single()
  );
}

/** Mensagem de voz: sobe o m4a para o bucket "voz" e grava a mensagem. */
export async function sendVoiceMessage(roomId, { userId, nickname, avatarUrl }, { uri, durationMs }) {
  const path = `${userId}/chat/${roomId}/${Date.now()}.m4a`;
  await uploadFile(CHAT_VOICE_BUCKET, path, uri, 'audio/mp4');
  try {
    return check(
      await supabase
        .from('chat_messages')
        .insert({
          room_id: roomId,
          user_id: userId,
          nickname: String(nickname || 'Jogador').slice(0, 30),
          avatar_url: avatarUrl || null,
          kind: 'voz',
          body: '',
          audio_path: path,
          audio_ms: Math.min(300000, Math.round(durationMs || 0)),
        })
        .select()
        .single()
    );
  } catch (e) {
    await removeFile(CHAT_VOICE_BUCKET, path);
    throw e;
  }
}

export async function markRead(roomId, lastId) {
  if (!roomId || !lastId) return;
  await supabase.rpc('mark_chat_read', { p_room: roomId, p_last: lastId });
}

export async function leaveChatRoom(roomId, userId) {
  check(await supabase.from('chat_members').delete().eq('room_id', roomId).eq('user_id', userId));
}

export async function deleteChatRoom(roomId) {
  check(await supabase.from('chat_rooms').delete().eq('id', roomId));
}

/** Pessoas para conversa privada (perfis: só apelido e foto). */
export async function listPeople(meId) {
  const rows = check(await supabase.from('profiles').select('id,nickname,avatar_url').order('nickname').limit(300)) || [];
  return rows.filter((p) => p.id !== meId);
}
