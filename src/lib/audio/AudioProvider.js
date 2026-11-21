// Áudio global do app (v3): a Rádio continua tocando enquanto a pessoa usa outras telas
// (e em segundo plano no APK), e as falas do walkie-talkie chegam e tocam sozinhas.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAudioPlayer } from 'expo-audio';
import { supabase } from '../supabase';
import { useInterval, useRealtime } from '../realtime';
import { AudioContext, AudioStatusContext } from './context';
import { applyAudioMode } from './mode';
import { signedUrl } from './files';
import { advanceRadio, radioControl, saveDuration, trackUrl, VOICE_BUCKET } from '../radio/library';
import { canControl, expectedPosition, needsResync, shouldAutoPlayVoice, trackEnded } from '../radio/queue';

const DUCK_VOLUME = 0.2;

function safe(fn) {
  try {
    return fn();
  } catch (e) {
    console.log('[audio]', e?.message || e);
    return undefined;
  }
}

export function AudioProvider({ userId, children }) {
  const [roomId, setRoomId] = useState(null);
  const [room, setRoom] = useState(null);
  const [status, setStatus] = useState(null); // { playing, position, duration, buffering }
  const [suspendSet, setSuspendSet] = useState(() => new Set());
  const [duckSet, setDuckSet] = useState(() => new Set());
  const [voiceNow, setVoiceNow] = useState(null); // { nickname }

  const player = useRef(null);
  const loadedTrack = useRef(null);
  const pendingSeek = useRef(null);
  const advancing = useRef(false);
  const roomRef = useRef(null);
  const voiceQueue = useRef([]);
  const voicePlayer = useRef(null);
  const voiceBusy = useRef(false);
  const heard = useRef(new Set());
  const playNextRef = useRef(null);
  const lockKey = useRef(null);

  const suspended = suspendSet.size > 0;
  const ducked = duckSet.size > 0 || !!voiceNow;
  const isOwner = canControl(room, userId);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // modo de áudio (silencioso + segundo plano) uma vez
  useEffect(() => {
    applyAudioMode();
  }, []);

  // saiu da conta: para tudo
  useEffect(() => {
    setRoomId(null);
  }, [userId]);

  const getPlayer = useCallback(() => {
    if (!player.current) {
      player.current = createAudioPlayer(null, { updateInterval: 1000, keepAudioSessionActive: true });
    }
    return player.current;
  }, []);

  // libera tudo ao fechar o app / desmontar
  useEffect(
    () => () => {
      safe(() => player.current?.remove());
      safe(() => voicePlayer.current?.remove());
      player.current = null;
      voicePlayer.current = null;
    },
    []
  );

  // ------------------------------------------------------------ estado da sala
  const refreshRoom = useCallback(async () => {
    if (!roomId) return;
    const { data, error } = await supabase.from('radio_rooms').select('*').eq('id', roomId).maybeSingle();
    if (error) return;
    if (!data) {
      setRoomId(null); // rádio apagada ou saí dela
      return;
    }
    setRoom(data);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setStatus(null);
      loadedTrack.current = null;
      voiceQueue.current = [];
      lockKey.current = null;
      safe(() => {
        player.current?.pause();
        player.current?.setActiveForLockScreen(false);
      });
      return;
    }
    heard.current = new Set();
    refreshRoom();
  }, [roomId, refreshRoom]);


  // ------------------------------------------------------------ avançar fila (celular do dono)
  const advance = useCallback(async () => {
    const r = roomRef.current;
    if (!r || advancing.current || !canControl(r, userId)) return;
    advancing.current = true;
    try {
      await advanceRadio(r);
    } catch (e) {
      console.log('[rádio] não avançou:', e?.message || e);
    } finally {
      setTimeout(() => {
        advancing.current = false;
      }, 3000);
    }
  }, [userId]);

  // eventos do player (posição, fim da música, duração)
  useEffect(() => {
    if (!roomId) return undefined;
    const p = getPlayer();
    const sub = p.addListener('playbackStatusUpdate', (s) => {
      setStatus({ playing: !!s.playing, position: s.currentTime || 0, duration: s.duration || 0, buffering: !!s.isBuffering });
      if (s.isLoaded && pendingSeek.current != null) {
        const to = pendingSeek.current;
        pendingSeek.current = null;
        p.seekTo(to).catch(() => {});
      }
      const r = roomRef.current;
      if (s.isLoaded && s.duration > 0 && r?.now_track_id && !r.now_duration) {
        setRoom((x) => (x ? { ...x, now_duration: s.duration } : x));
        saveDuration(r.now_track_id, s.duration).catch(() => {});
      }
      if (s.didJustFinish) advance();
    });
    return () => sub.remove();
  }, [roomId, getPlayer, advance]);

  // ------------------------------------------------------------ sincronia com a sala
  const sync = useCallback(
    (force = false) => {
      const r = roomRef.current;
      if (!roomId || !r) return;
      const p = getPlayer();
      if (!r.now_track_id || !r.now_path) {
        safe(() => p.pause());
        loadedTrack.current = null;
        return;
      }
      const expected = expectedPosition(r, Date.now(), r.now_duration);
      if (loadedTrack.current !== r.now_track_id) {
        loadedTrack.current = r.now_track_id;
        safe(() => p.replace({ uri: trackUrl(r.now_path), name: r.now_title || 'Rádio Amigo' }));
        pendingSeek.current = expected > 1 ? expected : null;
      } else if (force || needsResync(p.currentTime, expected)) {
        if (p.isLoaded) p.seekTo(expected).catch(() => {});
        else pendingSeek.current = expected;
      }
      if (r.now_playing && !suspended) {
        safe(() => p.play());
        // controles na tela de bloqueio (no Android isso mantém a música tocando em segundo plano)
        if (lockKey.current !== r.now_track_id) {
          lockKey.current = r.now_track_id;
          safe(() =>
            p.setActiveForLockScreen(true, { title: r.now_title || 'Rádio Amigo', artist: r.now_artist || r.name || 'Família Colorida' })
          );
        }
      } else {
        safe(() => p.pause());
      }
    },
    [roomId, getPlayer, suspended]
  );

  useEffect(() => {
    sync();
  }, [sync, room?.now_track_id, room?.now_playing, room?.now_offset, room?.now_updated_at]);

  // confere a sincronia de vez em quando; o dono também avança se o player perdeu o fim da música
  useInterval(
    () => {
      const r = roomRef.current;
      if (!r?.now_playing || suspended) return;
      sync();
      if (canControl(r, userId) && trackEnded(r, r.now_duration, Date.now(), -4)) advance();
    },
    15000,
    !!roomId
  );

  // volume: abaixa enquanto alguém fala ou grava
  useEffect(() => {
    if (!player.current) return;
    player.current.volume = ducked ? DUCK_VOLUME : 1;
  }, [ducked, room?.now_track_id]);

  // ------------------------------------------------------------ walkie-talkie
  const playNextVoice = useCallback(async () => {
    if (voiceBusy.current) return;
    const clip = voiceQueue.current.shift();
    if (!clip) return;
    voiceBusy.current = true;
    let timer = null;
    let sub = null;
    const done = () => {
      clearTimeout(timer);
      safe(() => sub?.remove());
      safe(() => voicePlayer.current?.remove());
      voicePlayer.current = null;
      voiceBusy.current = false;
      setVoiceNow(null);
      setTimeout(() => playNextRef.current?.(), 150);
    };
    try {
      const url = await signedUrl(VOICE_BUCKET, clip.storage_path);
      setVoiceNow({ nickname: clip.nickname || 'Alguém' });
      voicePlayer.current = createAudioPlayer({ uri: url }, { updateInterval: 300 });
      sub = voicePlayer.current.addListener('playbackStatusUpdate', (s) => {
        if (s.didJustFinish || s.error) done();
      });
      voicePlayer.current.play();
      timer = setTimeout(done, Math.min(125000, (clip.duration_ms || 30000) + 6000));
    } catch (e) {
      console.log('[walkie-talkie] não tocou:', e?.message || e);
      done();
    }
  }, []);

  useEffect(() => {
    playNextRef.current = playNextVoice;
  }, [playNextVoice]);

  const onVoice = useCallback(
    (clip) => {
      if (!clip?.id || heard.current.has(clip.id)) return;
      heard.current.add(clip.id);
      if (!shouldAutoPlayVoice(clip, userId)) return;
      voiceQueue.current.push(clip);
      playNextVoice();
    },
    [userId, playNextVoice]
  );

  useRealtime(
    roomId ? `fc-radio-live:${roomId}` : null,
    [
      { table: 'radio_rooms', filter: `id=eq.${roomId}` },
      { table: 'radio_voice', filter: `room_id=eq.${roomId}`, event: 'INSERT' },
    ],
    (payload, table) => {
      if (table === 'radio_rooms') {
        if (payload.eventType === 'DELETE') setRoomId(null);
        else if (payload.new?.id) setRoom((r) => ({ ...(r || {}), ...payload.new }));
        return;
      }
      if (table === 'radio_voice') onVoice(payload.new);
    }
  );
  useInterval(refreshRoom, 20000, !!roomId);

  // ------------------------------------------------------------ API para as telas
  const tuneIn = useCallback((id) => setRoomId(id || null), []);
  const tuneOut = useCallback(() => setRoomId(null), []);

  const suspendRadio = useCallback((reason) => {
    setSuspendSet((s) => (s.has(reason) ? s : new Set([...s, reason])));
  }, []);
  const resumeRadio = useCallback((reason) => {
    setSuspendSet((s) => {
      if (!s.has(reason)) return s;
      const n = new Set(s);
      n.delete(reason);
      return n;
    });
  }, []);
  const setDuck = useCallback((reason, on) => {
    setDuckSet((s) => {
      if (on === s.has(reason)) return s;
      const n = new Set(s);
      if (on) n.add(reason);
      else n.delete(reason);
      return n;
    });
  }, []);

  /** Controles do dono: 'play' | 'pause' | 'skip' | 'stop' | { queueId } | { trackId } */
  const control = useCallback(
    async (action, opts = {}) => {
      const r = roomRef.current;
      const id = opts.roomId || r?.id;
      if (!id) return;
      const fresh = async () => (await supabase.from('radio_rooms').select('*').eq('id', id).maybeSingle()).data;
      const base = r && r.id === id ? r : action === 'play' || action === 'pause' ? await fresh() : null;
      const pos = base ? expectedPosition(base, Date.now(), base.now_duration) : 0;
      if (action === 'skip') {
        const row = await fresh();
        if (row) await advanceRadio(row);
      } else if (action === 'queue') await radioControl(id, 'queue', { queueId: opts.queueId });
      else if (action === 'track') await radioControl(id, 'track', { trackId: opts.trackId });
      else await radioControl(id, action, { offset: pos });
      if (r && r.id === id) refreshRoom();
    },
    [refreshRoom]
  );

  const value = useMemo(
    () => ({
      radio: { roomId, room, isOwner, suspended, voiceNow },
      tuneIn,
      tuneOut,
      suspendRadio,
      resumeRadio,
      setDuck,
      control,
      refreshRoom,
    }),
    [roomId, room, isOwner, suspended, voiceNow, tuneIn, tuneOut, suspendRadio, resumeRadio, setDuck, control, refreshRoom]
  );

  return (
    <AudioContext.Provider value={value}>
      <AudioStatusContext.Provider value={roomId ? status : null}>{children}</AudioStatusContext.Provider>
    </AudioContext.Provider>
  );
}
