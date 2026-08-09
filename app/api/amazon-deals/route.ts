export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { fetchPromobitOffers, toAmazon } from '@/lib/promobit';

export type { AmazonProduct } from '@/lib/promobit';

export async function GET(_req: NextRequest) {
  try {
    const all = await fetchPromobitOffers();
    const products = all
      .filter(o => o.store_name === 'Amazon' && o.offer_status_name !== 'FINISHED')
      .map(toAmazon);
    return NextResponse.json({ products, hasMore: false, source: 'promobit' });
  } catch (err) {
    return NextResponse.json(
      { products: [], error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
