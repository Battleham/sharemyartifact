'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { ArtifactListItem } from '@/types/api';
import { TTL_OPTIONS, TTL_LABELS, formatTimeRemaining } from '@/lib/ttl';
import type { TtlValue } from '@/lib/ttl';

export function DashboardPage() {
  const [artifacts, setArtifacts] = useState<ArtifactListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const dataPromise = useRef<Promise<void> | null>(null);

  const fetchArtifacts = async () => {
    const res = await fetch('/api/artifacts');
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    const data = await res.json();
    setArtifacts(data.artifacts ?? []);
    setLoading(false);
  };

  if (dataPromise.current === null) {
    dataPromise.current = fetchArtifacts();
  }

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploading(true);
    setError('');

    const form = e.currentTarget;
    const fileInput = form.elements.namedItem('file') as HTMLInputElement;
    const file = fileInput?.files?.[0];

    if (!file) {
      setError('Please select a file');
      setUploading(false);
      return;
    }

    const html = await file.text();
    const visibilitySelect = form.elements.namedItem('visibility') as HTMLSelectElement;
    const ttlSelect = form.elements.namedItem('ttl') as HTMLSelectElement;

    const res = await fetch('/api/artifacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html,
        visibility: visibilitySelect.value,
        ttl: ttlSelect.value,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error + (data.details ? `: ${data.details}` : ''));
      setUploading(false);
      return;
    }

    setShowUpload(false);
    setUploading(false);
    fetchArtifacts();
  };

  const handleDelete = async (slug: string) => {
    if (!confirm('Are you sure you want to delete this artifact?')) return;

    const res = await fetch(`/api/artifacts/${slug}`, { method: 'DELETE' });
    if (res.ok) {
      fetchArtifacts();
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">ShareMyArtifact</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowApiKeys(!showApiKeys)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              API Keys
            </button>
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {showApiKeys && <ApiKeysSection />}

        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Your Artifacts</h2>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Upload
          </button>
        </div>

        {showUpload && (
          <form onSubmit={handleUpload} className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="space-y-3">
              <div>
                <label htmlFor="file" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  HTML File
                </label>
                <input
                  id="file"
                  name="file"
                  type="file"
                  accept=".html,.htm"
                  required
                  className="mt-1 block w-full text-sm text-zinc-500 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-300"
                />
              </div>
              <div>
                <label htmlFor="visibility" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Visibility
                </label>
                <select
                  id="visibility"
                  name="visibility"
                  defaultValue="unlisted"
                  className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                </select>
              </div>
              <div>
                <label htmlFor="ttl" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Expires after
                </label>
                <select
                  id="ttl"
                  name="ttl"
                  defaultValue="1d"
                  className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  {TTL_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{TTL_LABELS[opt]}</option>
                  ))}
                </select>
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={uploading}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {uploading ? 'Uploading...' : 'Upload artifact'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="mt-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
        ) : artifacts.length === 0 ? (
          <div className="mt-8 text-center">
            <p className="text-zinc-500 dark:text-zinc-400">No artifacts yet</p>
            <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
              Upload an HTML file to get started
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {artifacts.map(artifact => (
              <div
                key={artifact.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                    {artifact.title}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                    <a
                      href={artifact.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate hover:underline"
                    >
                      {artifact.url}
                    </a>
                    {artifact.short_url && (
                      <CopyableShortUrl url={artifact.short_url} />
                    )}
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
                      {artifact.visibility}
                    </span>
                    <span className="shrink-0">{artifact.view_count} views</span>
                    <ExpirationBadge
                      expiresAt={artifact.expires_at}
                      slug={artifact.slug}
                      onUpdated={fetchArtifacts}
                    />
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(artifact.slug)}
                  className="ml-4 shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function CopyableShortUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
      title="Copy short URL"
    >
      {copied ? 'Copied!' : url.replace('https://', '')}
    </button>
  );
}

function ExpirationBadge({ expiresAt, slug, onUpdated }: { expiresAt: string | null; slug: string; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleTtlChange = async (newTtl: string) => {
    setSaving(true);
    const res = await fetch(`/api/artifacts/${slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: newTtl }),
    });
    setSaving(false);
    setEditing(false);
    if (res.ok) onUpdated();
  };

  if (editing) {
    return (
      <select
        autoFocus
        disabled={saving}
        className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        defaultValue=""
        onChange={e => handleTtlChange(e.target.value)}
        onBlur={() => setEditing(false)}
      >
        <option value="" disabled>Change TTL...</option>
        {TTL_OPTIONS.map(opt => (
          <option key={opt} value={opt}>{TTL_LABELS[opt]}</option>
        ))}
      </select>
    );
  }

  const label = formatTimeRemaining(expiresAt);
  const isExpired = expiresAt && new Date(expiresAt) < new Date();

  return (
    <button
      onClick={() => !isExpired && setEditing(true)}
      disabled={!!isExpired}
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs transition-colors ${
        isExpired
          ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 cursor-not-allowed opacity-75'
          : expiresAt
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
      }`}
      title={isExpired ? 'This artifact has expired' : expiresAt ? `Expires: ${new Date(expiresAt).toLocaleString()}` : 'No expiration — click to set'}
    >
      {label}
    </button>
  );
}

function ApiKeysSection() {
  const [keys, setKeys] = useState<Array<{ id: string; key_prefix: string; name: string; created_at: string; last_used_at: string | null }>>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('');
  const [loading, setLoading] = useState(true);
  const keysPromise = useRef<Promise<void> | null>(null);

  const fetchKeys = async () => {
    const res = await fetch('/api/auth/api-keys');
    const data = await res.json();
    setKeys(data.keys ?? []);
    setLoading(false);
  };

  if (keysPromise.current === null) {
    keysPromise.current = fetchKeys();
  }

  const handleCreate = async () => {
    const res = await fetch('/api/auth/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: keyName || 'Default' }),
    });
    const data = await res.json();
    if (res.ok) {
      setNewKey(data.key);
      setKeyName('');
      fetchKeys();
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/auth/api-keys?id=${id}`, { method: 'DELETE' });
    fetchKeys();
  };

  return (
    <div className="mb-8 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">API Keys</h3>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Use API keys to upload artifacts via the MCP server
      </p>

      {newKey && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950">
          <p className="text-sm font-medium text-green-800 dark:text-green-300">
            Copy your API key now — it won&apos;t be shown again:
          </p>
          <code className="mt-1 block break-all rounded bg-green-100 p-2 text-sm dark:bg-green-900">
            {newKey}
          </code>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={keyName}
          onChange={e => setKeyName(e.target.value)}
          placeholder="Key name (optional)"
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <button
          onClick={handleCreate}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Create key
        </button>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-zinc-500">Loading...</p>
      ) : keys.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No API keys yet</p>
      ) : (
        <div className="mt-3 space-y-2">
          {keys.map(key => (
            <div key={key.id} className="flex items-center justify-between rounded border border-zinc-100 p-2 dark:border-zinc-800">
              <div>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{key.name}</span>
                <span className="ml-2 text-sm text-zinc-400">{key.key_prefix}</span>
              </div>
              <button
                onClick={() => handleDelete(key.id)}
                className="text-sm text-red-600 hover:underline dark:text-red-400"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
