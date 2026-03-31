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
