import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateAuthorizationCode, hashToken } from '@/lib/oauth';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://sharemyartifact.com').replace(/\/+$/, '');

// POST /oauth/authorize — user approved the consent
export const POST = async (request: NextRequest) => {
  const formData = await request.formData();
  const clientId = formData.get('client_id') as string;
  const redirectUri = formData.get('redirect_uri') as string;
  const codeChallenge = formData.get('code_challenge') as string;
  const codeChallengeMethod = formData.get('code_challenge_method') as string;
  const state = formData.get('state') as string | null;
  const scope = (formData.get('scope') as string) || 'mcp:full';

  // Validate user is authenticated
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.redirect(`${APP_URL}/login?next=${encodeURIComponent(request.url)}`);
  }

  // Validate client exists
  const admin = createAdminClient();
  const { data: client } = await admin
    .from('oauth_clients')
    .select('client_id, redirect_uris')
    .eq('client_id', clientId)
    .single();

  if (!client) {
    return NextResponse.json({ error: 'invalid_client' }, { status: 400 });
  }

  // Validate redirect_uri matches
  if (!client.redirect_uris.includes(redirectUri)) {
    return NextResponse.json({ error: 'invalid_redirect_uri' }, { status: 400 });
  }

  // Get user profile
  const { data: userProfile } = await admin
    .from('users')
    .select('id')
    .eq('id', authUser.id)
    .single();

  if (!userProfile) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 400 });
  }

  // Generate authorization code
  const code = generateAuthorizationCode();
  const codeHash = await hashToken(code);

  const { error: insertError } = await admin
    .from('oauth_authorization_codes')
    .insert({
      code_hash: codeHash,
      client_id: clientId,
      user_id: authUser.id,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod || 'S256',
      scope,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
    });

  if (insertError) {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  // Redirect back to client with code
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);

  return NextResponse.redirect(redirectUrl.toString(), 303);
};
