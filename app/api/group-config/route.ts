import { NextResponse } from 'next/server';
import { db } from '@/db';
import { settings as settingsTable } from '@/db/schemas/settings';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await db.select().from(settingsTable)
      .where(eq(settingsTable.key, 'group_config'));
    const config = rows[0]?.value ? JSON.parse(rows[0].value) : {};
    return NextResponse.json(config);
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    await db.insert(settingsTable)
      .values({ key: 'group_config', value: JSON.stringify(body) })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: JSON.stringify(body) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
