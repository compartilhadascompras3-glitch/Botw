export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { fetchShopeeDeals, shopeePrice, type ShopeeProduct as ShopeeAffiliate } from '@/lib/shopee-affiliate';
import { fetchPromobitOffers, toShopee, STORE_ID_SHOPEE, resolvePermalinks } from '@/lib/promobit';

// Re-exporta o tipo para compatibilidade com o restante do app
export type { ShopeeProduct } from '@/lib/promobit';

export async function GET(_req: NextRequest) {
  // Tenta API oficial de afiliados primeiro
  try {
    const products = await fetchShopeeDeals(24, 2);
    console.log('[shopee-deals] affiliate products:', products.length);
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
    // Retorna motivo do fallback para debug
    console.log('[shopee-deals] affiliate returned 0 products, falling back to promobit');
  } catch (e) {
    console.error('[shopee-deals] affiliate API error:', (e as Error).message);
    // Expõe erro no response para debug temporário
    return NextResponse.json({ products: [], source: 'affiliate_error', error: (e as Error).message }, { status: 200 });
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
