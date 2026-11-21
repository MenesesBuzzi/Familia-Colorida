// Funções puras da Rádio Amigo (sem React Native): ranking por votos e links de busca.

/**
 * Junta músicas e votos e ordena: mais pontos (👍 - 👎) primeiro; empate → mais 👍; depois a mais antiga.
 * Retorna [{ ...song, up, down, score, myVote }].
 */
export function rankSongs(songs = [], votes = [], myId = null) {
  const bySong = new Map();
  votes.forEach((v) => {
    if (!v || !v.value) return;
    const s = bySong.get(v.song_id) || { up: 0, down: 0, mine: 0 };
    if (v.value > 0) s.up += 1;
    else s.down += 1;
    if (myId && v.user_id === myId) s.mine = v.value;
    bySong.set(v.song_id, s);
  });
  return songs
    .map((song) => {
      const s = bySong.get(song.id) || { up: 0, down: 0, mine: 0 };
      return { ...song, up: s.up, down: s.down, score: s.up - s.down, myVote: s.mine };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.up - a.up ||
        String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
        a.id - b.id
    );
}

/** Aplica um voto localmente (resposta instantânea antes do servidor confirmar). */
export function applyVote(votes = [], songId, userId, value) {
  const rest = votes.filter((v) => !(v.song_id === songId && v.user_id === userId));
  return [...rest, { song_id: songId, user_id: userId, value }];
}

/** Próximo voto ao tocar num botão: tocar de novo no mesmo retira o voto. */
export function nextVote(current, pressed) {
  return current === pressed ? 0 : pressed;
}

/** Dados para a IA sugerir: as mais votadas + tudo que já está na fila (para não repetir). */
export function suggestionPayload(ranked = []) {
  const top = ranked
    .filter((s) => s.score > 0)
    .slice(0, 10)
    .map((s) => ({ title: s.title, artist: s.artist, score: s.score }));
  return {
    top: top.length ? top : ranked.slice(0, 5).map((s) => ({ title: s.title, artist: s.artist, score: s.score })),
    existentes: ranked.map((s) => `${s.title} — ${s.artist}`),
  };
}

/** Limpa a resposta da IA: só itens com título e artista, sem repetir o que já existe. */
export function cleanSuggestions(items, ranked = []) {
  const key = (t, a) => `${String(t).trim().toLowerCase()}|${String(a).trim().toLowerCase()}`;
  const seen = new Set(ranked.map((s) => key(s.title, s.artist)));
  const out = [];
  (Array.isArray(items) ? items : []).forEach((it) => {
    const title = String(it?.title || '').trim().slice(0, 120);
    const artist = String(it?.artist || '').trim().slice(0, 120);
    if (!title || !artist) return;
    const k = key(title, artist);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ title, artist, reason: String(it?.reason || '').trim().slice(0, 300) });
  });
  return out.slice(0, 5);
}

export function youtubeSearchUrl(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(String(query || '').trim())}`;
}

export function spotifySearchUrl(query) {
  return `https://open.spotify.com/search/${encodeURIComponent(String(query || '').trim())}`;
}

/** Texto da playlist para compartilhar no WhatsApp etc. */
export function playlistText(roomName, ranked = []) {
  const lines = ranked.map((s, i) => `${i + 1}. ${s.title} — ${s.artist}${s.score ? ` (${s.score > 0 ? '+' : ''}${s.score})` : ''}`);
  return `📻 ${roomName || 'Rádio Amigo'}\n${lines.join('\n') || '(fila vazia)'}`;
}
