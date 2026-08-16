import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { settings as settingsTable } from '@/db/schemas/settings';
import { eq } from 'drizzle-orm';

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
  source?: 'ml' | 'ml_promobit'; // ml_promobit = veio via Promobit
  coupon?: string | null;
}

// ── Token helpers ─────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string | null> {
  try {
    const [tokenRow, expiresRow] = await Promise.all([
      db.select().from(settingsTable).where(eq(settingsTable.key, 'ml_access_token')).limit(1),
      db.select().from(settingsTable).where(eq(settingsTable.key, 'ml_token_expires_at')).limit(1),
    ]);
    const token = tokenRow[0]?.value ?? null;
    if (!token) return null;

    const expiresAt = parseInt(expiresRow[0]?.value ?? '0', 10);
    // Se expirado, tenta refresh
    if (expiresAt && Date.now() > expiresAt - 60_000) {
      const refreshed = await refreshToken();
      return refreshed;
    }
    return token;
  } catch {
    return null;
  }
}

async function refreshToken(): Promise<string | null> {
  try {
    const refreshRow = await db.select().from(settingsTable).where(eq(settingsTable.key, 'ml_refresh_token')).limit(1);
    const refreshTokenVal = refreshRow[0]?.value;
    if (!refreshTokenVal) return null;

    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.ML_CLIENT_ID!,
        client_secret: process.env.ML_CLIENT_SECRET!,
        refresh_token: refreshTokenVal,
      }),
    });
    if (!res.ok) return null;

    const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
    const expiresAt = Date.now() + data.expires_in * 1000;

    await Promise.all([
      db.insert(settingsTable).values({ key: 'ml_access_token', value: data.access_token })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value: data.access_token } }),
      db.insert(settingsTable).values({ key: 'ml_refresh_token', value: data.refresh_token })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value: data.refresh_token } }),
      db.insert(settingsTable).values({ key: 'ml_token_expires_at', value: String(expiresAt) })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(expiresAt) } }),
    ]);
    return data.access_token;
  } catch {
    return null;
  }
}

// ── API oficial do ML ─────────────────────────────────────────────────────────

const ML_SORT_MAP: Record<string, string> = {
  newest:     'date_desc',
  discount:   'best_discount_amount',
  price_asc:  'price_asc',
  price_desc: 'price_desc',
  default:    'relevance',
};

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
function mapApiItem(item: any, mattWord: string, mattTool: string): MLProduct | null {
  try {
    const currentPrice: number = item.sale_price?.amount ?? item.price ?? 0;
    if (!currentPrice) return null;

    const originalPrice: number | null = item.original_price ?? null;
    let discountPercent = 0;
    if (originalPrice && originalPrice > currentPrice) {
      discountPercent = Math.round((1 - currentPrice / originalPrice) * 100);
    }

    const permalink = buildAffiliateLink(item.permalink ?? '', mattWord, mattTool);

    return {
      id: item.id,
      title: item.title,
      price: currentPrice,
      original_price: originalPrice,
      discount_percent: discountPercent,
      thumbnail: item.thumbnail?.replace('-I.jpg', '-O.jpg').replace('http:', 'https:') ?? '',
      permalink,
      condition: item.condition ?? 'new',
      sold_quantity: item.sold_quantity ?? 0,
      available_quantity: item.available_quantity ?? 0,
      category_id: item.category_id ?? '',
      seller_name: item.seller?.nickname ?? '',
    };
  } catch {
    return null;
  }
}

async function fetchViaOfficialAPI(
  token: string,
  query: string,
  category: string,
  sortKey: string,
  minDiscount: number,
  limit: number,
  page: number,
  mattWord: string,
  mattTool: string,
): Promise<{ products: MLProduct[]; total: number; hasMore: boolean }> {
  const offset = (page - 1) * limit;
  const mlSort = ML_SORT_MAP[sortKey] ?? 'relevance';

  // Busca com limite maior para compensar a filtragem local de desconto
  const fetchLimit = Math.min(limit * 3, 50);

  const params = new URLSearchParams({
    site_id: 'MLB',
    q: query || 'promoção oferta',
    sort: mlSort,
    limit: String(fetchLimit),
    offset: String(offset),
    condition: 'new',
  });

  // Não usa o filtro `discount` da API — requer scope extra que gera UNAUTHORIZED.
  // O desconto mínimo é aplicado localmente após o mapeamento.

  if (category) {
    params.set('category', category);
  }

  const url = `https://api.mercadolibre.com/sites/MLB/search?${params}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ML API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json() as {
    results: unknown[];
    paging: { total: number; offset: number; limit: number };
  };

  const results = data.results ?? [];
  // Filtra desconto localmente — evita o scope `discount` que causava UNAUTHORIZED
  const products = results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any) => mapApiItem(item, mattWord, mattTool))
    .filter((p): p is MLProduct => p !== null)
    .filter((p) => p.discount_percent >= minDiscount)
    .slice(0, limit);

  const totalFetched = data.paging?.total ?? 0;
  const hasMore = offset + results.length < Math.min(totalFetched, 500);

  return { products, total: totalFetched, hasMore };
}

// ── Scraping fallback ─────────────────────────────────────────────────────────

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Cache-Control': 'no-cache',
  'Referer': 'https://www.mercadolivre.com.br/',
};

interface RawItem {
  position: number;
  type: string;
  card: {
    metadata: { id: string; url: string; url_params?: string; category_id?: string };
    pictures?: { pictures?: Array<{ id: string }> };
    components: Array<{ type: string; id?: string; title?: { text: string }; price?: unknown }>;
  };
}

function parseItemsFromHtml(html: string): RawItem[] {
  const itemsStart = html.indexOf('"items":[');
  if (itemsStart === -1) return [];
  const arrayStart = itemsStart + '"items":'.length;
  let depth = 0;
  let end = arrayStart;
  for (let i = arrayStart; i < html.length; i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  try { return JSON.parse(html.slice(arrayStart, end)) as RawItem[]; } catch { return []; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseScrapedProduct(item: RawItem, mattWord: string, mattTool: string): MLProduct | null {
  try {
    const card = item.card;
    const meta = card.metadata;
    const comps = Object.fromEntries(card.components.map((c) => [c.type, c]));
    const titleComp = comps['title'] as { title?: { text: string } } | undefined;
    const title = titleComp?.title?.text ?? '';
    if (!title) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priceData = (comps['price'] as any)?.price ?? {};
    const currentPrice: number = priceData?.current_price?.value ?? 0;
    if (!currentPrice) return null;
    let originalPrice: number | null = null;
    let discountPercent = 0;

    // Desconto via discount_polylabel (estrutura mais comum na página de ofertas)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const discPoly = (priceData as any)?.discount_polylabel;
    if (discPoly) {
      for (const v of (discPoly.values ?? []) as Array<{ pill?: { text: string } }>) {
        if (v.pill?.text) { const m = v.pill.text.match(/(\d+)%/); if (m) discountPercent = parseInt(m[1], 10); }
      }
    }

    // Preço original e desconto via price_labels (fallback)
    const priceLabels: unknown[] = priceData?.price_labels ?? [];
    for (const label of priceLabels as Array<{ values?: Array<{ type: string; key?: string; pill?: { text: string }; price?: { value: number } }> }>) {
      for (const v of label.values ?? []) {
        if (!discountPercent && v.type === 'pill' && v.pill?.text) {
          const m = v.pill.text.match(/(\d+)%/);
          if (m) discountPercent = parseInt(m[1], 10);
        }
        if (v.type === 'price' && v.key === 'previous_price' && v.price?.value) {
          originalPrice = v.price.value;
        }
      }
    }

    // Calcula preço original a partir do desconto se não encontrou nos labels
    if (!originalPrice && discountPercent > 0 && currentPrice > 0) {
      originalPrice = Math.round((currentPrice / (1 - discountPercent / 100)) * 100) / 100;
    }
    const pics = card.pictures?.pictures ?? [];
    const picId = pics[0]?.id ?? '';
    const thumbnail = picId ? `https://http2.mlstatic.com/D_NQ_NP_${picId}-O.jpg` : '';
    const rawUrl = meta.url ?? '';
    const fullUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    const permalink = buildAffiliateLink(fullUrl + (meta.url_params ?? ''), mattWord, mattTool);
    return { id: meta.id, title, price: currentPrice, original_price: originalPrice, discount_percent: discountPercent, thumbnail, permalink, condition: 'new', sold_quantity: 0, available_quantity: 0, category_id: meta.category_id ?? '', seller_name: '' };
  } catch { return null; }
}

async function fetchViaScrapingFallback(
  query: string,
  category: string,
  minDiscount: number,
  limit: number,
  page: number,
  mattWord: string,
  mattTool: string,
): Promise<{ products: MLProduct[]; total: number; hasMore: boolean }> {
  const ITEMS_PER_ML_PAGE = 45;
  const pagesNeeded = Math.min(Math.ceil(limit / ITEMS_PER_ML_PAGE), 4);
  const startPage = (page - 1) * pagesNeeded + 1;

  const baseUrl = new URL('https://www.mercadolivre.com.br/ofertas');
  if (query) baseUrl.searchParams.set('q', query);
  if (category) baseUrl.searchParams.set('category', category);

  const pageNums = Array.from({ length: pagesNeeded }, (_, i) => startPage + i);
  const results = await Promise.all(pageNums.map(async (p) => {
    const url = new URL(baseUrl.toString());
    if (p > 1) url.searchParams.set('page', p.toString());
    try {
      const response = await fetch(url.toString(), { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(12000) });
      if (!response.ok) return [];
      return parseItemsFromHtml(await response.text());
    } catch { return []; }
  }));

  const rawItems = results.flat();
  const seen = new Set<string>();
  const products = rawItems
    .map((item) => parseScrapedProduct(item, mattWord, mattTool))
    .filter((p): p is MLProduct => p !== null)
    .filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
    .filter((p) => p.discount_percent >= minDiscount)
    .sort((a, b) => b.discount_percent - a.discount_percent)
    .slice(0, limit);

  return { products, total: products.length, hasMore: rawItems.length >= pagesNeeded * ITEMS_PER_ML_PAGE * 0.8 };
}

// ── Route ─────────────────────────────────────────────────────────────────────

async function getDbSetting(key: string): Promise<string> {
  try {
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
    return rows[0]?.value ?? '';
  } catch { return ''; }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query      = searchParams.get('q') ?? '';
  const category   = searchParams.get('category') ?? '';
  const minDiscount = parseInt(searchParams.get('minDiscount') ?? '10', 10);
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 50);
  const page       = parseInt(searchParams.get('page') ?? '1', 10);
  const sortKey    = searchParams.get('sort') ?? 'default';

  // mattWord/mattTool: usa o que vier na query, senão busca do banco (salvo nas Settings)
  const qMattWord = searchParams.get('mattWord') ?? searchParams.get('trackingId') ?? '';
  const qMattTool = searchParams.get('mattTool') ?? '';
  const [dbMattWord, dbMattTool] = await Promise.all([
    qMattWord ? Promise.resolve(qMattWord) : getDbSetting('ml_matt_word'),
    qMattTool ? Promise.resolve(qMattTool) : getDbSetting('ml_matt_tool'),
  ]);
  const mattWord = dbMattWord;
  const mattTool = dbMattTool;

  try {
    const token = await getAccessToken();

    if (token) {
      // ✅ API oficial — dados reais e atualizados, suporta sort=date_desc
      const result = await fetchViaOfficialAPI(token, query, category, sortKey, minDiscount, limit, page, mattWord, mattTool);
      return NextResponse.json({ ...result, source: 'api' });
    } else {
      // ⚠️ Fallback scraping — só mostra ofertas curadas do ML
      console.warn('[ml-deals] No ML token found, falling back to scraping');
      const result = await fetchViaScrapingFallback(query, category, minDiscount, limit, page, mattWord, mattTool);
      return NextResponse.json({ ...result, source: 'scraping', warning: 'Conecte sua conta Mercado Livre para ver ofertas em tempo real.' });
    }
  } catch (error) {
    console.error('[ml-deals] error:', error);
    // Tenta fallback em caso de erro na API
    try {
      const result = await fetchViaScrapingFallback(query, category, minDiscount, limit, page, mattWord, mattTool);
      return NextResponse.json({ ...result, source: 'scraping_fallback' });
    } catch {
      return NextResponse.json({ error: 'Falha ao buscar promoções. Tente novamente.', products: [] }, { status: 500 });
    }
  }
}
