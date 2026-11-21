import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useInterval } from '../realtime';
import { cleanPresenterText, createPresenterMemory, planPresenter, PRESENTER_NAME, presenterFallback } from './presenter';

const AI_TIMEOUT_MS = 10000;

async function askAI(mode, data) {
  const call = supabase.functions.invoke('narrador', { body: { mode, data } });
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), AI_TIMEOUT_MS));
  const { data: res, error } = await Promise.race([call, timeout]);
  if (error || !res?.text) throw error || new Error(res?.error || 'sem texto');
  return res.text;
}

/**
 * Liga o apresentador no celular do ANFITRIÃO. Ele lê só dados públicos (sala, jogadores, chat da vila)
 * e posta no chat como mensagem "ia". Nunca recebe ww_roles.
 */
export function usePresenter({ enabled, useAI, roomId, hostId, room, players, chat, chatReady }) {
  const mem = useRef(createPresenterMemory());
  const busy = useRef(false);
  const snap = useRef(null);

  useLayoutEffect(() => {
    snap.current = room
      ? {
          status: room.status,
          phase: room.phase,
          round: room.round,
          timerEnd: room.state?.timerEnd || null,
          settings: room.settings || {},
          // só campos públicos dos jogadores
          players: (players || []).map((p) => ({
            user_id: p.user_id,
            nickname: p.nickname,
            alive: p.alive,
            revealed_role: p.revealed_role || null,
          })),
          chat: chat || [],
          chatReady,
        }
      : null;
  });

  const tick = useCallback(async () => {
    if (!enabled || busy.current || !snap.current) return;
    const plan = planPresenter(mem.current, snap.current, Date.now());
    if (!plan) return;
    busy.current = true;
    try {
      const names = (snap.current.players || []).map((p) => p.nickname);
      let text = null;
      if (useAI) {
        try {
          text = cleanPresenterText(await askAI(plan.mode, plan.data), names);
        } catch (e) {
          console.log('[apresentador] usando fala pronta:', e?.message || e);
        }
      }
      if (!text) text = presenterFallback(plan.mode, plan.data);
      const { error } = await supabase.from('ww_chat').insert({
        room_id: roomId,
        user_id: hostId,
        nickname: PRESENTER_NAME,
        channel: 'vila',
        kind: 'ia',
        body: text.slice(0, 500),
      });
      if (error) console.warn('[apresentador]', error.message);
    } finally {
      busy.current = false;
    }
  }, [enabled, useAI, roomId, hostId]);

  // desligou: esquece tudo (ao religar, não saúda quem já estava)
  useEffect(() => {
    if (!enabled) mem.current = createPresenterMemory();
  }, [enabled]);

  // reage logo à troca de fase / entrada de alguém; o intervalo cobre o resto
  const phaseKey = room ? `${room.status}:${room.phase}:${room.round}:${(players || []).length}` : '';
  useEffect(() => {
    if (enabled && phaseKey) tick();
  }, [enabled, phaseKey, tick]);
  useInterval(tick, 3000, enabled);
}
