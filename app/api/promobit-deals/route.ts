export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { fetchPromobitOffers, toAmazon, toShopee } from '@/lib/promobit';

export async function GET(req: NextRequest) {
  const store = (req.nextUrl.searchParams.get('store') || 'amazon').toLowerCase();
  const storeLabel = store === 'shopee' ? 'Shopee' : 'Amazon';

  try {
    const all = await fetchPromobitOffers();
    const filtered = all.filter(
      o => o.store_name === storeLabel && o.offer_status_name !== 'FINISHED'
    );
    const products = store === 'shopee' ? filtered.map(toShopee) : filtered.map(toAmazon);

    return NextResponse.json(
      { products, hasMore: false, source: 'promobit', total: products.length },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } }
    );
  } catch (err) {
    return NextResponse.json(
      { products: [], error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
