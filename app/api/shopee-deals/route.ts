export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { fetchPromobitOffers, toShopee } from '@/lib/promobit';

export type { ShopeeProduct } from '@/lib/promobit';

export async function GET(_req: NextRequest) {
  try {
    const all = await fetchPromobitOffers();
    const products = all
      .filter(o =>
        (o.store_name === 'Shopee' || o.store_domain?.includes('shopee.com')) &&
        o.offer_status_name !== 'FINISHED'
      )
      .map(toShopee);
    return NextResponse.json({ products, hasMore: false, source: 'promobit' });
  } catch (err) {
    return NextResponse.json(
      { products: [], error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
