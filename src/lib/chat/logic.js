// App Chat (v3) — lógica pura (sem React Native / Supabase), testada com `npm test`.

/** Id fixo da sala "Família" (criada pelo schema.sql; todo mundo logado participa). */
export const FAMILY_ROOM_ID = '00000000-0000-0000-0000-00000000fa01';
export const MAX_TEXT = 1000;

/** Chave única de uma conversa privada entre duas pessoas (a ordem não importa). */
export function dmKey(a, b) {
  if (!a || !b || a === b) return null;
  return [String(a), String(b)].sort().join(':');
}

/** Mensagens não lidas: de outras pessoas, com id maior que o último lido. */
export function countUnread(messages = [], lastReadId = 0, me = null) {
  return (messages || []).filter((m) => m.id > (Number(lastReadId) || 0) && m.user_id !== me).length;
}

/** Soma dos não lidos de todas as salas (linhas da RPC my_chat_rooms / chat_unread). */
export function totalUnread(rows = []) {
  return (rows || []).reduce((sum, r) => sum + Math.max(0, Number(r?.unread) || 0), 0);
}

/** Texto do selinho vermelho do ícone: '' (nada), '1'..'99', '99+'. */
export function badgeText(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (!v) return '';
  return v > 99 ? '99+' : String(v);
}

/** Maior id já visto numa lista (para marcar como lido). */
export function lastId(messages = []) {
  return (messages || []).reduce((a, m) => (m.id > a ? m.id : a), 0);
}

/** Novo marcador de leitura: nunca volta para trás. */
export function nextReadMarker(current, seen) {
  return Math.max(Number(current) || 0, Number(seen) || 0);
}

/** Nome que aparece na lista: Família, nome do grupo ou o apelido da outra pessoa. */
export function roomTitle(room) {
  if (!room) return 'Conversa';
  if (room.kind === 'familia') return '👨‍👩‍👧‍👦 Família';
  if (room.kind === 'dm') return room.other_name || 'Conversa privada';
  return room.name || 'Sala';
}

/** Ordem da lista: Família primeiro, depois a conversa com mensagem mais recente. */
export function sortRooms(rooms = []) {
  return (rooms || []).slice().sort((a, b) => {
    if (a.kind === 'familia' && b.kind !== 'familia') return -1;
    if (b.kind === 'familia' && a.kind !== 'familia') return 1;
    const ta = String(a.last_at || a.created_at || '');
    const tb = String(b.last_at || b.created_at || '');
    return tb.localeCompare(ta);
  });
}

/** Prévia da última mensagem. */
export function previewText(room) {
  if (!room?.last_kind) return 'Nenhuma mensagem ainda';
  if (room.last_kind === 'voz') return '🎤 Mensagem de voz';
  return String(room.last_body || '').replace(/\s+/g, ' ').slice(0, 60);
}

/** Junta mensagens novas (realtime) com as que já estão na tela, sem repetir e em ordem. */
export function mergeMessages(current = [], incoming = []) {
  const map = new Map();
  [...(current || []), ...(incoming || [])].forEach((m) => {
    if (m && m.id != null) map.set(m.id, { ...(map.get(m.id) || {}), ...m });
  });
  return [...map.values()].sort((a, b) => a.id - b.id);
}

/** Valida texto antes de enviar. Devolve o texto limpo ou null. */
export function cleanText(text) {
  const t = String(text || '').trim().slice(0, MAX_TEXT);
  return t || null;
}
