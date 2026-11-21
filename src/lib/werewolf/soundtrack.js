// Trilha sonora do Lobisomem (v3) — lógica pura (sem React Native), testada com `npm test`.
//
// Cada momento do jogo é uma "cena". O anfitrião escolhe o modo da trilha:
//   padrao  -> cada cena usa o som embutido padrão
//   escolho -> o anfitrião escolhe o som de cada cena (embutido ou enviado ao bucket "lobo-sons")
//   ia      -> o Sussurro (Edge Function narrador) sugere um som junto com cada narração
//
// Um som é uma "referência" em texto:
//   'b:noite'                 -> som embutido (assets/sounds/noite.mp3)
//   'u:<caminho no bucket>'   -> som enviado ao bucket "lobo-sons"
//   ''/null                   -> silêncio

/** Sons que vêm junto com o app (ver assets/sounds e scripts/gen-sounds.py). */
export const BUILTIN_SOUNDS = [
  { key: 'noite', nome: 'Noite (vento e grilos)', emoji: '🌙', loop: true },
  { key: 'dia', nome: 'Amanhecer', emoji: '☀️', loop: true },
  { key: 'tensao', nome: 'Tensão', emoji: '😬', loop: true },
  { key: 'coracao', nome: 'Coração batendo', emoji: '💓', loop: true },
  { key: 'grilos', nome: 'Grilos', emoji: '🦗', loop: true },
  { key: 'vento', nome: 'Vento uivante', emoji: '🌬️', loop: true },
  { key: 'morte', nome: 'Morte', emoji: '💀', loop: false },
  { key: 'vitoria', nome: 'Vitória', emoji: '🏆', loop: false },
  { key: 'derrota', nome: 'Lobos vencem', emoji: '🐺', loop: false },
  { key: 'uivo', nome: 'Uivo de lobo', emoji: '🐺', loop: false },
  { key: 'sino', nome: 'Sino da igreja', emoji: '🔔', loop: false },
  { key: 'trovao', nome: 'Trovão', emoji: '⛈️', loop: false },
  { key: 'tambor', nome: 'Rufar de tambor', emoji: '🥁', loop: false },
];
export const BUILTIN_KEYS = BUILTIN_SOUNDS.map((s) => s.key);

/** Cenas do jogo, na ordem em que aparecem na tela de configuração. */
export const SCENES = [
  { key: 'lobby', nome: 'Sala de espera', emoji: '🏠' },
  { key: 'noite', nome: 'Noite', emoji: '🌙' },
  { key: 'bruxa', nome: 'Bruxa acordada', emoji: '🧪' },
  { key: 'cacador', nome: 'Última flecha', emoji: '🏹' },
  { key: 'dia', nome: 'Dia (discussão)', emoji: '☀️' },
  { key: 'votacao', nome: 'Votação', emoji: '🗳️' },
  { key: 'morte', nome: 'Alguém morreu', emoji: '💀' },
  { key: 'vitoria_vila', nome: 'Vila vence', emoji: '🏆' },
  { key: 'vitoria_lobos', nome: 'Lobos vencem', emoji: '🐺' },
];
export const SCENE_KEYS = SCENES.map((s) => s.key);

/** Cenas que tocam UMA vez (as outras ficam em loop enquanto a fase durar). */
export const ONE_SHOT_SCENES = ['morte', 'vitoria_vila', 'vitoria_lobos'];

/** Modo "Padrão": um som embutido por cena. */
export const DEFAULT_SCENE_SOUNDS = {
  lobby: '',
  noite: 'b:noite',
  bruxa: 'b:coracao',
  cacador: 'b:coracao',
  dia: 'b:dia',
  votacao: 'b:tensao',
  morte: 'b:morte',
  vitoria_vila: 'b:vitoria',
  vitoria_lobos: 'b:derrota',
};

export const TRILHA_MODES = [
  { key: 'padrao', nome: 'Padrão', emoji: '🎵' },
  { key: 'escolho', nome: 'Eu escolho', emoji: '🎛️' },
  { key: 'ia', nome: 'IA escolhe', emoji: '🤖' },
  { key: 'desligada', nome: 'Sem trilha', emoji: '🔇' },
];

export const DEFAULT_TRILHA = { modo: 'padrao', cenas: {} };

/** Normaliza o objeto settings.trilha da sala (aceita valores velhos/ausentes). */
export function normalizeTrilha(trilha) {
  const modo = TRILHA_MODES.some((m) => m.key === trilha?.modo) ? trilha.modo : 'padrao';
  const cenas = {};
  Object.entries(trilha?.cenas || {}).forEach(([k, v]) => {
    if (SCENE_KEYS.includes(k) && (v === '' || isValidRef(v))) cenas[k] = v;
  });
  return { modo, cenas };
}

/** Cena atual a partir do estado público da sala (ww_rooms). */
export function sceneOf(room) {
  if (!room) return null;
  if (room.status === 'lobby' || room.phase === 'lobby') return 'lobby';
  if (room.status === 'fim' || room.phase === 'fim') {
    return room.state?.winner === 'lobos' ? 'vitoria_lobos' : 'vitoria_vila';
  }
  return SCENE_KEYS.includes(room.phase) ? room.phase : 'noite';
}

export function isValidRef(ref) {
  if (typeof ref !== 'string') return false;
  if (ref.startsWith('b:')) return BUILTIN_KEYS.includes(ref.slice(2));
  if (ref.startsWith('u:')) return ref.length > 2 && ref.length <= 300 && !ref.includes('..');
  return false;
}

/** 'b:noite' -> { kind: 'builtin', key: 'noite' } | 'u:abc/x.mp3' -> { kind: 'upload', path } | null */
export function parseRef(ref) {
  if (!isValidRef(ref)) return null;
  return ref.startsWith('b:') ? { kind: 'builtin', key: ref.slice(2) } : { kind: 'upload', path: ref.slice(2) };
}

/** A IA devolve só a chave de um som embutido; vira referência ('b:...') ou null. */
export function aiSoundRef(key) {
  const k = String(key || '').trim().toLowerCase();
  return BUILTIN_KEYS.includes(k) ? `b:${k}` : null;
}

/**
 * Qual som tocar numa cena. Devolve uma referência ('b:..', 'u:..') ou '' (silêncio).
 *  trilha = settings.trilha da sala;  aiSom = room.state.som ({ key, phase, round }) no modo IA.
 */
export function soundForScene(scene, trilha, aiSom = null, room = null) {
  if (!scene) return '';
  const t = normalizeTrilha(trilha);
  if (t.modo === 'desligada') return '';
  if (t.modo === 'escolho' && Object.prototype.hasOwnProperty.call(t.cenas, scene)) return t.cenas[scene];
  if (t.modo === 'ia' && aiSom && !ONE_SHOT_SCENES.includes(scene)) {
    const sameMoment = !room || ((aiSom.phase == null || aiSom.phase === room.phase) && (aiSom.round == null || aiSom.round === room.round));
    const ref = aiSoundRef(aiSom.key);
    if (sameMoment && ref) return ref;
  }
  return DEFAULT_SCENE_SOUNDS[scene] ?? '';
}

/** Este som deve ficar em loop? (cenas de fase em loop; momentos únicos tocam uma vez) */
export function shouldLoop(scene, ref) {
  if (ONE_SHOT_SCENES.includes(scene)) return false;
  const p = parseRef(ref);
  if (p?.kind === 'builtin') {
    const s = BUILTIN_SOUNDS.find((x) => x.key === p.key);
    return s ? s.loop : true;
  }
  return true;
}

/** Quantos jogadores morreram desde a última leitura? (para tocar a cena "morte") */
export function deathsSince(prevAlive, players) {
  const alive = (players || []).filter((p) => p.alive).length;
  if (prevAlive == null) return { alive, died: 0 };
  return { alive, died: Math.max(0, prevAlive - alive) };
}

/** Nome amigável de uma referência (para mostrar na tela). */
export function refLabel(ref, uploads = []) {
  if (!ref) return '🔇 Silêncio';
  const p = parseRef(ref);
  if (!p) return '🔇 Silêncio';
  if (p.kind === 'builtin') {
    const s = BUILTIN_SOUNDS.find((x) => x.key === p.key);
    return s ? `${s.emoji} ${s.nome}` : p.key;
  }
  const u = (uploads || []).find((x) => x.storage_path === p.path);
  return `📁 ${u?.title || p.path.split('/').pop()}`;
}

/** Lista de chaves embutidas mandada para a IA escolher (modo "IA escolhe"). */
export function aiSoundChoices() {
  return BUILTIN_SOUNDS.filter((s) => s.loop || ['uivo', 'sino', 'trovao'].includes(s.key)).map((s) => s.key);
}

/** Payload da mesa de efeitos (broadcast). Garante que só vai uma referência válida. */
export function fxPayload(ref, from) {
  if (!isValidRef(ref)) return null;
  return { ref, from: String(from || '').slice(0, 40), at: Date.now() };
}
