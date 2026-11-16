// Supabase Edge Function: "narrador" — o Sussurro.
// Chama a API do Google Gemini (camada gratuita) para narrar o jogo do Lobisomem em PT-BR.
// A chave fica SOMENTE no servidor: `supabase secrets set GEMINI_API_KEY=...`
// Opcional: `supabase secrets set GEMINI_MODEL=gemini-2.5-flash` para escolher o modelo.
//
// Corpo esperado: { mode: 'abertura'|'noite'|'votacao'|'cacador'|'fantasma'|'objeto'|'fim', data: {...} }
// Resposta: { text: string | null, error?: string }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `Você é "o Sussurro", o narrador misterioso de uma partida de Lobisomem (Cidade Dorme)
jogada por uma família brasileira, inclusive com crianças. Escreva SEMPRE em português do Brasil,
com tom dramático, sombrio e divertido, mas sem violência explícita nem palavrões.
Seja breve: no máximo 3 frases curtas (até ~60 palavras), salvo instrução diferente.
Nunca invente fatos que não foram informados. Nunca revele papéis secretos que não foram informados como públicos.
Responda apenas com o texto da narração, sem aspas, sem títulos e sem markdown.`;

function list(names: unknown): string {
  return Array.isArray(names) && names.length ? names.join(", ") : "ninguém";
}

// deno-lint-ignore no-explicit-any
function buildPrompt(mode: string, d: any): string {
  switch (mode) {
    case "abertura":
      return `Abra a partida. A vila tem ${d.jogadores} moradores e entre eles há ${d.lobos} lobisomem(ns).
A primeira noite vai cair. Crie clima de suspense.`;
    case "noite": {
      const mortes = (d.mortes ?? []) as { nome: string; papel?: string }[];
      const desc = mortes.length
        ? mortes.map((m) => (m.papel ? `${m.nome} (que era ${m.papel})` : m.nome)).join(" e ")
        : "ninguém";
      return `Narre o amanhecer da noite ${d.rodada}.
Morreram durante a noite: ${desc}.
${d.salvo ? "Alguém foi atacado mas foi salvo misteriosamente (não diga quem nem como)." : ""}
${mortes.length === 0 ? "Ninguém morreu: celebre com alívio e desconfiança." : "Anuncie as mortes pelo nome."}`;
    }
    case "votacao":
      if (d.eliminado) {
        return `A vila votou e decidiu eliminar ${d.eliminado.nome}${d.eliminado.papel ? `, que era ${d.eliminado.papel}` : ""}.
Narre o momento do julgamento de forma dramática.`;
      }
      return `A votação da vila terminou ${d.empate ? "empatada" : "sem decisão"}, e ninguém foi eliminado hoje. Narre a tensão.`;
    case "cacador":
      return `O caçador ${d.cacador}, ao cair, usou sua última flecha e levou ${d.alvo}${d.papel ? ` (que era ${d.papel})` : ""} junto. Narre.`;
    case "fantasma":
      return `Um fantasma (um jogador morto) mandou este sussurro para os vivos: "${String(d.sussurro ?? "").slice(0, 120)}".
Reescreva como uma PISTA ENIGMÁTICA e ambígua, em 1 ou 2 frases, como se viesse do além.
REGRAS: NUNCA escreva nenhum destes nomes, nem parte deles: ${list(d.nomes)}.
Se o sussurro citar alguém, troque por uma insinuação vaga (ex.: "aquele que fala demais", "quem senta perto do fogo",
"um nome que começa com uma letra entre A e M"). Pode ser poético. Não confirme se a pista é verdadeira.`;
    case "objeto":
      return `Regra dos "Objetos falantes": hoje quem fala é ${d.objeto} da vila, em primeira pessoa.
Fatos VERDADEIROS da noite (use apenas para inspirar uma pista VAGA): ${JSON.stringify(d.fatos ?? {})}.
Crie 1 ou 2 frases misteriosas que ajudem só um pouquinho a vila.
NUNCA escreva nenhum destes nomes, nem parte deles: ${list(d.nomes)}.
Pode no máximo insinuar algo como a letra inicial de um nome dentro de um intervalo, ou um comportamento.`;
    case "fim":
      return `Fim de jogo! Venceram ${d.vencedor === "lobos" ? "os LOBISOMENS" : "os ALDEÕES (a vila)"}.
Lobisomens eram: ${list(d.lobos)}. Faça um encerramento épico e curto.`;
    default:
      return `Diga uma frase curta e misteriosa sobre a vila.`;
  }
}

async function callGemini(prompt: string, key: string): Promise<string | null> {
  const preferred = Deno.env.get("GEMINI_MODEL");
  const models = [preferred, "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"].filter(
    (m, i, a): m is string => !!m && a.indexOf(m) === i,
  );
  let lastError = "";
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.95, maxOutputTokens: 2048 },
          }),
        },
      );
      if (!res.ok) {
        lastError = `${model}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
        continue; // tenta o próximo modelo
      }
      const json = await res.json();
      // deno-lint-ignore no-explicit-any
      const parts = json?.candidates?.[0]?.content?.parts as any[] | undefined;
      const text = parts?.map((p) => p?.text ?? "").join("").trim();
      if (text) return text;
      lastError = `${model}: resposta vazia`;
    } catch (e) {
      lastError = `${model}: ${(e as Error).message}`;
    }
  }
  throw new Error(lastError || "Falha no Gemini");
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respond({ text: null, error: "Use POST" }, 405);

  let payload: { mode?: string; data?: unknown };
  try {
    payload = await req.json();
  } catch {
    return respond({ text: null, error: "JSON inválido" }, 400);
  }

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return respond({ text: null, error: "GEMINI_API_KEY não configurada" });

  try {
    const text = await callGemini(buildPrompt(String(payload.mode ?? ""), payload.data ?? {}), key);
    return respond({ text });
  } catch (e) {
    // O app usa narração pronta (fallback) quando text = null
    return respond({ text: null, error: (e as Error).message });
  }
});
