# ShareMyArtifact — Design Document

**Date:** 2026-03-31

## Problem

AI users create interactive HTML dashboards (often single-file) but struggle to share them. Common pain points: API access requires HTTPS, JavaScript issues on mobile, data loading failures, and no simple way to send a working link to someone.

## Solution

A platform where users upload an HTML artifact and get a shareable link. The artifact runs as a full web page — no iframe, no wrapper. Visitors open the link and see the dashboard running directly in their browser.

The primary upload path is through an MCP server: users tell their AI chatbot "upload this to ShareMyArtifact" and get a link back. Zero friction.

## URL Structure

- **Main app:** `sharemyartifact.com` — auth, upload, manage, user profiles
- **Artifacts:** `smya.pub/username/artifact-name.html` — raw HTML served as a full page
- **User profiles:** `sharemyartifact.com/username/` — public listing of user's artifacts

Two domains for origin isolation: artifacts run on `smya.pub` so they can't access `sharemyartifact.com` auth cookies. Artifacts have full JavaScript/fetch capabilities — unrestricted by design, since enabling API calls is a core value prop.

## Tech Stack

- **Framework:** Next.js (React frontend + API routes)
- **Auth & Database:** Supabase (email/password + OAuth via GitHub/Google)
- **File Storage:** Supabase Storage
- **Hosting:** Vercel (both domains point to same project)
- **MCP Server:** Remote, hosted on Vercel

## Core Features (MVP)

### 1. Zero-Friction Upload

- Only the HTML file is required. Nothing else.
- Title extracted automatically: `<title>` tag → first `<h1>` → filename → timestamp slug
- URL slug auto-generated from extracted title
- Defaults: unlisted visibility, no password

### 2. Artifact Serving

- `smya.pub/username/artifact-name.html` serves the HTML as a full page
- Full JavaScript execution, unrestricted `fetch`, HTTPS
- Password-protected artifacts show a password gate page before serving content
- Minimal CSP: only restrict navigation/popups, not network requests

### 3. Visibility Modes

- **Public** — listed on user's profile page, accessible via direct link
- **Unlisted** — not listed anywhere, accessible only via direct link
- **Password-protected** — requires password entry before viewing

### 4. User Accounts

- Supabase Auth: email/password + OAuth (GitHub, Google)
- Username selected at signup (must be unique, URL-safe)
- Username becomes part of artifact URLs

### 5. User Profile Pages

- `sharemyartifact.com/username/` — lists user's **public** artifacts only
- Searchable/filterable list with titles and dates
- Unlisted and password-protected artifacts hidden from listing

### 6. Artifact Management (Web UI)

- Edit metadata: rename, change visibility, add/remove password
- Delete artifacts
- Replace/update HTML (same URL, new content)
- View analytics: view count, last accessed

### 7. MCP Server (Remote)

- Hosted on Vercel as a remote MCP endpoint
- Users authenticate with an API key generated from account settings
- **MCP Tools:**
  - `upload` — upload HTML, returns link
  - `list` — list user's artifacts
  - `update` — replace HTML or update metadata
  - `delete` — remove an artifact
- Version-aware: on upload, if slug matches existing artifact, the AI skill instructs the AI to ask the user whether to replace or create new
- AI skill document tells the AI how to use the MCP tools and what questions to ask

### 8. Basic Content Scanning

- Scan uploads for known malware/phishing patterns, crypto miner signatures
- Block flagged uploads with an explanation
- File size limit (5MB)
- Rate limiting on uploads
- "Report" button on artifacts for community policing
- This is content moderation, not security — the separate domain handles origin isolation

## Architecture

### Routing (Vercel + Next.js Middleware)

Next.js middleware inspects the `Host` header:
- `sharemyartifact.com` → Next.js app (React pages + API routes)
- `smya.pub` → artifact serving logic

### API Routes

```
POST   /api/artifacts          — upload artifact
GET    /api/artifacts          — list user's artifacts
GET    /api/artifacts/:slug    — get artifact metadata
PUT    /api/artifacts/:slug    — update artifact (metadata or HTML)
DELETE /api/artifacts/:slug    — delete artifact
POST   /api/auth/api-keys      — generate API key for MCP
GET    /api/users/:username    — get user profile + public artifacts
```

### Artifact Serving (smya.pub)

```
GET /username/artifact-name.html
```

1. Look up artifact by username + slug
2. If password-protected → serve password gate page
3. POST password → validate → serve HTML or reject
4. If public/unlisted → serve HTML directly
5. Increment view count

### Database Schema (Supabase)

**users** (extends Supabase auth.users)
- id (FK to auth.users)
- username (unique, URL-safe)
- created_at

**artifacts**
- id (uuid)
- user_id (FK to users)
- slug (unique per user)
- title
- visibility (public | unlisted | password_protected)
- password_hash (nullable)
- storage_path (path in Supabase Storage)
- file_size
- view_count
- last_accessed_at
- created_at
- updated_at

**api_keys**
- id (uuid)
- user_id (FK to users)
- key_hash
- name (user-given label)
- created_at
- last_used_at

### Storage (Supabase Storage)

```
artifacts/
  {user_id}/
    {artifact_id}.html
```

## Future Considerations (Not MVP)

- Global discovery/gallery of public artifacts
- Iframe embed mode
- Auto-generated thumbnails/previews
- AI-powered content scanning
- Collections/folders
- Likes, comments, social features
- Custom domains for users
- Artifact versioning/history
- Collaborative editing
