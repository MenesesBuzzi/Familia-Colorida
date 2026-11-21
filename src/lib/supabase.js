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
      // PKCE: o login do Google volta com ?code=... e o app troca pelo token (seguro em app nativo)
      flowType: 'pkce',
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

/** Entra como visitante (login anônimo, opcional — precisa estar ligado no Supabase). */
export async function signInAsGuest() {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}

/** Transforma erros do Supabase em mensagens amigáveis. */
export function errorMessage(err) {
  if (!err) return 'Erro desconhecido';
  const msg = err.message || String(err);
  if (/Anonymous sign-ins are disabled/i.test(msg))
    return 'O modo visitante está desligado no Supabase. Entre com Google ou e-mail.';
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail (veja a caixa de entrada) e tente entrar de novo.';
  if (/User already registered/i.test(msg)) return 'Este e-mail já tem conta. Toque em "Já tenho conta" e entre.';
  if (/Password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/Unable to validate email|invalid format/i.test(msg)) return 'E-mail inválido.';
  if (/provider is not enabled|Unsupported provider/i.test(msg))
    return 'Login com Google não está ligado no Supabase (Authentication > Providers > Google).';
  if (/rate limit/i.test(msg)) return 'Muitas tentativas. Espere um pouco e tente de novo.';
  if (/code verifier|invalid flow state|flow_state/i.test(msg))
    return 'O login expirou. Toque em "Entrar com Google" de novo.';
  if (/Failed to fetch|Network request failed/i.test(msg))
    return 'Sem conexão com o servidor. Verifique a internet.';
  return msg;
}
