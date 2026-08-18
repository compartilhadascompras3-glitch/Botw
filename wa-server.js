// WhatsApp Bot - Servidor de backend independente (porta 3001)
// Gerencia conexão WhatsApp Web via Baileys (WebSocket direto, sem Chrome/Puppeteer)
// Expõe API REST + SSE para o frontend Next.js consumir
//
// NOTA: este servidor usava whatsapp-web.js + Puppeteer antes. Migramos para
// Baileys porque o WhatsApp atualizou o WhatsApp Web para a versão 2.3000.x
// removendo o Webpack interno, o que quebrou o mecanismo de injeção de scripts
// do whatsapp-web.js (o evento "ready" nunca disparava após escanear o QR,
// ficando "carregando" para sempre). Baileys se conecta direto via protocolo
// WebSocket do WhatsApp, sem depender de um navegador Chrome, e por isso não
// é afetado por essa mudança.
//
// IMPORTANTE: usamos @whiskeysockets/baileys na versão 7.0.0-rc14 (release
// candidate), não a última estável (6.17.16). A versão 6.x tem um bug
// conhecido ("SessionError: No sessions") ao enviar mensagem para grupos em
// contas que já usam o novo identificador LID do WhatsApp — o que já é o
// padrão para a maioria das contas novas. Esse bug foi corrigido na série 7.x.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const qrcode = require('qrcode');
const pino = require('pino');

// ── Neon DB via HTTP sem pacote externo ───────────────────────────────────────
const DB_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '';

/** Executa uma query SQL no Neon via HTTP usando só fetch nativo do Node 18+ */
async function dbQuery(query, params = []) {
  if (!DB_URL) { console.error('[DB] DATABASE_URL não definida!'); return null; }
  try {
    // Extrai host e credenciais da connection string
    // postgresql://user:pass@host/dbname  →  https://host/dbname/sql  + Authorization header
    const u = new URL(DB_URL.replace(/^postgres(ql)?:\/\//, 'https://'));
    const auth = Buffer.from(`${u.username}:${u.password}`).toString('base64');
    const httpUrl = `https://${u.hostname}${u.pathname}/sql`;
    const res = await fetch(httpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
        'Neon-Connection-String': DB_URL,
      },
      body: JSON.stringify({ query, params }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error('[DB] HTTP error:', res.status, err.slice(0, 200));
      return null;
    }
    const data = await res.json();
    return data.rows ?? [];
  } catch (e) {
    console.error('[DB] fetch error:', e.message);
    return null;
  }
}
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');

const PORT = 3001;

// Sessão fora da pasta do Next.js para não confundir o Turbopack
const WA_SESSION_PATH = path.join(require('os').tmpdir(), 'wa-session-baileys');

// Estado global
let sock = null;
let currentQR = null;
let status = 'disconnected'; // disconnected | qr | connecting | ready | auth_failure
let statusMessage = 'Não conectado';
let sseClients = [];
let initInProgress = false;
let restartTimeout = null;
let restartDelay = 10000; // backoff: começa em 10s

const logger = pino({ level: process.env.WA_LOG_LEVEL || 'silent' });

// Cache de metadados de grupo (obrigatório para o Baileys conseguir montar a
// lista de participantes e criptografar mensagens ao enviar para grupos).
const groupMetadataCache = new Map();

/** Garante que o metadata do grupo esteja em cache antes de enviar uma mensagem. */
async function ensureGroupMetadata(client, jid) {
  if (!jid.endsWith('@g.us')) return;
  if (groupMetadataCache.has(jid)) return;
  try {
    const metadata = await client.groupMetadata(jid);
    groupMetadataCache.set(jid, metadata);
  } catch (err) {
    console.error(`[WA] Erro ao buscar metadata do grupo ${jid}:`, err.message);
  }
}

// ── SSE helpers ──────────────────────────────────────────────────────────────

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients = sseClients.filter((res) => {
    try { res.write(payload); return true; } catch { return false; }
  });
}

function sendStatus() {
  broadcast('status', { status, message: statusMessage, qr: currentQR });
}

/** Agenda reinicialização com backoff (evita loop infinito de crashes) */
function scheduleRestart(delaySecs) {
  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }
  const delay = delaySecs ? delaySecs * 1000 : restartDelay;
  restartDelay = Math.min(restartDelay * 1.5, 60000); // max 60s
  console.log(`[WA] Reiniciando em ${Math.round(delay / 1000)}s...`);
  restartTimeout = setTimeout(() => {
    restartTimeout = null;
    initClient();
  }, delay);
}

async function initClient() {
  if (initInProgress) {
    console.log('[WA] initClient ignorado — já em progresso');
    return;
  }
  initInProgress = true;
  restartDelay = 10000; // reset backoff a cada init manual

  console.log('[WA] Iniciando cliente...');

  // Destrói socket anterior de forma segura
  const oldSock = sock;
  sock = null;
  if (oldSock) {
    try { oldSock.end(undefined); } catch {}
  }

  currentQR = null;
  status = 'connecting';
  statusMessage = 'Iniciando...';
  sendStatus();

  try {
    fs.mkdirSync(WA_SESSION_PATH, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(WA_SESSION_PATH);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

    const client = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      browser: ['WhatsApp Bot', 'Chrome', '146.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      // Cache de metadados de grupo: necessário para o Baileys conseguir
      // criptografar mensagens para todos os participantes de um grupo sem
      // dar erro "SessionError: No sessions" no primeiro envio.
      cachedGroupMetadata: async (jid) => groupMetadataCache.get(jid),
    });

    sock = client;
    initInProgress = false;

    client.ev.on('creds.update', saveCreds);

    // Mantém o cache de metadados de grupo atualizado
    client.ev.on('groups.update', async ([update]) => {
      if (!update?.id) return;
      try {
        const metadata = await client.groupMetadata(update.id);
        groupMetadataCache.set(update.id, metadata);
      } catch {}
    });
    client.ev.on('group-participants.update', async (update) => {
      if (!update?.id) return;
      try {
        const metadata = await client.groupMetadata(update.id);
        groupMetadataCache.set(update.id, metadata);
      } catch {}
    });

    client.ev.on('connection.update', async (update) => {
      if (sock !== client) return; // instância obsoleta

      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          currentQR = await qrcode.toDataURL(qr);
          status = 'qr';
          statusMessage = 'Escaneie o QR Code com o seu WhatsApp';
          sendStatus();
          console.log('[WA] QR gerado');
        } catch (err) {
          console.error('[WA] Erro ao gerar QR:', err.message);
        }
      }

      if (connection === 'connecting') {
        if (status !== 'ready') {
          status = 'connecting';
          statusMessage = 'Conectando ao WhatsApp...';
          sendStatus();
        }
      }

      if (connection === 'open') {
        currentQR = null;
        status = 'ready';
        statusMessage = 'WhatsApp conectado!';
        restartDelay = 10000; // reset backoff após conexão bem-sucedida
        sendStatus();
        console.log('[WA] Pronto para enviar mensagens');
      }

      if (connection === 'close') {
        const errCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = errCode === DisconnectReason.loggedOut;

        if (sock !== client) return;

        currentQR = null;
        sock = null;

        if (isLoggedOut) {
          status = 'auth_failure';
          statusMessage = 'Sessão encerrada — escaneie o QR novamente';
          console.error('[WA] Sessão deslogada, limpando credenciais...');
          try { fs.rmSync(WA_SESSION_PATH, { recursive: true, force: true }); } catch {}
          sendStatus();
          scheduleRestart(3);
        } else {
          status = 'disconnected';
          statusMessage = 'Desconectado, reconectando...';
          console.log('[WA] Desconectado:', lastDisconnect?.error?.message || 'motivo desconhecido');
          sendStatus();
          scheduleRestart(5);
        }
      }
    });
  } catch (err) {
    initInProgress = false;
    if (sock && sock !== null) return;
    const msg = err?.message || String(err);
    console.error('[WA] Erro ao inicializar:', msg);
    status = 'disconnected';
    statusMessage = 'Aguardando reconexão...';
    sendStatus();
    sock = null;
    scheduleRestart();
  }
}

/** Converte um número/JID amigável para o formato de JID do Baileys (WhatsApp) */
function toJid(to) {
  if (to.includes('@')) return to;
  return `${to.replace(/\D/g, '')}@s.whatsapp.net`;
}

/** Extrai o buffer de base64 a partir de uma data URL completa ou base64 puro */
function base64FromDataUrl(dataUrl) {
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
}

/** Monta o payload de mídia esperado pelo sock.sendMessage do Baileys */
function buildMediaMessage(mediaType, base64, filename, caption) {
  const buffer = Buffer.from(base64, 'base64');
  const isImage = mediaType.startsWith('image/');
  const isVideo = mediaType.startsWith('video/');
  const isAudio = mediaType.startsWith('audio/');

  if (isImage) return { image: buffer, caption: caption || undefined, mimetype: mediaType };
  if (isVideo) return { video: buffer, caption: caption || undefined, mimetype: mediaType };
  if (isAudio) return { audio: buffer, mimetype: mediaType, ptt: false };
  return {
    document: buffer,
    mimetype: mediaType,
    fileName: filename || 'arquivo',
    caption: caption || undefined,
  };
}

// ── Scheduler server-side ─────────────────────────────────────────────────────
// Roda no processo Node.js — funciona mesmo com browser/aba fechados.
//
// IMPORTANTE: quando o dashboard Next.js está publicado na Vercel (ou outro
// host) e o wa-server roda no seu PC, "localhost:13000" NÃO existe no seu PC
// — é preciso apontar para a URL pública do dashboard. Configure a variável
// de ambiente NEXT_PUBLIC_APP_URL (ou NEXT_API_URL) no seu PC antes de rodar
// `pnpm wa-server`, por exemplo:
//   $env:NEXT_API_URL = "https://seu-projeto.vercel.app"
//   pnpm wa-server
// Se não for definida, assume localhost:13000 (uso local / preview, onde
// Next.js e wa-server rodam juntos no mesmo ambiente).
const NEXT_API = (() => {
  // Ignora URLs do Vercel — app está publicado no HappySeeds
  const candidates = [
    process.env.NEXT_API_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ].filter(u => u && !u.includes('vercel.app'));
  return (candidates[0] || 'https://app-0701c13d2e.happyseeds.space').replace(/\/$/, '');
})();
console.log(`[Scheduler] NEXT_API = ${NEXT_API}`);

/** Busca mensagens do banco diretamente via Neon HTTP (fallback: Next.js API) */
async function fetchMessages() {
  // Busca mensagens via Next.js API (banco HappySeeds)
  try {
    const res = await fetch(`${NEXT_API}/api/messages`, {
      headers: { 'User-Agent': 'wa-server/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) { console.error(`[Scheduler] fetchMessages HTTP ${res.status}`); return []; }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('[Scheduler] fetchMessages error:', e.message);
    return [];
  }
}

/** Busca a media_data_url de uma mensagem específica (só quando for enviar) */
async function fetchMessageMedia(id) {
  const rows = await dbQuery('SELECT media_data_url FROM messages WHERE id = $1', [id]);
  if (rows && rows[0]) return rows[0].media_data_url ?? null;
  // Fallback: API (retorna camelCase: mediaDataUrl)
  try {
    const res = await fetch(`${NEXT_API}/api/messages?id=${encodeURIComponent(id)}`, {
      headers: { 'User-Agent': 'wa-server/1.0', 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    // A API Next.js retorna camelCase (mediaDataUrl), não snake_case
    return data?.mediaDataUrl ?? data?.media_data_url ?? null;
  } catch { return null; }
}

/** Deleta uma mensagem do banco — tenta direto no Neon, fallback: Next.js API */
async function deleteMessage(id) {
  // Tenta direto no banco primeiro
  const rows = await dbQuery('DELETE FROM messages WHERE id = $1', [id]);
  if (rows !== null) {
    console.log(`[Scheduler] Mensagem ${id} deletada (DB direto)`);
    return true;
  }
  // Fallback: Next.js API
  try {
    const res = await fetch(`${NEXT_API}/api/messages?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[Scheduler] deleteMessage ${id} respondeu ${res.status}: ${body.slice(0,120)}`);
      return false;
    }
    console.log(`[Scheduler] Mensagem ${id} deletada (API)`);
    return true;
  } catch (e) {
    console.error('[Scheduler] deleteMessage error:', e.message);
    return false;
  }
}

/** Adiciona entrada no histórico via Next.js API */
async function addHistory(entry) {
  try {
    await fetch(`${NEXT_API}/api/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch (e) {
    console.error('[Scheduler] addHistory error:', e.message);
  }
}

function calcJitteredMs(baseMinutes, jitterPercent) {
  if (jitterPercent === 0) return baseMinutes * 60 * 1000;
  const base = baseMinutes * 60 * 1000;
  const range = base * (jitterPercent / 100);
  return Math.round(base + (Math.random() * 2 - 1) * range);
}

function isInScheduleWindow(start, end) {
  const now = new Date();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  if (s <= e) return cur >= s && cur < e;
  return cur >= s || cur < e;
}

// Estado do scheduler
const scheduler = {
  running: false,
  intervalMinutes: 30,
  jitterPercent: 20,
  scheduleEnabled: false,
  scheduleStart: '08:00',
  scheduleEnd: '22:00',
  statusEnabled: false,
  groupsEnabled: true,
  targets: [],          // [{ id, name }]
  currentIndex: 0,
  nextFireAt: null,     // timestamp ms
  _timer: null,
  _firing: false,
};

async function schedulerFire() {
  if (scheduler._firing) return;
  scheduler._firing = true;

  try {
    const msgs = await fetchMessages();
    if (msgs.length === 0) {
      console.log('[Scheduler] Nenhuma mensagem na fila');
      scheduleNext();
      return;
    }

    const idx = Math.min(scheduler.currentIndex, msgs.length - 1);
    const msg = msgs[idx];

    if (!sock || status !== 'ready') {
      console.log('[Scheduler] WA não pronto — adiando 60s');
      scheduler.nextFireAt = Date.now() + 60_000;
      broadcast('scheduler', getSchedulerState());
      scheduler._firing = false;
      return;
    }

    if (scheduler.scheduleEnabled && !isInScheduleWindow(scheduler.scheduleStart, scheduler.scheduleEnd)) {
      console.log('[Scheduler] Fora do horário — adiando 60s');
      scheduler.nextFireAt = Date.now() + 60_000;
      broadcast('scheduler', getSchedulerState());
      scheduler._firing = false;
      return;
    }

    // Normaliza campos snake_case (vindos do Neon direto) para camelCase
    const msgId       = msg.id;
    const msgText     = msg.text ?? '';
    const msgMediaUrl = msg.mediaDataUrl ?? msg.media_data_url ?? null;
    const msgHasMedia = !!(msg.has_media || msg.hasMedia || msgMediaUrl || (msgMediaName && msgMediaName.startsWith('http')));
    const msgMediaType = msg.mediaType ?? msg.media_type ?? 'application/octet-stream';
    const msgMediaName = msg.mediaName ?? msg.media_name ?? 'file';
    const msgSendOnce  = msg.sendOnce  ?? msg.send_once  ?? false;

    const media = msgHasMedia ? {
      _lazy: !msgMediaUrl,
      id: msgId,
      dataUrl: msgMediaUrl,
      type: msgMediaType,
      name: msgMediaName,
    } : null;

    const shouldSendGroups = scheduler.groupsEnabled && scheduler.targets.length > 0;
    const shouldPostStatus = scheduler.statusEnabled;

    let anyOk = false;
    let errMsg = null;

    // Resolve lazy media (busca imagem só agora, na hora de enviar)
    if (media?._lazy) {
      console.log(`[Scheduler] Buscando imagem da mensagem ${media.id}...`);

      // Se mediaName é uma URL, baixa a imagem diretamente
      if (media.name && media.name.startsWith('http')) {
        try {
          const imgRes = await fetch(media.name, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            const ct = imgRes.headers.get('content-type') || 'image/jpeg';
            media.dataUrl = `data:${ct};base64,${buf.toString('base64')}`;
            console.log(`[Scheduler] Imagem baixada da URL: ${Math.round(buf.length/1024)}KB`);
          }
        } catch (e) { console.warn('[Scheduler] Falha ao baixar imagem da URL:', e.message); }
      }

      // Fallback: busca base64 da API
      if (!media.dataUrl) {
        media.dataUrl = await fetchMessageMedia(media.id);
      }

      media._lazy = false;
      if (!media.dataUrl) {
        console.warn(`[Scheduler] Imagem não encontrada para mensagem ${media.id} — enviando sem imagem`);
      }
    }

    console.log(`[Scheduler] Enviando msg ${msgId} | hasMedia=${msgHasMedia} | dataUrl=${media?.dataUrl ? 'OK('+Math.round((media.dataUrl.length)/1024)+'KB)' : 'null'} | type=${msgMediaType}`);

    // Envia para grupos
    if (shouldSendGroups) {
      for (const target of scheduler.targets) {
        try {
          const jid = toJid(target.id);
          await ensureGroupMetadata(sock, jid);
          if (media?.dataUrl) {
            const base64 = base64FromDataUrl(media.dataUrl);
            await sock.sendMessage(jid, buildMediaMessage(media.type, base64, media.name, msgText));
          } else {
            await sock.sendMessage(jid, { text: msgText });
          }
          anyOk = true;
          console.log(`[Scheduler] Enviado para ${jid}`);
        } catch (e) {
          errMsg = e.message;
          console.error(`[Scheduler] Erro ao enviar para ${target.id}:`, e.message);
        }
      }
    }

    // Posta no Status
    if (shouldPostStatus) {
      try {
        if (media?.dataUrl) {
          const base64 = base64FromDataUrl(media.dataUrl);
          await sock.sendMessage('status@broadcast', buildMediaMessage(media.type, base64, media.name, msgText));
        } else {
          await sock.sendMessage('status@broadcast', { text: msgText || '' });
        }
        anyOk = true;
        console.log('[Scheduler] Status postado');
      } catch (e) {
        console.error('[Scheduler] Erro ao postar status:', e.message);
      }
    }

    if (anyOk || (!shouldSendGroups && !shouldPostStatus)) {
      // Registra no histórico
      await addHistory({
        id: `hist_${Date.now()}`,
        messageId: msgId,
        messageText: msgText,
        hasMedia: msgHasMedia,
        targets: shouldSendGroups ? scheduler.targets : [],
        sentAt: Date.now(),
      });

      // Remove se sendOnce, senão avança índice
      if (msgSendOnce) {
        // Tenta deletar até 3 vezes para garantir que não reenvia
        let deleted = false;
        for (let attempt = 0; attempt < 3 && !deleted; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 500));
          deleted = await deleteMessage(msgId);
        }
        if (!deleted) {
          console.error(`[Scheduler] AVISO: não conseguiu deletar mensagem sendOnce ${msgId} — pode reenviar no próximo ciclo`);
        }
        const newMsgs = await fetchMessages();
        scheduler.currentIndex = Math.min(scheduler.currentIndex, Math.max(0, newMsgs.length - 1));
      } else {
        const newMsgs = await fetchMessages();
        if (newMsgs.length > 0) {
          scheduler.currentIndex = (scheduler.currentIndex + 1) % newMsgs.length;
        }
      }
    } else {
      console.error('[Scheduler] Falha ao enviar:', errMsg);
    }
  } catch (e) {
    console.error('[Scheduler] Erro inesperado:', e.message);
  } finally {
    scheduler._firing = false;
    scheduleNext();
    broadcast('scheduler', getSchedulerState());
  }
}

function scheduleNext() {
  if (scheduler._timer) { clearTimeout(scheduler._timer); scheduler._timer = null; }
  if (!scheduler.running) return;
  const ms = calcJitteredMs(scheduler.intervalMinutes, scheduler.jitterPercent);
  scheduler.nextFireAt = Date.now() + ms;
  broadcast('scheduler', getSchedulerState());
  console.log(`[Scheduler] Próximo disparo em ${Math.round(ms / 1000)}s`);
  scheduler._timer = setTimeout(() => { schedulerFire(); }, ms);
}

function schedulerStart(config) {
  if (config) applySchedulerConfig(config);
  if (scheduler.running) { scheduleNext(); return; } // reinicia timer com nova config
  scheduler.running = true;
  scheduleNext();
  console.log('[Scheduler] Iniciado');
}

function schedulerStop() {
  scheduler.running = false;
  scheduler.nextFireAt = null;
  if (scheduler._timer) { clearTimeout(scheduler._timer); scheduler._timer = null; }
  broadcast('scheduler', getSchedulerState());
  console.log('[Scheduler] Parado');
}

function applySchedulerConfig(cfg) {
  if (cfg.intervalMinutes !== undefined) scheduler.intervalMinutes = cfg.intervalMinutes;
  if (cfg.jitterPercent   !== undefined) scheduler.jitterPercent   = cfg.jitterPercent;
  if (cfg.scheduleEnabled !== undefined) scheduler.scheduleEnabled = cfg.scheduleEnabled;
  if (cfg.scheduleStart   !== undefined) scheduler.scheduleStart   = cfg.scheduleStart;
  if (cfg.scheduleEnd     !== undefined) scheduler.scheduleEnd     = cfg.scheduleEnd;
  if (cfg.statusEnabled   !== undefined) scheduler.statusEnabled   = cfg.statusEnabled;
  if (cfg.groupsEnabled   !== undefined) scheduler.groupsEnabled   = cfg.groupsEnabled;
  if (cfg.targets         !== undefined) scheduler.targets         = cfg.targets;
  if (cfg.currentIndex    !== undefined) scheduler.currentIndex    = cfg.currentIndex;
}

function getSchedulerState() {
  return {
    running:         scheduler.running,
    intervalMinutes: scheduler.intervalMinutes,
    jitterPercent:   scheduler.jitterPercent,
    scheduleEnabled: scheduler.scheduleEnabled,
    scheduleStart:   scheduler.scheduleStart,
    scheduleEnd:     scheduler.scheduleEnd,
    statusEnabled:   scheduler.statusEnabled,
    groupsEnabled:   scheduler.groupsEnabled,
    targets:         scheduler.targets,
    currentIndex:    scheduler.currentIndex,
    nextFireAt:      scheduler.nextFireAt,
  };
}

// ── ML Link Server (meli.la) integrado ────────────────────────────────────────
// Gera links curtos meli.la via Playwright. Rotas: /ml/shorten e /ml/status

const ML_COOKIES_FILE = path.join(__dirname, 'ml-cookies.json');
const mlLinkCache = new Map();
const mlJobs = new Map(); // jobId → { status, shortLink?, error?, productUrl, createdAt }
const ML_CACHE_TTL = 24 * 60 * 60 * 1000;
let mlBrowser = null;
let mlContext = null;

async function mlGetPlaywright() {
  try { return require('playwright'); } catch { return null; }
}

async function mlEnsureBrowser() {
  if (mlBrowser && mlContext) return true;
  const pw = await mlGetPlaywright();
  if (!pw) { console.warn('[ML] Playwright não instalado — /ml/shorten indisponível'); return false; }
  try {
    mlBrowser = await pw.chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    mlContext = await mlBrowser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'pt-BR',
      viewport: { width: 1280, height: 800 },
    });
    if (fs.existsSync(ML_COOKIES_FILE)) {
      const cookies = JSON.parse(fs.readFileSync(ML_COOKIES_FILE, 'utf8'));
      await mlContext.addCookies(cookies);
      console.log('[ML] Cookies carregados de', ML_COOKIES_FILE);
    } else {
      console.warn('[ML] Nenhum cookie salvo — rode: node ml-link-server.js --login');
    }
    return true;
  } catch (e) {
    console.error('[ML] Erro ao iniciar browser:', e.message);
    return false;
  }
}

async function mlGenerateLink(productUrl) {
  const cached = mlLinkCache.get(productUrl);
  if (cached && Date.now() < cached.expiresAt) return cached.shortLink;

  // ── Tenta a API REST do ML Afiliados (sem Playwright) ──────────────────────
  // Lê matt_word e matt_tool salvos no banco via NEXT_API
  let mattWord = 'eclash62';
  let mattTool = '51647683';
  try {
    const nextApi = process.env.NEXT_API_URL || process.env.NEXT_API || 'http://localhost:13000';
    const settingsRes = await fetch(`${nextApi}/api/settings`, { signal: AbortSignal.timeout(5000) });
    if (settingsRes.ok) {
      const s = await settingsRes.json();
      if (s.mattWord) mattWord = s.mattWord;
      if (s.mattTool) mattTool = s.mattTool;
    }
  } catch { /* usa defaults */ }

  // Garante que a URL de produto já tem os parâmetros de rastreamento
  let trackedUrl = productUrl;
  try {
    const u = new URL(productUrl);
    if (!u.searchParams.has('matt_word')) u.searchParams.set('matt_word', mattWord);
    if (!u.searchParams.has('matt_tool')) u.searchParams.set('matt_tool', mattTool);
    trackedUrl = u.toString();
  } catch { /* usa URL original */ }

  // Chama a API de encurtamento do ML afiliados
  try {
    const apiUrl = `https://api.mercadolibre.com/link-shortener/shorten`;
    const body = JSON.stringify({ url: trackedUrl });
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Origin': 'https://www.mercadolivre.com.br',
      'Referer': 'https://www.mercadolivre.com.br/',
    };
    // Carrega cookies de sessão para autenticar
    const cookieHeader = fs.existsSync(ML_COOKIES_FILE)
      ? JSON.parse(fs.readFileSync(ML_COOKIES_FILE, 'utf8'))
          .filter(c => c.domain && c.domain.includes('mercadolivre'))
          .map(c => `${c.name}=${c.value}`)
          .join('; ')
      : '';
    if (cookieHeader) headers['Cookie'] = cookieHeader;

    const r = await fetch(apiUrl, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
    if (r.ok) {
      const data = await r.json();
      const shortLink = data.short_url || data.shortUrl || data.url || data.link;
      if (shortLink && shortLink.includes('meli.la')) {
        mlLinkCache.set(productUrl, { shortLink, expiresAt: Date.now() + ML_CACHE_TTL });
        console.log('[ML] Link gerado via API:', shortLink);
        return shortLink;
      }
    }
    console.warn('[ML] API REST retornou:', r.status, await r.text().catch(() => ''));
  } catch (e) {
    console.warn('[ML] API REST falhou:', e.message);
  }

  // ── Fallback: Playwright (portal web) ─────────────────────────────────────
  const ready = await mlEnsureBrowser();
  if (!ready) throw new Error('Playwright não disponível');

  const page = await mlContext.newPage();
  try {
    // Vai direto para o gerador de links
    const generatorUrl = 'https://www.mercadolivre.com.br/afiliados/linkbuilder#hub';
    await page.goto(generatorUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Verifica login
    if (page.url().includes('login') || page.url().includes('registration')) {
      mlBrowser = null; mlContext = null;
      throw new Error('Sessão expirada — rode: node ml-link-server.js --login');
    }

    // Aguarda a página carregar e usa seletor correto descoberto via diagnóstico
    await new Promise(r => setTimeout(r, 4000));

    // Seletor real da textarea do linkbuilder (id="url-0")
    const inputSel = '#url-0, textarea[placeholder*="mercadolivre"], textarea.andes-form-control__field';
    await page.waitForSelector(inputSel, { timeout: 20000 });
    console.log('[ML] Gerador carregado, textarea encontrada. URL:', page.url());

    // Limpa e preenche a textarea simulando digitação real (para habilitar o botão Gerar)
    await page.click(inputSel);
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, inputSel);
    await page.type(inputSel, trackedUrl, { delay: 30 });
    // Dispara eventos de change/input para o framework detectar
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, inputSel);
    await new Promise(r => setTimeout(r, 1000));

    // Clica no botão Gerar
    await page.click('button:has-text("Gerar")', { timeout: 5000 });
    console.log('[ML] Botão Gerar clicado');

    // Aguarda o link meli.la aparecer — pode estar em input.value ou no DOM
    // O resultado aparece num campo <input> readonly no painel direito
    const found = await page.waitForFunction(() => {
      // Busca em todos os inputs e textareas
      for (const el of document.querySelectorAll('input, textarea')) {
        if (el.value && el.value.includes('meli.la/')) return true;
      }
      // Fallback: texto puro
      return document.body.innerText.includes('meli.la/');
    }, { timeout: 30000 }).then(() => true).catch(() => false);

    if (!found) throw new Error('meli.la não apareceu após 30s');
    console.log('[ML] Link meli.la detectado!');

    // Extrai o link
    const shortLink = await page.evaluate(() => {
      // Primeiro tenta input/textarea com o valor
      for (const el of document.querySelectorAll('input, textarea')) {
        const m = el.value && el.value.match(/https?:\/\/meli\.la\/[A-Za-z0-9]+/);
        if (m) return m[0];
      }
      // Fallback: texto puro
      const m = document.body.innerText.match(/https?:\/\/meli\.la\/[A-Za-z0-9]+/);
      return m ? m[0] : null;
    });

    if (!shortLink) throw new Error('Link meli.la não encontrado na página após geração');
    mlLinkCache.set(productUrl, { shortLink, expiresAt: Date.now() + ML_CACHE_TTL });
    console.log('[ML] Link gerado:', shortLink);
    return shortLink;
  } finally {
    await page.close();
  }
}

// ── Utilitário: faz upload de screenshot para GitHub ──────────────────────────
async function uploadScreenshotToGitHub(filePath) {
  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
      console.warn('[ML] Screenshot vazio ou inexistente:', filePath); return;
    }
    const ghToken = process.env.GITHUB_TOKEN || '';
    if (!ghToken) { console.warn('[ML] GITHUB_TOKEN não definido'); return; }
    const imgData = fs.readFileSync(filePath).toString('base64');
    const getRes = await fetch('https://api.github.com/repos/compartilhadascompras3-glitch/Botw/contents/ml-debug.png', {
      headers: { Authorization: `token ${ghToken}`, 'User-Agent': 'wa-server' },
      signal: AbortSignal.timeout(8000),
    });
    const existing = getRes.ok ? await getRes.json() : null;
    const putBody = { message: 'debug: ml-debug.png', content: imgData, ...(existing?.sha ? { sha: existing.sha } : {}) };
    const putRes = await fetch('https://api.github.com/repos/compartilhadascompras3-glitch/Botw/contents/ml-debug.png', {
      method: 'PUT',
      headers: { Authorization: `token ${ghToken}`, 'Content-Type': 'application/json', 'User-Agent': 'wa-server' },
      body: JSON.stringify(putBody),
      signal: AbortSignal.timeout(15000),
    });
    if (putRes.ok) console.log('[ML] Screenshot no GitHub: https://github.com/compartilhadascompras3-glitch/Botw/blob/main/ml-debug.png');
    else console.warn('[ML] GitHub upload status:', putRes.status, await putRes.text().catch(() => ''));
  } catch (e) { console.warn('[ML] Upload GitHub erro:', e.message); }
}



// Inicializa o browser ML em background ao subir o servidor
mlEnsureBrowser().catch(() => {});

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type,ngrok-skip-browser-warning');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET /status  – estado atual
  if (req.method === 'GET' && url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status, message: statusMessage, hasQR: !!currentQR, qr: currentQR ?? null }));
    return;
  }

  // GET /qr  – QR Code como Data URL (PNG base64)
  if (req.method === 'GET' && url.pathname === '/qr') {
    if (!currentQR) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'QR não disponível' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ qr: currentQR }));
    }
    return;
  }

  // GET /events  – SSE stream de status
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`event: status\ndata: ${JSON.stringify({ status, message: statusMessage, qr: currentQR })}\n\n`);
    sseClients.push(res);
    req.on('close', () => {
      sseClients = sseClients.filter((c) => c !== res);
    });
    return;
  }

  // POST /connect  – inicia / reinicia o cliente
  if (req.method === 'POST' && url.pathname === '/connect') {
    initClient();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // POST /disconnect  – desconecta
  if (req.method === 'POST' && url.pathname === '/disconnect') {
    if (sock) {
      try { sock.logout().catch(() => {}); } catch {}
      sock = null;
    }
    status = 'disconnected';
    statusMessage = 'Desconectado manualmente';
    currentQR = null;
    sendStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // GET /groups  – lista todos os grupos do WhatsApp conectado
  if (req.method === 'GET' && url.pathname === '/groups') {
    if (!sock || status !== 'ready') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'WhatsApp não está conectado' }));
      return;
    }
    (async () => {
      try {
        const groupsMap = await sock.groupFetchAllParticipating();
        const groups = Object.values(groupsMap).map((g) => ({
          id: g.id,
          name: g.subject || g.id.split('@')[0],
          participantsCount: g.participants?.length ?? 0,
        }));
        const sorted = groups.sort((a, b) => a.name.localeCompare(b.name));
        console.log(`[WA] Grupos encontrados: ${sorted.length}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ groups: sorted }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[WA] Erro ao listar grupos:', msg);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
      }
    })();
    return;
  }

  // POST /send  – envia mensagem
  // Body: { to, message, mediaDataUrl?, mediaType?, mediaName? }
  // mediaDataUrl: data URL completa, ex: "data:image/jpeg;base64,/9j/..."
  if (req.method === 'POST' && url.pathname === '/send') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const { to, message, mediaDataUrl, mediaType, mediaName } = JSON.parse(body);
        if (!sock || status !== 'ready') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'WhatsApp não está conectado' }));
          return;
        }
        if (!to) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Campo "to" obrigatório' }));
          return;
        }
        const jid = toJid(to);
        await ensureGroupMetadata(sock, jid);

        if (mediaDataUrl) {
          const base64 = base64FromDataUrl(mediaDataUrl);
          const mime = mediaType || 'image/jpeg';
          const filename = mediaName || 'media';
          await sock.sendMessage(jid, buildMediaMessage(mime, base64, filename, message));
          console.log(`[WA] Mídia enviada para ${jid} (${mime})`);
        } else {
          if (!message) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Campo "message" obrigatório quando não há mídia' }));
            return;
          }
          await sock.sendMessage(jid, { text: message });
          console.log(`[WA] Mensagem enviada para ${jid}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, to: jid }));
      } catch (err) {
        const msg = err?.message || String(err);
        console.error('[WA] Erro ao enviar:', msg);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
      }
    });
    return;
  }

  // POST /post-status  – publica um Story/Status no WhatsApp
  // Body: { message?, mediaDataUrl?, mediaType?, mediaName? }
  if (req.method === 'POST' && url.pathname === '/post-status') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const { message, mediaDataUrl, mediaType, mediaName } = JSON.parse(body);
        if (!sock || status !== 'ready') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'WhatsApp não está conectado' }));
          return;
        }
        if (!message && !mediaDataUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Informe "message" ou "mediaDataUrl"' }));
          return;
        }

        if (mediaDataUrl) {
          const base64 = base64FromDataUrl(mediaDataUrl);
          const mime = mediaType || 'image/jpeg';
          const filename = mediaName || 'status.jpg';
          await sock.sendMessage('status@broadcast', buildMediaMessage(mime, base64, filename, message));
        } else {
          await sock.sendMessage('status@broadcast', { text: message || '' });
        }

        console.log('[WA] Status publicado');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        const msg = err?.message || String(err);
        console.error('[WA] Erro ao postar status:', msg);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
      }
    });
    return;
  }

  // GET /scheduler/state — estado atual do scheduler
  if (req.method === 'GET' && url.pathname === '/scheduler/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getSchedulerState()));
    return;
  }

  // POST /scheduler/start — inicia o scheduler (body: config opcional)
  if (req.method === 'POST' && url.pathname === '/scheduler/start') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { const cfg = body ? JSON.parse(body) : {}; schedulerStart(cfg); } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getSchedulerState()));
    });
    return;
  }

  // POST /scheduler/stop — para o scheduler
  if (req.method === 'POST' && url.pathname === '/scheduler/stop') {
    schedulerStop();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getSchedulerState()));
    return;
  }

  // POST /scheduler/config — atualiza config sem parar/iniciar
  if (req.method === 'POST' && url.pathname === '/scheduler/config') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { const cfg = JSON.parse(body); applySchedulerConfig(cfg); } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getSchedulerState()));
    });
    return;
  }

  // POST /scheduler/fire — disparo manual imediato
  if (req.method === 'POST' && url.pathname === '/scheduler/fire') {
    schedulerFire();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── Scraping local (IP residencial do PC) ───────────────────────────────────

  // GET /scrape/amazon-html — retorna snippet do HTML bruto para debug
  if (req.method === 'GET' && url.pathname === '/scrape/amazon-html') {
    const q = url.searchParams.get('q') || 'fone bluetooth';
    const target = `https://www.amazon.com.br/s?k=${encodeURIComponent(q)}&s=discount-rank`;
    const UAS2 = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    ];
    (async () => {
      try {
        const r = await fetch(target, { headers: { 'User-Agent': UAS2[0], 'Accept-Language': 'pt-BR,pt;q=0.9', 'Accept': 'text/html', 'Referer': 'https://www.amazon.com.br/' }, signal: AbortSignal.timeout(14000) });
        const html = await r.text();
        // Extrai um bloco de search-result para debug
        const snip = html.slice(html.indexOf('data-component-type="s-search-result"') - 50, html.indexOf('data-component-type="s-search-result"') + 500);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: r.status, len: html.length, has_results: html.includes('data-component-type="s-search-result"'), has_captcha: html.includes('validateCaptcha'), snippet: snip }));
      } catch(e) { res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:e.message})); }
    })();
    return;
  }

  // GET /scrape/shopee-html — retorna snippet da resposta Shopee para debug
  if (req.method === 'GET' && url.pathname === '/scrape/shopee-html') {
    const q = url.searchParams.get('q') || 'fone bluetooth';
    const target = `https://shopee.com.br/api/v4/search/search_items?by=sales&keyword=${encodeURIComponent(q)}&limit=10&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`;
    (async () => {
      try {
        const r = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36', 'Accept': 'application/json', 'Accept-Language': 'pt-BR,pt;q=0.9', 'Referer': `https://shopee.com.br/search?keyword=${encodeURIComponent(q)}`, 'x-api-source': 'pc', 'x-shopee-language': 'pt-BR', 'x-requested-with': 'XMLHttpRequest' }, signal: AbortSignal.timeout(14000) });
        const text = await r.text();
        let parsed = null; try { parsed = JSON.parse(text); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: r.status, len: text.length, error_code: parsed?.error, item_count: parsed?.items?.length ?? 0, first_item_keys: parsed?.items?.[0] ? Object.keys(parsed.items[0]) : [], first_info_keys: parsed?.items?.[0]?.item_basic ? Object.keys(parsed.items[0].item_basic).slice(0,20) : [] }));
      } catch(e) { res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:e.message})); }
    })();
    return;
  }

  // GET /scrape/amazon?q=...&category=...&minDiscount=...&page=...&cookie=...
  if (req.method === 'GET' && url.pathname === '/scrape/amazon') {
    const q            = url.searchParams.get('q') || 'fone bluetooth';
    const category     = url.searchParams.get('category') || '';
    const minDiscount  = parseInt(url.searchParams.get('minDiscount') || '10', 10);
    const page         = parseInt(url.searchParams.get('page') || '1', 10);
    const cookieStr    = url.searchParams.get('cookie') || '';

    const AMZ_NODES = {
      electronics:'16386173011', computers:'16386150011', phones:'16243680011',
      books:'6740748011', home:'16386175011', kitchen:'16386176011',
      beauty:'16386163011', sports:'16386169011', games:'6986547011', toys:'16386166011',
    };
    const rh = `p_n_deal_type:23566064011${category && AMZ_NODES[category] ? `,n:${AMZ_NODES[category]}` : ''}`;
    const amzUrl = `https://www.amazon.com.br/s?k=${encodeURIComponent(q)}&rh=${encodeURIComponent(rh)}&s=discount-rank&page=${page}`;
    const simpleUrl = `https://www.amazon.com.br/s?k=${encodeURIComponent(q + ' oferta')}&s=review-rank&page=${page}`;

    const UAS = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    ];
    const randomUA = () => UAS[Math.floor(Math.random() * UAS.length)];

    async function fetchAmzHtml(targetUrl) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 15000);
      try {
        const r = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': randomUA(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Upgrade-Insecure-Requests': '1',
            'Referer': 'https://www.amazon.com.br/',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-origin',
            'sec-fetch-user': '?1',
            ...(cookieStr ? { 'Cookie': cookieStr } : {}),
          },
        });
        return { status: r.status, html: await r.text() };
      } catch (e) { return { status: 0, html: '' }; }
      finally { clearTimeout(t); }
    }

    function parseAmazon(html, minDisc) {
      const products = [];
      const re = /<div[^>]+data-component-type="s-search-result"[^>]+data-asin="([A-Z0-9]{10})"[^>]*>([\s\S]*?)(?=<div[^>]+data-component-type="s-search-result"|$)/g;
      let m;
      while ((m = re.exec(html)) !== null && products.length < 60) {
        const asin = m[1], block = m[2];

        // Título
        const titleM = block.match(/class="[^"]*a-text-normal[^"]*"[^>]*>([^<]{10,200})<\/span>/);
        const title = titleM ? titleM[1].trim() : '';
        if (!title) continue;

        // Preço atual — tenta múltiplos padrões
        let price = null;
        const wholeM = block.match(/a-price-whole[^>]*>([^<]+)</);
        const fracM  = block.match(/a-price-fraction[^>]*>([^<]+)</);
        if (wholeM) {
          const whole = wholeM[1].replace(/\./g,'').replace(/\D/g,'');
          const frac  = fracM ? fracM[1].replace(/\D/g,'').padEnd(2,'0').slice(0,2) : '00';
          price = parseFloat(`${whole}.${frac}`);
        }
        // fallback: "R$ 1.234,56"
        if (!price) {
          const altM = block.match(/R\$\s*([\d.]+,\d{2})/);
          if (altM) price = parseFloat(altM[1].replace('.','').replace(',','.'));
        }
        if (!price || price <= 0) continue;

        // Preço original (riscado)
        const origM = block.match(/a-price\s+a-text-price[^>]*><span[^>]*>([^<]+)<\/span>/);
        let origPrice = null;
        if (origM) {
          const raw = origM[1].replace(/[^\d,]/g,'').replace(',','.');
          const v = parseFloat(raw);
          if (!isNaN(v) && v > price) origPrice = v;
        }
        // fallback: badge "De: R$ X"
        if (!origPrice) {
          const deM = block.match(/De:\s*R\$\s*([\d.]+,\d{2})/);
          if (deM) {
            const v = parseFloat(deM[1].replace('.','').replace(',','.'));
            if (!isNaN(v) && v > price) origPrice = v;
          }
        }

        let disc = origPrice ? Math.round(((origPrice - price) / origPrice) * 100) : 0;
        // fallback: badge de % desconto na página
        if (!disc) { const dm = block.match(/(\d+)%\s*(?:de desconto|off)/i); if (dm) disc = parseInt(dm[1]); }
        if (disc < minDisc) continue;

        // Thumbnail
        const imgM = block.match(/class="[^"]*s-image[^"]*"[^>]*src="([^"]+)"/);
        if (!imgM) continue;

        const starsM   = block.match(/(\d[,.]\d)\s*de\s*5\s*estrelas/);
        const reviewsM = block.match(/([\d.,]+)\s*avaliações/);
        products.push({
          id: `amz-${asin}`, asin, title, price,
          original_price: origPrice, discount_percent: disc,
          thumbnail: imgM[1],
          permalink: `https://www.amazon.com.br/dp/${asin}`,
          source: 'amazon',
          stars:   starsM   ? parseFloat(starsM[1].replace(',','.'))    : undefined,
          reviews: reviewsM ? parseInt(reviewsM[1].replace(/\D/g,''))   : undefined,
          prime: /i-prime/.test(block),
        });
      }
      return products.sort((a,b) => b.discount_percent - a.discount_percent);
    }

    (async () => {
      try {
        let { status, html } = await fetchAmzHtml(amzUrl);
        const blocked = (h) => !h || h.length < 3000 || h.includes('validateCaptcha') || h.includes('Type the characters');
        if (blocked(html)) ({ status, html } = await fetchAmzHtml(simpleUrl));
        if (blocked(html)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Amazon bloqueou mesmo com IP local. Tente em instantes.', products: [], blocked: true }));
          return;
        }
        const products = parseAmazon(html, minDiscount);
        const hasMore  = html.includes('s-pagination-next');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ products, hasMore, total: products.length }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message, products: [] }));
      }
    })();
    return;
  }

  // GET /scrape/shopee?q=...&category=...&minDiscount=...&page=...&cookie=...
  if (req.method === 'GET' && url.pathname === '/scrape/shopee') {
    const q           = url.searchParams.get('q') || 'fone bluetooth';
    const category    = url.searchParams.get('category') || '';
    const minDiscount = parseInt(url.searchParams.get('minDiscount') || '10', 10);
    const page        = parseInt(url.searchParams.get('page') || '1', 10);
    const offset      = (page - 1) * 60;
    const cookieStr   = url.searchParams.get('cookie') || '';

    // Categorias Shopee Brasil (catid real)
    const SHOPEE_CATS = {
      phones:      11000,
      electronics: 11000,
      computers:   11001,
      fashion:     100636,
      beauty:      11175,
      home:        11165,
      kitchen:     11165,
      sports:      11172,
      toys:        11168,
      books:       100013,
    };
    const catParam = category && SHOPEE_CATS[category] ? `&catid=${SHOPEE_CATS[category]}` : '';

    // API v4 de busca da Shopee Brasil
    const shopeeUrl = `https://shopee.com.br/api/v4/search/search_items?by=sales&keyword=${encodeURIComponent(q)}&limit=60&newest=${offset}&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2${catParam}&match_id=0`;

    const UAS = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    ];
    const randomUA = () => UAS[Math.floor(Math.random() * UAS.length)];

    function parseShopeeItems(items, minDisc) {
      const products = [];
      for (const item of items) {
        const info = item.item_basic || item;
        // price em centavos × 10^5 (shopee usa 100000 = R$1)
        const rawPrice    = (info.price || 0) / 100000;
        const rawOriginal = (info.price_before_discount || 0) / 100000;
        if (!rawPrice || rawPrice <= 0) continue;
        const origPrice = rawOriginal > rawPrice ? rawOriginal : null;
        const disc = origPrice ? Math.round(((origPrice - rawPrice) / origPrice) * 100) : 0;
        if (disc < minDisc) continue;
        const shopId = info.shopid;
        const itemId = info.itemid;
        const name   = (info.name || '').trim();
        if (!name || !shopId || !itemId) continue;
        // Thumbnail sem sufixo _tn para melhor qualidade
        const imgKey  = info.image || (info.images && info.images[0]) || '';
        const thumbnail = imgKey ? `https://cf.shopee.com.br/file/${imgKey}` : '';
        if (!thumbnail) continue;
        // Permalink pode usar slug ou apenas /product/shopId/itemId
        const slug = (info.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
        products.push({
          id:               `spee-${itemId}`,
          title:            name,
          price:            rawPrice,
          original_price:   origPrice,
          discount_percent: disc,
          thumbnail,
          permalink:        `https://shopee.com.br/${slug}-i.${shopId}.${itemId}`,
          source:           'shopee',
          stars:            info.item_rating?.rating_star   ?? undefined,
          reviews:          info.item_rating?.rating_count?.[0] ?? undefined,
          sold:             info.historical_sold ?? info.sold ?? undefined,
        });
      }
      products.sort((a, b) => b.discount_percent - a.discount_percent);
      return products;
    }

    (async () => {
      try {
        const ua = randomUA();
        const headers = {
          'User-Agent': ua,
          'Accept': 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': `https://shopee.com.br/search?keyword=${encodeURIComponent(q)}`,
          'x-api-source': 'pc',
          'x-shopee-language': 'pt-BR',
          'x-requested-with': 'XMLHttpRequest',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          ...(cookieStr ? { 'Cookie': cookieStr } : {}),
        };

        // Tenta até 2 vezes
        let data = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 15000);
          try {
            const r = await fetch(shopeeUrl, { signal: controller.signal, headers });
            clearTimeout(t);
            if (r.ok) { data = await r.json(); break; }
          } catch { clearTimeout(t); }
          // pequena pausa antes do retry
          if (attempt === 0) await new Promise(ok => setTimeout(ok, 800));
        }

        if (!data) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Shopee não respondeu. Certifique-se de que o wa-server está rodando com IP residencial.', products: [], blocked: true }));
          return;
        }

        if (data.error && data.error !== 0) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Shopee retornou erro ${data.error}. Tente em instantes.`, products: [], blocked: true }));
          return;
        }

        const items    = data.items || [];
        const products = parseShopeeItems(items, minDiscount);
        const hasMore  = items.length >= 60;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ products, hasMore, total: products.length }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message, products: [] }));
      }
    })();
    return;
  }

  // POST /ml/shorten  – inicia job assíncrono, retorna jobId imediatamente
  if (req.method === 'POST' && url.pathname === '/ml/shorten') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      let productUrl = '';
      try { productUrl = JSON.parse(body).url || ''; } catch { productUrl = new URLSearchParams(body).get('url') || ''; }
      if (!productUrl) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Parâmetro url obrigatório' })); return; }
      const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      mlJobs.set(jobId, { status: 'pending', productUrl, createdAt: Date.now() });
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, jobId }));
      // Processa em background
      mlGenerateLink(decodeURIComponent(productUrl))
        .then(shortLink => { mlJobs.set(jobId, { status: 'done', shortLink, productUrl, createdAt: Date.now() }); console.log('[ML] Job', jobId, 'concluído:', shortLink); })
        .catch(err  => { mlJobs.set(jobId, { status: 'error', error: err.message, productUrl, createdAt: Date.now() }); console.error('[ML] Job', jobId, 'erro:', err.message); });
    });
    return;
  }

  // GET /ml/shorten?url=... (compatibilidade retroativa — também usa jobs)
  if (req.method === 'GET' && url.pathname === '/ml/shorten') {
    const productUrl = url.searchParams.get('url');
    if (!productUrl) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Parâmetro url obrigatório' })); return; }
    const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    mlJobs.set(jobId, { status: 'pending', productUrl, createdAt: Date.now() });
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, jobId, message: 'Use GET /ml/job/' + jobId + ' para buscar o resultado' }));
    mlGenerateLink(decodeURIComponent(productUrl))
      .then(shortLink => { mlJobs.set(jobId, { status: 'done', shortLink, productUrl, createdAt: Date.now() }); })
      .catch(err  => { mlJobs.set(jobId, { status: 'error', error: err.message, productUrl, createdAt: Date.now() }); });
    return;
  }

  // GET /ml/job/:id  – consulta resultado do job
  if (req.method === 'GET' && url.pathname.startsWith('/ml/job/')) {
    const jobId = url.pathname.replace('/ml/job/', '');
    const job = mlJobs.get(jobId);
    if (!job) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Job não encontrado' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(job));
    return;
  }

  // GET /ml/status
  if (req.method === 'GET' && url.pathname === '/ml/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, browserReady: !!(mlBrowser && mlContext), cookiesLoaded: fs.existsSync(ML_COOKIES_FILE), cacheSize: mlLinkCache.size, pendingJobs: [...mlJobs.values()].filter(j => j.status === 'pending').length }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`[WA Server] Rodando na porta ${PORT}`);
  console.log('[WA Server] Engine: Baileys (WebSocket direto, sem Chrome)');
  // Inicia o cliente WhatsApp automaticamente ao subir o servidor
  console.log('[WA] Iniciando cliente automaticamente...');
  initClient();
});
