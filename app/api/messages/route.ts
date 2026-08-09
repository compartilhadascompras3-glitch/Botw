import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { messages } from '@/db/schemas/messages';
import { eq, asc } from 'drizzle-orm';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await db.select().from(messages).orderBy(asc(messages.sortOrder), asc(messages.createdAt));
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
    console.error('[messages] POST error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
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
