import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useInterval, useRealtime } from '../realtime';

/**
 * Chat da sala (tabela ww_chat): canais "vila" e "fantasmas".
 * O RLS só devolve o canal dos fantasmas para quem pode ler (mortos, ou todos no fim).
 * `accessKey` muda quando a permissão muda (morri / fim de jogo) para recarregar na hora.
 */
export function useWWChat(roomId, accessKey) {
  const [state, setState] = useState({ vila: [], fantasmas: [], ready: false, error: null });
  const loading = useRef(false);

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const { data, error } = await supabase
        .from('ww_chat')
        .select('*')
        .eq('room_id', roomId)
        .order('id', { ascending: false })
        .limit(150);
      if (error) throw error;
      const rows = (data || []).slice().reverse();
      setState({
        vila: rows.filter((m) => m.channel === 'vila'),
        fantasmas: rows.filter((m) => m.channel === 'fantasmas'),
        ready: true,
        error: null,
      });
    } catch (e) {
      setState((s) => ({ ...s, ready: true, error: e?.message || String(e) }));
    } finally {
      loading.current = false;
    }
  }, [roomId]);

  useEffect(() => {
    load();
  }, [load, accessKey]);

  useRealtime(`wwchat-${roomId}`, [{ table: 'ww_chat', filter: `room_id=eq.${roomId}` }], () => load());
  useInterval(load, 8000);

  /** Envia mensagem de jogador. Devolve a mensagem de erro (ou null). */
  const send = useCallback(
    async (channel, body, userId, nickname) => {
      const text = String(body || '').trim().slice(0, 500);
      if (!text) return null;
      const { error } = await supabase.from('ww_chat').insert({
        room_id: roomId,
        user_id: userId,
        nickname: String(nickname || 'Jogador').slice(0, 40),
        channel,
        kind: 'jogador',
        body: text,
      });
      if (error) return error.message;
      load();
      return null;
    },
    [roomId, load]
  );

  return { ...state, reload: load, send };
}
