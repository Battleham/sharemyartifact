import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateClientId } from '@/lib/oauth';

export const POST = async (request: NextRequest) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request', error_description: 'Invalid JSON body' }, { status: 400 });
  }

  const clientName = (body.client_name as string) || 'Unknown Client';
  const redirectUris = body.redirect_uris as string[] | undefined;

  if (!redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'redirect_uris is required' },
      { status: 400 }
    );
  }

  // Validate all redirect URIs are HTTPS
  for (const uri of redirectUris) {
    if (!uri.startsWith('https://') && !uri.startsWith('http://localhost')) {
      return NextResponse.json(
        { error: 'invalid_client_metadata', error_description: 'redirect_uris must use HTTPS' },
        { status: 400 }
      );
    }
  }

  const clientId = generateClientId();
  const grantTypes = (body.grant_types as string[]) || ['authorization_code'];
  const responseTypes = (body.response_types as string[]) || ['code'];
  const tokenEndpointAuthMethod = (body.token_endpoint_auth_method as string) || 'none';

  const admin = createAdminClient();

  const { error } = await admin
    .from('oauth_clients')
    .insert({
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      token_endpoint_auth_method: tokenEndpointAuthMethod,
    });

  if (error) {
    return NextResponse.json(
      { error: 'server_error', error_description: 'Failed to register client' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: tokenEndpointAuthMethod,
  }, { status: 201 });
};
