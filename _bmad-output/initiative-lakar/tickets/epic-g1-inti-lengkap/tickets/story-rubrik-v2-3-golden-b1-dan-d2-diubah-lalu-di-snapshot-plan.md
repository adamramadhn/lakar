---
title: 'Rubrik v2.3: golden B1 dan D2 diubah lalu di-snapshot'
type: chore
ticket: '2'
created: '2026-11-19'
status: built
baseline_revision: '89c839442aab7d18aa4b55093b9ed6ff248fc3f3'
route: oneshot
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/bench/README.md'
warnings: []
deferred:
  - summary: >-
      Tabel ringkasan golden-set.md (baris B "390 × 844") belum diselaraskan dengan B1 v2.3 (lebar 390, tinggi ≥ 844).
    evidence: |-
      Story membatasi perubahan ke B1/D2 + baris versi. Tabel tidak masuk teks juri (hanya blok Kriteria target), jadi sha tidak terpengaruh; hanya dokumentasi yang tidak konsisten.
    location: >-
      _bmad-output/initiative-lakar/ux-lakar/golden-set.md:28
    severity: low
  - summary: >-
      Teks juri D1 memuat sisa netralisasi "( 44–48)" (nama node `IconButton /` dibuang) dan nama komponen `step-indicator`.
    evidence: |-
      Sudah ada di teks D sebelum v2.3 (bukan dari B1/D2); mengubahnya mengubah sha juri D dan butuh versi rubrik baru.
    location: >-
      bench/rubric/v2.3/judge-text-D.md:26
    severity: low
  - summary: >-
      rejudge memakai aturan ukuran versi beku sumber, jadi pen.dev B round-2 (390×1044) tetap dicatat pelanggaran brief walau B1 v2.3 mengizinkan tinggi ≥ 844.
    evidence: |-
      Desain story 24 (sizeRuleFor dari frozen sumber, v2.1 → persis). Pada r2-v2-3 tidak mengubah keputusan (tidak ada Kalah-daya-tarik yang dinetralkan); perlu keputusan Adam bila rejudge harus memakai aturan versi rubrik saat ini.
    location: >-
      bench/src/rejudge.ts:376
    severity: low
---

<intent-contract>

## Intent

**Problem:** Kriteria golden B1 ("Board persis 390×844") dan D2 (pola dua board digabung jadi strip) bertentangan dengan DESIGN.md (pola mobile satu board panjang, 390 × ≥ 844) dan aturan ukuran `sizeRuleFor` ≥ 2.2. Teks juri C–E belum di-snapshot, jadi `round --dry-run --round 3` melaporkan masalah sha juri C–E.

**Approach:** Ubah B1 dan D2 di `golden-set.md` bersamaan (keputusan Adam 2026-11-19), naikkan baris `Versi rubrik:` Lampiran B DESIGN.md ke `2.3 (2026-11-19)`, jalankan `rubric-snapshot` (sudah membangun teks juri dari `promptIds` A–E lewat `prepareJudgeTexts`) yang menulis `bench/rubric/v2.3/` + `rubric.json`. Perluas tes snapshot/teks juri ke A–E, kunci v2.2 lama, dan buktikan `sizeRuleFor('2.3')` konsisten dengan B1/D2. Lalu rejudge round-2 sebagai hold-out (`--label r2-v2-3`).

Teks baru (hanya dua butir ini + baris versi yang berubah):
- B1: `1. [R1] Board lebar 390 dan tinggi ≥ 844, status bar 54, dan home indicator.`
- D2: `2. [R1] Isi melebihi 844 → satu board panjang selebar 390 (tinggi mengikuti konten, minimal 844), header di atas dan bilah bayar menempel di bawah board; bukan dua board atau strip gabungan. [T] Font tidak dikecilkan di bawah minimum.`

Batas: v2.2 lama tidak disentuh (eksklusif); tidak ada perubahan isi rubrik lain (tabel ringkasan golden-set dibiarkan); C7 (tidak ada teks rubrik di `packages/skills`); C8 (tanpa agen desain/pen.dev, rejudge hanya juri `claude -p`, ≤ $5, maks 2 kali, `--resume` bila putus); C9 (Node via `/opt/node-26/bin`). Aturan gerbang ukuran tidak menghitung jumlah board (D dua board tetap lulus ukuran; D2 dinilai juri lewat R1) dan rejudge tetap memakai aturan ukuran versi beku sumber (desain story 24).

</intent-contract>

## Implementation Notes

Oneshot: perubahan kode hanya tes + README (< 100 baris); sisanya edit dua baris sumber rubrik (di-exclude git), keluaran `rubric-snapshot`, dan laporan rejudge.

- `rubric-snapshot` sudah membangun teks juri dari `promptIds` (A–E) lewat `prepareJudgeTexts`; tidak perlu perubahan kode.
- Rubrik v2.3 (2026-11-19), `bench/rubric/rubric.json`: judgeTextSha256 A `e3213b0bfccaf09eaab9d317ede5b961a1081b67feaf748e2d60474bb95aa7d7` (= v2.2, baris versi tidak masuk teks juri), B `63d86a4231c30be0458b988b8ebed27d9a00410077314033fc420cf46f013655`, C `3bf18cc6ee538769cb0221134ca9266eabee087a3bbb9fd4ad349633f5b3d5b4`, D `a16e6fcc2b751edfb72ee3b33cd4aee614e89c21447cea86324ce77ef511efce`, E `d3e5324acdef057f4b12fbd817123840f258fd9dc63eb06d05ea60d786544891`; sourceSha256 lampiran-b `b8a7bf4230beb585a269d790d1a761d31f4f6897c015d1fce793b1a6dd2508eb`, golden-kriteria `f1ad623f14eb0c10f7f1e55b3dc9bbf4249ed76c60d237aa1b0f3b67d886c774`.
- v2.2 tidak berubah (tes mengunci sha A/B/sumber lama).
- Rejudge `r2-v2-3` (1 kali, $1,66, tanpa resume): A Setara (T 13 vs 12, D 4 vs 2) = round-2 Setara (13 vs 13) = Adam Setara. B Setara (T 12 vs 11, D 4 vs 3) vs round-2 Lebih baik (13 vs 10), = keputusan Adam (Setara, diturunkan). Selisih B: R1 pen.dev 0 → 1 (B1 v2.3 menerima 390×1044), R5 Lakar 2 → 0 (rentang 2, periksa Adam), R4 Lakar 2 → 2, R6 Lakar 1. Round-2 belum pernah di-rejudge dengan v2.2 (hanya r1/uji-1), jadi pembanding v2.2 untuk round-2 tidak ada; teks juri A v2.2 = v2.3, B hanya beda B1.
- Pelanggaran brief pen.dev B tetap dicatat (aturan ukuran beku sumber v2.1 = persis); tidak memengaruhi keputusan (ditunda, butuh keputusan Adam).

## Plan Change Log

## Review Triage Log

### 2026-11-19 — Review pass
- verdicts: 2 findings — high 0, medium 0, low 2, false 0, maybe-false 0
- findings:
  - `[low]` `[patch]` Tes (b) lampiran-b R4/R9/R10 hanya menolak kata isi prompt A/B padahal rubrik kini menilai A–E — patch: `FORBIDDEN_IN_GENERAL` ditambah kata C–E (Arus, Singgah, Gudangku, penjualan, pesanan, checkout, penginapan, kamar, inventaris, gudang, teal, biru, amber), nama tes A–E; tes bench 213/213 lulus.
  - `[low]` `[patch]` README: kalimat baru di paragraf aturan ukuran tidak di-wrap (~200 karakter) — patch: paragraf di-wrap ulang; baris panjang "Strip Lakar disalin…" sudah ada sebelum story ini, dibiarkan.

## Verification

**Commands:**
- `/opt/node-26/bin/node bench/dist/cli.js rubric-snapshot` -- expected: `bench/rubric/v2.3` ditulis, `rubric.json` versi 2.3 dengan sha A–E
- `/opt/node-26/bin/pnpm build && /opt/node-26/bin/pnpm --filter @lakar/bench test` -- expected: lulus
- `/opt/node-26/bin/pnpm test` -- expected: lulus (kecuali flaky latensi `packages/render/test/visual.test.ts` yang diketahui)
- `/opt/node-26/bin/node bench/dist/cli.js rejudge --from 2 --label r2-v2-3` -- expected: `bench/rejudge-r2-v2-3.md|json`, biaya ≤ $5
- `/opt/node-26/bin/node bench/dist/cli.js round --round 3 --dry-run` -- expected: tanpa masalah sha juri; sisa hanya baseline C–E (story 2.11) dan, sebelum commit, kode tidak beku
- `tools/node26/verify.sh` -- expected: lulus

## Auto Run Result

Status: built.

**Ringkasan:** golden-set.md B1 → "Board lebar 390 dan tinggi ≥ 844, status bar 54, dan home indicator"; D2 → satu board panjang selebar 390 (tinggi mengikuti konten, min 844), header di atas dan bilah bayar menempel di bawah, bukan dua board/strip gabungan. DESIGN.md Lampiran B `Versi rubrik: 2.3 (2026-11-19)`. `rubric-snapshot` menulis `bench/rubric/v2.3/` (lampiran-b, golden-kriteria A–E, judge-text A–E) dan `rubric.json` 2.3 (sha di Implementation Notes). Rejudge hold-out `r2-v2-3`.

**File:** `bench/rubric/v2.3/*` + `bench/rubric/rubric.json` (snapshot), `bench/src/judge/judge.test.ts` (tes snapshot/teks juri A–E, v2.2 terkunci, isi B1/D2 v2.3, kata terlarang A–E), `bench/src/lakar/lakar.test.ts` (sizeRuleFor 2.3 vs B1/D2), `bench/README.md` (rubrik v2.3), `bench/rejudge-r2-v2-3.md|json` (laporan). Di luar git (exclude): `ux-lakar/golden-set.md` (B1, D2), `ux-lakar/DESIGN.md` (baris versi).

**Review:** 1 putaran (quick): 2 patch (low), 3 ditunda (low: tabel ringkasan golden-set, sisa netralisasi D1, aturan ukuran rejudge vs versi rubrik saat ini), 0 ditolak. Follow-up review: false (tidak ada patch high/medium).

**Verifikasi:** `pnpm build` lulus; `pnpm --filter @lakar/bench test` 213/213; `pnpm test` 984/985, gagal hanya `packages/render/test/visual.test.ts` latensi (flaky diketahui; lulus sendiri 18/18). `round --round 3 --dry-run`: rubric.json "sama" untuk A–E; masalah tersisa hanya baseline C, D, E belum diukur (story 2.11) (+ "kode tidak beku" sebelum commit). Rejudge `r2-v2-3` lengkap, 6/6 ulangan, $1,66. `tools/node26/verify.sh` lulus (semua OK), `/usr/bin/node` v22.23.5.

**Risiko sisa:** R5 Lakar B rentang 2 di rejudge (periksa Adam); aturan ukuran rejudge memakai versi beku sumber (ditunda).
