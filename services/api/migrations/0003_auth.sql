-- Migrasi 0003: akun cloud auth story A (spec-cloud-auth).
-- users.identities: link-by-email — provider berbeda dengan email sama → user sama;
-- subject = OAuth `sub` (google) / `id` (github) / email (magic link).
-- sessions.token = 32 byte base64url MENTAH (opaque, revocable); magic_tokens.hash =
-- sha256 token (link sekali pakai, 15 mnt). shares.owner_id NULL = era admin-key —
-- tetap berfungsi penuh lewat LAKAR_API_KEY.

-- Catatan deploy: citext butuh hak CREATE EXTENSION. Di managed Postgres (RDS/Supabase/Neon
-- dll) role aplikasi mungkin tidak punya hak itu — minta admin pre-grant/pre-install ekstensi
-- ini sebelum migrasi dijalankan, atau jalankan migrasi dengan role yang lebih tinggi.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identities (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  subject text NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX IF NOT EXISTS identities_user_idx ON identities(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ua text
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS magic_tokens (
  hash text PRIMARY KEY,
  email citext NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

ALTER TABLE shares ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id);
CREATE INDEX IF NOT EXISTS shares_owner_idx ON shares(owner_id) WHERE owner_id IS NOT NULL;
