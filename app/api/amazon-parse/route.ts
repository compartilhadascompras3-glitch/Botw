export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import type { AmazonProduct } from '@/app/api/amazon-deals/route';

// ── Parsers ───────────────────────────────────────────────────────────────────

function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,]/g, '').replace(',', '.');
  const v = parseFloat(cleaned);
  return isNaN(v) ? null : v;
}

function parseSearchPage(html: string, minDiscount: number): AmazonProduct[] {
  const products: AmazonProduct[] = [];

  const resultRe = /<div[^>]+data-component-type="s-search-result"[^>]+data-asin="([A-Z0-9]{10})"[^>]*>([\s\S]*?)(?=<div[^>]+data-component-type="s-search-result"|$)/g;
  let m: RegExpExecArray | null;
  while ((m = resultRe.exec(html)) !== null && products.length < 60) {
    const asin = m[1];
    const block = m[2];

    const titleM = block.match(/class="[^"]*a-size-[^"]*a-color-base[^"]*s-line-clamp[^"]*"[^>]*><span[^>]*>([^<]+)<\/span>/);
    const titleM2 = block.match(/a-text-normal[^>]*>([^<]{10,150})<\/span>/);
    const title = (titleM?.[1] ?? titleM2?.[1] ?? '').trim();
    if (!title) continue;

    const priceWholeM = block.match(/a-price-whole">([^<]+)</);
    const priceFracM = block.match(/a-price-fraction">([^<]+)</);
    const priceStr = priceWholeM ? (priceWholeM[1].replace(/\D/g, '') + '.' + (priceFracM?.[1] ?? '00')) : null;
    const price = priceStr ? parseFloat(priceStr) : null;
    if (!price || price <= 0) continue;

    const origM = block.match(/a-price a-text-price[^>]*><span[^>]*>([^<]+)<\/span>/);
    let origPrice: number | null = null;
    if (origM) {
      origPrice = parsePrice(origM[1]);
      if (origPrice && origPrice <= price) origPrice = null;
    }

    let discountPercent = 0;
    if (origPrice && origPrice > price) {
      discountPercent = Math.round(((origPrice - price) / origPrice) * 100);
    } else {
      const discM = block.match(/(\d+)%\s*(?:de desconto|off)/i);
      if (discM) discountPercent = parseInt(discM[1]);
    }
    if (discountPercent < minDiscount) continue;

    const imgM = block.match(/s-image"[^>]*src="([^"]+)"/);
    if (!imgM) continue;
    const thumbnail = imgM[1];

    const starsM = block.match(/(\d[,.]\d)\s*de\s*5\s*estrelas/);
    const stars = starsM ? parseFloat(starsM[1].replace(',', '.')) : undefined;
    const reviewsM = block.match(/(\d[\d.,]+)\s*avaliações/);
    const reviews = reviewsM ? parseInt(reviewsM[1].replace(/\D/g, '')) : undefined;
    const prime = /i-prime/.test(block);

    products.push({
      id: `amz-${asin}`,
      asin,
      title,
      price,
      original_price: origPrice,
      discount_percent: discountPercent,
      thumbnail,
      permalink: `https://www.amazon.com.br/dp/${asin}`,
      source: 'amazon',
      stars,
      reviews,
      prime,
    });
  }

  return products.sort((a, b) => b.discount_percent - a.discount_percent);
}

// ── POST: recebe HTML do cliente e parseia ────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { html: string; minDiscount?: number };
    const { html, minDiscount = 10 } = body;

    if (!html || typeof html !== 'string') {
      return NextResponse.json({ error: 'html obrigatório' }, { status: 400 });
    }

    const blocked =
      html.includes('Type the characters you see') ||
      html.includes('/errors/validateCaptcha') ||
      html.length < 3000;

    if (blocked) {
      return NextResponse.json({ error: 'CAPTCHA detectado. Tente em instantes.', products: [], blocked: true });
    }

    const products = parseSearchPage(html, minDiscount);
    const hasMore = html.includes('pagination-next') || html.includes('s-pagination-next');

    return NextResponse.json({ products, hasMore, total: products.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Parse error: ${msg}`, products: [] }, { status: 500 });
  }
}

// ── GET: proxy — o servidor faz o fetch com headers de browser ─────────────────
// Uso: GET /api/amazon-parse?url=<encoded_amazon_url>&minDiscount=10
const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
];

const ACCEPT_LANGS = [
  'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'pt-BR,pt;q=0.8,en;q=0.5',
  'pt-BR,pt;q=0.9',
];

function rnd<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function fetchAmazon(url: string): Promise<{ ok: boolean; html: string; status: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': rnd(UAS),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': rnd(ACCEPT_LANGS),
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'DNT': '1',
      },
    });
    const html = await res.text();
    return { ok: res.ok, html, status: res.status };
  } catch {
    return { ok: false, html: '', status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

function isBlocked(html: string): boolean {
  return (
    html.length < 3000 ||
    html.includes('/errors/validateCaptcha') ||
    html.includes('Type the characters you see') ||
    html.includes('Algo deu errado') ||
    html.includes('api-services-support@amazon')
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawUrl = searchParams.get('url');
  const minDiscount = parseInt(searchParams.get('minDiscount') ?? '10', 10);
  const page = parseInt(searchParams.get('page') ?? '1', 10);

  // Reconstrói URL se não veio diretamente
  let targetUrl = rawUrl ?? '';
  if (!targetUrl) {
    const q = searchParams.get('q') ?? 'fone bluetooth';
    const category = searchParams.get('category') ?? '';
    const NODES: Record<string, string> = {
      electronics: '16386173011', computers: '16386150011', phones: '16243680011',
      books: '6740748011', home: '16386175011', kitchen: '16386176011',
      beauty: '16386163011', sports: '16386169011', games: '6986547011', toys: '16386166011',
    };
    const rh = `p_n_deal_type:23566064011${category && NODES[category] ? `,n:${NODES[category]}` : ''}`;
    const p = new URLSearchParams({ k: q, rh, s: 'discount-rank', page: page.toString() });
    targetUrl = `https://www.amazon.com.br/s?${p.toString()}`;
  }

  // Tentativa 1 — URL original
  let result = await fetchAmazon(targetUrl);

  // Tentativa 2 — busca simples sem filtro de deals (menos filtros = menos suspeito)
  if (!result.ok || isBlocked(result.html)) {
    const q = searchParams.get('q') ?? 'fone bluetooth';
    const simpleUrl = `https://www.amazon.com.br/s?k=${encodeURIComponent(q + ' desconto')}&s=review-rank&page=${page}`;
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    result = await fetchAmazon(simpleUrl);
  }

  // Tentativa 3 — produto genérico popular
  if (!result.ok || isBlocked(result.html)) {
    const fallbackTerms = ['notebook', 'headset', 'smart tv', 'smartphone', 'SSD'];
    const fb = rnd(fallbackTerms);
    const fbUrl = `https://www.amazon.com.br/s?k=${encodeURIComponent(fb)}&s=review-rank`;
    await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
    result = await fetchAmazon(fbUrl);
  }

  if (!result.ok || isBlocked(result.html)) {
    return NextResponse.json({
      error: 'Amazon está bloqueando temporariamente. Aguarde alguns segundos e tente novamente.',
      products: [],
      blocked: true,
    });
  }

  const products = parseSearchPage(result.html, minDiscount);
  const hasMore = result.html.includes('pagination-next') || result.html.includes('s-pagination-next');

  if (products.length === 0) {
    return NextResponse.json({
      error: 'Nenhuma promoção encontrada. Tente outro termo ou reduza o desconto mínimo.',
      products: [],
    });
  }

  return NextResponse.json({ products, hasMore, total: products.length });
}
