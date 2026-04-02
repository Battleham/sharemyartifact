# CLAUDE.md — ShareMyArtifact

## Section 1: Project Overview

**What:** A zero-friction platform for sharing AI-generated HTML dashboards. Upload HTML, get a link, recipients see it as a full web page.

**Who:** AI power users who build interactive single-file HTML dashboards and need to share them with others.

**Core flow:** User tells their AI "upload this to ShareMyArtifact" via MCP → gets back `smya.pub/username/dashboard.html` → recipient opens link and sees the dashboard running.

**Tech stack:**
- Next.js (React frontend + API routes)
- Supabase (auth, Postgres DB, file storage)
- Vercel (hosting, both domains)
- Two domains: `sharemyartifact.com` (app) + `smya.pub` (artifact serving)
- Remote MCP server (hosted on Vercel)

**Design doc:** `docs/plans/2026-03-31-sharemyartifact-design.md`

**Priority order when tradeoffs arise:**
1. User friction (less is always better)
2. Correctness
3. Simplicity
4. Performance
5. Developer experience

**Core constraints:**
- Upload must require ONLY the HTML file — no required metadata fields, ever
- Artifacts served on `smya.pub` must have unrestricted JavaScript and fetch — this is the core value prop
- Never restrict network requests via CSP (only restrict navigation/popups)
- Artifacts run as full pages, not in iframes

---

## Section 2: Coding Style

**Formatting:**
- TypeScript for all code
- Prefer `const` and arrow functions
- Use named exports, not default exports
- Semicolons, single quotes, 2-space indent
- Use Prettier defaults where not specified

**Naming:**
- Components: PascalCase (`ArtifactCard.tsx`)
- Utilities/hooks: camelCase (`useArtifact.ts`)
- API routes: kebab-case paths (`/api/artifacts`)
- Database columns: snake_case
- Environment variables: UPPER_SNAKE_CASE

**File/folder structure:**
```
src/
  app/              # Next.js app router pages
  components/       # React components
    ui/             # shadcn/ui primitives
  lib/              # Shared utilities, Supabase client, etc.
  hooks/            # Custom React hooks
  types/            # TypeScript types/interfaces
docs/
  plans/            # Design docs and implementation plans
```

**Component patterns:**
- One component per file
- Colocate component-specific types in the same file
- Extract hooks when logic is reused or complex
- Props interfaces named `{ComponentName}Props`

---

## Section 3: Mistakes to Avoid

- **Don't hallucinate APIs.** Check the installed version of a library before using its API. If unsure, look it up.
- **Don't over-engineer.** Try the simple solution first. If it works, ship it. Abstractions must justify themselves with a concrete second use case.
- **Don't add dependencies without flagging.** Always mention new packages before installing. Prefer what's already in the project.
- **Don't assume when requirements are ambiguous.** Ask. Especially around UX flows and edge cases.
- **Don't forget UI states.** Every async operation needs: loading, success, error, and empty states. No exceptions.
- **Don't restrict artifact JavaScript.** Never add CSP rules that block fetch, XHR, scripts, or network access on `smya.pub`. This is the #1 product requirement.
- **Don't add friction to uploads.** If you're tempted to add a required field to the upload flow, stop and find a way to make it automatic.
- **Don't prefix App Router route directories with `_`.** Next.js treats `_`-prefixed directories as private and won't generate routes for them. Use plain names (e.g., `short/[code]` not `_short/[code]`).
- **Don't forget to push DB migrations.** When adding Supabase migrations, always run `npx supabase db push --linked` to apply them to production before deploying.

---

## Section 4: Best Practices

- **Simple first.** Three lines of duplicated code is better than a premature abstraction. Build the simple thing, then refactor when a pattern emerges.
- **Show reasoning on non-trivial decisions.** A sentence or two before code explaining the approach. Not an essay — just enough to follow the logic.
- **Propose alternatives on meaningful tradeoffs.** When there are multiple valid approaches, briefly present options with your recommendation and why.
- **Flag risks before implementing.** If something might break existing behavior, mention it before writing the code.
- **Validate at boundaries.** Trust internal code. Validate user input, API responses, and file uploads. Don't defensive-code against impossible states.
- **TDD where practical.** Write the test first, watch it fail, implement, watch it pass. Especially for API routes and business logic.

---

## Section 5: Iteration Protocol

- **Critique before finalizing.** Before presenting a plan or architecture, briefly consider what could go wrong or what you might be missing.
- **Ship v1 minimal, then improve.** Don't gold-plate the first pass. Get it working, then refine. YAGNI applies aggressively.
- **Highlight tradeoffs explicitly.** When making a decision, state what you're giving up and why it's worth it.
- **Never implement a breaking change without warning.** If a change affects existing functionality, API contracts, or database schema, flag it before doing it.
- **Frequent commits.** Small, focused commits with clear messages. Don't batch unrelated changes.

---

## Section 6: Feature Queue (`feature_que.md`)

This file tracks feature ideas and their prioritization. It has two sections:

- **Queue** — The prioritized table of features we're actively planning or building. Only update this section when the user explicitly discusses the feature queue (e.g., "let's look at the queue", "prioritize features", "update the queue").
- **All Pending Features** — A dumping ground for ideas. When the user says "record an idea" or "add a feature idea", add it here using the format `- **Feature name** — short description`. Don't touch the Queue table.

**Rules:**
- Never move items into the Queue table unless the user asks to discuss/update the queue.
- When updating the Queue table, use the columns: `#` (position), `Feature`, `Status`, `Date Added`, `Date Completed`.
- Valid statuses: `Planned`, `In Progress`, `Done`, `On Hold`.
- Set `Date Added` when an item enters the queue. Set `Date Completed` when status becomes `Done`.

---

## Section 7: Frontend Skills — When to Use What

### Design & Aesthetics
- **`frontend-design`** — Use for any new UI component, page, or layout. Forces an aesthetic direction before writing code. Invoke before touching markup.

### Component Architecture
- **`shadcn`** — Use when adding or composing UI components. Check `npx shadcn@latest search` before writing custom UI — the component probably exists.

### Planning & Process
- **`brainstorming`** — Run before any creative or feature work. Explores intent and requirements through dialogue before touching code.
- **`writing-plans`** — Use after brainstorming to create bite-sized implementation plans with TDD steps.
- **`test-driven-development`** — Use when implementing features or bugfixes. Write failing test → implement → pass → commit.
- **`systematic-debugging`** — Use when encountering bugs or unexpected behavior. Diagnose before guessing at fixes.

### Review & Quality
- **`verification-before-completion`** — Run before claiming work is done. Evidence before assertions.
- **`requesting-code-review`** — Use after completing features or before merging.
