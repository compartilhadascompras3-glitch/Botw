/**
 * wa-engine.ts — Evolution API client.
 *
 * Conecta ao seu servidor Evolution API (self-hosted no Railway/Render/VPS)
 * e expõe a mesma interface que o resto do app usa.
 *
 * Variáveis de ambiente usadas (salvas via SettingsPanel no banco):
 *   EVOLUTION_API_URL  — ex: https://evolution.meudominio.com
 *   EVOLUTION_API_KEY  — Global API key ou Instance API key
 *   EVOLUTION_INSTANCE — nome da instância (padrão: "whatsapp-bot")
 */

import { db } from '@/db';
import { settings } from '@/db/schemas/settings';
import { eq } from 'drizzle-orm';
import { EventEmitter } from 'node:events';

export type WaStatus = 'disconnected' | 'qr' | 'connecting' | 'ready' | 'auth_failure';

export interface WaState {
  status: WaStatus;
  message: string;
  qr: string | null; // data:image/png;base64,...
}

// ─── Settings helpers ────────────────────────────────────────────────────────

async function getSetting(key: string, fallback = ''): Promise<string> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
    return row?.value?.trim() || fallback;
  } catch { return fallback; }
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value: value.trim() })
    .onConflictDoUpdate({ target: settings.key, set: { value: value.trim() } });
}

export async function getEvolutionConfig() {
  const [url, apiKey, instance] = await Promise.all([
    getSetting('evolution_url', process.env.EVOLUTION_API_URL ?? ''),
    getSetting('evolution_api_key', process.env.EVOLUTION_API_KEY ?? ''),
    getSetting('evolution_instance', process.env.EVOLUTION_INSTANCE ?? 'whatsapp-bot'),
  ]);
  return { url: url.replace(/\/$/, ''), apiKey, instance };
}

export async function setEvolutionConfig(url: string, apiKey: string, instance: string) {
  await Promise.all([
    setSetting('evolution_url', url),
    setSetting('evolution_api_key', apiKey),
    setSetting('evolution_instance', instance),
  ]);
}

// ─── Evolution API request helper ────────────────────────────────────────────

async function evReq(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown
): Promise<unknown> {
  const { url, apiKey } = await getEvolutionConfig();
  if (!url) throw new Error('URL da Evolution API não configurada');

  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Evolution API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ─── In-process state (per-worker cache) ─────────────────────────────────────

const G = globalThis as Record<string, unknown>;
if (!G.__waEngine) {
  G.__waEngine = {
    state: {
      status: 'disconnected' as WaStatus,
      message: 'Clique em Conectar WhatsApp',
      qr: null,
    } as WaState,
    emitter: new EventEmitter(),
    pollTimer: null as ReturnType<typeof setTimeout> | null,
  };
}
const engine = G.__waEngine as {
  state: WaState;
  emitter: EventEmitter;
  pollTimer: ReturnType<typeof setTimeout> | null;
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

// ─── Instance management ──────────────────────────────────────────────────────

async function ensureInstance(): Promise<void> {
  const { instance } = await getEvolutionConfig();
  try {
    // Tenta buscar a instância — se não existir, cria
    await evReq('GET', `/instance/fetchInstances?instanceName=${instance}`);
  } catch {
    // Cria nova instância
    await evReq('POST', '/instance/create', {
      instanceName: instance,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    });
  }
}

async function getConnectionState(): Promise<{ state: string }> {
  const { instance } = await getEvolutionConfig();
  const data = await evReq('GET', `/instance/connectionState/${instance}`) as { instance?: { state?: string } };
  return { state: data?.instance?.state ?? 'close' };
}

async function fetchQR(): Promise<string | null> {
  const { instance } = await getEvolutionConfig();
  try {
    const data = await evReq('GET', `/instance/connect/${instance}`) as {
      base64?: string;
      qrcode?: { base64?: string };
      code?: string;
    };
    // Evolution API v2 retorna qrcode.base64 ou base64 diretamente
    const b64 = data?.qrcode?.base64 ?? data?.base64 ?? null;
    if (!b64) return null;
    if (b64.startsWith('data:')) return b64;
    return `data:image/png;base64,${b64}`;
  } catch {
    return null;
  }
}

// ─── Polling loop ─────────────────────────────────────────────────────────────

async function pollStatus() {
  try {
    const { state } = await getConnectionState();
    if (state === 'open') {
      setState({ status: 'ready', message: 'WhatsApp conectado!', qr: null });
      stopPolling();
      return;
    }
    // ainda conectando — tenta pegar o QR
    const qr = await fetchQR();
    if (qr) {
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
  if (engine.pollTimer) {
    clearInterval(engine.pollTimer);
    engine.pollTimer = null;
  }
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
  to: string,
  text: string,
  media?: { dataUrl: string; type: string; name: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { instance } = await getEvolutionConfig();
    const number = to.replace(/\D/g, '');

    if (media?.dataUrl) {
      const base64 = media.dataUrl.replace(/^data:[^;]+;base64,/, '');
      const isImage = media.type.startsWith('image/');
      const isVideo = media.type.startsWith('video/');
      const mediaType = isImage ? 'image' : isVideo ? 'video' : 'document';
      await evReq('POST', `/message/sendMedia/${instance}`, {
        number,
        mediatype: mediaType,
        media: base64,
        fileName: media.name,
        caption: text,
      });
    } else {
      await evReq('POST', `/message/sendText/${instance}`, {
        number,
        text,
      });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function getGroups(): Promise<{ id: string; name: string; participantsCount: number }[]> {
  try {
    const { instance } = await getEvolutionConfig();
    const data = await evReq('GET', `/group/fetchAllGroups/${instance}?getParticipants=false`) as Array<{
      id: string; subject: string; size: number;
    }>;
    return (Array.isArray(data) ? data : []).map(g => ({
      id: g.id,
      name: g.subject,
      participantsCount: g.size ?? 0,
    }));
  } catch { return []; }
}

export async function postStatus(
  text: string,
  media?: { dataUrl: string; type: string; name: string }
): Promise<{ ok: boolean; error?: string }> {
  // Status broadcast via texto ou imagem
  try {
    const { instance } = await getEvolutionConfig();
    if (media?.dataUrl) {
      const base64 = media.dataUrl.replace(/^data:[^;]+;base64,/, '');
      await evReq('POST', `/message/sendStatus/${instance}`, {
        type: 'image',
        content: base64,
        caption: text,
        statusJidList: ['status@broadcast'],
      });
    } else {
      await evReq('POST', `/message/sendStatus/${instance}`, {
        type: 'text',
        content: text,
        statusJidList: ['status@broadcast'],
      });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
