-- OAuth clients registered via Dynamic Client Registration (DCR)
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
  code_hash text primary key,
  client_id text not null references public.oauth_clients(client_id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text default 'S256' not null,
  scope text default 'mcp:full',
  expires_at timestamptz not null,
  created_at timestamptz default now() not null
);

-- Access and refresh tokens
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

-- RLS (service role only — accessed via admin client)
alter table public.oauth_clients enable row level security;
alter table public.oauth_authorization_codes enable row level security;
alter table public.oauth_tokens enable row level security;
