/**
 * GET /api/ml-short-link?url=<produto-url>
 *
 * Chama o ml-link-server.js rodando no PC do usuário (exposto via ngrok ou local)
 * e retorna o link curto meli.la gerado pelo portal de afiliados do ML.
 *
 * A URL do serviço local é salva no banco via POST /api/settings { mlLinkServerUrl }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { settings as settingsTable } from '@/db/schemas/settings';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getServiceUrl(): Promise<string> {
  try {
    const rows = await db.select().from(settingsTable)
      .where(eq(settingsTable.key, 'ml_link_server_url')).limit(1);
    return rows[0]?.value?.trim() ?? '';
  } catch { return ''; }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productUrl = searchParams.get('url');

  if (!productUrl) {
    return NextResponse.json({ error: 'Parâmetro url é obrigatório' }, { status: 400 });
  }

  const serviceUrl = await getServiceUrl();
  if (!serviceUrl) {
    return NextResponse.json(
      { error: 'ml-link-server não configurado. Configure a URL em Settings.' },
      { status: 503 }
    );
  }

  try {
    const endpoint = `${serviceUrl.replace(/\/$/, '')}/shorten?url=${encodeURIComponent(productUrl)}`;
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(20000) });
    const data = await res.json() as { ok?: boolean; shortLink?: string; error?: string };

    if (!res.ok || !data.ok || !data.shortLink) {
      return NextResponse.json(
        { error: data.error ?? 'Falha ao gerar link' },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, shortLink: data.shortLink });
  } catch (err) {
    return NextResponse.json(
      { error: `Não foi possível conectar ao ml-link-server: ${String(err)}` },
      { status: 503 }
    );
  }
}
