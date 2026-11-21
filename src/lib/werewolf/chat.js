// Regras do chat da sala (espelham o RLS de ww_chat no schema.sql). Puras: testáveis em Node.

/** Pode LER o canal? Vila: todos. Fantasmas: mortos durante a partida, ou todos no fim. */
export function canReadChannel(channel, { status, alive }) {
  if (channel === 'vila') return true;
  if (channel === 'fantasmas') return status === 'fim' || (status === 'jogando' && !alive);
  return false;
}

/** Pode ESCREVER? Vila: vivos (no lobby/fim todos). Fantasmas: só mortos durante a partida. */
export function canWriteChannel(channel, { status, alive }) {
  if (channel === 'vila') return status !== 'jogando' || !!alive;
  if (channel === 'fantasmas') return status === 'jogando' && !alive;
  return false;
}

/** Quantas mensagens de outras pessoas chegaram depois do último id visto. */
export function unreadCount(messages, lastSeenId, me) {
  return (messages || []).filter((m) => m.id > (lastSeenId || 0) && m.user_id !== me).length;
}

export const maxId = (messages) => (messages || []).reduce((a, m) => (m.id > a ? m.id : a), 0);
