import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

export const supabase = createClient(
  SUPABASE_URL || 'https://exemplo.supabase.co',
  SUPABASE_ANON_KEY || 'chave-ausente',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

// Mantém o token renovado só com o app em primeiro plano (recomendação do Supabase p/ React Native)
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Garante uma sessão anônima (sem login). Retorna o usuário. */
export async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data?.session?.user) return data.session.user;
  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return signed.user;
}

/** Transforma erros do Supabase em mensagens amigáveis. */
export function errorMessage(err) {
  if (!err) return 'Erro desconhecido';
  const msg = err.message || String(err);
  if (/Anonymous sign-ins are disabled/i.test(msg))
    return 'Ative "Anonymous sign-ins" no painel do Supabase (Authentication).';
  if (/Failed to fetch|Network request failed/i.test(msg))
    return 'Sem conexão com o servidor. Verifique a internet.';
  return msg;
}
