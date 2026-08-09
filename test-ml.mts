import { db } from './db/index';
import { settings } from './db/schemas/settings';
import { eq } from 'drizzle-orm';

const rows = await db.select().from(settings).where(eq(settings.key, 'ml_access_token'));
const token = rows[0]?.value ?? '';
console.log('Token len:', token.length);

if (!token) { console.log('NO TOKEN'); process.exit(1); }

const endpoints = [
  ['POST', `https://api.mercadolibre.com/social/users/356678374/links`, { url: 'https://mercadolivre.com.br/p/MLB18725310' }],
  ['POST', 'https://api.mercadolibre.com/short_urls', { url: 'https://mercadolivre.com.br/p/MLB18725310', user_id: 356678374 }],
  ['POST', 'https://api.mercadolibre.com/affiliates/links', { url: 'https://mercadolivre.com.br/p/MLB18725310' }],
  ['GET', 'https://api.mercadolibre.com/social/links?url=https://mercadolivre.com.br/p/MLB18725310', null],
] as const;

for (const [method, url, body] of endpoints) {
  const opts: RequestInit = { method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`\n${method} ${url.slice(40)}\nStatus:${r.status} Body:${text.slice(0,200)}`);
}
process.exit(0);
