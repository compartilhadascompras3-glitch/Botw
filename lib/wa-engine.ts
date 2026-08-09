/**
 * wa-engine.ts — proxy para o wa-server.js rodando localmente no PC do usuário.
 *
 * O wa-server.js usa Baileys (WebSocket direto com WhatsApp, sem Chrome).
 * O app na nuvem chama este módulo, que por sua vez chama a URL configurada
 * (salva no banco) apontando para o túnel do PC (ex: Cloudflare Tunnel).
 *
 * Fluxo:
 *   App (HappySeeds) → /api/wa/* → wa-engine.ts → <túnel> → wa-server.js (PC)
 */

export type WaStatus = 'disconnected' | 'qr' | 'connecting' | 'ready' | 'auth_failure';

export interface WaState {
  status: WaStatus;
  message: string;
  qr: string | null;
}

// ─── URL do wa-server (salva no banco ou env) ─────────────────────────────────

const DEFAULT_WA_SERVER_URL = process.env.WA_SERVER_URL ?? '';

export async function getWaServerUrl(): Promise<string> {
  try {
    const { db } = await import('@/db');
    const { settings } = await import('@/db/schemas/settings');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(settings).where(eq(settings.key, 'wa_server_url')).limit(1);
    const stored = row?.value?.trim();
    if (stored) return stored.replace(/\/$/, '');
  } catch { /* ignora */ }
  return DEFAULT_WA_SERVER_URL.replace(/\/$/, '');
}

export async function setWaServerUrl(url: string): Promise<void> {
  try {
    const { db } = await import('@/db');
    const { settings } = await import('@/db/schemas/settings');
    const clean = url.trim().replace(/\/$/, '');
    await db.insert(settings).values({ key: 'wa_server_url', value: clean })
      .onConflictDoUpdate({ target: settings.key, set: { value: clean } });
  } catch { /* ignora */ }
}

// ─── Helper de request ao wa-server ──────────────────────────────────────────

async function waReq(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<unknown> {
  const base = await getWaServerUrl();
  if (!base) throw new Error('wa_server_not_configured');
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`wa-server ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Stubs de compatibilidade ─────────────────────────────────────────────────

export function onStateChange(_cb: (s: WaState) => void): () => void {
  return () => {};
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getState(): Promise<WaState> {
  const base = await getWaServerUrl();
  if (!base) {
    return {
      status: 'disconnected',
      message: 'Configure a URL do wa-server nas configurações (ícone de engrenagem).',
      qr: null,
    };
  }
  try {
    const data = await waReq('GET', '/status') as {
      status?: string;
      message?: string;
      qr?: string | null;
    };
    const status = (data.status as WaStatus) ?? 'disconnected';
    return {
      status,
      message: data.message ?? '',
      qr: data.qr ?? null,
    };
  } catch (err) {
    const msg = String(err);
    if (msg.includes('wa_server_not_configured')) {
      return { status: 'disconnected', message: 'Configure a URL do wa-server.', qr: null };
    }
    if (
      msg.includes('timeout') || msg.includes('fetch') ||
      msg.includes('ECONNREFUSED') || msg.includes('Failed to fetch') ||
      msg.includes('502') || msg.includes('503') || msg.includes('504')
    ) {
      return { status: 'connecting', message: 'wa-server não está respondendo. Verifique se está rodando e o túnel está ativo.', qr: null };
    }
    return { status: 'disconnected', message: 'Erro ao conectar ao wa-server.', qr: null };
  }
}

export async function connect(): Promise<void> {
  try {
    await waReq('POST', '/connect');
  } catch { /* ignora — o frontend vai pegar o novo status via polling */ }
}

export async function disconnect(): Promise<void> {
  try {
    await waReq('POST', '/disconnect');
  } catch { /* ignora */ }
}

export async function sendMessage(
  to: string,
  text: string,
  media?: { dataUrl: string; type: string; name: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const body: Record<string, unknown> = { to, message: text };
    if (media?.dataUrl) {
      body.mediaDataUrl = media.dataUrl;
      body.mediaType    = media.type;
      body.mediaName    = media.name;
    }
    await waReq('POST', '/send', body);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function getGroups(): Promise<{ id: string; name: string; participantsCount: number }[]> {
  try {
    const data = await waReq('GET', '/groups') as { groups?: Array<{ id: string; name: string; participantsCount: number }> };
    return Array.isArray(data.groups) ? data.groups : [];
  } catch { return []; }
}

export async function postStatus(
  text: string,
  media?: { dataUrl: string; type: string; name: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const body: Record<string, unknown> = { message: text };
    if (media?.dataUrl) {
      body.mediaDataUrl = media.dataUrl;
      body.mediaType    = media.type;
      body.mediaName    = media.name;
    }
    await waReq('POST', '/post-status', body);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ─── Compatibilidade com Evolution API (não mais usada) ───────────────────────
// Mantidas para não quebrar imports antigos em outros arquivos

export async function getEvolutionConfig() {
  return { url: '', apiKey: '', instance: '' };
}
export async function setEvolutionConfig(_url: string, _key: string, _instance: string) {}
