import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ── Provider 1: OpenAI-compatible ───────────────────────────────────────────────
const LLM_BASE_URL = (process.env.LLM_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const LLM_API_KEY  = process.env.LLM_API_KEY ?? '';
const LLM_MODEL    = process.env.LLM_MODEL ?? 'google/gemma-4-31b-it:free';

// ── Provider 2: HappySeeds LLM gateway (Claude) ───────────────────────────────
// BTY_LLM_SERVER_BASE_URL é injetado no sandbox HappySeeds.
// No app publicado esse var não chega — usa aigw-api.happyseeds.ai diretamente.
const BTY_BASE  = (
  process.env.BTY_LLM_SERVER_BASE_URL ||
  'https://aigw-api.happyseeds.ai/v1'
).replace(/\/$/, '');
const BTY_KEY   = process.env.BTY_LLM_SERVER_API_KEY ?? process.env.HAPPYSEEDS_KEY ?? '';
const BTY_MODEL = 'claude-sonnet-4.6';

// ── Provider 3: Groq (gratuito, limite generoso, vision via llama) ─────────────
const GROQ_KEY_ENV = process.env.GROQ_API_KEY ?? '';
const GROQ_BASE  = 'https://api.groq.com/openai/v1';
const GROQ_MODEL = 'qwen/qwen3.6-27b'; // mais moderno — usa reasoning_effort:none para resposta direta

// Lê do banco se não estiver no env
async function getGroqKey(): Promise<string> {
  if (GROQ_KEY_ENV) return GROQ_KEY_ENV;
  try {
    const { db } = await import('@/db');
    const { settings: settingsTable } = await import('@/db/schemas/settings');
    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, 'groq_api_key')).limit(1);
    return rows[0]?.value ?? '';
  } catch { return ''; }
}

// Mantidos para backward-compat (SSE media — não mais usado para chat)
const REACTUS_BASE = (process.env.REACTUS_BASE_URL ?? '').replace(/\/$/, '');
const REACTUS_KEY  = process.env.HAPPYSEEDS_KEY ?? process.env.BTY_LLM_SERVER_API_KEY ?? '';
const PROJECT_ID   = process.env.HAPPYSEEDS_PROJECT_ID ?? process.env.REACTUS_PROJECT_ID ?? '';

interface PromoResult { product: string; versions: string[] }

// ── System prompt (copywriting das promos) ────────────────────────────────────
const SYSTEM_PROMPT = `Você é especialista em copywriting para grupos de promoções no WhatsApp.

REGRA ABSOLUTA DE FORMATO: Sua resposta deve conter APENAS o JSON solicitado. Nenhuma palavra antes. Nenhuma palavra depois. Nenhuma nota técnica. Nenhuma explicação. Nenhum asterisco. Nenhum markdown. Se você não tiver um dado, invente um plausível — mas NUNCA quebre o formato JSON.

Use os dados de produto fornecidos no texto (título, preço, desconto) como base para os preços. Complemente com o que conseguir ver na imagem.

═══════════════════════════════════════
A ISCA — regra principal
═══════════════════════════════════════
A isca é a PRIMEIRA linha. Uma frase curta (até 10 palavras) que reage ao produto de forma específica — como se um amigo visse aquela oferta e mandasse no grupo com entusiasmo genuíno.

ATENÇÃO: As 3 versões DEVEM ter iscas completamente diferentes entre si, cada uma com um ângulo exclusivo:

VERSÃO 1 — Ângulo PREÇO: menciona o valor ou desconto de forma surpreendente. Usa o número real.
  Ex: "R$ 49 por 1kg de creatina é quase impossível"
  Ex: "Esse celular por menos de 1.300 é coisa séria"

VERSÃO 2 — Ângulo USO PRÁTICO: fala do que o produto faz, resolve ou muda na vida. Sem mencionar preço.
  Ex: "Bateria que dura dois dias sem carregar"
  Ex: "Quem malha sabe o que 1kg de creatina representa"
  Ex: "Café de cápsula em casa sem gastar fortunas"

VERSÃO 3 — Ângulo MARCA ou CONTEXTO: menciona a marca SE for reconhecível (Samsung, Apple, Nike, Sony, Philips, Nespresso, Tramontina, Xiaomi etc.) ou faz um comentário de contexto/comparação. Se a marca não for famosa, use comparação ou contexto.
  Ex: "Galaxy desse preço não faz sentido nenhum" ← marca famosa
  Ex: "Tá mais barato que produto sem metade das especificações" ← contexto
  Ex: "Soldiers com esse desconto é raro de ver" ← marca menos conhecida mas nome funciona

PROIBIDO em qualquer isca:
✗ Frases genéricas: "Não acredito nesse preço", "Achei algo bom", "Finalmente...", "Não podia deixar passar", "Olha essa oferta"
✗ Palavras: "pessoal", "olha só", "atenção", "aproveite", "corre", "imperdível", "incrível", "oferta", "promoção", "compartilhando", "confira"
✗ Começar com "Esse/Esta/Aqui/Você/Eu/A gente"
✗ Duas versões com iscas parecidas ou do mesmo ângulo

═══════════════════════════════════════
ESTRUTURA DE CADA VERSÃO (4 partes)
═══════════════════════════════════════

PARTE 1 — ISCA
[frase específica deste produto, ângulo exclusivo por versão]

PARTE 2 — PRODUTO E PREÇO
[emoji do produto] [Nome do produto]

💰 De R$ [preço original] por R$ [preço Pix] no Pix
💳 Ou [N]x de R$ [valor parcela] sem juros (SOMENTE se parcelamento visível)

PARTE 3 — ESPECIFICAÇÕES
• [spec 1 visível na imagem]
• [spec 2 visível]
• [spec 3 visível]
(máximo 4 bullets, use • como marcador, não invente specs ausentes)

PARTE 4 — LINK
👉 [link] (SOMENTE se link fornecido; senão omita esta parte inteira)

═══════════════════════════════════════
FORMATO FINAL
═══════════════════════════════════════
[isca]

[emoji] [nome do produto]

💰 De R$ X por R$ Y no Pix
💳 Ou Nx de R$ Z sem juros

• spec 1
• spec 2
• spec 3

👉 [link]

REGRAS FINAIS:
- Texto puro — ZERO asteriscos, ZERO markdown, ZERO negrito
- Emojis APENAS nos lugares indicados acima
- As 3 iscas OBRIGATORIAMENTE de ângulos diferentes: preço, uso prático, marca/contexto
- Specs apenas do que estiver visível na imagem

IMPORTANTE SOBRE O JSON DE SAÍDA:
- Cada item do array "versions" é UMA STRING ÚNICA contendo o texto INTEIRO da versão (isca + preço + specs + link, tudo junto, separado por \\n dentro da mesma string).
- NUNCA divida uma versão em várias strings do array. O array "versions" deve ter EXATAMENTE 3 strings — uma por versão completa.
- Escape corretamente aspas e quebras de linha dentro das strings do JSON.

RESPONDA APENAS com JSON válido sem markdown:
{"product":"nome","versions":["versão 1 completa","versão 2 completa","versão 3 completa"]}`;

// ── Prompt dedicado para o Groq (texto puro, sem visão) ───────────────────────
const GROQ_SYSTEM_PROMPT = `Você é especialista em copywriting para grupos de promoções no WhatsApp.

REGRA ABSOLUTA DE FORMATO: Sua resposta deve conter APENAS o JSON solicitado. Nenhuma palavra antes. Nenhuma palavra depois. Nenhuma nota técnica. Nenhuma explicação. Nenhum asterisco. Nenhum markdown.

Você receberá os dados do produto: nome, preço original, preço com desconto, percentual de desconto e link. Use esses dados para criar textos ESPECÍFICOS e CRIATIVOS para esse produto. Não invente dados que não foram fornecidos.

═══════════════════════════════════════
A ISCA — regra principal
═══════════════════════════════════════
A isca é a PRIMEIRA linha. Uma frase curta (até 10 palavras) que reage ao produto de forma específica — como se um amigo visse aquela oferta e mandasse no grupo com entusiasmo genuíno.

ATENÇÃO: As 3 versões DEVEM ter iscas completamente diferentes entre si, cada uma com um ângulo exclusivo:

VERSÃO 1 — Ângulo PREÇO: menciona o valor ou desconto de forma surpreendente. Usa o número real.
  Ex: "R$ 49 por 1kg de creatina é quase impossível"
  Ex: "Esse celular por menos de 1.300 é coisa séria"

VERSÃO 2 — Ângulo USO PRÁTICO: fala do que o produto faz, resolve ou muda na vida. SEM mencionar preço.
  Ex: "Bateria que dura dois dias sem carregar"
  Ex: "Quem malha sabe o que 1kg de creatina representa"
  Ex: "Café de cápsula em casa todo dia sem culpa"

VERSÃO 3 — Ângulo MARCA ou CONTEXTO: menciona a marca SE for reconhecível (Samsung, Apple, Nike, Sony, Philips, Nespresso, Tramontina, Xiaomi, Oster, Arno, Lego etc.) ou faz comparação/contexto. Se a marca for desconhecida, use contexto.
  Ex: "Galaxy desse preço não faz sentido nenhum" ← marca famosa
  Ex: "Tá mais barato que coisa bem pior no mercado" ← contexto
  Ex: "Soldiers com esse desconto é raro de ver" ← marca menos conhecida mas nome funciona

PROIBIDO em qualquer isca:
✗ Frases genéricas: "Não acredito nesse preço", "Achei algo bom", "Finalmente...", "Não podia deixar passar", "Olha essa oferta", "Achei isso e precisei compartilhar"
✗ Palavras: "pessoal", "olha só", "atenção", "aproveite", "corre", "imperdível", "incrível", "oferta", "promoção", "compartilhando", "confira"
✗ Começar com "Esse/Esta/Aqui/Você/Eu/A gente"
✗ Duas versões com iscas parecidas ou do mesmo ângulo
✗ Versão 2 mencionar preço — ela é exclusivamente sobre uso/benefício

═══════════════════════════════════════
ESTRUTURA DE CADA VERSÃO (4 partes)
═══════════════════════════════════════

PARTE 1 — ISCA
[frase criativa e específica deste produto, ângulo exclusivo por versão]

PARTE 2 — PRODUTO E PREÇO (linha em branco após a isca)
[emoji do produto] [Nome do produto]

💰 De R$ [preço original] por R$ [preço com desconto] no Pix
💳 Ou [N]x de R$ [valor] sem juros (só se o parcelamento foi fornecido)

PARTE 3 — ESPECIFICAÇÕES (linha em branco após os preços)
Extraia características do nome do produto. Máximo 4 bullets. Use apenas o que o nome/dados deixam claro — não invente.

• [característica 1]
• [característica 2]
• [característica 3]

PARTE 4 — LINK (linha em branco após as specs)
👉 [link] (só se link foi fornecido; senão omita completamente)

Se houver cupom nos dados, adicione logo após os preços:
🏷️ Use o cupom *[CUPOM]*

═══════════════════════════════════════
FORMATO FINAL ESPERADO (use \\n no JSON)
═══════════════════════════════════════
[isca]\\n\\n[emoji] [nome]\\n\\n💰 De R$ X por R$ Y no Pix\\n💳 Ou Nx de R$ Z sem juros\\n\\n• spec1\\n• spec2\\n• spec3\\n\\n👉 [link]

REGRAS FINAIS:
- Texto puro — ZERO asteriscos, ZERO markdown, ZERO negrito (exceto o código do cupom)
- Emojis APENAS nos lugares indicados (specs não levam emoji)
- As 3 iscas OBRIGATORIAMENTE de ângulos diferentes: preço, uso prático, marca/contexto
- O array "versions" deve ter EXATAMENTE 3 strings — uma por versão completa

RESPONDA APENAS com JSON válido sem markdown:
{"product":"nome do produto","versions":["versão 1 completa","versão 2 completa","versão 3 completa"]}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Corrige APENAS entradas duplas entre specs (• linhas) — mantém espaçamento original. */
function fixSpacing(text: string): string {
  // Remove linha em branco entre itens de spec (linhas que começam com •)
  return text.replace(/(^• .+)\n\n(?=• )/gm, '$1\n').trim();
}

/** Extrai o JSON {product, versions} de um texto que a IA retornou (com ou sem cerca ```). */
function extractResult(rawText: string): PromoResult {
  // Remove qualquer texto ANTES do primeiro { e DEPOIS do último }
  // Isso elimina "notas técnicas", prefácios em markdown, etc.
  const jsonStart = rawText.indexOf('{');
  const jsonEnd = rawText.lastIndexOf('}');
  const extracted = jsonStart !== -1 && jsonEnd > jsonStart
    ? rawText.slice(jsonStart, jsonEnd + 1)
    : rawText;

  const jsonStr = extracted
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(jsonStr) as Partial<PromoResult>;
    const versions = Array.isArray(parsed.versions)
      ? parsed.versions.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).slice(0, 3)
      : [];
    if (versions.length > 0) {
      return { product: parsed.product ?? '', versions: versions.map(fixSpacing) };
    }
  } catch {
    // JSON malformado (alguns modelos gratuitos escapam aspas incorretamente).
    // Tenta um resgate tolerante antes de desistir e usar o texto puro.
  }

  const rescued = rescueMalformedJson(jsonStr);
  if (rescued) return rescued;

  // Tenta extrair 3 blocos de texto separados por linha em branco dupla
  // (alguns modelos retornam o texto direto sem JSON)
  const blocks = rawText.trim().split(/\n{2,}/).map(s => s.trim()).filter(s => s.length > 10);
  if (blocks.length >= 3) {
    // Agrupa os blocos em 3 versões (cada versão pode ter vários parágrafos)
    const perVersion = Math.ceil(blocks.length / 3);
    const versions = [0, 1, 2].map(i => blocks.slice(i * perVersion, (i + 1) * perVersion).join('\n\n')).filter(v => v.length > 10);
    if (versions.length === 3) return { product: '', versions };
  }

  // Último recurso: usa o texto puro como uma única versão.
  return { product: '', versions: [rawText.trim()] };
}

/**
 * Tenta recuperar {product, versions} de um JSON malformado (aspas internas
 * não escapadas, vírgulas soltas etc.) usando regex tolerante em vez de
 * JSON.parse estrito. Retorna null se não conseguir extrair nada útil.
 */
function rescueMalformedJson(jsonStr: string): PromoResult | null {
  const productMatch = jsonStr.match(/"product"\s*:\s*"([^"]*)"/);
  const product = productMatch?.[1] ?? '';

  const versionsBlockMatch = jsonStr.match(/"versions"\s*:\s*\[([\s\S]*)\]\s*\}?\s*$/);
  if (!versionsBlockMatch) return null;

  // Divide o bloco em pedaços grandes de texto entre aspas, tolerando aspas
  // internas não escapadas ao tratar `","` (com quebras de linha) como separador.
  const rawVersions = versionsBlockMatch[1]
    .split(/"\s*,\s*"/)
    .map((v) => v.replace(/^"|"$/g, '').trim())
    .map((v) => v.replace(/\\n/g, '\n').replace(/\\"/g, '"'))
    .filter((v) => v.length > 5);

  if (rawVersions.length === 0) return null;
  return { product, versions: mergeToThreeVersions(rawVersions) };
}

/**
 * Alguns modelos gratuitos separam a "isca" (frase curta) do "corpo" (preço +
 * specs) em itens diferentes do array, gerando mais de 3 pedaços. Aqui
 * recombinamos pedaços curtos (< 60 caracteres, sem quebra de linha = isca
 * solta) com o próximo pedaço, até sobrar no máximo 3 versões completas.
 */
function mergeToThreeVersions(pieces: string[]): string[] {
  if (pieces.length <= 3) return pieces.slice(0, 3);

  const merged: string[] = [];
  let i = 0;
  while (i < pieces.length && merged.length < 3) {
    const current = pieces[i];
    const looksLikeLoneBait = current.length < 80 && !current.includes('\n') && i + 1 < pieces.length;
    if (looksLikeLoneBait) {
      merged.push(`${current}\n\n${pieces[i + 1]}`);
      i += 2;
    } else {
      merged.push(current);
      i += 1;
    }
  }
  return merged;
}

// Modelos grátis do OpenRouter com suporte a visão, usados como fallback
// automático quando o modelo principal está com rate-limit (comum no tier
// gratuito em horários de pico). Ordem = prioridade de tentativa.
// Cada modelo/provider tem cota diária própria (~50 req/dia sem crédito),
// então ter vários aqui multiplica a cota efetiva disponível por dia.
const FREE_VISION_FALLBACKS = [
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
];

function isOpenRouterProvider(): boolean {
  return LLM_BASE_URL.includes('openrouter.ai');
}

/** Chama um único modelo no provider OpenAI-compatível (/chat/completions) com visão. */
async function callModelOnce(model: string, imageBase64: string, mimeType: string, linkLine: string): Promise<PromoResult> {
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;
  const body = {
    model,
    temperature: 1.0,
    max_tokens: 2500,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Gere EXATAMENTE 3 versões de copywriting para WhatsApp. O JSON de saída deve ter o campo "versions" com EXATAMENTE 3 strings. Cada string é uma versão completa. APENAS o JSON, zero texto fora do JSON, zero markdown, zero asteriscos.${linkLine}` },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  };

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-title': 'PromoRadar',
  };
  // Ollama / LM Studio locais não exigem chave — só enviamos Authorization se houver.
  if (LLM_API_KEY) headers['authorization'] = `Bearer ${LLM_API_KEY}`;

  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Provider respondeu ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('Provider não retornou conteúdo.');
  return extractResult(text);
}

/**
 * Chama o provider OpenAI-compatível com o modelo configurado.
 * No OpenRouter, se o modelo estiver com rate-limit (429), pula imediatamente
 * para o próximo provider (Reactus) em vez de tentar todos os modelos gratuitos
 * — isso evita timeout de 30s no Cloudflare Workers.
 */
async function callOpenAICompatible(imageBase64: string, mimeType: string, linkLine: string): Promise<PromoResult> {
  // Tenta apenas o modelo principal configurado
  return await callModelOnce(LLM_MODEL, imageBase64, mimeType, linkLine);
}

/** Chama o HappySeeds LLM gateway via Anthropic Messages (chat direto, sem limite diário). */
async function callReactus(imageBase64: string, mimeType: string, linkLine: string): Promise<PromoResult> {
  if (!BTY_BASE || !BTY_KEY) throw new Error('HappySeeds LLM gateway não configurado.');

  const userText = `Gere EXATAMENTE 3 versões de copywriting para WhatsApp usando os dados do produto abaixo. APENAS o JSON, zero texto fora do JSON.\n\n${linkLine.trim()}`;

  const requestBody = {
    model: BTY_MODEL,
    max_tokens: 2500,
    temperature: 1.0,
    stream: false,
    system: GROQ_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: userText },
        ],
      },
    ],
  };

  const res = await fetch(`${BTY_BASE}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': BTY_KEY,
      'anthropic-version': '2023-06-01',
      'x-bty-business': 'ReActUs',
      'x-bty-workspace': 'default',
      'content-type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(55000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HappySeeds LLM respondeu ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json() as { content?: { type: string; text: string }[] };
  const rawText = data.content?.find((c) => c.type === 'text')?.text ?? '';
  if (!rawText) throw new Error('HappySeeds LLM não retornou conteúdo.');
  return extractResult(rawText);
}

/** Chama o Groq (llama-3.3-70b, texto puro — usa dados do produto) */
async function callGroq(imageBase64: string, mimeType: string, linkLine: string): Promise<PromoResult> {
  const key = await getGroqKey();
  if (!key) throw new Error('GROQ_API_KEY não configurado.');
  // Groq não tem modelo de visão disponível — usa texto puro com os dados do produto
  void imageBase64; void mimeType;
  const body = {
    model: GROQ_MODEL,
    temperature: 1.0,
    max_tokens: 2500,
    reasoning_effort: 'none', // desativa o modo thinking do Qwen3 para resposta direta
    messages: [
      { role: 'system', content: GROQ_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Gere EXATAMENTE 3 versões de copywriting para WhatsApp usando os dados abaixo. APENAS o JSON, zero texto fora do JSON.\n\n${linkLine.trim()}`,
      },
    ],
  };
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq respondeu ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('Groq não retornou conteúdo.');
  return extractResult(text);
}


export async function POST(req: NextRequest) {
  // Providers locais (Ollama / LM Studio em localhost) não exigem chave.
  // Providers na nuvem (OpenRouter, OpenAI, etc.) exigem LLM_API_KEY.
  const isLocalProvider = /localhost|127\.0\.0\.1/.test(LLM_BASE_URL);
  const hasOpenAI  = Boolean(LLM_BASE_URL) && (isLocalProvider || Boolean(LLM_API_KEY));
  const hasReactus = Boolean(BTY_BASE && BTY_KEY);
  const groqKey    = await getGroqKey();
  const hasGroq    = Boolean(groqKey);

  if (!hasOpenAI && !hasReactus && !hasGroq) {
    return NextResponse.json(
      { error: 'IA não configurada. Defina LLM_API_KEY ou GROQ_API_KEY no .env.' },
      { status: 500 },
    );
  }

  try {
    const body = await req.json() as {
      imageBase64?: string;
      mimeType?: string;
      link?: string;
      title?: string;
      price?: number;
      originalPrice?: number;
      discountPercent?: number;
      coupon?: string | null;
      preferredProvider?: 'bty' | 'groq' | 'openrouter';
    };
    const { imageBase64, mimeType, link, title, price, originalPrice, discountPercent, coupon, preferredProvider } = body;

    if (!imageBase64 || !mimeType) {
      return NextResponse.json({ error: 'imageBase64 e mimeType são obrigatórios.' }, { status: 400 });
    }

    const cleanB64 = imageBase64.replace(/\s/g, '');

    // Monta contexto textual com dados do produto — ajuda modelos com visão fraca
    const productContext = [
      title ? `Produto: ${title}` : '',
      originalPrice ? `Preço original: R$ ${originalPrice.toFixed(2).replace('.', ',')}` : '',
      price ? `Preço com desconto: R$ ${price.toFixed(2).replace('.', ',')}` : '',
      discountPercent ? `Desconto: ${discountPercent}%` : '',
      coupon ? `Cupom de desconto: ${coupon} — inclua a linha "🏷️ Use o cupom *${coupon}*" logo após os preços` : '',
      link ? `Link da oferta: ${link}` : '',
    ].filter(Boolean).join('\n');

    const linkLine = productContext ? `\n\n${productContext}` : '';

    // Se o usuário escolheu um provider específico, usa só ele (sem fallback).
    // Se não escolheu (chamada automática), tenta na ordem padrão até um funcionar.
    type Provider = 'bty' | 'groq' | 'openrouter';
    const defaultOrder: Provider[] = ['bty', 'groq', 'openrouter'];
    const providerOrder: Provider[] = preferredProvider ? [preferredProvider] : defaultOrder;

    const available: Record<Provider, boolean> = {
      bty: hasReactus,
      groq: hasGroq,
      openrouter: hasOpenAI,
    };

    const PROVIDER_NAMES: Record<Provider, string> = {
      bty: 'Claude (HappySeeds)',
      groq: 'Groq llama',
      openrouter: 'OpenRouter',
    };

    const callProvider = (p: Provider) => {
      if (p === 'bty')  return callReactus(cleanB64, mimeType, linkLine);
      if (p === 'groq') return callGroq(cleanB64, mimeType, linkLine);
      return callOpenAICompatible(cleanB64, mimeType, linkLine);
    };

    let result: PromoResult | null = null;
    let lastErr: unknown;
    for (const p of providerOrder) {
      if (!available[p]) {
        if (preferredProvider) throw new Error(`${PROVIDER_NAMES[p]} não está configurado.`);
        continue;
      }
      try {
        result = await callProvider(p);
        break;
      } catch (err) {
        const errStr = String(err);
        // 402 = sem créditos no provider — faz fallback mesmo se provider foi escolhido manualmente
        const isPaymentRequired = errStr.includes('402');
        if (preferredProvider && !isPaymentRequired) throw err; // erro direto — sem fallback
        console.warn(`generate-promo: ${p} falhou, tentando próximo:`, errStr.slice(0, 150));
        lastErr = err;
      }
    }
    if (!result) throw lastErr ?? new Error('Todos os providers falharam.');

    if (!result.versions.length) {
      return NextResponse.json({ error: 'IA não retornou versões. Tente com outra imagem.' }, { status: 502 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('generate-promo error:', err);
    const msg = String(err);
    const userMsg =
      msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')
        ? 'Tempo limite / falha de rede ao contatar a IA. Verifique sua conexão e o LLM_BASE_URL.'
        : msg.includes('401') || msg.includes('403')
          ? 'Chave de IA inválida (401/403). Confira o LLM_API_KEY no .env.'
          : msg.includes('429') || msg.includes('rate-limit') || msg.includes('temporarily')
            ? 'Limite diário grátis da IA atingido (50 gerações/dia por modelo sem crédito). Aguarde até meia-noite (horário do provedor) ou adicione créditos em openrouter.ai/credits para aumentar o limite para 1000/dia.'
            : msg.includes('image') || msg.includes('Could not process')
              ? 'A IA não conseguiu ler a imagem. Tente uma imagem maior ou em outro formato (JPG/PNG).'
              : `Erro ao gerar texto: ${msg.replace('Error: ', '').slice(0, 180)}`;
    return NextResponse.json({ error: userMsg }, { status: 502 });
  }
}
