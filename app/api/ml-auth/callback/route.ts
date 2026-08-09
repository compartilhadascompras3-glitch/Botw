/**
 * GET /api/ml-auth/callback
 * Recebe o code do OAuth ML, troca por access_token e salva no banco.
 */
export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { settings as settingsTable } from '@/db/schemas/settings';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return new NextResponse(
      `<html><body style="background:#050505;color:#ff6060;font-family:monospace;padding:40px">
        <h2>❌ Autorização negada</h2>
        <p>${error ?? 'Código não recebido'}</p>
        <a href="/" style="color:#00D4FF">← Voltar ao app</a>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  const clientId = process.env.ML_CLIENT_ID!;
  const clientSecret = process.env.ML_CLIENT_SECRET!;
  const redirectUri = process.env.ML_REDIRECT_URI ??
    `${process.env.NEXT_API_URL ?? 'http://localhost:13000'}/api/ml-auth/callback`;

  try {
    // Trocar code por access_token
    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(`Token error ${tokenRes.status}: ${err.slice(0, 200)}`);
    }

    const token = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      user_id: number;
    };

    // Buscar username do usuário para montar os links
    const userRes = await fetch(`https://api.mercadolibre.com/users/${token.user_id}`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const user = userRes.ok ? await userRes.json() as { nickname: string } : { nickname: '' };

    // Salvar no banco (tabela settings)
    const expiresAt = Date.now() + token.expires_in * 1000;
    await db.insert(settingsTable)
      .values({ key: 'ml_access_token', value: token.access_token })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: token.access_token } });

    await db.insert(settingsTable)
      .values({ key: 'ml_refresh_token', value: token.refresh_token })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: token.refresh_token } });

    await db.insert(settingsTable)
      .values({ key: 'ml_token_expires_at', value: String(expiresAt) })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(expiresAt) } });

    await db.insert(settingsTable)
      .values({ key: 'ml_user_id', value: String(token.user_id) })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(token.user_id) } });

    await db.insert(settingsTable)
      .values({ key: 'ml_nickname', value: user.nickname })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: user.nickname } });

    return new NextResponse(
      `<html><body style="background:#050505;color:#fff;font-family:sans-serif;padding:40px;text-align:center">
        <div style="max-width:400px;margin:0 auto">
          <div style="font-size:48px;margin-bottom:16px">✅</div>
          <h2 style="color:#00FF88;margin-bottom:8px">Conectado ao Mercado Livre!</h2>
          <p style="color:#888">Conta: <strong style="color:#fff">${user.nickname || token.user_id}</strong></p>
          <p style="color:#888;font-size:13px">Links de afiliado serão gerados automaticamente.</p>
          <a href="/" style="display:inline-block;margin-top:24px;background:#00D4FF;color:#000;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600">
            ← Voltar ao PromoRadar
          </a>
        </div>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(
      `<html><body style="background:#050505;color:#ff6060;font-family:monospace;padding:40px">
        <h2>❌ Erro ao conectar</h2>
        <pre style="white-space:pre-wrap;font-size:12px">${msg}</pre>
        <a href="/" style="color:#00D4FF">← Voltar ao app</a>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}
