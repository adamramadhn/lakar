---
title: 'Golden A, B, D dibangun ulang di Lakar sebagai regresi check'
type: feature
ticket: '8'
created: '2026-11-19'
status: built
baseline_revision: '79226b8d96407427a625626e204154458d096770'
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
deferred:
  - summary: >-
      PNG golden A/B/D di design/golden-set-lakar/ tidak ter-commit karena /design/ di-exclude lewat .git/info/exclude (lokal).
    evidence: |-
      .git/info/exclude baris 9 "/design/"; PNG hanya ada di VPS. Arsip pen.dev golden-set-png/ diperlakukan sama.
      Sumber PNG dapat dibuat ulang dari fixture (rev dokumen: A r8, B r6, D r5) lewat export lakard.
      Keputusan apakah PNG di-commit (git add -f, ±3 MB) atau exclude diubah ada di Adam (story 9 meminta persetujuan PNG).
    location: >-
      design/golden-set-lakar/
    severity: low
---

<intent-contract>

## Intent

**Problem:** R3 (epic G1) butuh desain target golden A (landing Kasku 1440), B (mobile Gerak gelap 390 × ≥ 844), dan D (checkout Singgah terang, satu board panjang 390 × ≥ 844, header atas + bilah bayar menempel bawah) yang dibangun di Lakar sebagai kalibrasi kualitas dan tes regresi `layout_check`: 0 error (termasuk LC-16 non-gerbang), LC-17/18/19 = 0, warning seminimal mungkin dengan alasan tertulis.

**Approach:** Bangun ketiga desain lewat MCP Lakar (read_skill → open_doc → execute → layout_check → screenshot/export; maks 3 putaran perbaikan per desain setelah build awal), memenuhi setiap butir Kriteria target golden-set.md dan DESIGN.md. Foto (B: avatar + dua program; D: kamar) berasal dari Wikimedia/Openverse, dicari lewat daemon dist sementara tanpa key Unsplash (port acak, data dir scratchpad, dimatikan sesudahnya), diperkecil dengan `convert` lalu ditulis sebagai aset lokal beralamat sha256 ke store lakard dan ke fixture (deterministik, tanpa jaringan, AD-10). Dokumen disalin ke `packages/daemon/test/fixtures/golden/` (+ `assets/`), tes daemon baru merender ketiganya dan menegaskan 0 error dan LC-17/18/19 = 0; PNG skala 1 dan 2 ke `design/golden-set-lakar/`. Positif palsu → perbaiki definisi aturan di `packages/check` + fixture + pemindaian arsip ulang, bukan pengecualian per board.

Batasan: C6 (tanpa arsip pen.dev, tanpa MCP pencil/pen-headless), C7 (skill tidak diubah, isi golden tidak masuk `packages/skills`), C9 (Node 26 di `/opt/node-26`, tanpa npx/global/PATH/port tetap), tanpa panggilan Unsplash, laporan `bench/*-<k>.md` tidak disunting.

</intent-contract>

## Tasks & Acceptance

**Execution:**
- [x] Foto non-Unsplash: daemon dist sementara (scratchpad) → photo search + impor → `convert` ≤ 1200px JPEG → aset di `~/.local/share/lakar/assets/<sha>` (atribusi di `credits.json` fixture, bukan meta store) dan `packages/daemon/test/fixtures/golden/assets/<sha>`.
- [x] Dokumen lakard `golden-a-kasku`, `golden-b-gerak`, `golden-d-singgah`: build + ≤ 3 putaran perbaikan; cek angka; Read setiap PNG.
- [x] `packages/daemon/test/fixtures/golden/{A-kasku,B-gerak,D-singgah}.lakar.json` -- salinan dokumen.
- [x] `packages/daemon/src/index.test.ts` -- tes regresi golden: salin dokumen + aset ke dataDir tes, `/layout-check` per dokumen → error 0, LC-17/18/19 0.
- [x] `design/golden-set-lakar/{A,B,D}-*.png` (@1x, @2x) -- tanpa menimpa file yang ada.
- [x] (tidak diperlukan: tidak ada positif palsu) Bila ada positif palsu: perbaikan aturan di `packages/check/src/rules.ts` + fixture `packages/check/src/index.test.ts` + pemindaian arsip `archcheck.mjs`.

**Acceptance Criteria:**
- Given fixture golden A, B, D, when `pnpm --filter @lakar/daemon test` menjalankan tes regresi, then setiap dokumen memberi 0 error dan 0 temuan LC-17/18/19.
- Given `design/golden-set-lakar/`, when dibuka, then ada PNG A, B, D yang memenuhi Kriteria target (dicek visual) dengan angka konsisten.
- Given akhir story, when `tools/node26/verify.sh`, then semua OK dan Node sistem tetap v22.

## Implementation Notes

Rute oneshot: kode yang ditulis tangan hanya tes regresi (~60 baris); sisanya kerja desain lewat MCP dan fixture hasil salinan.

- **Foto (AD-10, tanpa Unsplash):** lakard memakai key Unsplash (status: `unsplash (file key present)`), jadi `photo_search` lakard tidak dipakai. Pencarian + impor lewat daemon dist sementara (`<scratchpad>/g8/photod.mjs`: port 0, data dir scratchpad, `LAKAR_UNSPLASH_KEY_FILE`/`LAKAR_PEXELS_KEY_FILE` = file tak ada → Wikimedia), dimatikan sesudah tiap panggilan; data dir dihapus. Empat foto Wikimedia Commons (kamar CC BY 2.0, pelari CC BY-SA 4.0, dumbbell CC BY 2.0, potret CC BY-SA 3.0) diperkecil dengan ImageMagick (900–1200 px; avatar dipotong 160 × 160), ditulis ke store lakard `~/.local/share/lakar/assets/<sha>` dan `packages/daemon/test/fixtures/golden/assets/<sha>` (total ±230 KB) + `credits.json`. Fill memakai `assetId` langsung (bukan `photo()`), jadi dokumen tidak punya meta `remote`. Avatar awal (Wikimedia "Always smile (Unsplash)", CC0) diganti potret non-asal-Unsplash agar tidak ada keraguan; byte lamanya dihapus dari store.
- **Dokumen lakard** (dibiarkan di data lakard untuk Adam): `golden-a-kasku` rev 8 (board `Kasku / Beranda · landing · Jernih` 1440 × 3954), `golden-b-gerak` rev 6 (`Gerak / Beranda · mobile · Malam` 390 × 1292), `golden-d-singgah` rev 5 (`Singgah / Checkout · mobile · Ramah` 390 × 1974). Putaran perbaikan setelah build awal: A 1 (yatim judul/paragraf, kartu fitur dua kelompok, kutipan sorotan 32, bintang 4,0), B 1 (copy saran, gap 24, ikon peregangan, bintang badge terisi, tinggi pas), D 1 (pesan error/detail QRIS tanpa yatim, tombol kembali berlatar, tinggi pas 1974). Temuan check selama build semuanya cacat nyata (LC-04 meta di bidang tint, LC-21 radius 4 nilai, LC-07 padding 22/14, LC-02c kartu tinggi `fill`, LC-25 radius tidak konsentris, LC-20 tinggi kurang, LC-10 link 20 tinggi, LC-18 radio-card di kartu bergaris) → diperbaiki di desain; tidak ada aturan yang diubah.
- **Hasil `layout_check` akhir:** A 0 error / 0 warning / 0 info; B 0/0 + info LC-22 (Overlay 1); D 0/0 + info LC-22 (Overlay 1). LC-07 = 0, LC-17/18/19 = 0.
- **Cek angka:** A Pemasukan Rp 48,2 jt − Pengeluaran Rp 31,7 jt = Laba Rp 16,5 jt; batang minggu 15,1 + 17,4 + 15,7 = 48,2 dan 10,2 + 11,8 + 9,7 = 31,7 (tinggi 5,5 px/jt); delta vs Okt (42,9/30,7/12,2 jt) 12,4% / 3,3% / 35,2%. B 7.412/10.000 = 74,1% (266,8°), 312/500 = 62,4% (224,6°), 27/60 = 45% (162°); sisa 33 menit = 60 − 27; Kamis 19 Nov 2026 benar. D Rp 685.000 × 2 = 1.370.000 + pajak 10% 137.000 + layanan 15.000 = Rp 1.522.000 = bilah bawah = label tombol; Jum 11 Des – Min 13 Des 2026 = 2 malam; Rab 9 Des 2026 benar.
- **Tes:** `index.test.ts` describe "regresi golden A, B, D (dokumen nyata)": salin aset sha ke `dataDir/assets`, tulis dokumen ke `dataDir/docs`, cek satu board (nama, screen, lebar, tinggi minimum), aset ada di fixture, tanpa `remote`, `/layout-check` → error 0, gate 0, LC-17/18/19 0, warning 0. Uji negatif manual: teks "Klik di sini." disuntik ke fixture A → tes gagal dengan LC-19 (fixture dipulihkan, `cmp` identik dengan dokumen lakard).
- **PNG:** `design/golden-set-lakar/{A-kasku-landing,B-gerak-beranda,D-singgah-checkout}@{1x,2x}.png` (folder baru). `/design/` di-exclude lewat `.git/info/exclude` (lokal), jadi PNG tidak masuk commit — sama dengan arsip `golden-set-png/`.
- **Verifikasi:** `pnpm build` lulus; `pnpm test` 1102/1104 (gagal hanya latensi `visual.test.ts` dan kinerja 500 node saat paralel; sendiri lulus 18/18 dan 1/1); `verify.sh` semua OK; `/usr/bin/node` v22.23.5; lakard tidak perlu restart (tidak ada perubahan kode daemon).

## Plan Change Log

## Review Triage Log

### 2026-11-19 — Review pass
- verdicts: 5 findings — high 0, medium 1, low 4, false 0, maybe-false 0
- findings:
  - `[low]` `[patch]` `expect(raw).not.toMatch(/"remote"/)` tidak pernah bisa gagal (dokumen tidak punya field `remote`; meta remote ada di sidecar) — terverifikasi; asersi dihapus, komentar menyatakan penjaga sebenarnya = setiap assetId harus berupa file byte di fixture.
  - `[low]` `[patch]` regex assetId bisa lolos dengan 0 cocok bila format JSON berubah — terverifikasi; regex dibuat toleran spasi (`"assetId":\s*"([^"]*)"`) dan jumlah aset per kasus ditegaskan (A 0, B 3, D 1).
  - `[low]` `[patch]` `minHeight: 640` untuk A tidak bermakna — terverifikasi; kasus kini menegaskan ukuran board persis (A 1440 × 3954, B 390 × 1292, D 390 × 1974) + mobile ≥ 844.
  - `[medium]` `[patch]` atribusi foto CC BY/BY-SA hanya di `credits.json` repo, tidak di metadata aset store lakard (kontrak `api.ts`/`server.ts`: atribusi di metadata aset) — terverifikasi (meta/ kosong untuk 4 sha); sidecar `~/.local/share/lakar/assets/meta/<sha>.json` ditulis dari meta impor asli (+ `derivedFrom`, ukuran baru); `photos/index.json` tidak diubah sehingga ref→aset impor tidak terpengaruh.
  - `[low]` `[defer]` PNG di `design/golden-set-lakar/` tidak ter-commit karena `/design/` di-exclude lokal — benar; keputusan commit PNG biner ada di Adam (story 9), dicatat di `deferred`. Fixture golden ikut commit.

## Verification

**Commands:**
- `/opt/node-26/bin/pnpm build` -- expected: lulus.
- `/opt/node-26/bin/pnpm --filter @lakar/daemon test` -- expected: lulus termasuk tes golden.
- `/opt/node-26/bin/pnpm test` -- expected: lulus (kecuali latensi `visual.test.ts` paralel yang diketahui).
- `tools/node26/verify.sh` -- expected: semua OK.

**Manual checks (if no CLI):**
- Read setiap PNG di `design/golden-set-lakar/`: simetri margin, ruang bawah, angka konsisten.

## Auto Run Result

Status: built

**Ringkasan:** Desain target golden A (Kasku, landing 1440 × 3954, Jernih), B (Gerak, mobile gelap 390 × 1292, Malam), dan D (Singgah, checkout terang satu board 390 × 1974 dengan header di atas dan `Overlay / Bilah bawah` menempel di bawah, Ramah) dibangun lewat MCP Lakar dan lolos `layout_check` 0 error / 0 warning (B dan D: info LC-22 Overlay 1). Foto B/D = byte Wikimedia Commons lokal (diperkecil), tanpa Unsplash. Dokumen + aset menjadi fixture regresi daemon; tes merender ketiganya lewat daemon nyata dan menegaskan 0 error, LC-17/18/19 = 0, 0 warning, ukuran board, dan aset lokal. Tidak ada positif palsu; tidak ada aturan yang diubah.

**File:**
- `packages/daemon/src/index.test.ts` — describe "regresi golden A, B, D (dokumen nyata)" (3 tes).
- `packages/daemon/test/fixtures/golden/{A-kasku,B-gerak,D-singgah}.lakar.json` — salinan dokumen lakard (A r8, B r6, D r5).
- `packages/daemon/test/fixtures/golden/assets/<sha256>` ×4 + `credits.json` — JPEG lokal + atribusi.
- Di luar git: `design/golden-set-lakar/*.png` (6 PNG @1x/@2x), dokumen `golden-*` dan 4 aset + meta di data lakard.

**Review:** 5 temuan — 4 di-patch (1 medium, 3 low), 1 ditunda (PNG tidak ter-commit karena exclude lokal), 0 ditolak.

**Follow-up review:** tidak disarankan (patch: 1 medium, 3 low; tidak ada high).

**Verifikasi:** `pnpm build` lulus; `pnpm --filter @lakar/daemon test` 174/174; `pnpm test` 1102/1104 (gagal hanya latensi `visual.test.ts` dan kinerja 500 node saat paralel — diketahui; sendiri lulus); uji negatif LC-19 pada fixture A gagal sesuai harapan; `tools/node26/verify.sh` semua OK; `/usr/bin/node` v22.23.5. Setiap PNG diperiksa dengan Read.

**Risiko sisa:** tes regresi menegaskan 0 warning, jadi aturan warning baru di story lain bisa membuatnya merah (disengaja: temuan baru harus diperiksa sebagai cacat nyata atau positif palsu); render bergantung pada font Fontsource lokal; PNG belum ter-commit (deferred).

