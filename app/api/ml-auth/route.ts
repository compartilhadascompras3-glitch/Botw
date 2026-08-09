/**
 * GET /api/ml-auth
 * Inicia o fluxo OAuth do Mercado Livre.
 * Redireciona para a tela de login/autorização do ML.
 */
export const runtime = 'nodejs';
import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.ML_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'ML_CLIENT_ID não configurado no .env' },
      { status: 500 }
    );
  }

  const redirectUri = process.env.ML_REDIRECT_URI ??
    `${process.env.NEXT_API_URL ?? 'http://localhost:13000'}/api/ml-auth/callback`;

  const authUrl = new URL('https://auth.mercadolivre.com.br/authorization');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);

  return NextResponse.redirect(authUrl.toString());
}
