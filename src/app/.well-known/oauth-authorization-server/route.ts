import { NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sharemyartifact.com';

export const GET = () => {
  return NextResponse.json({
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
};
