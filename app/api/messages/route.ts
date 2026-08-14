import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { messages } from '@/db/schemas/messages';
import { eq, asc, sql } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (id) {
      // Retorna uma mensagem específica (com media_data_url) para o wa-server buscar lazy
      const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
      if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 });
      return NextResponse.json(rows[0]);
    }
    // Lista sem media_data_url para economizar transferência
    const rows = await db.select({
      id: messages.id,
      text: messages.text,
      mediaName: messages.mediaName,
      mediaType: messages.mediaType,
      sendOnce: messages.sendOnce,
      sortOrder: messages.sortOrder,
      createdAt: messages.createdAt,
      hasMedia: sql<boolean>`(media_data_url IS NOT NULL)`,
    }).from(messages).orderBy(asc(messages.sortOrder), asc(messages.createdAt));
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[messages] GET error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      id: string;
      text: string;
      mediaDataUrl?: string;
      mediaName?: string;
      mediaType?: string;
      sendOnce?: boolean;
      sortOrder?: number;
      createdAt: number;
    };
    const [row] = await db.insert(messages).values({
      id:           body.id,
      text:         body.text ?? '',
      mediaDataUrl: body.mediaDataUrl ?? null,
      mediaName:    body.mediaName ?? null,
      mediaType:    body.mediaType ?? null,
      sendOnce:     body.sendOnce ?? false,
      sortOrder:    body.sortOrder ?? 0,
      createdAt:    body.createdAt,
    }).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    const detail = err instanceof Error
      ? { message: err.message, cause: String((err as NodeJS.ErrnoException).cause ?? '') }
      : { message: String(err) }
    console.error('[messages] POST error:', detail)
    return NextResponse.json({ error: detail.message, cause: detail.cause }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
    await db.delete(messages).where(eq(messages.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[messages] DELETE error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
