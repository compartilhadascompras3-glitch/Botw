// Banco de dados: dual-driver
// - Node.js (dev-server local): postgres-js direto via TCP
// - Cloudflare Workers: chama /api/db-proxy (rota Node.js no mesmo deploy) via HTTP
//
// Por quê o proxy? O banco HappySeeds só aceita TCP. Cloudflare Workers não suporta
// TCP puro — só fetch/WebSocket. A rota /api/db-proxy roda em Node.js (runtime: 'nodejs')
// e faz a ponte entre o Worker e o banco.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

let _db: AnyDb | null = null

/** Monta uma instância do drizzle compatível com o ambiente atual */
export function getDb(): AnyDb {
  if (_db) return _db

  const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
  if (!url) throw new Error('NEON_DATABASE_URL não configurado — defina em wrangler.toml [vars] ou .env')

  const isNode = typeof process !== 'undefined' && !!process.versions?.node

  if (isNode) {
    // Node.js: conexão TCP direta
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const postgres = require('postgres') as (url: string, opts: object) => any
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require('drizzle-orm/postgres-js') as typeof import('drizzle-orm/postgres-js')
    _db = drizzle(postgres(url, { ssl: false, max: 5 }))
  } else {
    // Cloudflare Workers: usa proxy HTTP (banco HappySeeds só aceita TCP)
    const secret = process.env.DB_PROXY_SECRET ?? ''
    const proxyUrl = process.env.DB_PROXY_URL ?? 'https://app-a8ef200cd7.happyseeds.space/api/db-proxy'

    // Cria função compatível com neon() que redireciona ao proxy
    const proxiedQuery = async (query: string, params?: unknown[]) => {
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-proxy-secret': secret },
        body: JSON.stringify({ query, params: params ?? [] }),
      })
      const data = await res.json() as { rows?: unknown[]; error?: string }
      if (data.error) throw new Error(data.error)
      return data.rows ?? []
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require('drizzle-orm/neon-http') as typeof import('drizzle-orm/neon-http')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { neon } = require('@neondatabase/serverless') as typeof import('@neondatabase/serverless')
    // Usa neon() como base mas sobrescreve o comportamento via Proxy
    const neonFn = neon(url)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proxied = Object.assign(proxiedQuery as any, neonFn)
    _db = drizzle(proxied)
  }

  return _db
}

// Mantém `db` como getter lazy para compatibilidade com imports existentes
export const db: AnyDb = new Proxy({} as AnyDb, {
  get(_target, prop) {
    return (getDb() as Record<string | symbol, unknown>)[prop]
  },
})
