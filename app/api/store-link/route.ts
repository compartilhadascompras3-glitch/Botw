export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  // O offer_id está sempre no final do slug: "titulo-do-produto-2974309"
  const idMatch = slug.match(/[-_](\d{5,})$/);
  const offerId = idMatch?.[1];

  if (offerId) {
    try {
      // Busca o HTML da página /Redirect/to/ID/ e extrai o link real da loja
      const html = await fetch(`https://www.promobit.com.br/Redirect/to/${offerId}/`, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
        signal: AbortSignal.timeout(8000),
      }).then(r => r.text());

      // l = 'URL_DA_LOJA' no JS inline
      const m1 = html.match(/,\s*l\s*=\s*'(https?:[^']+)'/);
      // fallback: href do "clique aqui"
      const m2 = html.match(/<a\s+href="(https?:[^"]+)"\s+href/);

      const storeUrl = m1?.[1] ?? m2?.[1];
      if (storeUrl) return NextResponse.json({ url: storeUrl });
    } catch { /* segue para fallback */ }
  }

  // Último fallback: link da página da oferta no Promobit
  return NextResponse.json({ url: `https://www.promobit.com.br/oferta/${slug}/` });
}
