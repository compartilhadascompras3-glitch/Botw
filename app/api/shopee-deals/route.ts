export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { fetchPromobitOffers, toShopee, STORE_ID_SHOPEE, resolvePermalinks } from '@/lib/promobit';

export type { ShopeeProduct } from '@/lib/promobit';

export async function GET(_req: NextRequest) {
  try {
    const all = await fetchPromobitOffers();
    const filtered = all.filter(o => o.store_id === STORE_ID_SHOPEE && o.offer_status_name !== 'FINISHED');
    const products = await resolvePermalinks(filtered.map(toShopee), filtered.map(o => o.offer_id));
    return NextResponse.json({ products, hasMore: false, source: 'promobit' });
  } catch (err) {
    return NextResponse.json(
      { products: [], error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
