// Testes rápidos das regras do Lobisomem: `npm test`
import assert from 'node:assert/strict';
import {
  suggestRoles, totalRoles, validateRoles, assignRoles, resolveNight, resolveVote, checkWin, pickWolfVictim,
} from '../src/lib/werewolf/logic.js';
import { fallbackNarration } from '../src/lib/werewolf/fallback.js';

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
