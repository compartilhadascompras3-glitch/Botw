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
    // Cloudflare Workers: usa proxy HTTP
    const secret = process.env.DB_PROXY_SECRET ?? ''
    const proxyUrl = '/api/db-proxy'

    // Cria um cliente fake que translata as queries do drizzle para chamadas HTTP ao proxy
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require('drizzle-orm/neon-http') as typeof import('drizzle-orm/neon-http')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { neon } = require('@neondatabase/serverless') as typeof import('@neondatabase/serverless')

    // Override do fetch do neon para redirecionar ao proxy
    const proxiedNeon = new Proxy(neon(url), {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apply(_target: any, _thisArg: any, [query, params]: any[]) {
        return fetch(proxyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-proxy-secret': secret,
          },
          body: JSON.stringify({ query, params }),
        })
          .then(r => r.json() as Promise<{ rows: unknown[] }>)
          .then(data => data.rows ?? [])
      },
    })

    _db = drizzle(proxiedNeon)
  }

  return _db
}

// Mantém `db` como getter lazy para compatibilidade com imports existentes
export const db: AnyDb = new Proxy({} as AnyDb, {
  get(_target, prop) {
    return (getDb() as Record<string | symbol, unknown>)[prop]
  },
})
