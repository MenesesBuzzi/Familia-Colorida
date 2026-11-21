import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useInterval, useRealtime } from '../realtime';

/**
 * Tudo que UM jogador pode ver da sala (o RLS filtra o resto):
 * sala, jogadores, meu papel (+ outros lobos se eu for lobo), mural, minhas infos privadas,
 * minhas ações da rodada (+ votos dos lobos) e meus sussurros.
 */
export function useWWRoom(roomId, userId) {
  const [data, setData] = useState({
    room: null,
    players: [],
    roles: [],
    feed: [],
    privates: [],
    actions: [],
    whispers: [],
    error: null,
  });
  const loading = useRef(false);
  const again = useRef(false);

  const load = useCallback(async () => {
    if (loading.current) {
      again.current = true;
      return;
    }
    loading.current = true;
    try {
      const { data: room, error } = await supabase.from('ww_rooms').select('*').eq('id', roomId).maybeSingle();
      if (error) throw error;
      if (!room) {
        setData((d) => ({ ...d, error: 'Sala não encontrada (talvez você tenha sido removido).' }));
        return;
      }
      const [players, roles, feed, privates, actions, whispers] = await Promise.all([
        supabase.from('ww_players').select('*').eq('room_id', roomId).order('joined_at'),
        supabase.from('ww_roles').select('*').eq('room_id', roomId),
        supabase.from('ww_feed').select('*').eq('room_id', roomId).order('id', { ascending: false }).limit(80),
        supabase.from('ww_private').select('*').eq('room_id', roomId).eq('user_id', userId).order('id', { ascending: false }),
        supabase.from('ww_actions').select('*').eq('room_id', roomId).eq('round', room.round),
        supabase.from('ww_whispers').select('*').eq('room_id', roomId).eq('user_id', userId).order('id', { ascending: false }),
      ]);
      setData({
        room,
        players: players.data || [],
        roles: roles.data || [],
        feed: feed.data || [],
        privates: privates.data || [],
        actions: actions.data || [],
        whispers: whispers.data || [],
        error: null,
      });
    } catch (e) {
      setData((d) => ({ ...d, error: e?.message || String(e) }));
    } finally {
      loading.current = false;
      if (again.current) {
        again.current = false;
        load();
      }
    }
  }, [roomId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const f = `room_id=eq.${roomId}`;
  useRealtime(
    `ww-${roomId}`,
    [
      { table: 'ww_rooms', filter: `id=eq.${roomId}` },
      { table: 'ww_players', filter: f },
      { table: 'ww_roles', filter: f },
      { table: 'ww_feed', filter: f },
      { table: 'ww_private', filter: f },
      { table: 'ww_actions', filter: f },
    ],
    () => load()
  );
  useInterval(load, 5000);

  return { ...data, reload: load };
}
