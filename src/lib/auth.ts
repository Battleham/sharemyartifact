import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest } from 'next/server';
import { hashToken } from '@/lib/oauth';
import type { User } from '@/types/database';

export const getAuthenticatedUser = async (): Promise<{ userId: string; user: User } | null> => {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (!user) return null;
  return { userId: authUser.id, user };
};

export const getApiKeyUser = async (request: NextRequest): Promise<{ userId: string; user: User } | null> => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const apiKey = authHeader.slice(7);
  const keyHash = await hashApiKey(apiKey);

  const admin = createAdminClient();

  const { data: keyRecord } = await admin
    .from('api_keys')
    .select('user_id')
    .eq('key_hash', keyHash)
    .single();

  if (!keyRecord) return null;

  // Update last_used_at
  await admin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('key_hash', keyHash);

  const { data: user } = await admin
    .from('users')
    .select('*')
    .eq('id', keyRecord.user_id)
    .single();

  if (!user) return null;
  return { userId: keyRecord.user_id, user };
};

export const hashApiKey = async (key: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const generateApiKey = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `sma_${key}`;
};

export const hashPassword = async (password: string): Promise<string> => {
  return hashApiKey(password); // SHA-256 hash
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  const inputHash = await hashPassword(password);
  return inputHash === hash;
};

export const getOAuthUser = async (request: NextRequest): Promise<{ userId: string; user: User } | null> => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  console.log('[auth] Token prefix:', token.substring(0, 10) + '...');

  // Skip tokens that look like API keys (sma_ prefix)
  if (token.startsWith('sma_') && !token.startsWith('sma_at_')) {
    console.log('[auth] Skipping API key token');
    return null;
  }

  const tokenHash = await hashToken(token);
  const admin = createAdminClient();

  const { data: tokenRecord, error: tokenError } = await admin
    .from('oauth_tokens')
    .select('user_id, expires_at')
    .eq('access_token_hash', tokenHash)
    .single();

  console.log('[auth] Token lookup result:', tokenRecord ? 'found' : 'not found', tokenError ? `error: ${tokenError.message}` : '');

  if (!tokenRecord) return null;

  // Check expiration
  if (new Date(tokenRecord.expires_at) < new Date()) {
    console.log('[auth] Token expired at:', tokenRecord.expires_at);
    return null;
  }

  const { data: user } = await admin
    .from('users')
    .select('*')
    .eq('id', tokenRecord.user_id)
    .single();

  if (!user) return null;
  return { userId: tokenRecord.user_id, user };
};
