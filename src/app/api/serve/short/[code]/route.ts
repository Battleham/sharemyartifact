import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) => {
  const { code } = await params;
  const admin = createAdminClient();

  // Look up artifact by short code
  const { data: artifact } = await admin
    .from('artifacts')
    .select('*')
    .eq('short_code', code)
    .single();

  if (!artifact) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // Check expiration
  if (artifact.expires_at && new Date(artifact.expires_at) < new Date()) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // Password-protected → redirect to full URL (which has the password gate)
  if (artifact.visibility === 'password_protected' && artifact.password_hash) {
    const { data: owner } = await admin
      .from('users')
      .select('username')
      .eq('id', artifact.user_id)
      .single();

    if (owner) {
      return NextResponse.redirect(
        `https://${_request.headers.get('host')}/${owner.username}/${artifact.slug}.html`,
        302
      );
    }
    return new NextResponse('Not Found', { status: 404 });
  }

  // Increment view count (fire and forget)
  admin
    .from('artifacts')
    .update({
      view_count: artifact.view_count + 1,
      last_accessed_at: new Date().toISOString(),
    })
    .eq('id', artifact.id)
    .then(() => {});

  // Fetch HTML from storage
  const { data, error } = await admin.storage
    .from('artifacts')
    .download(artifact.storage_path);

  if (error || !data) {
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  const html = await data.text();

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "frame-ancestors 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
