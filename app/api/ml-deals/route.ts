import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface MLProduct {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  discount_percent: number;
  thumbnail: string;
  permalink: string;
  condition: string;
  sold_quantity: number;
  available_quantity: number;
  category_id: string;
  seller_name: string;
}

// ── Scraping helpers ─────────────────────────────────────────────────────────

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Referer': 'https://www.mercadolivre.com.br/',
};

interface RawItem {
  position: number;
  type: string;
  card: {
    metadata: {
      id: string;
      url: string;
      url_params?: string;
      category_id?: string;
    };
    pictures?: {
      pictures?: Array<{ id: string }>;
    };
    components: Array<{ type: string; id?: string; title?: { text: string }; price?: unknown }>;
  };
}

function parseItemsFromHtml(html: string): RawItem[] {
  // Find the embedded _n.ctx.r JSON which contains items array
  const scriptMatch = html.match(/_n\.ctx\.r=\{.+?"items":\[/);
  if (!scriptMatch) return [];

  // Find the items array by locating "items":[ and balancing brackets
  const itemsStart = html.indexOf('"items":[');
  if (itemsStart === -1) return [];

  const arrayStart = itemsStart + '"items":'.length;
  let depth = 0;
  let end = arrayStart;
  for (let i = arrayStart; i < html.length; i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }

  try {
    return JSON.parse(html.slice(arrayStart, end)) as RawItem[];
  } catch {
    return [];
  }
}

function buildAffiliateLink(rawUrl: string, mattWord: string, mattTool: string): string {
  try {
    const fullUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    const productMatch = fullUrl.match(/\/p\/(MLB\w+)/i);
    const base = productMatch
      ? new URL(`https://mercadolivre.com.br/p/${productMatch[1]}`)
      : (() => { const u = new URL(fullUrl); u.searchParams.delete('pdp_filters'); return u; })();
    if (mattWord) base.searchParams.set('matt_word', mattWord);
    if (mattTool) base.searchParams.set('matt_tool', mattTool);
    if (mattWord || mattTool) base.searchParams.set('forceInApp', 'true');
    return base.toString();
  } catch {
    return rawUrl;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseProduct(item: RawItem, mattWord: string, mattTool: string): MLProduct | null {
  try {
    const card = item.card;
    const meta = card.metadata;
    const comps = Object.fromEntries(card.components.map((c) => [c.type, c]));

    // Title
    const titleComp = comps['title'] as { title?: { text: string } } | undefined;
    const title = titleComp?.title?.text ?? '';
    if (!title) return null;

    // Price component
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priceData = (comps['price'] as any)?.price ?? {};
    const currentPrice: number = priceData?.current_price?.value ?? 0;
    if (!currentPrice) return null;

    // Original price + discount
    let originalPrice: number | null = null;
    let discountPercent = 0;

    const priceLabels: unknown[] = priceData?.price_labels ?? [];
    for (const label of priceLabels as Array<{ values?: Array<{ type: string; key?: string; pill?: { text: string }; price?: { value: number } }> }>) {
      for (const v of label.values ?? []) {
        if (v.type === 'pill' && v.pill?.text) {
          const m = v.pill.text.match(/(\d+)%/);
          if (m) discountPercent = parseInt(m[1], 10);
        }
        if (v.type === 'price' && v.key === 'previous_price' && v.price?.value) {
          originalPrice = v.price.value;
        }
      }
    }

    // Thumbnail
    const pics = card.pictures?.pictures ?? [];
    const picId = pics[0]?.id ?? '';
    const thumbnail = picId
      ? `https://http2.mlstatic.com/D_NQ_NP_${picId}-O.jpg`
      : '';

    // URL
    const rawUrl = meta.url ?? '';
    const fullUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    const urlWithParams = fullUrl + (meta.url_params ?? '');
    const permalink = buildAffiliateLink(urlWithParams, mattWord, mattTool);

    return {
      id: meta.id,
      title,
      price: currentPrice,
      original_price: originalPrice,
      discount_percent: discountPercent,
      thumbnail,
      permalink,
      condition: 'new',
      sold_quantity: 0,
      available_quantity: 0,
      category_id: meta.category_id ?? '',
      seller_name: '',
    };
  } catch {
    return null;
  }
}

async function fetchPage(baseUrl: URL, page: number): Promise<RawItem[]> {
  const url = new URL(baseUrl.toString());
  if (page > 1) url.searchParams.set('page', page.toString());
  try {
    const response = await fetch(url.toString(), {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return [];
    const html = await response.text();
    return parseItemsFromHtml(html);
  } catch {
    return [];
  }
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const minDiscount = parseInt(searchParams.get('minDiscount') ?? '10', 10);
  const mattWord = searchParams.get('mattWord') ?? searchParams.get('trackingId') ?? ''; // retrocompat
  const mattTool = searchParams.get('mattTool') ?? '';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '96', 10), 200);
  const page = parseInt(searchParams.get('page') ?? '1', 10); // página do frontend

  // Quantas páginas do ML precisamos para atingir o limite pedido?
  // Cada página retorna ~45 itens; buscamos até 4 páginas em paralelo
  const ITEMS_PER_ML_PAGE = 45;
  const pagesNeeded = Math.min(Math.ceil(limit / ITEMS_PER_ML_PAGE), 4);
  const startPage = (page - 1) * pagesNeeded + 1;

  const baseUrl = new URL('https://www.mercadolivre.com.br/ofertas');
  if (query) baseUrl.searchParams.set('q', query);
  if (category) baseUrl.searchParams.set('category', category);

  try {
    // Buscar páginas em paralelo
    const pageNums = Array.from({ length: pagesNeeded }, (_, i) => startPage + i);
    const results = await Promise.all(pageNums.map((p) => fetchPage(baseUrl, p)));
    const rawItems = results.flat();

    if (rawItems.length === 0) {
      return NextResponse.json({ products: [], total: 0, hasMore: false });
    }

    // Deduplicar por ID
    const seen = new Set<string>();
    const products: MLProduct[] = rawItems
      .map((item) => parseProduct(item, mattWord, mattTool))
      .filter((p): p is MLProduct => p !== null)
      .filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .filter((p) => p.discount_percent >= minDiscount)
      .sort((a, b) => b.discount_percent - a.discount_percent)
      .slice(0, limit);

    return NextResponse.json({
      products,
      total: products.length,
      hasMore: rawItems.length >= pagesNeeded * ITEMS_PER_ML_PAGE * 0.8,
    });
  } catch (error) {
    console.error('[ml-deals] scraping error:', error);
    return NextResponse.json(
      { error: 'Falha ao buscar promoções. Tente novamente.', products: [] },
      { status: 500 }
    );
  }
}
