---
title: 'Flex wrap di skema, render, codegen, dan panel Design'
type: feature
ticket: '6'
created: '2026-11-23'
status: built
baseline_revision: '9ece3808caa82247ce5e81b7071771405b68379c'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: true
context: ['{project-root}/design/README.md']
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Frame Lakar belum punya flex wrap: agen dan pengguna tidak bisa membuat daftar chip/kartu yang membungkus ke baris berikutnya (celah vs open-pencil, riset butir 19/C). Desain Section 11 (`PU4cd`/`oMWUS`) menambah baris Wrap + Row gap di grup Auto layout.

**Approach:** Naikkan `SCHEMA_VERSION` ke 9 dengan properti `wrap?: boolean` pada frame (migrasi identitas, dokumen lama identik), petakan ke `flex-wrap`/`row-gap` di `frameDecls` (satu pemetaan yang dipakai render, codegen CSS, dan Copy as), kontrol Wrap di panel Design sesuai desain, dokumentasi `wrap` di skill api, dan fixture korpus `v9`.

## Boundaries & Constraints

**Always:**
- `wrap` hanya pada frame, opsional `boolean` (`true` = `flex-wrap: wrap`); ketiadaan/`false`/`null` = nowrap. Render hanya memetakannya untuk `layout:'row'|'column'`; `none`/`grid` mengabaikannya.
- Gap baris = properti `rowGap` yang sudah ada (v4, slot token `spacing`); `gap` tetap jarak antar kolom (semantik CSS). Tidak ada properti gap baru.
- Migrasi 8 → 9 identitas (hanya menaikkan `schemaVersion`); kompatibilitas mundur sesuai AGENTS.md (input lama valid, kode error sama).
- Deklarasi CSS hanya lewat `frameDecls` di `@lakar/render` (AD-5); codegen dan Copy as tidak menulis logika layout sendiri di luar itu (copyas hanya menyusun ulang).
- Bahasa: komentar kode/spec Indonesia; teks UI Inggris.
- Panel mengikuti desain Section 11 (design/README.md §Wrap): baris baru di bawah Direction berisi Segmented "No wrap / Wrap" dan Field "Row gap" di sebelahnya.

**Never:**
- `wrap` pada board atau tipe node lain; `wrap-reverse`; `align-content`.
- Route/tool/bentuk respons baru; perubahan perilaku route dan tool lama.
- `wrap` sebagai slot token (bukan panjang); string CSS mentah.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Frame row + wrap | `{layout:'row', wrap:true, gap:12, rowGap:8}` | `flex-wrap: wrap` + `row-gap` di render dan ekspor kode | - |
| Dokumen lama | `schemaVersion` ≤ 8 tanpa `wrap` | Migrasi identitas; deklarasi CSS tidak berubah | - |
| wrap di grid/none | `{layout:'grid', wrap:true}` | Properti tersimpan, render mengabaikannya | - |
| wrap bukan boolean | `{wrap:'wrap'}` pada frame | SCHEMA_INVALID | Error skema biasa |
| Panel Wrap on | klik "Wrap" pada frame row | op `update {wrap:true}`; bisa di-undo (inverse `{wrap:null}`) | - |
| Panel "No wrap" | frame `wrap:true` → klik "No wrap" | op `update {wrap:null}` (properti dihapus) | - |
| Row gap field | frame row wrap | edit menulis `rowGap` (token picker `spacing` tetap berlaku) | - |
| Ganti direction | row+wrap → grid/none | `setLayout`/`enterGrid` juga menghapus `wrap` (panel menyembunyikannya, sama seperti columnGap/rowGap keluar dari grid) | - |
| Paste HTML flex-wrap | `display:flex; flex-wrap:wrap` | frame `layout` + `wrap:true` + gap sumbu silang; `wrap-reverse` tetap `fail` | Dilaporkan seperti semula bila gagal |
| Instance override | bind/override `wrap` pada frame | divalidasi skema frame (sudah di `overridableSet` lewat text) | Nilai non-boolean diabaikan + dilaporkan |

</intent-contract>

## Code Map

- `packages/schema/src/nodes.ts` -- `SCHEMA_VERSION` 8 → 9 + komentar v9; `frameShape` (~:459) tambah `wrap: z.boolean().optional()`. `wrap` sudah ada di `overridableSet` lewat `textShape` (:494), jadi override/bind frame langsung sah; `EXPANDED_NODE_SHALLOW` ikut otomatis.
- `packages/core/src/migrate.ts` -- `MIGRATIONS[8]` identitas → 9 + komentar registri. Update ops `update {wrap}` sudah tervalidasi skema lewat `mergePatch`; inverse undo otomatis (AD-8).
- `packages/render/src/css.ts` -- `FrameLike` + `frameDecls` (:448-498): emit `['flex-wrap','wrap']` setelah `flex-direction` bila `layout` row/column dan `n.wrap === true`.
- `packages/codegen/src/tailwind.ts` -- `KEYWORD` tambah `'flex-wrap': { wrap: 'flex-wrap', nowrap: 'flex-nowrap', 'wrap-reverse': 'flex-wrap-reverse' }`. `tree.ts`/`jsx.ts` tidak berubah (sudah memakai `frameDecls`; family `flex-flow` ada).
- `packages/viewer/src/copyas.ts` -- emit `flex-wrap` bila `flex && node.wrap === true`; sisi Tailwind `flex-${value}`.
- `packages/viewer/src/designModel.ts` -- `setLayout` (:153): keluar dari flex (row/column → grid/none) juga menghapus `wrap`; `enterGrid` (:194) idem. Helper `wrapOf`/`setWrap` opsional — `setProp(ts,'wrap', v ? true : null)` cukup.
- `packages/viewer/src/DesignPanel.tsx` -- `AutoLayoutGroup` (:1043): baris baru di bawah Direction saat `!grid && (on || dir.mixed)`: `Segmented` "No wrap"/"Wrap" (value `n.wrap === true`) + `axisGap('rowGap','Row gap')` yang sudah ada (token spec ikut).
- `packages/viewer/src/componentModel.ts` :145 -- daftar `autoLayout` tambah `'wrap'`.
- `packages/exec/src/api.ts` :859 -- deskripsi frame tambah `wrap?:boolean` (ringkas); regen `packages/skills/skills/api.md` lewat `node scripts/gen-skill-api.mjs` (tes `tests/skills.test.ts` menuntut sama persis).
- `packages/daemon/src/paste/html.ts` `flexLayout` (:439-466) -- terima `flex-wrap: wrap` → `props.wrap = true` + gap sumbu silang ke `rowGap`/`columnGap`; `wrap-reverse` tetap `fail`.
- `tests/fixtures/docs/v9/flex-wrap.lakar.json` (baru) -- fixture wajib versi baru: frame row `wrap:true` + `rowGap` (satu dengan token `spacing`), anak fixed yang membungkus 2 baris; frame `wrap:false`/tanpa wrap sebagai kontrol identik. Perbarui tabel `tests/fixtures/docs/README.md`.
- `tests/doc-corpus.test.ts` -- blok `migrasi v8 → v9` pola v7 → v8 (:344): identitas, hasil v8 = versi kini, isi fixture v9, jalur mutasi core (update `wrap`, inverse undo memulihkan).
- `packages/schema/src/index.test.ts` :69-80 -- judul/ekspektasi versi 9 (v9 valid; 10 dan ≤8 ditolak langsung).
- `packages/render/src/css.test.ts` / `css-decls.test.ts` -- `frameDecls` wrap: row → decl; grid/none/tanpa wrap/false → tanpa decl.
- `packages/codegen/src/codegen.test.ts` dan `tests/codegen.test.ts` -- CSS `.x { flex-wrap: wrap }` + Tailwind `flex-wrap` pada fixture corpus.
- `packages/viewer/src/designModel.test.ts` :267+ -- `setLayout` strip `wrap`, `enterGrid` strip, op wrap.
- `packages/viewer/src/DesignPanel.dom.test.tsx` (baru) -- pola `*.dom.test.tsx` + `renderUi`/`test/dom`/`test/fixtures`: kontrol Wrap tampil untuk frame row, klik → `onCommit` op `{wrap:true}`/`{wrap:null}`; Row gap field meng-commit `rowGap`.
- `packages/daemon/src/paste/html.test.ts` -- kasus flex-wrap → `wrap:true`.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/schema/src/nodes.ts` -- `SCHEMA_VERSION` = 9 + komentar v9; `wrap: z.boolean().optional()` di `frameShape` -- sumber kebenaran skema.
- [ ] `packages/core/src/migrate.ts` -- `MIGRATIONS[8]` identitas + komentar -- migrasi 8 → 9.
- [ ] `packages/render/src/css.ts` -- `wrap` di `FrameLike` + emit `flex-wrap` di `frameDecls` -- pemetaan tunggal render/codegen.
- [ ] `packages/codegen/src/tailwind.ts` -- KEYWORD `flex-wrap` -- kelas Tailwind ekspor.
- [ ] `packages/viewer/src/copyas.ts` -- `flex-wrap` di CSS dan Tailwind Copy as -- paritas dengan pemetaan tunggal.
- [ ] `packages/viewer/src/designModel.ts` -- strip `wrap` di `setLayout`/`enterGrid` saat keluar flex -- tidak ada properti tak terlihat yang tersimpan.
- [ ] `packages/viewer/src/DesignPanel.tsx` + `componentModel.ts` -- baris Wrap + Row gap sesuai desain; `wrap` di daftar autoLayout -- kontrol pengguna.
- [ ] `packages/exec/src/api.ts` + regen `packages/skills/skills/api.md` -- `wrap?:boolean` terdokumentasi untuk agen.
- [ ] `packages/daemon/src/paste/html.ts` -- impor `flex-wrap: wrap` + gap sumbu silang -- fidelity paste/impor.
- [ ] `tests/fixtures/docs/v9/flex-wrap.lakar.json` + `tests/fixtures/docs/README.md` -- fixture versi baru + dokumentasi korpus.
- [ ] `tests/doc-corpus.test.ts` + `packages/schema/src/index.test.ts` -- blok v8 → v9 dan ekspektasi versi -- pengaman migrasi.
- [ ] Tes unit: `packages/render/src/css.test.ts`, `packages/codegen/src/codegen.test.ts`, `tests/codegen.test.ts`, `packages/viewer/src/designModel.test.ts`, `packages/viewer/src/DesignPanel.dom.test.tsx` (baru), `packages/daemon/src/paste/html.test.ts` -- matriks kasus.

**Acceptance Criteria:**
- Given fixture korpus v1..v8, when `parseDocument`/`resolveDocument`, then semua lolos dan `schemaVersion` = 9 tanpa perubahan isi selain versi (migrasi identitas).
- Given frame `{layout:'row', wrap:true, rowGap:8}` dengan anak berlebih lebar, when dirender (decls `frameDecls`) dan diekspor codegen (CSS + Tailwind), then keduanya memuat `flex-wrap: wrap`/`flex-wrap` dan `row-gap`/`gap-y-…`; parity test korpus v9 hijau (bila browser terpasang; skip bersih bila tidak).
- Given dokumen `schemaVersion` ≤ 8 tanpa `wrap`, when dirender, then deklarasi `frameDecls` identik dengan sebelum perubahan (tidak ada `flex-wrap`).
- Given frame row terpilih di panel Design, when "Wrap" dipilih, when "No wrap" dipilih, then masing-masing `update {wrap:true}` dan `{wrap:null}` via `onCommit`; inverse op mengembalikan keadaan (undo).
- Given frame `layout:'row', wrap:true`, when direction diganti ke grid/none di panel, then patch juga memuat `wrap:null`.
- Given `read_skill api`, when agen membaca properti frame, then `wrap` tercantum; `api.md` sama persis dengan `renderApiMarkdown()`.
- Given `display:flex; flex-wrap:wrap` di paste HTML, when diimpor, then frame mendapat `wrap:true` dan gap sumbu silang di `rowGap`/`columnGap`.

## Implementation Notes

Diimplementasikan oleh subagent rute `full` (agent b3823455), lalu ditambal dari hasil review:

- Skema v9: `SCHEMA_VERSION` 9, `wrap: z.boolean().optional()` di `frameShape`; `MIGRATIONS[8]` identitas. Versi literal di tes (`v2/v3/v4/vector`, `store`, `codegen`, `components`, `fixtures`, `cssImport`, `codeExport`, `bench round` + snap) disesuaikan ke 9.
- `frameDecls` emit `flex-wrap: wrap` hanya di cabang row/column bila `wrap === true`; `FrameLike.wrap: unknown` mengikuti konvensi properti lain.
- Tailwind KEYWORD `flex-wrap`; copyas emit `flex-wrap`/`flex-${value}`; `GROUP_PROPS.autoLayout` + `'wrap'`.
- Panel: baris `Segmented` "No wrap"/"Wrap" + Field "Row gap" di bawah Direction saat `!grid && (on || dir.mixed)`; `setLayout`/`enterGrid` men-stripping `wrap` keluar flex (`opsFor` membuang `null` untuk properti absen, jadi tidak ada op basi).
- api.ts mendokumentasikan `wrap?:boolean`; api.md diregen lewat `scripts/gen-skill-api.mjs` setelah `pnpm build` (regen sebelum build menghasilkan file basi — pelajaran tercatat).
- Impor paste: `flex-wrap: wrap` → `wrap:true` + gap sumbu silang → `rowGap`/`columnGap`; `wrap-reverse` tetap `fail`. Patch review: `align-content` non-normal/stretch saat wrap → `fail('align-content')` (STYLE_PROPS + guard); nowrap tidak terpengaruh.
- Fixture `tests/fixtures/docs/v9/flex-wrap.lakar.json` + golden codegen react-css/react-tailwind; blok migrasi v8 → v9 di doc-corpus; tes DOM panel baru.

## Plan Change Log

## Review Triage Log

### 2026-11-23 — Review pass
- verdicts: 4 findings — high 0, medium 2, low 1, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` paste `flex-wrap:wrap` + `align-content` non-default mengimpor `wrap:true` dan menjatuhkan distribusi baris secara senyap (sebelumnya `fail('flex-wrap')` → none + lapor). Ditambal: `'align-content'` di `STYLE_PROPS`, `fail('align-content')` hanya saat `wrap==='wrap'`; tes wrap+space-between gagal-terlapor, normal/stretch lolos, nowrap tak terpengaruh.
  - `[medium]` `[patch]` dok api menyebut gap sumbu silang wrap = `rowGap` untuk semua arah; benar: `rowGap` di row, `columnGap` di column. Ditambal di `api.ts` + regen `api.md`.
  - `[false]` `[reject]` seleksi campuran menulis `wrap`/`rowGap` ke frame non-flex — matriks intent sendiri melegalkan `wrap` tersimpan di frame grid/none ("properti tersimpan, render mengabaikannya"); tulisan eksplisit pengguna via multi-select, konsisten dengan Gap/Padding.
  - `[low]` `[reject]` field "Row gap" pada `layout:'column'` mengedit sumbu utama dan tak ada kontrol `columnGap` di flex — desain Section 11 hanya mengamanatkan Field "Row gap" (jujur mengedit CSS row-gap); `gap` menutup kasus umum; kontrol adaptif menyimpang dari desain bernama dan menambah kompleksitas.

## Design Notes

Keputusan (delegasi Fatmuh "terima jadi"): `wrap` sebagai `boolean` — desain hanya punya dua keadaan (No wrap/Wrap) dan cocok preseden `clip: z.boolean()`; CSS `wrap-reverse` tidak diminta. Nama `wrap` dipakai ulang dari properti teks: overloading nilai per tipe node sudah ada presedennya (`align` beda makna di frame vs text). "No wrap" menulis `wrap:null` (properti dihapus), bukan `false`, supaya dokumen tetap minimal dan lama identik.

Panel: baris Wrap tampil untuk `layout` row/column (dan seleksi campuran non-grid), tepat di bawah Direction; Field "Row gap" selalu aktif di baris itu (mengedit `rowGap`, warisan `gap` lewat `axisGapOf` seperti grid).

Skema uji: `tests/codegen-parity.test.ts` dan `tests/codegen.test.ts` mengiterasi seluruh korpus — fixture `v9` otomatis dapat uji paritas piksel render vs ekspor. `packages/render/test/corpus.test.ts` me-render board fixture (skip bila Chromium tidak terpasang).

## Verification

**Commands:**
- `node scripts/gen-skill-api.mjs` -- regen `packages/skills/skills/api.md` sesudah edit `api.ts`; expected: `api.md` identik dengan `renderApiMarkdown()` (tes skills hijau).
- `pnpm build` -- expected: tsc -b + viewer build sukses.
- `pnpm exec vitest run tests/doc-corpus.test.ts packages/schema packages/core/src/migrate.test.ts packages/render/src packages/codegen tests/codegen.test.ts packages/viewer/src/designModel.test.ts packages/viewer/src/copyas.test.ts packages/viewer/src/DesignPanel.dom.test.tsx packages/daemon/src/paste/html.test.ts tests/skills.test.ts tests/dependency-direction.test.ts` -- expected: semua hijau (tes browser-render boleh skip bersih di Windows).
- `set LAKAR_C7_ALLOW_MISSING_SOURCES=1 && pnpm test` -- expected: baseline Windows ±49–55 kegagalan yang sudah dikenal, tanpa kegagalan baru; CI Linux acuan.

**Manual checks (if no CLI):**
- `frameDecls` tidak memuat `flex-wrap` untuk fixture v1..v8 (regresi visual nol).

## Auto Run Result

Status: built

**Ringkasan perubahan.** Skema v9 menambah `wrap?:boolean` pada frame dengan migrasi identitas 8 → 9. `frameDecls` memetakan `wrap:true` → `flex-wrap: wrap` (hanya row/column); `rowGap`/`columnGap` yang sudah ada menyediakan gap antarbaris/kolom. Pemetaan tunggal dipakai render, codegen CSS (plus keyword Tailwind `flex-wrap`), dan Copy as viewer. Panel Design mendapat baris "No wrap / Wrap" + "Row gap" di bawah Direction sesuai desain Section 11, menulis lewat op `update` (`wrap:true`/`wrap:null`) yang bisa di-undo via inverse op. Skill api mendokumentasikan `wrap` per arah; importer paste menerima `flex-wrap: wrap` dan menolak `wrap-reverse`/`align-content` tak-standar seperti semula. Fixture korpus `v9` + golden codegen menutup paritas render/ekspor.

**Berkas berubah (ringkas).** `packages/schema/src/nodes.ts` (v9 + `frameShape.wrap`), `packages/schema/README.md`; `packages/core/src/migrate.ts` (`MIGRATIONS[8]`); `packages/render/src/css.ts` (`FrameLike.wrap` + decl); `packages/codegen/src/tailwind.ts` (keyword); `packages/viewer/src/{copyas.ts, designModel.ts, DesignPanel.tsx, componentModel.ts}` + `DesignPanel.dom.test.tsx` (baru); `packages/exec/src/api.ts` + `packages/skills/skills/api.md`; `packages/daemon/src/paste/{html.ts, html-page.ts}`; `tests/fixtures/docs/v9/flex-wrap.lakar.json` + `tests/fixtures/codegen/v9-flex-wrap.react-{css,tailwind}.txt` + README korpus; tes di schema/core/render/codegen/viewer/daemon/doc-corpus/bench menyesuaikan versi 9 dan kasus wrap.

**Review findings.** 4 temuan lens quick: 2 medium ditambal (align-content diimpor senyap → `fail('align-content')`; dok api sumbu gap per-arah → dikoreksi + regen). 2 ditolak: `[false]` wrap tersimpan di non-flex memang disahkan matriks intent; `[low]` kontrol "Row gap" di column sesuai desain bernama, kasus niche.

**Follow-up review recommendation:** `true` — dua entri `medium` ditambal pada pass pertama; risiko belum ter-review: guard `align-content` di importer dan redaksi ulang `api.md`/`api.ts` (ditambal oleh subagent yang sama, belum ada lensa kedua).

**Verifikasi.** `pnpm build` hijau. Vitest targeted (23 berkas, 823 tes pra-patch; +5 tes patch): semua hijau kecuali quirk Windows terdokumentasi (`skills.test` layout.md CRLF; `store.test` skema ESM `c:` + satu timeout retensi flake). `pnpm test` penuh (set `LAKAR_C7_ALLOW_MISSING_SOURCES=1`): 2896 lolos / 57 gagal — seluruh kegagalan di kategori baseline Windows terdokumentasi (provider/key foto ±30, hash CRLF bench ±12, timeout hook teardown ±7, flake Chromium, ESM `c:`, SIGTERM, release.sh); tidak ada kegagalan asersi baru di berkas yang disentuh; render korpus (termasuk v9) lolos — kegagalan file itu hanya `afterAll`. Post-patch re-run: html.test 14/14, html-page, skills api.md identik, doc-corpus hijau.

**Risiko residual.** Uji paritas piksel codegen vs render daemon untuk fixture v9 berjalan lewat `tests/codegen-parity.test.ts`/render corpus — di Windows suite itu hijau tetapi `render/test/corpus` gagal di hook teardown (bukan asersi); CI Linux acuan akhir. Dokumen lama dijamin identik oleh migrasi identitas + guard `n.wrap === true`.
