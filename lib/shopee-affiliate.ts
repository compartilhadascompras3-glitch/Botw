/**
 * Shopee Affiliate Open API — GraphQL client com autenticação SHA256
 * Doc: https://open-api.affiliate.shopee.com.br/graphql
 */

import { createHash } from 'crypto';
import { db } from '@/db';
import { settings } from '@/db/schemas/settings';
import { eq } from 'drizzle-orm';

const SHOPEE_API = 'https://open-api.affiliate.shopee.com.br/graphql';

async function getCredentials(): Promise<{ appId: string; secret: string } | null> {
  try {
    const rows = await db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(eq(settings.key, 'shopee_app_id'));
    const rows2 = await db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(eq(settings.key, 'shopee_secret'));

    const appId = rows[0]?.value ?? process.env.SHOPEE_APP_ID ?? '';
    const secret = rows2[0]?.value ?? process.env.SHOPEE_SECRET ?? '';
    if (!appId || !secret) return null;
    return { appId, secret };
  } catch { return null; }
}

function buildAuth(appId: string, secret: string, payload: string, timestamp: number): string {
  const factor = appId + String(timestamp) + payload + secret;
  const signature = createHash('sha256').update(factor).digest('hex');
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;
}

export async function shopeeGraphQL<T = unknown>(query: string): Promise<T | null> {
  const creds = await getCredentials();
  if (!creds) { console.error('[Shopee] Credenciais não configuradas'); return null; }

  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ query });
  const auth = buildAuth(creds.appId, creds.secret, payload, timestamp);

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

/** Busca ofertas de produtos — sortType 2 = mais recentes */
export async function fetchShopeeDeals(limit = 20, sortType = 2): Promise<ShopeeProduct[]> {
  const data = await shopeeGraphQL<{
    productOfferV2: { nodes: ShopeeProduct[] };
  }>(`{
    productOfferV2(page: 1, limit: ${limit}, sortType: ${sortType}) {
      nodes { ${PRODUCT_FIELDS} }
    }
  }`);
  return data?.productOfferV2?.nodes ?? [];
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
