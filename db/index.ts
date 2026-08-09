// Banco de dados: driver Neon HTTP (funciona em CF Workers e Node.js)
// Lazy initialization para capturar erro de env em runtime, não em module load.

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

type DrizzleNeon = ReturnType<typeof drizzle>

let _db: DrizzleNeon | null = null

export function getDb(): DrizzleNeon {
  if (_db) return _db
  const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
  if (!url) throw new Error('NEON_DATABASE_URL não configurado — defina em wrangler.toml [vars] ou .env')
  const sql = neon(url)
  _db = drizzle(sql)
  return _db
}

// Mantém `db` como getter lazy para compatibilidade com imports existentes
export const db: DrizzleNeon = new Proxy({} as DrizzleNeon, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
