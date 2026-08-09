export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getWaServerUrl, setWaServerUrl } from '@/lib/wa-engine';

export async function GET() {
  try {
    const url = await getWaServerUrl();
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { url?: string };
    const url = (body.url ?? '').trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        { error: 'A URL deve começar com http:// ou https://' },
        { status: 400 },
      );
    }
    await setWaServerUrl(url);
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
