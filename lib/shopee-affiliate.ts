/**
 * Shopee Affiliate Open API — GraphQL client com autenticação SHA256
 * Doc: https://open-api.affiliate.shopee.com.br/graphql
 */

import { db } from '@/db';
import { settings } from '@/db/schemas/settings';
import { eq } from 'drizzle-orm';

const SHOPEE_API = 'https://open-api.affiliate.shopee.com.br/graphql';

async function getCredentials(): Promise<{ appId: string; secret: string } | null> {
  // Tenta env vars primeiro (mais rápido e confiável no Workers)
  const envAppId = process.env.SHOPEE_APP_ID ?? '';
  const envSecret = process.env.SHOPEE_SECRET ?? '';
  if (envAppId && envSecret) return { appId: envAppId, secret: envSecret };

  // Fallback: banco de dados
  try {
    const rows = await db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(eq(settings.key, 'shopee_app_id'));
    const rows2 = await db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(eq(settings.key, 'shopee_secret'));

    const appId = rows[0]?.value ?? '';
    const secret = rows2[0]?.value ?? '';
    // Credenciais padrão como fallback absoluto
    return {
      appId: appId || '18337771181',
      secret: secret || 'GJJVJ2IHPCL2T7OWPC5FY2AS43NSTLW4',
    };
  } catch {
    return { appId: '18337771181', secret: 'GJJVJ2IHPCL2T7OWPC5FY2AS43NSTLW4' };
  }
}

/** SHA256 usando Web Crypto API (compatível com Cloudflare Workers e Node 18+) */
async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function buildAuth(appId: string, secret: string, payload: string, timestamp: number): Promise<string> {
  const factor = appId + String(timestamp) + payload + secret;
  const signature = await sha256Hex(factor);
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;
}

export async function shopeeGraphQL<T = unknown>(query: string): Promise<T | null> {
  const creds = await getCredentials();
  if (!creds) { console.error('[Shopee] Credenciais não configuradas'); return null; }

  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ query });
  const auth = await buildAuth(creds.appId, creds.secret, payload, timestamp);

  try {
    const res = await fetch(SHOPEE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': auth },
      body: payload,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) { console.error('[Shopee] HTTP', res.status); return null; }
    const data = await res.json() as { data?: T; errors?: { message: string }[] };
    if (data.errors?.length) {
      console.error('[Shopee] GraphQL errors:', data.errors.map(e => e.message).join('; '));
      return null;
    }
    return data.data ?? null;
  } catch (e) {
    console.error('[Shopee] fetch error:', (e as Error).message);
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShopeeProduct {
  itemId: number;
  shopId: number;
  productName: string;
  price: string;           // preço atual (string com centavos ou float)
  priceMin: string;
  priceMax: string;
  priceDiscountRate: number; // percentual de desconto
  imageUrl: string;
  productLink: string;     // link original do produto
  offerLink: string;       // link de afiliado gerado
  commissionRate: string;
  shopName: string;
  ratingStar: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converte o preço da Shopee (pode vir como "1234" em centavos ou "12.34") para float em reais */
export function shopeePrice(raw: string | number | null | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(String(raw).replace(',', '.'));
  if (isNaN(n)) return 0;
  // Shopee às vezes retorna em centavos (ex: 12999 = R$129,99)
  return n > 1000 ? n / 100 : n;
}

// ── Queries ───────────────────────────────────────────────────────────────────

const PRODUCT_FIELDS = `
  itemId shopId productName price priceMin priceMax priceDiscountRate
  imageUrl productLink offerLink commissionRate shopName ratingStar
`;

/** Busca uma página de ofertas */
async function fetchShopeePage(page: number, limit: number, sortType: number): Promise<ShopeeProduct[]> {
  const data = await shopeeGraphQL<{
    productOfferV2: { nodes: ShopeeProduct[] };
  }>(`{
    productOfferV2(page: ${page}, limit: ${limit}, sortType: ${sortType}) {
      nodes { ${PRODUCT_FIELDS} }
    }
  }`);
  return data?.productOfferV2?.nodes ?? [];
}

/**
 * Busca ofertas de produtos em múltiplas páginas em paralelo.
 * sortType: 1 = comissão, 2 = recentes, 3 = mais vendidos
 * Por padrão busca 500 produtos combinando os 3 sortTypes para máxima variedade.
 */
export async function fetchShopeeDeals(totalWanted = 500, sortType = 2): Promise<ShopeeProduct[]> {
  const pageSize = 50; // máximo suportado pela API

  // Busca os 3 sortTypes em paralelo para máxima variedade de produtos
  const sortTypes = sortType === 2 ? [1, 2, 3] : [sortType];
  const perSort = Math.ceil(totalWanted / sortTypes.length);
  const pages = Math.ceil(perSort / pageSize);

  const allRequests = sortTypes.flatMap(st =>
    Array.from({ length: pages }, (_, i) => fetchShopeePage(i + 1, pageSize, st))
  );

  const results = await Promise.allSettled(allRequests);

  const all: ShopeeProduct[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  // Deduplica por itemId
  const seen = new Set<number>();
  return all.filter(p => {
    if (seen.has(p.itemId)) return false;
    seen.add(p.itemId);
    return true;
  });
}

/** Busca produto específico por itemId e shopId via productOfferV2 */
export async function fetchShopeeProductById(
  itemId: string,
  shopId: string
): Promise<ShopeeProduct | null> {
  const data = await shopeeGraphQL<{
    productOfferV2: { nodes: ShopeeProduct[] };
  }>(`{
    productOfferV2(itemId: ${itemId}, shopId: ${shopId}, limit: 1) {
      nodes { ${PRODUCT_FIELDS} }
    }
  }`);
  return data?.productOfferV2?.nodes?.[0] ?? null;
}
