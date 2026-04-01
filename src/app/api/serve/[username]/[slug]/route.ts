import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyPassword } from '@/lib/auth';

const PASSWORD_GATE_HTML = (username: string, slug: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Password Required</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #0a0a0a; color: #ededed; }
    .container { max-width: 400px; width: 100%; padding: 2rem; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { color: #888; margin-bottom: 1.5rem; font-size: 0.875rem; }
    form { display: flex; flex-direction: column; gap: 0.75rem; }
    input { padding: 0.75rem; border: 1px solid #333; border-radius: 8px; background: #111; color: #ededed; font-size: 1rem; outline: none; }
    input:focus { border-color: #666; }
    button { padding: 0.75rem; border: none; border-radius: 8px; background: #ededed; color: #0a0a0a; font-size: 1rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #ccc; }
    .error { color: #f87171; font-size: 0.875rem; display: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>This artifact is password-protected</h1>
    <p>${username}/${slug}.html</p>
    <form id="form">
      <input type="password" name="password" placeholder="Enter password" required autofocus>
      <div class="error" id="error">Incorrect password. Try again.</div>
      <button type="submit">View Artifact</button>
    </form>
  </div>
  <script>
    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = e.target.password.value;
      const res = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        document.open();
        document.write(await res.text());
        document.close();
      } else {
        document.getElementById('error').style.display = 'block';
      }
    });
  </script>
</body>
</html>`;

// GET — serve artifact or password gate
export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<{ username: string; slug: string }> }
) => {
  const { username, slug } = await params;
  const admin = createAdminClient();

  // Look up user
  const { data: user } = await admin
    .from('users')
    .select('id')
    .eq('username', username)
    .single();

  if (!user) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // Look up artifact
  const { data: artifact } = await admin
    .from('artifacts')
    .select('*')
    .eq('user_id', user.id)
    .eq('slug', slug)
    .single();

  if (!artifact) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // Password-protected → show gate
  if (artifact.visibility === 'password_protected' && artifact.password_hash) {
    return new NextResponse(PASSWORD_GATE_HTML(username, slug), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Serve the HTML
  return serveArtifact(admin, artifact);
};

// POST — password verification
export const POST = async (
  request: NextRequest,
  { params }: { params: Promise<{ username: string; slug: string }> }
) => {
  const { username, slug } = await params;
  const admin = createAdminClient();

  const { data: user } = await admin
    .from('users')
    .select('id')
    .eq('username', username)
    .single();

  if (!user) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const { data: artifact } = await admin
    .from('artifacts')
    .select('*')
    .eq('user_id', user.id)
    .eq('slug', slug)
    .single();

  if (!artifact) {
    return new NextResponse('Not Found', { status: 404 });
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return new NextResponse('Bad Request', { status: 400 });
  }

  if (!body.password || !artifact.password_hash) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const valid = await verifyPassword(body.password, artifact.password_hash);
  if (!valid) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  return serveArtifact(admin, artifact);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const serveArtifact = async (admin: any, artifact: any) => {
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
      // Minimal CSP: only restrict navigation/popups, NOT network requests
      'Content-Security-Policy': "frame-ancestors 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
