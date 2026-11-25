-- Migrasi 0001: share-link snapshot v1 (spec-collab-cloud story 1).
-- Satu deployment = satu workspace; semua LAKAR_API_KEY setara (tanpa akun pengguna).
-- PNG board disimpan bytea supaya service stateless; dokumen disimpan jsonb untuk unduhan .lakar.json.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shares (
  token text PRIMARY KEY,
  slug text NOT NULL,
  title text NOT NULL,
  permissions jsonb NOT NULL,
  doc jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS share_boards (
  token text NOT NULL REFERENCES shares(token) ON DELETE CASCADE,
  board_id text NOT NULL,
  ord integer NOT NULL,
  name text NOT NULL,
  x double precision NOT NULL,
  y double precision NOT NULL,
  w double precision NOT NULL,
  h double precision NOT NULL,
  png bytea NOT NULL,
  PRIMARY KEY (token, board_id)
);

CREATE TABLE IF NOT EXISTS share_comments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token text NOT NULL REFERENCES shares(token) ON DELETE CASCADE,
  board_id text NOT NULL,
  x double precision NOT NULL,
  y double precision NOT NULL,
  author text NOT NULL,
  body text NOT NULL,
  parent_id bigint REFERENCES share_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS share_comments_token_idx ON share_comments(token, created_at);
