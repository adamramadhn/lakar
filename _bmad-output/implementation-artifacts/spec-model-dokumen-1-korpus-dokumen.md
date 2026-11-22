---
title: 'Korpus dokumen v1/v2 dan tes migrasi korpus (epic model-dokumen story 1)'
type: 'chore'
created: '2026-11-22'
status: 'done'
baseline_revision: '83318e5aa8eb45cddafa28f2859e143023d8e5e4'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Spine `architecture-model-dokumen` AD-3 mewajibkan korpus fixture `tests/fixtures/docs/v<n>/*.lakar.json` untuk setiap versi skema. Setiap fixture wajib bermigrasi, lolos validasi, dan lolos render di CI Linux. Repo belum punya korpus, sehingga migrasi v2â†’v3 (story 2) tidak punya pengaman.

**Approach:** Tambah korpus sintetis v1 dan v2 yang mencakup seluruh permukaan skema saat ini. Tambah satu tes murni (migrasi, validasi, resolve token) dan satu tes render Chromium (render setiap board, lalu `ok: true`), keduanya membaca korpus lewat satu loader bersama. README korpus menjelaskan cara menambah dokumen nyata yang disamarkan.

## Boundaries & Constraints

**Always:**
- Fixture adalah JSON dokumen Lakar apa adanya (`<slug>.lakar.json`). Folder `v<n>` sama dengan `schemaVersion` di file.
- Fixture v1 hanya memakai yang valid di v1, yaitu tanpa fill `conic`, `noise`, dan `mesh`.
- Gabungan korpus mencakup:
  - semua tipe node (`board`, `frame`, `text`, `rect`, `ellipse`, `path`, `icon`);
  - semua jenis fill (`solid`, `linear`, `radial`, `conic`, `noise`, `mesh`, `image`);
  - stroke dengan `sides`, radius 4 sudut, shadow `drop` dan `inner`, serta efek (`opacity`, `blend`, `blur`, `backdropBlur`, `rotation`);
  - token di slot warna, panjang, dan tipografi;
  - dokumen tanpa `tokens`;
  - dua halaman;
  - node `position: 'absolute'`;
  - board `mobile` dengan `scrollY`;
  - layout `row`, `column`, dan `none`, plus `hug`/`fill`.
- Teks memakai family Inter (atau default) dengan weight 400/500/600/700, normal atau italic. Ikon hanya dari glyph fixture render (`lucide`: house, star, check, search, chart-scatter; `simple-icons`: github, whatsapp).
- Fill `image` memakai `assetId` = sha256 dari satu PNG kecil yang ikut dikomit di `tests/fixtures/docs/assets/`. Tes render mendaftarkan byte itu lewat `addAsset`.
- Tes korpus gagal bila sebuah versi `1..SCHEMA_VERSION` tidak punya fixture sama sekali.
- Komentar dan README dalam bahasa Indonesia.

**Never:**
- Mengubah skema, migrasi, render, atau kode produksi lain.
- Mengubah golden render yang ada.
- Menyalin dokumen pengguna nyata tanpa disamarkan.
- Tes render yang membandingkan golden piksel (cukup `ok: true`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fixture v1 valid | `v1/*.lakar.json` | `parseDocument` â†’ `schemaVersion === SCHEMA_VERSION`, lalu `resolveTokens` tanpa error | â€” |
| Fixture v2 valid | `v2/*.lakar.json` | sama dengan baris di atas | â€” |
| Folder â‰  isi | fixture di `v1/` ber-`schemaVersion: 2` | tes loader gagal dan menyebut nama file | pesan menyebut path |
| Fixture rusak | salinan fixture dengan `pages: []` | `parseDocument` melempar `LakarError` kode `SCHEMA_INVALID` (membuktikan tes mendeteksi kerusakan) | â€” |
| Versi tanpa fixture | korpus tanpa folder untuk suatu versi â‰¤ SCHEMA_VERSION | tes cakupan versi gagal | â€” |
| Render korpus | setiap board setiap fixture setelah migrasi + resolve | `renderBoard` â†’ `ok: true` | dilewati (skip) bila Chromium tidak terpasang, mengikuti tes render lain |

</intent-contract>

## Code Map

- `packages/core/src/migrate.ts` -- `migrateDocument`, `parseDocument`, `MIGRATIONS` (1â†’2 identitas). Dipakai tes lewat path relatif `packages/core/src/index.ts`.
- `packages/schema/src/nodes.ts` -- skema v2 lengkap (acuan bentuk fixture: `boardShape`, `frameShape`, `textShape`, `Fill`, `Stroke`, `Shadow`, `effectShape`). `SCHEMA_VERSION = 2`.
- `packages/schema/src/tokens.ts` -- `resolveTokens`, yang memvalidasi ulang tipe nilai token di slot.
- `packages/render/test/harness.ts` -- `start`, `stop`, `render(doc, boardId, fonts, page?, opts)`, `interFaces(weight, style)`, `addAsset(bytes)`, `ICON_GLYPHS`, `browserInstalled`. Pola skip ada di `packages/render/test/visual.test.ts` (impor core relatif `../../core/src/index.js`).
- `packages/render/test/fixtures/icon-glyphs.json` -- daftar ikon yang bisa dirender di harness.
- `tests/support/` -- tempat helper bersama tes (`browser.ts`, `log.ts`). Loader korpus baru diletakkan di sini.
- `vitest.config.ts`, `tsconfig.test.json` -- sudah mencakup `tests/**/*.ts` dan `packages/render/test/**/*.ts`. Tidak perlu diubah.

## Tasks & Acceptance

**Execution:**
- `tests/fixtures/docs/assets/<sha256>.png` -- PNG kecil (misalnya 8Ã—8, beberapa warna) -- sumber `assetId` fill image.
- `tests/fixtures/docs/v1/*.lakar.json` -- minimal 2 fixture v1: (a) landing dua halaman dengan token, frame row/column/none, teks, rect (linear + radial + stroke `sides` + shadow), ellipse busur, path, ikon, node absolute; (b) dokumen tanpa `tokens` dengan board `app` sederhana -- cakupan v1.
- `tests/fixtures/docs/v2/*.lakar.json` -- minimal 2 fixture v2: (a) fill efek `conic`/`noise`/`mesh` (salah satu warna mesh berupa token) + fill `image`; (b) board `mobile` dengan `scrollY`, efek `blend`/`blur`/`backdropBlur`/`rotation`, teks italic, dan token tipografi (`family`, `weight`, `size`, `lineHeight`, `letterSpacing`) -- cakupan v2.
- `tests/fixtures/docs/README.md` -- konvensi nama dan folder, aturan cakupan, cara menambah dokumen nyata (samarkan teks, ganti aset dengan PNG korpus, simpan di folder versinya, jalankan tes), serta catatan bahwa dokumen bench lama di VPS menyusul.
- `tests/support/doc-corpus.ts` -- `loadDocCorpus()`: membaca semua `v<n>/*.lakar.json`, mengembalikan `{ version, name, path, raw }`, dan melempar error yang menyebut path bila `raw.schemaVersion !== version` atau JSON rusak. Juga mengekspor path folder aset.
- `tests/doc-corpus.test.ts` -- tes murni: cakupan versi 1..SCHEMA_VERSION, per fixture `parseDocument` + `resolveTokens`, fixture rusak â†’ `SCHEMA_INVALID`, dan pemeriksaan loader untuk folder â‰  isi (memakai direktori sementara).
- `packages/render/test/corpus.test.ts` -- tes render: `describe.skipIf(!browserInstalled)`, daftarkan PNG aset, lalu untuk setiap board setiap fixture (setelah `parseDocument` + `resolveTokens`) `render(...)` dengan `interFaces` 400/500/600/700 normal + 400 italic, dan cek `result.ok === true` dengan pesan yang menyebut fixture dan board.

**Acceptance Criteria:**
- Given repo dengan korpus baru, when `vitest run tests/doc-corpus.test.ts` dijalankan, then semua fixture v1 dan v2 lulus migrasi, validasi, dan resolve token.
- Given Chromium Lakar terpasang, when `vitest run packages/render/test/corpus.test.ts` dijalankan, then setiap board di korpus dirender `ok: true`.
- Given seseorang menambah fixture tidak valid ke `tests/fixtures/docs/v2/`, when tes korpus dijalankan, then tes gagal dan menyebut nama file itu.

## Spec Change Log

## Review Triage Log

### 2026-11-22 â€” Review pass
- verdicts: 20 findings â€” high 0, medium 3, low 17, false 0, maybe-false 0
- findings:
  - `[low]` `[reject]` (edge) `corpus[0]!` saat korpus kosong â†’ TypeError â€” korpus kosong sudah digagalkan tes cakupan versi dengan pesan jelas; hanya pesan sekunder yang kabur.
  - `[low]` `[reject]` (edge) `find(version===2)!` di tes loader â€” sama: hilangnya v2 sudah digagalkan tes cakupan versi.
  - `[low]` `[reject]` (edge) parse korpus di level modul tes render saat Chromium tidak ada â€” fixture rusak tetap gagal jelas di tes murni; CI Linux memasang Chromium.
  - `[low]` `[reject]` (edge) folder `assets/` hilang â†’ ENOENT mentah â€” folder dikomit bersama korpus, dan pesan Node menyebut path.
  - `[low]` `[reject]` (edge) `assetId` tanpa PNG â€” render mengembalikan `NOT_FOUND` berisi daftar aset, dan pesan tes menyebut fixture dan board.
  - `[low]` `[reject]` (edge) folder `v0/` diabaikan diam-diam â€” versi 0 tidak pernah ada; penjaga tambahan tidak sepadan.
  - `[low]` `[reject]` (edge) akar korpus hilang â†’ ENOENT â€” akar dikomit; pesan Node menyebut path.
  - `[medium]` `[patch]` (verification-gap) fixture v1 bisa memakai fill khusus v2 tanpa ketahuan â€” ditambah tes yang menolak `conic`/`noise`/`mesh` di fixture v1 dengan menyebut file.
  - `[low]` `[patch]` (verification-gap) kelengkapan `boardsOf` hanya dipatok `cases.length > 0` â€” ditambah tes `boardsOf` pada fixture dua halaman.
  - `[low]` `[reject]` (verification-gap, other) direktori bernama `*.lakar.json` â†’ EISDIR â€” kondisi yang tidak realistis, dan pesan Node menyebut path.
  - `[medium]` `[patch]` (blind) kemurnian v1 tidak ditegakkan â€” satu akar dengan temuan verification-gap di atas; tes yang sama.
  - `[medium]` `[patch]` (blind) matriks cakupan tidak dites â€” ditambah tes bahwa setiap `NODE_TYPES` dan setiap tipe fill muncul minimal sekali.
  - `[low]` `[reject]` (blind) tidak ada cek tautan `assetId` ke aset â€” duplikat temuan edge `assetId`; render sudah melapor `NOT_FOUND`.
  - `[low]` `[reject]` (blind) whitelist ikon tidak ditegakkan â€” ikon asing gagal render dengan `ICON_UNKNOWN` yang menyebut ikonnya.
  - `[low]` `[reject]` (blind) `expect` di `beforeAll` â€” kegagalan hash tetap menyebut file aset; memecahnya menambah struktur tanpa manfaat nyata.
  - `[low]` `[reject]` (blind) parse di level modul dan duplikat parse â€” duplikat temuan edge; biaya parse kecil.
  - `[low]` `[reject]` (blind) non-null assertion â†’ TypeError â€” duplikat temuan edge.
  - `[low]` `[reject]` (blind) folder versi salah format diabaikan â€” duplikat temuan edge `v0`.
  - `[low]` `[reject]` (blind) `thrownCode` membuang pesan â€” kegagalan tetap menunjukkan kode yang diterima; memperkaya pesan tidak sepadan.
  - `[low]` `[patch]` (blind) `join(path, '..')` di helper `write` â€” diganti `dirname(path)`.
  - (intent-alignment) laporan kosong, tanpa temuan.

## Verification

**Commands** (Windows: Node 26 tidak ada di PATH default; awali perintah dengan `set "PATH=C:\Users\Fatmuh\AppData\Local\nvm\v26.5.0;%PATH%" &&` dan jalankan pnpm sebagai `npx -y pnpm@12.21.0`):
- `npx -y pnpm@12.21.0 build` -- expected: sukses
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: 0 error
- `npx -y pnpm@12.21.0 exec vitest run tests/doc-corpus.test.ts packages/render/test/corpus.test.ts` -- expected: semua lulus (render tidak di-skip di mesin ini karena Chromium Lakar terpasang)

## Auto Run Result

- **Ringkasan:** korpus sintetis v1 (2 fixture) dan v2 (2 fixture) + aset PNG ber-sha256, loader bersama `tests/support/doc-corpus.ts`, tes murni (migrasi, validasi, resolve token, cakupan versi/tipe node/tipe fill, kemurnian v1, loader) dan tes render Chromium per board.
- **File:** `tests/fixtures/docs/{README.md,assets/*.png,v1/*.lakar.json,v2/*.lakar.json}` (korpus); `tests/support/doc-corpus.ts` (loader); `tests/doc-corpus.test.ts` (tes murni); `packages/render/test/corpus.test.ts` (tes render).
- **Review:** 20 temuan; 4 entri di-patch (medium 2: kemurnian v1, cakupan tipe node/fill; low 2: `boardsOf`, `dirname`); 0 ditunda; 16 low ditolak dengan alasan di Triage Log.
- **Follow-up review:** `true` (2 entri medium di-patch). Risiko yang belum diverifikasi: tes cakupan tipe node/fill belum dibuktikan gagal saat satu tipe dihapus. Tes kemurnian v1 sudah dibuktikan gagal saat fill `conic` disisipkan sementara ke fixture v1.
- **Verifikasi:** `pnpm build` OK; `tsc -p tsconfig.test.json` 0 error; `vitest run tests/doc-corpus.test.ts packages/render/test/corpus.test.ts` 22/22 lulus (render tidak di-skip).
- **Risiko sisa:** korpus masih sintetis; dokumen nyata v1/v2 (termasuk dokumen bench lama di VPS) belum masuk. Fixture v1 diperiksa terhadap aturan v1 lewat tes kemurnian fill, bukan validator v1 penuh.
