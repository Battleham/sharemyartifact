import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ARTIFACT_URL = process.env.NEXT_PUBLIC_ARTIFACT_URL ?? 'https://smya.pub';

// GET /api/users/:username — get user profile + public artifacts
export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) => {
  const { username } = await params;
  const admin = createAdminClient();

  const { data: user } = await admin
    .from('users')
    .select('id, username, created_at')
    .eq('username', username)
    .single();

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { data: artifacts } = await admin
    .from('artifacts')
    .select('id, slug, title, view_count, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false });

  return NextResponse.json({
    user: { username: user.username, created_at: user.created_at },
    artifacts: (artifacts ?? []).map(a => ({
      ...a,
      url: `${ARTIFACT_URL}/${username}/${a.slug}.html`,
    })),
  });
};
