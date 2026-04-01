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
