import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

/**
 * Quem está com a sala aberta AGORA (Supabase Realtime Presence).
 * Devolve um Set com os user_id online.
 */
export function usePresence(roomId, me) {
  const [online, setOnline] = useState(() => new Set());
  const userId = me?.user_id;
  const nickname = me?.nickname;

  useEffect(() => {
    if (!roomId || !userId) return undefined;
    const channel = supabase.channel(`ww-presence-${roomId}`, { config: { presence: { key: userId } } });
    channel
      .on('presence', { event: 'sync' }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.track({ user_id: userId, nickname: nickname || '', at: new Date().toISOString() });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, userId, nickname]);

  return online;
}
