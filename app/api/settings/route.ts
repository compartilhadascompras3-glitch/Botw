export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getEvolutionConfig, setEvolutionConfig } from '@/lib/wa-engine';
import { db } from '@/db';
import { settings as settingsTable } from '@/db/schemas/settings';
import { eq } from 'drizzle-orm';

async function getSetting(key: string): Promise<string> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  return rows[0]?.value ?? '';
}

async function setSetting(key: string, value: string) {
  await db.insert(settingsTable).values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

export async function GET() {
  try {
    const [config, mattWord, mattTool, mlLinkServerUrl] = await Promise.all([
      getEvolutionConfig(),
      getSetting('ml_matt_word'),
      getSetting('ml_matt_tool'),
      getSetting('ml_link_server_url'),
    ]);
    return NextResponse.json({
      evolutionUrl: config.url,
      evolutionInstance: config.instance,
      evolutionApiKeySet: !!config.apiKey,
      mattWord,
      mattTool,
      mlLinkServerUrl,
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
      mattWord?: string;
      mattTool?: string;
      mlLinkServerUrl?: string;
    };

    const url = (body.evolutionUrl ?? '').trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        { error: 'A URL deve começar com http:// ou https://' },
        { status: 400 }
      );
    }

    const tasks: Promise<unknown>[] = [];

    // Salva config Evolution
    tasks.push((async () => {
      const current = await getEvolutionConfig();
      await setEvolutionConfig(
        url || current.url,
        body.evolutionApiKey !== undefined && body.evolutionApiKey !== ''
          ? body.evolutionApiKey
          : current.apiKey,
        (body.evolutionInstance ?? '').trim() || current.instance || 'whatsapp-bot',
      );
    })());

    // Salva matt_word, matt_tool e ml_link_server_url no banco
    if (body.mattWord !== undefined) tasks.push(setSetting('ml_matt_word', body.mattWord.trim()));
    if (body.mattTool !== undefined) tasks.push(setSetting('ml_matt_tool', body.mattTool.trim()));
    if (body.mlLinkServerUrl !== undefined) tasks.push(setSetting('ml_link_server_url', body.mlLinkServerUrl.trim()));

    await Promise.all(tasks);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
