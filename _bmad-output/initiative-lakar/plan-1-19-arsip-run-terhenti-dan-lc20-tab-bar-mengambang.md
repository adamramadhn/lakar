---
title: 'Arsip dokumen run bench terhenti + LC-20 tab bar mengambang'
type: bugfix
ticket: ''
created: '2026-11-18'
status: built
baseline_revision: '044f3b3454258819a3c13cb30ab2b1fe603e8b02'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [multiple-goals, oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** (A) Arsip dokumen Lakar sebelum run (`bench/src/lakar/archive.ts`) hanya membaca `run.json`; run bench yang dihentikan (tanpa `run.json`) meninggalkan dokumennya, sehingga run berikut dengan slug sama jadi `invalid` ("dokumen lama") — kasus nyata: `bench/runs/practice/4/P3-lakar` (hanya `docs-before.json`, `stream.jsonl`, `stderr.txt`) meninggalkan `dapur-wening-resep`, lalu `practice/7/P3-lakar` invalid. (B) LC-20 tidak menandai butir daftar yang terlihat terpotong di celah di bawah tab bar MENGAMBANG — kasus nyata `practice/7/P2-lakar` board `krJds3hj`: `Overlay / Tab bar` x20 y746 h64 (bawah 810, celah 34 px), kartu "Eps. 113" di `Scroll / Konten` terlihat y ≈818–844 terpotong tepi board, gate 0; dan kapsul dengan celah > 48 px atau kapsul di dalam pembungkus absolut transparan tidak dikenali sebagai zona.

**Approach:** (A) Run yang terhenti diidentifikasi dari jejak sesi bench di dir run-nya sendiri (`docs-before.json` + catatan slug langsung `lakar-docs.jsonl` + `open_doc` di `stream.jsonl`), hanya slug yang tidak ada di `docs-before.json` run itu; `runLakar` menulis `lakar-docs.jsonl` seketika tiap `open_doc` muncul di stream. (B) Zona bawah diperluas dengan seed mengambang (celah ≤ 96 px, tinggi ≤ 120 px) dan kapsul ber-fill di dalam pembungkus absolut transparan; sub-cek baru melaporkan unit yang terlihat di celah antara zona mengambang dan tepi bawah board bila unit itu terpotong atau sebagian di belakang zona.

## Boundaries & Constraints

**Always:** tanpa run `claude -p` berbayar; dokumen yang diarsip hanya yang terbukti dibuat sesi bench (dir run bench + `docs-before.json` run tersebut); slug yang ada di `docs-before.json` sebuah run tidak pernah dianggap buatan run itu; validasi `SLUG_PATTERN` tetap; arsip tetap rename tanpa menimpa; check tetap murni di `packages/check`, severity LC-20 tetap `error` gerbang; fixture LC-20 lama (a)–(f) dan semua tes LC-20 lama tetap lulus tanpa diubah ekspektasinya; contoh skill tetap 0 error/0 gerbang/0 warning; pesan C7 tanpa istilah rubrik/juri/skor/golden; Node via `/opt/node-26/bin` path absolut; tes dijalankan sekuensial (RAM terbatas).

**Never:** mengubah pembungkus/protocol/prompt/rubrik/judge bench, argv/env claude, skill (`packages/skills/skills/*.md`), `.mcp.json`, unit systemd lakard, enum kode error AD-11 (`packages/schema/src/findings.ts` dan kode error); menyentuh pen.dev atau file `.pen`; menyentuh folder di `.git/info/exclude`; memakai nama node baru sebagai syarat deteksi (hanya `Overlay /`, `Scroll /`, `Crop /`, `Status bar`, `Home indicator` yang sudah ada); memindahkan dokumen di dataDir nyata di luar alur `practice`/`round` (tes memakai dir sementara).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| A1 run terhenti | `practice/4/P3-lakar`: `docs-before.json` (tanpa `x-resep`), `stream.jsonl` dengan tool_use `open_doc {slug:"x-resep"}`, tanpa `run.json`; dataDir punya `x-resep.lakar.json` | slug `x-resep` masuk rencana arsip run berikutnya (juga bila dir terhenti ada di iterasi yang sedang dijalankan) | — |
| A2 catatan langsung | dir terhenti dengan `lakar-docs.jsonl` berisi slug `y` (stream kosong/terpotong) | `y` diarsip | baris rusak dilewati |
| A3 dokumen non-bench | dataDir `milik-adam.lakar.json`; dir terhenti yang `open_doc` `milik-adam` tetapi `milik-adam` ada di `docs-before.json`-nya; dir terhenti tanpa `docs-before.json`; dir non-Lakar (`P1-pendev`) | `milik-adam` tidak disentuh | — |
| A4 run selesai | `run.json` dengan slug `z` yang ada di `docs-before.json` run itu (invalid "dokumen lama") | `z` tidak diatribusikan ke run itu (tetap diarsip bila run lain membuatnya) | — |
| A5 dry-run | rencana dibuat dan dicetak | dataDir tidak berubah; teks rencana menyebut slug dan run terhenti asalnya | — |
| A6 pencatatan seketika | `runLakar` dengan claude palsu yang mencetak tool_use `open_doc` | `lakar-docs.jsonl` di dir run berisi slug itu, ada walau `run.json` tidak ditulis | — |
| B1 tab bar mengambang + butir terpotong | 390×844, `Scroll /` clip sampai 844 berisi kartu ber-fill tinggi 64 jarak 8; frame absolut ber-fill "Tab bar" x20 y756 w350 h64 (bawah 820, celah 24) setelah konten; satu kartu y 830–894 | 1 LC-20 pada kartu itu: terlihat di celah di bawah zona (y 830–844) dan terpotong | — |
| B2 tab bar mengambang bersih | sama, konten terakhir berakhir ≤ y zona − 8, celah kosong | tanpa temuan | — |
| B3 celah > 48 | kapsul ber-fill absolut h64 dengan bawah 784 (celah 60); kartu y 700–772 | zona dikenali; 1 LC-20 kartu terpotong di tepi zona | — |
| B4 kapsul dalam pembungkus | frame absolut transparan anak board x0 y740 w390 h104 berisi kapsul ber-fill w358 h64 y756 | kapsul = anggota zona; butir terpotong di tepinya → temuan | — |
| B5 lama | fixture (a)–(f) + tes LC-20 lama | hasil sama | — |

</intent-contract>

## Code Map

- `bench/src/lakar/archive.ts` -- `benchLakarSlugs(roots, exclude)` (dibaca `round/main.ts:519`, `practice/main.ts:528`), `LAKAR_RUN_DIR`, `planLakarArchive`, `applyLakarArchive`. Tambah fungsi bersumber (mis. `benchLakarSources` → `{slug, run, terhenti}`), `benchLakarSlugs` diturunkan darinya (signature tetap). Dir run tanpa `run.json` = terhenti: wajib `docs-before.json` (array `{name}` `*.lakar.json`); slug = `lakar-docs.jsonl` (`{slug}` per baris) ∪ tool_use `mcp__lakar__open_doc` `input.slug` di `stream.jsonl` (pakai `toolEvents` dari `bench/src/tool-events.ts`, ambil kind `use`, tanpa syarat result karena dokumen bisa sudah dibuat saat proses mati); dikurangi `docs-before`. Run dengan `run.json`: perilaku lama, dikurangi `docs-before` bila file ada. Dir `exclude` (putaran berjalan): run selesai tetap dilewati; run terhenti ikut.
- `bench/src/lakar/run.ts` -- `runLakar`: sesudah `docs-before.json`, teruskan hook baris ke `runClaude` yang `appendFileSync(join(outDir,'lakar-docs.jsonl'), JSON.stringify({t, slug})+'\n')` untuk tiap tool_use `open_doc` bersalur slug valid (parse murah: hanya baris yang memuat `open_doc`).
- `bench/src/claude-runner.ts` -- `RunClaudeOptions` + `onLine?: (l: TimedLine) => void` opsional dipanggil di `onLine` internal (argv/env/transkrip tidak berubah; error hook ditelan agar run tidak mati).
- `bench/src/practice/main.ts:527-551`, `bench/src/round/main.ts:518-557` -- cetak rencana: sebut asal run terhenti (mis. `dapur-wening-resep ← practice/4/P3-lakar (terhenti)`); teks catatan `round/main.ts:258` sesuaikan satu frasa (termasuk run terhenti via `docs-before.json` + `lakar-docs.jsonl`/`stream.jsonl`). Alur dry-run (return sebelum apply) tidak diubah.
- `bench/src/lakar/lakar.test.ts:229-275` -- tes arsip lama (pola tmp dir); tambah tes A1–A6 di sini (A6 pakai pola `runLakar` lakard+claude palsu baris 66–220, claude palsu `command` skrip yang mencetak event stream-json; helper `toolUseEvent` di `tests/support/stream.ts`).
- `packages/check/src/rules.ts:195-486` -- `bottomZone`, `covering`, `lc20` (sub-cek 1–3, `walk`). Konstanta `BOTTOM_BAR_MAX_GAP`, `CARD_MAX_H_RATIO`, `SCREEN_MIN_W_RATIO`. `packages/check/src/tree.ts` -- `visibleRect`, `intersect`.
- `packages/check/src/index.test.ts:247-` -- blok `LC-20 …` dan fixture (a)–(f) + pembangun `docOf/frame/rect/text`; tambah B1–B4.
- `packages/daemon/src/skills-examples.test.ts`, `packages/daemon/src/index.test.ts` (LC-20 integrasi) -- harus tetap lulus tanpa perubahan.
- `packages/mcp/src/server.ts:141`, `packages/check/README.md:4` -- satu frasa: zona termasuk bar mengambang; celah di bawahnya.
- Skrip arsip siap pakai (scratchpad, bukan repo): `/tmp/claude-0/-root-lakar/ff3247e7-b8d6-48ae-acb4-dd6a2a7ac61e/scratchpad/archcheck.mjs` (`SCRATCH=<scratchpad> /opt/node-26/bin/node archcheck.mjs <file.lakar.json…>` memakai `packages/daemon/dist`, port 0, dataDir sementara). Pohon node: `tree.mjs <file> <boardId> <depth>`.

## Tasks & Acceptance

**Execution:**
- [x] `bench/src/claude-runner.ts` -- hook `onLine` opsional -- pencatatan seketika.
- [x] `bench/src/lakar/run.ts` -- tulis `lakar-docs.jsonl` seketika -- run mati tetap bisa dibereskan.
- [x] `bench/src/lakar/archive.ts` -- sumber run terhenti + filter `docs-before` -- identifikasi aman.
- [x] `bench/src/practice/main.ts`, `bench/src/round/main.ts` -- rencana tercetak menyebut asal terhenti -- dry-run informatif.
- [x] `bench/src/lakar/lakar.test.ts` -- tes A1–A6.
- [x] `packages/check/src/rules.ts` (+ `tree.ts` bila perlu) -- seed mengambang, kapsul dalam pembungkus, sub-cek celah -- sesuai Design Notes.
- [x] `packages/check/src/index.test.ts` -- fixture B1–B4; (a)–(f) tak diubah.
- [x] `packages/mcp/src/server.ts`, `packages/check/README.md` -- deskripsi singkat.

**Acceptance Criteria:**
- Given dir nyata `bench/runs/practice` + `rounds`, when rencana arsip untuk iterasi 8 dihitung (read-only, tanpa apply), then `dapur-wening-resep` masuk rencana dengan asal `practice/4/P3-lakar` (terhenti) dan tidak ada slug yang tidak berasal dari dir run bench.
- Given dokumen `bench/runs/practice/7/P2-lakar/doc/siaru-beranda.lakar.json`, when `archcheck.mjs` dijalankan sesudah build, then board `krJds3hj` mendapat LC-20 untuk kartu "Eps. 113" di celah bawah tab bar.
- Given seluruh dokumen latihan iterasi 5–7 (`bench/runs/practice/{5,6,7}/P*-lakar/doc/*.lakar.json`) dan `dapur-wening-resep` di dataDir lakard, when diperiksa, then setiap temuan baru dicatat di Implementation Notes dan diverifikasi pada PNG-nya sebagai cacat nyata; positif palsu diperbaiki sebelum selesai.
- Given contoh skill, when `skills-examples.test.ts` dijalankan, then 0 error/0 gerbang/0 warning.

## Implementation Notes

- **Arsip (A):** `benchLakarSources` (asal per slug: `<nama root>/<putaran>/<dir run>`, `terhenti`), `benchLakarSlugs` diturunkan darinya (signature tetap), `describeLakarArchive` untuk teks rencana, `LAKAR_DOCS_LOG = 'lakar-docs.jsonl'`. Slug di `docs-before.json` sebuah run tidak pernah diatribusikan ke run itu (juga untuk run selesai bila file ada). `runLakar` menulis `lakar-docs.jsonl` lewat hook `onLine` baru di `runClaude` (error hook ditelan; argv/env/transkrip tidak berubah); parse hanya baris yang memuat `open_doc` (`openDocSlugsInLine`).
- **Rencana nyata iterasi 8 (read-only, dist bench):** `docs/dapur-wening-resep.lakar.json ← practice/4/P3-lakar (terhenti)` (+ history, exports), lalu `rakit-kode-landing`, `siaru-beranda` dari run selesai. Satu-satunya sumber terhenti = `practice/4/P3-lakar`; `practice/7/P3-lakar` (invalid, slug ada di `docs-before.json`-nya) tidak diatribusikan. Semua sumber dari `bench/runs/{practice,rounds}`.
- **LC-20 (B):** seed mengambang (`FLOAT_MAX_GAP=96`, `FLOAT_MAX_H=120`), anggota dari pembungkus absolut transparan (anak board/layar, lebar ≥ 50%, tinggi ≤ 50%), sub-cek 4 `gap` sesudah `cut` di `walk` (`PEEK_MIN=2`). Bawah mentah teks = bounds tanpa half-leading bawah; baris = gabungan isi. Fixture (a)–(f) dan tes lama tidak diubah; tambahan B1, B1′ (sebagian di belakang zona / utuh di celah), B2, B3 (+ batas tinggi/celah), B4 (+ pembungkus flow bukan pembungkus).
- **Sapuan dokumen latihan 5–7 + `dapur-wening-resep`** (archcheck, sebelum vs sesudah dengan `rules.ts` baseline): satu-satunya temuan baru = `practice/7/P2-lakar/siaru-beranda` board `krJds3hj`, `Item / Eps. 113 · Dana darurat ideal` (dwQS1UaL), "kartu terlihat di celah di bawah zona bawah mengambang "Overlay / Mini player" + "Overlay / Tab bar" (y 818–844), terpotong"; diverifikasi di `png/krJds3hj.png` (kartu Eps. 113 terpotong di bawah tab bar). Tanpa positif palsu; temuan lain identik.

## Plan Change Log

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 4 findings — high 0, medium 2, low 1, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` `archive.ts`: run dengan `run.json` mengabaikan `lakar-docs.jsonl`; run timeout (open_doc tanpa result → tidak di `lakar.opened`) atau run.json harness tanpa `lakar` tetap meninggalkan dokumen — patch: run selesai juga menyatukan slug `lakar-docs.jsonl`/`stream.jsonl` bila `docs-before.json` ada (tetap dikurangi docs-before); tes `v-telat` di A1–A5.
  - `[medium]` `[patch]` `rules.ts` sub-cek 4: celah dianggap terbuka walau node ber-fill sesudah konten (mis. `Home indicator` ber-fill) menutupnya → positif palsu gerbang — patch: `floor` diperpanjang oleh node ber-fill/blur sesudah unit (z-order, bukan keturunan unit) yang selebar rentang zona dan menempel di bawahnya; tes (B1″), dibuktikan gagal tanpa patch.
  - `[false]` `[reject]` Sub-cek 4 juga berlaku untuk bar "menempel" (celah ≤ 48) yang berakhir di atas tepi board — bar yang berakhir di atas tepi bawah dengan celah terbuka memang mengambang menurut intent ("ada celah antara tab bar dan tepi bawah board"); konten terpotong yang terlihat di celah itu adalah cacat yang dimaksud; arsip 5–7 tidak menghasilkan positif palsu.
  - `[low]` `[patch]` Deskripsi `server.ts`/README tidak menyebut kapsul di dalam pembungkus absolut transparan — patch: satu frasa ditambahkan di keduanya.

## Design Notes

**Zona (B):** kandidat lama tetap. Tambahan: (i) anak langsung frame/rect ber-fill/backdropBlur dari *pembungkus* = frame absolut tanpa fill/blur yang anak board/layar (lebar anak ≥ 50% board, tinggi ≤ 50% board). Seed: `gap ≤ 48` (lama) **atau** `gap ≤ FLOAT_MAX_GAP=96 ∧ tinggi ≤ FLOAT_MAX_H=120`. Tumpukan tetap.

**Sub-cek 4 (celah zona mengambang):** untuk unit (sama `unitKind`/`unitVisible`) yang tidak dikecualikan, `cov = covering(zone, order, vis)`; `floor = max bottom(cov.members)`; bila `boardH − floor > TOLERANCE`, strip celah = `{y floor..boardH}` ∩ rentang x anggota. Laporkan bila bagian `vis` di strip ≥ `PEEK_MIN=2` px tinggi **dan** (unit terpotong: bawah mentah > bawah terlihat + TOL, **atau** `vis.y < floor − TOL` sebagian di belakang zona). Unit utuh yang sepenuhnya di celah tidak dilaporkan. Dijalankan di `walk` sesudah `cut`; terlapor → subtree dilewati.

Pesan contoh: `kartu terlihat di celah di bawah zona bawah mengambang "Tab bar" (id) (y 830–844), terpotong` · `jangan biarkan konten terlihat di celah di bawah bar mengambang: akhiri daftar sebelum zona, beri latar penutup sampai tepi bawah, atau tempelkan bar ke tepi bawah`.

**Arsip (A):** urutan sumber per run dir terhenti: `lakar-docs.jsonl` lalu `stream.jsonl`; keduanya opsional, `docs-before.json` wajib. Rencana tercetak: `docs/<slug>.lakar.json ← <root-relatif>/<run> (terhenti)` untuk sumber terhenti.

## Verification

**Commands:**
- `cd /root/lakar && PATH=/opt/node-26/bin:$PATH pnpm build` -- expected: exit 0
- `cd /root/lakar && PATH=/opt/node-26/bin:$PATH npx vitest run packages/check bench/src/lakar bench/src/claude-runner.test.ts` -- expected: semua lulus
- `cd /root/lakar && PATH=/opt/node-26/bin:$PATH npx vitest run packages/daemon/src/index.test.ts packages/daemon/src/skills-examples.test.ts packages/mcp` -- expected: semua lulus
- `cd /root/lakar && PATH=/opt/node-26/bin:$PATH npx vitest run bench tests` -- expected: semua lulus
- `cd /root/lakar/bench/runs && SCRATCH=<scratchpad> /opt/node-26/bin/node <scratchpad>/archcheck.mjs /root/lakar/bench/runs/practice/{5,6,7}/P*-lakar/doc/*.lakar.json ~/.local/share/lakar/docs/dapur-wening-resep.lakar.json` -- expected: temuan baru hanya cacat nyata, `krJds3hj` termasuk
- `cd /root/lakar && bash tools/node26/verify.sh` (PATH bawaan) -- expected: exit 0

## Auto Run Result

Status: built

- **Ringkasan:** (A) arsip pra-run kini juga mengenali run bench terhenti (dir run Lakar tanpa `run.json` yang punya `docs-before.json`): slug dari `lakar-docs.jsonl` (ditulis seketika oleh `runLakar` tiap tool_use `open_doc`) ∪ `open_doc` di `stream.jsonl`, dikurangi `docs-before.json` run itu; filter docs-before juga untuk run selesai; rencana tercetak menyebut asal `(terhenti)`. (B) Zona bawah LC-20 mengenali bar mengambang (celah ≤ 96 px, tinggi ≤ 120 px) dan kapsul ber-fill dalam pembungkus absolut transparan; sub-cek 4 melaporkan unit yang terlihat terpotong/sebagian di belakang zona di celah antara zona dan tepi bawah board (celah yang ditutup node ber-fill sesudahnya tidak dihitung).
- **File:** `bench/src/claude-runner.ts` (hook `onLine` opsional), `bench/src/lakar/run.ts` (`lakar-docs.jsonl` seketika, `openDocSlugsInLine`), `bench/src/lakar/archive.ts` (`benchLakarSources`, `describeLakarArchive`), `bench/src/practice/main.ts` + `bench/src/round/main.ts` (rencana bersumber, teks konvensi), `bench/src/lakar/lakar.test.ts` (A1–A6), `packages/check/src/rules.ts` (zona + sub-cek 4), `packages/check/src/index.test.ts` (B1–B4, B1′, B1″), `packages/mcp/src/server.ts` + `packages/check/README.md` (deskripsi).
- **Review (quick):** 3 patch (2 medium, 1 low), 0 defer, 1 ditolak (false: bar dengan celah terbuka memang mengambang).
- **Follow-up review:** false — dua patch medium bersifat lokal (penyatuan sumber slug; perpanjangan floor), masing-masing tercakup tes baru dan cek arsip ulang tanpa perubahan hasil.
- **Verifikasi:** `pnpm build` exit 0; vitest check+bench lakar+runner 99/99, daemon index+skills-examples+mcp 106/106 (contoh skill 0 temuan), bench+tests 247/247; `tools/node26/verify.sh` exit 0; rencana arsip nyata iterasi 8: `dapur-wening-resep ← practice/4/P3-lakar (terhenti)`; archcheck latihan 5–7 + dataDir `dapur-wening-resep`: satu temuan baru, 7/P2 `krJds3hj` kartu "Eps. 113" y 818–844 (terpotong di celah bawah tab bar, terverifikasi di PNG), temuan lain sama dengan sebelumnya (6/P2 `MWLYK6Am`, 6/P3 `9J4GY5q3`).
- **Risiko sisa:** celah di sisi kapsul (kiri/kanan) tidak dinilai; ambang 96/120/2 px heuristik; penutup celah hanya node ber-fill selebar zona; run terhenti tanpa `docs-before.json` (crash sebelum snapshot) sengaja tidak diarsip; run terhenti di iterasi berjalan ikut diarsip saat `--resume`.
