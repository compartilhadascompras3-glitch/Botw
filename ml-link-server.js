/**
 * ml-link-server.js
 * Microserviço que abre o Portal de Afiliados do Mercado Livre via Playwright
 * e gera links curtos meli.la automaticamente.
 *
 * SETUP (uma única vez):
 *   npm install playwright
 *   npx playwright install chromium
 *
 * PRIMEIRO USO (login manual):
 *   node ml-link-server.js --login
 *   → Abre o browser visível, faça login na sua conta ML, depois feche.
 *   Os cookies são salvos em ml-cookies.json e reutilizados nas próximas vezes.
 *
 * USO NORMAL:
 *   node ml-link-server.js
 *   → Sobe na porta 3002 (headless, sem janela)
 *
 * O wa-server.js pode importar a função diretamente ou chamar via HTTP.
 */

const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const { URL } = require('url');

const PORT         = process.env.ML_LINK_PORT  || 3002;
const COOKIES_FILE = path.join(__dirname, 'ml-cookies.json');
const LOGIN_MODE   = process.argv.includes('--login');

// ── Puppeteer / Playwright abstraction ───────────────────────────────────────

let playwright;
try {
  playwright = require('playwright');
} catch {
  console.error('❌  Playwright não instalado. Rode:');
  console.error('    npm install playwright');
  console.error('    npx playwright install chromium');
  process.exit(1);
}

// Cache em memória: url → { shortLink, expiresAt }
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h — links meli.la não expiram

let browser = null;
let context = null;

async function launchBrowser(headless = true) {
  browser = await playwright.chromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'pt-BR',
    viewport: { width: 1280, height: 800 },
  });

  // Carrega cookies salvos
  if (fs.existsSync(COOKIES_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    await context.addCookies(cookies);
    console.log('🍪  Cookies carregados de', COOKIES_FILE);
  }
}

async function saveCookies() {
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  console.log('💾  Cookies salvos em', COOKIES_FILE);
}

// ── Login mode ────────────────────────────────────────────────────────────────

async function doLoginFlow() {
  console.log('🔑  Modo login — abrindo browser visível...');
  console.log('    Faça login na sua conta do Mercado Livre.');
  console.log('    Quando terminar, volte aqui e pressione ENTER.\n');

  await launchBrowser(false); // visível
  const page = await context.newPage();
  await page.goto('https://www.mercadolivre.com.br/l/afiliados-gere-seus-links', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  // Espera o usuário pressionar ENTER — muito mais confiável do que detectar fechamento
  process.stdout.write('    [Pressione ENTER após fazer login] ');
  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', resolve);
  });
  process.stdin.pause();

  await saveCookies();
  await browser.close();
  console.log('✅  Cookies salvos! Agora rode: node ml-link-server.js');
  process.exit(0);
}

// ── Gerador de link ───────────────────────────────────────────────────────────

/**
 * Navega até o portal de afiliados do ML e gera o link curto meli.la
 * para a URL de produto informada.
 */
async function generateMeliLink(productUrl) {
  // Verifica cache
  const cached = cache.get(productUrl);
  if (cached && Date.now() < cached.expiresAt) {
    console.log('💾  Cache hit:', productUrl);
    return cached.shortLink;
  }

  const page = await context.newPage();
  try {
    console.log('🔗  Gerando link para:', productUrl.slice(0, 80));

    // Abre o gerador de links do portal de afiliados
    await page.goto('https://www.mercadolivre.com.br/l/afiliados-gere-seus-links', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Verifica se está logado (o portal redireciona para login se não estiver)
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('registration')) {
      throw new Error('Sessão expirada — rode: node ml-link-server.js --login');
    }

    // Aguarda o campo de input do gerador aparecer
    // (o portal carrega dinâmicamente via React)
    const inputSelector = 'input[placeholder*="link"], input[placeholder*="URL"], input[type="url"], input[type="text"][class*="link"]';
    await page.waitForSelector(inputSelector, { timeout: 15000 });

    // Limpa e digita a URL do produto
    await page.fill(inputSelector, '');
    await page.fill(inputSelector, productUrl);

    // Clica no botão "Gerar"
    const btnSelector = 'button[type="submit"], button:has-text("Gerar"), button:has-text("Criar link")';
    await page.click(btnSelector);

    // Aguarda o link curto aparecer no resultado
    await page.waitForSelector('text=/meli\\.la\\//i', { timeout: 15000 });

    // Extrai o link meli.la do DOM
    const shortLink = await page.evaluate(() => {
      const allText = document.body.innerText;
      const match = allText.match(/https?:\/\/meli\.la\/[A-Za-z0-9]+/);
      return match ? match[0] : null;
    });

    if (!shortLink) throw new Error('Link meli.la não encontrado na página');

    // Armazena em cache
    cache.set(productUrl, { shortLink, expiresAt: Date.now() + CACHE_TTL });
    console.log('✅  Link gerado:', shortLink);
    return shortLink;

  } finally {
    await page.close();
  }
}

// ── HTTP Server ───────────────────────────────────────────────────────────────

function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

async function startServer() {
  await launchBrowser(true); // headless

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
      return res.end();
    }

    const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

    // GET /shorten?url=https://...
    if (req.method === 'GET' && reqUrl.pathname === '/shorten') {
      const productUrl = reqUrl.searchParams.get('url');
      if (!productUrl) return jsonResponse(res, 400, { error: 'Parâmetro url é obrigatório' });

      try {
        const shortLink = await generateMeliLink(decodeURIComponent(productUrl));
        return jsonResponse(res, 200, { ok: true, shortLink });
      } catch (err) {
        console.error('❌  Erro ao gerar link:', err.message);
        return jsonResponse(res, 500, { ok: false, error: err.message });
      }
    }

    // GET /status
    if (req.method === 'GET' && reqUrl.pathname === '/status') {
      return jsonResponse(res, 200, {
        ok: true,
        service: 'ml-link-server',
        cacheSize: cache.size,
        cookiesLoaded: fs.existsSync(COOKIES_FILE),
      });
    }

    return jsonResponse(res, 404, { error: 'Not found' });
  });

  server.listen(PORT, () => {
    console.log(`\n🚀  ml-link-server rodando em http://localhost:${PORT}`);
    console.log(`    GET /shorten?url=<produto-url>  → retorna meli.la`);
    console.log(`    GET /status                     → health check\n`);
  });

  process.on('SIGINT', async () => {
    console.log('\n🛑  Encerrando...');
    await browser?.close();
    server.close();
    process.exit(0);
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (LOGIN_MODE) {
  doLoginFlow().catch((e) => { console.error(e); process.exit(1); });
} else {
  if (!fs.existsSync(COOKIES_FILE)) {
    console.warn('⚠️   Nenhum cookie salvo. Rode primeiro:');
    console.warn('      node ml-link-server.js --login');
    console.warn('    Continuando mesmo assim (vai falhar se não estiver logado)...\n');
  }
  startServer().catch((e) => { console.error(e); process.exit(1); });
}
