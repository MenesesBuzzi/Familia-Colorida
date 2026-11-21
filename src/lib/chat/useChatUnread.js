import { useCallback, useEffect, useState } from 'react';
import { useInterval, useRealtime } from '../realtime';
import { myChatRooms } from './api';
import { totalUnread } from './logic';

/** Total de mensagens não lidas (selinho do ícone "Chat" na tela inicial). */
export function useChatUnread(userId) {
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setTotal(totalUnread(await myChatRooms()));
    } catch {
      // sem as tabelas da v3 ainda: fica sem selinho
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);
  // qualquer mensagem nova que eu possa ver (o RLS filtra) recarrega a contagem
  useRealtime(userId ? `chat-unread-${userId}` : null, [{ table: 'chat_messages', event: 'INSERT' }], () => load());
  useInterval(load, 30000, !!userId);
  return total;
}
