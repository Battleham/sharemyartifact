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
