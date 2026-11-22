---
title: 'Check struktural: LC-13, 14, 15, 16, 21, 22'
type: feature
ticket: '4'
created: '2026-11-19'
status: built
baseline_revision: '5d022b1b834d62f5b110793a611e5d56eedba0f0'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/tickets/story-check-struktural-lc-13-14-15-16-21-22.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `@lakar/check` belum menjalankan LC-13, LC-14, LC-15, LC-16, LC-21, dan LC-22 dari DESIGN.md Lampiran A (epic G1 R1), dan katalog temuan belum mengenal level `info`.

**Approach:** Tambah enam aturan murni di `rules.ts` (satu fungsi per aturan, pola G0), level `info` di skema temuan, dan jalankan semuanya di `checkBoard` (otomatis di setiap execute dan `layout_check`). Temuan info tidak dikirim di respons execute (AD-8: execute memuat error dan warning) dan hanya muncul di `layout_check`. Setiap aturan punya fixture positif dan negatif. Pemindaian arsip (120 dokumen) membuktikan 0 positif palsu LC-16. Kalimat "Aturan yang sudah berjalan" di Lampiran A diperbarui.

## Boundaries & Constraints

**Always:**
- Bentuk temuan AD-8 `{level, rule, nodeId, nodeName, detail, expected}`; detail ≤ 120 karakter; warning DAN info maks 3 per aturan per board, kelebihan ditulis `(+n serupa)` di detail temuan ketiga (perluas `capWarnings`; error tidak dibatasi).
- Level: LC-13 info, LC-14 warning, LC-15 warning, LC-16 error `gate:false`, LC-21 warning, LC-22 info. Semua `gate:false`.
- Positif palsu diperbaiki di definisi aturan (umum), bukan pengecualian per dokumen/board.
- C9: hanya `/opt/node-26/bin/pnpm` dan `/opt/node-26/bin/node`; tanpa npx, paket global, port tetap baru. Restart daemon hanya `systemctl --user restart lakard`. Akhiri dengan `tools/node26/verify.sh`.
- Commit di branch `g1` (jangan ganti branch, push, atau merge) dengan akhiran `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Never:**
- Jangan ubah `packages/skills/**` (C7). Pola skill yang memicu aturan baru dicatat di Implementation Notes sebagai temuan untuk story 2.10.
- Jangan panggil tool MCP pencil, jangan sentuh `.pen`, jangan jalankan run bench/`claude -p`.
- Jangan tampilkan atau catat key Unsplash.
- Jangan biarkan proses daemon sementara tertinggal.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| LC-13 positif | node bernama `Rectangle 2`, `Group`, `svg12`, `Frame` | info LC-13 per node (maks 3 + `(+n serupa)`) | — |
| LC-13 negatif | `Image / Kamar`, `Teks`, `Rectangle besar` | tidak ada temuan | — |
| LC-14 positif | anak `position:'absolute'` di frame `layout:'row'`/`'column'` atau board, nama bukan konvensi | warning LC-14 | — |
| LC-14 negatif | `Overlay / …`, `Crop / …`, `Status bar`, `Home indicator`, anak absolut di frame `layout:'none'`, node di dalam leluhur `Overlay /`/`Crop /` | tidak ada temuan | — |
| LC-15 | ikon `lucide` + lib lain (fixture cast, mis. `phosphor`) → 1 warning di board; `lucide` + `simple-icons` → tidak | — | — |
| LC-16 | `path` 24×24 bernama `Centang` → error non-gerbang; `Chart / …`, `Shape / …`, path 88×32 → tidak | summary `gate` tidak bertambah | — |
| LC-21 radius | 4 nilai radius terlihat di luar 0 dan full → 1 warning di board; 3 nilai + pill/lingkaran → tidak | — | — |
| LC-21 spacer | frame tanpa anak dan tanpa cat (fill transparan/kosong, tanpa stroke/bayangan) atau rect tanpa cat, anak flow → warning; `Image /`, absolut, frame ber-fill → tidak | — | — |
| LC-21 padding ganda | board mobile: frame tak bercat selebar isi induk dengan padding kiri/kanan > 0 di bawah leluhur (sampai leluhur bercat pertama, inklusif) yang juga berpadding di sisi itu → warning; board app/landing, kartu bercat, komponen → tidak | — | — |
| LC-21 teks di baris tabel | ≥ 3 baris `layout:'row'` saudara dengan ≥ 3 anak flow, jumlah anak sama, x anak sejajar (≤ 1px), ≥ 3 anak berisi teks → warning per baris yang punya teks langsung; daftar ikon+teks+kontrol atau sel ber-frame → tidak | — | — |
| LC-21 bidang efek | dua bidang efek terpisah (mesh, blur dekoratif ≥ 24 ber-fill, atau conic/gradien multi-hue luas ≥ 20% layar) → 1 warning di board; satu bidang dengan beberapa node bertumpuk/bersarang, gradien satu hue/scrim, ring kecil → tidak | — | — |
| LC-22 | board dengan `Crop /`, `Overlay /`, `Scroll /`, `Ekstra /` → satu info `Crop n, Overlay n, Scroll n, Ekstra n`; board tanpa node konvensi → tidak ada temuan | — | — |
| execute vs layout_check | board memicu LC-13/LC-22 | respons execute (findings + summary) tanpa info; `layout_check` memuat info (urut setelah warning) dan `summary.info` | — |

</intent-contract>

## Code Map

- `packages/schema/src/findings.ts` -- `FindingLevel` (+`'info'`), `G0_RULES` (tambah 6 aturan, urut ID), `FindingSummary` (+`info`), `summarizeFindings`, `summaryText` (tambah `, n info` hanya bila > 0), `findingLine` (info → `info · …`). Nama `G0_RULES` dipertahankan (dibekukan bench).
- `packages/schema/src/findings.test.ts` -- asersi `gate === (level==='error')` harus diganti (LC-16 error non-gerbang); daftar ID dan warning.
- `packages/check/src/rules.ts` -- tambah `lc13`, `lc14`, `lc15`, `lc16`, `lc21`, `lc22`. Pakai ulang: `finding`, `texts`, `named`, `isFlowChild`, `paddingOf`, `fillsOf`, `dropShadow`, `parseHex`, `visibleRect`, `ancestors`, `descendants`, `textsIn`, `isComponent`/`inComponent`, `clip120`, `levelOf`. `capWarnings` dibatasi juga untuk `info`.
- `packages/check/src/index.ts` -- panggil aturan baru di `checkBoard`, tambah ke `RULE_ORDER`, ekspor; `sortFindings` urutan level error → warning → info.
- `packages/check/src/tree.ts` -- helper bersama bila perlu (mis. tanpa perubahan perilaku yang ada).
- `packages/check/src/index.test.ts` -- fixture per aturan dan per sub-cek LC-21. Fixture lama memakai nama `Teks`, rect bernama bebas; helper `run()` boleh tetap mengembalikan semua level, tetapi tes lama yang mengharapkan `[]` jangan sampai patah karena info (LC-22 hanya muncul bila ada node konvensi).
- `packages/daemon/src/server.ts` (~baris 400–420) -- execute: saring temuan `info` sebelum `summarizeFindings` dan `check.findings`; `/layout-check` (~baris 563) tetap penuh. `packages/daemon/src/check.ts` tidak perlu berubah.
- `packages/daemon/src/index.test.ts`, `packages/mcp/src/index.test.ts`, `bench/src/lakar/lakar.test.ts`, `bench/src/round/round.test.ts` (`r3r7Missing` kini `LC-03/06/07/17`) -- sesuaikan bentuk `summary` (+`info`) dan ekspektasi.
- `packages/mcp/src/server.ts` -- `formatExecute`/`formatLayoutCheck` memakai `summaryText`; tidak perlu logika baru.
- `bench/src/round/score.ts` -- tidak diubah: R7 menghitung LC-16 sebagai error non-gerbang dan warning LC-14/21 struktural; LC-13 info tidak dihitung.
- `_bmad-output/initiative-lakar/ux-lakar/DESIGN.md` Lampiran A (baris ~473–502) -- kalimat "Aturan yang sudah berjalan di G0" → cantumkan LC-13–16, LC-21, LC-22; jelaskan info hanya di `layout_check`; isi kolom "Cara cek" LC-13/14/15/16/21/22 sesuai implementasi; LC-16 level "error (bukan gerbang)".
- `bench/practice/LOG.md` -- tambah §2.4 pemindaian arsip (pola §1.24).
- Skrip arsip (scratchpad, di luar repo): `/tmp/claude-0/-root-lakar/28ec6272-7bb0-49b1-9470-ffa46c6812fb/scratchpad/archcheck.mjs <root> <out.json> [--shots RULE,..] <docs...>`; daftar dokumen `.../scratchpad/docs.txt` (120 dok: `bench/runs/**`, `~/.local/share/lakar/docs`, `~/.local/share/lakar/archive`); baseline `.../scratchpad/base.json` (dist HEAD `5d022b1`: 120 dok, 157 board, 0 gagal, gateDocs 74). Skrip menyalakan daemon dist sementara (port acak, dataDir salinan) dan mematikannya.

## Tasks & Acceptance

**Execution:**
- [x] `packages/schema/src/findings.ts`, `findings.test.ts` -- level `info`, enam aturan baru, `summary.info`, `summaryText` -- katalog sesuai Lampiran A.
- [x] `packages/check/src/rules.ts`, `index.ts` -- enam aturan (lihat Design Notes), cap info, urutan level -- R1.
- [x] `packages/check/src/index.test.ts` -- fixture positif dan negatif tiap baris matriks, termasuk lima sub-cek LC-21, cap `(+n serupa)` untuk info, LC-16 tidak menambah `gate` -- bukti R1.
- [x] `packages/daemon/src/server.ts` + tes daemon/mcp/bench terkait -- execute tanpa info; layout_check dengan info; tes daemon membuktikan keduanya -- AD-8.
- [x] Pindaian arsip: build, jalankan `archcheck.mjs /root/lakar <after.json> --shots LC-16 $(cat docs.txt)`, bandingkan dengan `base.json` per aturan per level. Aturan lama harus identik per dokumen. Setiap temuan LC-16 diperiksa lewat crop PNG; positif palsu → perbaiki definisi umum lalu ulang. Tinjau contoh warning/info per aturan baru (ambil crop untuk sampel LC-14/LC-21) dan perbaiki definisi bila jelas salah. Catat tabel di `bench/practice/LOG.md` §2.4 dan Implementation Notes.
- [x] `DESIGN.md` Lampiran A -- kalimat aturan berjalan + cara cek baris baru.
- [x] Temuan untuk 2.10: daftar pola `packages/skills/skills/*.md` yang memicu aturan baru (mis. teks langsung di baris tabel `webapp.md`), tanpa mengubah skill.
- [x] `pnpm build`, tes, `systemctl --user restart lakard` (dist berubah), `tools/node26/verify.sh`; commit.

**Acceptance Criteria:**
- Given build sesudah story, when `/opt/node-26/bin/pnpm --filter @lakar/check test` dijalankan, then semua fixture positif/negatif enam aturan (dan lima sub-cek LC-21) lulus.
- Given arsip 120 dokumen, when dipindai, then LC-16 = 0 kecuali cacat nyata yang diverifikasi lewat crop PNG dan dicatat; temuan aturan lama identik dengan `base.json`; jumlah warning/info per aturan baru tercatat dengan contoh.
- Given lakard yang di-restart, when `execute` menyentuh board dengan node `Rectangle` dan `Overlay /`, then respons execute tidak memuat baris `info`, sedangkan `layout_check` memuat `info · LC-13` dan `info · LC-22`.
- Given DESIGN.md, when Lampiran A dibaca, then kalimat aturan berjalan mencantumkan LC-13, LC-14, LC-15, LC-16, LC-21, LC-22.

## Implementation Notes

- **Skema:** `FindingLevel` + `'info'`; `G0_RULES` + LC-13 (info), LC-14/15/21 (warning), LC-16 (error, `gate:false`), LC-22 (info); `FindingSummary.info` selalu ada; `summaryText` menambah `, n info` hanya bila > 0 (respons lama tanpa `info` tetap aman).
- **Check:** enam fungsi di `rules.ts` (`lc13`…`lc22`, LC-21 = lima sub-cek berawalan `radius:`, `spacer kosong:`, `padding ganda:`, `teks di baris tabel:`, `bidang efek:`); `capWarnings` membatasi warning dan info per (level, aturan); `sortFindings` error → warning → info.
- **Daemon:** execute menyaring info sebelum `summarizeFindings` (summary execute `info: 0`); `/layout-check` penuh.
- **Tes:** helper `run()` di `packages/check/src/index.test.ts` kini menyaring aturan G1 (fixture G0 sintetis memakai bar absolut, rect tanpa cat); fixture G1 memakai `runAll()`. Tes daemon baru: board `Rectangle` + `Overlay /` → execute tanpa info, `layout_check` `info · LC-22`, `info · LC-13`, `summary.info 2`. Tes mcp lakard asli: baris `info · LC-22` hanya di layout_check, kepala `…, 1 info`; fixture mcp diberi fill pada `Isi`/`Lebar` (sama dengan fixture daemon) agar tidak memicu spacer.
- **Pindaian arsip** (120 dok, 157 board, 0 gagal, gateDocs 74 = base): aturan lama identik per dokumen. LC-16 0, LC-13 0, LC-15 0, LC-14 6/4, LC-21 radius 70/66, spacer 11/9, padding ganda 0, teks di baris tabel 22/12, bidang efek 6/6, LC-22 132/99 (sesudah cap). Tabel + tinjauan crop di `bench/practice/LOG.md` §2.4.
- **Temuan untuk 2.10 (skill tidak diubah):** `landing.md` daftar mockup `Baris /` (teks langsung di baris tabel ×3), `webapp.md` `Header tabel` (teks langsung), `mobile.md` radius 4 nilai (8, 16, 20, 24); LC-22 info di landing (Crop 1) dan mobile (Crop 1, Overlay 1). `skills-examples.test.ts` mencatatnya di `PENDING_2_10` (prefiks `<rule> <detail>` per file); temuan lain tetap gagal.
- **Kegagalan tes yang sudah ada sebelum story:** `bench/src/practice/practice.test.ts` "laporan … di-render ulang tanpa perubahan byte" gagal untuk `polish-4` juga di HEAD `5d022b1` (polish-4.md diedit tangan di commit itu); tidak disentuh. `visual.test.ts` latensi gagal saat paralel, lulus sendiri.

## Plan Change Log

- Teks di baris tabel: syarat teks langsung dinaikkan dari ≥ 1 ke ≥ 2 (baris antrean Dentara = daftar, bukan tabel; positif palsu arsip).
- Spacer kosong: node seukuran titik (≤ 0,5 × 0,5) dilewati (frame `Isi` 0×0 di baris kode Rakit Kode).
- Bidang efek: label bidang = node efek terluas (sebelumnya node pertama).
- Review: bidang efek juga menyatukan node efek dengan wadah potong terdekat yang sama (`Crop /` atau frame `clip:true`, bukan board); LC-16 melewati path ber-opacity 0 atau ber-bounds tetapi tidak terlihat (`visibleRect`); `PENDING_2_10` dipersempit ke aturan + nama node + detail yang diketahui; deskripsi MCP `layout_check`/`execute` menyebut aturan baru, info, dan `summary.info`. Pindaian ulang `after2.json`: angka sama (LC-21 bidang efek 6/6, LC-16 0), aturan lama identik.

## Review Triage Log

### 2026-11-19 — Review pass
- verdicts: 5 findings — high 0, medium 2, low 3, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Deskripsi tool MCP `layout_check`/`execute` (`packages/mcp/src/server.ts`) belum menyebut LC-13/14/15/16/21/22, level info, dan `summary.info` — terverifikasi di server.ts baris ~162–214; diperbaiki di `7975819` (frasa per aturan, info hanya di layout_check, summary `info`), `tests/execute-description.test.ts` disesuaikan.
  - `[medium]` `[patch]` `effectFieldIssue`: dua node efek tak beririsan di satu `Crop /`/frame ber-clip dihitung 2 bidang (positif palsu pola hero) — benar menurut kode union-find lama; diperbaiki: union juga bila leluhur `Crop /`/`clip:true` terdekat (bukan board) sama, fixture negatif baru; pindaian ulang arsip tidak berubah (6/6).
  - `[low]` `[patch]` `PENDING_2_10` di `skills-examples.test.ts` mengecualikan per prefiks detail saja — dipersempit ke aturan + nama node + awal detail yang diketahui.
  - `[low]` `[patch]` Fallback ukuran LC-16 (width/height angka → viewBox) tanpa fixture — `docOf` kini mendukung node tanpa `_r`; 4 kasus fallback ditambahkan.
  - `[low]` `[patch]` LC-16 memberi error untuk path tak terlihat (opacity 0/terpotong habis) — dilewati sekarang (path tanpa bounds tetap fallback); fixture negatif ditambahkan.
- Perbaikan sisi orkestrator: `index.test.ts` baris 53 `r[3]` → `r?.[3] ?? 0` (tsc `tsconfig.test.json` gagal TS18048 setelah patch).

## Design Notes

- **LC-13:** nama (board atau node) cocok `/^(rectangle|ellipse|path|group|board|image|svg|frame|rect|text|icon|vector)\s*\d*$/i` (daftar Lampiran A + padanan tipe node AD-15). Satu temuan per node.
- **LC-14:** `position:'absolute'` dengan induk flex (`isFlowChild` logika: board = kolom, frame `layout` row/column). Dikecualikan nama `Overlay /`, `Crop /` (bidang efek konvensi yang harus absolut di belakang isi), `Status bar`, `Home indicator`, dan node yang leluhurnya `Overlay /`/`Crop /`.
- **LC-15:** himpunan `icon.lib` di board tanpa `simple-icons`; > 1 → satu temuan pada board berisi pustaka + jumlah. Skema saat ini hanya punya `lucide`, jadi aturan siaga untuk Phosphor/Tabler (tonggak ke-2).
- **LC-16:** `path` dengan bounds terukur (fallback width/height angka, lalu viewBox) ≤ 32 × 32 (+0,5) dan nama tidak berawalan `Chart /`/`Shape /`.
- **LC-21:** satu ID, detail diawali sub-cek (`radius:`, `spacer kosong:`, `padding ganda:`, `teks di baris tabel:`, `bidang efek:`); cap 3 per board berlaku untuk ID ini. Radius: nilai dari frame/rect terlihat yang bercat atau ber-clip, tuple dipecah, buang 0 dan full (≥ min(w,h)/2 − 0,5). Bidang efek: node ber-fill mesh, node ber-blur ≥ 24 dengan fill non-gambar, atau node ber-fill conic/linear/radial multi-hue (≥ 2 stop kromatik, saturasi ≥ 0,2, alpha ≥ 0,15, beda hue ≥ 30°) dengan luas ≥ 20% layar (lebar board × min(tinggi board, 844 mobile / 900 lainnya)); node efek bersarang di node efek lain atau beririsan dengannya = satu bidang (union-find atas kotak terlihat).
- **LC-22:** satu info per board bila total node konvensi ≥ 1; `expected` menyebut batas (Crop ≤ 2, Ekstra ≤ 1) dan artefak `konvensi:`.
- **Level info di execute:** execute menyaring info (temuan dan summary) agar 1–3 execute agen tidak terbebani nama layer; `layout_check` memuat semuanya. Ini mengikuti AD-8 ("execute memuat error dan warning") dan cara G0 memisah gerbang per level.

## Verification

**Commands:**
- `/opt/node-26/bin/pnpm build` -- expected: lulus tanpa error tsc.
- `/opt/node-26/bin/pnpm --filter @lakar/check test` dan `/opt/node-26/bin/pnpm --filter @lakar/schema test` -- expected: lulus.
- `/opt/node-26/bin/pnpm test` -- expected: lulus (kecuali kegagalan latensi `packages/render/test/visual.test.ts` yang sudah diketahui saat paralel; ulang file itu sendiri).
- `/opt/node-26/bin/node <scratchpad>/archcheck.mjs /root/lakar <scratchpad>/after.json --shots LC-16 $(cat <scratchpad>/docs.txt)` -- expected: 120 dok, 0 gagal, LC-16 = 0 atau cacat nyata tercatat, aturan lama sama dengan `base.json`.
- `tools/node26/verify.sh` -- expected: semua OK (Node sistem tetap v22).

**Manual checks (if no CLI):**
- Crop PNG di `<scratchpad>/shots/` untuk setiap LC-16 dan sampel LC-14/LC-21.

## Auto Run Result

Status: built

**Ringkasan:** `@lakar/check` kini menjalankan LC-13 (info, nama layer default), LC-14 (warning, absolut di flex tanpa `Overlay /`), LC-15 (warning, > 1 pustaka ikon UI), LC-16 (error bukan gerbang, path ≤ 32×32 tanpa `Chart /`/`Shape /`), LC-21 (warning, lima sub-cek) dan LC-22 (info, jumlah node konvensi). Level `info` baru: dibatasi 3 per aturan per board seperti warning, diurut sesudah warning, tidak dikirim di execute (temuan dan summary), muncul di `layout_check` dengan `summary.info`. Lampiran A DESIGN.md diperbarui (file di-exclude git; perubahan di disk).

**File:** `packages/schema/src/findings.ts` (level info, 6 aturan, summary.info); `packages/check/src/rules.ts` (6 aturan, cap info); `packages/check/src/index.ts` (urutan level/aturan); `packages/check/src/index.test.ts` (fixture); `packages/daemon/src/server.ts` (execute tanpa info); `packages/mcp/src/server.ts` (deskripsi tool); tes daemon/mcp/bench/schema/`tests/execute-description.test.ts`; `packages/daemon/src/skills-examples.test.ts` (`PENDING_2_10`); `bench/practice/LOG.md` §2.4.

**Review:** 5 temuan (2 medium, 3 low), semua di-patch; 0 ditunda, 0 ditolak.

**Follow-up review:** disarankan (2 medium di-patch). Risiko yang belum terverifikasi: penggabungan bidang efek per wadah potong hanya dibuktikan fixture sintetis — tidak ada kasus arsip yang memakainya.

**Verifikasi:** `pnpm build` lulus; `pnpm test` 1021/1023 — gagal hanya `visual.test.ts` latensi (paralel; lulus sendiri 18/18) dan `practice.test.ts` render ulang polish-4 (sudah gagal di `5d022b1`). Tes kinerja check 500 node sempat 100,6 ms di bawah beban paralel sekali; pengukuran langsung median 4,7 ms (dist baru) vs 6,1 ms (dist base), lulus di run ulang. Pindaian arsip 120 dok/157 board: aturan lama identik per dokumen, LC-16 0, LC-13 0, LC-15 0, LC-14 6, LC-21 radius 70 / spacer 11 / padding ganda 0 / teks tabel 22 / bidang efek 6, LC-22 132. `tools/node26/verify.sh` semua OK, Node sistem v22.23.5, lakard active.

**Risiko sisa:** sub-cek radius LC-21 memicu di 66/120 dok (sebagian besar dari pola skill) sampai story 2.10; helper `run()` tes lama menyaring aturan G1; LC-15 siaga (skema hanya lucide + simple-icons).
