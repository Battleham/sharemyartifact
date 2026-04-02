# Artifact TTL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable expiration (TTL) to artifacts — users pick how long an upload lives (10m to 365d, or indefinite), expired artifacts return 404, and a daily cron cleans up storage.

**Architecture:** A nullable `expires_at` column on `artifacts` (NULL = indefinite). Serve routes check expiration before serving (lazy enforcement). A daily Vercel cron job deletes expired rows + storage files. TTL is exposed on dashboard upload form, artifact cards, MCP tools, and REST API.

**Tech Stack:** Next.js API routes, Supabase Postgres + Storage, Vercel Cron, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-04-02-artifact-ttl-design.md`

---

### Task 1: TTL utility library + tests

**Files:**
- Create: `src/lib/ttl.ts`
- Create: `src/lib/__tests__/ttl.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/ttl.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseTtl, computeExpiresAt, formatTimeRemaining, TTL_OPTIONS } from '../ttl';

describe('TTL_OPTIONS', () => {
  it('contains all valid TTL values', () => {
    expect(TTL_OPTIONS).toEqual(['10m', '1h', '12h', '1d', '2d', '365d', 'indefinite']);
  });
});

describe('parseTtl', () => {
  it('parses 10m to 600000ms', () => {
    expect(parseTtl('10m')).toBe(10 * 60 * 1000);
  });

  it('parses 1h to 3600000ms', () => {
    expect(parseTtl('1h')).toBe(60 * 60 * 1000);
  });

  it('parses 12h to 43200000ms', () => {
    expect(parseTtl('12h')).toBe(12 * 60 * 60 * 1000);
  });

  it('parses 1d to 86400000ms', () => {
    expect(parseTtl('1d')).toBe(24 * 60 * 60 * 1000);
  });

  it('parses 2d to 172800000ms', () => {
    expect(parseTtl('2d')).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('parses 365d to 31536000000ms', () => {
    expect(parseTtl('365d')).toBe(365 * 24 * 60 * 60 * 1000);
  });

  it('returns null for indefinite', () => {
    expect(parseTtl('indefinite')).toBeNull();
  });

  it('throws on invalid value', () => {
    expect(() => parseTtl('5m')).toThrow('Invalid TTL');
    expect(() => parseTtl('forever')).toThrow('Invalid TTL');
    expect(() => parseTtl('')).toThrow('Invalid TTL');
  });
});

describe('computeExpiresAt', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns ISO string for valid TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    const result = computeExpiresAt('1d');
    expect(result).toBe('2026-04-03T12:00:00.000Z');
  });

  it('returns null for indefinite', () => {
    expect(computeExpiresAt('indefinite')).toBeNull();
  });

  it('computes 10m correctly', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    expect(computeExpiresAt('10m')).toBe('2026-04-02T12:10:00.000Z');
  });
});

describe('formatTimeRemaining', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "No expiration" for null', () => {
    expect(formatTimeRemaining(null)).toBe('No expiration');
  });

  it('returns "Expired" for past date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    expect(formatTimeRemaining('2026-04-02T11:00:00.000Z')).toBe('Expired');
  });

  it('returns minutes when under 1 hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    expect(formatTimeRemaining('2026-04-02T12:45:00.000Z')).toBe('Expires in 45m');
  });

  it('returns hours when under 1 day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    expect(formatTimeRemaining('2026-04-03T10:00:00.000Z')).toBe('Expires in 22h');
  });

  it('returns days when 1 day or more', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    expect(formatTimeRemaining('2026-04-05T12:00:00.000Z')).toBe('Expires in 3d');
  });

  it('shows 1m for very short remaining time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    expect(formatTimeRemaining('2026-04-02T12:00:30.000Z')).toBe('Expires in 1m');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/ttl.test.ts`
Expected: FAIL — module `../ttl` not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/ttl.ts`:

```typescript
export const TTL_OPTIONS = ['10m', '1h', '12h', '1d', '2d', '365d', 'indefinite'] as const;
export type TtlValue = typeof TTL_OPTIONS[number];

const TTL_MS: Record<string, number | null> = {
  '10m': 10 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '2d': 2 * 24 * 60 * 60 * 1000,
  '365d': 365 * 24 * 60 * 60 * 1000,
  'indefinite': null,
};

export const parseTtl = (ttl: string): number | null => {
  if (!(ttl in TTL_MS)) {
    throw new Error(`Invalid TTL: "${ttl}". Valid values: ${TTL_OPTIONS.join(', ')}`);
  }
  return TTL_MS[ttl];
};

export const computeExpiresAt = (ttl: string): string | null => {
  const ms = parseTtl(ttl);
  if (ms === null) return null;
  return new Date(Date.now() + ms).toISOString();
};

export const formatTimeRemaining = (expiresAt: string | null): string => {
  if (expiresAt === null) return 'No expiration';

  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';

  const minutes = Math.max(1, Math.floor(diff / (60 * 1000)));
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  if (days >= 1) return `Expires in ${days}d`;
  if (hours >= 1) return `Expires in ${hours}h`;
  return `Expires in ${minutes}m`;
};

export const TTL_LABELS: Record<TtlValue, string> = {
  '10m': '10 minutes',
  '1h': '1 hour',
  '12h': '12 hours',
  '1d': '1 day',
  '2d': '2 days',
  '365d': '365 days',
  'indefinite': 'Indefinite',
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/ttl.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ttl.ts src/lib/__tests__/ttl.test.ts
git commit -m "feat: add TTL utility library with parseTtl, computeExpiresAt, formatTimeRemaining"
```

---

### Task 2: Database migrations

**Files:**
- Create: `supabase/migrations/20260402000001_add_artifact_ttl.sql`
- Create: `supabase/migrations/20260402000002_add_pending_ttl.sql`

- [ ] **Step 1: Create the artifacts TTL migration**

Create `supabase/migrations/20260402000001_add_artifact_ttl.sql`:

```sql
-- Add expiration support to artifacts
-- NULL = indefinite (never expires), existing rows stay NULL
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Partial index for efficient cleanup queries (only index non-null values)
CREATE INDEX IF NOT EXISTS idx_artifacts_expires_at ON artifacts(expires_at) WHERE expires_at IS NOT NULL;
```

- [ ] **Step 2: Create the pending_uploads TTL migration**

Create `supabase/migrations/20260402000002_add_pending_ttl.sql`:

```sql
-- Store user's chosen TTL string so complete_upload can compute expires_at
ALTER TABLE pending_uploads ADD COLUMN IF NOT EXISTS ttl text;
```

- [ ] **Step 3: Push migrations to production**

Run: `npx supabase db push --linked`
Expected: Both migrations applied successfully

- [ ] **Step 4: Verify migrations applied**

Run: `npx supabase migration list --linked`
Expected: Both `20260402000001` and `20260402000002` show in the Remote column

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260402000001_add_artifact_ttl.sql supabase/migrations/20260402000002_add_pending_ttl.sql
git commit -m "feat: add expires_at column to artifacts, ttl column to pending_uploads"
```

---

### Task 3: Type updates

**Files:**
- Modify: `src/types/database.ts:9-22` (Artifact interface)
- Modify: `src/types/api.ts` (request + response types)

- [ ] **Step 1: Add `expires_at` to Artifact interface**

In `src/types/database.ts`, add after the `updated_at` line in the `Artifact` interface:

```typescript
  expires_at: string | null;
```

- [ ] **Step 2: Add `ttl` to request types and `expires_at` to response types**

In `src/types/api.ts`:

Add to `UploadArtifactRequest`:
```typescript
  ttl?: string;
```

Add to `UpdateArtifactRequest`:
```typescript
  ttl?: string;
```

Add to `ArtifactListItem`:
```typescript
  expires_at: string | null;
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors (existing code doesn't reference expires_at yet, and new fields are optional)

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts src/types/api.ts
git commit -m "feat: add TTL types — expires_at on Artifact, ttl on request types"
```

---

### Task 4: REST API — POST and GET with TTL

**Files:**
- Modify: `src/app/api/artifacts/route.ts`

- [ ] **Step 1: Update POST to accept TTL and compute expires_at**

At the top of `src/app/api/artifacts/route.ts`, add the import:

```typescript
import { computeExpiresAt } from '@/lib/ttl';
```

In the POST handler, after the password hashing block (after line 82) and before the insert, add:

```typescript
  const expiresAt = computeExpiresAt(body.ttl ?? '1d');
```

In the `.insert()` call, add `expires_at: expiresAt` to the object (after `file_size`):

```typescript
      expires_at: expiresAt,
```

- [ ] **Step 2: Update GET to return expires_at**

Change the select query from:
```typescript
    .select('id, slug, title, visibility, view_count, short_code, created_at, updated_at')
```
to:
```typescript
    .select('id, slug, title, visibility, view_count, short_code, expires_at, created_at, updated_at')
```

In the `.map()` callback, include `expires_at` in the response. Change:
```typescript
  const items = artifacts.map(({ short_code, ...a }) => ({
    ...a,
    url: `${ARTIFACT_URL}/${auth.user.username}/${a.slug}.html`,
    short_url: short_code ? `${ARTIFACT_URL}/${short_code}` : undefined,
  }));
```
to:
```typescript
  const items = artifacts.map(({ short_code, ...a }) => ({
    ...a,
    url: `${ARTIFACT_URL}/${auth.user.username}/${a.slug}.html`,
    short_url: short_code ? `${ARTIFACT_URL}/${short_code}` : undefined,
    expires_at: a.expires_at ?? null,
  }));
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/artifacts/route.ts
git commit -m "feat: POST /api/artifacts accepts ttl, GET returns expires_at"
```

---

### Task 5: REST API — PUT with TTL

**Files:**
- Modify: `src/app/api/artifacts/[slug]/route.ts`

- [ ] **Step 1: Add TTL support to the PUT handler**

At the top of `src/app/api/artifacts/[slug]/route.ts`, add:

```typescript
import { computeExpiresAt } from '@/lib/ttl';
```

In the PUT handler, after the password handling block (after line 125) and before the `.update()` call, add:

```typescript
  if (body.ttl !== undefined) {
    updates.expires_at = computeExpiresAt(body.ttl === 'indefinite' ? 'indefinite' : body.ttl ?? '1d');
  }
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/artifacts/[slug]/route.ts
git commit -m "feat: PUT /api/artifacts/:slug accepts ttl to change expiration"
```

---

### Task 6: Serve route expiration checks

**Files:**
- Modify: `src/app/api/serve/[username]/[slug]/route.ts`
- Modify: `src/app/api/serve/short/[code]/route.ts`

- [ ] **Step 1: Add expiration check to the full URL serve route**

In `src/app/api/serve/[username]/[slug]/route.ts`, in the GET handler, after the artifact lookup (after the `if (!artifact)` block at line 84), add:

```typescript
  // Check expiration
  if (artifact.expires_at && new Date(artifact.expires_at) < new Date()) {
    return new NextResponse('Not Found', { status: 404 });
  }
```

Also add the same check in the POST handler (password verification), after the artifact lookup (after the `if (!artifact)` block at line 124):

```typescript
  // Check expiration
  if (artifact.expires_at && new Date(artifact.expires_at) < new Date()) {
    return new NextResponse('Not Found', { status: 404 });
  }
```

- [ ] **Step 2: Add expiration check to the short URL serve route**

In `src/app/api/serve/short/[code]/route.ts`, after the `if (!artifact)` block (line 18), add:

```typescript
  // Check expiration
  if (artifact.expires_at && new Date(artifact.expires_at) < new Date()) {
    return new NextResponse('Not Found', { status: 404 });
  }
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/serve/[username]/[slug]/route.ts src/app/api/serve/short/[code]/route.ts
git commit -m "feat: serve routes return 404 for expired artifacts"
```

---

### Task 7: MCP tool schema + handler updates

**Files:**
- Modify: `src/lib/mcp-tools.ts`
- Modify: `src/app/api/mcp/route.ts`

- [ ] **Step 1: Add `ttl` to MCP tool schemas**

In `src/lib/mcp-tools.ts`, add the `ttl` property to the `inputSchema.properties` of these tools:

For `upload_artifact`, `upload_artifact_from_url`, `request_upload`, and `update_artifact`, add:

```typescript
        ttl: { type: 'string', enum: ['10m', '1h', '12h', '1d', '2d', '365d', 'indefinite'], description: 'How long the artifact stays live. Defaults to 1d.' },
```

Add it inside the `properties` object of each tool, after the last existing property.

- [ ] **Step 2: Add TTL import to MCP route**

At the top of `src/app/api/mcp/route.ts`, add:

```typescript
import { computeExpiresAt } from '@/lib/ttl';
```

- [ ] **Step 3: Update `uploadHtml` to accept and use TTL**

In `src/app/api/mcp/route.ts`, in the `uploadHtml` function, after the `shortCode` generation (line 238), add:

```typescript
  const expiresAt = computeExpiresAt((args.ttl as string) ?? '1d');
```

In the `.insert()` call (line 242-253), add `expires_at: expiresAt` after `short_code: shortCode`:

```typescript
      expires_at: expiresAt,
```

Also update the return message to include expiration info. Change the return statement to:

```typescript
  const expiresLabel = expiresAt ? `expires: ${expiresAt}` : 'no expiration';
  return { artifact, url, short_url: shortUrl, message: `Artifact uploaded! View at: ${url} (short: ${shortUrl}) (${expiresLabel})` };
```

- [ ] **Step 4: Update `request_upload` to store TTL in pending_uploads**

In the `request_upload` case (around line 341-351), add `ttl: (args.ttl as string) ?? '1d'` to the `.insert()` call:

```typescript
      const { error: pendingError } = await admin
        .from('pending_uploads')
        .insert({
          id: artifactId,
          user_id: userId,
          storage_path: storagePath,
          title,
          slug,
          visibility,
          password_hash: passwordHash,
          ttl: (args.ttl as string) ?? '1d',
        });
```

- [ ] **Step 5: Update `complete_upload` to compute expires_at from pending TTL**

In the `complete_upload` case, after the `shortCode` generation (line 421), add:

```typescript
      const expiresAt = computeExpiresAt(pending.ttl ?? '1d');
```

In the `.insert()` call (line 422-435), add `expires_at: expiresAt` after `short_code: shortCode`:

```typescript
          expires_at: expiresAt,
```

Update the return message similarly:

```typescript
      const expiresLabel = expiresAt ? `expires: ${expiresAt}` : 'no expiration';
      return {
        artifact,
        url,
        short_url: shortUrl,
        message: `Artifact uploaded! View at: ${url} (short: ${shortUrl}) (${expiresLabel})`,
      };
```

- [ ] **Step 6: Update `update_artifact` to accept TTL**

In the `update_artifact` case (around line 469-504), after the `if (args.new_slug)` block, add:

```typescript
      if (args.ttl !== undefined) {
        updates.expires_at = computeExpiresAt((args.ttl as string) === 'indefinite' ? 'indefinite' : (args.ttl as string) ?? '1d');
      }
```

- [ ] **Step 7: Update `list_artifacts` to include expires_at**

In the `list_artifacts` case (around line 455-466), update the select to include `expires_at`:

```typescript
        .select('slug, title, visibility, view_count, short_code, expires_at, created_at, updated_at')
```

And update the map to include it:

```typescript
      return (artifacts || []).map(a => ({
        ...a,
        url: `${ARTIFACT_URL}/${user.username}/${a.slug}.html`,
        short_url: a.short_code ? `${ARTIFACT_URL}/${a.short_code}` : undefined,
        expires_at: a.expires_at ?? null,
      }));
```

- [ ] **Step 8: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add src/lib/mcp-tools.ts src/app/api/mcp/route.ts
git commit -m "feat: MCP tools support ttl parameter for artifact expiration"
```

---

### Task 8: Cron cleanup route

**Files:**
- Create: `src/app/api/cron/cleanup-expired/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create the cron cleanup route**

Create `src/app/api/cron/cleanup-expired/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const GET = async (request: NextRequest) => {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Fetch expired artifacts (batch of 100)
  const { data: expired, error } = await admin
    .from('artifacts')
    .select('id, storage_path')
    .not('expires_at', 'is', null)
    .lt('expires_at', new Date().toISOString())
    .limit(100);

  if (error || !expired || expired.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  // Delete storage files
  const storagePaths = expired.map(a => a.storage_path);
  await admin.storage.from('artifacts').remove(storagePaths);

  // Delete DB rows
  const ids = expired.map(a => a.id);
  await admin
    .from('artifacts')
    .delete()
    .in('id', ids);

  // Also clean up any expired pending uploads while we're at it
  await admin
    .from('pending_uploads')
    .delete()
    .lt('expires_at', new Date().toISOString());

  return NextResponse.json({ deleted: expired.length });
};
```

- [ ] **Step 2: Add cron schedule to vercel.json**

Replace the contents of `vercel.json` with:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "crons": [
    {
      "path": "/api/cron/cleanup-expired",
      "schedule": "0 3 * * *"
    }
  ]
}
```

This runs at 3:00 AM UTC daily.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/cleanup-expired/route.ts vercel.json
git commit -m "feat: add daily cron job to clean up expired artifacts"
```

---

### Task 9: Dashboard UI — upload form TTL dropdown + artifact card expiration

**Files:**
- Modify: `src/components/DashboardPage.tsx`

- [ ] **Step 1: Add TTL import and dropdown to upload form**

At the top of `src/components/DashboardPage.tsx`, add:

```typescript
import { TTL_OPTIONS, TTL_LABELS, formatTimeRemaining } from '@/lib/ttl';
import type { TtlValue } from '@/lib/ttl';
```

In the `handleUpload` function, after getting `visibilitySelect`, add:

```typescript
    const ttlSelect = form.elements.namedItem('ttl') as HTMLSelectElement;
```

In the `body: JSON.stringify({...})` call, add `ttl: ttlSelect.value`:

```typescript
      body: JSON.stringify({
        html,
        visibility: visibilitySelect.value,
        ttl: ttlSelect.value,
      }),
```

In the upload form JSX, after the visibility `<div>` block and before the error display, add:

```tsx
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
```

- [ ] **Step 2: Add expiration display + TTL change to artifact card**

In the artifact card's metadata row (the `<div>` with `flex flex-wrap items-center gap-3`), after the view count `<span>`, add:

```tsx
                    <ExpirationBadge
                      expiresAt={artifact.expires_at}
                      slug={artifact.slug}
                      onUpdated={fetchArtifacts}
                    />
```

- [ ] **Step 3: Create the ExpirationBadge component**

Add this component before the `ApiKeysSection` function:

```tsx
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
      onClick={() => setEditing(true)}
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs transition-colors ${
        isExpired
          ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
          : expiresAt
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
      }`}
      title={expiresAt ? `Expires: ${new Date(expiresAt).toLocaleString()}` : 'No expiration — click to set'}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardPage.tsx
git commit -m "feat: dashboard TTL dropdown on upload + expiration badge on artifact cards"
```

---

### Task 10: Push migrations and deploy

- [ ] **Step 1: Push migrations to production Supabase**

Run: `npx supabase db push --linked`
Expected: Migrations applied (or already applied from Task 2)

- [ ] **Step 2: Push code to deploy**

Run: `git push`

- [ ] **Step 3: Verify deployment**

Check that the Vercel deployment succeeds and the cron job appears in the Vercel dashboard.

- [ ] **Step 4: Manual verification**

1. Open the dashboard, upload an artifact with "1 day" TTL — confirm `expires_at` is set
2. Upload with "Indefinite" — confirm `expires_at` is null
3. Click the expiration badge on a card, change TTL — confirm it updates
4. Set an artifact's `expires_at` to a past date in Supabase SQL editor, then visit the URL — confirm 404
5. Visit the short URL of the same expired artifact — confirm 404
