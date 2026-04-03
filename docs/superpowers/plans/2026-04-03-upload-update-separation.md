# Upload/Update Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent AI clients from accidentally overwriting artifacts by separating "create new" and "update existing" into distinct MCP tools with clear intent boundaries.

**Architecture:** Remove `existing_slug` from `request_upload` so it only creates new artifacts. Add slug auto-disambiguation when collisions occur (append `-2`, `-3`, etc.). Create a new `request_content_update` tool that handles explicit updates. Add collision hints to new upload responses when similar artifacts exist. Tool descriptions are written to guide AI clients toward correct behavior, but the server architecture itself prevents accidental overwrites.

**Tech Stack:** Next.js API routes, Supabase Postgres + Storage, Vitest for tests.

---

### Task 1: Slug disambiguation utility + tests

**Files:**
- Modify: `src/lib/slugify.ts`
- Modify: `src/lib/__tests__/slugify.test.ts`

Add a `disambiguateSlug` function that takes a base slug and a check function, and returns the first available slug by appending `-2`, `-3`, etc.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/__tests__/slugify.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { slugify, generateTimestampSlug, disambiguateSlug } from '../slugify';

// ... existing tests stay unchanged ...

describe('disambiguateSlug', () => {
  it('returns the base slug when no conflict exists', async () => {
    const check = async (_slug: string) => false; // no conflicts
    const result = await disambiguateSlug('my-dashboard', check);
    expect(result).toBe('my-dashboard');
  });

  it('appends -2 when base slug is taken', async () => {
    const taken = new Set(['my-dashboard']);
    const check = async (slug: string) => taken.has(slug);
    const result = await disambiguateSlug('my-dashboard', check);
    expect(result).toBe('my-dashboard-2');
  });

  it('increments until finding an available slug', async () => {
    const taken = new Set(['report', 'report-2', 'report-3']);
    const check = async (slug: string) => taken.has(slug);
    const result = await disambiguateSlug('report', check);
    expect(result).toBe('report-4');
  });

  it('gives up after 100 attempts and falls back to timestamp slug', async () => {
    const check = async (_slug: string) => true; // everything taken
    const result = await disambiguateSlug('popular', check);
    expect(result).toMatch(/^artifact-\d+$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/slugify.test.ts`
Expected: FAIL — `disambiguateSlug` is not exported from `../slugify`

- [ ] **Step 3: Implement disambiguateSlug**

Add to `src/lib/slugify.ts`:

```typescript
export const disambiguateSlug = async (
  baseSlug: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> => {
  if (!(await exists(baseSlug))) return baseSlug;

  for (let i = 2; i <= 100; i++) {
    const candidate = `${baseSlug}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }

  return generateTimestampSlug();
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/slugify.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/slugify.ts src/lib/__tests__/slugify.test.ts
git commit -m "feat: add disambiguateSlug utility for collision-safe slug generation"
```

---

### Task 2: Update MCP tool definitions

**Files:**
- Modify: `src/lib/mcp-tools.ts`

Split the tools: `request_upload` loses `existing_slug`, new `request_content_update` tool is added.

- [ ] **Step 1: Remove `existing_slug` from `request_upload` and update its description**

In `src/lib/mcp-tools.ts`, replace the `request_upload` tool definition:

```typescript
{
  name: 'request_upload',
  description: 'Upload a NEW HTML artifact to ShareMyArtifact. This always creates a new artifact — it never overwrites existing ones. If a slug collision occurs, the slug is automatically disambiguated. To update the content of an existing artifact, use request_content_update instead. Steps: (1) call request_upload to get a presigned URL, (2) upload the file directly to that URL using curl or code execution, (3) call complete_upload with the upload_id to finalize. The presigned URL is valid for 2 hours and accepts PUT requests with the raw HTML file body. Example curl: curl -X PUT "<upload_url>" -H "Content-Type: text/html" --data-binary @file.html',
  inputSchema: {
    type: 'object' as const,
    properties: {
      filename: { type: 'string', description: 'Original filename (used for title extraction if no title given). Defaults to "artifact.html".' },
      title: { type: 'string', description: 'Optional title for the artifact' },
      slug: { type: 'string', description: 'Optional URL slug (auto-generated from title if not provided). Auto-disambiguated if taken.' },
      visibility: { type: 'string', enum: ['public', 'unlisted', 'password_protected'], description: 'Visibility setting (defaults to unlisted)' },
      password: { type: 'string', description: 'Optional password to protect the artifact' },
      ttl: { type: 'string', enum: ['10m', '1h', '12h', '1d', '2d', '365d', 'indefinite'], description: 'How long the artifact stays live. Defaults to 1d.' },
    },
  },
},
```

- [ ] **Step 2: Add the `request_content_update` tool definition**

Add after `request_upload` in the `MCP_TOOLS` array:

```typescript
{
  name: 'request_content_update',
  description: 'Replace the HTML content of an EXISTING artifact. ONLY use this when the user has explicitly asked to update or replace a specific existing artifact. If the user says something generic like "upload this" or "send this to ShareMyArtifact", use request_upload instead — that creates a new artifact and never overwrites. Steps: (1) call request_content_update with the slug, (2) upload the new HTML to the presigned URL, (3) call complete_upload with the upload_id to finalize.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      slug: { type: 'string', description: 'The slug of the existing artifact to update. Required.' },
      title: { type: 'string', description: 'Optional new title (keeps existing title if not provided)' },
      ttl: { type: 'string', enum: ['10m', '1h', '12h', '1d', '2d', '365d', 'indefinite'], description: 'Optional new TTL. Keeps existing expiration if not provided.' },
    },
    required: ['slug'],
  },
},
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/mcp-tools.ts
git commit -m "feat: split upload/update into separate MCP tools to prevent accidental overwrites"
```

---

### Task 3: Implement `request_upload` changes (create-only with disambiguation + collision hints)

**Files:**
- Modify: `src/app/api/mcp/route.ts`

Remove the `existing_slug` code path from `request_upload`. Add slug disambiguation. Add collision hints when similar artifacts exist.

- [ ] **Step 1: Rewrite the `request_upload` case**

In `src/app/api/mcp/route.ts`, replace the entire `case 'request_upload'` block with:

```typescript
case 'request_upload': {
  const title = (args.title as string) || (args.filename as string)?.replace(/\.html?$/i, '') || 'Untitled Artifact';
  let baseSlug = args.slug ? slugify(args.slug as string) : slugify(title);
  if (!baseSlug) baseSlug = generateTimestampSlug();

  // Check for similar existing artifacts (for collision hints)
  const { data: similarArtifacts } = await admin
    .from('artifacts')
    .select('slug, title, created_at, view_count')
    .eq('user_id', userId)
    .ilike('slug', `${baseSlug}%`)
    .limit(5);

  // Auto-disambiguate slug
  const slugExists = async (candidate: string): Promise<boolean> => {
    const { data } = await admin
      .from('artifacts')
      .select('id')
      .eq('user_id', userId)
      .eq('slug', candidate)
      .single();
    return !!data;
  };

  const slug = await disambiguateSlug(baseSlug, slugExists);

  const artifactId = crypto.randomUUID();
  const storagePath = `${userId}/${artifactId}.html`;

  // Create presigned upload URL
  const { data: signedData, error: signError } = await admin.storage
    .from('artifacts')
    .createSignedUploadUrl(storagePath);

  if (signError || !signedData) {
    throw new Error(`Failed to create upload URL: ${signError?.message ?? 'unknown error'}`);
  }

  // Hash password if needed
  let passwordHash: string | null = null;
  const visibility = (args.visibility as string) || (args.password ? 'password_protected' : 'unlisted');
  if (args.password && visibility === 'password_protected') {
    passwordHash = await hashPassword(args.password as string);
  }

  // Store pending upload metadata
  const { error: pendingError } = await admin
    .from('pending_uploads')
    .insert({
      id: artifactId,
      user_id: userId,
      storage_path: storagePath,
      title: title || 'Untitled Artifact',
      slug,
      visibility,
      password_hash: passwordHash,
      ttl: (args.ttl as string) ?? '1d',
      is_update: false,
    });

  if (pendingError) {
    throw new Error(`Failed to create pending upload: ${pendingError.message}`);
  }

  // Build collision hint if similar artifacts exist
  const collisionHint = (similarArtifacts && similarArtifacts.length > 0)
    ? {
        note: `You have existing artifact(s) with similar slugs. If the user intended to update one of these instead of creating a new artifact, cancel this upload and use request_content_update with the appropriate slug.`,
        similar_artifacts: similarArtifacts.map(a => ({
          slug: a.slug,
          title: a.title,
          created_at: a.created_at,
          view_count: a.view_count,
        })),
      }
    : undefined;

  return {
    upload_id: artifactId,
    upload_url: signedData.signedUrl,
    storage_path: storagePath,
    slug,
    mode: 'new',
    expires_in: '2 hours',
    instructions: `Upload your HTML file to the upload_url using: curl -X PUT "${signedData.signedUrl}" -H "Content-Type: text/html" --data-binary @yourfile.html — then call complete_upload with upload_id "${artifactId}"`,
    ...collisionHint,
  };
}
```

- [ ] **Step 2: Add the `disambiguateSlug` import**

At the top of `src/app/api/mcp/route.ts`, update the slugify import:

```typescript
import { slugify, generateTimestampSlug, disambiguateSlug } from '@/lib/slugify';
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mcp/route.ts
git commit -m "refactor: request_upload now always creates new artifacts with slug disambiguation"
```

---

### Task 4: Implement `request_content_update` handler

**Files:**
- Modify: `src/app/api/mcp/route.ts`

Add the new handler for explicit content updates.

- [ ] **Step 1: Add the `request_content_update` case**

In `src/app/api/mcp/route.ts`, add a new case in the `handleToolCall` switch, before the `complete_upload` case:

```typescript
case 'request_content_update': {
  const slug = args.slug as string;
  if (!slug) throw new Error('slug is required');

  const { data: existing } = await admin
    .from('artifacts')
    .select('id, storage_path, slug, title')
    .eq('user_id', userId)
    .eq('slug', slug)
    .single();

  if (!existing) throw new Error(`Artifact "${slug}" not found. Cannot update.`);

  // Create presigned upload URL (upsert to replace existing file)
  const { data: signedData, error: signError } = await admin.storage
    .from('artifacts')
    .createSignedUploadUrl(existing.storage_path, { upsert: true });

  if (signError || !signedData) {
    throw new Error(`Failed to create upload URL: ${signError?.message ?? 'unknown error'}`);
  }

  // Store pending upload metadata
  const { error: pendingError } = await admin
    .from('pending_uploads')
    .insert({
      id: existing.id,
      user_id: userId,
      storage_path: existing.storage_path,
      title: (args.title as string) || existing.title,
      slug: existing.slug,
      visibility: 'unlisted', // not changed during content update
      password_hash: null,
      ttl: (args.ttl as string) ?? null,
      is_update: true,
    });

  if (pendingError) {
    throw new Error(`Failed to create pending upload: ${pendingError.message}`);
  }

  return {
    upload_id: existing.id,
    upload_url: signedData.signedUrl,
    storage_path: existing.storage_path,
    slug: existing.slug,
    mode: 'update',
    existing_title: existing.title,
    expires_in: '2 hours',
    instructions: `Upload the new HTML file to the upload_url using: curl -X PUT "${signedData.signedUrl}" -H "Content-Type: text/html" --data-binary @yourfile.html — then call complete_upload with upload_id "${existing.id}"`,
  };
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mcp/route.ts
git commit -m "feat: add request_content_update handler for explicit artifact updates"
```

---

### Task 5: Update `complete_upload` to handle TTL on updates

**Files:**
- Modify: `src/app/api/mcp/route.ts`

The `complete_upload` handler's update path needs to respect the optional `ttl` passed through `request_content_update`.

- [ ] **Step 1: Update the `is_update` branch in `complete_upload`**

In the `case 'complete_upload'` block, find the `if (pending.is_update)` section and replace it with:

```typescript
if (pending.is_update) {
  // Update existing artifact's metadata
  const updates: Record<string, unknown> = {
    file_size: fileSize,
    updated_at: new Date().toISOString(),
  };
  if (finalTitle && finalTitle !== 'Untitled Artifact') updates.title = finalTitle;
  if (pending.ttl) updates.expires_at = computeExpiresAt(pending.ttl);

  const { data: artifact, error: dbError } = await admin
    .from('artifacts')
    .update(updates)
    .eq('id', uploadId)
    .eq('user_id', userId)
    .select('*, short_code')
    .single();

  if (dbError) {
    throw new Error(`Database error: ${dbError.message}`);
  }

  // Clean up pending record
  await admin.from('pending_uploads').delete().eq('id', uploadId);

  const url = `${ARTIFACT_URL}/${user.username}/${pending.slug}.html`;
  const shortUrl = artifact.short_code ? `${ARTIFACT_URL}/${artifact.short_code}` : undefined;
  return {
    artifact,
    url,
    short_url: shortUrl,
    message: `Artifact content updated! View at: ${url}`,
  };
}
```

(This is nearly identical to the existing code — the only addition is the `if (pending.ttl)` line that applies TTL when provided.)

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mcp/route.ts
git commit -m "fix: complete_upload respects TTL on content updates"
```

---

### Task 6: Update `upload_artifact_from_url` to use disambiguation

**Files:**
- Modify: `src/app/api/mcp/route.ts`

The `upload_artifact_from_url` tool delegates to `uploadHtml`, which currently throws on slug collision. Update `uploadHtml` to auto-disambiguate instead.

- [ ] **Step 1: Update `uploadHtml` to use `disambiguateSlug`**

Replace the slug collision check in the `uploadHtml` function (the block starting with `const { data: existing } = await admin`) with:

```typescript
const slugExists = async (candidate: string): Promise<boolean> => {
  const { data } = await admin
    .from('artifacts')
    .select('id')
    .eq('user_id', userId)
    .eq('slug', candidate)
    .single();
  return !!data;
};

slug = await disambiguateSlug(slug, slugExists);
```

This replaces the old behavior (throw error on collision) with auto-disambiguation (append `-2`, `-3`, etc.).

- [ ] **Step 2: Run existing tests to verify nothing breaks**

Run: `npx vitest run`
Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mcp/route.ts
git commit -m "refactor: uploadHtml uses slug disambiguation instead of throwing on collision"
```

---

### Task 7: Integration tests

**Files:**
- Create: `src/test/e2e/upload-update-separation.test.ts`

Test the tool definition changes and slug disambiguation behavior at the integration level.

- [ ] **Step 1: Write the integration tests**

Create `src/test/e2e/upload-update-separation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MCP_TOOLS } from '@/lib/mcp-tools';
import { disambiguateSlug } from '@/lib/slugify';

describe('Upload/Update tool separation', () => {
  describe('MCP tool definitions', () => {
    it('request_upload does not have existing_slug parameter', () => {
      const tool = MCP_TOOLS.find(t => t.name === 'request_upload');
      expect(tool).toBeDefined();
      const props = tool!.inputSchema.properties as Record<string, unknown>;
      expect(props).not.toHaveProperty('existing_slug');
    });

    it('request_upload description says it always creates new artifacts', () => {
      const tool = MCP_TOOLS.find(t => t.name === 'request_upload');
      expect(tool!.description).toContain('always creates a new artifact');
      expect(tool!.description).toContain('never overwrites');
    });

    it('request_content_update exists with required slug', () => {
      const tool = MCP_TOOLS.find(t => t.name === 'request_content_update');
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('slug');
    });

    it('request_content_update description emphasizes explicit user intent', () => {
      const tool = MCP_TOOLS.find(t => t.name === 'request_content_update');
      expect(tool!.description).toContain('ONLY use this when the user has explicitly asked');
    });

    it('request_content_update does not accept visibility or password', () => {
      const tool = MCP_TOOLS.find(t => t.name === 'request_content_update');
      const props = tool!.inputSchema.properties as Record<string, unknown>;
      expect(props).not.toHaveProperty('visibility');
      expect(props).not.toHaveProperty('password');
    });
  });

  describe('Slug disambiguation in upload flow', () => {
    it('creates unique slugs when base slug is taken', async () => {
      const existingSlugs = new Set(['my-dashboard']);
      const check = async (slug: string) => existingSlugs.has(slug);
      const slug = await disambiguateSlug('my-dashboard', check);
      expect(slug).toBe('my-dashboard-2');
    });

    it('uses base slug when no conflict', async () => {
      const check = async (_slug: string) => false;
      const slug = await disambiguateSlug('my-dashboard', check);
      expect(slug).toBe('my-dashboard');
    });
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/test/e2e/upload-update-separation.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/test/e2e/upload-update-separation.test.ts
git commit -m "test: add integration tests for upload/update tool separation"
```

---

### Task 8: Update feature queue

**Files:**
- Modify: `feature_que.md`

- [ ] **Step 1: Mark the feature as Done in the queue**

Update `feature_que.md`: move "Artifact update enforcement rules" from All Pending Features into the Queue table with status `Done` and today's date.

- [ ] **Step 2: Commit**

```bash
git add feature_que.md
git commit -m "docs: mark artifact update enforcement as done"
```
