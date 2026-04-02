# Artifact TTL (Time To Live) — Design Spec

## Context

Artifacts currently live forever. Users need control over how long their uploads persist — ephemeral dashboards for a quick share (10 minutes) vs. long-lived references (365 days). This feature adds expiration support across all upload surfaces (dashboard, MCP, REST API) with automatic cleanup of expired artifacts.

## Decisions

- **Default TTL:** 1 day (when not specified)
- **Indefinite representation:** `expires_at = NULL`
- **Expired artifact behavior:** 404 Not Found (no special messaging)
- **Enforcement:** Lazy check at serve time + daily cron cleanup
- **Mutable:** Users can change TTL on existing artifacts from the dashboard

## TTL Options

| Label | Value | `expires_at` |
|-------|-------|-------------|
| 10 minutes | `10m` | `now() + 10 min` |
| 1 hour | `1h` | `now() + 1 hour` |
| 12 hours | `12h` | `now() + 12 hours` |
| 1 day | `1d` | `now() + 1 day` |
| 2 days | `2d` | `now() + 2 days` |
| 365 days | `365d` | `now() + 365 days` |
| Indefinite | `indefinite` | `NULL` |

When changing TTL on an existing artifact, `expires_at` is recomputed from the current time.

## Database

### Migration: Add `expires_at` to `artifacts`

```sql
ALTER TABLE artifacts ADD COLUMN expires_at timestamptz;
CREATE INDEX idx_artifacts_expires_at ON artifacts(expires_at) WHERE expires_at IS NOT NULL;
```

- Nullable column; existing rows remain `NULL` (indefinite) — no backfill needed.
- Partial index on non-null values for efficient cron cleanup queries.

### Migration: Add `ttl` to `pending_uploads`

```sql
ALTER TABLE pending_uploads ADD COLUMN ttl text;
```

- Stores the TTL string (e.g., `1d`) chosen during `request_upload` so `complete_upload` can compute `expires_at` when creating the artifact.

## Shared Utility: `parseTtl`

**File:** `src/lib/ttl.ts`

A function that maps TTL string values to milliseconds:

```
parseTtl(ttl: string | undefined): number | null
```

- Input: one of `10m`, `1h`, `12h`, `1d`, `2d`, `365d`, `indefinite`
- Output: milliseconds (or `null` for `indefinite`)
- Throws on invalid input
- Does NOT handle defaults — callers apply `const ttl = userTtl ?? '1d'` before calling

A companion function to compute the `expires_at` timestamp:

```
computeExpiresAt(ttl: string | undefined): string | null
```

- Returns ISO string of `now + parseTtl(ttl)`, or `null` for indefinite.

A display helper for the frontend:

```
formatTimeRemaining(expiresAt: string | null): string
```

- `null` → `"No expiration"`
- Future date → `"Expires in 22h"`, `"Expires in 3d"`, `"Expires in 45m"`
- Past date → `"Expired"`
- Uses browser-local time (built-in `Date` handles UTC → local conversion)

### Valid TTL values constant

```
TTL_OPTIONS = ['10m', '1h', '12h', '1d', '2d', '365d', 'indefinite'] as const
```

Shared between frontend dropdown and backend validation.

## Serve Routes (Lazy Enforcement)

Both serve routes add the same check after fetching the artifact from DB:

**`src/app/api/serve/[username]/[slug]/route.ts`:**
**`src/app/api/serve/short/[code]/route.ts`:**

```
if (artifact.expires_at && new Date(artifact.expires_at) < new Date()) {
  return new NextResponse('Not Found', { status: 404 });
}
```

No view count increment or storage download for expired artifacts.

## Cron Cleanup

**Route:** `GET /api/cron/cleanup-expired`
**Schedule:** Once daily (3:00 AM UTC)
**Config:** `vercel.json` crons entry

Protected by `CRON_SECRET` (Vercel automatically sets and validates this for cron routes via the `Authorization: Bearer <CRON_SECRET>` header).

Logic:
1. Query: `SELECT id, storage_path FROM artifacts WHERE expires_at IS NOT NULL AND expires_at < now() LIMIT 100`
2. Delete storage files from Supabase Storage (batch)
3. Delete DB rows
4. If 100 rows were processed, there may be more — but the next daily run picks them up (lazy check blocks access in the meantime)
5. Return `{ deleted: count }`

## API Changes

### `POST /api/artifacts`

- Accept optional `ttl` field in request body
- Compute `expires_at` via `computeExpiresAt(ttl)` (defaults to `1d` if omitted)
- Insert `expires_at` into the artifacts row

### `PATCH /api/artifacts/[slug]`

- Accept optional `ttl` field
- Recompute `expires_at` from current time
- `ttl: 'indefinite'` sets `expires_at = NULL`

### `GET /api/artifacts`

- Include `expires_at` in the select query and response

## MCP Tool Changes

### `request_upload`

- Add optional `ttl` parameter: `"Optional TTL. Values: 10m, 1h, 12h, 1d, 2d, 365d, indefinite. Defaults to 1d."`
- Store chosen TTL string in `pending_uploads.ttl`

### `complete_upload`

- Read `pending_uploads.ttl`, compute `expires_at`, insert into artifact row
- No `ttl` parameter on this tool — it's set during `request_upload`

### `upload_artifact` (deprecated)

- Add optional `ttl` parameter (same as above)

### `upload_artifact_from_url`

- Add optional `ttl` parameter (same as above)

### `update_artifact`

- Add optional `ttl` parameter to allow changing TTL via MCP

### MCP tool definitions update

**File:** `src/lib/mcp-tools.ts`

Add `ttl` property to the `inputSchema.properties` of each relevant tool with description and enum of valid values.

## Type Changes

### `src/types/database.ts`

- Add `expires_at: string | null` to `Artifact` interface

### `src/types/api.ts`

- Add `ttl?: string` to `UploadArtifactRequest`
- Add `ttl?: string` to `UpdateArtifactRequest`
- Add `expires_at: string | null` to `ArtifactListItem`

## Dashboard UI Changes

### Upload form (`DashboardPage.tsx`)

- Add "Expires after" dropdown below visibility selector
- Options: 10 minutes, 1 hour, 12 hours, 1 day (default selected), 2 days, 365 days, Indefinite
- Sends `ttl` value in the POST body

### Artifact card (`DashboardPage.tsx`)

- Display expiration status next to the visibility badge:
  - "Expires in 22h" / "Expires in 3d" / "Expires in 45m" / "No expiration"
  - Tooltip with absolute local time via `toLocaleString()` for timezone-aware display
- TTL change dropdown on the card to update expiration (calls `PATCH /api/artifacts/[slug]`)
  - Recomputes from current time when a new duration is selected

## Files Modified

| File | Change |
|------|--------|
| `supabase/migrations/XXXXXXXXX_add_artifact_ttl.sql` | Add `expires_at` column + index |
| `supabase/migrations/XXXXXXXXX_add_pending_ttl.sql` | Add `ttl` column to `pending_uploads` |
| `src/lib/ttl.ts` | New: `parseTtl`, `computeExpiresAt`, `formatTimeRemaining`, `TTL_OPTIONS` |
| `src/types/database.ts` | Add `expires_at` to `Artifact` |
| `src/types/api.ts` | Add `ttl` to request types, `expires_at` to response types |
| `src/app/api/artifacts/route.ts` | POST: accept `ttl`, compute `expires_at`; GET: return `expires_at` |
| `src/app/api/artifacts/[slug]/route.ts` | PATCH: accept `ttl`, update `expires_at` |
| `src/app/api/serve/[username]/[slug]/route.ts` | Add expiration check |
| `src/app/api/serve/short/[code]/route.ts` | Add expiration check |
| `src/app/api/mcp/route.ts` | Add `ttl` handling to upload tools + `update_artifact` |
| `src/lib/mcp-tools.ts` | Add `ttl` parameter to tool schemas |
| `src/components/DashboardPage.tsx` | Upload form TTL dropdown + card expiration display + TTL change |
| `src/app/api/cron/cleanup-expired/route.ts` | New: cron cleanup handler |
| `vercel.json` | Add cron schedule |

## Verification

1. **Upload via dashboard** with different TTL values — confirm `expires_at` stored correctly in DB
2. **Upload via MCP** with `ttl` parameter — confirm same
3. **Visit expired artifact** (set TTL to `10m`, wait or manually set `expires_at` in past) — confirm 404 on both full URL and short URL
4. **Change TTL on existing artifact** from dashboard — confirm `expires_at` updates from current time
5. **Change TTL to indefinite** — confirm `expires_at` becomes NULL
6. **Cron cleanup** — manually hit `/api/cron/cleanup-expired` with correct auth, confirm expired artifacts + storage files are deleted
7. **Existing artifacts** — confirm they show "No expiration" (NULL `expires_at`)
8. **Timezone display** — check that expiration times render in the user's local timezone
