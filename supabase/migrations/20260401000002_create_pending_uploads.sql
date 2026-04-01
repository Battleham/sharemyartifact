-- Pending uploads: tracks presigned upload URLs awaiting completion
create table if not exists pending_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  title text,
  slug text,
  visibility text not null default 'unlisted',
  password_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);

alter table pending_uploads enable row level security;

-- Index for lookup and cleanup
create index idx_pending_uploads_user on pending_uploads(user_id);
create index idx_pending_uploads_expires on pending_uploads(expires_at);
