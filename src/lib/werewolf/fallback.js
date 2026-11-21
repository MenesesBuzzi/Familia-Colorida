// Narração pronta, usada quando a IA (Edge Function "narrador") falha ou está desligada.
import { initialRangeHint } from './logic.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function maskNames(text, names) {
  let out = text;
  (names || []).forEach((n) => {
    if (!n) return;
    const safe = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(safe, 'gi'), initialRangeHint(n));
  });
  return out;
}

export function fallbackNarration(mode, d = {}) {
  switch (mode) {
    case 'abertura':
      return pick([
        `A lua cheia sobe sobre a vila de ${d.jogadores} moradores... e ${d.lobos} deles não são o que parecem. Fechem os olhos. A noite começou.`,
        `Um uivo corta o silêncio. Entre vocês, ${d.lobos} lobisomem(ns) espera(m) a escuridão. Boa sorte, vila.`,
      ]);
    case 'noite': {
      const mortes = d.mortes || [];
      if (!mortes.length) {
        return pick([
          `O sol nasce e... todos acordaram! ${d.salvo ? 'Alguém escapou por um fio esta noite.' : 'Os lobos pareciam distraídos.'} Mas por quanto tempo?`,
          'Nenhum grito esta noite. A vila respira aliviada — e desconfiada.',
        ]);
      }
      const desc = mortes.map((m) => (m.papel ? `${m.nome} (${m.papel})` : m.nome)).join(' e ');
      return pick([
        `O galo canta, mas nem todos acordam. A vila encontra ${desc} sem vida ao amanhecer.`,
        `Pegadas enormes na lama... e a triste notícia: ${desc} não resistiu à noite.`,
      ]);
    }
    case 'votacao':
      if (d.eliminado) {
        return `A vila decidiu: ${d.eliminado.nome}${d.eliminado.papel ? `, que era ${d.eliminado.papel},` : ''} é levado(a) para fora dos portões. A justiça foi feita... ou não?`;
      }
      return d.empate
        ? 'Empate! A vila se divide e ninguém é eliminado hoje.'
        : 'A vila hesitou e ninguém foi eliminado hoje.';
    case 'cacador':
      return `Ao cair, ${d.cacador} ergue o arco uma última vez... e ${d.alvo}${d.papel ? ` (${d.papel})` : ''} cai junto!`;
    case 'fantasma': {
      const masked = maskNames(d.sussurro || '', d.nomes);
      return `👻 Um vento gelado traz uma voz do além: "${masked}"`;
    }
    case 'objeto': {
      const f = d.fatos || {};
      const hint = f.umLobo ? initialRangeHint(f.umLobo) : 'alguém muito quieto';
      return pick([
        `${cap(d.objeto)} range na noite: "Vi uma sombra com ${hint}..."`,
        `${cap(d.objeto)} murmura: "${f.vitima ? 'Ouvi passos antes do grito.' : 'Ninguém caiu, mas alguém rondava.'} Desconfiem de ${hint}."`,
      ]);
    }
    case 'fim':
      return d.vencedor === 'lobos'
        ? `Os uivos tomam conta da vila. Os lobisomens venceram! (${(d.lobos || []).join(', ')})`
        : `O último lobo foi descoberto. A vila está salva! Lobos eram: ${(d.lobos || []).join(', ')}.`;
    default:
      return 'O vento sopra entre as casas...';
  }
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
