import { NextRequest, NextResponse } from 'next/server';

/**
 * Detecta o tipo MIME real de uma imagem pelos primeiros bytes (magic bytes).
 * Necessário porque CDNs como o da Promobit retornam content-type: application/octet-stream
 * mesmo para arquivos JPEG/PNG/WEBP, quebrando o envio para LLMs com visão.
 */
function detectMimeType(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  // GIF: 47 49 46
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  // AVIF / HEIC: ftyp box
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'image/avif';
  // Fallback: usa o content-type do servidor (pode estar errado) ou image/jpeg
  return 'image/jpeg';
}

// Proxy para buscar imagens externas como base64 (evita CORS no browser)
export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url obrigatória' }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return NextResponse.json({ error: 'falha ao buscar imagem' }, { status: 502 });

    const buffer = await res.arrayBuffer();

    // Detecta o tipo real pelos magic bytes — ignora content-type do servidor quando
    // genérico (application/octet-stream), que é o que o CDN da Promobit retorna.
    const serverContentType = res.headers.get('content-type') ?? '';
    const isGeneric = !serverContentType || serverContentType.includes('octet-stream') || !serverContentType.startsWith('image/');
    const contentType = isGeneric ? detectMimeType(buffer) : serverContentType.split(';')[0].trim();

    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    return NextResponse.json({ dataUrl, contentType });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
