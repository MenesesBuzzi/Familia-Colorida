import { useCallback, useEffect, useRef, useState } from 'react';
import { createAudioPlayer } from 'expo-audio';
import { supabase } from '../supabase';
import { useAudio } from '../audio/context';
import { publicUrl } from '../audio/files';
import { BUILTIN_SOURCES } from '../audio/sounds';
import {
  deathsSince,
  fxPayload,
  normalizeTrilha,
  parseRef,
  sceneOf,
  shouldLoop,
  soundForScene,
} from './soundtrack';

export const LOBO_BUCKET = 'lobo-sons';
const AMBIENT_VOLUME = 0.55;

/** Referência ('b:noite' / 'u:caminho') -> fonte do expo-audio. */
export function sourceOf(ref) {
  const p = parseRef(ref);
  if (!p) return null;
  if (p.kind === 'builtin') return BUILTIN_SOURCES[p.key] ?? null;
  const uri = publicUrl(LOBO_BUCKET, p.path);
  return uri ? { uri } : null;
}

function safe(fn) {
  try {
    return fn();
  } catch (e) {
    console.log('[trilha]', e?.message || e);
    return undefined;
  }
}

/**
 * Trilha sonora do Lobisomem (v3), roda em TODOS os celulares da sala:
 *  - som de fundo por cena (noite, dia, votação...) conforme settings.trilha da sala;
 *  - "morte" quando alguém morre; vitória/derrota no fim;
 *  - mesa de efeitos: o anfitrião dispara um som para todo mundo (Realtime broadcast);
 *  - pausa a Rádio enquanto a partida rola e devolve no fim.
 */
export function useWWSoundtrack({ roomId, room, players, nickname }) {
  const audio = useAudio();
  const [muted, setMuted] = useState(false);
  const [lastFx, setLastFx] = useState(null);
  const ambient = useRef(null);
  const fxPool = useRef([]);
  const fxIdx = useRef(0);
  const currentRef = useRef(null);
  const prevAlive = useRef(null);
  const channel = useRef(null);
  const mutedRef = useRef(false);
  const fxTimer = useRef(null);

  const trilha = normalizeTrilha(room?.settings?.trilha);
  const scene = sceneOf(room);
  const ref = soundForScene(scene, trilha, room?.state?.som, room);
  const status = room?.status;

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // players criados uma vez; liberados ao sair da sala
  useEffect(() => {
    ambient.current = safe(() => createAudioPlayer(null, { updateInterval: 1000 }));
    fxPool.current = [0, 1].map(() => safe(() => createAudioPlayer(null, { updateInterval: 1000 }))).filter(Boolean);
    return () => {
      safe(() => ambient.current?.remove());
      fxPool.current.forEach((p) => safe(() => p.remove()));
      ambient.current = null;
      fxPool.current = [];
      currentRef.current = null;
    };
  }, []);

  // Rádio: pausa durante a partida
  const { suspendRadio, resumeRadio } = audio;
  useEffect(() => {
    if (status !== 'jogando') return undefined;
    suspendRadio('lobisomem');
    return () => resumeRadio('lobisomem');
  }, [status, suspendRadio, resumeRadio]);

  const playFx = useCallback((fxRef) => {
    if (mutedRef.current) return;
    const src = sourceOf(fxRef);
    const pool = fxPool.current;
    if (!src || !pool.length) return;
    const p = pool[fxIdx.current % pool.length];
    fxIdx.current += 1;
    safe(() => {
      p.replace(src);
      p.loop = false;
      p.volume = 1;
      p.play();
    });
  }, []);

  // som de fundo da cena
  useEffect(() => {
    const p = ambient.current;
    if (!p) return;
    const key = `${scene}|${ref}`;
    if (muted || !ref) {
      safe(() => p.pause());
      currentRef.current = muted ? null : key;
      return;
    }
    if (currentRef.current === key) {
      safe(() => p.play());
      return;
    }
    currentRef.current = key;
    const src = sourceOf(ref);
    if (!src) return;
    safe(() => {
      p.replace(src);
      p.loop = shouldLoop(scene, ref);
      p.volume = AMBIENT_VOLUME;
      p.play();
    });
  }, [scene, ref, muted]);

  // alguém morreu -> toca a cena "morte" por cima
  useEffect(() => {
    const { alive, died } = deathsSince(prevAlive.current, players);
    const wasNull = prevAlive.current == null;
    prevAlive.current = alive;
    if (wasNull || !died || status !== 'jogando') return;
    const deathRef = soundForScene('morte', trilha, null, room);
    if (deathRef) playFx(deathRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, status]);

  // nova partida: zera a contagem de vivos
  useEffect(() => {
    if (status === 'lobby') prevAlive.current = null;
  }, [status]);

  // mesa de efeitos (broadcast: chega em todos, inclusive em quem mandou)
  useEffect(() => {
    if (!roomId) return undefined;
    const ch = supabase.channel(`wwfx:${roomId}`, { config: { broadcast: { self: true } } });
    ch.on('broadcast', { event: 'fx' }, ({ payload }) => {
      if (!payload?.ref) return;
      setLastFx({ ref: payload.ref, from: payload.from });
      clearTimeout(fxTimer.current);
      fxTimer.current = setTimeout(() => setLastFx(null), 6000);
      playFx(payload.ref);
    }).subscribe();
    channel.current = ch;
    return () => {
      clearTimeout(fxTimer.current);
      channel.current = null;
      supabase.removeChannel(ch);
    };
  }, [roomId, playFx]);

  /** Anfitrião dispara um efeito para a sala inteira. */
  const sendFx = useCallback(
    async (fxRef) => {
      const payload = fxPayload(fxRef, nickname);
      if (!payload || !channel.current) return false;
      const res = await channel.current.send({ type: 'broadcast', event: 'fx', payload });
      return res === 'ok';
    },
    [nickname]
  );

  return { scene, ref, trilha, muted, setMuted, sendFx, lastFx, playFx };
}
