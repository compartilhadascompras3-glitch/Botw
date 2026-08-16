/**
 * GET /api/ml-short-link?url=<produto-url>
 *
 * Usa sistema assíncrono de jobs:
 * 1. POST /ml/shorten → recebe jobId imediatamente
 * 2. Faz polling em GET /ml/job/:id até status=done ou error
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

  const base = serviceUrl.replace(/\/$/, '');

  try {
    // 1. Inicia o job (retorna imediatamente com jobId)
    const startRes = await fetch(`${base}/ml/shorten`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: productUrl }),
      signal: AbortSignal.timeout(10000),
    });
    const startData = await startRes.json() as { ok?: boolean; jobId?: string; error?: string };
    if (!startData.ok || !startData.jobId) {
      return NextResponse.json({ error: startData.error ?? 'Falha ao iniciar job' }, { status: 502 });
    }

    const jobId = startData.jobId;

    // 2. Polling: tenta a cada 3s por até 90s
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetch(`${base}/ml/job/${jobId}`, {
        signal: AbortSignal.timeout(8000),
      });
      const job = await pollRes.json() as { status: string; shortLink?: string; error?: string };
      if (job.status === 'done' && job.shortLink) {
        return NextResponse.json({ ok: true, shortLink: job.shortLink });
      }
      if (job.status === 'error') {
        return NextResponse.json({ error: job.error ?? 'Erro ao gerar link' }, { status: 502 });
      }
      // status === 'pending' → continua polling
    }

    return NextResponse.json({ error: 'Timeout: o Playwright demorou mais de 90s' }, { status: 504 });

  } catch (err) {
    return NextResponse.json(
      { error: `Não foi possível conectar ao wa-server: ${String(err)}` },
      { status: 503 }
    );
  }
}
