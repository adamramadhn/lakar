# Reviewer gate — architecture-model-dokumen (2026-11-22)

Dijalankan inline secara berurutan. Subagen tidak dipakai di sesi ini tanpa permintaan eksplisit pengguna.

## lint_spine.py

0 temuan.

## Lensa: verifikasi teknologi (finalize_reviewers #1)

- Semua versi di Stack dicek terhadap `package.json` repo (realitas brownfield). Spine tidak menambah teknologi baru.
- Klaim tentang Paper (render HTML/CSS asli, ekspor React, MCP baca/tulis) dicek ke https://paper.design/llms.txt pada 2026-11-22.
- Verdict: lulus.

## Lensa: adversarial (finalize_reviewers #2)

Pasangan unit yang patuh pada semua AD di draf pertama tetapi tetap tidak cocok, beserta perbaikan yang sudah diterapkan:

1. **Codegen.** AD-10 menyerahkan dokumen yang instancenya sudah diekspansi, padahal AD-16 menuntut instance menjadi pemakaian komponen. Kontradiksi. Diperbaiki: codegen menerima dokumen tersimpan, dan tahap resolusi diekspor terpisah.
2. **Copy as dan codegen** butuh `var(--…)`, tetapi AD-5 hanya memetakan node ter-resolve. Diperbaiki: pemetaan menerima ref token.
3. **Nama mode tema** tidak punya pemilik, sehingga dua epic bisa memakai nama mode berbeda. Diperbaiki: `tokenModes` di dokumen, dan mode default adalah elemen pertama.
4. **Hapus master** bisa ditolak oleh satu unit dan di-detach oleh unit lain. Diperbaiki: detach di commit yang sama.
5. **Atomisitas route ops** tidak ditetapkan, sehingga viewer bisa mengharapkan hasil parsial. Diperbaiki: semua atau tidak sama sekali.
6. **Pemilik tumpukan undo** dan perilaku saat op invers gagal belum ditetapkan. Diperbaiki: tumpukan per jendela viewer, entri dibuang bila gagal, tanpa undo sebagian.
7. **Dua PR paralel** bisa sama-sama menaikkan versi 2→3. Diperbaiki: nomor versi ditentukan saat merge, PR lain rebase dan menomori ulang.
8. **API baca `execute`** bisa mengembalikan node tersimpan atau node hasil ekspansi. Diperbaiki: node tersimpan, dan isi instance dibaca lewat alamat komposit.

Sisa yang diterima: seleksi dari beberapa jendela memakai aturan "penulis terakhir menang" (sudah tertulis di AD-9).

## Lensa: rubrik spine

- Semua R1–R7 ada di Capability Map.
- Lingkungan operasional dibahas (lokal, loopback, sidecar, data dir, CI Linux).
- Deferred tidak membuka divergensi antar-epic.
- Spine meratifikasi kode yang ada (AD-2 [ADOPTED], nama layout lama, `{$token}`, `MIGRATIONS`).
- **Temuan untuk pengguna.** AD-4 mengubah C5 inisiatif dan aturan AGENTS.md ("route dan tool lama dibekukan"). Done when epic, "route dan tool MCP lama tetap lolos tesnya", masih cocok, tetapi tes yang memeriksa teks pesan boleh diperbarui. Ticket dan AGENTS.md perlu disesuaikan (handoff ke Sofia), bukan diubah diam-diam.

## Reconcile input

- **Brief §Token "salin antar-file dan ke file CSS"** belum tercakup. Diperbaiki: ditambahkan ke Deferred dengan pemilik epic token.
- **Brief §Kode "sinkron komponen codebase ↔ canvas"** tercakup di Deferred (komponen kode dari codebase).
- **Jalur tracer inisiatif** (edit canvas → dokumen → agen membaca seleksi dan menulis → canvas live → ekspor React) tercakup oleh AD-2, AD-6, AD-7, AD-9, dan AD-16.
