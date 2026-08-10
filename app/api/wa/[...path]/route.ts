export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getState,
  connect,
  disconnect,
  sendMessage,
  getGroups,
  postStatus,
  getWaServerUrl,
} from '@/lib/wa-engine';

// ── Proxy para rotas do scheduler no wa-server ────────────────────────────────

async function schedulerProxy(method: 'GET' | 'POST', path: string, body?: unknown) {
  const base = await getWaServerUrl();
  if (!base) return NextResponse.json({ error: 'wa-server URL não configurada.' }, { status: 503 });
  try {
    const res = await fetch(`${base}/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch (err) {
    return NextResponse.json({ error: `wa-server indisponível: ${String(err).slice(0, 120)}` }, { status: 503 });
  }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const segment = path.join('/');

  switch (segment) {
    case 'status':
      return NextResponse.json(await getState());

    case 'groups': {
      const groups = await getGroups();
      return NextResponse.json({ groups });
    }

    case 'scheduler/state':
      return schedulerProxy('GET', 'scheduler/state');

    default:
      return NextResponse.json({ error: `Rota GET não encontrada: ${segment}` }, { status: 404 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const segment = path.join('/');

  switch (segment) {
    case 'connect':
      await connect();
      return NextResponse.json({ ok: true });

    case 'disconnect':
      await disconnect();
      return NextResponse.json({ ok: true });

    case 'send': {
      const body = await req.json() as {
        to: string;
        message: string;
        mediaDataUrl?: string;
        mediaType?: string;
        mediaName?: string;
      };
      const media = body.mediaDataUrl
        ? { dataUrl: body.mediaDataUrl, type: body.mediaType ?? 'application/octet-stream', name: body.mediaName ?? 'file' }
        : undefined;
      const result = await sendMessage(body.to, body.message, media);
      return NextResponse.json(result);
    }

    case 'post-status': {
      const body = await req.json() as {
        message: string;
        mediaDataUrl?: string;
        mediaType?: string;
        mediaName?: string;
      };
      const media = body.mediaDataUrl
        ? { dataUrl: body.mediaDataUrl, type: body.mediaType ?? 'application/octet-stream', name: body.mediaName ?? 'file' }
        : undefined;
      const result = await postStatus(body.message, media);
      return NextResponse.json(result);
    }

    // ── Scheduler (delegado ao wa-server.js rodando no PC) ──────────────────

    case 'scheduler/start': {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      return schedulerProxy('POST', 'scheduler/start', body);
    }

    case 'scheduler/stop':
      return schedulerProxy('POST', 'scheduler/stop');

    case 'scheduler/config': {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      return schedulerProxy('POST', 'scheduler/config', body);
    }

    case 'scheduler/fire':
      return schedulerProxy('POST', 'scheduler/fire');

    default:
      return NextResponse.json({ error: `Rota POST não encontrada: ${segment}` }, { status: 404 });
  }
}
