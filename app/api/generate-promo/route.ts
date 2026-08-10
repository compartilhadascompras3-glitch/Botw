import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ── Provider 1: OpenAI-compatible ───────────────────────────────────────────────
const LLM_BASE_URL = (process.env.LLM_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const LLM_API_KEY  = process.env.LLM_API_KEY ?? '';
const LLM_MODEL    = process.env.LLM_MODEL ?? 'google/gemma-4-31b-it:free';

// ── Provider 2: HappySeeds LLM gateway (Claude) ───────────────────────────────
const BTY_BASE  = (process.env.BTY_LLM_SERVER_BASE_URL ?? '').replace(/\/$/, '');
const BTY_KEY   = process.env.BTY_LLM_SERVER_API_KEY ?? process.env.HAPPYSEEDS_KEY ?? '';
const BTY_MODEL = 'claude-sonnet-4.6';

// ── Provider 3: Groq (gratuito, limite generoso, vision via llama) ─────────────
const GROQ_KEY   = process.env.GROQ_API_KEY ?? '';
const GROQ_BASE  = 'https://api.groq.com/openai/v1';
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'; // suporta visão, grátis

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
A isca é a PRIMEIRA linha. Uma frase curta (até 10 palavras) que reage ao produto de forma específica e identificável — como se um amigo visse aquela oferta e mandasse no grupo com entusiasmo genuíno.

A isca DEVE mencionar algo específico deste produto: o uso, a característica marcante, o preço absurdo, ou — quando for uma marca amplamente conhecida (Samsung, Apple, Nike, Sony, LG, Xiaomi, Philips, Tramontina etc.) — a própria marca, mas só se soar natural. Não force a marca quando ela não acrescenta nada.

Exemplos bons de iscas para um "Samsung Galaxy A55":
✓ "Galaxy desse preço não faz sentido nenhum"  ← marca relevante, orgânico
✓ "Bateria que dura dois dias por esse valor?"  ← benefício específico, sem marca
✓ "Tá mais barato que muita coisa sem metade das specs"  ← preço/valor, sem marca

Exemplos bons de iscas para "Creatina Soldiers Nutrition 1kg":
✓ "1kg de creatina por menos de X reais, sério?"  ← preço específico
✓ "Quem malha sabe o que essa quantidade representa"  ← uso prático
✓ "Soldiers com esse desconto é pra comprar logo"  ← marca menos conhecida, mas nome curto funciona

PROIBIDO na isca:
✗ Frases genéricas que servem para qualquer produto ("Não acredito nesse preço", "Achei algo bom", "Finalmente...", "Não podia deixar passar", "Achei isso e precisei compartilhar")
✗ "pessoal", "olha só", "atenção", "aproveite", "corre", "imperdível", "incrível", "oferta", "promoção", "compartilhando"
✗ Começar com "Esse/Esta/Aqui/Você"
✗ Começar com pronomes pessoais ("Eu", "A gente")

CADA VERSÃO deve ter um ÂNGULO diferente — escolha os mais naturais para este produto específico:
- Ângulo A: a marca ou modelo (só se for reconhecível e soar orgânico)
- Ângulo B: o preço ou desconto (compara com o que vale, usa o número real)
- Ângulo C: o uso prático ou benefício concreto (o que muda na vida de quem usa)

═══════════════════════════════════════
ESTRUTURA DE CADA VERSÃO (4 partes)
═══════════════════════════════════════

PARTE 1 — ISCA
[frase específica deste produto, ângulo diferente por versão]

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
- As 3 iscas OBRIGATORIAMENTE diferentes: marca/modelo, preço/valor, uso/benefício
- Specs apenas do que estiver visível na imagem

IMPORTANTE SOBRE O JSON DE SAÍDA:
- Cada item do array "versions" é UMA STRING ÚNICA contendo o texto INTEIRO da versão (isca + preço + specs + link, tudo junto, separado por \\n dentro da mesma string).
- NUNCA divida uma versão em várias strings do array. O array "versions" deve ter EXATAMENTE 3 strings — uma por versão completa.
- Escape corretamente aspas e quebras de linha dentro das strings do JSON.

RESPONDA APENAS com JSON válido sem markdown:
{"product":"nome","versions":["versão 1 completa","versão 2 completa","versão 3 completa"]}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

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
      return { product: parsed.product ?? '', versions };
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

  const requestBody = {
    model: BTY_MODEL,
    max_tokens: 2500,
    temperature: 1.0,
    stream: false,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: `Gere EXATAMENTE 3 versões de copywriting para WhatsApp. O JSON de saída deve ter o campo "versions" com EXATAMENTE 3 strings. Cada string é uma versão completa. APENAS o JSON, zero texto fora do JSON, zero markdown, zero asteriscos.${linkLine}` },
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

/** Chama o Groq (llama-4-scout com visão, grátis) */
async function callGroq(imageBase64: string, mimeType: string, linkLine: string): Promise<PromoResult> {
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY não configurado.');
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;
  const body = {
    model: GROQ_MODEL,
    temperature: 1.0,
    max_tokens: 2500,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Gere EXATAMENTE 3 versões de copywriting para WhatsApp. APENAS o JSON, zero texto fora do JSON.${linkLine}` },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  };
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${GROQ_KEY}` },
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
  const hasGroq    = Boolean(GROQ_KEY);

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
    };
    const { imageBase64, mimeType, link, title, price, originalPrice, discountPercent, coupon } = body;

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

    // Ordem: BTY/Claude → Groq (grátis, vision) → OpenRouter (grátis)
    let result: PromoResult;
    if (hasReactus) {
      try {
        result = await callReactus(cleanB64, mimeType, linkLine);
      } catch (err) {
        console.warn('generate-promo: BTY falhou, tentando Groq:', String(err).slice(0, 150));
        if (hasGroq) {
          try {
            result = await callGroq(cleanB64, mimeType, linkLine);
          } catch (err2) {
            console.warn('generate-promo: Groq falhou, tentando OpenRouter:', String(err2).slice(0, 150));
            if (hasOpenAI) {
              result = await callOpenAICompatible(cleanB64, mimeType, linkLine);
            } else { throw err2; }
          }
        } else if (hasOpenAI) {
          result = await callOpenAICompatible(cleanB64, mimeType, linkLine);
        } else { throw err; }
      }
    } else if (hasGroq) {
      try {
        result = await callGroq(cleanB64, mimeType, linkLine);
      } catch (err) {
        console.warn('generate-promo: Groq falhou, tentando OpenRouter:', String(err).slice(0, 150));
        if (hasOpenAI) {
          result = await callOpenAICompatible(cleanB64, mimeType, linkLine);
        } else { throw err; }
      }
    } else {
      result = await callOpenAICompatible(cleanB64, mimeType, linkLine);
    }

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
