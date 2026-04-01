import { NextResponse } from 'next/server';
import { getAuthenticatedUser, generateApiKey, hashApiKey } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/auth/api-keys — generate a new API key
export const POST = async (request: Request) => {
  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const name = body.name || 'Default';
  const rawKey = generateApiKey();
  const keyHash = await hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12) + '...';

  const admin = createAdminClient();
  const { error } = await admin
    .from('api_keys')
    .insert({
      user_id: auth.userId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name,
    });

  if (error) {
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }

  // Return the raw key only once — it can't be retrieved later
  return NextResponse.json({ key: rawKey, name, prefix: keyPrefix }, { status: 201 });
};

// GET /api/auth/api-keys — list user's API keys (without the actual keys)
export const GET = async () => {
  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: keys, error } = await admin
    .from('api_keys')
    .select('id, key_prefix, name, created_at, last_used_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
  }

  return NextResponse.json({ keys });
};

// DELETE /api/auth/api-keys — delete an API key
export const DELETE = async (request: Request) => {
  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const keyId = searchParams.get('id');

  if (!keyId) {
    return NextResponse.json({ error: 'Missing key id' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('api_keys')
    .delete()
    .eq('id', keyId)
    .eq('user_id', auth.userId);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
};
