import { supabase } from '../supabase';
import { fallbackNarration } from './fallback';
import { aiSoundChoices, aiSoundRef } from './soundtrack';

const TIMEOUT_MS = 12000;

/**
 * Pede uma narração ao "Sussurro" (Edge Function narrador → Gemini).
 * Se a IA estiver desligada, sem chave ou falhar, usa o texto pronto.
 */
export async function narrate(mode, data, useAI = true) {
  return (await narrateScene(mode, data, useAI, false)).text;
}

/**
 * v3: igual a narrate(), mas com wantSound=true manda a lista de sons (data.sons) e a IA devolve
 * também `som` (chave de um som embutido) para a trilha do modo "IA escolhe". Devolve { text, som }.
 * Respostas antigas (sem `som`) continuam valendo: som = null e o app usa o som padrão da cena.
 */
export async function narrateScene(mode, data, useAI = true, wantSound = false) {
  if (!useAI) return { text: fallbackNarration(mode, data), som: null };
  try {
    const body = { mode, data: wantSound ? { ...(data || {}), sons: aiSoundChoices() } : data };
    const call = supabase.functions.invoke('narrador', { body });
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS));
    const { data: res, error } = await Promise.race([call, timeout]);
    if (error || !res?.text) throw error || new Error(res?.error || 'sem texto');
    const text = sanitize(res.text, mode === 'fantasma' || mode === 'objeto' ? data?.nomes : null);
    const som = wantSound && aiSoundRef(res.som) ? String(res.som).trim().toLowerCase() : null;
    return { text, som };
  } catch (e) {
    console.log('[narrador] usando texto pronto:', e?.message || e);
    return { text: fallbackNarration(mode, data), som: null };
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
