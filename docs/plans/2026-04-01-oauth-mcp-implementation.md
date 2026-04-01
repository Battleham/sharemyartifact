# OAuth 2.1 + Streamable HTTP MCP Implementation Plan

> **Goal:** Make the ShareMyArtifact MCP server work as a Claude.ai Integration/Connection so users can connect directly from claude.ai.

**What we have:** A working MCP endpoint (`/api/mcp`) with bearer token (API key) auth, Supabase Auth for users.

**What we need:** OAuth 2.1 with Dynamic Client Registration (DCR), PKCE, Streamable HTTP transport with session management, and discovery endpoints.

**Approach:** Build OAuth 2.1 endpoints backed by Supabase Auth — users authenticate with their existing ShareMyArtifact account via a consent screen, then Claude.ai gets a bearer token.

---

## Architecture Overview

```
Claude.ai                          ShareMyArtifact (Vercel)
────────                          ──────────────────────────

1. User adds integration
   ↓
2. GET /.well-known/oauth-protected-resource
   ← returns authorization server URL
   ↓
3. GET /.well-known/oauth-authorization-server
   ← returns endpoints (authorize, token, register)
   ↓
4. POST /oauth/register  (DCR)
   ← returns client_id
   ↓
5. Redirect → /oauth/authorize?client_id=...&code_challenge=...
   → User sees consent screen → logs in via Supabase Auth
   → Redirect back to claude.ai/api/mcp/auth_callback?code=...
   ↓
6. POST /oauth/token  (exchange code for access_token)
   ← returns { access_token, refresh_token }
   ↓
7. POST /api/mcp  (with Authorization: Bearer <token>)
   ← MCP tools work normally
```

---

## Database Changes

### New migration: `20260401000001_create_oauth_tables.sql`

```sql
-- OAuth clients registered via DCR
create table public.oauth_clients (
  id uuid default gen_random_uuid() primary key,
  client_id text unique not null,
  client_name text not null,
  redirect_uris text[] not null,
  grant_types text[] default '{"authorization_code"}',
  token_endpoint_auth_method text default 'none',
  created_at timestamptz default now() not null
);

-- Authorization codes (short-lived, single-use)
create table public.oauth_authorization_codes (
  code text primary key,
  client_id text not null references public.oauth_clients(client_id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text default 'S256' not null,
  scope text default 'mcp:full',
  expires_at timestamptz not null,
  created_at timestamptz default now() not null
);

-- Access/refresh tokens
create table public.oauth_tokens (
  id uuid default gen_random_uuid() primary key,
  access_token_hash text unique not null,
  refresh_token_hash text unique,
  client_id text not null references public.oauth_clients(client_id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  scope text default 'mcp:full',
  expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  created_at timestamptz default now() not null
);

-- Indexes
create index oauth_codes_expires_idx on public.oauth_authorization_codes (expires_at);
create index oauth_tokens_expires_idx on public.oauth_tokens (expires_at);
create index oauth_tokens_refresh_idx on public.oauth_tokens (refresh_token_hash);

-- RLS (service role only — these are accessed via admin client)
alter table public.oauth_clients enable row level security;
alter table public.oauth_authorization_codes enable row level security;
alter table public.oauth_tokens enable row level security;
```

---

## Task Breakdown

### Task 1: Database Migration for OAuth Tables

**Files:**
- Create: `supabase/migrations/20260401000001_create_oauth_tables.sql`

Steps:
1. Create migration file with schema above
2. Commit

---

### Task 2: OAuth Utility Functions

**Files:**
- Create: `src/lib/oauth.ts`
- Create: `src/lib/__tests__/oauth.test.ts`

**What it does:** Crypto utilities for OAuth — generate codes, hash tokens, verify PKCE challenges.

```typescript
// src/lib/oauth.ts — key exports:
generateAuthorizationCode(): string    // crypto random, 48 chars
generateAccessToken(): string          // crypto random, 64 chars
generateRefreshToken(): string         // crypto random, 64 chars
hashToken(token: string): Promise<string>  // SHA-256
verifyPkceChallenge(verifier: string, challenge: string): Promise<boolean>  // S256
generateClientId(): string             // uuid
```

Steps:
1. Write tests for PKCE verification, token generation, hashing
2. Run tests → FAIL
3. Implement
4. Run tests → PASS
5. Commit

---

### Task 3: OAuth Discovery Endpoints

**Files:**
- Create: `src/app/.well-known/oauth-protected-resource/route.ts`
- Create: `src/app/.well-known/oauth-authorization-server/route.ts`

**What they return:**

`GET /.well-known/oauth-protected-resource`:
```json
{
  "resource": "https://sharemyartifact.com/api/mcp",
  "authorization_servers": ["https://sharemyartifact.com"],
  "scopes_supported": ["mcp:full"]
}
```

`GET /.well-known/oauth-authorization-server`:
```json
{
  "issuer": "https://sharemyartifact.com",
  "authorization_endpoint": "https://sharemyartifact.com/oauth/authorize",
  "token_endpoint": "https://sharemyartifact.com/oauth/token",
  "registration_endpoint": "https://sharemyartifact.com/oauth/register",
  "scopes_supported": ["mcp:full"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["none"],
  "code_challenge_methods_supported": ["S256"]
}
```

Steps:
1. Create both route handlers (simple JSON responses, use `NEXT_PUBLIC_APP_URL` env var)
2. Verify build passes
3. Commit

---

### Task 4: Dynamic Client Registration Endpoint

**Files:**
- Create: `src/app/oauth/register/route.ts`

**What it does:** Claude.ai POSTs its client info, we store it and return a `client_id`.

```
POST /oauth/register
Body: { client_name, redirect_uris, grant_types, ... }
Response: { client_id, client_name, redirect_uris, ... }
```

Validation:
- `redirect_uris` must include at least one valid HTTPS URI
- Allow Claude's callback URLs: `claude.ai/api/mcp/auth_callback` and `claude.com/api/mcp/auth_callback`
- `grant_types` must be `["authorization_code"]`
- Store in `oauth_clients` table

Steps:
1. Implement route handler
2. Verify build
3. Commit

---

### Task 5: Authorization Endpoint + Consent Page

**Files:**
- Create: `src/app/oauth/authorize/route.ts` (GET — validates params, redirects to consent page)
- Create: `src/app/oauth/authorize/page.tsx` (consent UI)
- Create: `src/components/OAuthConsentPage.tsx`

**Flow:**
1. Claude redirects user to `/oauth/authorize?client_id=X&redirect_uri=Y&code_challenge=Z&code_challenge_method=S256&response_type=code&scope=mcp:full&state=ABC`
2. Server validates params (client_id exists, redirect_uri matches, etc.)
3. If user not logged in → redirect to `/login?next=/oauth/authorize?...`
4. If user logged in → show consent screen: "Claude.ai wants to access your ShareMyArtifact account"
5. User clicks "Allow" → POST to authorize endpoint
6. Server generates authorization code, stores with PKCE challenge
7. Redirect to `redirect_uri?code=CODE&state=ABC`

Consent page shows:
- App name (from client registration)
- Requested permissions
- "Allow" / "Deny" buttons
- User's username (from session)

Steps:
1. Implement GET route handler (param validation)
2. Create consent page component
3. Implement POST handler (generate code, redirect)
4. Test login redirect flow works
5. Verify build
6. Commit

---

### Task 6: Token Endpoint

**Files:**
- Create: `src/app/oauth/token/route.ts`

**Handles two grant types:**

**`grant_type=authorization_code`:**
```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=CODE&code_verifier=VERIFIER&client_id=ID&redirect_uri=URI
```
- Validate authorization code exists and hasn't expired (10 min TTL)
- Verify PKCE: `SHA256(code_verifier) === stored code_challenge`
- Verify `client_id` and `redirect_uri` match stored values
- Delete used code (single-use)
- Generate access_token (1h) and refresh_token (30d)
- Hash and store tokens
- Return: `{ access_token, token_type: "Bearer", expires_in: 3600, refresh_token, scope }`

**`grant_type=refresh_token`:**
```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=TOKEN&client_id=ID
```
- Validate refresh token exists and hasn't expired
- Delete old tokens
- Generate new access_token + refresh_token (rotation)
- Return same format

Steps:
1. Implement token exchange logic
2. Implement refresh token logic
3. Parse `application/x-www-form-urlencoded` body (not JSON!)
4. Verify build
5. Commit

---

### Task 7: Update MCP Endpoint for OAuth Token Auth

**Files:**
- Modify: `src/app/api/mcp/route.ts`
- Modify: `src/lib/auth.ts`

**What changes:**
1. Add `getOAuthUser(request)` to `auth.ts` — extracts bearer token, looks up in `oauth_tokens`, returns user
2. Update MCP route to try OAuth token auth in addition to API key auth
3. Return proper `401` with `WWW-Authenticate` header when no valid auth:
   ```
   WWW-Authenticate: Bearer realm="https://sharemyartifact.com/api/mcp", resource_metadata="https://sharemyartifact.com/.well-known/oauth-protected-resource"
   ```
4. The `initialize` and `tools/list` methods should work without auth (Claude needs these to discover tools before authenticating)

Steps:
1. Add `getOAuthUser` to auth.ts
2. Update MCP route auth logic
3. Add WWW-Authenticate header on 401
4. Verify existing API key auth still works
5. Commit

---

### Task 8: Streamable HTTP Transport Upgrades

**Files:**
- Modify: `src/app/api/mcp/route.ts`

**What changes:**
1. **Session management**: Generate `Mcp-Session-Id` on initialization, return in header, validate on subsequent requests
2. **Accept header**: Check for `application/json, text/event-stream`
3. **DELETE handler**: Allow session termination via `DELETE /api/mcp` with `Mcp-Session-Id`
4. **Protocol version**: Update to `2025-06-18`
5. **Notifications handling**: Accept `notifications/initialized` (no response needed, return 202)

Session storage: Use `oauth_tokens` table or a lightweight in-memory approach (Vercel is stateless, so we'll validate session IDs as signed JWTs containing user ID — no server-side session store needed).

Steps:
1. Implement session ID generation (signed JWT with user context)
2. Add session validation to all non-initialize requests
3. Add DELETE handler
4. Update protocol version
5. Verify build
6. Commit

---

### Task 9: Update Middleware for OAuth Routes

**Files:**
- Modify: `src/middleware.ts`

**What changes:**
- Ensure `/oauth/*` and `/.well-known/*` routes are NOT rewritten for the artifact domain
- These routes should always be handled by the main app regardless of hostname
- The OAuth authorize flow needs Supabase session cookies, so ensure `updateSession` runs for `/oauth/*` routes

Steps:
1. Update middleware matcher/logic
2. Test that `smya.pub/.well-known/oauth-authorization-server` returns correctly (or redirects to main domain)
3. Commit

---

### Task 10: Token Cleanup & Security

**Files:**
- Create: `src/app/api/oauth/cleanup/route.ts` (optional cron endpoint)

**What it does:**
- Delete expired authorization codes (>10 min old)
- Delete expired access tokens
- Delete expired refresh tokens

Can be triggered by Vercel Cron or just run lazily on token endpoint requests.

Also:
- Add rate limiting to `/oauth/token` (prevent brute force)
- Ensure authorization codes are single-use (delete on consumption)

Steps:
1. Implement cleanup logic
2. Add to vercel.json as cron (daily) or run inline
3. Commit

---

### Task 11: End-to-End Testing & Verification

**Files:**
- Create: `src/test/e2e/oauth-flow.test.ts`

**Tests:**
1. Discovery endpoints return correct metadata
2. DCR creates client and returns client_id
3. Token endpoint rejects invalid code_verifier (PKCE)
4. Token endpoint exchanges valid code for tokens
5. Refresh token rotation works
6. MCP endpoint accepts OAuth bearer token
7. MCP endpoint returns 401 with WWW-Authenticate when no auth

Steps:
1. Write tests
2. Run all tests
3. Run build + lint
4. Commit

---

### Task 12: Deploy & Test with Claude.ai

Steps:
1. Push to main, deploy on Vercel
2. In Claude.ai → Settings → Integrations → Add custom integration
3. Enter MCP server URL: `https://sharemyartifact.com/api/mcp`
4. Claude.ai should auto-discover OAuth endpoints and redirect to consent screen
5. Sign in, approve, verify tools appear in Claude.ai
6. Test: "List my artifacts on ShareMyArtifact"

---

## Key Design Decisions

1. **DCR over CIMD**: Claude.ai currently uses DCR. CIMD is newer but DCR is more widely supported. We implement DCR now, can add CIMD later.

2. **Stateless sessions via signed JWT**: Vercel serverless functions can't share in-memory state. Session IDs are JWTs signed with `SUPABASE_SERVICE_ROLE_KEY`, containing user_id and expiry. No server-side session store.

3. **Supabase Auth for login**: The consent page uses existing Supabase Auth cookies. No separate OAuth user database — if you have a ShareMyArtifact account, you can authorize Claude.ai.

4. **Token lifetimes**: Access tokens 1 hour, refresh tokens 30 days. Matches Supabase Auth defaults.

5. **Scope model**: Single scope `mcp:full` for now. Can add granular scopes later if needed.

6. **Existing API key auth preserved**: Both API keys and OAuth tokens work for the MCP endpoint. API keys for Claude Desktop/Code, OAuth for Claude.ai.

---

## Files Summary

**New files (12):**
- `supabase/migrations/20260401000001_create_oauth_tables.sql`
- `src/lib/oauth.ts`
- `src/lib/__tests__/oauth.test.ts`
- `src/app/.well-known/oauth-protected-resource/route.ts`
- `src/app/.well-known/oauth-authorization-server/route.ts`
- `src/app/oauth/register/route.ts`
- `src/app/oauth/authorize/route.ts`
- `src/app/oauth/authorize/page.tsx`
- `src/components/OAuthConsentPage.tsx`
- `src/app/oauth/token/route.ts`
- `src/app/api/oauth/cleanup/route.ts`
- `src/test/e2e/oauth-flow.test.ts`

**Modified files (3):**
- `src/app/api/mcp/route.ts`
- `src/lib/auth.ts`
- `src/middleware.ts`
