import { supabase } from './supabase';
import { getNickname } from './storage';

/** Apelido inicial a partir do usuário (Google: primeiro nome; e-mail: apelido do cadastro). */
export function nickFromUser(user, fallback = '') {
  const m = user?.user_metadata || {};
  const full = (m.full_name || m.name || '').trim();
  const nick = (m.nickname || '').trim() || full.split(/\s+/)[0] || fallback || (user?.email || '').split('@')[0];
  return (nick || 'Jogador').slice(0, 30);
}

export function avatarFromUser(user) {
  const m = user?.user_metadata || {};
  return m.avatar_url || m.picture || null;
}

/**
 * Busca o perfil (tabela profiles). Se não existir (ex.: trigger não rodou), cria.
 * Se o perfil não tem foto mas o Google mandou uma, atualiza.
 */
export async function ensureProfile(user) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  const googleAvatar = avatarFromUser(user);
  if (data) {
    if (!data.avatar_url && googleAvatar) {
      await supabase.from('profiles').update({ avatar_url: googleAvatar }).eq('id', user.id);
      return { ...data, avatar_url: googleAvatar };
    }
    return data;
  }
  const local = await getNickname(); // apelido salvo na v1 (se houver)
  const row = { id: user.id, nickname: nickFromUser(user, local), avatar_url: googleAvatar };
  const { data: created, error: e2 } = await supabase.from('profiles').upsert(row).select().single();
  if (e2) throw e2;
  return created;
}

export async function updateProfile(userId, patch) {
  const clean = { ...patch, updated_at: new Date().toISOString() };
  if (clean.nickname != null) clean.nickname = String(clean.nickname).trim().slice(0, 30);
  const { data, error } = await supabase.from('profiles').update(clean).eq('id', userId).select().single();
  if (error) throw error;
  return data;
}
