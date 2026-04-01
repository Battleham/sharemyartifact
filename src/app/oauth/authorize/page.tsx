import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { OAuthConsentPage } from '@/components/OAuthConsentPage';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sharemyartifact.com';

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const clientId = params.client_id;
  const redirectUri = params.redirect_uri;
  const responseType = params.response_type;
  const codeChallenge = params.code_challenge;
  const codeChallengeMethod = params.code_challenge_method || 'S256';
  const scope = params.scope || 'mcp:full';
  const state = params.state || null;

  // Validate required params
  if (!clientId || !redirectUri || !codeChallenge) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-red-600">Missing required parameters: client_id, redirect_uri, code_challenge</p>
      </div>
    );
  }

  if (responseType && responseType !== 'code') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-red-600">Unsupported response_type. Only &quot;code&quot; is supported.</p>
      </div>
    );
  }

  if (codeChallengeMethod !== 'S256') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-red-600">Unsupported code_challenge_method. Only S256 is supported.</p>
      </div>
    );
  }

  // Validate client exists
  const admin = createAdminClient();
  const { data: client } = await admin
    .from('oauth_clients')
    .select('client_id, client_name, redirect_uris')
    .eq('client_id', clientId)
    .single();

  if (!client) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-red-600">Unknown client_id</p>
      </div>
    );
  }

  if (!client.redirect_uris.includes(redirectUri)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-red-600">redirect_uri does not match registered URIs</p>
      </div>
    );
  }

  // Check user authentication
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    // Redirect to login, then back here
    const currentUrl = `${APP_URL}/oauth/authorize?${new URLSearchParams(params as Record<string, string>).toString()}`;
    redirect(`/login?next=${encodeURIComponent(currentUrl)}`);
  }

  // Get username
  const { data: userProfile } = await admin
    .from('users')
    .select('username')
    .eq('id', authUser.id)
    .single();

  if (!userProfile) {
    redirect('/signup');
  }

  return (
    <OAuthConsentPage
      clientName={client.client_name}
      scope={scope}
      clientId={clientId}
      redirectUri={redirectUri}
      codeChallenge={codeChallenge}
      codeChallengeMethod={codeChallengeMethod}
      state={state}
      username={userProfile.username}
    />
  );
}
