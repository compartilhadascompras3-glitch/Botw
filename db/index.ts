import 'server-only'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

// @neondatabase/serverless usa HTTP (fetch) para comunicar com o Neon,
// o que funciona tanto em Node.js quanto em Cloudflare Workers (V8 isolate).
// O driver anterior (postgres) usava TCP raw, que trava no CF Workers
// gerando "Salvando..." infinito na UI (Error 1101 / hung request).

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

const sql = neon(process.env.DATABASE_URL)
export const db = drizzle(sql)

