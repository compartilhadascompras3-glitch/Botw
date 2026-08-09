export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { getState } from '@/lib/wa-engine';

export async function GET() {
  const encoder = new TextEncoder();

  // Envia estado atual e fecha — o frontend faz poll via /api/wa/status
  const state = await getState();
  const body = `data: ${JSON.stringify(state)}\n\n`;

  return new Response(encoder.encode(body), {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
