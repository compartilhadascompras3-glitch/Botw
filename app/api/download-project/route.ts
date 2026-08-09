import { NextResponse } from 'next/server';
import { ZipArchive } from 'archiver';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';

const EXCLUDE_DIRS = new Set([
  'node_modules', '.next', '.wa-session', '.git', 'dist', '.turbo', '.vercel', '.open-next',
]);
const EXCLUDE_FILES = new Set(['.env', '.env.local', '.env.production']);

// Arquivo do selo visual da plataforma (widget "Edit with HappySeeds").
// É útil apenas dentro do editor/preview da HappySeeds (usa APIs internas
// da plataforma) e não deve ir para o projeto que o usuário baixa.
const WATERMARK_COMPONENT_PATH = path.join('components', 'HappySeedsWatermark.tsx');

/** Remove a importação e o uso de <HappySeedsWatermark /> do layout antes de zipar. */
function stripWatermarkFromLayout(source: string): string {
  return source
    .replace(/^import \{ HappySeedsWatermark \} from ["']@\/components\/HappySeedsWatermark["'];\n/m, '')
    .replace(/\s*<HappySeedsWatermark \/>\n/, '\n');
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const root = path.resolve(/*turbopackIgnore: true*/ process.cwd());

  const archive = new ZipArchive({ zlib: { level: 6 } });

  function addDir(dirPath: string, zipBase: string) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (EXCLUDE_DIRS.has(entry.name) || EXCLUDE_FILES.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.env.example' && entry.name !== '.docs' && entry.name !== '.vercelignore') continue;

      const fullPath = path.join(dirPath, entry.name);
      const zipPath = path.join(zipBase, entry.name);
      const relPath = path.relative(root, fullPath);

      if (entry.isDirectory()) {
        addDir(fullPath, zipPath);
      } else if (entry.isFile()) {
        if (relPath === WATERMARK_COMPONENT_PATH) continue;
        if (relPath === path.join('app', 'layout.tsx')) {
          const source = fs.readFileSync(fullPath, 'utf8');
          const stripped = stripWatermarkFromLayout(source);
          archive.append(stripped, { name: zipPath });
          continue;
        }
        archive.file(fullPath, { name: zipPath });
      }
    }
  }

  addDir(root, 'whatsapp-bot');
  archive.finalize();

  const webStream = Readable.toWeb(archive as unknown as Readable) as ReadableStream<Uint8Array>;
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const filename = `whatsapp-bot_${timestamp}.zip`;

  return new NextResponse(webStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
