-- Track whether a pending upload is updating an existing artifact
alter table pending_uploads add column if not exists is_update boolean not null default false;
