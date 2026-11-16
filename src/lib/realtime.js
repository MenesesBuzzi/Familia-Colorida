import { useEffect, useLayoutEffect, useRef } from 'react';
import { supabase } from './supabase';

let counter = 0;

/**
 * Escuta mudanças de tabelas (postgres_changes) e chama onChange.
 * subs: [{ table: 'ss_messages', filter: 'group_id=eq.123', event?: 'INSERT' }]
 * O RLS do Supabase garante que só chegam linhas que o usuário pode ver.
 */
export function useRealtime(key, subs, onChange) {
  const cb = useRef(onChange);
  useLayoutEffect(() => {
    cb.current = onChange;
  });

  useEffect(() => {
    if (!key) return undefined;
    counter += 1;
    let channel = supabase.channel(`${key}:${counter}`);
    subs.forEach((s) => {
      channel = channel.on(
        'postgres_changes',
        { event: s.event || '*', schema: 'public', table: s.table, ...(s.filter ? { filter: s.filter } : {}) },
        (payload) => cb.current && cb.current(payload, s.table)
      );
    });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Chama fn a cada ms milissegundos (rede de segurança caso o realtime perca algo). */
export function useInterval(fn, ms, enabled = true) {
  const cb = useRef(fn);
  useLayoutEffect(() => {
    cb.current = fn;
  });
  useEffect(() => {
    if (!enabled || !ms) return undefined;
    const id = setInterval(() => cb.current && cb.current(), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
}
