/**
 * Shared Promobit API client with in-process cache.
 * Fetches multiple pages from api.promobit.com.br and caches for 5 minutes.
 */

const API_BASE = 'https://api.promobit.com.br';
const PHOTO_BASE = 'https://i.promobit.com.br';
const PAGES_TO_FETCH = 10; // mais páginas para garantir produtos suficientes por loja
const PAGE_LIMIT = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// IDs reais de loja na Promobit (verificados via API)
export const STORE_ID_AMAZON   = 83;
export const STORE_ID_SHOPEE   = 504;
export const STORE_ID_ML       = 572;

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Encoding': 'identity',
  Origin: 'https://www.promobit.com.br',
  Referer: 'https://www.promobit.com.br/',
};

export interface PromobitOffer {
  offer_id: number;
  offer_title: string;
  offer_price: number;
  offer_old_price: number;
  offer_discont_percentage: number;
  offer_photo: string;
  offer_slug: string;
  store_name: string;
  store_domain: string;
  store_id: number;
  offer_status_name?: string;
  offer_coupon?: string | null;
}

export interface AmazonProduct {
  id: string;
  asin: string;
  title: string;
  price: number;
  original_price: number | null;
  discount_percent: number;
  thumbnail: string;
  permalink: string;
  slug?: string;
  source: 'amazon';
  stars?: number;
  reviews?: number;
  prime?: boolean;
  coupon?: string | null;
}

export interface ShopeeProduct {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  discount_percent: number;
  thumbnail: string;
  permalink: string;
  slug?: string;
  source: 'shopee';
  stars?: number;
  reviews?: number;
  sold?: number;
  coupon?: string | null;
}

// In-process cache (survives across requests within the same Node.js instance)
let cacheData: PromobitOffer[] = [];
let cacheTs = 0;

export async function fetchPromobitOffers(): Promise<PromobitOffer[]> {
  const now = Date.now();
  if (cacheData.length && now - cacheTs < CACHE_TTL_MS) return cacheData;

  const seen = new Set<number>();
  const all: PromobitOffer[] = [];
  let after: string | null = null;

  for (let page = 0; page < PAGES_TO_FETCH; page++) {
    const url = new URL(`${API_BASE}/offers`);
    url.searchParams.set('sort', 'latest');
    url.searchParams.set('limit', String(PAGE_LIMIT));
    url.searchParams.set('only_national', '1');
    if (after) url.searchParams.set('after', after);

    const res = await fetch(url.toString(), {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) break;

    const data = await res.json() as { offers?: PromobitOffer[]; after?: string };
    for (const o of data.offers ?? []) {
      if (!seen.has(o.offer_id)) {
        seen.add(o.offer_id);
        all.push(o);
      }
    }

    const next = data.after ?? null;
    if (!next || next === after) break;
    after = next;
  }

  cacheData = all;
  cacheTs = now;
  return all;
}

function photoUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${PHOTO_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

// Cache de links reais da loja (resolvidos via /Redirect/to/ID/)
const redirectCache = new Map<number, string>();

/** Resolve o link real da loja a partir da página de redirect da Promobit */
async function resolveStoreUrl(offerId: number): Promise<string> {
  if (redirectCache.has(offerId)) return redirectCache.get(offerId)!;

  const redirectUrl = `https://www.promobit.com.br/Redirect/to/${offerId}/`;
  try {
    const res = await fetch(redirectUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();

    // Tenta 1: l = 'URL' no JS inline (aspas simples escapadas como \' ou normais)
    const m1 = html.match(/,\s*l\s*=\s*'(https?:[^']+)'/);
    // Tenta 2: href do link "clique aqui" — sempre presente como fallback
    const m2 = html.match(/<a\s+href="(https?:[^"]+)"\s+href/);
    // Tenta 3: qualquer URL de loja conhecida no href
    const m3 = html.match(/href="(https?:\/\/(?:www\.amazon\.com\.br|shopee\.com\.br|mercadolivre\.com\.br)[^"]+)"/);

    const storeUrl = m1?.[1] ?? m2?.[1] ?? m3?.[1] ?? redirectUrl;
    redirectCache.set(offerId, storeUrl);
    return storeUrl;
  } catch {
    return redirectUrl;
  }
}

function offerPermalink(offer: PromobitOffer): string {
  // Usa o link de redirect direto para a loja (sem passar pela página do Promobit)
  return `https://www.promobit.com.br/Redirect/to/${offer.offer_id}/`;
}

/** Resolve os permalinks de uma lista de ofertas para os links reais da loja */
export async function resolvePermalinks<T extends { id: string; permalink: string }>(
  items: T[],
  offerIds: number[]
): Promise<T[]> {
  const resolved = await Promise.all(
    items.map(async (item, i) => {
      const storeUrl = await resolveStoreUrl(offerIds[i]);
      return { ...item, permalink: storeUrl };
    })
  );
  return resolved;
}

export function toAmazon(o: PromobitOffer): AmazonProduct {
  return {
    id: String(o.offer_id),
    asin: String(o.offer_id),
    title: o.offer_title,
    price: o.offer_price,
    original_price: o.offer_old_price || null,
    discount_percent: Math.round(o.offer_discont_percentage ?? 0),
    thumbnail: photoUrl(o.offer_photo),
    permalink: offerPermalink(o),
    slug: o.offer_slug,
    source: 'amazon',
    coupon: o.offer_coupon || null,
  };
}

export function toShopee(o: PromobitOffer): ShopeeProduct {
  return {
    id: String(o.offer_id),
    title: o.offer_title,
    price: o.offer_price,
    original_price: o.offer_old_price || null,
    discount_percent: Math.round(o.offer_discont_percentage ?? 0),
    thumbnail: photoUrl(o.offer_photo),
    permalink: offerPermalink(o),
    slug: o.offer_slug,
    source: 'shopee',
    coupon: o.offer_coupon || null,
  };
}
