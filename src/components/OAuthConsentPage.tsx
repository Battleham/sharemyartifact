'use client';

import { useState } from 'react';

interface OAuthConsentPageProps {
  clientName: string;
  scope: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string | null;
  username: string;
  error?: string;
}

export function OAuthConsentPage({
  clientName,
  scope,
  clientId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  state,
  username,
  error,
}: OAuthConsentPageProps) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Authorize {clientName}
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {clientName} wants to access your ShareMyArtifact account
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Signed in as <span className="font-semibold">{username}</span>
          </p>
          <div className="mt-3 space-y-2">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">This will allow {clientName} to:</p>
            <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              {scope.includes('mcp:full') && (
                <>
                  <li>Upload and manage your artifacts</li>
                  <li>List your existing artifacts</li>
                  <li>Delete artifacts on your behalf</li>
                </>
              )}
            </ul>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <form
          action="/oauth/authorize"
          method="POST"
          onSubmit={() => setSubmitting(true)}
          className="space-y-3"
        >
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="code_challenge" value={codeChallenge} />
          <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
          <input type="hidden" name="scope" value={scope} />
          {state && <input type="hidden" name="state" value={state} />}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? 'Authorizing...' : 'Allow access'}
          </button>

          <a
            href={redirectUri + '?error=access_denied' + (state ? `&state=${state}` : '')}
            className="block w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-center text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Deny
          </a>
        </form>
      </div>
    </div>
  );
}
