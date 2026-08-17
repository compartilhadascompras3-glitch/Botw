// Proxy SQL HTTP — permite que o Cloudflare Workers acesse o banco HappySeeds via TCP
// Protegido por DB_PROXY_SECRET. Nunca expõe credenciais do banco ao cliente.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';

const PROXY_SECRET = process.env.DB_PROXY_SECRET ?? '';
const DB_URL = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

let _sql: ReturnType<typeof postgres> | null = null;
function getSql() {
  if (!_sql) _sql = postgres(DB_URL, { ssl: false, max: 5 });
  return _sql;
}

export async function POST(req: NextRequest) {
  // Autenticação
  const auth = req.headers.get('x-proxy-secret');
  if (!PROXY_SECRET || auth !== PROXY_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { query: string; params?: unknown[] };
  if (!body.query) return NextResponse.json({ error: 'Missing query' }, { status: 400 });

  try {
    const sql = getSql();
    // Executa a query com parâmetros posicionais ($1, $2, ...)
    const rows = await sql.unsafe(body.query, (body.params ?? []) as string[]);
    return NextResponse.json({ rows: Array.from(rows) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
