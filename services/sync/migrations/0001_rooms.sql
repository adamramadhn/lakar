-- 0001_rooms: tabel room sync server (spec-collab-cloud story 3).
-- rooms = satu dokumen live per baris: snapshot doc (bentuk tersimpan, bukan resolved) + rev monotonic
-- yang menjadi sequencer lewat SELECT ... FOR UPDATE di appendOp. room_ops = log op append-only
-- (sumber restore/named versions cloud nanti); kolom `seed` + `at` menyimpan seed PRNG dan stempel
-- commit persis yang dipakai server saat transact, supaya replay log menghasilkan ID mint identik
-- (kontrak deterministik — lihat protocol.ts ServerOps). `peer_name` bersifat advisori (klaim klien,
-- tidak diverifikasi). Presence dan lock tidak disimpan di sini (ephemeral, in-process).
-- Semua CREATE memakai IF NOT EXISTS: aman untuk cold-start dua instance berbarengan.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  token text PRIMARY KEY,
  view_token text NOT NULL UNIQUE,
  title text NOT NULL,
  doc jsonb NOT NULL,
  rev integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS room_ops (
  room text NOT NULL REFERENCES rooms(token) ON DELETE CASCADE,
  rev integer NOT NULL,
  ops jsonb NOT NULL,
  peer_name text NOT NULL DEFAULT '',
  seed text NOT NULL DEFAULT '',
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room, rev)
);
