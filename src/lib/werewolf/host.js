// "Cérebro" da partida: roda SOMENTE no celular do anfitrião.
// Lê as ações secretas no Supabase, resolve as fases e publica o resultado.
import { supabase } from '../supabase';
import {
  assignRoles,
  checkWin,
  pickWolfVictim,
  resolveNight,
  resolveVote,
  roleName,
  shuffle,
  VILLAGE_OBJECTS,
} from './logic';
import { narrate } from './narrator';

export const DEFAULT_SETTINGS = {
  roles: null, // { lobisomem: 1, ... } — null = sugestão automática
  discussaoSeg: 180,
  revelarPapel: true,
  objetosFalantes: true,
  narradorIA: true,
};

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

// ------------------------------------------------------------------
// Início de partida
// ------------------------------------------------------------------
export async function startGame(room, players, counts) {
  const roomId = room.id;
  const settings = { ...DEFAULT_SETTINGS, ...(room.settings || {}), roles: counts };

  // limpa a partida anterior
  await q(supabase.from('ww_actions').delete().eq('room_id', roomId));
  await q(supabase.from('ww_private').delete().eq('room_id', roomId));
  await q(supabase.from('ww_whispers').delete().eq('room_id', roomId));
  await q(supabase.from('ww_feed').delete().eq('room_id', roomId));
  await q(supabase.from('ww_roles').delete().eq('room_id', roomId));
  await q(
    supabase.from('ww_players').update({ alive: true, revealed_role: null }).eq('room_id', roomId)
  );

  const assigned = assignRoles(
    players.map((p) => p.user_id),
    counts
  );
  await q(
    supabase.from('ww_roles').insert(
      assigned.map((a) => ({
        room_id: roomId,
        user_id: a.userId,
        role: a.role,
        data: a.role === 'bruxa' ? { cura: true, veneno: true } : {},
      }))
    )
  );

  const text = await narrate(
    'abertura',
    { jogadores: players.length, lobos: counts.lobisomem },
    settings.narradorIA
  );
  await q(supabase.from('ww_feed').insert({ room_id: roomId, round: 1, kind: 'narracao', text }));

  await q(
    supabase
      .from('ww_rooms')
      .update({
        status: 'jogando',
        phase: 'noite',
        round: 1,
        settings,
        state: { progress: { feitos: 0, total: players.length } },
        updated_at: new Date().toISOString(),
      })
      .eq('id', roomId)
  );
}

export async function backToLobby(roomId) {
  await q(
    supabase
      .from('ww_rooms')
      .update({ status: 'lobby', phase: 'lobby', round: 0, state: {}, updated_at: new Date().toISOString() })
      .eq('id', roomId)
  );
  await q(
    supabase.from('ww_players').update({ alive: true, revealed_role: null }).eq('room_id', roomId)
  );
}

// ------------------------------------------------------------------
// Máquina de estados (chamada a cada poucos segundos e a cada ação nova)
// ------------------------------------------------------------------
export async function hostTick(roomId, { force = false } = {}) {
  const room = await q(supabase.from('ww_rooms').select('*').eq('id', roomId).single());
  if (!room || room.status !== 'jogando') return;

  const [players, roles, actions] = await Promise.all([
    q(supabase.from('ww_players').select('*').eq('room_id', roomId)),
    q(supabase.from('ww_roles').select('*').eq('room_id', roomId)),
    q(supabase.from('ww_actions').select('*').eq('room_id', roomId).eq('round', room.round)),
  ]);

  const ctx = makeCtx(room, players, roles, actions);

  switch (room.phase) {
    case 'noite':
      await tickNight(ctx, force);
      break;
    case 'bruxa':
      await tickWitch(ctx, force);
      break;
    case 'cacador':
      await tickHunter(ctx, force);
      break;
    case 'dia':
      if (force || (room.state?.timerEnd && Date.now() >= Date.parse(room.state.timerEnd))) {
        await startVoting(ctx);
      }
      break;
    case 'votacao':
      await tickVote(ctx, force);
      break;
    default:
      break;
  }
}

function makeCtx(room, players, roles, actions) {
  const roleMap = Object.fromEntries(roles.map((r) => [r.user_id, r]));
  const nameMap = Object.fromEntries(players.map((p) => [p.user_id, p.nickname]));
  const settings = { ...DEFAULT_SETTINGS, ...(room.settings || {}) };
  return {
    room,
    roomId: room.id,
    round: room.round,
    state: room.state || {},
    settings,
    players,
    actions,
    roleOf: (id) => roleMap[id]?.role,
    roleRow: (id) => roleMap[id],
    nameOf: (id) => nameMap[id] || '???',
    alive: () => players.filter((p) => p.alive),
  };
}

async function setRoom(ctx, patch) {
  const next = { ...patch, updated_at: new Date().toISOString() };
  await q(supabase.from('ww_rooms').update(next).eq('id', ctx.roomId));
  Object.assign(ctx.room, next);
  if (patch.state) ctx.state = patch.state;
}

async function feed(ctx, kind, text, round = ctx.round) {
  await q(supabase.from('ww_feed').insert({ room_id: ctx.roomId, round, kind, text }));
}

async function updateProgress(ctx, feitos, total) {
  const p = ctx.state.progress;
  if (p && p.feitos === feitos && p.total === total) return;
  await setRoom(ctx, { state: { ...ctx.state, progress: { feitos, total } } });
}

async function kill(ctx, ids) {
  for (const id of ids) {
    const revealed = ctx.settings.revelarPapel ? ctx.roleOf(id) : null;
    await q(
      supabase
        .from('ww_players')
        .update({ alive: false, revealed_role: revealed })
        .eq('room_id', ctx.roomId)
        .eq('user_id', id)
    );
    const p = ctx.players.find((x) => x.user_id === id);
    if (p) p.alive = false;
  }
}

function publicRole(ctx, id) {
  return ctx.settings.revelarPapel ? roleName(ctx.roleOf(id)) : null;
}

// ---------------- NOITE ----------------
async function tickNight(ctx, force) {
  const alive = ctx.alive();
  const aliveIds = new Set(alive.map((p) => p.user_id));
  const acts = ctx.actions.filter((a) => a.step === 'noite' && aliveIds.has(a.user_id));

  // Vidente: responde assim que ela escolher
  const seerActs = acts.filter((a) => a.kind === 'ver' && ctx.roleOf(a.user_id) === 'vidente' && a.target);
  if (seerActs.length) {
    const already = await q(
      supabase
        .from('ww_private')
        .select('user_id')
        .eq('room_id', ctx.roomId)
        .eq('round', ctx.round)
        .eq('kind', 'vidente')
    );
    for (const a of seerActs) {
      if (already.some((x) => x.user_id === a.user_id)) continue;
      await q(
        supabase.from('ww_private').insert({
          room_id: ctx.roomId,
          user_id: a.user_id,
          round: ctx.round,
          kind: 'vidente',
          payload: { targetId: a.target, nome: ctx.nameOf(a.target), papel: ctx.roleOf(a.target) },
        })
      );
    }
  }

  const feitos = alive.filter((p) => acts.some((a) => a.user_id === p.user_id)).length;
  if (feitos < alive.length && !force) {
    await updateProgress(ctx, feitos, alive.length);
    return;
  }

  const wolfTargets = acts
    .filter((a) => a.kind === 'matar' && ctx.roleOf(a.user_id) === 'lobisomem')
    .map((a) => a.target)
    .filter((t) => aliveIds.has(t));
  const victim = pickWolfVictim(wolfTargets);
  const protectAct = acts.find((a) => a.kind === 'proteger' && ctx.roleOf(a.user_id) === 'medico');
  const protectId = protectAct?.target || null;

  const witch = alive.find((p) => ctx.roleOf(p.user_id) === 'bruxa');
  const potions = witch ? ctx.roleRow(witch.user_id)?.data || {} : {};
  if (witch && (potions.cura || potions.veneno)) {
    await q(
      supabase.from('ww_private').insert({
        room_id: ctx.roomId,
        user_id: witch.user_id,
        round: ctx.round,
        kind: 'bruxa',
        payload: {
          victimId: victim,
          victimName: victim ? ctx.nameOf(victim) : null,
          cura: !!potions.cura,
          veneno: !!potions.veneno,
        },
      })
    );
    await setRoom(ctx, {
      phase: 'bruxa',
      state: { ...ctx.state, night: { victim, protectId }, progress: null },
    });
    return;
  }

  await finishNight(ctx, { victim, protectId, witchAct: null });
}

// ---------------- BRUXA ----------------
async function tickWitch(ctx, force) {
  const witch = ctx.alive().find((p) => ctx.roleOf(p.user_id) === 'bruxa');
  const act = witch
    ? ctx.actions.find((a) => a.step === 'bruxa' && a.user_id === witch.user_id)
    : null;
  if (witch && !act && !force) return;
  const night = ctx.state.night || {};
  await finishNight(ctx, { victim: night.victim, protectId: night.protectId, witchAct: act, witch });
}

async function finishNight(ctx, { victim, protectId, witchAct, witch }) {
  const aliveIds = ctx.alive().map((p) => p.user_id);
  const potions = witch ? ctx.roleRow(witch.user_id)?.data || {} : {};
  // respeita poções já gastas
  let kind = witchAct?.kind || 'nada';
  if (!potions.cura && kind.includes('curar')) kind = kind.includes('envenenar') ? 'envenenar' : 'nada';
  if (!potions.veneno && kind.includes('envenenar')) kind = kind.includes('curar') ? 'curar' : 'nada';

  const result = resolveNight({
    victim,
    protectId,
    witch: witchAct ? { kind, target: witchAct.target } : null,
    aliveIds,
  });

  if (witch && (result.usedCura || result.usedVeneno)) {
    await q(
      supabase
        .from('ww_roles')
        .update({
          data: {
            cura: potions.cura && !result.usedCura,
            veneno: potions.veneno && !result.usedVeneno,
          },
        })
        .eq('room_id', ctx.roomId)
        .eq('user_id', witch.user_id)
    );
  }

  await kill(ctx, result.deaths);

  const text = await narrate(
    'noite',
    {
      rodada: ctx.round,
      mortes: result.deaths.map((id) => ({ nome: ctx.nameOf(id), papel: publicRole(ctx, id) })),
      salvo: result.saved,
    },
    ctx.settings.narradorIA
  );
  await feed(ctx, 'narracao', text);

  const nightFacts = {
    vitima: result.deaths.length ? 'alguém morreu' : null,
    salvo: result.saved,
  };
  const baseState = {
    ...ctx.state,
    night: null,
    progress: null,
    lastDeaths: result.deaths.map((id) => ({ id, nome: ctx.nameOf(id), papel: publicRole(ctx, id) })),
    nightFacts,
  };

  ctx.state = baseState;
  if (await maybeEnd(ctx)) return;

  const hunter = result.deaths.find((id) => ctx.roleOf(id) === 'cacador');
  if (hunter) {
    await setRoom(ctx, { phase: 'cacador', state: { ...baseState, cacador: { userId: hunter, next: 'dia' } } });
    return;
  }
  await startDay(ctx);
}

// ---------------- CAÇADOR ----------------
async function tickHunter(ctx, force) {
  const info = ctx.state.cacador;
  if (!info) return startDay(ctx);
  const act = ctx.actions.find((a) => a.step === 'cacador' && a.user_id === info.userId);
  if (!act && !force) return;

  const target = act?.kind === 'atirar' ? act.target : null;
  if (target && ctx.alive().some((p) => p.user_id === target)) {
    await kill(ctx, [target]);
    const text = await narrate(
      'cacador',
      { cacador: ctx.nameOf(info.userId), alvo: ctx.nameOf(target), papel: publicRole(ctx, target) },
      ctx.settings.narradorIA
    );
    await feed(ctx, 'narracao', text);
  } else {
    await feed(ctx, 'sistema', `${ctx.nameOf(info.userId)} guardou o arco. Ninguém foi levado.`);
  }

  ctx.state = { ...ctx.state, cacador: null };
  if (await maybeEnd(ctx)) return;
  if (info.next === 'noite') await startNight(ctx, ctx.round + 1);
  else await startDay(ctx);
}

// ---------------- DIA ----------------
async function startDay(ctx) {
  const vivos = ctx.alive();
  const todosNomes = ctx.players.map((p) => p.nickname);

  // Sussurros dos fantasmas -> pistas enigmáticas
  const whispers = await q(
    supabase.from('ww_whispers').select('*').eq('room_id', ctx.roomId).eq('used', false)
  );
  for (const w of whispers) {
    const text = await narrate(
      'fantasma',
      { sussurro: w.body, nomes: todosNomes },
      ctx.settings.narradorIA
    );
    await feed(ctx, 'fantasma', text);
    await q(supabase.from('ww_whispers').update({ used: true }).eq('id', w.id));
  }

  // Objetos falantes
  if (ctx.settings.objetosFalantes) {
    const lobos = vivos.filter((p) => ctx.roleOf(p.user_id) === 'lobisomem');
    const umLobo = lobos.length ? shuffle(lobos)[0].nickname : null;
    const objeto = VILLAGE_OBJECTS[Math.floor(Math.random() * VILLAGE_OBJECTS.length)];
    const text = await narrate(
      'objeto',
      {
        objeto,
        fatos: { ...(ctx.state.nightFacts || {}), umLobo, lobosVivos: lobos.length },
        nomes: todosNomes,
      },
      ctx.settings.narradorIA
    );
    await feed(ctx, 'objeto', text);
  }

  const timerEnd = new Date(Date.now() + (ctx.settings.discussaoSeg || 180) * 1000).toISOString();
  await setRoom(ctx, {
    phase: 'dia',
    state: { ...ctx.state, cacador: null, progress: null, timerEnd },
  });
}

// ---------------- VOTAÇÃO ----------------
async function startVoting(ctx) {
  const total = ctx.alive().length;
  await setRoom(ctx, {
    phase: 'votacao',
    state: { ...ctx.state, timerEnd: null, progress: { feitos: 0, total } },
  });
}

async function tickVote(ctx, force) {
  const alive = ctx.alive();
  const aliveIds = new Set(alive.map((p) => p.user_id));
  const votes = ctx.actions.filter((a) => a.step === 'voto' && aliveIds.has(a.user_id));
  if (votes.length < alive.length && !force) {
    await updateProgress(ctx, votes.length, alive.length);
    return;
  }

  const res = resolveVote(votes.filter((v) => v.kind === 'pular' || aliveIds.has(v.target)));
  const resumo = Object.entries(res.counts)
    .map(([id, c]) => `${ctx.nameOf(id)}: ${c}`)
    .join(' · ');
  await feed(
    ctx,
    'sistema',
    `🗳️ Votos — ${resumo || 'nenhum voto'}${res.skips ? ` · pularam: ${res.skips}` : ''}`
  );

  if (res.eliminated) {
    await kill(ctx, [res.eliminated]);
  }
  const text = await narrate(
    'votacao',
    {
      eliminado: res.eliminated
        ? { nome: ctx.nameOf(res.eliminated), papel: publicRole(ctx, res.eliminated) }
        : null,
      empate: res.empate,
    },
    ctx.settings.narradorIA
  );
  await feed(ctx, 'narracao', text);

  ctx.state = {
    ...ctx.state,
    progress: null,
    lastDeaths: res.eliminated
      ? [{ id: res.eliminated, nome: ctx.nameOf(res.eliminated), papel: publicRole(ctx, res.eliminated) }]
      : [],
  };
  if (await maybeEnd(ctx)) return;

  if (res.eliminated && ctx.roleOf(res.eliminated) === 'cacador') {
    await setRoom(ctx, {
      phase: 'cacador',
      state: { ...ctx.state, cacador: { userId: res.eliminated, next: 'noite' } },
    });
    return;
  }
  await startNight(ctx, ctx.round + 1);
}

async function startNight(ctx, round) {
  const total = ctx.alive().length;
  await setRoom(ctx, {
    phase: 'noite',
    round,
    state: { ...ctx.state, cacador: null, timerEnd: null, night: null, progress: { feitos: 0, total } },
  });
  ctx.round = round;
  await feed(ctx, 'sistema', `🌙 Noite ${round}. A vila dorme...`, round);
}

// ---------------- FIM ----------------
async function maybeEnd(ctx) {
  const winner = checkWin(ctx.players, ctx.roleOf);
  if (!winner) return false;
  const lobos = ctx.players.filter((p) => ctx.roleOf(p.user_id) === 'lobisomem').map((p) => p.nickname);
  const text = await narrate('fim', { vencedor: winner, lobos }, ctx.settings.narradorIA);
  await feed(ctx, 'narracao', text);
  await setRoom(ctx, {
    status: 'fim',
    phase: 'fim',
    state: { ...ctx.state, winner, progress: null, timerEnd: null },
  });
  return true;
}
