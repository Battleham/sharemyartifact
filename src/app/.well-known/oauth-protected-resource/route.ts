import { NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sharemyartifact.com';

export const GET = () => {
  return NextResponse.json({
    resource: `${APP_URL}/api/mcp`,
    authorization_servers: [APP_URL],
    scopes_supported: ['mcp:full'],
  });
};
