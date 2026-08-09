/**
 * wa-engine.ts — Evolution API client, stateless.
 * Funciona em Cloudflare Workers (sem setInterval, sem globalThis state).
 * O frontend faz polling de /api/wa/status a cada 3s.
 */

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
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Evolution API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Stateless helpers (sem estado em memória) ────────────────────────────────

// Garante que a instância existe
async function ensureInstance(instance: string): Promise<void> {
  try {
    const list = await evReq('GET', `/instance/fetchInstances?instanceName=${instance}`) as unknown[];
    if (Array.isArray(list) && list.length > 0) return; // já existe
  } catch { /* ignora, tenta criar */ }
  await evReq('POST', '/instance/create', {
    instanceName: instance,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
  });
}

// ─── Stub de EventEmitter para compatibilidade (não usado no CF Workers) ─────

class NoopEmitter {
  on() { return this; }
  off() { return this; }
  emit() { return false; }
}

const _emitter = new NoopEmitter();
export function onStateChange(_cb: (s: WaState) => void): () => void {
  return () => {};
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * getState — busca o estado atual diretamente da Evolution API.
 * Deve ser chamado pelo endpoint /api/wa/status a cada poll do frontend.
 */
export async function getState(): Promise<WaState> {
  try {
    const { instance } = await getEvolutionConfig();

    // Verifica estado de conexão
    const connData = await evReq('GET', `/instance/connectionState/${instance}`) as {
      instance?: { state?: string };
    };
    const connState = connData?.instance?.state ?? 'close';

    // Se conectado, retorna imediatamente — não chama /connect nem gera QR
    if (connState === 'open') {
      return { status: 'ready', message: 'WhatsApp conectado!', qr: null };
    }

    // Só busca QR se explicitamente desconectado ou conectando
    if (connState === 'close' || connState === 'connecting') {
      let qrData: { base64?: string; qrcode?: { base64?: string } } | null = null;
      try {
        qrData = await evReq('GET', `/instance/connect/${instance}`) as {
          base64?: string;
          qrcode?: { base64?: string };
        };
      } catch {
        // ignora erro ao buscar QR
      }

      const b64 = qrData?.base64 ?? qrData?.qrcode?.base64 ?? null;

      if (b64) {
        const qr = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
        return { status: 'qr', message: 'Escaneie o QR Code com o WhatsApp', qr };
      }

      // Sem QR disponível — pode ser que a sessão foi invalidada (device_removed).
      // Retorna disconnected para o usuário poder reconectar.
      return { status: 'disconnected', message: 'Sessão encerrada. Clique em Conectar para gerar um novo QR Code.', qr: null };
    }

    return { status: 'disconnected', message: 'Desconectado', qr: null };
  } catch (err) {
    return { status: 'disconnected', message: `Erro: ${String(err).slice(0, 100)}`, qr: null };
  }
}

/**
 * connect — garante que a instância existe e reseta sessão inválida.
 * Se já existe mas está em estado inválido (device_removed etc), faz logout primeiro.
 * O frontend pollerá /api/wa/status para obter o QR.
 */
export async function connect(): Promise<void> {
  const { instance } = await getEvolutionConfig();

  // Verifica se a instância já existe
  let exists = false;
  let currentState = 'close';
  try {
    const list = await evReq('GET', `/instance/fetchInstances?instanceName=${instance}`) as Array<{
      name?: string; connectionStatus?: string;
    }>;
    if (Array.isArray(list) && list.length > 0) {
      exists = true;
      currentState = list[0]?.connectionStatus ?? 'close';
    }
  } catch { /* ignora */ }

  if (!exists) {
    // Cria instância nova
    await evReq('POST', '/instance/create', {
      instanceName: instance,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    });
    return;
  }

  // Se está open, não faz nada
  if (currentState === 'open') return;

  // Se está em estado inválido (connecting sem QR), faz logout para resetar
  // Isso força a Evolution API a gerar um novo QR na próxima chamada de /connect
  try {
    await evReq('DELETE', `/instance/logout/${instance}`);
  } catch { /* ignora erro de logout — instância pode não ter sessão */ }
}

export async function disconnect(): Promise<void> {
  try {
    const { instance } = await getEvolutionConfig();
    await evReq('DELETE', `/instance/logout/${instance}`);
  } catch { /* ignora */ }
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
      const mediaType = media.type.startsWith('image/') ? 'image'
        : media.type.startsWith('video/') ? 'video' : 'document';
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
    const data = await evReq('GET', `/group/fetchAllGroups/${instance}?getParticipants=false`) as Array<{
      id: string; subject: string; size: number;
    }>;
    return (Array.isArray(data) ? data : []).map(g => ({
      id: g.id, name: g.subject, participantsCount: g.size ?? 0,
    }));
  } catch { return []; }
}

export async function postStatus(
  text: string,
  media?: { dataUrl: string; type: string; name: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { instance } = await getEvolutionConfig();
    if (media?.dataUrl) {
      const base64 = media.dataUrl.replace(/^data:[^;]+;base64,/, '');
      await evReq('POST', `/message/sendStatus/${instance}`, {
        type: 'image', content: base64, caption: text, statusJidList: ['status@broadcast'],
      });
    } else {
      await evReq('POST', `/message/sendStatus/${instance}`, {
        type: 'text', content: text, statusJidList: ['status@broadcast'],
      });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
