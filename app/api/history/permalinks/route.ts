import { NextResponse } from 'next/server';
import { db } from '@/db';
import { history } from '@/db/schemas/history';
import { desc } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Regex que captura qualquer URL dentro do messageText
const URL_RE = /https?:\/\/[^\s"')]+/g;

/**
 * GET /api/history/permalinks
 * Retorna o conjunto de todos os permalinks (links de produto) já enviados,
 * extraídos do campo messageText do histórico. O frontend usa essa lista
 * para marcar como "Adicionar novamente" qualquer produto do PromoRadar
 * cujo link já tenha sido disparado antes.
 */
export async function GET() {
  try {
    const rows = await db
      .select({ messageText: history.messageText })
      .from(history)
      .orderBy(desc(history.sentAt))
      .limit(2000);

    const permalinks = new Set<string>();

    for (const row of rows) {
      const matches = row.messageText.match(URL_RE);
      if (matches) {
        for (const url of matches) {
          // Normaliza: remove trailing punctuation que pode ter colado no regex
          permalinks.add(url.replace(/[.,;!?]+$/, ''));
        }
      }
    }

    return NextResponse.json({ permalinks: Array.from(permalinks) });
  } catch (err) {
    console.error('[history/permalinks] GET error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
