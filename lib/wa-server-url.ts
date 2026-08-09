import { db } from '@/db';
import { settings } from '@/db/schemas/settings';
import { eq } from 'drizzle-orm';

const KEY = 'wa_server_url';
const KEY_AMZ_COOKIE = 'amazon_cookie';
const KEY_SPE_COOKIE = 'shopee_cookie';
const DEFAULT_URL = 'http://localhost:3001';

/**
 * Resolve a URL do wa-server nesta ordem de prioridade:
 * 1. Valor salvo no banco pela tela de Configurações
 * 2. Variável de ambiente WA_SERVER_URL
 * 3. http://localhost:3001 (dev local padrão)
 */
export async function getWaServerUrl(): Promise<string> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
    const stored = row?.value?.trim();
    if (stored) return stored.replace(/\/$/, '');
  } catch (err) {
    console.error('[wa-server-url] Falha ao ler do banco, usando fallback:', err);
  }
  const envUrl = process.env.WA_SERVER_URL?.trim();
  return (envUrl || DEFAULT_URL).replace(/\/$/, '');
}

export async function setWaServerUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/$/, '');
  await db
    .insert(settings)
    .values({ key: KEY, value: clean })
    .onConflictDoUpdate({ target: settings.key, set: { value: clean } });
}

export async function getAmazonCookie(): Promise<string> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, KEY_AMZ_COOKIE)).limit(1);
    return row?.value?.trim() ?? '';
  } catch { return ''; }
}

export async function setAmazonCookie(cookie: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key: KEY_AMZ_COOKIE, value: cookie.trim() })
    .onConflictDoUpdate({ target: settings.key, set: { value: cookie.trim() } });
}

export async function getShopeeCookie(): Promise<string> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, KEY_SPE_COOKIE)).limit(1);
    return row?.value?.trim() ?? '';
  } catch { return ''; }
}

export async function setShopeeCookie(cookie: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key: KEY_SPE_COOKIE, value: cookie.trim() })
    .onConflictDoUpdate({ target: settings.key, set: { value: cookie.trim() } });
}
