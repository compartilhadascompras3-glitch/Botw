/**
 * POST /api/ml-affiliate-link
 * Body: { url: string }
 * Gera link de afiliado autenticado (meli.la) usando access_token salvo no banco.
 */
export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { settings as settingsTable } from '@/db/schemas/settings';
import { eq } from 'drizzle-orm';

async function getSetting(key: string): Promise<string> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return rows[0]?.value ?? '';
}

async function getValidToken(): Promise<string | null> {
  const token = await getSetting('ml_access_token');
  const expiresAt = parseInt(await getSetting('ml_token_expires_at') || '0', 10);
  if (!token) return null;

  // Token ainda válido (com 5min de margem)
  if (expiresAt > Date.now() + 5 * 60 * 1000) return token;

  // Tentar renovar com refresh_token
  const refreshToken = await getSetting('ml_refresh_token');
  if (!refreshToken) return null;

  try {
    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.ML_CLIENT_ID!,
        client_secret: process.env.ML_CLIENT_SECRET!,
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
    const newExpiry = Date.now() + data.expires_in * 1000;

    await db.insert(settingsTable).values({ key: 'ml_access_token', value: data.access_token })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: data.access_token } });
    await db.insert(settingsTable).values({ key: 'ml_refresh_token', value: data.refresh_token })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: data.refresh_token } });
    await db.insert(settingsTable).values({ key: 'ml_token_expires_at', value: String(newExpiry) })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(newExpiry) } });

    return data.access_token;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { url } = await req.json() as { url: string };
  if (!url) return NextResponse.json({ error: 'url obrigatória' }, { status: 400 });

  const token = await getValidToken();
  if (!token) {
    return NextResponse.json(
      { error: 'not_authenticated', message: 'Conecte sua conta ML nas configurações para gerar links de afiliado.' },
      { status: 401 }
    );
  }

  // Obter user_id salvo
  const userId = await getSetting('ml_user_id');

  // Endpoint de geração de link de afiliado do ML
  // Usar a API de social links autenticada
  try {
    const res = await fetch(
      `https://api.mercadolibre.com/social/users/${userId}/links`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      }
    );

    if (res.ok) {
      const data = await res.json() as { short_url?: string; url?: string };
      const shortUrl = data.short_url ?? data.url ?? url;
      return NextResponse.json({ url: shortUrl });
    }

    // Fallback: endpoint alternativo
    const res2 = await fetch(
      `https://api.mercadolibre.com/affiliates/link`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, platform: 'whatsapp' }),
      }
    );

    if (res2.ok) {
      const data2 = await res2.json() as { short_url?: string; url?: string };
      return NextResponse.json({ url: data2.short_url ?? data2.url ?? url });
    }

    // Último fallback: montar link com parâmetros de afiliado sem ref=
    const mattWord = await getSetting('ml_matt_word') || await getSetting('settings_mattWord') || '';
    const mattTool = await getSetting('ml_matt_tool') || await getSetting('settings_mattTool') || '';
    const nickname = await getSetting('ml_nickname') || '';

    // Montar link no formato /social/USERNAME com produto
    if (nickname) {
      const base = new URL(`https://www.mercadolivre.com.br/social/${nickname}`);
      if (mattWord) base.searchParams.set('matt_word', mattWord);
      if (mattTool) base.searchParams.set('matt_tool', mattTool);
      base.searchParams.set('forceInApp', 'true');
      base.searchParams.set('product_url', url);
      return NextResponse.json({ url: base.toString(), fallback: true });
    }

    return NextResponse.json({ url, fallback: true });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), url },
      { status: 500 }
    );
  }
}

export async function GET() {
  const token = await getValidToken();
  const nickname = await getSetting('ml_nickname');
  const userId = await getSetting('ml_user_id');
  return NextResponse.json({
    authenticated: !!token,
    nickname: nickname || null,
    userId: userId || null,
  });
}
