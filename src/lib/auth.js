// Login: Google (OAuth + PKCE pelo navegador do sistema) e e-mail/senha — tudo via Supabase Auth.
// Funciona no Expo Go (volta para exp://.../--/auth/callback) e no APK (familiacolorida://auth/callback).
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import { authUrlErrorMessage, isAuthCallback, parseAuthParams } from './authUrl';

// Fecha a aba de login quando roda na web (no celular não faz nada)
WebBrowser.maybeCompleteAuthSession();

/** Endereço para onde o Google/Supabase devolve o usuário. Precisa estar nas Redirect URLs do Supabase. */
export function getRedirectUrl() {
  // Expo Go: exp://192.168.0.10:8081/--/auth/callback · APK: familiacolorida://auth/callback
  // Sem expo-auth-session: ele puxa o expo-crypto, que quebra o APK no SDK 58 ("Cannot find native module 'ExpoCrypto'").
  return Linking.createURL('auth/callback', { scheme: 'familiacolorida' });
}

const handled = new Set();

/**
 * Cria a sessão a partir da URL de retorno.
 * PKCE: troca o ?code=... pela sessão. (Se vier #access_token=..., usa direto.)
 * Retorna o usuário ou null se a URL não tiver nada de login.
 */
export async function createSessionFromUrl(url) {
  if (!isAuthCallback(url)) return null;
  const p = parseAuthParams(url);
  const errMsg = authUrlErrorMessage(p);
  if (errMsg) throw new Error(errMsg);

  const key = p.code || p.access_token;
  if (handled.has(key)) {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user ?? null;
  }
  handled.add(key);

  if (p.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(p.code);
    if (error) throw error;
    return data.user;
  }
  const { data, error } = await supabase.auth.setSession({
    access_token: p.access_token,
    refresh_token: p.refresh_token,
  });
  if (error) throw error;
  return data.user;
}

/** "Entrar com Google". Retorna o usuário, ou null se a pessoa cancelou. */
export async function signInWithGoogle() {
  const redirectTo = getRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('O Supabase não devolveu o endereço de login do Google.');

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type === 'success' && res.url) return createSessionFromUrl(res.url);
  if (res.type === 'cancel' || res.type === 'dismiss') {
    // No Android o retorno às vezes chega pelo Linking (App.js trata) — confere se a sessão já existe.
    const { data: s } = await supabase.auth.getSession();
    return s?.session?.user ?? null;
  }
  return null;
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data.user;
}

/** Cria conta. Retorna { user, needsConfirmation } (true se o Supabase exigir confirmar o e-mail). */
export async function signUpWithEmail(email, password, nickname) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: getRedirectUrl(),
      data: { nickname: (nickname || '').trim().slice(0, 30) },
    },
  });
  if (error) throw error;
  return { user: data.user, needsConfirmation: !data.session };
}

export async function signOut() {
  await supabase.auth.signOut();
}
