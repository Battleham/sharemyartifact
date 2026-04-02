-- Add expiration support to artifacts
-- NULL = indefinite (never expires), existing rows stay NULL
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Partial index for efficient cleanup queries (only index non-null values)
CREATE INDEX IF NOT EXISTS idx_artifacts_expires_at ON artifacts(expires_at) WHERE expires_at IS NOT NULL;
