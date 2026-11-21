// Rádio Amigo v3 — fila de músicas da Biblioteca, sincronia de reprodução e microfone.
// Lógica pura (sem React Native / Supabase): testada com `npm test`.
import { rankSongs } from './ranking.js';

export const MAX_MP3_BYTES = 20 * 1024 * 1024; // 20 MB por música (limite do bucket "radio")
export const MAX_VOICE_SEC = 30; // walkie-talkie: no máximo 30 s por fala
export const RESYNC_TOLERANCE_SEC = 3; // só pula a música se o celular estiver >3 s fora de sincronia

/**
 * Fila da rádio ordenada por votos (mesma regra do ranking da v2: pontos, depois 👍, depois a mais antiga).
 * queue: [{ id, track_id, created_at, ... }]   votes: [{ queue_id, user_id, value }]
 * library: [{ id, title, artist, ... }] (opcional: junta título/artista de cada música)
 */
export function rankQueue(queue = [], votes = [], myId = null, library = []) {
  const lib = new Map((library || []).map((t) => [t.id, t]));
  const items = (queue || []).map((q) => {
    const t = lib.get(q.track_id) || {};
    return {
      ...q,
      title: q.title ?? t.title ?? 'Música',
      artist: q.artist ?? t.artist ?? '',
      duration_sec: q.duration_sec ?? t.duration_sec ?? null,
      storage_path: q.storage_path ?? t.storage_path ?? null,
    };
  });
  const asSongVotes = (votes || []).map((v) => ({ song_id: v.queue_id, user_id: v.user_id, value: v.value }));
  return rankSongs(items, asSongVotes, myId);
}

/** Próxima a tocar: a primeira da fila ranqueada; fila vazia -> null. */
export function pickNext(ranked = []) {
  return ranked.length ? ranked[0] : null;
}

/**
 * Fila vazia: sorteia uma música da Biblioteca para a rádio não ficar muda,
 * evitando repetir a atual e as últimas tocadas. rng é injetável para teste.
 */
export function pickFallbackTrack(library = [], recentIds = [], rng = Math.random) {
  const recent = new Set(recentIds || []);
  const fresh = (library || []).filter((t) => !recent.has(t.id));
  const pool = fresh.length ? fresh : library || [];
  if (!pool.length) return null;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

/**
 * Posição (segundos) em que a música deveria estar agora, a partir do estado da sala:
 * now_offset + tempo desde now_updated_at (se estiver tocando). Nunca passa da duração.
 */
export function expectedPosition(room, nowMs = Date.now(), duration = null) {
  if (!room || !room.now_track_id) return 0;
  const base = Number(room.now_offset) || 0;
  let pos = base;
  if (room.now_playing && room.now_updated_at) {
    const t = Date.parse(room.now_updated_at);
    if (Number.isFinite(t)) pos = base + Math.max(0, (nowMs - t) / 1000);
  }
  const d = Number(duration);
  if (Number.isFinite(d) && d > 0) pos = Math.min(pos, d);
  return Math.max(0, pos);
}

/** Precisa pular (seek) para ficar em sincronia com a sala? */
export function needsResync(current, expected, tolerance = RESYNC_TOLERANCE_SEC) {
  if (!Number.isFinite(current) || !Number.isFinite(expected)) return true;
  return Math.abs(current - expected) > tolerance;
}

/** A música terminou (pelo relógio da sala)? Usado pelo celular do dono para avançar a fila. */
export function trackEnded(room, duration, nowMs = Date.now(), margin = 1) {
  const d = Number(duration);
  if (!room?.now_track_id || !room.now_playing || !Number.isFinite(d) || d <= 0) return false;
  return expectedPosition(room, nowMs) >= d - margin;
}

// -------------------------------------------------------------- permissões
/** Quem controla play/pause/pular: só o dono (admin) da rádio. */
export function canControl(room, userId) {
  return !!room && !!userId && room.owner_id === userId;
}

/** Pode falar no walkie-talkie? Dono sempre; os outros só se receberam o microfone. */
export function canTalk(room, members = [], userId) {
  if (!room || !userId) return false;
  if (room.owner_id === userId) return true;
  return (members || []).some((m) => m.user_id === userId && m.can_talk === true);
}

/** Pode passar / tirar o microfone de alguém? Só o dono, e não de si mesmo. */
export function canGrantMic(room, actorId, targetId) {
  return canControl(room, actorId) && !!targetId && targetId !== room.owner_id;
}

/** Quem está com o microfone agora (dono + convidados). */
export function micHolders(room, members = []) {
  if (!room) return [];
  return (members || []).filter((m) => m.user_id === room.owner_id || m.can_talk === true);
}

/** Uma fala nova do walkie-talkie deve tocar sozinha neste celular? */
export function shouldAutoPlayVoice(clip, me, nowMs = Date.now(), maxAgeMs = 60000) {
  if (!clip || !clip.storage_path || clip.user_id === me) return false;
  const t = Date.parse(clip.created_at);
  return !Number.isFinite(t) || nowMs - t <= maxAgeMs;
}

// -------------------------------------------------------------- upload
/** "Minha_Música - Banda (ao vivo).mp3" -> { title: 'Minha Música', artist: 'Banda (ao vivo)' } */
export function titleFromFileName(name = '') {
  const base = String(name)
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = /^(.+?)\s+-\s+(.+)$/.exec(base);
  if (m) return { title: m[2].trim().slice(0, 120), artist: m[1].trim().slice(0, 120) };
  return { title: (base || 'Música sem nome').slice(0, 120), artist: '' };
}

/** Confere se o arquivo escolhido é um MP3 aceitável. Devolve texto de erro ou null. */
export function validateMp3({ name, mimeType, size } = {}) {
  const isMp3 = /\.mp3$/i.test(String(name || '')) || /audio\/(mpeg|mp3|mpeg3|x-mpeg-3)/i.test(String(mimeType || ''));
  if (!isMp3) return 'Escolha um arquivo .mp3 (YouTube e Spotify não são suportados).';
  if (Number(size) > MAX_MP3_BYTES) return 'Arquivo grande demais (máximo 20 MB).';
  if (size != null && Number(size) <= 0) return 'Arquivo vazio.';
  return null;
}

/** Nome seguro para o Storage: minúsculas, sem acento, sem espaços. */
export function safeFileName(name = 'audio', ext = 'mp3') {
  const base = String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${base || 'audio'}.${ext}`;
}

/** 245 -> "4:05" */
export function formatDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 5_300_000 -> "5,1 MB" */
export function formatSize(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Filtra a biblioteca pela busca (título, artista ou quem enviou), sem diferenciar acentos. */
export function filterLibrary(library = [], query = '') {
  const norm = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const q = norm(query).trim();
  if (!q) return library || [];
  return (library || []).filter((t) => [t.title, t.artist, t.uploader_name].some((x) => norm(x).includes(q)));
}
