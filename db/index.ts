// Banco de dados: driver postgres (funciona com Neon e HappySeeds DB via TCP)
// Lazy initialization para capturar erro de env em runtime, não em module load.

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'

type DrizzleDb = ReturnType<typeof drizzle>

let _db: DrizzleDb | null = null

export function getDb(): DrizzleDb {
  if (_db) return _db
  const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
  if (!url) throw new Error('NEON_DATABASE_URL não configurado — defina em wrangler.toml [vars] ou .env')
  const client = postgres(url, { ssl: false, max: 5 })
  _db = drizzle(client)
  return _db
}

// Mantém `db` como getter lazy para compatibilidade com imports existentes
export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
