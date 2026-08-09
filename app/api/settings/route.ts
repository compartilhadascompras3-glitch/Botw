export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getEvolutionConfig, setEvolutionConfig } from '@/lib/wa-engine';

export async function GET() {
  try {
    const config = await getEvolutionConfig();
    return NextResponse.json({
      evolutionUrl: config.url,
      evolutionInstance: config.instance,
      // nunca retorna a key — só confirma se está configurada
      evolutionApiKeySet: !!config.apiKey,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      evolutionUrl?: string;
      evolutionApiKey?: string;
      evolutionInstance?: string;
    };

    const url = (body.evolutionUrl ?? '').trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        { error: 'A URL deve começar com http:// ou https://' },
        { status: 400 }
      );
    }

    const current = await getEvolutionConfig();
    await setEvolutionConfig(
      url || current.url,
      // se vier string vazia, mantém a key atual (não apaga)
      body.evolutionApiKey !== undefined && body.evolutionApiKey !== ''
        ? body.evolutionApiKey
        : current.apiKey,
      (body.evolutionInstance ?? '').trim() || current.instance || 'whatsapp-bot',
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
