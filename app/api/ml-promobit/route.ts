import { NextRequest, NextResponse } from 'next/server';
import {
  fetchPromobitOffers,
  STORE_ID_ML,
} from '@/lib/promobit';
import type { MLProduct } from '@/app/api/ml-deals/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const minDiscount = Number(searchParams.get('minDiscount') ?? '10');
    const limit       = Number(searchParams.get('limit') ?? '50');
    const q           = (searchParams.get('q') ?? '').toLowerCase().trim();
    const mattWord    = (searchParams.get('mattWord') ?? '').toLowerCase().trim();

    const all = await fetchPromobitOffers();

    const mlOffers = all.filter(o => o.store_id === STORE_ID_ML);

    const filtered = mlOffers.filter(o => {
      if (o.offer_discont_percentage < minDiscount) return false;
      if (mattWord && o.offer_title.toLowerCase().includes(mattWord)) return false;
      if (q && !o.offer_title.toLowerCase().includes(q)) return false;
      return true;
    });

    // Ordena por desconto decrescente
    filtered.sort((a, b) => b.offer_discont_percentage - a.offer_discont_percentage);

    const products: MLProduct[] = filtered.slice(0, limit).map(o => ({
      id:                 `pb_${o.offer_id}`,
      title:              o.offer_title,
      price:              o.offer_price,
      original_price:     o.offer_old_price || null,
      discount_percent:   Math.round(o.offer_discont_percentage ?? 0),
      thumbnail:          o.offer_photo?.startsWith('http')
        ? o.offer_photo
        : `https://i.promobit.com.br${o.offer_photo?.startsWith('/') ? '' : '/'}${o.offer_photo ?? ''}`,
      permalink:          `https://www.promobit.com.br/oferta/${o.offer_slug}/ir-a-loja/`,
      condition:          'new',
      sold_quantity:      0,
      available_quantity: 0,
      category_id:        '',
      seller_name:        'Mercado Livre',
      source:             'ml_promobit',
    }));

    return NextResponse.json({ products, total: products.length });
  } catch (e) {
    console.error('[ml-promobit]', e);
    return NextResponse.json({ products: [], error: String(e) }, { status: 500 });
  }
}
