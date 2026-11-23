---
title: 'layout_check: saudara tumpang-tindih tanpa sengaja (LC-34) dan teks keluar dari frame induk (LC-35)'
type: feature
ticket: '3'
created: '2026-11-23'
status: in-progress
baseline_revision: '01390e5ca062fc1b6f6020cd6fcdeb84bc80037e'
route: full
route_source: auto
risk: medium
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `analyze_overlaps` open-pencil menangkap dua cacat yang lolos dari `layout_check`. Pertama, saudara yang bertumpuk tanpa sengaja di luar cakupan LC-11. LC-11 hanya menilai pasangan yang keduanya flow atau keduanya berteks, sehingga ikon absolut di atas teks input atau gambar absolut yang menimpa grup lolos. Kedua, teks yang kotak atau ink terukurnya keluar dari frame induk. LC-02b hanya error bila sisa jarak ke tepi ber-cat atau saudara < 4 px, sehingga teks yang tumpah dari Row transparan ke ruang kosong tidak dilaporkan.

**Approach:** Dua aturan baru di `packages/check` dengan level `warning` (bukan gerbang):
- **LC-34**: saudara konten tumpang tindih tanpa sengaja, untuk pasangan yang tidak dinilai LC-11.
- **LC-35**: teks keluar > 1 px dari kotak frame induk tanpa clip.

Temuan membawa bounds di `detail` (`[x,y,w,h]`) dan hint di `expected`. LC-35 memberi saran `Wrap text` yang diterapkan `fix_check {suggestions:true}`. Tidak ada fix aman.

## Boundaries & Constraints

**Always:**
- Hanya menambah: ID baru di `G0_RULES`, field dan tool lama tetap (AD-4). Golden A–E dan korpus dokumen tetap 0 error.
- Teks temuan dan komentar berbahasa Indonesia. Judul UI di `RULE_TITLE` berbahasa Inggris. Tanpa istilah C7 (`tests/check-c7.test.ts`).
- Placeholder `[Skeleton] ` tidak dinilai (memakai `ctx` hasil prune, seperti aturan lain).

**Never:**
- Mengubah perilaku LC-11 atau LC-02a/b/c, menaikkan `schemaVersion`, menambah field ke `Finding`, membuat UI baru, atau membuat fix aman.

## I/O & Edge-Case Matrix

| Skenario | Input | Hasil |
|---|---|---|
| LC-34 positif | ikon absolut 20×20 menimpa sebagian teks flow di `Input / Email` | 1 warning LC-34 pada node sesudahnya (z-order); detail memuat irisan `[x,y,w,h]` dan nama/ID lawan |
| LC-34 positif | gambar absolut menimpa sebagian grup berteks (rasio luas < 5) | 1 warning LC-34 |
| LC-34 negatif | keduanya flow, atau keduanya berteks (domain LC-11); termuat penuh; lencana kecil (luas ≤ 1/5) di atas non-teks; bentuk dekoratif tanpa konten (rect/ellipse/path tanpa gambar, frame kosong); `Overlay /`/`Crop /`/rotasi/opacity 0; wadah gap negatif atau di dalam `Overlay /`/`Crop /`/`Chart /`; anggota zona bawah LC-20 dan chrome (`Status bar`, `Home indicator`) | tanpa LC-34 |
| LC-35 positif | teks hug di Row transparan meluap 30 px ke kanan dari Row (tidak menabrak apa pun, jadi LC-02b diam) | 1 warning LC-35, detail: sisi + px, bounds teks dan frame; saran `Wrap text` `{width:'fill', wrap:'wrap'}` |
| LC-35 vertikal | kotak teks lebih tinggi dari frame ber-tinggi tetap | warning tanpa saran |
| LC-35 negatif | induk board; induk `clip:true`; leluhur `Crop /`/`Overlay /`/rotasi; sumbu vertikal di bawah `Scroll /`/`scrollY`; teks sudah LC-02a/LC-02b/LC-03; luapan ≤ 1 px; teks kosong atau tak terlihat | tanpa LC-35 |
| Batas | > 3 temuan per board | `capWarnings` membatasi 3 (fix_check `cap:false` melihat semua) |

</intent-contract>

## Code Map

- `packages/check/src/rules.ts` -- satu fungsi per aturan. Pakai ulang helper:
  - `finding`, `texts`, `nonEmpty`, `rotated`, `named`, `textsIn`, `hasImage`, `isChrome`, `bottomZone`, `levelOf`, `overflow`/`SIDES`, `clip120`, `patchFix`, `quote`, `num`;
  - dari `tree.js`: `intersect`, `contains`, `area`, `inkRect`, `union`, `visibleRect`, `ancestors`, `descendants`, `isFlowChild`.
  - Contoh: `lc11` (sekitar baris 1071) untuk filter anak dan pasangan, `lc02b` (sekitar 956) untuk leluhur yang dikecualikan dan sumbu gulir, `lc03` untuk saran wrap. Tambah `lc34(ctx)` dan `lc35(ctx, skip)` sesudah `lc11` dan `lc02c`. Jangan mengubah aturan lama.
- `packages/check/src/index.ts` -- `checkBoard`: panggil `lc34(ctx)`. Panggil `lc35(ctx, skip)` dengan skip = id LC-02a ∪ LC-02b ∪ LC-03. Tambah `'LC-34','LC-35'` ke `RULE_ORDER`, import, dan ekspor.
- `packages/check/src/fixes.ts` -- `AUTOFIX`: `'LC-34': 'none'`, `'LC-35': 'suggestion'`.
- `packages/schema/src/findings.ts` -- `G0_RULES` (edit minimal, file bersama): `'LC-34': {level:'warning', gate:false, title:'saudara tumpang tindih tanpa sengaja'}`, `'LC-35': {level:'warning', gate:false, title:'teks keluar dari frame induknya'}`.
- `packages/schema/src/findings.test.ts` -- daftar ID dan daftar warning.
- `packages/viewer/src/panels.tsx` -- `RULE_TITLE` (hanya data): `'LC-34': 'Siblings overlap by accident'`, `'LC-35': 'Text spills out of its frame'`.
- `packages/mcp/src/server.ts` -- `LAYOUT_CHECK_DESCRIPTION`: satu klausa per aturan baru.
- `tests/execute-description.test.ts` -- pola tes `toContain`.
- `packages/skills/skills/break-ui.md` baris 17 -- tambah LC-34 dan LC-35 ke daftar "pecah" (ada batas ukuran skill di `tests/skills*.test.ts`).
- `packages/check/README.md` -- daftar aturan.
- `packages/check/src/index.test.ts` -- `G1_FILTERED` (sekitar baris 86) menyaring aturan yang fixture G0-nya sintetis. Tambahkan LC-34 dan LC-35 agar ekspektasi lama tetap. Tes baru memakai `runAll` + `only`.
- `packages/check/src/fixes.test.ts` -- `afterAll` memeriksa konsistensi kelas AUTOFIX atas `produced`. Tambah tes saran LC-35.
- `packages/daemon/src/index.test.ts` sekitar baris 691 -- regresi golden A–E (render nyata, 0 error). Jangan diubah. Jalankan sebagai bukti.
- `packages/render/test/corpus.test.ts` dan `tests/support/doc-corpus.ts` -- korpus `tests/fixtures/docs/v1..v8` dan cara render: `harness.ts` `render(doc, boardId, faces)` → `result.measure`.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/schema/src/findings.ts` + `findings.test.ts` -- tambah LC-34 dan LC-35 (warning, tanpa gerbang) -- katalog.
- [ ] `packages/check/src/rules.ts` -- `lc34`, `lc35` sesuai matriks. Rincian di Design Notes.
- [ ] `packages/check/src/index.ts`, `fixes.ts` -- wiring, `RULE_ORDER`, `AUTOFIX`.
- [ ] `packages/check/src/index.test.ts`, `fixes.test.ts` -- tes positif dan negatif tiap baris matriks, isi detail/bounds, level warning, dan saran LC-35.
- [ ] `tests/check-corpus.test.ts` (baru) -- render setiap board korpus (pola `corpus.test.ts`, `describe.skipIf(!browserInstalled)`, harness via path relatif `../packages/render/test/harness.ts`, check via `../packages/check/src/index.ts` dengan `glyphScan(board).allowGlyphs`), lalu `checkBoard` → 0 temuan error. Bila korpus ternyata sudah punya error dari aturan lama, tes menegaskan 0 error dari LC-34/LC-35, dan error lama dicatat di Implementation Notes.
- [ ] `packages/mcp/src/server.ts`, `tests/execute-description.test.ts`, `packages/skills/skills/break-ui.md`, `packages/viewer/src/panels.tsx`, `packages/check/README.md` -- dokumen dan judul.

**Acceptance Criteria:**
- Given fixture yang melanggar, when `layout_check` (checkBoard) berjalan, then temuan ber-ID LC-34/LC-35 muncul dengan level `warning`, bounds `[x,y,w,h]` di detail, dan hint di expected.
- Given golden A–E di daemon, when `/layout-check`, then 0 error.
- Given korpus dokumen, when dirender dan dicek, then 0 error.
- Given temuan LC-35 dengan saran, when `planFixes(findings, {suggestions:true})`, then op `update` `{width:'fill', wrap:'wrap'}` direncanakan. Tanpa `suggestions` tidak ada yang direncanakan.

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

- **Level warning (keputusan, didelegasikan Fatmuh).** Kedua aturan menebak "tanpa sengaja" tanpa tahu maksud. Cacat yang pasti terlihat sudah error di LC-11, LC-02a, dan LC-02b. Error bergerbang berisiko false positive yang membuat agen berputar dan mengubah gerbang bench. Warning tetap tampil di respons `execute` dan `layout_check`.
- **Bounds di `detail`, bukan field baru.** Agen membaca temuan sebagai baris teks `findingLine`. Ini menghindari perubahan skema `Finding`.
- **Kelas konten LC-34:**
  - `teks`: teks tidak kosong;
  - `ikon`;
  - `gambar`: fill image;
  - `grup`: frame yang keturunannya memuat teks, ikon, atau gambar.
  - Selain itu dekoratif (latar, blob, garis) dan pola layer yang sah.
  - Pasangan dinilai bila keduanya konten, tidak (keduanya flow) dan tidak (keduanya berteks). Bentuk pasangan seperti LC-11, rect = ink untuk teks. Syaratnya irisan ≥ 1×1 dan tidak saling memuat.
  - Lencana: luas kecil × 5 ≤ luas besar dan yang besar bukan node teks.
  - Satu temuan per node (yang belakangan di urutan dokumen), lalu `break` seperti LC-11.
  - Contoh detail: `ikon tumpang tindih 12×20px (60% dari yang lebih kecil) dengan teks Placeholder (Id) di Input / Email; irisan [208,12,12,20]`.
- **LC-35:**
  - rect teks = `union(bounds, ink)`; luapan = `overflow(rect, bounds induk)` (kotak luar, bukan content box: padding adalah domain LC-02b). Sisi dihitung bila > `INK_OVERFLOW_MIN`.
  - Saran hanya bila ada sisi kiri/kanan, induk flow ber-layout, dan teks belum `width:'fill'` + `wrap:'wrap'`.
  - Contoh detail: `teks "Harga mulai Rp…" keluar 30px di kanan dari frame Baris (Id); teks [16,10,230,20], frame [16,10,200,20]`.

## Verification

**Commands:**
- `pnpm build` -- expected: sukses.
- `pnpm exec vitest run packages/check packages/schema tests/execute-description.test.ts tests/check-c7.test.ts tests/skills.test.ts tests/check-corpus.test.ts` -- expected: hijau.
- `pnpm exec vitest run packages/daemon/src/index.test.ts -t "golden"` -- expected: A–E 0 error.
- `pnpm test` (dengan `LAKAR_C7_ALLOW_MISSING_SOURCES=1`) -- expected: tanpa kegagalan baru dibanding baseline Windows.
