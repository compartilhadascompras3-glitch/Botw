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

/** Extrai título legível do slug da URL do ML (ex: "notebook-samsung-galaxy-book4" → "Notebook Samsung Galaxy Book4") */
function titleFromMLSlug(url: string): string {
  try {
    const u = new URL(url);
    // Pega o primeiro segmento do pathname que pareça um slug de produto
    const seg = u.pathname.split('/').find(s => s.length > 5 && /[a-z]/.test(s) && !/^p$|^MLB/i.test(s));
    if (!seg) return '';
    return seg
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim();
  } catch { return ''; }
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
        const html = await res.text();
        const match = html.match(/MLB[-_]?(\d+)/i);
        if (match) itemId = `MLB${match[1]}`;
      }
    } catch { /* ignora */ }
  }

  if (!itemId) {
    // Sem ID: retorna produto genérico com título do slug e preço=0 para edição manual
    const title = titleFromMLSlug(url);
    if (!title) return null;
    return { id: `ml_manual_${Date.now()}`, title, price: 0, original_price: null, discount_percent: 0, thumbnail: '', permalink: url, source: 'ml', seller_name: 'Mercado Livre' };
  }

  // Tenta a API do ML (pode retornar 403 sem app aprovado)
  try {
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

    if (itemRes.ok) {
      const item = await itemRes.json() as {
        id: string; title: string; price: number; original_price?: number | null;
        thumbnail: string; permalink: string;
        seller?: { nickname?: string };
      };

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
        thumbnail: (item.thumbnail ?? '').replace('-I.jpg', '-O.jpg'),
        permalink: item.permalink ?? url,
        source: 'ml',
        seller_name: item.seller?.nickname ?? 'Mercado Livre',
      };
    }
  } catch { /* ignora */ }

  // API falhou (403 sem app aprovado) — retorna com ID mas preço=0 para edição manual
  const slugTitle = titleFromMLSlug(url);
  const fallbackTitle = slugTitle || itemId;
  return {
    id: itemId,
    title: fallbackTitle,
    price: 0,
    original_price: null,
    discount_percent: 0,
    thumbnail: '',
    permalink: url,
    source: 'ml',
    seller_name: 'Mercado Livre',
  };
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
/** Extrai título do slug da URL da Shopee */
function titleFromShopeeSlug(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').find(s => s.length > 5 && /[a-zA-Z]/.test(s));
    if (!seg) return '';
    const clean = seg.replace(/-i\.\d+\.\d+$/, '').replace(/-/g, ' ');
    return clean.replace(/\b\w/g, c => c.toUpperCase()).trim();
  } catch { return ''; }
}

/** Extrai shop_id e item_id de uma URL da Shopee */
function extractShopeeIds(url: string): { shopId: string; itemId: string } | null {
  const m = url.match(/i\.(\d+)\.(\d+)/);
  return m ? { shopId: m[1], itemId: m[2] } : null;
}

async function fetchShopee(url: string): Promise<FetchedProduct | null> {
  // Resolve redirects curtos (shp.ee, s.shopee.com.br)
  let finalUrl = url;
  try {
    const res = await fetch(url, { method: 'HEAD', headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(8000) });
    finalUrl = res.url || url;
  } catch { /* ignora */ }

  const ids = extractShopeeIds(finalUrl) ?? extractShopeeIds(url);
  const slugTitle = titleFromShopeeSlug(finalUrl) || titleFromShopeeSlug(url);

  // Tenta buscar dados reais via API de afiliados (se tiver itemId e shopId)
  if (ids) {
    try {
      const { fetchShopeeProductById, shopeePrice } = await import('@/lib/shopee-affiliate');
      const product = await fetchShopeeProductById(ids.itemId, ids.shopId);
      if (product) {
        const price = shopeePrice(product.priceMin || product.price);
        const originalPrice = product.priceDiscountRate > 0
          ? Math.round(price / (1 - product.priceDiscountRate / 100))
          : null;
        return {
          id: `spe_${ids.shopId}_${ids.itemId}`,
          title: product.productName,
          price,
          original_price: originalPrice,
          discount_percent: product.priceDiscountRate || 0,
          thumbnail: product.imageUrl,
          permalink: product.offerLink || product.productLink || finalUrl,
          source: 'shopee',
          seller_name: product.shopName,
        };
      }
    } catch (e) {
      console.error('[fetch-product] Shopee affiliate error:', (e as Error).message);
    }
  }

  // Fallback: retorna com título do slug e preço=0 para edição manual
  const id = ids ? `${ids.shopId}_${ids.itemId}` : `spe_${Date.now()}`;
  return {
    id,
    title: slugTitle || 'Produto Shopee',
    price: 0,
    original_price: null,
    discount_percent: 0,
    thumbnail: '',
    permalink: finalUrl,
    source: 'shopee',
  };
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
