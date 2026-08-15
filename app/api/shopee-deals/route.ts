export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { fetchShopeeDeals, shopeePrice, shopeeGraphQL, type ShopeeProduct as ShopeeAffiliate } from '@/lib/shopee-affiliate';
import { fetchPromobitOffers, toShopee, STORE_ID_SHOPEE, resolvePermalinks } from '@/lib/promobit';

// Re-exporta o tipo para compatibilidade com o restante do app
export type { ShopeeProduct } from '@/lib/promobit';

export async function GET(req: NextRequest) {
  const isDebug = req.nextUrl.searchParams.has('debug');

  // Tenta API oficial de afiliados primeiro
  let affiliateError = '';
  let affiliateCount = -1;
  try {
    const products = await fetchShopeeDeals(24, 2);
    affiliateCount = products.length;
    if (products.length > 0) {
      const mapped = products.map((p: ShopeeAffiliate) => ({
        id: `spe_${p.shopId}_${p.itemId}`,
        title: p.productName,
        price: shopeePrice(p.priceMin || p.price),
        original_price: p.priceDiscountRate > 0
          ? Math.round(shopeePrice(p.priceMin || p.price) / (1 - p.priceDiscountRate / 100))
          : null,
        discount_percent: p.priceDiscountRate || 0,
        thumbnail: p.imageUrl,
        permalink: p.offerLink || p.productLink,
        source: 'shopee' as const,
        commission_rate: p.commissionRate,
        seller_name: p.shopName,
        rating: p.ratingStar,
      }));
      return NextResponse.json({ products: mapped, hasMore: false, source: 'shopee_affiliate' });
    }
    affiliateError = 'zero products';
  } catch (e) {
    affiliateError = (e as Error).message;
  }

  if (isDebug) {
    // Modo diagnóstico: faz um GraphQL direto sem passar por fetchShopeeDeals
    try {
      const raw = await shopeeGraphQL<{ productOfferV2: { nodes: unknown[] } }>(`{
        productOfferV2(page: 1, limit: 2, sortType: 2) {
          nodes { itemId productName offerLink }
        }
      }`);
      return NextResponse.json({
        affiliateCount,
        affiliateError,
        rawResult: raw,
        hasAppId: !!process.env.SHOPEE_APP_ID,
        hasSecret: !!process.env.SHOPEE_SECRET,
      });
    } catch (de) {
      return NextResponse.json({ affiliateCount, affiliateError, debugError: (de as Error).message });
    }
  }

  // Fallback: Promobit
  try {
    const all = await fetchPromobitOffers();
    const filtered = all.filter(o => o.store_id === STORE_ID_SHOPEE && o.offer_status_name !== 'FINISHED');
    const mapped = await resolvePermalinks(filtered.map(toShopee), filtered.map(o => o.offer_id));
    return NextResponse.json({ products: mapped, hasMore: false, source: 'promobit' });
  } catch (err) {
    return NextResponse.json(
      { products: [], error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
