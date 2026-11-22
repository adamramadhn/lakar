---
title: 'Layout grid di skema, render, dan panel (epic editor-canvas story 7)'
type: 'feature'
created: '2026-11-23'
status: 'done'
baseline_revision: 'd32e5be9eeefbc2fb03b840132102034ae1adffe'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
  - '{project-root}/tests/fixtures/docs/README.md'
warnings: ['oversized']
deferred:
  - summary: Panel Design belum punya kontrol penempatan anak grid (gridColumn/gridRow).
    evidence: Desain Xxi0M tidak memuatnya; dicatat di deferred-work.md.
    location: packages/viewer/src/DesignPanel.tsx
    severity: low
  - summary: Drag reorder di canvas tidak mengenal kontainer grid.
    evidence: gesture.ts dropContainer/reorderTarget hanya row/column; dicatat di deferred-work.md.
    location: packages/viewer/src/gesture.ts
    severity: low
  - summary: Panel grid tidak menyunting jenis track per kolom (hanya jumlah).
    evidence: Desain tidak memuat editor track; dicatat di deferred-work.md.
    location: packages/viewer/src/DesignPanel.tsx AutoLayoutGroup
    severity: low
---

<intent-contract>

## Intent

**Problem:** Frame hanya punya `layout row|column|none`. Grid kartu dan galeri harus ditiru dengan baris flex bersarang, dan segmen Grid di panel Design masih non-aktif ("Grid layout comes in a later update"). AD-13 sudah menetapkan kosakatanya: `layout:'grid'` + `gridTemplateColumns: Track[]` (`px | fr | auto | minmax`).

**Approach:** Naikkan `SCHEMA_VERSION` ke 4 dengan `MIGRATIONS[3]` identitas.
- **Skema:** frame mendapat `layout:'grid'`, `gridTemplateColumns`/`gridTemplateRows` (track bertipe), `columnGap`/`rowGap` (slot token panjang). Semua node anak mendapat penempatan opsional `gridColumn`/`gridRow`.
- **Pemetaan CSS (AD-5):** fungsi baru di `packages/render/src/css.ts`, dipakai oleh `layout.ts` (canvas dan render daemon) serta Copy as.
- **Panel Design:** segmen Grid aktif, dengan kolom Columns, Rows, Column gap, Row gap, Padding, dan Align (desain 05 Editor, XZif7 / `Xxi0M`).
- **Lainnya:** dokumen API `execute` + `api.md`, satu baris di skill webapp, fixture korpus v4, dan golden baru.

## Boundaries & Constraints

**Always:**
- **Bentuk track (tertutup, tanpa string CSS):**

  | Track | Contoh JSON | CSS |
  |---|---|---|
  | px | `120` (angka ≥ 0) | `120px` |
  | fr | `{fr: 1}` (fr > 0) | `1fr` |
  | auto | `'auto'` | `auto` |
  | minmax | `{minmax: [min, max]}`; min = px \| `'auto'`, max = px \| fr \| `'auto'` | `minmax(120px, 1fr)` |

  - `gridTemplateColumns?`/`gridTemplateRows?`: array track 1–`GRID_TRACKS_MAX` (24) elemen. Ditulis apa adanya, tanpa `repeat()`.
  - Track tidak menerima ref token.
- **Gap grid:**
  - `columnGap?`/`rowGap?`: `tok(Size)` (≥ 0), slot token panjang dengan tipe utama `spacing` di tabel slot `tokens.ts`.
  - `gap` lama tetap berlaku sebagai CSS `gap` (kedua sumbu). `columnGap`/`rowGap` menimpanya per sumbu.
  - `columnGap`/`rowGap` dipetakan untuk setiap layout selain `none` (semantik CSS).
- **Penempatan anak:**
  - `gridColumn?`/`gridRow?`: `{start?, end?, span?}`.
    - `start`/`end`: integer garis bukan 0, dalam rentang −25..25. Nilai negatif dihitung dari ujung, seperti CSS.
    - `span`: integer 1..24.
    - Minimal satu kunci. `end` dan `span` tidak boleh bersamaan.
  - CSS: `{start:2}` → `2`, `{start:1,end:3}` → `1 / 3`, `{span:2}` → `span 2`, `{start:2,span:2}` → `2 / span 2`, `{end:3}` → `auto / 3`.
  - Hanya diterapkan render bila parent grid dan anak bukan absolute. Di tempat lain diabaikan, tetapi tetap tersimpan.
- **Semantik grid (render `layout.ts`):**
  - Frame grid: `display:grid` + template, `gap`, `column-gap`, `row-gap`.
  - `align` → `align-items` dan `justify` → `justify-content`, dengan peta `ALIGN`/`JUSTIFY` yang sama dengan flex (deklarasi identik).
  - Sizing anak flow di sel grid:

    | Sizing | CSS |
    |---|---|
    | angka | ukuran px |
    | `fill` | `justify-self`/`align-self: stretch`, ukuran `auto`, min 0 |
    | `hug` | `fit-content` |
    | tidak diisi | default CSS grid (regang di sel, tinggi ikut `align`) |

  - min/max seperti sekarang.
  - Gap negatif lewat margin hanya untuk row/column.
  - Anak absolute tetap memakai x/y.
- **Check:** grid diperlakukan sebagai parent flow (`tree.ts` sudah begitu). Aturan khusus row/column tidak berlaku untuk grid, dan tidak boleh crash.
- **Viewer:**
  - Tipe layout induk (`ParentLayout`, `GeoNode.layout`) mengenal `grid`. Anak grid adalah flow: X/Y tidak bisa diedit, dan ungroup di parent grid mempertahankan flow.
  - Panel grid:
    - Columns = jumlah track kolom (integer 1–24; tanpa template ditampilkan 1).
    - Rows = jumlah track baris (kosong = placeholder `Auto`; 0/kosong → `gridTemplateRows:null`).
    - Mengubah jumlah mempertahankan track awal dan menambah `{fr:1}` (kolom) atau `'auto'` (baris).
    - Column gap = `columnGap ?? gap ?? 0`, Row gap = `rowGap ?? gap ?? 0` (≥ 0).
    - Padding dan Align tetap ada. Justify disembunyikan di mode grid (desain).
  - Memilih segmen Grid → `{layout:'grid'}`, ditambah `gridTemplateColumns` = min(max(jumlah anak, 1), 3) × `{fr:1}` bila template belum ada.
- **Copy as:**
  - CSS: `display: grid`, `grid-template-columns`, `grid-template-rows`, `gap`, `column-gap`, `row-gap`, `padding`, `align-items`, `justify-content`. Node yang membawa penempatan juga mendapat `grid-column`/`grid-row`.
  - Tailwind: `grid grid-cols-[…] grid-rows-[…] gap-x-[…] gap-y-[…] col-[…] row-[…]`.
- **Kompatibilitas (AD-3, AD-4):**
  - `MIGRATIONS[3]` hanya menaikkan `schemaVersion`.
  - Dokumen v1–v3 di korpus bermigrasi tanpa perubahan lain.
  - Input node v3 tetap valid. Route, tool, dan kode error lama tidak berubah.
  - Golden lama tidak berubah.
  - Asersi `SCHEMA_VERSION` 3 → 4 diperbarui, tanpa melemahkan asersi lain.

**Never:**
- `repeat()`, `auto-fill`/`auto-fit`, area bernama, `grid-auto-flow`, `justify-items`/`justify-self` per anak, atau `flexWrap`.
- Kontrol penempatan anak (`gridColumn`/`gridRow`) di panel. Desain tidak memuatnya: ditunda.
- Reorder drag di dalam grid. Kontainer drop tetap hanya row/column: ditunda.
- Mengubah golden lama, nama/arti kode error, atau default config.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Migrasi | dokumen v3 (`tema-mode`) | `{...raw, schemaVersion:4}`, deep-equal | - |
| Skema valid | frame `layout:'grid'`, columns `[80,{fr:1},{minmax:['auto',{fr:2}]}]`, `columnGap:{$token:'space.4'}` | lolos `LakarDocument` + `resolveTokens` | - |
| Track salah | `{fr:0}`, `-4`, `'1fr'`, `{minmax:[{fr:1},10]}`, array kosong, 25 track | ditolak | `SCHEMA_INVALID` |
| Penempatan salah | `{}`, `{start:0}`, `{span:2,end:4}`, `{span:0}` | ditolak | `SCHEMA_INVALID` |
| Token salah slot | `rowGap` merujuk token `color` | ditolak | `SCHEMA_INVALID` menyebut path dan token |
| CSS track | `[80,{fr:1},'auto',{minmax:[120,{fr:2}]}]` | `80px 1fr auto minmax(120px, 2fr)` | entri tak valid → undefined (deklarasi dilewati) |
| Render grid | frame 400, padding 10, columns `[80,{fr:1},{fr:2}]`, rows `[40,'auto']`, columnGap 10, rowGap 8, align center | kolom 80 / 93.33 / 186.67, baris kedua di y=58, item `fill` meregang, item `{span:2}` lebar 290 | - |
| Check grid | board dengan frame grid + anak | `checkBoard` tidak melempar; tanpa temuan khusus row/column | - |
| Copy as | frame grid + anak `{gridColumn:{span:2}}` | CSS/Tailwind seperti di Always | - |
| Panel Columns | grid 3 kolom `{fr:1}` → ketik `4`; ketik `2` | `[fr,fr,fr,fr]`; `[fr,fr]` | `0`/`abc`/`25` → batal, tanpa request |
| Panel Rows | kosong → `2`; `2` → kosong | `['auto','auto']`; `gridTemplateRows:null` | - |
| Panel gap | frame `gap:12` → Column gap `20` | `{columnGap:20}` (gap tetap) | negatif → batal |
| Segmen Grid | frame row 2 anak → klik Grid | `{layout:'grid', gridTemplateColumns:[{fr:1},{fr:1}]}` | template sudah ada → hanya `layout` |

</intent-contract>

## Code Map

- `packages/schema/src/nodes.ts` -- `SCHEMA_VERSION`, `Layout`, `frameShape`, `childBase`, tipe ekspor. Tambah `GridTrack`, `GridTemplate`, `GridPlacement`, dan konstanta batas.
- `packages/schema/src/tokens.ts` -- `LENGTH_KEYS` (slot `columnGap`/`rowGap`).
- `packages/core/src/migrate.ts` -- `MIGRATIONS[3]`.
- `packages/render/src/css.ts` -- `gridTrackCss`, `gridTemplateCss`, `gridLineCss`, diekspor lewat `index.ts`.
- `packages/render/src/layout.ts` -- `Parent`, `appendChildren` (margin gap negatif), `renderChild`, `renderFrame`, `applyGridItem` (baru).
- `packages/check/src/tree.ts`, `rules.ts` -- grid sudah dianggap flow. Hanya perlu tes.
- `packages/viewer/src/copyas.ts` -- deklarasi grid dan Tailwind.
- `packages/viewer/src/designModel.ts` -- `ParentLayout`, `parentLayoutOf`, `layoutOf`, `setLayout`. Tambah `trackCount`, `setTrackCount`, `enterGrid`.
- `packages/viewer/src/DesignPanel.tsx` -- `AutoLayoutGroup`.
- `packages/viewer/src/gesture.ts`, `liveGeometry.ts`, `editActions.ts` -- tipe layout `grid` dan flow ungroup.
- `packages/exec/src/api.ts` -- `API_REFERENCE` (frame + bagian Grid). `packages/skills/skills/api.md` dibuat ulang lewat `scripts/gen-skill-api.mjs`.
- `packages/skills/skills/webapp.md` -- satu baris grid kartu.
- `tests/fixtures/docs/v4/*.lakar.json`, `tests/fixtures/docs/README.md`, `tests/doc-corpus.test.ts` -- korpus.
- `packages/render/test/layout.test.ts` + `golden/grid.png` -- golden baru.
- Tes versi lama:
  - `packages/schema/src/index.test.ts`, `v2.test.ts`, `v3.test.ts`;
  - `packages/core/src/migrate.test.ts`;
  - `packages/daemon/src/store.test.ts`;
  - `bench/src/round/round.test.ts`.

## Tasks & Acceptance

**Execution:**
- `packages/schema/src/nodes.ts` -- skema grid + versi 4. `packages/schema/src/tokens.ts` -- slot gap grid.
- `packages/core/src/migrate.ts` -- langkah 3 → 4 identitas.
- `packages/render/src/css.ts` + `index.ts` + `layout.ts` -- pemetaan dan mount grid.
- `packages/viewer/src/copyas.ts`, `designModel.ts`, `DesignPanel.tsx`, `gesture.ts`, `liveGeometry.ts`, `editActions.ts` -- Copy as, model, dan panel grid.
- `packages/exec/src/api.ts` + regen `api.md`. `packages/skills/skills/webapp.md` -- dokumentasi.
- `tests/fixtures/docs/v4/grid-galeri.lakar.json` + README -- fixture v4 (grid dengan semua jenis track, `gridTemplateRows`, token di `columnGap`, penempatan span/start-end).
- Tes:
  - `packages/schema/src/v4.test.ts` (baru) untuk skema dan tabel slot;
  - `packages/core/src/migrate.test.ts` untuk 3 → 4;
  - `packages/render/src/css.test.ts` untuk track dan garis;
  - `packages/render/test/layout.test.ts` untuk golden `grid` + bounds;
  - `packages/check/src/index.test.ts` untuk grid tidak crash;
  - `packages/viewer/src/copyas.test.ts` dan `designModel.test.ts` untuk panel;
  - `tests/doc-corpus.test.ts` untuk migrasi v1–v3 → v4 identitas;
  - tes versi lama 3 → 4.

**Acceptance Criteria:**
- Given dokumen v3 di data dir daemon, when dibuka, then ditulis balik sebagai v4 dan render tetap sukses.
- Given contoh Grid di `api.md`, when dijalankan lewat `execute` (skills-examples), then sukses dengan 0 error dan 0 warning.
- Given frame grid di viewer, when pengguna mengubah Columns atau Column gap di panel Design, then satu op `update` dikirim dan canvas merender kolom baru.
- Given suite golden render, when dijalankan tanpa `LAKAR_UPDATE_GOLDEN`, then golden lama dan `grid.png` lulus.

## Spec Change Log

## Review Triage Log

### 2026-11-23 - Review pass
- verdicts: 31 findings - high 0, medium 8, low 20, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) keluar dari grid meninggalkan `columnGap`/`rowGap` yang tetap berlaku di flex tanpa terlihat di panel - `designModel.setLayout` kini menambah `columnGap:null, rowGap:null` saat frame grid pindah ke row/column/none (template dipertahankan); dites di `designModel.test.ts`.
  - `[medium]` `[patch]` (blind) drag anak grid memicu reorder yang memindahkannya ke leluhur flex - `canvasEdit.tsx` `startDrag` membatalkan gestur bila parent `layout === 'grid'` (reorder grid tetap ditunda).
  - `[low]` `[patch]` (blind) `gap` negatif di grid diterima lalu hilang diam-diam - `api.md` kini menyebut "gap negatif diabaikan di grid"; Copy as dan panel menyelaraskan (lihat baris edge terkait).
  - `[low]` `[patch]` (blind) dokumen API menyatakan anak tanpa ukuran selalu meregang - kalimat Grid di `api.ts` diperbaiki: tinggi hanya meregang bila `align` kosong/`stretch`; `api.md` dibuat ulang.
  - `[low]` `[patch]` (blind) contoh Grid menyisakan sel kosong - contoh kini dua kartu + satu kartu `span:2`.
  - `[low]` `[reject]` (blind) seleksi campuran grid + row menampilkan kontrol flex - jarang; Gap/Justify tetap valid CSS di grid; perbaikannya menambah cabang UI.
  - `[low]` `[reject]` (blind) Copy as menulis `grid-column` meski parent bukan grid / node absolute - penempatan pada node non-grid jarang; Copy as tidak tahu parent, perbaikan butuh parameter baru.
  - `[low]` `[reject]` (blind) Copy as tetap menulis `gap` saat kedua gap sumbu ada - CSS valid (kaskade), mencerminkan properti tersimpan; kosmetik.
  - `[low]` `[patch]` (blind) `GRID_TRACKS_MAX` diduplikasi di viewer - `designModel.ts` kini mengimpor dan mengekspor ulang konstanta dari `@lakar/schema`.
  - `[low]` `[reject]` (blind) scrub Columns `step 0.1` dan pemangkasan track kustom - langkah 10px/unit disengaja agar scrub jumlah tidak meloncat; pemangkasan sesuai spec (track awal dipertahankan).
  - `[low]` `[reject]` (blind) `GridPlacement` menerima `start === end`/terbalik/garis di luar template - semantik CSS (tukar garis / implicit track) identik di canvas, render daemon, dan Copy as; refine tambahan menambah kompleksitas.
  - `[medium]` `[patch]` (blind) cakupan render grid tipis (hug, tanpa ukuran, gridRow, gap negatif) - tes bounds baru di `packages/render/test/layout.test.ts` (tanpa golden baru).
  - `[low]` `[patch]` (blind) judul tes `v2.test.ts` masih "SCHEMA_VERSION 3" - diganti "SCHEMA_VERSION 4".
  - `[low]` `[patch]` (blind) cek truthiness di `doc-corpus.test.ts` rapuh terhadap gap 0 - diganti `!== undefined`.
  - `[false]` `[reject]` (blind) bagian proses spec kosong - Review Triage Log dan Auto Run Result diisi pada langkah review ini (urutan alur bmad-build-auto).
  - `[low]` `[patch]` (blind) tes check menjalankan `run` dua kali dan tidak memeriksa temuan khusus row/column - hasil dipakai ulang; tes grid bersih kini mengharapkan nol temuan (semua level).
  - `[medium]` `[patch]` (edge) drag anak grid keluar dari grid - sama dengan baris blind drag; patch yang sama.
  - `[low]` `[patch]` (edge) Column/Row gap panel menampilkan gap negatif warisan flex - helper `axisGapOf` menampilkan 0 untuk gap negatif; dites.
  - `[medium]` `[patch]` (edge) gap sumbu tersembunyi menimpa Gap sesudah keluar dari grid - sama dengan baris blind pertama; patch yang sama.
  - `[low]` `[reject]` (edge) seleksi campuran grid/flex - sama dengan baris blind seleksi campuran.
  - `[low]` `[reject]` (edge) jumlah pecahan `1.5` dibulatkan - konvensi `parseNumber({int})` di seluruh panel (dites `designValues.test.ts`: `2.6` → 3).
  - `[low]` `[reject]` (edge) penempatan `start === end`/terbalik - sama dengan baris blind `GridPlacement`.
  - `[low]` `[reject]` (edge) Copy as `grid-column` pada node absolute - sama dengan baris blind Copy as penempatan.
  - `[low]` `[patch]` (edge) Copy as menulis `gap: -4px` untuk grid - `copyas.ts` melewati gap negatif pada grid (flex tetap); dites di `copyas.test.ts`.
  - `[low]` `[patch]` (edge) judul tes `v2.test.ts` basi - sama dengan baris blind; patch yang sama.
  - `[medium]` `[patch]` (vgap) cabang `hug`/tanpa ukuran/`gridRow`/gap negatif grid dan gap sumbu di flex tanpa verifikasi geometri - tes bounds baru `grid: hug, tanpa ukuran, gridRow span/start, gap negatif diabaikan; gap sumbu di flex` lulus.
  - `[medium]` `[patch]` (vgap) aturan parse Columns/Rows hanya di lambda panel tanpa tes - dipindah ke `parseColumnCount`/`parseRowCount`/`formatRowCount` di `designModel.ts` dan dites (Columns `0`/`abc`/`25` → batal; Rows kosong → 0).
  - `[false]` `[reject]` (intent) render daemon grid tidak dijalankan - `skills-examples.test.ts` menjalankan contoh Grid `api.md` lewat `execute` terhadap daemon nyata (render + check, 0 warning); smoke msedge membuka dokumen grid di daemon lokal dan canvas memakai `grid-template-columns`.
  - `[medium]` `[patch]` (intent) panel diuji hanya di lapisan model - helper parse dites (baris vgap) dan smoke msedge: dokumen v4 dibuka, segmen Grid aktif, Justify tersembunyi, Columns 4→2 dan Column gap token→20 tersimpan di file dan dirender canvas (`200px 1fr`, column-gap 20px).
  - `[false]` `[reject]` (intent) kesetiaan desain hanya diklaim - desain dibaca lewat MCP pencil saat perencanaan (screenshot `Xxi0M`: Direction 4 segmen; Columns | Rows; Column gap | Row gap; Padding | Align); screenshot smoke cocok.
  - `[low]` `[reject]` (intent) kontrol penempatan/drag grid (tafsiran R4) - desain tidak memuatnya; sudah tercatat di `deferred` spec dan `deferred-work.md`.

## Design Notes

- **Bentuk track.** Bentuknya objek kecil, bukan string `'1fr'`, karena AD-1 melarang string CSS bebas.
  - Angka polos = px, sejalan dengan `width`.
  - `minmax` min tidak boleh `fr`, sesuai aturan CSS.
  - Tanpa token di track: tabel slot hanya diperluas untuk gap.
- **Penempatan.** Penempatan memakai `{start,end,span}` dan tidak menyalin sintaks CSS `a / b`. Ini cukup untuk span kolom/baris dan penempatan eksplisit, dan tiap bentuk punya satu pemetaan.
- **align/justify.** Deklarasi CSS-nya dibuat sama dengan flex supaya satu peta berlaku dan Copy as konsisten. `align-items` di grid mengatur posisi item di dalam sel; `justify-content` mendistribusikan track.
- **Panel.** Panel mengikuti desain `Xxi0M`: Direction 4 segmen; Columns | Rows; Column gap | Row gap; Padding | Align.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `node scripts/gen-skill-api.mjs` -- expected: `api.md` diperbarui.
- `npx -y pnpm@12.21.0 exec vitest run packages/schema packages/core packages/render packages/check packages/viewer tests/doc-corpus.test.ts` -- expected: hijau, kecuali baseline Windows.
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru di luar `%TEMP%\lakar-fail-base.txt`.

**Manual checks (if no CLI):**
- `packages/render/test/golden/grid.png` diperiksa visual: tiga kolom (80 / sempit / lebar), item span 2 di baris 1, item start-end di baris 2.

## Auto Run Result

**Ringkasan.** Skema v4 (`MIGRATIONS[3]` identitas) menambah `layout:'grid'`, track bertipe `px|{fr}|'auto'|{minmax}`, `columnGap`/`rowGap` (slot token panjang), dan penempatan anak `gridColumn`/`gridRow` `{start,end,span}`. Grid dipetakan sekali di `css.ts` dan dipakai render (`layout.ts`) serta Copy as. Panel Design mengaktifkan segmen Grid dengan Columns | Rows, Column gap | Row gap, Padding | Align (desain `Xxi0M`). Dokumen API, `api.md`, skill webapp, korpus v4, dan golden `grid.png` ikut diperbarui.

**File diubah.**
- `packages/schema/src/nodes.ts`, `tokens.ts`, `index.ts`, `README.md` -- skema v4 grid, slot gap sumbu, komentar versi.
- `packages/core/src/migrate.ts` -- langkah 3 → 4.
- `packages/render/src/css.ts`, `index.ts`, `layout.ts` -- `gridTrackCss`/`gridTemplateCss`/`gridLineCss`, mount grid dan `applyGridItem`.
- `packages/viewer/src/copyas.ts` -- CSS/Tailwind grid, gap negatif grid dilewati.
- `packages/viewer/src/designModel.ts`, `DesignPanel.tsx` -- model dan kontrol grid; keluar grid menghapus gap sumbu; helper parse Columns/Rows.
- `packages/viewer/src/canvasEdit.tsx`, `gesture.ts`, `liveGeometry.ts`, `editActions.ts` -- layout `grid` dikenali; drag anak grid tidak memulai reorder.
- `packages/exec/src/api.ts`, `packages/skills/skills/api.md`, `webapp.md` -- dokumentasi grid.
- `tests/fixtures/docs/v4/grid-galeri.lakar.json`, `tests/fixtures/docs/README.md`, `tests/doc-corpus.test.ts` -- korpus v4 dan migrasi v1-v3 → v4.
- Tes: `packages/schema/src/v4.test.ts` (baru), `css.test.ts`, `packages/render/test/layout.test.ts` + `golden/grid.png` (baru), `packages/check/src/index.test.ts`, `copyas.test.ts`, `designModel.test.ts`, `migrate.test.ts`, dan asersi versi 3 → 4 (`index.test.ts`, `v2.test.ts`, `v3.test.ts`, `store.test.ts`, `bench/src/round/round.test.ts` + snapshot baris `schemaVersion`).

**Review.** 31 temuan: 19 baris patch (8 medium, 11 low; dikelompokkan menjadi 13 entri), 0 defer baru, 12 reject (9 low karena jarang dan perbaikannya menambah cabang atau parameter, 3 false; alasan per baris ada di Review Triage Log). Patch: keluar grid menghapus `columnGap`/`rowGap`; drag anak grid tidak memindahkannya keluar grid; gap negatif grid diselaraskan di Copy as dan panel serta didokumentasikan; kalimat regang dan contoh Grid di API diperbaiki; `GRID_TRACKS_MAX` diimpor dari skema; parse Columns/Rows dipindah ke helper teruji; tes render bounds tambahan; perbaikan tes kecil.

**Follow-up review: false.** Pass pertama mem-patch 4 entri medium. Risiko yang belum terverifikasi adalah perilaku UI panel, dan itu sudah ditutup smoke msedge terhadap daemon lokal. Dokumen v4 dibuka, Grid aktif, Justify tersembunyi, Rows 3, Columns 4 → 2 dan Column gap (chip token `space.4`) → 20 tersimpan ke file (`[200,{fr:1}]`, `columnGap:20`), dan canvas live merender `grid-template-columns: 200px 1fr` dengan `column-gap: 20px`. Guard drag adalah early return yang tidak memulai gestur. Jumlah patch per verdict: high 0, medium 4 entri, low 9 entri.

**Verifikasi.**
- `pnpm build` dan `node scripts/gen-skill-api.mjs` sukses.
- Vitest terarah (schema, core, render, check, viewer, korpus, skills) hijau, kecuali baseline Windows (2 layout + 2 teks render, batas token skill core/landing).
- `pnpm test` penuh: 56 kegagalan, semuanya ada di `%TEMP%\lakar-fail-base.txt` (0 baru). `api.md sama persis` kini lulus. Contoh Grid di `skills-examples` lulus terhadap daemon nyata; satu-satunya blok gagal adalah `photo()` (baseline).
- Golden `grid.png` dibuat hanya untuk tes grid dan diperiksa visual. Golden lama tidak berubah. Snapshot bench `report.test.ts.snap` (CRLF saja) dikembalikan.

**Risiko sisa.**
- Golden `grid.png` dibuat di Windows (Chromium Lakar). Isinya hanya rect, tanpa teks, sehingga diharapkan cocok di CI Linux dalam toleransi; konfirmasi menunggu CI.
- Kontrol penempatan anak, reorder drag di grid, dan editor jenis track ditunda (deferred).
