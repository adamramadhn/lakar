---
title: 'Check tipografi dan spacing: LC-03, 06, 07, 08, 09, 10'
type: feature
ticket: '5'
created: '2026-11-19'
status: built
baseline_revision: '69ae44de6ed0527d87ed4954cf725199212dc19d'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/tickets/story-check-tipografi-dan-spacing-lc-03-06-07-08-09-10.md'
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/tickets/story-check-luapan-non-teks-dan-konten-terpotong-di-tepi-board-plan.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `@lakar/check` belum menjalankan LC-03, LC-06, LC-07, LC-08, LC-09, LC-10 dari DESIGN.md Lampiran A (epic G1 R1), dan angka token spacing/skala tipe hanya ada di skill (prelude `TY` + baris "Jarak:" di `core.md`) dan frontmatter DESIGN.md, tanpa modul kode bersama.

**Approach:** Modul data token bersama `@lakar/schema` (`design-tokens.ts`) menjadi satu-satunya sumber angka untuk check, dengan tes kesesuaian terhadap prelude `core.md` (dan DESIGN.md bila ada di disk). Enam aturan warning murni di `rules.ts` dijalankan di `checkBoard`. Definisi dikalibrasi dari prototipe atas arsip 120 dokumen (Design Notes); pemindaian arsip akhir mencatat jumlah warning per aturan + contoh; gagal gerbang tetap 80.

## Boundaries & Constraints

**Always:**
- Keenam aturan level `warning`, `gate:false`; bentuk temuan AD-8; detail ≤ 120 karakter (`clip120`); maks 3 per aturan per board lewat `capWarnings` yang ada.
- Angka token (spacing, skala tipe, ukuran komponen, minimum paragraf, target sentuh) hanya didefinisikan di `packages/schema/src/design-tokens.ts`; `rules.ts` mengimpornya, tidak menyalin angka.
- Positif palsu diperbaiki di definisi umum aturan, bukan pengecualian per dokumen/board.
- Aturan lama di arsip identik per dokumen dengan `after15b.json`; dokumen gagal gerbang tetap 80.
- C9: hanya `/opt/node-26/bin/pnpm`/`node`; tanpa npx, paket global, PATH/profil, port tetap, container. Restart hanya `systemctl --user restart lakard`. Akhiri `tools/node26/verify.sh`.
- Commit di `g1` (tanpa ganti branch/push/merge), akhiran `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Never:**
- Jangan ubah `packages/skills/**` (C7); contoh skill yang memicu aturan baru → `PENDING_2_10` di `packages/daemon/src/skills-examples.test.ts` dengan pencocokan persis (aturan + regex nama node berjangkar + awal detail) dan dicatat untuk 2.10.
- Jangan panggil MCP pencil, sentuh `.pen`, jalankan `claude -p`/run bench, tampilkan key Unsplash, sunting tangan `bench/*-<k>.md` hasil harness, atau tinggalkan proses daemon sementara.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| LC-03 fixed | teks `wrap:'fixed'` ukur `lines` 2 | warning LC-03 `wrap fixed: 2 baris` | — |
| LC-03 kotak | teks (wrap apa pun) dengan ink melewati bounds-nya > 1px di kiri/kanan, atau `lines × lineHeight` > tinggi bounds + 1 | warning LC-03 | — |
| LC-03 negatif | `wrap:'fixed'` 1 baris; ink lebih 1px; teks kosong; teks tak terlihat | tidak ada | — |
| LC-06 positif | landing/mobile: teks 14px, 2 baris, ≥ 6 kata, berat < 600, di luar kartu; kartu ber-cat: 12px 2 baris ≥ 6 kata; app: 12px 2 baris | warning LC-06 | — |
| LC-06 negatif | app 14px 2 baris; landing 14px di kartu ber-cat; judul 2 baris berat 600; 2 baris < 6 kata; 1 baris; di dalam komponen (`Button /`, `Chip /`, …) | tidak ada | — |
| LC-07 positif | frame gap 10, padding `[0,10]`, padding 112; `Chip /` height 28; `IconButton /` width 36 | satu warning per frame, detail daftar nilai (`gap 10, padding 10`) | — |
| LC-07 negatif | gap/padding ∈ {0,2,4,6,8,12,16,20,24,32,40,48,64,80,96,128}; gap negatif; padding bawah 34 (inset home indicator); `Status bar`/`Home indicator` beserta keturunannya; komponen height 44 atau 56; width `Button /` bebas; frame bukan komponen dengan height bebas | tidak ada | — |
| LC-08 ukuran | teks 13px; `KPI / Nilai` 56 | warning LC-08 | — |
| LC-08 triple | 16/20; 32 tanpa `lineHeight` (default terukur 39) | warning LC-08 `16/20 (token 16/24)` | — |
| LC-08 negatif | 16/24, 20/28, 22/28, 12/16 (±0,5); `KPI / Nilai` 32/38,4; `Display / …` 72/80 | tidak ada | — |
| LC-09 | teks terlihat dengan 3 keluarga non-mono (keluarga kosong = Inter) → 1 warning di board; 2 keluarga + `JetBrains Mono` → tidak | — | — |
| LC-10 positif | board `screen:'mobile'` lebar 390: `IconButton /` 40×40, `Link / Semua` (teks) tinggi 20, `Tab /` 169×40 | warning LC-10 `40×40 < 44×44` | — |
| LC-10 negatif | sama di board app/landing; mobile lebar 744; `Button /` 342×48; `Badge /` kecil; node tak terlihat | tidak ada | — |
| Tes token | prelude `core.md` `TY` dan baris "Jarak:", frontmatter DESIGN.md (bila file ada) | sama dengan `design-tokens.ts` | DESIGN.md tidak ada → tes DESIGN dilewati (`skipIf`), tes `core.md` tetap jalan |

</intent-contract>

## Code Map

- `packages/schema/src/design-tokens.ts` (baru) + ekspor di `packages/schema/src/index.ts` -- `SPACING` (token → px, sama dengan frontmatter DESIGN.md `spacing` tanpa `page-margin-*`/`content-max`), `SPACING_VALUES` (Set: 0 ∪ nilai `SPACING`), `TYPE_SCALE` (nama DESIGN.md: `display-xl`…`overline`, `data` → `{size, lineHeight, weight, letterSpacing}`), `KPI_SIZES` [28,32,40] + `KPI_LINE_HEIGHT_RATIO` 1.2, `DISPLAY_SIZES` [72,80], `COMPONENT_SIZES` [44,56] (icon-button/stepper/table-row compact 44, table-row/bilah bawah 56), `HOME_INDICATOR_INSET` 34, `TOUCH_MIN` 44, `PARAGRAPH_MIN` `{landing:16, mobile:16, app:14}` + `PARAGRAPH_MIN_IN_CARD` 14 (body-sm kartu, DESIGN.md §Landing kartu fitur). Komentar: sumber = DESIGN.md frontmatter, dijaga tes kesesuaian.
- `tests/design-tokens.test.ts` (baru) -- baca `packages/skills/skills/core.md`: ambil baris `const R=` dan `const TY=` dari blok prelude, evaluasi (`new Function`), cocokkan size/lineHeight/weight/letterSpacing dengan `TYPE_SCALE` (peta `title-lg`→`mobile-title-lg`, `title`→`mobile-title`, `tab`→`tab-label`; `data` tidak ada di prelude); ambil daftar angka dari baris prosa `- Jarak: …` (+2, 6) = `SPACING_VALUES`. `describe.skipIf(!existsSync(DESIGN))`: parse frontmatter DESIGN.md (regex baris, tanpa dependensi baru) untuk `typography` (size/lineHeight px) dan `spacing` (px) = modul; `components.icon-button.size`, `stepper.button-size`, `mobile-bottom-bar` 34 dan `button-height` 56 ⊂ modul.
- `packages/schema/src/findings.ts` -- tambah LC-03 (`teks tetap berisiko meluber`), LC-06 (`paragraf di bawah minimum`), LC-07 (`spacing di luar himpunan`), LC-08 (`font di luar skala atau triple tidak cocok`), LC-09 (`lebih dari 2 keluarga font`), LC-10 (`target sentuh kecil`) urut ID; semua warning `gate:false`. `findings.test.ts` daftar ID.
- `packages/check/src/rules.ts` -- `lc03`, `lc06`, `lc07`, `lc08`, `lc09`, `lc10` (pakai `texts`, `nonEmpty`, `visibleRect`, `paintedCard`, `ancestors`, `named`, `paddingOf`, `levelOf`, `clip120`, `num`, `quote`; `ctx.textMeasure`, `ctx.ink`, `ctx.bounds`). Daftar komponen interaktif LC-10 dan komponen LC-07 sebagai konstanta lokal (nama, bukan angka).
- `packages/check/src/index.ts` -- `checkBoard` + `RULE_ORDER` (urut ID) + ekspor aturan baru.
- `packages/check/src/index.test.ts` -- describe per aturan memakai `runAll()`/`docOf` yang ada (`run()` menyaring aturan G1 — tambahkan enam aturan baru ke saringan itu agar fixture G0 lama tidak patah).
- `packages/mcp/src/server.ts` `LAYOUT_CHECK_DESCRIPTION`/deskripsi execute -- sebut LC-03/06/07/08/09/10; sesuaikan `tests/execute-description.test.ts` bila mencocokkan teks.
- `bench/src/round/round.test.ts` (baris ~751–760) -- `r3r7Missing()` kini hanya `LC-17`; `bench/src/round/report.ts` tidak diubah logikanya.
- `packages/daemon/src/skills-examples.test.ts` `PENDING_2_10` -- entri persis untuk contoh skill yang memicu aturan baru (perkiraan: `webapp.md` `Nav / …`/`Grup label` padding 10 → LC-07; `mobile.md` `Link / Semua` → LC-10; jalankan untuk daftar pasti).
- Tes lain yang mengharapkan 0 warning (daemon/mcp/bench/golden) -- perbaiki fixture-nya (nilai token) bila fixture sintetis yang memicu; jangan longgarkan aturan.
- `_bmad-output/initiative-lakar/ux-lakar/DESIGN.md` Lampiran A (di-exclude git; salin dulu ke `<scratchpad>/DESIGN.before5.md`) -- kalimat aturan berjalan + kolom Cara cek LC-03/06/07/08/09/10 sesuai Design Notes.
- `bench/practice/LOG.md` -- §2.5 pemindaian arsip (pola §2.15: tabel per aturan, contoh, kewajaran).
- Scratchpad `/tmp/claude-0/-root-lakar/28ec6272-7bb0-49b1-9470-ffa46c6812fb/scratchpad/`: `archcheck.mjs <root> <out> [--shots R,..] $(cat docs.txt)` (jalankan dari `/root/lakar`; daemon dist sementara, port acak, dimatikan sendiri), `cmp15.mjs` (pola pembanding), baseline `after15b.json`; prototipe `s5/proto5.mjs`, `s5/p6.mjs` + `s5/proto.json` (atas `measures.json`, tanpa render, tanpa cap).

## Tasks & Acceptance

**Execution:**
- [x] `packages/schema/src/design-tokens.ts`, `index.ts`, `tests/design-tokens.test.ts` -- modul token + tes kesesuaian.
- [x] `packages/schema/src/findings.ts`, `findings.test.ts` -- enam aturan.
- [x] `packages/check/src/rules.ts`, `index.ts` -- enam aturan sesuai Design Notes.
- [x] `packages/check/src/index.test.ts` -- fixture setiap baris matriks (positif + negatif), termasuk cap `(+n serupa)` LC-07.
- [x] `packages/mcp/src/server.ts` + `tests/execute-description.test.ts`; `bench/src/round/round.test.ts`.
- [x] Build, `pnpm test`; perbaiki tes yang patah karena fixture sintetis; `skills-examples.test.ts` → `PENDING_2_10` persis.
- [x] Pindaian arsip: `archcheck.mjs /root/lakar <scratchpad>/after5.json --shots LC-03,LC-10 $(cat docs.txt)`; bandingkan dengan `after15b.json` (aturan lama identik per dokumen, gagal gerbang 80); hitung warning per aturan baru (sesudah cap) + jumlah dokumen; buka crop sampel LC-03/LC-10; definisi yang jelas salah → perbaiki umum, ulang. Catat di LOG.md §2.5 + Implementation Notes (bandingkan dengan angka prototipe tanpa cap di Design Notes).
- [x] DESIGN.md Lampiran A di disk.
- [x] `pnpm build`, `pnpm test`, `systemctl --user restart lakard`, `tools/node26/verify.sh`, commit.

**Acceptance Criteria:**
- Given build sesudah story, when `/opt/node-26/bin/pnpm --filter @lakar/check test` dan `vitest run tests/design-tokens.test.ts`, then fixture positif/negatif enam aturan dan tes kesesuaian token lulus.
- Given lakard yang di-restart, when `execute` membuat board mobile 390×844 berisi `IconButton /` 40×40 dan teks 13px, then respons execute memuat `warning · LC-10` dan `warning · LC-08`, dan `summary.gate` tidak bertambah.
- Given arsip 120 dokumen, when dipindai, then aturan lama identik dengan `after15b.json`, gagal gerbang 80, dan LOG.md §2.5 mencatat jumlah warning per aturan baru beserta contoh dan penilaian kewajaran.
- Given DESIGN.md, when Lampiran A dibaca, then kalimat aturan berjalan mencantumkan LC-03, LC-06, LC-07, LC-08, LC-09, LC-10 dan kolom Cara cek sesuai implementasi.

## Implementation Notes

- **Token:** `packages/schema/src/design-tokens.ts` (`SPACING`, `SPACING_VALUES`, `TYPE_SCALE` 16 token, `KPI_SIZES`, `KPI_LINE_HEIGHT_RATIO`, `DISPLAY_SIZES`, `COMPONENT_SIZES`, `HOME_INDICATOR_INSET`, `TOUCH_MIN`, `PARAGRAPH_MIN`, `PARAGRAPH_MIN_IN_CARD`), diekspor dari `@lakar/schema`. `tests/design-tokens.test.ts` (5 tes): prelude `core.md` `TY` (dievaluasi) + baris "Jarak:" (+2, 6); frontmatter DESIGN.md (`describe.skipIf`) typography/kpi/spacing/komponen.
- **Skema:** LC-03, 06, 07, 08, 09, 10 (warning, `gate:false`) urut ID; `findings.test.ts`.
- **Check:** `lc03`, `lc06`, `lc07`, `lc08`, `lc09`, `lc10` di `rules.ts` (konstanta nama lokal `SMALL_COMPONENTS`, `SQUARE_CONTROLS`, `TOUCH_COMPONENTS`, `CHROME_FRAMES`; angka dari design-tokens), `checkBoard` + `RULE_ORDER` + ekspor. `index.test.ts`: 6 describe (16 tes) sesuai matriks, cap `(+2 serupa)` LC-07; `run()` menyaring keenam aturan baru (fixture G0 lama tetap).
- **Penyimpangan dari Design Notes (umum, lihat Plan Change Log):** LC-08 melewati teks < 12px (sudah error LC-05) dan `KPI / Nilai` 28/32/40 menerima size × 1,2 **atau** line-height token berukuran sama.
- **Fixture sintetis:** daemon `index.test.ts` dan mcp `index.test.ts` diberi `lineHeight` token (16/24, 12/16, 24/32, 28/36, 14/20) dan `Harga` 13px → 12/16 di tes latensi; aturan tidak dilonggarkan.
- **Skill (C7, untuk 2.10):** `PENDING_2_10` persis: `mobile.md` LC-10 `Link / Semua` `82.2×20 < 44×44`; `webapp.md` LC-07 `Grup label`/`Nav / (Ringkasan|Pesanan|Antar-jemput|Pendapatan|Pelanggan)` `padding 10`; `api.md` LC-08 `Judul` `32/39`, `40/49`, `16/20`.
- **MCP:** `LAYOUT_CHECK_DESCRIPTION` menyebut keenam aturan (+ tes deskripsi). Deskripsi execute merujuk ke layout_check (tidak diubah). `round.test.ts`: `r3r7Missing()` = `LC-17`.
- **Pindaian arsip** (`after5.json`, 120 dok, 157 board, 0 gagal): aturan lama identik per dokumen dengan `after15b.json`, gagal gerbang 80. Sesudah cap: LC-03 56/26 dok (prototipe 84/26), LC-06 13/7 (13/7), LC-07 250/78 (497/79), LC-08 155/61 (ukuran 19/11, triple 137/57; prototipe 57/9 + 124/46), LC-09 0 (0), LC-10 110/44 (153/±46). Pindaian pertama LC-08 206 (119 KPI dengan triple skala sah) → definisi KPI diperbaiki umum, pindai ulang. Crop LC-03/LC-10 sampel: cacat nyata (glyph terpotong kotak teks; Tab 169×40, IconButton 32×32, Button 72×40). Rincian di `bench/practice/LOG.md` §2.5.
- **DESIGN.md** Lampiran A (di disk; cadangan `<scratchpad>/DESIGN.before5.md`): kalimat aturan berjalan + baris LC-03/06/07/08/09/10 sesuai implementasi.
- **Verifikasi:** `pnpm build` lulus; check 197/197, schema lulus, `tests/design-tokens.test.ts` 5/5; `pnpm test` 1057/1058 (gagal hanya latensi `visual.test.ts` saat paralel; sendiri 18/18). lakard di-restart; execute board mobile 390×844 berisi `IconButton /` 40×40 + teks 13px → `warning · LC-10 · 40×40 < 44×44`, `warning · LC-08 · 13/20 di luar skala`, 0 gerbang (dok uji `uji-g1-5-tipografi` di data lakard). `verify.sh` semua OK, Node sistem v22.23.5.

## Plan Change Log

- 2026-11-19 (build): LC-08 — (1) teks < 12px dilewati (sudah error LC-05; fixture daemon `Caption` 11px akan dilaporkan ganda); (2) `KPI / Nilai` ukuran 28/32/40 menerima line-height size × 1,2 atau token skala berukuran sama (pindaian: 119 dari 206 temuan adalah KPI 28/36 dan 32/40 = triple `mobile-title-lg`/`h2` yang sah). Perbaikan definisi umum, bukan pengecualian per dokumen.

## Review Triage Log

### 2026-11-19 — Review pass
- verdicts: 4 findings — high 0, medium 1, low 3, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` `lc07`/`lc08` `expected` mengetik ulang angka token (`0/2/4/…/128; 44/56`, `12/16, 14/20, …`) di `rules.ts` — melanggar "angka hanya di design-tokens.ts"; teks saran akan menyimpang bila modul berubah. Diperbaiki: `LC07_EXPECTED` dari `SPACING_VALUES` + `COMPONENT_SIZES`, `LC08_EXPECTED` dari `TYPE_SCALE` (semua pasangan size/lineHeight).
  - `[low]` `[patch]` `LAYOUT_CHECK_DESCRIPTION` (`packages/mcp/src/server.ts`) mengetik ulang angka LC-06/07/08/10 — diperbaiki: angka diinterpolasi dari impor `@lakar/schema` (`PARAGRAPH_MIN*`, `SPACING_VALUES`, `HOME_INDICATOR_INSET`, `COMPONENT_SIZES`, `KPI_*`, `DISPLAY_SIZES`, `TOUCH_MIN`); deskripsi kini juga memisah app 14 vs kartu 14.
  - `[low]` `[patch]` `lc06` expected di board app menulis `≥ 14px (body)` padahal 14 = `body-sm` — diperbaiki: nama token dicari dari `TYPE_SCALE` (berat 400, ukuran = minimum); fixture app kini memeriksa `≥ 14px (body-sm)`.
  - `[low]` `[patch]` LC-03 memberi warning pada teks yang sudah error LC-02b/LC-02a (satu cacat, dua temuan) — terverifikasi di arsip (LC-03 56 → 46 setelah perbaikan); `checkBoard` meneruskan id LC-02a ∪ LC-02b ke `lc03(ctx, skip)`; fixture baru (LC-02b ada, LC-03 tidak).
- Perbaikan diterapkan langsung oleh orkestrator (patch kecil). Pindaian ulang `after5b.json`: aturan lama identik dengan `after15b.json`, gagal gerbang 80, aturan baru selain LC-03 identik dengan `after5.json`.

## Design Notes

**LC-03.** Teks tidak kosong, terlihat (`visibleRect`). (a) `wrap:'fixed'` dengan `textMeasure.lines ≥ 2` → `wrap fixed: n baris terukur`. (b) Teks melewati kotaknya: ink (`ctx.ink`) melewati bounds-nya > 1px di kiri/kanan (teks `auto` yang disusutkan flex: prototipe 84 kasus / 26 dok, mis. `Meta`/`Nama` di sel tabel Dentara), atau `lines × lineHeight` > tinggi bounds + 1 (wrap/fixed dengan tinggi angka). Satu temuan per teks (a didahulukan). Expected: `wrap:'wrap' dengan lebar fill/angka, atau beri ruang`.

**LC-06 "paragraf".** Teks terlihat, `lines ≥ 2`, ≥ 6 kata, berat < 600, bukan di dalam komponen (`Button /`, `IconButton /`, `Badge /`, `Chip /`, `Tab /`, `Link /`, `Input /`, `Radio /`, `Checkbox /`, `Stepper /`). Minimum: `PARAGRAPH_MIN[screen]`; di dalam kartu ber-cat (leluhur frame `paintedCard`) minimum `PARAGRAPH_MIN_IN_CARD` 14, karena DESIGN.md sendiri mengajarkan deskripsi kartu `body-sm`. Prototipe tanpa syarat ini: 348 temuan di kartu (deskripsi kartu fitur 14px) + 11 judul pendek 2 baris → bising; dengan definisi ini 13 temuan / 7 dok, semuanya metadata 12px yang terbungkus 2 baris.

**LC-07 "ukuran komponen".** Dinilai per frame (bukan board), kecuali frame bernama/berleluhur `Status bar`/`Home indicator`: `gap` ≥ 0 dan setiap sisi `padding` ∈ `SPACING_VALUES`; padding bawah 34 sah (`HOME_INDICATOR_INSET`, bilah bawah/tab bar). Ukuran komponen = hanya `height` angka frame bernama komponen (`Button /`, `IconButton /`, `Badge /`, `Chip /`, `Tab /`, `Link /`, `Input /`, `Radio /`, `Checkbox /`, `Stepper /`), plus `width` angka untuk kontrol persegi (`IconButton /`, `Checkbox /`, `Radio /`); sah = `SPACING_VALUES` ∪ `COMPONENT_SIZES`. Lebar tombol/kartu dan ukuran frame non-komponen tidak dinilai (bebas mengikuti konten). Satu temuan per frame, detail `gap 10, padding 10/112, height 28`. Prototipe: 497 frame / 79 dok sebelum cap (terbanyak padding 10, height 52 `Tab /`, gap 10, height 28 `Chip /`, padding seksi 112/120); padding 34 `Overlay / Bilah bawah` (22) dibebaskan oleh inset.

**LC-08.** Teks terlihat tidak kosong. `Display /`: ukuran ∈ skala ∪ `DISPLAY_SIZES`, line-height tidak dinilai. `KPI / Nilai`: ukuran ∈ skala ∪ `KPI_SIZES`; untuk `KPI_SIZES` line-height = size × 1,2 (±0,5). Lainnya: ukuran ∈ ukuran `TYPE_SCALE`; line-height (deklarasi, atau terukur bila tidak ada) harus dalam 0,5px dari line-height salah satu token berukuran sama. Detail `13/20 di luar skala` atau `16/20 (token 16/24)`. Prototipe: ukuran 57 / 9 dok (13px `Jam`/`Kode`, KPI 56), triple 124 / 46 dok.

**LC-09.** Keluarga teks terlihat tidak kosong (`family ?? 'Inter'`), tanpa yang cocok `/mono/i` (mono arketipe: JetBrains Mono, IBM Plex Mono, DM Mono); > 2 → satu temuan pada board berisi daftar. Prototipe: 0 (siaga).

**LC-10.** Board `screen:'mobile'` dengan lebar terukur ≤ 430. Node (tipe apa pun, termasuk teks) bernama `Button /`, `IconButton /`, `Tab /`, `Input /`, `Radio /`, `Checkbox /`, `Stepper /`, `Link /`, terlihat, bounds lebar atau tinggi < 44 − 0,5. Semua node dinilai (juga yang bersarang). Prototipe: 153 / ±46 dok; 117 di antaranya `Link / Semua` teks 20px dari pola `mobile.md` (temuan untuk 2.10), sisanya `IconButton /` 32–40, `Tab /` 40/36, `Button /` 72×40.

## Verification

**Commands:**
- `/opt/node-26/bin/pnpm build` -- expected: lulus.
- `/opt/node-26/bin/pnpm --filter @lakar/check test`, `--filter @lakar/schema test` -- expected: lulus.
- `/opt/node-26/bin/pnpm test` -- expected: lulus (kecuali latensi `packages/render/test/visual.test.ts` / kinerja check 500 node saat paralel; ulang file itu sendiri).
- (dari `/root/lakar`) `/opt/node-26/bin/node <scratchpad>/archcheck.mjs /root/lakar <scratchpad>/after5.json --shots LC-03,LC-10 $(cat <scratchpad>/docs.txt)` -- expected: 120 dok, 0 gagal, gateDocs 80, aturan lama sama dengan `after15b.json`.
- `tools/node26/verify.sh` -- expected: semua OK, Node sistem v22.

**Manual checks (if no CLI):**
- Crop `<scratchpad>/shots/LC-03-*`, `LC-10-*` (sampel) — cacat nyata atau definisi diperbaiki.

## Auto Run Result

Status: built

**Ringkasan:** Modul token bersama `packages/schema/src/design-tokens.ts` (spacing, skala tipe, KPI/Display, ukuran komponen 44/56, inset 34, target sentuh 44, minimum paragraf) dijaga `tests/design-tokens.test.ts` terhadap prelude `core.md` (`TY`, baris "Jarak:") dan frontmatter DESIGN.md (dilewati bila file tidak ada). Enam aturan warning tanpa gerbang: LC-03 (`wrap:'fixed'` ≥ 2 baris, atau ink/baris melewati kotak teks; teks yang sudah LC-02a/LC-02b dilewati), LC-06 (paragraf = ≥ 2 baris, ≥ 6 kata, berat < 600, bukan komponen; < 16 landing/mobile, < 14 app, < 14 di kartu ber-cat), LC-07 (gap/padding per frame ∉ himpunan spacing, padding bawah 34 sah, `Status bar`/`Home indicator` bebas; ukuran komponen = `height` frame komponen + `width` kontrol persegi, sah juga 44/56), LC-08 (≥ 12px: ukuran ∉ skala atau line-height meleset > 0,5 dari token berukuran sama; `KPI / Nilai` 28/32/40 dengan ×1,2 atau token; `Display /` 72/80 tanpa cek line-height), LC-09 (> 2 keluarga non-mono), LC-10 (node interaktif < 44×44 di board mobile ≤ 430). Lampiran A DESIGN.md diperbarui di disk.

**File:** `packages/schema/src/design-tokens.ts` (baru, token), `packages/schema/src/index.ts` (ekspor), `packages/schema/src/findings.ts` (+test, katalog 6 aturan), `packages/check/src/rules.ts` (6 aturan), `packages/check/src/index.ts` (urutan, skip LC-03, ekspor), `packages/check/src/index.test.ts` (fixture), `tests/design-tokens.test.ts` (baru, kesesuaian token), `packages/mcp/src/server.ts` + `tests/execute-description.test.ts` (deskripsi), `packages/daemon/src/index.test.ts`, `packages/mcp/src/index.test.ts` (fixture line-height token), `packages/daemon/src/skills-examples.test.ts` (`PENDING_2_10`), `bench/src/round/round.test.ts` (`r3r7Missing` = LC-17), `bench/practice/LOG.md` §2.5.

**Review:** 4 temuan (1 medium, 3 low) — semua di-patch, 0 ditunda, 0 ditolak.

**Follow-up review:** tidak disarankan (1 medium + 3 low di-patch; tidak ada high, < 2 medium).

**Verifikasi:** `pnpm build` lulus; check 198/198, schema + token + deskripsi 148/148; `pnpm test` 1058/1059 — gagal hanya latensi `visual.test.ts` saat paralel (sendiri 18/18). Pindaian arsip `after5b.json` (120 dok, 157 board, 0 gagal): aturan lama identik per dokumen dengan `after15b.json`, gagal gerbang 80; LC-03 46/20 dok, LC-06 13/7, LC-07 250/78, LC-08 155/61, LC-09 0, LC-10 110/44 (sesudah cap). lakard di-restart (active); `tools/node26/verify.sh` semua OK; Node sistem v22.23.5.

**Risiko sisa:** LC-07/LC-08/LC-10 banyak memicu di arsip (78/61/44 dok) dan menurunkan R3 bench (LC-07/LC-06) — sebagian besar pola skill (`Link / Semua` 20px, padding 10 sidebar, KPI 28/32) untuk story 2.10; entri `PENDING_2_10` LC-10 `82.2×20` bergantung pada render font; LC-09 tanpa contoh arsip (fixture saja); paragraf LC-06 memakai ambang 6 kata dan pengecualian kartu ber-cat (keputusan definisi dari arsip).
