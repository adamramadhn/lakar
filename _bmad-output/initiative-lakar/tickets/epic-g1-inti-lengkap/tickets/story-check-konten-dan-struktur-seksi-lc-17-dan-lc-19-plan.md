---
title: 'Check konten dan struktur seksi: LC-17 dan LC-19'
type: feature
ticket: '6'
created: '2026-11-19'
status: in-progress
baseline_revision: '0d3add5704d45e37e51ecd9918b02807ed075be2'
route: full
route_source: auto
risk: medium
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/tickets/story-check-konten-dan-struktur-seksi-lc-17-dan-lc-19.md'
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/tickets/story-check-tipografi-dan-spacing-lc-03-06-07-08-09-10-plan.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `@lakar/check` belum menjalankan LC-17 (struktur seksi mirip) dan LC-19 (frasa terlarang) dari DESIGN.md Lampiran A (epic G1 R1), sehingga R7 bench belum menghitung LC-17 (`r3r7Missing()` masih `LC-17`), dan daftar frasa terlarang hanya ada sebagai teks di DESIGN.md dan `polish.md`.

**Approach:** Daftar frasa jadi satu modul data `@lakar/schema` (`content-rules.ts`) yang dijaga tes kesesuaian terhadap DESIGN.md (dilewati bila tidak ada) dan baris `polish.md`. Dua aturan warning murni di `rules.ts` dengan definisi dikalibrasi dari prototipe arsip 120 dokumen (Design Notes); pemindaian arsip akhir mencatat temuan; gagal gerbang tetap 80.

## Boundaries & Constraints

**Always:**
- Keduanya `warning`, `gate:false`; bentuk temuan AD-8; detail ≤ 120 (`clip120`); maks 3 per aturan per board lewat `capWarnings`.
- Frasa hanya didefinisikan di `packages/schema/src/content-rules.ts`; `rules.ts` dan deskripsi MCP mengimpornya.
- Positif palsu diperbaiki di definisi umum, bukan pengecualian per dokumen/board. Golden set nanti harus LC-17/19 = 0 — aturan tidak dilonggarkan demi itu.
- Aturan lama di arsip identik per dokumen dengan `after5b.json`; dokumen gagal gerbang tetap 80.
- C9: hanya `/opt/node-26/bin/pnpm`/`node`; tanpa npx, paket global, PATH/profil, port tetap, container. Restart hanya `systemctl --user restart lakard`. Akhiri `tools/node26/verify.sh`. Dokumen uji di lakard dihapus setelahnya.
- Commit di `g1` (tanpa ganti branch/push/merge), akhiran `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Never:**
- Jangan ubah `packages/skills/**` (C7); contoh skill yang memicu → `PENDING_2_10` (`packages/daemon/src/skills-examples.test.ts`) dengan pencocokan persis.
- Jangan panggil MCP pencil, sentuh `.pen`, jalankan `claude -p`/run bench, tampilkan key Unsplash, sunting tangan `bench/*-<k>.md`, atau tinggalkan proses.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| LC-17 positif | dua `Seksi /` masing-masing judul + 3 kartu identik (isi sama tipe/ukuran) | 1 warning pada seksi kedua: `mirip Seksi / A (id): 100%` | — |
| LC-17 fallback | tanpa `Seksi /`; board → `Halaman` (satu-satunya anak flow, kolom) → dua anak frame berpola sama | 1 warning | — |
| LC-17 negatif | seksi sama pola tetapi jumlah kartu 3 vs 4 (Jaccard < 0,9); kartu dalam satu grid (anak `layout:'row'`) tanpa `Seksi /`; seksi bersarang (leluhur–keturunan); seksi < 6 node terlihat; tumpukan utama berupa row (sidebar + main) | tidak ada | — |
| LC-19 positif | teks "Pelajari Lebih Lanjut →", "Unlock your data.", "Klik  di sini" (spasi ganda), "next-level" | warning `frasa terlarang "pelajari lebih lanjut" (id)` | — |
| LC-19 negatif | "unlocked", "Seamlessly", "pelajari lebih lanjutan"; teks di dalam `Input /`; teks bernama `Label` atau berleluhur `Label`; teks tak terlihat | tidak ada | — |
| Tes frasa | DESIGN.md (bila ada) baris `- **id:**`/`- **en:**`; `polish.md` baris "Frasa terlarang" | sama dengan `FORBIDDEN_PHRASES` | DESIGN.md tidak ada → bagian itu `skipIf` |

</intent-contract>

## Code Map

- `packages/schema/src/content-rules.ts` (baru) + `export *` di `index.ts` -- `FORBIDDEN_PHRASES: { id: readonly string[]; en: readonly string[] }` (urutan sama dengan DESIGN.md), `FORBIDDEN_EXEMPT` komentar; fungsi murni `forbiddenPhrasesIn(text): { phrase; lang }[]` (regex `giu`, batas `(?<![\p{L}\p{N}_])…(?![\p{L}\p{N}_])`, spasi frasa → `\s+`, `-` → `[-‐‑]`).
- `tests/content-rules.test.ts` (baru, pola `tests/design-tokens.test.ts`) -- parse DESIGN.md `- **id:** "…", …` dan `- **en:**` (skipIf), parse `polish.md` baris `Frasa terlarang (kata utuh): …` (gabungan id+en, urut) = modul.
- `packages/schema/src/findings.ts` + `findings.test.ts` -- `LC-17` (`struktur seksi mirip`), `LC-19` (`frasa terlarang`) warning `gate:false`, urut ID.
- `packages/check/src/rules.ts` -- `lc17`, `lc19` (pakai `visibleRect`, `ancestors`, `named`, `isFlowChild`, `descendants`, `quote`, `clip120`, `num`); konstanta `SECTION_SIMILARITY_MIN = 0.9`, `SECTION_MIN_NODES = 6`.
- `packages/check/src/index.ts` -- `checkBoard`, `RULE_ORDER` (LC-17 setelah LC-16, LC-19 setelah LC-18), ekspor.
- `packages/check/src/index.test.ts` -- describe LC-17 dan LC-19 via `runAll()`; tambahkan `LC-17`, `LC-19` ke `G1_FILTERED`.
- `packages/mcp/src/server.ts` `LAYOUT_CHECK_DESCRIPTION` (+ `tests/execute-description.test.ts` bila mencocokkan) -- sebut LC-17 dan LC-19 (frasa diinterpolasi dari modul atau cukup "daftar DESIGN.md").
- `bench/src/round/round.test.ts` ~751–756 -- `r3r7Missing()` → `semua aturan katalog …`; frozen tak terbaca → sama. `report.ts` tidak diubah.
- `packages/daemon/src/skills-examples.test.ts` `PENDING_2_10` -- entri persis bila contoh skill memicu (prototipe: tidak diperkirakan).
- `_bmad-output/initiative-lakar/ux-lakar/DESIGN.md` Lampiran A (di-exclude git; cadangan `<scratchpad>/DESIGN.before6.md`) -- kalimat aturan berjalan + Cara cek LC-17/LC-19; catatan sumber data frasa.
- `bench/practice/LOG.md` -- §2.6 pemindaian arsip (pola §2.5).
- Scratchpad `/tmp/claude-0/-root-lakar/28ec6272-7bb0-49b1-9470-ffa46c6812fb/scratchpad/`: `archcheck.mjs`, `cmp5.mjs` (salin → `cmp6.mjs`, NEW = LC-17, LC-19), baseline `after5b.json`, `docs.txt`; prototipe `s6/p17.mjs`, `s6/p19.mjs`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/schema/src/content-rules.ts`, `index.ts`, `tests/content-rules.test.ts` -- modul frasa + tes kesesuaian.
- [x] `packages/schema/src/findings.ts`, `findings.test.ts` -- dua aturan.
- [x] `packages/check/src/rules.ts`, `index.ts` -- `lc17`, `lc19` sesuai Design Notes.
- [x] `packages/check/src/index.test.ts` -- fixture setiap baris matriks + fungsi `forbiddenPhrasesIn` (di schema test atau check).
- [x] `packages/mcp/src/server.ts` (+ tes deskripsi), `bench/src/round/round.test.ts`.
- [x] Build, `pnpm test`; `PENDING_2_10` bila perlu.
- [x] Pindaian arsip `archcheck.mjs /root/lakar <scratchpad>/after6.json $(cat docs.txt)` (dari `/root/lakar`); `cmp6.mjs after5b.json after6.json`; catat LOG.md §2.6 + Implementation Notes.
- [x] DESIGN.md Lampiran A di disk.
- [x] `pnpm build`, `pnpm test`, restart lakard, uji execute, hapus dok uji, `verify.sh`, commit.

**Acceptance Criteria:**
- Given build sesudah story, when `pnpm --filter @lakar/check test`, `--filter @lakar/schema test`, `vitest run tests/content-rules.test.ts`, then fixture positif/negatif LC-17/LC-19 dan tes kesesuaian frasa lulus.
- Given lakard yang di-restart, when `execute` membuat board landing dengan dua `Seksi /` identik dan tombol "Pelajari lebih lanjut", then respons memuat `warning · LC-17` dan `warning · LC-19`, dan `summary.gate` tidak bertambah.
- Given arsip 120 dokumen, when dipindai, then aturan lama identik dengan `after5b.json`, gagal gerbang 80, dan LOG.md §2.6 mencatat temuan per aturan + contoh + penilaian.
- Given bench, when `r3r7Missing()` dipanggil dengan katalog saat ini, then tidak ada aturan R3/R7 yang hilang.
- Given DESIGN.md, when Lampiran A dibaca, then kalimat aturan berjalan mencantumkan LC-17 dan LC-19 dan Cara cek sesuai implementasi.

## Implementation Notes

- **Frasa:** `packages/schema/src/content-rules.ts` (`FORBIDDEN_PHRASES` id/en urut DESIGN.md, `FORBIDDEN_EXEMPT` {inside `Input /`, layer `Label`}, `forbiddenPhrasesIn` → `{phrase, lang}[]` urut daftar, tanpa duplikat), `export *` di `index.ts`. Regex per frasa memakai flag `iu` (bukan `giu`: `test()` dengan `g` menyimpan `lastIndex` antarpanggilan); batas `(?<![\p{L}\p{N}_])…(?![\p{L}\p{N}_])`, spasi → `\s+`, `-` → `[-‐‑]`. `tests/content-rules.test.ts` (5 tes): `polish.md` baris "Frasa terlarang (kata utuh):" = id+en; DESIGN.md `- **id:**`/`- **en:**` (`describe.skipIf`); fungsi positif/negatif.
- **Skema:** LC-17 `struktur seksi mirip`, LC-19 `frasa terlarang` (warning, `gate:false`), urut ID; `findings.test.ts`.
- **Check:** `lc17`, `lc19` di `rules.ts` (`SECTION_SIMILARITY_MIN` 0,9, `SECTION_MIN_NODES` 6, diekspor); `checkBoard` + `RULE_ORDER` (LC-17 setelah LC-16, LC-19 setelah LC-18). `index.test.ts`: describe LC-17 (9 tes) dan LC-19 (3 tes) via `runAll()`; `G1_FILTERED` + LC-17/LC-19. Detail LC-17 `mirip <nama> (<id>): <pct>%` (bulat), LC-19 `frasa terlarang "<frasa>" (<lang>)[, …] di <quote>`.
- **Penyimpangan dari Design Notes (umum, lihat Plan Change Log):** fallback tumpukan utama melewati anak `layout:'row'`.
- **MCP:** `LAYOUT_CHECK_DESCRIPTION` menyebut LC-17 dan LC-19 dengan frasa diinterpolasi dari `FORBIDDEN_PHRASES`; `tests/execute-description.test.ts` + 1 tes. `round.test.ts`: `r3r7Missing()` = `semua aturan katalog …`, frozen tak terbaca → sama.
- **Skill (C7):** tidak ada entri `PENDING_2_10` baru (contoh `polish.md` yang memicu LC-17 ternyata positif palsu → definisi diperbaiki).
- **Pindaian arsip** (`after6.json`, 120 dok, 157 board, 0 gagal, gateDocs 80): `cmp6.mjs after5b.json after6.json` → aturan lama identik per dokumen (diffOther 0), gagal gerbang 80 → 80. LC-17 0, LC-19 0 (sama dengan prototipe). Pasangan terdekat 0,83 (Rakit Kode), Kasku golden A 0,82; ≥ 0,75: 18 pasangan / 14 dok, sama sebelum/sesudah perbaikan row. LOG.md §2.6.
- **DESIGN.md** Lampiran A (di disk; cadangan `<scratchpad>/DESIGN.before6.md`): kalimat aturan berjalan + Cara cek LC-17/LC-19 + catatan sumber data frasa di bawah daftar.
- **Verifikasi:** `pnpm build` lulus; check 210/210, schema 125/125, `tests/content-rules.test.ts` 5/5 (+ token, deskripsi 29/29), bench 213/213; `pnpm test` 1076/1077 (gagal hanya latensi `visual.test.ts` saat paralel; sendiri 18/18). lakard di-restart; execute board landing (`uji-g1-6-konten`) dengan dua `Seksi /` identik + `Button / Info` "Pelajari lebih lanjut" → `warning · LC-17 · Seksi / Manfaat · mirip Seksi / Fitur (…): 100%`, `warning · LC-19 · Teks · frasa terlarang "pelajari lebih lanjut" (id)` (juga judul "Judul Fitur" → LC-19 "judul fitur"), 0 gerbang; dok uji dihapus (file + history), lakard di-restart lagi. `verify.sh` semua OK, Node sistem v22.23.5.

## Plan Change Log

- 2026-11-19 (build): LC-17 fallback tumpukan utama — kandidat seksi melewati anak `layout:'row'`. Contoh skill `polish.md` (daftar pinjaman tanpa `Seksi /`) memicu LC-17 pada baris `Item / …` (`layout:'row'`) di tumpukan `Daftar pinjaman`: baris daftar, bukan seksi. Perbaikan definisi umum (sejalan dengan "anak row/grid bukan seksi"), bukan `PENDING_2_10`; fixture negatif baru; arsip tidak berubah.

## Review Triage Log

## Design Notes

**LC-17.** Kandidat seksi: frame terlihat bernama `Seksi /`; pasangan leluhur–keturunan dilewati. Bila board tidak punya `Seksi /`: tumpukan utama = turun dari board selama wadah hanya punya satu anak flow (selain `Overlay /`, `Status bar`, `Home indicator`) berupa frame; kandidat = anak flow frame wadah itu, hanya bila wadah kolom (board atau `layout:'column'`) — anak row/grid (kartu dalam grid, sidebar + main) bukan seksi. Multiset per seksi = semua keturunan terlihat (kedalaman penuh), token `text <size>` untuk teks, `type` untuk lainnya (`frame`, `icon`, `rect`, `ellipse`, `path`); jumlah dihitung (anak berulang tidak diciutkan), sehingga pola sama dengan jumlah isi berbeda (3 vs 4 baris) tidak dianggap mirip. Seksi < 6 node dilewati. Jaccard multiset = Σmin/Σmax ≥ 0,9 → satu temuan per seksi kedua (pasangan terbaik), detail `mirip <nama> (<id>): 93%`, expected `variasikan komposisi antar-seksi (tata letak, jenis isi), bukan judul + kartu identik berulang`. Prototipe arsip: 0 pasangan ≥ 0,9 untuk varian datar, dengan kedalaman, maupun diciutkan (maks 0,83 datar; diciutkan 52 pasangan ≥ 0,75 → lebih bising, ditolak). Golden B (Jadwal = daftar, Program = 2 kartu) dan A (kasku) di arsip ≤ 0,82.

**LC-19.** Teks terlihat tidak kosong; dilewati bila teks atau leluhurnya bernama `Input /…` atau bernama tepat `Label`. Cocok tanpa beda huruf, batas kata Unicode (huruf/angka/`_` tidak boleh menempel), spasi dalam frasa = satu atau lebih whitespace, tanda baca di sekitar boleh. Satu temuan per teks, detail `frasa terlarang "<frasa>" (<lang>)[, …] di <quote>`, expected `ganti dengan aksi/klaim spesifik dari konten`. Bahasa dokumen tidak diketahui → semua daftar diperiksa, bahasa disebut di detail. Prototipe arsip: 0 kemunculan (substring sekalipun) → siaga, dibuktikan fixture.

## Verification

**Commands:**
- `/opt/node-26/bin/pnpm build` -- expected: lulus.
- `/opt/node-26/bin/pnpm --filter @lakar/check test`, `--filter @lakar/schema test`, `--filter @lakar/bench test` -- expected: lulus.
- `/opt/node-26/bin/pnpm test` -- expected: lulus (kecuali latensi `visual.test.ts`/kinerja 500 node saat paralel; ulang sendiri).
- (dari `/root/lakar`) `/opt/node-26/bin/node <scratchpad>/archcheck.mjs /root/lakar <scratchpad>/after6.json $(cat <scratchpad>/docs.txt)` -- expected: 120 dok, 0 gagal, gateDocs 80.
- `tools/node26/verify.sh` -- expected: semua OK, Node sistem v22.
