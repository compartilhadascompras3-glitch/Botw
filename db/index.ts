// Banco de dados: driver Neon HTTP (funciona em CF Workers e Node.js)
// - Em produção (CF Workers): NEON_DATABASE_URL é injetado como secret binding
// - Em dev (Node sandbox): usa NEON_DATABASE_URL do .env (aponta direto para Neon)
// O DATABASE_URL do HappySeeds (database-pool.happyseeds.ai) usa TCP — não funciona no CF Workers.

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
if (!url) throw new Error('NEON_DATABASE_URL não configurado')

const sql = neon(url)
export const db = drizzle(sql)
