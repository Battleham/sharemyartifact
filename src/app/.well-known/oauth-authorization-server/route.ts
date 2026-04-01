import { NextRequest, NextResponse } from 'next/server';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://sharemyartifact.com').replace(/\/+$/, '');

const metadata = () => NextResponse.json({
  issuer: APP_URL,
  authorization_endpoint: `${APP_URL}/oauth/authorize`,
  token_endpoint: `${APP_URL}/oauth/token`,
  registration_endpoint: `${APP_URL}/oauth/register`,
  scopes_supported: ['mcp:full'],
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  token_endpoint_auth_methods_supported: ['none'],
  code_challenge_methods_supported: ['S256'],
});

export const GET = metadata;

// Claude.ai POSTs to this endpoint — log what it sends
export const POST = async (request: NextRequest) => {
  try {
    const body = await request.text();
    console.log('[oauth-authorization-server] POST body:', body.substring(0, 500));
    console.log('[oauth-authorization-server] POST headers:', JSON.stringify({
      'content-type': request.headers.get('content-type'),
      'authorization': request.headers.get('authorization') ? 'Bearer ...' : null,
      'accept': request.headers.get('accept'),
    }));
  } catch {
    console.log('[oauth-authorization-server] POST (no body)');
  }
  return metadata();
};
