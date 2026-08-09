export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getState,
  connect,
  disconnect,
  sendMessage,
  getGroups,
  postStatus,
} from '@/lib/wa-engine';

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

    default:
      return NextResponse.json({ error: `Rota GET não encontrada: ${segment}` }, { status: 404 });
  }
}

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

    default:
      return NextResponse.json({ error: `Rota POST não encontrada: ${segment}` }, { status: 404 });
  }
}
