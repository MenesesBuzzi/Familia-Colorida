// Regras puras do Lobisomem (sem React, sem Supabase) — fáceis de testar.

export const ROLES = {
  lobisomem: {
    id: 'lobisomem',
    nome: 'Lobisomem',
    emoji: '🐺',
    equipe: 'lobos',
    cor: '#E63946',
    descricao: 'À noite, você e os outros lobos escolhem uma vítima. De dia, finja ser inocente!',
  },
  vidente: {
    id: 'vidente',
    nome: 'Vidente',
    emoji: '🔮',
    equipe: 'vila',
    cor: '#9B5DE5',
    descricao: 'Toda noite você descobre o papel de um jogador.',
  },
  medico: {
    id: 'medico',
    nome: 'Médico',
    emoji: '🩺',
    equipe: 'vila',
    cor: '#2EC4B6',
    descricao: 'Toda noite você protege uma pessoa (pode ser você) do ataque dos lobos.',
  },
  cacador: {
    id: 'cacador',
    nome: 'Caçador',
    emoji: '🏹',
    equipe: 'vila',
    cor: '#F3722C',
    descricao: 'Se você morrer, leva alguém junto com sua última flecha.',
  },
  bruxa: {
    id: 'bruxa',
    nome: 'Bruxa',
    emoji: '🧪',
    equipe: 'vila',
    cor: '#43AA8B',
    descricao: 'Você tem 1 poção de cura (salva a vítima dos lobos) e 1 de veneno (elimina alguém). Cada uma só uma vez.',
  },
  aldeao: {
    id: 'aldeao',
    nome: 'Aldeão',
    emoji: '🧑‍🌾',
    equipe: 'vila',
    cor: '#4D96FF',
    descricao: 'Sem poderes especiais: use a lábia e o faro para achar os lobos de dia.',
  },
};

export const ROLE_ORDER = ['lobisomem', 'vidente', 'medico', 'cacador', 'bruxa', 'aldeao'];
export const MIN_PLAYERS = 5;

export const VILLAGE_OBJECTS = [
  'o Poço', 'a Lamparina', 'o Espantalho', 'o Sino da Igreja', 'a Velha Árvore',
  'o Moinho', 'a Cerca Quebrada', 'o Corvo do Telhado', 'a Fonte da Praça', 'o Relógio da Torre',
];

export function roleName(id) {
  return ROLES[id]?.nome ?? id;
}

/** Sugere a quantidade de cada papel para n jogadores. */
export function suggestRoles(n) {
  const counts = { lobisomem: 0, vidente: 0, medico: 0, cacador: 0, bruxa: 0, aldeao: 0 };
  if (n < 1) return counts;
  counts.lobisomem = Math.max(1, Math.floor(n / 3.5));
  if (n >= 4) counts.vidente = 1;
  if (n >= 5) counts.medico = 1;
  if (n >= 6) counts.cacador = 1;
  if (n >= 8) counts.bruxa = 1;
  const used = Object.values(counts).reduce((a, b) => a + b, 0);
  counts.aldeao = Math.max(0, n - used);
  return counts;
}

export function totalRoles(counts) {
  return ROLE_ORDER.reduce((s, r) => s + (counts?.[r] || 0), 0);
}

/** Retorna null se ok, ou a mensagem de erro. */
export function validateRoles(counts, n) {
  if (n < MIN_PLAYERS) return `São necessários pelo menos ${MIN_PLAYERS} jogadores.`;
  const total = totalRoles(counts);
  if (total !== n) return `A soma dos papéis (${total}) precisa ser igual ao número de jogadores (${n}).`;
  const lobos = counts.lobisomem || 0;
  if (lobos < 1) return 'Precisa de pelo menos 1 lobisomem.';
  if (lobos >= n - lobos) return 'Lobos demais: eles precisam ser menos que o resto da vila.';
  return null;
}

export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Distribui papéis aleatoriamente. Retorna [{ userId, role }] */
export function assignRoles(userIds, counts, rand = Math.random) {
  const bag = [];
  ROLE_ORDER.forEach((r) => {
    for (let i = 0; i < (counts[r] || 0); i += 1) bag.push(r);
  });
  const mixed = shuffle(bag, rand);
  return userIds.map((userId, i) => ({ userId, role: mixed[i] || 'aldeao' }));
}

/** Contagem de votos. Retorna { counts, top: [ids empatados no topo], max } */
export function tally(targets) {
  const counts = {};
  targets.filter(Boolean).forEach((t) => {
    counts[t] = (counts[t] || 0) + 1;
  });
  let max = 0;
  Object.values(counts).forEach((c) => {
    if (c > max) max = c;
  });
  const top = Object.keys(counts).filter((k) => counts[k] === max && max > 0);
  return { counts, top, max };
}

/** Vítima dos lobos: maioria; empate decidido no sorteio. */
export function pickWolfVictim(targets, rand = Math.random) {
  const { top } = tally(targets);
  if (!top.length) return null;
  return top[Math.floor(rand() * top.length)];
}

/**
 * Resolve a noite.
 * victim: alvo dos lobos | protectId: protegido do médico
 * witch: { kind: 'nada'|'curar'|'envenenar'|'curar_envenenar', target } | null
 * Retorna { deaths: [ids], saved: bool, usedCura, usedVeneno }
 */
export function resolveNight({ victim, protectId, witch, aliveIds }) {
  const alive = new Set(aliveIds);
  const deaths = [];
  let saved = false;
  const kind = witch?.kind || 'nada';
  const usedCura = (kind === 'curar' || kind === 'curar_envenenar') && !!victim;
  const usedVeneno = (kind === 'envenenar' || kind === 'curar_envenenar') && !!witch?.target;

  if (victim && alive.has(victim)) {
    if (victim === protectId || usedCura) saved = true;
    else deaths.push(victim);
  }
  if (usedVeneno && alive.has(witch.target) && !deaths.includes(witch.target)) {
    deaths.push(witch.target);
  }
  return { deaths, saved, usedCura, usedVeneno };
}

/**
 * Resultado da votação do dia.
 * votes: [{ kind: 'votar'|'pular', target }]
 * Elimina o mais votado; empate no topo ou "pular" >= topo => ninguém.
 */
export function resolveVote(votes) {
  const skips = votes.filter((v) => v.kind === 'pular').length;
  const { top, max, counts } = tally(votes.filter((v) => v.kind === 'votar').map((v) => v.target));
  if (!top.length) return { eliminated: null, empate: false, counts, skips };
  if (top.length > 1) return { eliminated: null, empate: true, counts, skips };
  if (skips >= max) return { eliminated: null, empate: false, counts, skips };
  return { eliminated: top[0], empate: false, counts, skips };
}

/** players: [{ user_id, alive }], roleOf: (id) => role. Retorna 'lobos' | 'vila' | null */
export function checkWin(players, roleOf) {
  const alive = players.filter((p) => p.alive);
  const lobos = alive.filter((p) => roleOf(p.user_id) === 'lobisomem').length;
  const outros = alive.length - lobos;
  if (lobos === 0) return 'vila';
  if (lobos >= outros) return 'lobos';
  return null;
}

/** Pista "segura" da inicial de um nome: um intervalo de letras que contém a inicial. */
export function initialRangeHint(name) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const first = (name || '?')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .charAt(0);
  const idx = letters.indexOf(first);
  if (idx < 0) return 'um nome que começa de um jeito estranho';
  const start = Math.max(0, idx - 3 - Math.floor(Math.random() * 3));
  const end = Math.min(25, idx + 3 + Math.floor(Math.random() * 3));
  return `um nome que começa com uma letra entre ${letters[start]} e ${letters[end]}`;
}
