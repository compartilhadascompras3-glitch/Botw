import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { messages } from '@/db/schemas/messages';
import { eq } from 'drizzle-orm';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// PATCH /api/messages/:id — atualiza texto, mídia ou sendOnce
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json() as Partial<{
      text: string;
      mediaDataUrl: string | null;
      mediaName: string | null;
      mediaType: string | null;
      sendOnce: boolean;
      sortOrder: number;
    }>;
    const [row] = await db
      .update(messages)
      .set(body)
      .where(eq(messages.id, id))
      .returning();
    if (!row) return NextResponse.json({ error: 'não encontrado' }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    console.error('[messages/:id] PATCH error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
