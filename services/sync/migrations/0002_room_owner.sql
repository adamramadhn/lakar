-- 0002_room_owner: rooms.owner_id untuk kepemilikan akun (spec-cloud-auth story B).
-- SENGAJA tanpa REFERENCES users: tabel users milik service api dan migrasinya bisa belum
-- jalan saat migrasi ini diterapkan — kedua service berbagi satu Postgres tapi urutan migrasi
-- antar-service tidak dijamin (sync hanya membaca sessions/users, tidak menulisnya).
-- NULL = room era admin-key ("workspace"): tetap berfungsi penuh dan hanya bisa dikelola
-- lewat LAKAR_API_KEY — bukan "milik semua user".
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS owner_id uuid;
CREATE INDEX IF NOT EXISTS rooms_owner_idx ON rooms(owner_id) WHERE owner_id IS NOT NULL;
