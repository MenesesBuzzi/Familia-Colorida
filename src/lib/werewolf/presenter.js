// Apresentador do chat da sala ("Sussurro"): roda SÓ no celular do anfitrião.
// Este arquivo é lógica pura (sem React/Supabase) para ser testado com `npm test`.
//
// Regras:
//  - Mudança de fase: anuncia sempre (contagens públicas), sem esperar o intervalo.
//  - Fora isso, no máximo 1 mensagem a cada MIN_GAP_MS (~20 s): boas-vindas > reação ao chat > brincadeira.
//  - NUNCA recebe nem repassa papéis secretos: só nomes, contagem de vivos/mortos e o que já é público
//    (quantos lobos a partida tem e quais mortos tiveram o papel revelado).
//  - Só lê o chat da VILA (nunca o dos fantasmas).

import { MIN_PLAYERS } from './logic.js';

export const PRESENTER_NAME = 'Sussurro';
export const MIN_GAP_MS = 20000;
export const REACT_GAP_MS = 60000;
export const JOKE_GAP_MS = 120000;
export const REACT_MIN_MSGS = 3;
const JOKE_PHASES = ['lobby', 'dia'];

export function createPresenterMemory() {
  return {
    ready: false,
    phaseKey: null,
    known: new Set(),
    pending: [], // [{ id, nome }] que entraram e ainda não foram saudados
    lastChatId: 0,
    newMsgs: 0,
    recent: [],
    lastSentAt: 0,
    lastReactAt: 0,
    lastJokeAt: 0,
  };
}

/** Contagens que qualquer jogador já pode ver. lobosRestantes = null quando é segredo. */
export function publicCounts(snap) {
  const players = snap.players || [];
  const inGame = snap.status === 'jogando';
  const vivos = inGame ? players.filter((p) => p.alive).length : players.length;
  const mortos = inGame ? players.length - vivos : 0;
  const totalLobos = Number(snap.settings?.roles?.lobisomem);
  let lobosRestantes = null;
  if (inGame && snap.settings?.revelarPapel && Number.isFinite(totalLobos) && totalLobos > 0) {
    const lobosMortos = players.filter((p) => !p.alive && p.revealed_role === 'lobisomem').length;
    lobosRestantes = Math.max(0, totalLobos - lobosMortos);
  }
  return { vivos, mortos, lobosRestantes };
}

function phaseData(snap, now) {
  const data = { fase: snap.phase, rodada: snap.status === 'jogando' ? snap.round || null : null, ...publicCounts(snap) };
  if (snap.phase === 'dia' && snap.timerEnd) {
    const s = Math.round((Date.parse(snap.timerEnd) - now) / 1000);
    if (s > 0) data.segundos = s;
  }
  return data;
}

/**
 * Decide se o apresentador fala agora. Atualiza `mem` e devolve { mode, data } (modos da Edge Function
 * narrador) ou null. snap = { status, phase, round, timerEnd, settings, players, chat, chatReady }.
 */
export function planPresenter(mem, snap, now = Date.now(), rng = Math.random) {
  if (!snap || !snap.status || !snap.chatReady) return null;
  const players = snap.players || [];
  const ids = new Set(players.map((p) => p.user_id));
  const key = `${snap.status}:${snap.phase}:${snap.round || 0}`;
  const chat = (snap.chat || []).filter((m) => m.kind === 'jogador' && (m.channel || 'vila') === 'vila');
  const newest = chat.reduce((a, m) => (m.id > a ? m.id : a), 0);

  // Primeira leitura: só memoriza (não saúda quem já estava, não reage a mensagens antigas).
  if (!mem.ready) {
    mem.ready = true;
    mem.phaseKey = key;
    mem.known = ids;
    mem.lastChatId = newest;
    return null;
  }

  // Quem entrou / saiu (só dá para entrar no lobby; fora dele apenas memoriza)
  players.forEach((p) => {
    if (!mem.known.has(p.user_id)) {
      mem.known.add(p.user_id);
      if (snap.status === 'lobby') mem.pending.push({ id: p.user_id, nome: p.nickname });
    }
  });
  [...mem.known].forEach((id) => {
    if (!ids.has(id)) mem.known.delete(id);
  });
  mem.pending = mem.pending.filter((x) => ids.has(x.id));

  // Mensagens novas da vila
  const fresh = chat.filter((m) => m.id > mem.lastChatId);
  if (fresh.length) {
    mem.newMsgs += fresh.length;
    mem.recent = [...mem.recent, ...fresh.map((m) => ({ nome: m.nickname, texto: String(m.body).slice(0, 200) }))].slice(-8);
    mem.lastChatId = newest;
  }

  // 1) Mudança de fase: sempre (ignora o intervalo). O fim de jogo já tem a tela/narração própria.
  if (key !== mem.phaseKey) {
    mem.phaseKey = key;
    if (snap.status !== 'fim') {
      mem.lastSentAt = now;
      return { mode: 'contagem', data: phaseData(snap, now) };
    }
  }

  if (now - mem.lastSentAt < MIN_GAP_MS) return null;

  // 2) Boas-vindas (junta todo mundo que entrou no intervalo numa mensagem só)
  if (mem.pending.length) {
    const nomes = mem.pending.map((x) => x.nome).slice(0, 6);
    mem.pending = [];
    mem.lastSentAt = now;
    const total = players.length;
    return {
      mode: 'boas_vindas',
      data: {
        nomes,
        total,
        faltam: snap.status === 'lobby' ? Math.max(0, MIN_PLAYERS - total) : 0,
        minimo: MIN_PLAYERS,
        fase: snap.phase,
      },
    };
  }

  // 3) Reação ao chat (de vez em quando)
  if (mem.newMsgs >= REACT_MIN_MSGS && now - mem.lastReactAt >= REACT_GAP_MS && rng() < 0.5) {
    mem.newMsgs = 0;
    mem.lastReactAt = now;
    mem.lastSentAt = now;
    return { mode: 'chat_reacao', data: { fase: snap.phase, mensagens: mem.recent.slice() } };
  }

  // 4) Brincadeira leve com alguém pelo nome (só no lobby e na discussão do dia)
  const candidates = players.filter((p) => snap.status !== 'jogando' || p.alive);
  if (
    JOKE_PHASES.includes(snap.phase) &&
    candidates.length >= 2 &&
    now - mem.lastSentAt >= 3 * MIN_GAP_MS &&
    now - mem.lastJokeAt >= JOKE_GAP_MS &&
    rng() < 0.12
  ) {
    const p = candidates[Math.floor(rng() * candidates.length) % candidates.length];
    mem.lastJokeAt = now;
    mem.lastSentAt = now;
    return { mode: 'brincadeira', data: { nomes: [p.nickname], fase: snap.phase } };
  }
  return null;
}

// ------------------------------------------------------------------
// Falas prontas (quando a IA está desligada ou falha)
// ------------------------------------------------------------------
const pickWith = (rng) => (arr) => arr[Math.floor(rng() * arr.length) % arr.length];

function placar(d) {
  const lobos = d.lobosRestantes == null ? '' : ` · 🐺 ${d.lobosRestantes} lobo(s) à solta`;
  return `${d.vivos} vivo(s), ${d.mortos} morto(s)${lobos}`;
}

export function presenterFallback(mode, d = {}, rng = Math.random) {
  const pick = pickWith(rng);
  const nomes = (d.nomes || []).join(', ') || 'pessoal';
  switch (mode) {
    case 'boas_vindas':
      return `🎉 Chegou ${nomes}! Agora somos ${d.total}. ${
        d.faltam > 0 ? `Faltam ${d.faltam} para começar.` : 'Já dá para começar a partida!'
      }`;
    case 'contagem':
      switch (d.fase) {
        case 'noite':
          return `🌙 Noite ${d.rodada || ''}! ${placar(d)}. Todo mundo age no celular — até quem só vai dormir.`;
        case 'bruxa':
          return '🧪 Shhh... um caldeirão começou a borbulhar em algum lugar da vila.';
        case 'cacador':
          return `🏹 Suspense! O caçador prepara a última flecha... ${placar(d)}.`;
        case 'dia':
          return `☀️ Amanheceu! ${placar(d)}.${d.segundos ? ` Vocês têm ${Math.ceil(d.segundos / 60)} min para discutir.` : ''}`;
        case 'votacao':
          return `🗳️ Hora de votar! ${placar(d)}. Voto secreto, e empate não elimina ninguém.`;
        case 'lobby':
          return '🏠 De volta à sala de espera! Quem topa mais uma rodada?';
        default:
          return `📣 Nova fase! ${placar(d)}.`;
      }
    case 'brincadeira':
      return pick([
        `${nomes}, a vila quer ouvir sua opinião! Solta o verbo 🎤`,
        `${nomes} tá tão quietinho(a) que dá pra ouvir o grilo... 🦗`,
        `Atenção, vila: ${nomes} acabou de ganhar o prêmio de melhor cara de paisagem! 🏆`,
        `${nomes}, conta uma piada pra aliviar o clima? 😄`,
      ]);
    case 'chat_reacao': {
      const last = (d.mensagens || []).slice(-1)[0];
      if (!last) return '🍿 Que silêncio... alguém tem algo a dizer?';
      const trecho = String(last.texto || '').slice(0, 60);
      return pick([
        `🍿 ${last.nome} disse “${trecho}”... e aí, vila, concordam?`,
        `👀 Opa! ${last.nome} mandou essa: “${trecho}”. Quem responde?`,
      ]);
    }
    default:
      return '📣 O Sussurro está de olho na conversa...';
  }
}

// ------------------------------------------------------------------
// Proteção extra no texto da IA: nada de "fulano é o lobo / é inocente".
// ------------------------------------------------------------------
const ROLE_WORDS = '(lob[oa]s?|lobisomem|lobisomens|vidente|bruxa|m[ée]dic[oa]|ca[çc]ador[a]?|alde[ãa]o|alde[ãa]|inocente|culpad[oa])';

export function looksLikeRoleLeak(text, names = []) {
  const s = String(text || '');
  if (new RegExp(`\\b([oOaA])\\s+${ROLE_WORDS}\\s+(é|era|s[ãa]o)\\s+[A-ZÀ-Ú]`, 'u').test(s)) return true;
  return (names || []).some((n) => {
    if (!n || n.length < 2) return false;
    const safe = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
      `${safe}[^.!?]{0,20}\\s(é|e|era|seria|parece|deve ser|tem cara de|com certeza é)\\s[^.!?]{0,12}\\b${ROLE_WORDS}`,
      'iu'
    );
    return re.test(s);
  });
}

/** Limpa o texto da IA; devolve null se não servir (vazio ou parece revelar/acusar papel). */
export function cleanPresenterText(text, names) {
  const out = String(text || '')
    .replace(/^["“”'\s]+|["“”'\s]+$/g, '')
    .replace(/^sussurro\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
  if (out.length < 3) return null;
  if (looksLikeRoleLeak(out, names)) return null;
  return out;
}
