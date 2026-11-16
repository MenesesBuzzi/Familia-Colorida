import { supabase } from '../supabase';
import { fallbackNarration } from './fallback';

const TIMEOUT_MS = 12000;

/**
 * Pede uma narração ao "Sussurro" (Edge Function narrador → Gemini).
 * Se a IA estiver desligada, sem chave ou falhar, usa o texto pronto.
 */
export async function narrate(mode, data, useAI = true) {
  if (!useAI) return fallbackNarration(mode, data);
  try {
    const call = supabase.functions.invoke('narrador', { body: { mode, data } });
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS));
    const { data: res, error } = await Promise.race([call, timeout]);
    if (error || !res?.text) throw error || new Error(res?.error || 'sem texto');
    return sanitize(res.text, mode === 'fantasma' || mode === 'objeto' ? data?.nomes : null);
  } catch (e) {
    console.log('[narrador] usando texto pronto:', e?.message || e);
    return fallbackNarration(mode, data);
  }
}

// Garantia extra: se a IA escapar um nome numa pista, troca por reticências.
function sanitize(text, forbidden) {
  let out = String(text).trim().slice(0, 600);
  (forbidden || []).forEach((n) => {
    if (!n || n.length < 2) return;
    const safe = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${safe}\\b`, 'gi'), '...');
  });
  return out;
}
