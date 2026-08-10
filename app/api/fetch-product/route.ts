import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface FetchedProduct {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  discount_percent: number;
  thumbnail: string;
  permalink: string;
  source: 'ml' | 'amazon' | 'shopee' | 'generic';
  coupon?: string | null;
  seller_name?: string;
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

// ── Mercado Livre ─────────────────────────────────────────────────────────────
// Extrai o ID do produto (MLB...) da URL e consulta a API pública do ML
function extractMLId(url: string): string | null {
  // https://produto.mercadolivre.com.br/MLB-XXXXX / https://www.mercadolivre.com.br/p/MLBXXXXX
  const m = url.match(/MLB[-_]?(\d+)/i);
  if (m) return `MLB${m[1]}`;
  return null;
}

async function fetchML(url: string): Promise<FetchedProduct | null> {
  // Tenta extrair ID direto da URL
  let itemId = extractMLId(url);

  // Se não achou, segue o redirect para pegar a URL final
  if (!itemId) {
    try {
      const res = await fetch(url, { method: 'GET', headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(10000) });
      itemId = extractMLId(res.url);
      if (!itemId) {
        // Tenta pegar do HTML
        const html = await res.text();
        const match = html.match(/MLB[-_]?(\d+)/i);
        if (match) itemId = `MLB${match[1]}`;
      }
    } catch { return null; }
  }

  if (!itemId) return null;

  try {
    // Busca dados do item e preços em paralelo
    const [itemRes, pricesRes] = await Promise.all([
      fetch(`https://api.mercadolibre.com/items/${itemId}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`https://api.mercadolibre.com/items/${itemId}/prices`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      }).catch(() => null),
    ]);

    if (!itemRes.ok) return null;
    const item = await itemRes.json() as {
      id: string; title: string; price: number; original_price?: number | null;
      thumbnail: string; permalink: string;
      seller?: { nickname?: string };
    };

    // Tenta extrair preço original do endpoint /prices
    let originalFromPrices: number | null = null;
    if (pricesRes?.ok) {
      const pricesData = await pricesRes.json() as {
        prices?: { type: string; amount: number; regular_amount?: number | null }[]
      };
      const mainPrice = (pricesData.prices ?? []).find(p => p.type === 'standard');
      if (mainPrice?.regular_amount && mainPrice.regular_amount > mainPrice.amount) {
        originalFromPrices = mainPrice.regular_amount;
      }
    }

    const original = item.original_price ?? originalFromPrices ?? null;
    const discount = original && original > item.price
      ? Math.round((1 - item.price / original) * 100)
      : 0;

    return {
      id: item.id,
      title: item.title,
      price: item.price,
      original_price: original,
      discount_percent: discount,
      thumbnail: (item.thumbnail ?? '').replace('-I.jpg', '-O.jpg'), // imagem maior
      permalink: item.permalink ?? url,
      source: 'ml',
      seller_name: item.seller?.nickname ?? 'Mercado Livre',
    };
  } catch { return null; }
}

// ── Amazon ────────────────────────────────────────────────────────────────────
function extractASIN(url: string): string | null {
  const m = url.match(/\/dp\/([A-Z0-9]{10})/i) ?? url.match(/\/gp\/product\/([A-Z0-9]{10})/i);
  return m?.[1] ?? null;
}

async function fetchAmazon(url: string): Promise<FetchedProduct | null> {
  const asin = extractASIN(url);
  if (!asin) return null;

  try {
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    const html = await res.text();

    // Título
    const titleMatch = html.match(/<span[^>]+id="productTitle"[^>]*>\s*([\s\S]*?)\s*<\/span>/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? '';

    // Preço atual
    const priceMatch = html.match(/class="a-price-whole">([0-9.,]+)</)
      ?? html.match(/"priceAmount":"([0-9.,]+)"/)
      ?? html.match(/data-a-price-whole="([0-9.,]+)"/);
    const priceRaw = priceMatch?.[1]?.replace(/\./g, '').replace(',', '.') ?? '0';
    const price = parseFloat(priceRaw);

    // Preço original
    const origMatch = html.match(/class="a-text-price"[^>]*><span[^>]*>R\$\s*([0-9.,]+)/)
      ?? html.match(/"wasPrice"[^>]*>R\$\s*([0-9.,]+)/);
    const origRaw = origMatch?.[1]?.replace(/\./g, '').replace(',', '.') ?? '0';
    const original = parseFloat(origRaw) || null;

    // Imagem
    const imgMatch = html.match(/"hiRes":"(https:\/\/m\.media-amazon\.com\/images\/[^"]+)"/)
      ?? html.match(/"large":"(https:\/\/m\.media-amazon\.com\/images\/[^"]+)"/);
    const thumbnail = imgMatch?.[1] ?? `https://images.amazon.com/images/P/${asin}.jpg`;

    // Cupom
    const couponMatch = html.match(/Clique aqui para aplicar (?:um cupom de )?(\d+)%/)
      ?? html.match(/coupon[^"]*"[^>]*>.*?(\d+)%/i);
    const coupon = couponMatch?.[1] ? `${couponMatch[1]}%OFF` : null;

    const discount = original && original > price
      ? Math.round((1 - price / original) * 100)
      : 0;

    if (!title || price <= 0) return null;

    return {
      id: `amz_${asin}`,
      title,
      price,
      original_price: original,
      discount_percent: discount,
      thumbnail,
      permalink: `https://www.amazon.com.br/dp/${asin}`,
      source: 'amazon',
      coupon,
    };
  } catch { return null; }
}

// ── Shopee ────────────────────────────────────────────────────────────────────
async function fetchShopee(url: string): Promise<FetchedProduct | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    const html = await res.text();

    // Shopee embute dados no __NEXT_DATA__ ou em meta tags
    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    const imgMatch   = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    const priceMatch = html.match(/"price":(\d+)/)
      ?? html.match(/class="pqTWkA"[^>]*>(R\$\s*[0-9.,]+)/);

    const title     = titleMatch?.[1]?.trim() ?? '';
    const thumbnail = imgMatch?.[1] ?? '';
    const priceRaw  = priceMatch?.[1]?.replace(/[^\d.,]/g, '').replace('.','').replace(',','.') ?? '0';
    const price     = parseFloat(priceRaw) / 100000 || parseFloat(priceRaw); // Shopee usa centavos*100

    if (!title || price <= 0) return null;

    const finalUrl = res.url || url;
    const idMatch  = finalUrl.match(/i\.(\d+)\.(\d+)/);
    const id = idMatch ? `${idMatch[1]}_${idMatch[2]}` : `spe_${Date.now()}`;

    return { id, title, price, original_price: null, discount_percent: 0, thumbnail, permalink: finalUrl, source: 'shopee' };
  } catch { return null; }
}

// ── Generic fallback (Open Graph) ─────────────────────────────────────────────
async function fetchGeneric(url: string): Promise<FetchedProduct | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    const html = await res.text();

    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
      ?? html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const imgMatch   = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    const priceMatch = html.match(/R\$\s*([\d.,]+)/);

    const title     = titleMatch?.[1]?.trim() ?? '';
    const thumbnail = imgMatch?.[1] ?? '';
    const priceRaw  = priceMatch?.[1]?.replace(/\./g, '').replace(',', '.') ?? '0';
    const price     = parseFloat(priceRaw);

    if (!title) return null;

    return { id: `gen_${Date.now()}`, title, price: price || 0, original_price: null, discount_percent: 0, thumbnail, permalink: res.url || url, source: 'generic' };
  } catch { return null; }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get('url') ?? '';
  if (!url) return NextResponse.json({ error: 'url é obrigatório' }, { status: 400 });

  let decoded = url;
  try { decoded = decodeURIComponent(url); } catch { /* ignore */ }

  const isML      = /mercadolivre|mercadolibre|mlstatic/i.test(decoded);
  const isAmazon  = /amazon\.com\.br|amzn\.(to|com)/i.test(decoded);
  const isShopee  = /shopee\.com\.br/i.test(decoded);

  let product: FetchedProduct | null = null;

  if (isML)     product = await fetchML(decoded);
  else if (isAmazon)  product = await fetchAmazon(decoded);
  else if (isShopee)  product = await fetchShopee(decoded);
  else                product = await fetchGeneric(decoded);

  if (!product) {
    return NextResponse.json({ error: 'Não foi possível extrair dados do produto. Verifique o link e tente novamente.' }, { status: 422 });
  }

  return NextResponse.json({ product });
}
