-- Add short codes for tiny URLs
alter table artifacts add column if not exists short_code text unique;

-- Generate short codes for existing artifacts
update artifacts set short_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 7)
where short_code is null;

-- Make it not null with a default for future inserts
alter table artifacts alter column short_code set not null;
alter table artifacts alter column short_code set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 7);

-- Index for fast lookups
create index idx_artifacts_short_code on artifacts(short_code);
