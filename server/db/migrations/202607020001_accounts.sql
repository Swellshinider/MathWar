CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE CHECK (username = lower(username) AND username ~ '^[a-z0-9_-]{3,20}$'),
  password_hash text NOT NULL,
  display_name text NOT NULL,
  avatar_bytes bytea,
  avatar_mime_type text,
  avatar_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by_token_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_account_id_idx ON refresh_tokens(account_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_at_idx ON refresh_tokens(expires_at);
