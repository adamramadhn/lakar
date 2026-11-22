---
title: 'Golden C dan E dibangun ulang di Lakar dan kelima PNG disetujui Adam'
type: feature
ticket: '9'
created: '2026-11-19'
status: built
baseline_revision: '4d0def52675e77d4ccdad85b432056fc97c59f58'
route: oneshot
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/ux-lakar/golden-set.md'
  - '{project-root}/_bmad-output/initiative-lakar/ux-lakar/DESIGN.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** R3 (epic G1) butuh kelima desain target golden set di Lakar sebagai tes regresi `layout_check`; A, B, D selesai di story 8, C (dashboard Arus terang 1440 × 1024, sidebar 248) dan E (inventaris Gudangku gelap 1440 × 900, sidebar compact 72, tabel 8 baris + panel detail 360–420) belum ada. Adam lalu meninjau kelima PNG (langkah hitl, ditangani orkestrator).

**Approach:** Pola story 8: bangun C dan E lewat MCP Lakar yang sudah berjalan (read_skill core+polish+webapp → open_doc → execute → layout_check → screenshot/export; maks 3 putaran perbaikan per desain setelah build awal), memenuhi tiap Kriteria target golden-set.md dan DESIGN.md (§Web app/dashboard, §Tabel data, Lampiran A), angka konsisten. Thumbnail produk C = `Image / <produk>` berlabel (blok tint + ikon Lucide relevan), tanpa aset jarak jauh; E tanpa gambar. Dokumen disalin ke `packages/daemon/test/fixtures/golden/{C-arus,E-gudangku}.lakar.json`; tes regresi golden diperluas ke A–E (0 error, LC-17/18/19 = 0, 0 warning bila tercapai, ukuran board); PNG @1x/@2x ke `design/golden-set-lakar/` (pola nama story 8, tanpa menimpa), @1x C dan E di-commit. Positif palsu → perbaiki aturan di `packages/check` + fixture + pemindaian arsip ulang.

Batasan: C9 tegas (tanpa daemon/server/port tambahan, tanpa npx/global/PATH/container; Node 26 di `/opt/node-26`; restart hanya `systemctl --user restart lakard`), C6 (tanpa arsip pen.dev, tanpa MCP pencil/pen-headless), C7 (`packages/skills` tidak diubah), tanpa Unsplash, laporan `bench/*-<k>.md` tidak disunting, dokumen golden dibiarkan di data lakard, dokumen uji sementara dihapus.

</intent-contract>

## Tasks & Acceptance

**Execution:**
- [x] Dokumen lakard `golden-c-arus`, `golden-e-gudangku`: build + ≤ 3 putaran perbaikan; cek angka; Read setiap PNG.
- [x] `packages/daemon/test/fixtures/golden/{C-arus,E-gudangku}.lakar.json` -- salinan dokumen.
- [x] `packages/daemon/src/index.test.ts` -- describe regresi golden diperluas ke A–E (kasus C, E: nama board, screen app, 1440 × 1024 / 1440 × 900, aset 0).
- [x] `design/golden-set-lakar/{C-arus-dashboard,E-gudangku-inventaris}@{1x,2x}.png` -- @1x di-commit.
- [x] (tidak diperlukan: tidak ada positif palsu) Bila ada positif palsu: aturan di `packages/check/src/rules.ts` + fixture `packages/check/src/index.test.ts` + pemindaian arsip.

**Acceptance Criteria:**
- Given fixture golden A–E, when `pnpm --filter @lakar/daemon test`, then setiap dokumen memberi 0 error dan 0 temuan LC-17/18/19 (dan 0 warning, atau warning tersisa dijelaskan).
- Given `design/golden-set-lakar/`, when PNG C dan E dibuka, then setiap butir Kriteria target C dan E terpenuhi (dicek visual) dengan angka konsisten (C: AOV = pendapatan ÷ pesanan, label total grafik = string KPI pendapatan, ≥ 1 delta negatif, produk terlaris 5 item dengan bar proporsi; E: stok 3 lokasi = stok tabel, jumlah chip = total).
- Given akhir story, when `tools/node26/verify.sh`, then semua OK dan `/usr/bin/node` tetap v22.

## Implementation Notes

Rute oneshot: kode tangan hanya perluasan tes regresi (~10 baris); sisanya kerja desain lewat MCP dan fixture salinan.

- **Gambar:** tanpa foto. lakard memakai key Unsplash (status `unsplash (file key present)`), dan store lokal tidak punya foto produk non-Unsplash yang cocok; thumbnail produk C = frame `Image / <nama produk>` 40 × 40 (bidang `#EEF2F8` + garis dalam `#0000001A` + ikon Lucide relevan: `shirt`, `backpack`, `footprints`, `watch`, `glasses`). E tanpa gambar. Tidak ada daemon/port tambahan, tidak ada `photo_search`.
- **Dokumen lakard** (dibiarkan untuk Adam): `golden-c-arus` rev 7 (board `Arus / Ringkasan penjualan · app · Padat` 1440 × 1024), `golden-e-gudangku` rev 9 (`Gudangku / Inventaris barang · app · Padat` 1440 × 900). Tidak ada dokumen uji sementara lain yang dibuat.
- **Putaran perbaikan setelah build awal:** C 1 putaran (build awal kehabisan tinggi: grafik meluap ke tabel → board dibangun ulang dalam satu execute dengan anggaran tinggi tetap; lalu satu execute perbaikan: skala grafik 7 px/jt, label sumbu tidak menimpa garis nol, kolom tabel, item produk dua baris, panel 360) + polesan kecil (bar produk netral, logo netral, titik badge ellipse 6). E 1 putaran (chip meluap ke padding area kerja, LC-03 konteks, ruang kosong di atas paginasi → remah roti, panel callout stok menipis, titik badge, toolbar gap 20) + logo netral. Temuan check selama build semuanya cacat nyata (LC-02c Plot, LC-02b kota pelanggan, LC-11 label sumbu vs baris kisi 0, LC-21 radius 4 nilai, LC-07 padding 14/tinggi 28, LC-24 badge vs caption, LC-03, LC-26 remah roti, LC-02a paginasi 4px) → diperbaiki di desain; tidak ada aturan yang diubah.
- **Catatan check (bukan positif palsu):** chip "Bahan baku 222" sempat melewati padding kanan area kerja 18px tanpa temuan, karena area kerja tidak bercat (LC-02c butuh wadah ber-cat). Ini celah deteksi (negatif palsu), bukan positif palsu; tidak diubah di story ini, dicatat untuk Adam.
- **Putaran 2 (dari review, C dan E):** C: grafik dibangun ulang dengan flex (baris kisi = anak flow bergap 16; batang, garis rata-rata, dan label sumbu X = node `Overlay /` karena sengaja menumpuk), skala 6,4 px/jt; kartu padding 24 dan radius 8 (Padat 6–8); gap area kerja 16; judul halaman h3 24/32; ikon tombol 20; badge "Menunggu bayar" bertitik; label "30 hari terakhir" di panel produk. E: strip statistik lepas (bukan bagian permintaan) diganti `Filter status` di dalam `Toolbar` (tab Semua status 1.248 / Aman 1.199 / Menipis 37 / Habis 12, jumlah = total); judul h3; IconButton 40 ikon 20; ikon tombol 20; label riwayat "14 hari terakhir" (entri 8–18 Nov).
- **Hasil `layout_check` akhir:** C 0 error / 0 warning + info LC-22 (Overlay 7: batang, rata-rata, 5 label sumbu); E 0/0 + info LC-22 (Overlay 1: indikator baris terpilih). LC-17/18/19 = 0.
- **Cek angka C:** rata-rata nilai pesanan Rp 486.300.000 ÷ 2.418 = 201.116,6 → `Rp 201.117`; label total grafik `Rp 486,3 jt` = string KPI; 30 batang harian berjumlah 486,3 (rata-rata 16,21 → `Rp 16,2 jt`, puncak 20,3 pada 18 Nov); delta vs periode lalu: 486,3/432,1 = +12,5%, 2.418/2.236 = +8,1%, 201.117/193.247 = +4,1%, konversi 2.418/76.037 = 3,18% vs 3,52% = −0,34 poin (negatif, danger + `trending-down`); periode 20 Okt – 18 Nov 2026 = 30 hari; produk terlaris 412/356/298/184/171 → bar 192/166/139/86/80 px (proporsi terhadap 412).
- **Cek angka E:** chip 412 + 318 + 296 + 222 = 1.248 = "Semua"; paginasi 1.248 ÷ 8 = 156 halaman; stok per lokasi 28 + 12 + 6 = 46 = stok tabel KLS-1042; riwayat 30 → +50 = 80 → transfer (80) → −20 = 60 → −14 = 46; callout 60 − 46 = 14 roll di bawah titik pesan ulang, keluar 7 hari (−14 −20) = 34 → 4,9 roll/hari → ±9 hari; filter status 1.199 + 37 + 12 = 1.248 (Aman 96,1%).
- **Tes:** describe "regresi golden A–E (dokumen nyata)" (5 tes) dengan kasus C (app 1440 × 1024, aset 0) dan E (app 1440 × 900, aset 0). Uji negatif manual: "Ekspor CSV" → "Klik di sini" di fixture E → tes gagal dengan LC-19 pada `Label` di dalam `Button /` (fixture dipulihkan, `cmp` identik dengan dokumen lakard).
- **PNG:** `design/golden-set-lakar/{C-arus-dashboard,E-gudangku-inventaris}@{1x,2x}.png` (baru, tidak menimpa); @1x di-commit, @2x tetap tidak dilacak.
- **Verifikasi:** `pnpm build` lulus; daemon 176/176; `pnpm test` 1106/1107 (gagal hanya latensi `visual.test.ts` saat paralel; sendiri 18/18); `verify.sh` semua OK; `/usr/bin/node` v22.23.5; lakard tidak di-restart.

## Plan Change Log

## Review Triage Log

### 2026-11-19 — Review pass
- verdicts: 8 findings — high 0, medium 2, low 5, false 0, maybe-false 0 (1 finding split: sebagian low, sebagian ditolak)
- findings:
  - `[low]` `[patch]` E "Riwayat pergerakan · 7 hari terakhir" memuat entri 11 dan 8 Nov — benar; label diganti "14 hari terakhir" (19 Nov − 14 hari = 5 Nov mencakup semua entri; callout 4,9 roll/hari tetap dihitung dari 7 hari 12–18 Nov).
  - `[medium]` `[patch]` E strip `Ringkasan stok` = seksi tambahan yang tidak diminta (Prinsip 1) — benar; dihapus dan diganti `Filter status` (tab status berjumlah = total) di dalam `Toolbar`, yaitu filter yang memang bagian toolbar permintaan.
  - `[low]` `[patch]` Judul halaman C/E 28/36, padahal §Web app meminta h2/h3 — benar; keduanya kini h3 24/32/600.
  - `[medium]` `[patch]` Grafik C memakai node absolut bukan `Overlay /` di frame `layout:'none'` (LC-14 membebaskannya, tetapi §Struktur wajib melarang) — benar; kisi kini anak flow, batang/garis rata-rata/label sumbu jadi `Overlay /` (LC-22 Overlay 7).
  - `[low]` `[patch]` Kartu C padding 20 dan radius 12 di arketipe Padat (6–8) — benar; padding 24 dan radius 8. Padding 16 tile E tidak lagi berlaku (tile dihapus; tab filter adalah kontrol).
  - `[low]` `[patch]`/`[reject]` Ukuran komponen di bawah token — IconButton 32 → 40 dan ikon tombol 16 → 20 di-patch. Badge 20 ditolak: token DESIGN 24 bertentangan dengan LC-24 (Lampiran A: tinggi badge ≤ line-height teks terbesar di barisnya, 20 untuk body-sm) dan skill polish (badge sm 20 default di baris/tabel); badge 24 di baris KPI akan memicu LC-24.
  - `[low]` `[patch]` Badge "Menunggu bayar" memakai ikon `clock`, lainnya titik — benar; diganti titik 6 px.
  - `[low]` `[patch]` Panel produk C "30 hari" vs "30 hari terakhir" — benar; diseragamkan "unit terjual · 30 hari terakhir".

## Verification

**Commands:**
- `/opt/node-26/bin/pnpm build` -- expected: lulus.
- `/opt/node-26/bin/pnpm --filter @lakar/daemon test` -- expected: lulus termasuk tes golden A–E.
- `/opt/node-26/bin/pnpm test` -- expected: lulus (kecuali latensi `visual.test.ts`/500 node paralel yang diketahui).
- `tools/node26/verify.sh` -- expected: semua OK.

**Manual checks (if no CLI):**
- Read PNG C dan E: simetri padding, ruang bawah baris terakhir, tabel tidak terpotong, densitas satu tingkat, angka konsisten.

## Auto Run Result

Status: built

**Ringkasan:** Desain target golden C (Arus, dashboard terang 1440 × 1024, sidebar 248, Padat, aksen biru) dan E (Gudangku, inventaris gelap 1440 × 900, sidebar 72 + tabel 8 baris + panel detail 400, Padat, aksen amber) dibangun lewat MCP Lakar yang sudah berjalan dan lolos `layout_check` 0 error / 0 warning (info LC-22 saja: C Overlay 7, E Overlay 1). Angka konsisten (lihat Implementation Notes). Tanpa foto: thumbnail produk C = `Image / <produk>` berlabel dengan ikon. Kedua dokumen menjadi fixture regresi; tes golden kini A–E (5 tes, 0 error, LC-17/18/19 = 0, 0 warning, ukuran board, aset lokal). Tidak ada positif palsu; tidak ada aturan yang diubah.

**File:**
- `packages/daemon/src/index.test.ts` — describe "regresi golden A–E (dokumen nyata)": kasus C dan E.
- `packages/daemon/test/fixtures/golden/C-arus.lakar.json` (rev 7), `E-gudangku.lakar.json` (rev 9) — salinan dokumen lakard.
- `design/golden-set-lakar/C-arus-dashboard@1x.png`, `E-gudangku-inventaris@1x.png` — di-commit; @2x ada di disk, tidak dilacak.
- Di luar git: dokumen `golden-c-arus` dan `golden-e-gudangku` di data lakard (untuk Adam).

**Review:** 8 temuan (quick) — 7 di-patch penuh/sebagian (2 medium, 5 low), 1 bagian ditolak (badge 24: bertentangan dengan LC-24 dan skill), 0 ditunda.

**Follow-up review:** tidak disarankan (patch: 0 high, 2 medium — keduanya perubahan desain yang sudah diverifikasi ulang lewat layout_check, tes regresi, dan Read PNG).

**Verifikasi:** `pnpm build` lulus; `pnpm --filter @lakar/daemon test` 176/176; `pnpm test` 1106/1107 (gagal hanya latensi `visual.test.ts` saat paralel — diketahui; sendiri 18/18); uji negatif LC-19 pada fixture E gagal sesuai harapan; `tools/node26/verify.sh` semua OK (snapshot C9 identik); `/usr/bin/node` v22.23.5; tanpa daemon/port tambahan, lakard tidak di-restart. PNG C dan E diperiksa dengan Read.

**Risiko sisa:** thumbnail produk C berupa ikon (bukan foto) karena foto produk non-Unsplash tidak tersedia lokal; LC-02c tidak mendeteksi luapan ke padding wadah tak bercat (celah deteksi, ditemukan saat build E); tes golden menegaskan 0 warning sehingga aturan warning baru bisa membuatnya merah (disengaja).

