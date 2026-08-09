export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  try {
    const html = await fetch(`https://www.promobit.com.br/oferta/${slug}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html',
        Referer: 'https://www.promobit.com.br/',
      },
      signal: AbortSignal.timeout(10000),
    }).then(r => r.text());

    // Extrai o link de rastreamento da loja
    const match = html.match(/"url":"(https:\/\/promobit\.webtrack\.com\.br\/redirecionar\/[^"]+)"/);
    if (match?.[1]) {
      return NextResponse.json({ url: match[1] });
    }

    // Fallback: link da página da oferta
    return NextResponse.json({ url: `https://www.promobit.com.br/oferta/${slug}/` });
  } catch {
    return NextResponse.json({ url: `https://www.promobit.com.br/oferta/${slug}/` });
  }
}
