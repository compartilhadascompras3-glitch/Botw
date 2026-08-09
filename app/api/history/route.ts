import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { history } from '@/db/schemas/history';
import { eq, desc } from 'drizzle-orm';
import { Target } from '@/store/botStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/history — lista histórico (mais recente primeiro, limite 200)
export async function GET() {
  try {
    const rows = await db.select().from(history).orderBy(desc(history.sentAt)).limit(200);
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[history] GET error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/history — salva uma entrada
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      id: string;
      messageId: string;
      messageText: string;
      hasMedia: boolean;
      targets: Target[];
      sentAt: number;
    };
    const [row] = await db.insert(history).values({
      id:          body.id,
      messageId:   body.messageId,
      messageText: body.messageText ?? '',
      hasMedia:    body.hasMedia ?? false,
      targets:     body.targets ?? [],
      sentAt:      body.sentAt,
    }).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error('[history] POST error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/history?id=xxx — apaga uma entrada
// DELETE /api/history?all=1   — apaga tudo
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('all') === '1') {
      await db.delete(history);
      return NextResponse.json({ ok: true });
    }
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
    await db.delete(history).where(eq(history.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[history] DELETE error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
