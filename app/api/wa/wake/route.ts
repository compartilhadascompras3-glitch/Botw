export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getState } from '@/lib/wa-engine';

// Wake agora apenas retorna o estado atual — a engine inicia sob demanda
export async function POST() {
  const state = await getState();
  return NextResponse.json({ started: true, message: state.message });
}
