# @lakar/core

Inti dokumen: allocator ID, transaksi operasi (salinan kerja, rollback penuh), kunci per dokumen, migrasi.

- **AD terkait:** AD-2 (validasi skema), AD-3 (ID 8 karakter), AD-4 (transaksi: error tak tertangkap =
  rollback penuh, sukses = satu revisi).
- **Arah dependensi:** `core → schema`.

## Ekspor utama

- `createDocument`, `beginTransaction`, `transact`, tipe `Transaction`, `CommitResult`.
- `IdAllocator`, `collectIds`, `DocumentLocks`.
- `migrateDocument`, `parseDocument`, `MIGRATIONS`.
- `isPlainObject` (guard objek JSON, dipakai juga oleh exec).

## Batasan

- Paket IO_FORBIDDEN: tanpa API Node; penyimpanan file milik daemon (`DocStore`).
- Pesan error op (`add`, `update`, …) dilihat agen lewat `execute`; ubah hanya dengan sengaja.

## Tes

```bash
/opt/node-26/bin/pnpm build
/opt/node-26/bin/pnpm exec vitest run packages/core
```

Semua tes repo: `/opt/node-26/bin/pnpm test` (dari root).
