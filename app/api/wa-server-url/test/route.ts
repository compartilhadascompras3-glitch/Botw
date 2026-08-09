export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = (searchParams.get('url') ?? '').trim().replace(/\/$/, '');

  if (!url) {
    return NextResponse.json({ ok: false, error: 'URL não informada' }, { status: 400 });
  }

  try {
    const res = await fetch(`${url}/status`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `wa-server retornou ${res.status}` });
    }
    const data = await res.json() as { status?: string };
    return NextResponse.json({ ok: true, waStatus: data.status ?? 'unknown' });
  } catch (err) {
    const msg = String(err);
    return NextResponse.json({
      ok: false,
      error: msg.includes('timeout')
        ? 'Timeout — túnel não respondeu em 8s'
        : 'Sem conexão com o wa-server',
    });
  }
}
