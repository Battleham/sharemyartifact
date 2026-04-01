import { notFound } from 'next/navigation';

interface ProfileData {
  user: { username: string; created_at: string };
  artifacts: Array<{
    id: string;
    slug: string;
    title: string;
    view_count: number;
    created_at: string;
    url: string;
  }>;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  // Skip reserved routes
  const reserved = ['login', 'signup', 'dashboard', 'api', '_next'];
  if (reserved.includes(username)) notFound();

  const res = await fetch(`${APP_URL}/api/users/${username}`, {
    cache: 'no-store',
  });

  if (!res.ok) notFound();

  const data: ProfileData = await res.json();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {data.user.username}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Joined {new Date(data.user.created_at).toLocaleDateString()}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {data.artifacts.length === 0 ? (
          <p className="text-center text-zinc-500 dark:text-zinc-400">
            No public artifacts yet
          </p>
        ) : (
          <div className="space-y-3">
            {data.artifacts.map(artifact => (
              <a
                key={artifact.id}
                href={artifact.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                <h2 className="font-medium text-zinc-900 dark:text-zinc-100">
                  {artifact.title}
                </h2>
                <div className="mt-1 flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                  <span>{new Date(artifact.created_at).toLocaleDateString()}</span>
                  <span>{artifact.view_count} views</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
