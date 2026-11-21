// Funções puras (sem React Native) para ler a URL de retorno do login — testadas em scripts/test-logic.mjs.

/**
 * Lê parâmetros de "?a=1" e "#b=2" de uma URL de retorno (exp://..., familiacolorida://..., https://...).
 * Retorna { code, access_token, refresh_token, error, error_description, ... }.
 */
export function parseAuthParams(url) {
  const out = {};
  if (!url || typeof url !== 'string') return out;
  const add = (part) => {
    if (!part) return;
    part.split('&').forEach((kv) => {
      if (!kv) return;
      const i = kv.indexOf('=');
      const k = decodeURIComponent((i < 0 ? kv : kv.slice(0, i)).replace(/\+/g, ' '));
      const v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
      if (k) out[k] = v;
    });
  };
  const hashIdx = url.indexOf('#');
  const beforeHash = hashIdx < 0 ? url : url.slice(0, hashIdx);
  const qIdx = beforeHash.indexOf('?');
  if (qIdx >= 0) add(beforeHash.slice(qIdx + 1));
  if (hashIdx >= 0) add(url.slice(hashIdx + 1));
  return out;
}

/** A URL tem algo de login para processar? */
export function isAuthCallback(url) {
  const p = parseAuthParams(url);
  return !!(p.code || p.access_token || p.error || p.error_description);
}

/** Mensagem amigável para erros que voltam na URL do provedor. */
export function authUrlErrorMessage(p) {
  const raw = `${p.error || ''} ${p.error_description || ''}`.trim();
  if (!raw) return '';
  if (/access_denied/i.test(raw)) return 'Login cancelado.';
  if (/redirect|not allowed/i.test(raw))
    return 'Endereço de retorno não autorizado. Confira as Redirect URLs no Supabase (veja o README).';
  return `Erro no login: ${p.error_description || p.error}`;
}
