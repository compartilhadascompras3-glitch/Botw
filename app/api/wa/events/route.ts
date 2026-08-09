export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { getState, onStateChange } from '@/lib/wa-engine';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Envia estado atual imediatamente
      const initial = `data: ${JSON.stringify(getState())}\n\n`;
      controller.enqueue(encoder.encode(initial));

      // Subscreve mudanças
      const unsub = onStateChange((state) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(state)}\n\n`));
        } catch {
          unsub();
        }
      });

      // Heartbeat a cada 15s para manter a conexão viva
      const hb = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(hb);
          unsub();
        }
      }, 15_000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
