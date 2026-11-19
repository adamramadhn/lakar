---
title: 'Harness bench menjalankan dan memutuskan A–E'
type: feature
ticket: '1'
created: '2026-11-19'
status: built
baseline_revision: '925c66de7329651978606f9f6da018e4630702bc'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/bench/README.md'
warnings: [oversized]
deferred:
  - summary: >-
      Keluaran pendev-baseline per tanggal: seri tidak lengkap untuk set prompt yang sama memblokir pengukuran ulang hari itu (exit 64) sampai file dipindah manual.
    evidence: |-
      Nama keluaran baseline-pendev-<IDS>-<YYYY-MM-DD> eksklusif (wx). Sekarang baseline tidak lengkap dicetak dan pesan exit 64 menjelaskan langkah manual; nama file unik per jam/run belum dibuat.
    location: >-
      bench/src/cli.ts (pendevBaseline), bench/src/baselines.ts (baselineOutputPaths)
    severity: low
---

<intent-contract>

## Intent

**Problem:** Bench hanya mengenal A/B: `PromptId`, `prompts.json`/`protocol.json`, ukuran mengikat, baseline pen.dev, urutan putaran, dan keputusan (`decideG0`). Hash protokol mengikat ketiga file utuh, jadi menambah C–E akan membatalkan baseline A/B G0 (`protocolHash 907cb36f…`).

**Approach:** Ganti penjaga hash utuh dengan hash per prompt (wrapper + config tanpa `promptIds` + teks prompt itu), migrasikan baseline G0 dengan hash per prompt yang dibuktikan dari snapshot protokol lama, lalu perluas protokol, ukuran, baseline per prompt, putaran, dan keputusan ke A–E (`decideG1`).

## Boundaries & Constraints

**Always:**
- Hash per prompt = sha256 JSON kanonik (kunci terurut) `{scheme:"lakar-bench-prompt/1", wrapper, config (protocol.json tanpa promptIds), prompt}`. `protocol.json` hanya berubah di `promptIds`; field lain byte-identik agar hash A/B tetap.
- Snapshot protokol G0 tracked dan beku di `bench/protocol/legacy/907cb36f/` (3 file dari `git show 925c66d:bench/protocol/*`). Tes membuktikan: `protocolHash(legacy)` = `baseline-pendev.json.protocolHash`; wrapper/prompts legacy = isi `wrapper`/`prompts` baseline lama; hash per prompt A/B dari legacy = dari protokol baru = `promptHashes` yang dicatat migrasi.
- Penjaga tetap ketat: putaran/baseline per prompt membandingkan hash per prompt, model, Claude Code, dan pen.dev desktop terhadap baseline yang mencakup prompt itu. Baseline tanpa `promptHashes` = masalah (tanpa fallback ke hash utuh). Prompt tanpa baseline = masalah pembekuan (resmi) dan Abort sebelum run (semua putaran non-dry-run).
- Prompt C–E di `prompts.json` = blockquote golden-set (C7 (a)); `C7_CRITERIA_IDS` = A–E; token nama produk skill + Arus/Singgah/Gudangku; sumber terlarang skill dari kriteria A–E.
- Teks juri A/B, argv agen/juri, dan rubric.json v2.2 tidak berubah. Laporan lama (A/B) di-render ulang identik (snapshot tes).
- Gerbang R3/R7 (Lampiran B §Kualitas teknis/§Gerbang Lakar) hanya untuk putaran G1 (A–E/decideG1), dihitung mekanis dari temuan `layout_check` final board Lakar per ID aturan: R3 = 2 bila LC-07, LC-11, LC-06 semuanya 0; 1 bila total ketiganya ≤ 5; 0 bila > 5. R7 = 2 bila 0 error non-gerbang dan ≤ 3 warning struktural (LC-03/13/14/17/18/21); 1 bila ≤ 8 warning struktural atau ≤ 2 error non-gerbang (laporan menandai "periksa Adam: false positive?" bila error non-gerbang > 0); 0 selebihnya. R3 = 0 atau R7 = 0 → gerbang Lakar gagal. Aturan yang belum ada = 0 temuan.
- Tanpa run berbayar: hanya kode, tes, dry-run. Node lewat `/opt/node-26/bin`. Maks 3 putaran perbaikan review.

**Never:** git commit/push/ganti branch; npx, paket global, perubahan PATH, port, atau service (VPS bersama); proses berat dibiarkan jalan; mengubah `golden-set.md`, DESIGN.md (Lampiran B), `bench/rubric/**`, `packages/skills`; menjalankan `round`/`pendev-baseline`/`rejudge`/`practice` tanpa `--dry-run`; memanggil MCP pencil; menimpa `bench/baseline-pendev.md`; mengubah wrapper.txt atau field config selain `promptIds`; mengubah perilaku gerbang practice/effects/polish atau render laporan lama (A/B).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Baseline A/B lama | protokol A–E, baseline G0 termigrasi | hash A/B = baseline, putaran tidak Abort karena hash | – |
| Prompt diubah | teks C atau wrapper/config bergeser 1 char | hanya hash prompt terkait (C) / semua (wrapper, config) beda | masalah `hash prompt X ≠ baseline` |
| Baseline belum ada | C–E tanpa baseline | dry-run mencetak "baseline C, D, E belum diukur"; resmi: masalah pembekuan | non-dry-run → Abort |
| Dua baseline mencakup prompt | A di file G0 dan file baru | pakai `date` terbaru; yang lain dicatat tergantikan | – |
| Ukuran C/E | board 1440×1025 | masalah (persis) | – |
| Ukuran D | 390×1600 lulus; 390×800 atau 400×900 gagal | tinggi ≥ 844, lebar persis, apa pun versi rubrik | – |
| decideG1 lolos | ≥ 4 Setara/Lebih baik, ≥ 1 Lebih baik, emoji 0, rasio waktu ≤ 1,5 semua prompt | `lolos` | – |
| decideG1 gagal | 2 Kalah, atau emoji > 0, atau rasio > 1,5 | `gagal` + alasan | – |
| decideG1 tak tentu | dibatalkan, prompt hilang, atau tidak dapat dinilai yang masih bisa mengubah hasil, waktu/emoji tak terukur | `tidak dapat diputuskan` | – |
| R3/R7 G1 | temuan sintetis: LC-07×6 → R3 0; LC-06×2 → R3 1; 0 temuan → R3 2, R7 2; warning struktural 4 → R7 1; 9 warning → R7 0; error non-gerbang 2 → R7 1 + tanda periksa Adam; 3 → R7 0 | R3/R7 = 0 → gerbang G1 gagal (prompt Kalah); putaran A/B dan practice tidak menghitung R3/R7 | – |
| pendev-baseline | `--prompts C,D,E --dry-run` | rencana per prompt + hash + status baseline | file keluaran ada → exit 64 (eksklusif) |

</intent-contract>

## Code Map

- `bench/src/protocol.ts` -- `PromptId`, `loadProtocol`, `protocolHash` (byte 3 file, tetap untuk info/legacy), `C7_CRITERIA_IDS`. Tambah `PROMPT_IDS`, `promptHash(protocol,id)`, `promptHashes`, `LEGACY_G0_DIR`.
- `bench/protocol/{prompts,protocol}.json` -- tambah C–E (teks persis blockquote golden-set baris 68/83/98); `promptIds` A–E.
- `bench/baseline-pendev.json` -- migrasi: tambah `promptHashes {A,B}` + `promptHashMigration {fromProtocolHash, legacyDir, date}`; field lain tidak disentuh.
- `bench/src/baselines.ts` (baru) -- `loadBaselines()` mengindeks `baseline-pendev.json` + `baseline-pendev-*.json` per prompt (hash, model, claude, pendevDesktop, median wall/biaya, sumber); `baselineProblems(protocol, ids, now)` murni.
- `bench/src/cli.ts` + `report.ts` -- `pendev-baseline [--prompts X,Y] [--dry-run]`: default = prompt tanpa baseline sah; keluaran eksklusif `bench/baseline-pendev-<IDS>-<YYYY-MM-DD>.{md,json}` dengan `promptHashes`; seri berselang hanya prompt terpilih (`seriesOutcome` dengan `promptIds` terpilih).
- `bench/src/round/main.ts` -- `ROUND_ORDER` dari `promptIds`; `roundStartProblem`/`officialFreezeProblems` pakai hash per prompt (input `promptHashes` + baseline per prompt); `loadBaseline` → `loadBaselines`; `frozenDrift` + `FrozenVersions.promptHashes`; CONVENTION diturunkan dari prompt; laporan menyertakan `g1`.
- `bench/src/round/score.ts` -- `technicalScores(findings)` murni (R3/R7 dari `rule`+`level` temuan; level gerbang vs non-gerbang menurut katalog `@lakar/schema`, cek field `Finding`), `lakarGate` opsi `technical` hanya dipakai `round` saat prompt A–E; `decideG1` murni (input: keputusan, rasio waktu gerbang, emoji Lakar (a) emoji, (b) LC-01a+LC-01b, (c) median juri). `decideG0` tidak berubah.
- `bench/src/round/report.ts` -- `RoundReport.g1?`; bila ada, render bagian Keputusan G1 (sementara, menunggu Adam) menggantikan bagian G0; tanpa `g1` keluaran lama identik.
- `bench/src/lakar/run.ts` -- `BoardSpec.height` + `heightMode?: 'min'`; `GOLDEN_BOARD_SPECS` C 1440×1024, D 390×≥844 (selalu min), E 1440×900.
- `bench/src/rejudge.ts` -- teks juri + cek sha dibatasi ke prompt putaran sumber (A/B) agar C–E yang belum di-snapshot tidak memblokir rejudge.
- `tests/skills-c7.test.ts` -- sumber kriteria A–E, token nama produk C–E.
- Tes yang menyebut 907cb36f/`promptIds` A/B: `bench/src/protocol.test.ts`, `rejudge.test.ts` (g), `round/round.test.ts`, `series.test.ts`.
- `bench/README.md` -- dokumentasi hash per prompt, baseline per prompt, A–E, decideG1.

## Tasks & Acceptance

**Execution:**
- [x] `bench/protocol/legacy/907cb36f/*` -- salin 3 file G0 dari git -- bukti migrasi beku.
- [x] `bench/src/protocol.ts` + `protocol.test.ts` -- hash per prompt, A–E, C7 A–E; tes kecocokan legacy/baseline dan sensitivitas hash -- inti keputusan Adam.
- [x] `bench/protocol/*.json` -- C–E -- protokol A–E.
- [x] `bench/baseline-pendev.json` -- tambah `promptHashes` + catatan migrasi (nilai dihitung kode, tidak ditulis tangan) -- baseline G0 sah.
- [x] `bench/src/baselines.ts` + tes -- indeks baseline per prompt -- dipakai round/pendev-baseline.
- [x] `bench/src/cli.ts`, `bench/src/report.ts` -- pendev-baseline per prompt -- story 11.
- [x] `bench/src/lakar/run.ts` + `lakar.test.ts` -- ukuran C/D/E -- gerbang.
- [x] `bench/src/round/{main,score,report}.ts` + `round.test.ts` -- A–E, hash per prompt, decideG1 -- R4/R7.
- [x] `bench/src/round/score.ts` + `round.test.ts` -- R3/R7 mekanis + gerbang G1, tes temuan sintetis -- keputusan orkestrator 2026-11-19.
- [x] `bench/src/rejudge.ts` + tes -- batasi ke prompt sumber -- tetap jalan.
- [x] `tests/skills-c7.test.ts` -- C7 A–E.
- [x] `bench/README.md` -- dokumentasi.

**Acceptance Criteria:**
- Given protokol A–E dan baseline G0 termigrasi, when `pnpm --filter @lakar/bench test`, then tes migrasi membuktikan legacy = 907cb36f…, hash per prompt A/B legacy = baru = tercatat, dan semua tes bench (decideG1, ukuran C/D/E) lulus.
- Given HEAD bersih, when `round --round 3 --dry-run` dan `round --round uji-2 --dry-run`, then rencana A–E (10 run + juri) tercetak, hash A/B = baseline, dan masalah hanya sha teks juri C–E belum di-snapshot (diharapkan, story 2.2) dan baseline C–E belum diukur (diharapkan, story 2.11).
- Given `pendev-baseline --dry-run`, then rencana C, D, E tercetak dengan hash per prompt, tanpa spawn.
- Given `pnpm test` di root, then semua lulus termasuk skills-c7 dan judge-c7 dengan A–E.

## Implementation Notes

- R7 = 1 ditafsirkan sebagai ≤ 2 error non-gerbang **dan** ≤ 8 warning struktural (matriks: 9 warning → 0 walau 0 error); error non-gerbang = level `error` dari aturan yang `isGateRule` = false (termasuk aturan yang belum ada di katalog).
- `decideG1` memakai batas atas/bawah: prompt hilang/tidak dapat dinilai dihitung sebagai "terbuka"; gagal bila syarat jumlah tidak tercapai walau semua yang terbuka Lebih baik (mis. 2 Kalah + 1 tidak dapat dinilai → gagal), atau ada emoji > 0 / rasio > 1,5.
- `isG1Protocol(promptIds)` (A–E lengkap) mengaktifkan R3/R7 dan `decideG1`; laporan G0 (A/B) tetap dirender identik (snapshot lama tidak berubah, hanya entri G1 baru).
- `parsePendevBaselineArgs` ada di `baselines.ts` (cli.ts menjalankan main saat diimpor). Laporan putaran tersimpan round-1/2/uji-1 (rubrik v1) memang tidak bisa dirender ulang bahkan di HEAD; bukti render identik = snapshot tes.
- Dry-run `round --round 3` di working tree tidak bersih juga melaporkan "kode tidak beku" (perubahan belum di-commit; commit bukan wewenang story ini).

## Plan Change Log

- 2026-11-19 (checkpoint orkestrator, delegasi Adam): plan disetujui dengan penyesuaian: gerbang R3/R7 mekanis masuk story ini khusus putaran G1; dry-run resmi yang melaporkan teks juri C–E belum di-snapshot (story 2.2) dan baseline C–E belum ada (story 2.11) diterima sebagai hasil yang diharapkan, penjaga tidak dilonggarkan; rejudge dibatasi ke prompt putaran sumber. KEEP: hash per prompt + migrasi legacy, baseline per prompt, ukuran C/D/E, decideG1.

## Review Triage Log

### 2026-11-19 — Review pass
- verdicts: 4 findings — high 0, medium 1, low 3, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Baseline tidak lengkap tidak pernah dicetak; seri gagal untuk set prompt yang sama memblokir pengukuran ulang hari itu (exit 64) — patch: `index.incomplete` dicetak di pendev-baseline dan round dry-run; pesan exit 64 menyebut file dan langkah pindah manual. Kunci per tanggal sendiri ditunda (deferred, low).
  - `[low]` `[patch]` Snapshot G1 mengunci laporan kontradiktif (C `technical: null` tetapi gerbang lolos, median baseline tanpa sumber) — patch: gerbang C dari `lakarGate` (gagal), keputusan dari `decide` (Kalah), median/biaya baseline undefined, snapshot G1 diperbarui; snapshot lama tidak berubah.
  - `[low]` `[patch]` README masih menyebut rubrik dari kriteria golden A/B — patch: kini per `promptIds` (A–E) + catatan rubric-snapshot v2.2 gagal "isi berbeda" sampai v2.3 (story 2.2).
  - `[low]` `[patch]` `FrozenVersions.baselineProtocolHash` berisi path file di putaran G1 — patch: field opsional, tidak diisi di putaran G1 (sumber di `promptBaselines`); render A/B identik.

## Design Notes

Baseline C–E belum ada sampai story 11, jadi dry-run resmi pasti menyebutnya; penjaga tidak dilonggarkan untuk itu. Hash per prompt tidak mencakup `bench/mcp/pencil.json` (sama dengan hash lama) dan versi alat dicek terpisah. Bila versi Claude Code/pen.dev berubah, baseline lama tetap tercatat, tetapi pembekuan gagal sampai baseline A–E diukur ulang (story 11): baseline terbaru per prompt menang.

## Verification

**Commands:**
- `/opt/node-26/bin/pnpm build` -- expected: sukses
- `/opt/node-26/bin/pnpm --filter @lakar/bench test` -- expected: lulus
- `/opt/node-26/bin/pnpm test` -- expected: lulus
- `/opt/node-26/bin/node bench/dist/cli.js round --round uji-2 --dry-run`, `... round --round 3 --dry-run`, `... pendev-baseline --dry-run` -- expected: rencana A–E, masalah hanya juri C–E + baseline C–E
- `tools/node26/verify.sh` -- expected: lulus

## Auto Run Result

Status: built.

**Ringkasan:** bench menjalankan dan memutuskan A–E. Penjaga baseline memakai hash per prompt (`lakar-bench-prompt/1`: wrapper + config tanpa `promptIds` + teks prompt); baseline G0 A/B dimigrasi (`promptHashes`) dan dibuktikan lewat snapshot `bench/protocol/legacy/907cb36f/` (hash = 907cb36f…, isi = baseline lama, hash A/B legacy = baru = tercatat). Baseline per prompt (`baselines.ts`), `pendev-baseline --prompts`, ukuran C/E persis dan D 390×≥844, R3/R7 mekanis hanya putaran G1, `decideG1`, laporan Keputusan G1, rejudge dibatasi ke prompt sumber, C7 A–E.

**File:** `bench/src/{protocol,baselines,cli,report,rejudge}.ts`, `bench/src/lakar/run.ts`, `bench/src/round/{main,score,report}.ts` + tes/snapshot, `bench/protocol/{prompts,protocol}.json`, `bench/protocol/legacy/907cb36f/*`, `bench/baseline-pendev.json` (tambah field), `tests/skills-c7.test.ts`, `bench/README.md`.

**Review:** 1 putaran (quick): 4 patch (1 medium, 3 low), 1 ditunda (low: kunci keluaran per tanggal), 0 ditolak. Follow-up review: false (tidak ada patch high, hanya 1 medium).

**Verifikasi:** `pnpm build` lulus; `pnpm --filter @lakar/bench test` 211/211; `pnpm test` 981 lulus, 2 gagal di luar story (packages tidak berubah): `packages/daemon/src/pool.test.ts` (utm_source dari config lokal, sejak 8ba5e21) dan `packages/render/test/visual.test.ts` latensi (flaky di bawah beban, lulus sendiri). Dry-run `round --round uji-2`, `round --round 3`, `pendev-baseline` exit 0; masalah yang diharapkan: baseline C, D, E belum diukur (story 2.11) dan sha teks juri C–E belum di-snapshot (story 2.2).

**Risiko sisa:** R7 = 1 ditafsirkan "≤ 2 error non-gerbang **dan** ≤ 8 warning struktural" (bacaan "atau" harfiah membuat 0 error + banyak warning = 1); perlu konfirmasi Adam. Laporan putaran lama (round-1/2, uji-1) memang tidak bisa di-render ulang dengan kode sekarang maupun sebelumnya (data rubrik lama); kesetaraan render A/B dijaga snapshot tes.

