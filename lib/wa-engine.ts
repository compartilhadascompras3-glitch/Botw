/**
 * wa-engine.ts — Evolution API client.
 * Funciona em qualquer ambiente (HappySeeds/Cloudflare Workers, Railway, Render).
 */
import { EventEmitter } from 'node:events';

export type WaStatus = 'disconnected' | 'qr' | 'connecting' | 'ready' | 'auth_failure';

export interface WaState {
  status: WaStatus;
  message: string;
  qr: string | null;
}

// ─── Evolution API config ─────────────────────────────────────────────────────

const DEFAULT_URL = 'https://evolution-api-latest-lr88.onrender.com';
const DEFAULT_KEY = 'botwa123';
const DEFAULT_INSTANCE = 'whatsapp-bot';

export async function getEvolutionConfig() {
  // Lê do banco se disponível, senão usa env/default
  try {
    const { db } = await import('@/db');
    const { settings } = await import('@/db/schemas/settings');
    const { eq } = await import('drizzle-orm');
    async function get(key: string, fallback: string) {
      const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
      return row?.value?.trim() || fallback;
    }
    const [url, apiKey, instance] = await Promise.all([
      get('evolution_url', process.env.EVOLUTION_API_URL ?? DEFAULT_URL),
      get('evolution_api_key', process.env.EVOLUTION_API_KEY ?? DEFAULT_KEY),
      get('evolution_instance', process.env.EVOLUTION_INSTANCE ?? DEFAULT_INSTANCE),
    ]);
    return { url: url.replace(/\/$/, ''), apiKey, instance };
  } catch {
    return {
      url: (process.env.EVOLUTION_API_URL ?? DEFAULT_URL).replace(/\/$/, ''),
      apiKey: process.env.EVOLUTION_API_KEY ?? DEFAULT_KEY,
      instance: process.env.EVOLUTION_INSTANCE ?? DEFAULT_INSTANCE,
    };
  }
}

export async function setEvolutionConfig(url: string, apiKey: string, instance: string) {
  try {
    const { db } = await import('@/db');
    const { settings } = await import('@/db/schemas/settings');
    const upsert = async (key: string, value: string) =>
      db.insert(settings).values({ key, value: value.trim() })
        .onConflictDoUpdate({ target: settings.key, set: { value: value.trim() } });
    await Promise.all([
      upsert('evolution_url', url),
      upsert('evolution_api_key', apiKey),
      upsert('evolution_instance', instance),
    ]);
  } catch { /* ignora */ }
}

// ─── Evolution API request helper ────────────────────────────────────────────

async function evReq(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<unknown> {
  const { url, apiKey } = await getEvolutionConfig();
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Evolution API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ─── In-process state ─────────────────────────────────────────────────────────

const G = globalThis as Record<string, unknown>;
if (!G.__waEngine) {
  G.__waEngine = {
    state: { status: 'disconnected', message: 'Clique em Conectar WhatsApp', qr: null } as WaState,
    emitter: new EventEmitter(),
    pollTimer: null as ReturnType<typeof setInterval> | null,
  };
}
const engine = G.__waEngine as {
  state: WaState;
  emitter: EventEmitter;
  pollTimer: ReturnType<typeof setInterval> | null;
};

function setState(next: Partial<WaState>) {
  engine.state = { ...engine.state, ...next };
  engine.emitter.emit('state', engine.state);
}

export function getState(): WaState { return engine.state; }

export function onStateChange(cb: (s: WaState) => void): () => void {
  engine.emitter.on('state', cb);
  return () => engine.emitter.off('state', cb);
}

// ─── Instance + polling ───────────────────────────────────────────────────────

async function ensureInstance(): Promise<void> {
  const { instance } = await getEvolutionConfig();
  try {
    await evReq('GET', `/instance/fetchInstances?instanceName=${instance}`);
  } catch {
    await evReq('POST', '/instance/create', {
      instanceName: instance,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    });
  }
}

async function pollStatus() {
  try {
    const { instance } = await getEvolutionConfig();
    const data = await evReq('GET', `/instance/connectionState/${instance}`) as { instance?: { state?: string } };
    const state = data?.instance?.state ?? 'close';

    if (state === 'open') {
      setState({ status: 'ready', message: 'WhatsApp conectado!', qr: null });
      stopPolling();
      return;
    }

    // Busca QR
    const qrData = await evReq('GET', `/instance/connect/${instance}`) as {
      base64?: string; qrcode?: { base64?: string };
    };
    const b64 = qrData?.qrcode?.base64 ?? qrData?.base64 ?? null;
    if (b64) {
      const qr = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
      setState({ status: 'qr', message: 'Escaneie o QR Code com o WhatsApp', qr });
    } else {
      setState({ status: 'connecting', message: 'Aguardando QR Code…', qr: null });
    }
  } catch (err) {
    setState({ status: 'disconnected', message: `Erro: ${String(err)}`, qr: null });
    stopPolling();
  }
}

function startPolling() {
  if (engine.pollTimer) return;
  engine.pollTimer = setInterval(pollStatus, 4000);
}

function stopPolling() {
  if (engine.pollTimer) { clearInterval(engine.pollTimer); engine.pollTimer = null; }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function connect(): Promise<void> {
  if (engine.state.status === 'connecting' || engine.state.status === 'qr') return;
  setState({ status: 'connecting', message: 'Iniciando conexão…', qr: null });
  try {
    await ensureInstance();
    await pollStatus();
    startPolling();
  } catch (err) {
    setState({ status: 'disconnected', message: `Erro: ${String(err)}`, qr: null });
  }
}

export async function disconnect(): Promise<void> {
  stopPolling();
  try {
    const { instance } = await getEvolutionConfig();
    await evReq('DELETE', `/instance/logout/${instance}`);
  } catch { /* ignora */ }
  setState({ status: 'disconnected', message: 'Desconectado', qr: null });
}

export async function sendMessage(
  to: string, text: string,
  media?: { dataUrl: string; type: string; name: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { instance } = await getEvolutionConfig();
    const number = to.replace(/\D/g, '');
    if (media?.dataUrl) {
      const base64 = media.dataUrl.replace(/^data:[^;]+;base64,/, '');
      const mediaType = media.type.startsWith('image/') ? 'image' : media.type.startsWith('video/') ? 'video' : 'document';
      await evReq('POST', `/message/sendMedia/${instance}`, {
        number, mediatype: mediaType, media: base64, fileName: media.name, caption: text,
      });
    } else {
      await evReq('POST', `/message/sendText/${instance}`, { number, text });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function getGroups(): Promise<{ id: string; name: string; participantsCount: number }[]> {
  try {
    const { instance } = await getEvolutionConfig();
    const data = await evReq('GET', `/group/fetchAllGroups/${instance}?getParticipants=false`) as Array<{ id: string; subject: string; size: number }>;
    return (Array.isArray(data) ? data : []).map(g => ({ id: g.id, name: g.subject, participantsCount: g.size ?? 0 }));
  } catch { return []; }
}

export async function postStatus(text: string, media?: { dataUrl: string; type: string; name: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    const { instance } = await getEvolutionConfig();
    if (media?.dataUrl) {
      const base64 = media.dataUrl.replace(/^data:[^;]+;base64,/, '');
      await evReq('POST', `/message/sendStatus/${instance}`, { type: 'image', content: base64, caption: text, statusJidList: ['status@broadcast'] });
    } else {
      await evReq('POST', `/message/sendStatus/${instance}`, { type: 'text', content: text, statusJidList: ['status@broadcast'] });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
