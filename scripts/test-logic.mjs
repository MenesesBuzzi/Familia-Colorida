// Testes rápidos das regras do Lobisomem, Rádio, trilha sonora e Chat: `npm test`
import assert from 'node:assert/strict';
import {
  suggestRoles, totalRoles, validateRoles, assignRoles, resolveNight, resolveVote, checkWin, pickWolfVictim,
} from '../src/lib/werewolf/logic.js';
import { fallbackNarration } from '../src/lib/werewolf/fallback.js';
import {
  createPresenterMemory, planPresenter, presenterFallback, cleanPresenterText, looksLikeRoleLeak, publicCounts, MIN_GAP_MS,
} from '../src/lib/werewolf/presenter.js';
import { canReadChannel, canWriteChannel, unreadCount } from '../src/lib/werewolf/chat.js';
import {
  rankQueue, pickNext, pickFallbackTrack, expectedPosition, needsResync, trackEnded, canControl, canTalk, canGrantMic,
  micHolders, shouldAutoPlayVoice, titleFromFileName, validateMp3, safeFileName, formatDuration, filterLibrary,
} from '../src/lib/radio/queue.js';
import {
  BUILTIN_KEYS, BUILTIN_SOUNDS, DEFAULT_SCENE_SOUNDS, SCENE_KEYS, sceneOf, soundForScene, parseRef, isValidRef, shouldLoop,
  normalizeTrilha, aiSoundRef, aiSoundChoices, deathsSince, fxPayload, refLabel,
} from '../src/lib/werewolf/soundtrack.js';
import {
  countUnread, totalUnread, badgeText, dmKey, nextReadMarker, mergeMessages, sortRooms, roomTitle, previewText, cleanText, lastId,
} from '../src/lib/chat/logic.js';
import { existsSync, statSync } from 'node:fs';

for (let n = 5; n <= 20; n += 1) {
  const c = suggestRoles(n);
  assert.equal(totalRoles(c), n, `soma para ${n}`);
  assert.equal(validateRoles(c, n), null, `sugestão válida para ${n}: ${JSON.stringify(c)}`);
}
assert.ok(validateRoles(suggestRoles(4), 4));

const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
const roles = assignRoles(ids, suggestRoles(6));
assert.equal(roles.length, 6);
assert.equal(roles.filter((r) => r.role === 'lobisomem').length, 1);

// noite
assert.deepEqual(resolveNight({ victim: 'a', protectId: null, witch: null, aliveIds: ids }).deaths, ['a']);
assert.deepEqual(resolveNight({ victim: 'a', protectId: 'a', witch: null, aliveIds: ids }).deaths, []);
let r = resolveNight({ victim: 'a', protectId: null, witch: { kind: 'curar_envenenar', target: 'b' }, aliveIds: ids });
assert.deepEqual(r.deaths, ['b']);
assert.ok(r.usedCura && r.usedVeneno && r.saved);
r = resolveNight({ victim: null, protectId: null, witch: { kind: 'curar' }, aliveIds: ids });
assert.equal(r.usedCura, false);

// lobos com empate escolhem um dos empatados
assert.ok(['a', 'b'].includes(pickWolfVictim(['a', 'b'])));
assert.equal(pickWolfVictim([]), null);

// votação
assert.equal(resolveVote([{ kind: 'votar', target: 'a' }, { kind: 'votar', target: 'a' }, { kind: 'votar', target: 'b' }]).eliminated, 'a');
assert.equal(resolveVote([{ kind: 'votar', target: 'a' }, { kind: 'votar', target: 'b' }]).empate, true);
assert.equal(resolveVote([{ kind: 'votar', target: 'a' }, { kind: 'pular' }]).eliminated, null);
assert.equal(resolveVote([{ kind: 'pular' }]).eliminated, null);

// vitória
const roleOf = (id) => ({ a: 'lobisomem', b: 'aldeao', c: 'vidente' }[id]);
assert.equal(checkWin([{ user_id: 'a', alive: true }, { user_id: 'b', alive: true }, { user_id: 'c', alive: true }], roleOf), null);
assert.equal(checkWin([{ user_id: 'a', alive: true }, { user_id: 'b', alive: true }, { user_id: 'c', alive: false }], roleOf), 'lobos');
assert.equal(checkWin([{ user_id: 'a', alive: false }, { user_id: 'b', alive: true }], roleOf), 'vila');

// fallback nunca deixa nome na pista do fantasma
const t = fallbackNarration('fantasma', { sussurro: 'o lobo é a Maria', nomes: ['Maria', 'João'] });
assert.ok(!/maria/i.test(t), t);
for (const m of ['abertura', 'noite', 'votacao', 'cacador', 'objeto', 'fim']) {
  assert.ok(fallbackNarration(m, { jogadores: 6, mortes: [], objeto: 'o Poço', fatos: { umLobo: 'Ana' }, vencedor: 'vila', lobos: ['Ana'] }).length > 10);
}
console.log('✅ Todas as regras passaram.', JSON.stringify(suggestRoles(5)), JSON.stringify(suggestRoles(10)));

// ---------------- v2: apresentador do chat (Sussurro) + regras do chat ----------------

{
  const P = (id, nick, alive = true, revealed = null) => ({ user_id: id, nickname: nick, alive, revealed_role: revealed });
  const base = { status: 'lobby', phase: 'lobby', round: 0, settings: { revelarPapel: true }, chatReady: true, chat: [] };
  const never = () => 0.99; // rng que nunca dispara reação/piada
  const mem = createPresenterMemory();
  let t0 = 1_000_000;

  // 1ª leitura só memoriza; chat ainda não carregado não conta
  assert.equal(planPresenter(mem, { ...base, chatReady: false, players: [P('h', 'Ana')] }, t0, never), null);
  assert.equal(planPresenter(mem, { ...base, players: [P('h', 'Ana')] }, t0, never), null);

  // entrada -> boas-vindas pelo nome
  let snap = { ...base, players: [P('h', 'Ana'), P('b', 'Bia')] };
  let out = planPresenter(mem, snap, (t0 += 1000), never);
  assert.equal(out.mode, 'boas_vindas');
  assert.deepEqual(out.data.nomes, ['Bia']);
  assert.equal(out.data.faltam, 3);

  // limite de ~20 s: outro jogador entra logo depois -> espera
  snap = { ...snap, players: [...snap.players, P('c', 'Caio'), P('d', 'Duda')] };
  assert.equal(planPresenter(mem, snap, (t0 += 5000), never), null);
  out = planPresenter(mem, snap, (t0 += MIN_GAP_MS), never);
  assert.equal(out.mode, 'boas_vindas');
  assert.deepEqual(out.data.nomes, ['Caio', 'Duda']); // junta numa mensagem só

  // mudança de fase fura o limite e só leva contagens públicas
  const roles = { a: 'lobisomem' };
  snap = {
    ...snap,
    roles, // mesmo que alguém passe papéis por engano, eles não podem sair
    status: 'jogando',
    phase: 'noite',
    round: 1,
    settings: { revelarPapel: true, roles: { lobisomem: 2, vidente: 1 } },
    players: [P('h', 'Ana'), P('b', 'Bia'), P('c', 'Caio'), P('d', 'Duda'), P('e', 'Edu', false, 'lobisomem')],
  };
  out = planPresenter(mem, snap, (t0 += 1000), never);
  assert.equal(out.mode, 'contagem');
  assert.deepEqual(
    { vivos: out.data.vivos, mortos: out.data.mortos, lobos: out.data.lobosRestantes, fase: out.data.fase },
    { vivos: 4, mortos: 1, lobos: 1, fase: 'noite' }
  );
  assert.ok(!/vidente|"a"/.test(JSON.stringify(out.data)), 'não vaza papéis');
  // fase seguinte logo em seguida também anuncia
  out = planPresenter(mem, { ...snap, phase: 'dia', timerEnd: new Date(t0 + 1000 + 120000).toISOString() }, (t0 += 1000), never);
  assert.equal(out.mode, 'contagem');
  assert.ok(out.data.segundos > 100);
  // sem revelar papel, lobos restantes é segredo
  assert.equal(publicCounts({ ...snap, settings: { revelarPapel: false, roles: { lobisomem: 2 } } }).lobosRestantes, null);

  // reação ao chat: só da vila, só depois de várias mensagens e do intervalo
  const msgs = [
    { id: 1, kind: 'jogador', channel: 'vila', nickname: 'Bia', body: 'acho que foi o Caio' },
    { id: 2, kind: 'jogador', channel: 'vila', nickname: 'Caio', body: 'eu não!' },
    { id: 3, kind: 'jogador', channel: 'fantasmas', nickname: 'Edu', body: 'SEGREDO DO ALÉM' },
    { id: 4, kind: 'jogador', channel: 'vila', nickname: 'Duda', body: 'calma gente' },
  ];
  const daySnap = { ...snap, phase: 'dia', chat: msgs };
  assert.equal(planPresenter(mem, daySnap, (t0 += 1000), () => 0), null); // ainda no intervalo
  out = planPresenter(mem, daySnap, (t0 += MIN_GAP_MS), () => 0);
  assert.equal(out.mode, 'chat_reacao');
  assert.equal(out.data.mensagens.length, 3);
  assert.ok(!JSON.stringify(out.data).includes('SEGREDO'), 'nunca lê o canal dos fantasmas');

  // piada leve depois de um tempo quieto, só com vivos
  out = planPresenter(mem, daySnap, (t0 += 5 * MIN_GAP_MS), () => 0);
  assert.equal(out.mode, 'brincadeira');
  assert.notEqual(out.data.nomes[0], 'Edu');

  // fim de jogo não é anunciado pelo apresentador (a tela de fim cuida disso)
  assert.equal(planPresenter(mem, { ...daySnap, status: 'fim', phase: 'fim' }, (t0 += 1000), never), null);

  // falas prontas para todos os modos e fases
  for (const fase of ['lobby', 'noite', 'bruxa', 'cacador', 'dia', 'votacao']) {
    assert.ok(presenterFallback('contagem', { fase, rodada: 2, vivos: 4, mortos: 1, lobosRestantes: null }).length > 10, fase);
  }
  assert.ok(presenterFallback('boas_vindas', { nomes: ['Bia'], total: 2, faltam: 3 }).includes('Bia'));
  assert.ok(presenterFallback('brincadeira', { nomes: ['Caio'] }).includes('Caio'));
  assert.ok(presenterFallback('chat_reacao', { mensagens: [{ nome: 'Duda', texto: 'oi' }] }).includes('Duda'));
  assert.ok(presenterFallback('chat_reacao', {}).length > 10);

  // filtro de vazamento/acusação no texto da IA
  assert.ok(looksLikeRoleLeak('Hmm, a Bia é a lobisomem, eu sinto!', ['Bia']));
  assert.ok(looksLikeRoleLeak('Caio parece inocente demais...', ['Caio']));
  assert.ok(looksLikeRoleLeak('O lobo é Caio!', []));
  assert.ok(!looksLikeRoleLeak('Caio, explique-se para a vila! 🍿', ['Caio']));
  assert.equal(cleanPresenterText('"Sussurro: Bia tem cara de lobo"', ['Bia']), null);
  assert.equal(cleanPresenterText('  "Boa noite, vila!" ', ['Bia']), 'Boa noite, vila!');

  // regras do chat (espelham o RLS)
  assert.equal(canWriteChannel('vila', { status: 'jogando', alive: false }), false);
  assert.equal(canWriteChannel('vila', { status: 'lobby', alive: false }), true);
  assert.equal(canWriteChannel('fantasmas', { status: 'jogando', alive: false }), true);
  assert.equal(canWriteChannel('fantasmas', { status: 'fim', alive: false }), false);
  assert.equal(canReadChannel('fantasmas', { status: 'jogando', alive: true }), false);
  assert.equal(canReadChannel('fantasmas', { status: 'fim', alive: true }), true);
  assert.equal(unreadCount([{ id: 1, user_id: 'x' }, { id: 2, user_id: 'me' }, { id: 3, user_id: 'y' }], 1, 'me'), 1);
  console.log('✅ Apresentador e chat passaram.');
}

// ---------------- v3: Rádio (fila da Biblioteca, sincronia, microfone) ----------------

{
  // fila com votos: mais pontos primeiro, empate -> mais 👍, depois a mais antiga
  const lib = [{ id: 10, title: 'Aquarela', artist: 'Toquinho', duration_sec: 200 }, { id: 11, title: 'Trem-Bala' }, { id: 12, title: 'Velha Infância' }];
  const queue = [
    { id: 1, track_id: 10, created_at: '2026-01-01T10:00:00Z' },
    { id: 2, track_id: 11, created_at: '2026-01-01T10:01:00Z' },
    { id: 3, track_id: 12, created_at: '2026-01-01T10:02:00Z' },
  ];
  const votes = [
    { queue_id: 2, user_id: 'a', value: 1 }, { queue_id: 2, user_id: 'b', value: 1 },
    { queue_id: 3, user_id: 'a', value: 1 }, { queue_id: 3, user_id: 'b', value: 1 }, { queue_id: 3, user_id: 'c', value: -1 },
    { queue_id: 1, user_id: 'me', value: -1 }, { queue_id: 1, user_id: 'x', value: 0 },
  ];
  const ranked = rankQueue(queue, votes, 'me', lib);
  assert.deepEqual(ranked.map((q) => q.id), [2, 3, 1]);
  assert.equal(ranked[2].myVote, -1);
  assert.equal(ranked[2].title, 'Aquarela');
  assert.equal(ranked[2].duration_sec, 200);
  assert.equal(pickNext(ranked).track_id, 11);
  assert.equal(pickNext([]), null);
  // empate de pontos: mais 👍 ganha; empate total: a mais antiga
  const tie = rankQueue(queue, [{ queue_id: 3, user_id: 'a', value: 1 }, { queue_id: 1, user_id: 'a', value: 1 }]);
  assert.deepEqual(tie.map((q) => q.id), [1, 3, 2]);

  // fila vazia: música surpresa da Biblioteca, sem repetir as recentes
  assert.equal(pickFallbackTrack(lib, [10, 11], () => 0).id, 12);
  assert.ok([10, 11, 12].includes(pickFallbackTrack(lib, [10, 11, 12], () => 0.5).id)); // todas recentes: aceita qualquer
  assert.equal(pickFallbackTrack([], [], () => 0), null);

  // sincronia: posição = offset + tempo desde o play
  const t0 = Date.parse('2026-01-01T10:00:00Z');
  const room = { owner_id: 'dono', now_track_id: 10, now_playing: true, now_offset: 30, now_updated_at: '2026-01-01T10:00:00Z' };
  assert.equal(expectedPosition(room, t0 + 15000), 45);
  assert.equal(expectedPosition({ ...room, now_playing: false }, t0 + 15000), 30);
  assert.equal(expectedPosition(room, t0 + 999999, 200), 200);
  assert.equal(expectedPosition({ ...room, now_track_id: null }, t0), 0);
  assert.equal(needsResync(44, 45), false);
  assert.equal(needsResync(10, 45), true);
  assert.equal(trackEnded(room, 200, t0 + 171000), true);
  assert.equal(trackEnded(room, 200, t0 + 100000), false);
  assert.equal(trackEnded({ ...room, now_playing: false }, 200, t0 + 500000), false);

  // permissões: só o dono controla; microfone = dono ou quem recebeu
  const members = [{ user_id: 'dono', nickname: 'Ana' }, { user_id: 'b', nickname: 'Bia', can_talk: true }, { user_id: 'c', nickname: 'Caio' }];
  assert.equal(canControl(room, 'dono'), true);
  assert.equal(canControl(room, 'b'), false);
  assert.equal(canTalk(room, members, 'dono'), true);
  assert.equal(canTalk(room, members, 'b'), true);
  assert.equal(canTalk(room, members, 'c'), false);
  assert.equal(canTalk(room, members, 'estranho'), false);
  assert.equal(canTalk(null, members, 'dono'), false);
  assert.equal(canGrantMic(room, 'dono', 'c'), true);
  assert.equal(canGrantMic(room, 'b', 'c'), false, 'só o dono passa o microfone');
  assert.equal(canGrantMic(room, 'dono', 'dono'), false);
  assert.deepEqual(micHolders(room, members).map((m) => m.nickname), ['Ana', 'Bia']);
  // walkie-talkie: toca sozinho só falas novas de outras pessoas
  const now = Date.now();
  assert.equal(shouldAutoPlayVoice({ user_id: 'b', storage_path: 'b/x.m4a', created_at: new Date(now - 5000).toISOString() }, 'c', now), true);
  assert.equal(shouldAutoPlayVoice({ user_id: 'c', storage_path: 'c/x.m4a', created_at: new Date(now).toISOString() }, 'c', now), false);
  assert.equal(shouldAutoPlayVoice({ user_id: 'b', storage_path: 'b/x.m4a', created_at: new Date(now - 120000).toISOString() }, 'c', now), false);

  // upload de MP3
  assert.deepEqual(titleFromFileName('Toquinho - Aquarela.mp3'), { title: 'Aquarela', artist: 'Toquinho' });
  assert.deepEqual(titleFromFileName('minha_musica_favorita.MP3'), { title: 'minha musica favorita', artist: '' });
  assert.equal(validateMp3({ name: 'a.mp3', size: 1000 }), null);
  assert.equal(validateMp3({ name: 'a.bin', mimeType: 'audio/mpeg', size: 1000 }), null);
  assert.ok(validateMp3({ name: 'video.mp4', mimeType: 'video/mp4', size: 1000 }));
  assert.ok(validateMp3({ name: 'a.mp3', size: 30 * 1024 * 1024 }));
  assert.equal(safeFileName('Ção Ñandu! (ao vivo).mp3'), 'cao-nandu-ao-vivo.mp3');
  assert.equal(formatDuration(245), '4:05');
  assert.equal(filterLibrary(lib, 'aquare').length, 1);
  assert.equal(filterLibrary(lib, 'INFANCIA').length, 1, 'busca sem acento');
  console.log('✅ Rádio v3 (fila, sincronia, microfone) passou.');
}

// ---------------- v3: trilha sonora do Lobisomem ----------------
{
  assert.ok(BUILTIN_SOUNDS.length >= 13);
  // todo som embutido tem arquivo, e o total é pequeno (< 2 MB)
  let total = 0;
  for (const k of BUILTIN_KEYS) {
    const f = new URL(`../assets/sounds/${k}.mp3`, import.meta.url);
    assert.ok(existsSync(f), `falta assets/sounds/${k}.mp3`);
    total += statSync(f).size;
  }
  assert.ok(total < 2 * 1024 * 1024, `sons pesados demais: ${total}`);
  // toda cena padrão aponta para um som válido (ou silêncio)
  SCENE_KEYS.forEach((s) => assert.ok(DEFAULT_SCENE_SOUNDS[s] === '' || isValidRef(DEFAULT_SCENE_SOUNDS[s]), s));

  // cena a partir da sala
  assert.equal(sceneOf({ status: 'lobby', phase: 'lobby' }), 'lobby');
  assert.equal(sceneOf({ status: 'jogando', phase: 'noite' }), 'noite');
  assert.equal(sceneOf({ status: 'jogando', phase: 'votacao' }), 'votacao');
  assert.equal(sceneOf({ status: 'fim', phase: 'fim', state: { winner: 'lobos' } }), 'vitoria_lobos');
  assert.equal(sceneOf({ status: 'fim', phase: 'fim', state: { winner: 'vila' } }), 'vitoria_vila');
  assert.equal(sceneOf(null), null);

  // modo Padrão
  assert.equal(soundForScene('noite', { modo: 'padrao' }), 'b:noite');
  assert.equal(soundForScene('votacao', undefined), 'b:tensao', 'sala antiga sem trilha = padrão');
  assert.equal(soundForScene('lobby', { modo: 'padrao' }), '');
  // modo Eu escolho: cena escolhida vence; a que não foi escolhida usa o padrão
  const escolho = { modo: 'escolho', cenas: { noite: 'b:grilos', dia: 'u:abc/galo.mp3', votacao: '' } };
  assert.equal(soundForScene('noite', escolho), 'b:grilos');
  assert.equal(soundForScene('dia', escolho), 'u:abc/galo.mp3');
  assert.equal(soundForScene('votacao', escolho), '', 'silêncio escolhido');
  assert.equal(soundForScene('morte', escolho), 'b:morte');
  assert.deepEqual(normalizeTrilha({ modo: 'escolho', cenas: { noite: 'b:inexistente', xx: 'b:dia', dia: 'u:../hack' } }).cenas, {});
  assert.equal(normalizeTrilha({ modo: 'bagunca' }).modo, 'padrao');
  // modo IA escolhe: vale o som da fase/rodada atual; som inválido ou de outra fase -> padrão
  const ia = { modo: 'ia' };
  const roomDia = { status: 'jogando', phase: 'dia', round: 2 };
  assert.equal(soundForScene('dia', ia, { key: 'trovao', phase: 'dia', round: 2 }, roomDia), 'b:trovao');
  assert.equal(soundForScene('dia', ia, { key: 'trovao', phase: 'noite', round: 2 }, roomDia), 'b:dia');
  assert.equal(soundForScene('dia', ia, { key: 'rock-pesado', phase: 'dia', round: 2 }, roomDia), 'b:dia');
  assert.equal(soundForScene('vitoria_vila', ia, { key: 'trovao' }), 'b:vitoria', 'fim sempre com vitória');
  assert.equal(soundForScene('noite', { modo: 'desligada' }), '');
  assert.equal(aiSoundRef(' Uivo '), 'b:uivo');
  assert.equal(aiSoundRef('nada'), null);
  assert.ok(aiSoundChoices().every((k) => BUILTIN_KEYS.includes(k)));
  // loop x uma vez
  assert.equal(shouldLoop('noite', 'b:noite'), true);
  assert.equal(shouldLoop('morte', 'b:morte'), false);
  assert.equal(shouldLoop('dia', 'b:sino'), false);
  assert.equal(shouldLoop('dia', 'u:x/y.mp3'), true);
  assert.deepEqual(parseRef('u:a/b.mp3'), { kind: 'upload', path: 'a/b.mp3' });
  assert.equal(parseRef('http://x'), null);
  // mortes desde a última leitura
  const P = (alive) => ({ alive });
  assert.deepEqual(deathsSince(null, [P(true), P(true)]), { alive: 2, died: 0 });
  assert.deepEqual(deathsSince(3, [P(true), P(false), P(false)]), { alive: 1, died: 2 });
  // mesa de efeitos: só referências válidas
  assert.equal(fxPayload('b:uivo', 'Ana').ref, 'b:uivo');
  assert.equal(fxPayload('javascript:alert(1)', 'Ana'), null);
  assert.equal(refLabel('', []), '🔇 Silêncio');
  assert.equal(refLabel('u:x/galo.mp3', [{ storage_path: 'x/galo.mp3', title: 'Galo' }]), '📁 Galo');
  console.log('✅ Trilha do Lobisomem (cenas → sons) passou.');
}

// ---------------- v3: Chat (não lidas, conversa privada) ----------------
{
  const msgs = [{ id: 1, user_id: 'a' }, { id: 2, user_id: 'me' }, { id: 3, user_id: 'b' }, { id: 4, user_id: 'a' }];
  assert.equal(countUnread(msgs, 0, 'me'), 3);
  assert.equal(countUnread(msgs, 2, 'me'), 2);
  assert.equal(countUnread(msgs, 4, 'me'), 0);
  assert.equal(countUnread([], 0, 'me'), 0);
  assert.equal(totalUnread([{ unread: 2 }, { unread: 0 }, { unread: 5 }, { unread: null }, {}]), 7);
  assert.equal(badgeText(0), '');
  assert.equal(badgeText(7), '7');
  assert.equal(badgeText(150), '99+');
  assert.equal(dmKey('b', 'a'), dmKey('a', 'b'));
  assert.equal(dmKey('a', 'a'), null);
  assert.equal(nextReadMarker(10, 4), 10, 'marcador nunca volta');
  assert.equal(nextReadMarker(10, 12), 12);
  assert.deepEqual(mergeMessages([{ id: 2, body: 'b' }, { id: 1, body: 'a' }], [{ id: 2, body: 'b2' }, { id: 3 }]).map((m) => m.id), [1, 2, 3]);
  assert.equal(mergeMessages([{ id: 2, body: 'b' }], [{ id: 2, body: 'b2' }])[0].body, 'b2');
  assert.equal(lastId(msgs), 4);
  const rooms = sortRooms([
    { id: 'g', kind: 'grupo', name: 'Primos', last_at: '2026-01-02' },
    { id: 'd', kind: 'dm', other_name: 'Bia', last_at: '2026-01-03' },
    { id: 'f', kind: 'familia', last_at: '2026-01-01' },
  ]);
  assert.deepEqual(rooms.map((r) => r.id), ['f', 'd', 'g']);
  assert.equal(roomTitle(rooms[1]), 'Bia');
  assert.equal(previewText({ last_kind: 'voz' }), '🎤 Mensagem de voz');
  assert.equal(previewText({}), 'Nenhuma mensagem ainda');
  assert.equal(cleanText('   '), null);
  assert.equal(cleanText(' oi '), 'oi');
  console.log('✅ Chat v3 (não lidas, privadas) passou.');
}
