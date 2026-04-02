-- Store user's chosen TTL string so complete_upload can compute expires_at
ALTER TABLE pending_uploads ADD COLUMN IF NOT EXISTS ttl text;
