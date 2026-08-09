import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function GET() {
  const neonUrl = process.env.NEON_DATABASE_URL ?? ''
  const dbUrl = process.env.DATABASE_URL ?? ''

  let dbStatus = 'unknown'
  let dbError = ''
  let rowCount = 0

  const urlToUse = neonUrl || dbUrl
  if (urlToUse) {
    try {
      const sql = neon(urlToUse)
      const rows = await sql`SELECT COUNT(*)::int AS n FROM messages`
      rowCount = (rows[0] as { n: number }).n
      dbStatus = 'ok'
    } catch (e) {
      dbStatus = 'error'
      dbError = String(e)
    }
  } else {
    dbStatus = 'no_url'
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        message: 'ok',
        db: dbStatus,
        dbError,
        rowCount,
        hasNeonUrl: !!neonUrl,
        hasDbUrl: !!dbUrl,
        neonUrlPrefix: neonUrl ? neonUrl.substring(0, 30) + '...' : '',
      },
    },
    { status: 200, headers: corsHeaders }
  )
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}
