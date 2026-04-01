import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const ARTIFACT_HOSTS = ['smya.pub', 'www.smya.pub'];

export const middleware = async (request: NextRequest) => {
  const host = request.headers.get('host')?.split(':')[0] ?? '';

  // smya.pub → artifact serving
  if (ARTIFACT_HOSTS.includes(host)) {
    const { pathname } = request.nextUrl;

    // Allow well-known and OAuth paths through (for MCP OAuth discovery)
    if (pathname.startsWith('/.well-known/') || pathname.startsWith('/oauth/') || pathname.startsWith('/api/mcp')) {
      return updateSession(request);
    }

    // Rewrite /username/slug.html → /api/serve/[username]/[slug]
    const match = pathname.match(/^\/([a-z0-9][a-z0-9_-]+)\/([a-z0-9][a-z0-9_-]*(?:\.html)?)$/);
    if (match) {
      const [, username, rawSlug] = match;
      const slug = rawSlug.replace(/\.html$/, '');
      const url = request.nextUrl.clone();
      url.pathname = `/api/serve/${username}/${slug}`;
      return NextResponse.rewrite(url);
    }

    // Everything else on smya.pub → 404
    return new NextResponse('Not Found', { status: 404 });
  }

  // sharemyartifact.com → normal app with Supabase session refresh
  return updateSession(request);
};

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt).*)',
  ],
};
