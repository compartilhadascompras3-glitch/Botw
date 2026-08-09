import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ── Provider 1: OpenAI-compatible ───────────────────────────────────────────────
// Padrão: OpenRouter com modelo GRATUITO com visão (sem custo, precisa só de chave).
// Também funciona com OpenAI, Groq, Together, LM Studio, Ollama, etc — basta trocar
// LLM_BASE_URL / LLM_MODEL no .env.
const LLM_BASE_URL = (process.env.LLM_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const LLM_API_KEY  = process.env.LLM_API_KEY ?? '';
const LLM_MODEL    = process.env.LLM_MODEL ?? 'google/gemma-4-31b-it:free';

// ── Provider 2 (fallback): Reactus / HappySeeds (só no ambiente da plataforma) ─
const REACTUS_BASE = (process.env.REACTUS_BASE_URL ?? '').replace(/\/$/, '');
const REACTUS_KEY  = process.env.HAPPYSEEDS_KEY ?? process.env.BTY_LLM_SERVER_API_KEY ?? '';
const PROJECT_ID   = process.env.HAPPYSEEDS_PROJECT_ID ?? process.env.REACTUS_PROJECT_ID ?? '';
const REACTUS_MODEL = process.env.REACTUS_MODEL ?? 'claude-sonnet-4.6';

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
 * No OpenRouter, se o modelo estiver com rate-limit (429) ou indisponível,
 * tenta automaticamente os próximos modelos grátis com visão da lista.
 */
async function callOpenAICompatible(imageBase64: string, mimeType: string, linkLine: string): Promise<PromoResult> {
  const candidates = isOpenRouterProvider()
    ? [LLM_MODEL, ...FREE_VISION_FALLBACKS.filter((m) => m !== LLM_MODEL)]
    : [LLM_MODEL];

  let lastError: unknown;
  for (const model of candidates) {
    try {
      return await callModelOnce(model, imageBase64, mimeType, linkLine);
    } catch (err) {
      lastError = err;
      const msg = String(err);
      // Só tenta o próximo modelo se for rate-limit/indisponibilidade; erros
      // de autenticação (401/403) ou de imagem inválida não se resolvem trocando modelo.
      const isRetryable = msg.includes('429') || msg.includes('404') || msg.includes('rate-limit') || msg.includes('temporarily');
      if (!isRetryable) throw err;
      console.warn(`generate-promo: modelo ${model} indisponível, tentando próximo...`);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Fallback: chama o llm_server SSE da Reactus/HappySeeds (formato Anthropic). */
async function callReactus(imageBase64: string, mimeType: string, linkLine: string): Promise<PromoResult> {
  const requestBody = {
    model: REACTUS_MODEL,
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

  const res = await fetch(`${REACTUS_BASE}/v1/llm_server/sse`, {
    method: 'POST',
    headers: {
      'x-api-key': REACTUS_KEY,
      'x-bty-app': PROJECT_ID,
      'x-bty-model': REACTUS_MODEL,
      'content-type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Reactus respondeu ${res.status}: ${errText.slice(0, 300)}`);
  }

  const sseText = await res.text();

  const failedMatch = sseText.match(/event:\s*llm_server\.failed[\s\S]*?data:\s*({.*})/);
  if (failedMatch) {
    try {
      const failed = JSON.parse(failedMatch[1]) as { message?: string };
      throw new Error(failed.message ?? 'IA não conseguiu processar a imagem.');
    } catch { /* segue para parse genérico */ }
  }

  for (const chunk of sseText.split('\n\n')) {
    const eventLine = chunk.split('\n').find((l) => l.startsWith('event:'));
    const dataLine  = chunk.split('\n').find((l) => l.startsWith('data:'));
    if (!eventLine || !dataLine) continue;
    if (eventLine.replace('event:', '').trim() !== 'llm_server.completed') continue;

    const envelope = JSON.parse(dataLine.replace('data:', '').trim()) as {
      status: string;
      data: { content: { type: string; text: string }[] };
    };
    if (envelope.status !== 'succeeded') continue;
    const rawText = envelope.data?.content?.find((c) => c.type === 'text')?.text ?? '';
    if (rawText) return extractResult(rawText);
  }
  throw new Error('IA não retornou resposta válida.');
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Providers locais (Ollama / LM Studio em localhost) não exigem chave.
  // Providers na nuvem (OpenRouter, OpenAI, etc.) exigem LLM_API_KEY.
  const isLocalProvider = /localhost|127\.0\.0\.1/.test(LLM_BASE_URL);
  const hasOpenAI  = Boolean(LLM_BASE_URL) && (isLocalProvider || Boolean(LLM_API_KEY));
  const hasReactus = Boolean(REACTUS_BASE && REACTUS_KEY);

  if (!hasOpenAI && !hasReactus) {
    console.error('generate-promo: nenhum provider de IA configurado (defina LLM_BASE_URL e LLM_API_KEY)');
    return NextResponse.json(
      { error: 'IA não configurada. Defina LLM_API_KEY no arquivo .env (crie uma chave grátis em openrouter.ai/keys) e reinicie o servidor.' },
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
    };
    const { imageBase64, mimeType, link, title, price, originalPrice, discountPercent } = body;

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
      link ? `Link da oferta: ${link}` : '',
    ].filter(Boolean).join('\n');

    const linkLine = productContext ? `\n\n${productContext}` : '';

    // Prioriza OpenAI-compatível (OpenRouter em produção); usa Reactus como fallback (só no sandbox).
    let result: PromoResult;
    if (hasOpenAI) {
      try {
        result = await callOpenAICompatible(cleanB64, mimeType, linkLine);
      } catch (err) {
        if (hasReactus) {
          console.warn('generate-promo: provider OpenAI falhou, tentando Reactus:', String(err).slice(0, 200));
          result = await callReactus(cleanB64, mimeType, linkLine);
        } else {
          throw err;
        }
      }
    } else {
      result = await callReactus(cleanB64, mimeType, linkLine);
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
