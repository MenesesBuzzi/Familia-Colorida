import { useCallback, useRef } from 'react';
import { hostTick } from './host';
import { useInterval, useRealtime } from '../realtime';

/**
 * Liga o "cérebro" da partida no celular do anfitrião.
 * Reage a cada ação nova (realtime) e confere o estado a cada 2,5 s.
 */
export function useHostEngine(roomId, enabled) {
  const busy = useRef(false);
  const pendingForce = useRef(false);

  const run = useCallback(async () => {
    if (!enabled || busy.current) return;
    busy.current = true;
    const force = pendingForce.current;
    pendingForce.current = false;
    try {
      await hostTick(roomId, { force });
    } catch (e) {
      console.warn('[anfitrião]', e?.message || e);
    } finally {
      busy.current = false;
    }
  }, [roomId, enabled]);

  useRealtime(
    enabled ? `host-${roomId}` : null,
    [
      { table: 'ww_actions', filter: `room_id=eq.${roomId}` },
      { table: 'ww_whispers', filter: `room_id=eq.${roomId}`, event: 'INSERT' },
    ],
    () => run()
  );
  useInterval(run, 2500, enabled);

  /** Avança a fase mesmo se alguém não agiu (botão "Forçar"). */
  const forceAdvance = useCallback(async () => {
    pendingForce.current = true;
    // espera um tick em andamento terminar
    for (let i = 0; i < 40 && busy.current; i += 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
    await run();
  }, [run]);

  return { forceAdvance };
}
