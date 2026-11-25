-- Migrasi 0002: tambahan share-link UI (plan-share-link-ui).
-- `expires_at` nullable: default +30 hari diisi route saat create; NULL = "Never" (tidak pernah kedaluwarsa).
-- Share kedaluwarsa diperlakukan identik dengan revoked/unknown oleh semua lookup publik (404).
-- `views`: penghitung buka halaman tamu; hanya dinaikkan GET meta (bukan PNG/komentar).
-- `guest_id` di komentar: UUID acak sisi klien (localStorage) — hanya pemilik guest_id yang boleh
-- mengedit/menghapus komentarnya; komentar lama (NULL) tidak bisa diedit siapa pun.

ALTER TABLE shares ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE shares ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0;
ALTER TABLE share_comments ADD COLUMN IF NOT EXISTS guest_id text;
