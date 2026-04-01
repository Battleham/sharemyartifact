'use client';

import dynamic from 'next/dynamic';

const DashboardPage = dynamic(() => import('@/components/DashboardPage').then(m => ({ default: m.DashboardPage })), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <p className="text-sm text-zinc-500">Loading...</p>
    </div>
  ),
});

export default function Page() {
  return <DashboardPage />;
}
