import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/auth/signup — create account with username
export const POST = async (request: Request) => {
  let body: { email: string; password: string; username: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { email, password, username } = body;

  if (!email || !password || !username) {
    return NextResponse.json({ error: 'email, password, and username are required' }, { status: 400 });
  }

  // Validate username format
  if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(username)) {
    return NextResponse.json(
      { error: 'Username must be 3-30 characters, start with a letter or number, and contain only lowercase letters, numbers, hyphens, and underscores' },
      { status: 400 }
    );
  }

  // Check username availability
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('users')
    .select('id')
    .eq('username', username)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
  }

  // Create auth user
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message ?? 'Failed to create account' },
      { status: 400 }
    );
  }

  // Create public user profile
  const { error: profileError } = await admin
    .from('users')
    .insert({
      id: authData.user.id,
      username,
    });

  if (profileError) {
    return NextResponse.json(
      { error: 'Failed to create user profile', details: profileError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ user: { id: authData.user.id, username } }, { status: 201 });
};
