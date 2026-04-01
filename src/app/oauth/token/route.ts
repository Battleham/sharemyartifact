import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  verifyPkceChallenge,
} from '@/lib/oauth';

const ACCESS_TOKEN_TTL = 60 * 60; // 1 hour in seconds
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

export const POST = async (request: NextRequest) => {
  // OAuth token endpoint uses application/x-www-form-urlencoded
  const contentType = request.headers.get('content-type') || '';
  let params: URLSearchParams;

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text();
    params = new URLSearchParams(text);
  } else if (contentType.includes('application/json')) {
    // Some clients send JSON — be lenient
    const body = await request.json();
    params = new URLSearchParams(body);
  } else {
    const text = await request.text();
    params = new URLSearchParams(text);
  }

  const grantType = params.get('grant_type');

  if (grantType === 'authorization_code') {
    return handleAuthorizationCode(params);
  }

  if (grantType === 'refresh_token') {
    return handleRefreshToken(params);
  }

  return tokenError('unsupported_grant_type', 'Only authorization_code and refresh_token are supported');
};

const handleAuthorizationCode = async (params: URLSearchParams) => {
  const code = params.get('code');
  const codeVerifier = params.get('code_verifier');
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');

  if (!code || !codeVerifier || !clientId || !redirectUri) {
    return tokenError('invalid_request', 'Missing required parameters: code, code_verifier, client_id, redirect_uri');
  }

  const admin = createAdminClient();
  const codeHash = await hashToken(code);

  // Look up authorization code
  const { data: authCode } = await admin
    .from('oauth_authorization_codes')
    .select('*')
    .eq('code_hash', codeHash)
    .single();

  if (!authCode) {
    return tokenError('invalid_grant', 'Invalid or expired authorization code');
  }

  // Delete code immediately (single-use)
  await admin
    .from('oauth_authorization_codes')
    .delete()
    .eq('code_hash', codeHash);

  // Check expiration
  if (new Date(authCode.expires_at) < new Date()) {
    return tokenError('invalid_grant', 'Authorization code has expired');
  }

  // Validate client_id and redirect_uri match
  if (authCode.client_id !== clientId) {
    return tokenError('invalid_grant', 'client_id mismatch');
  }

  if (authCode.redirect_uri !== redirectUri) {
    return tokenError('invalid_grant', 'redirect_uri mismatch');
  }

  // Verify PKCE
  const pkceValid = await verifyPkceChallenge(codeVerifier, authCode.code_challenge);
  if (!pkceValid) {
    return tokenError('invalid_grant', 'PKCE code_verifier verification failed');
  }

  // Generate tokens
  return issueTokens(admin, authCode.client_id, authCode.user_id, authCode.scope);
};

const handleRefreshToken = async (params: URLSearchParams) => {
  const refreshToken = params.get('refresh_token');
  const clientId = params.get('client_id');

  if (!refreshToken || !clientId) {
    return tokenError('invalid_request', 'Missing required parameters: refresh_token, client_id');
  }

  const admin = createAdminClient();
  const refreshHash = await hashToken(refreshToken);

  // Look up refresh token
  const { data: tokenRecord } = await admin
    .from('oauth_tokens')
    .select('*')
    .eq('refresh_token_hash', refreshHash)
    .single();

  if (!tokenRecord) {
    return tokenError('invalid_grant', 'Invalid refresh token');
  }

  // Validate client
  if (tokenRecord.client_id !== clientId) {
    return tokenError('invalid_grant', 'client_id mismatch');
  }

  // Check refresh token expiration
  if (tokenRecord.refresh_expires_at && new Date(tokenRecord.refresh_expires_at) < new Date()) {
    await admin.from('oauth_tokens').delete().eq('id', tokenRecord.id);
    return tokenError('invalid_grant', 'Refresh token has expired');
  }

  // Delete old token (rotation)
  await admin.from('oauth_tokens').delete().eq('id', tokenRecord.id);

  // Issue new tokens
  return issueTokens(admin, tokenRecord.client_id, tokenRecord.user_id, tokenRecord.scope);
};

const issueTokens = async (
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  userId: string,
  scope: string
) => {
  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();
  const accessTokenHash = await hashToken(accessToken);
  const refreshTokenHash = await hashToken(refreshToken);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL * 1000);
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL * 1000);

  const { error } = await admin
    .from('oauth_tokens')
    .insert({
      access_token_hash: accessTokenHash,
      refresh_token_hash: refreshTokenHash,
      client_id: clientId,
      user_id: userId,
      scope,
      expires_at: expiresAt.toISOString(),
      refresh_expires_at: refreshExpiresAt.toISOString(),
    });

  if (error) {
    return tokenError('server_error', 'Failed to issue tokens');
  }

  return NextResponse.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refreshToken,
    scope,
  });
};

const tokenError = (error: string, description: string) => {
  return NextResponse.json(
    { error, error_description: description },
    { status: 400 }
  );
};
