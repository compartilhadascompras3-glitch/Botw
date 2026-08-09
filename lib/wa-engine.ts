/**
 * wa-engine.ts — Baileys WhatsApp engine running in-process inside Next.js.
 * Compatível com Railway (Node.js persistente) e HappySeeds preview.
 */
import { EventEmitter } from 'node:events';

export type WaStatus = 'disconnected' | 'qr' | 'connecting' | 'ready' | 'auth_failure';

export interface WaState {
  status: WaStatus;
  message: string;
  qr: string | null;
}

interface EngineGlobal {
  state: WaState;
  emitter: EventEmitter;
  sock: unknown | null;
  stopping: boolean;
}

const G = (globalThis as Record<string, unknown>);
if (!G.__waEngine) {
  G.__waEngine = {
    state: { status: 'disconnected', message: 'Clique em Conectar WhatsApp', qr: null },
    emitter: new EventEmitter(),
    sock: null,
    stopping: false,
  } satisfies EngineGlobal;
}
const engine = G.__waEngine as EngineGlobal;

export function getState(): WaState { return engine.state; }

export function onStateChange(cb: (s: WaState) => void): () => void {
  engine.emitter.on('state', cb);
  return () => engine.emitter.off('state', cb);
}

function setState(next: Partial<WaState>) {
  engine.state = { ...engine.state, ...next };
  engine.emitter.emit('state', engine.state);
}

export async function connect(): Promise<void> {
  if (engine.state.status === 'ready' || engine.state.status === 'connecting') return;
  setState({ status: 'connecting', message: 'Iniciando conexão…', qr: null });

  try {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      makeCacheableSignalKeyStore,
      Browsers,
    } = await import('@whiskeysockets/baileys');
    const QRCode = await import('qrcode');
    const path = await import('node:path');
    const authDir = path.join(process.cwd(), '.wa-auth');

    const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, undefined as never),
      },
      browser: Browsers.macOS('Chrome'),
      printQRInTerminal: false,
      syncFullHistory: false,
    });

    engine.sock = sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const dataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 2 });
          setState({ status: 'qr', message: 'Escaneie o QR Code com o WhatsApp', qr: dataUrl });
        } catch {
          setState({ status: 'qr', message: 'Escaneie o QR Code', qr: null });
        }
      }

      if (connection === 'open') {
        setState({ status: 'ready', message: 'WhatsApp conectado!', qr: null });
      }

      if (connection === 'close') {
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        if (loggedOut) {
          setState({ status: 'auth_failure', message: 'Sessão encerrada. Reconecte.', qr: null });
          engine.sock = null;
        } else if (!engine.stopping) {
          setState({ status: 'connecting', message: 'Reconectando…', qr: null });
          setTimeout(() => connect(), 3000);
        } else {
          setState({ status: 'disconnected', message: 'Desconectado', qr: null });
          engine.sock = null;
        }
      }
    });
  } catch (err) {
    setState({ status: 'disconnected', message: `Erro: ${String(err)}`, qr: null });
    engine.sock = null;
  }
}

export async function disconnect(): Promise<void> {
  engine.stopping = true;
  try {
    const s = engine.sock as ({ logout?: () => Promise<void> } | null);
    await s?.logout?.();
  } catch { /* ignora */ }
  engine.sock = null;
  engine.stopping = false;
  setState({ status: 'disconnected', message: 'Desconectado', qr: null });
}

export async function sendMessage(
  to: string,
  text: string,
  media?: { dataUrl: string; type: string; name: string }
): Promise<{ ok: boolean; error?: string }> {
  const sock = engine.sock as ({
    sendMessage: (jid: string, content: unknown) => Promise<unknown>;
  } | null);
  if (!sock) return { ok: false, error: 'WhatsApp não conectado' };

  const jid = to.includes('@') ? to : `${to.replace(/\D/g, '')}@s.whatsapp.net`;

  try {
    if (media?.dataUrl) {
      const base64 = media.dataUrl.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      const isImage = media.type.startsWith('image/');
      const isVideo = media.type.startsWith('video/');
      if (isImage) {
        await sock.sendMessage(jid, { image: buffer, caption: text });
      } else if (isVideo) {
        await sock.sendMessage(jid, { video: buffer, caption: text });
      } else {
        await sock.sendMessage(jid, { document: buffer, mimetype: media.type, fileName: media.name, caption: text });
      }
    } else {
      await sock.sendMessage(jid, { text });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function getGroups(): Promise<{ id: string; name: string; participantsCount: number }[]> {
  const sock = engine.sock as ({
    groupFetchAllParticipating: () => Promise<Record<string, {
      id: string; subject: string; participants: unknown[]
    }>>;
  } | null);
  if (!sock) return [];
  try {
    const groups = await sock.groupFetchAllParticipating();
    return Object.values(groups).map((g) => ({
      id: g.id,
      name: g.subject,
      participantsCount: g.participants?.length ?? 0,
    }));
  } catch { return []; }
}

export async function postStatus(
  text: string,
  media?: { dataUrl: string; type: string; name: string }
): Promise<{ ok: boolean; error?: string }> {
  return sendMessage('status@broadcast', text, media);
}

// Stub para compatibilidade com SettingsPanel (não usado no Baileys direto)
export async function getEvolutionConfig() {
  return { url: '', apiKey: '', instance: 'whatsapp-bot' };
}
export async function setEvolutionConfig(_url: string, _key: string, _instance: string) {}
