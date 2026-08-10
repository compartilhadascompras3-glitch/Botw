/**
 * GET /api/ml-auth/status
 * Retorna se o ML está conectado e o nickname do usuário.
 */
export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { settings as settingsTable } from '@/db/schemas/settings';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const [tokenRow, nicknameRow, expiresRow] = await Promise.all([
      db.select().from(settingsTable).where(eq(settingsTable.key, 'ml_access_token')).limit(1),
      db.select().from(settingsTable).where(eq(settingsTable.key, 'ml_nickname')).limit(1),
      db.select().from(settingsTable).where(eq(settingsTable.key, 'ml_token_expires_at')).limit(1),
    ]);

    const token = tokenRow[0]?.value ?? null;
    if (!token) {
      return NextResponse.json({ connected: false });
    }

    const expiresAt = parseInt(expiresRow[0]?.value ?? '0', 10);
    const expired = expiresAt > 0 && Date.now() > expiresAt;

    return NextResponse.json({
      connected: true,
      nickname: nicknameRow[0]?.value ?? null,
      expired,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
