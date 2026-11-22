---
title: 'API baca token, renameToken, dan impor CSS variables untuk agen (epic token-tema story 2)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: 'bc8e032133f86bd44d7bf6b435ecbfcf340aaa9c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Dua token yang berbeda nama tetapi sama variabel CSS (mis. `a.b` dan `a-b`) bisa ada berdampingan dan bertabrakan saat ekspor/impor.
    evidence: |-
      `cssVarName` tidak injektif; `setTokens` sudah bisa membuat pasangan seperti itu sebelum story ini, dan `renameToken` juga tidak menolaknya. Impor memilih token pertama. Usul: tolak saat commit (CONFLICT) atau di codegen (epic kode).
    location: >-
      packages/core/src/transaction.ts (setTokens, renameToken); packages/render/src/css-vars.ts (tokenNameFor)
    severity: low
---

<intent-contract>

## Intent

**Problem:** Agen tidak bisa membaca `tokens`/`tokenModes` dokumen (deferred spec-model-dokumen-2), tidak bisa mengganti nama token tanpa memutus semua ref `{$token}`, dan tidak bisa membuat token bertipe dari file CSS variables di codebase pengguna. Skill `selection` juga belum bisa membandingkan literal dengan nilai token (deferred spec-agen-4).

**Approach:**
- `execute` mendapat `getTokens()` (baca kepala dokumen) dan `renameToken(from, to)`.
- `renameToken` adalah op core baru (`Transaction` + `DocOp` + route ops viewer, AD-2/AD-7) dengan op invers (AD-8).
- Parser murni CSS variables di `@lakar/render` (`css-vars.ts`, di sebelah `cssVarName`, AD-5/AD-11) menghasilkan token bertipe + rencana `tokenModes`. `execute` mengeksposnya sebagai `importCssVariables(css)` yang commit lewat `setTokenModes` + `setTokens`. Exec tidak bergantung pada render (AD-17): parser disuntikkan daemon lewat port `CssVariablesPort` (`@lakar/ports`), seperti katalog ikon.
- `api.md` dibuat ulang; skill `selection` membandingkan literal dengan nilai token mode board.

## Boundaries & Constraints

**Always:**
- **`getTokens()`** (read) → `{tokens, modes}`: salinan `doc.tokens` (bentuk tersimpan `{type, value, modes?}`, `{}` bila tidak ada) dan `doc.tokenModes ?? []`. Melihat op sebelumnya di snippet yang sama. Tanpa argumen.
- **`renameToken(from, to)`** (core `Transaction`, `execute`, `DocOp {op:'renameToken', from, to}`):
  - Nama tidak valid (`TokenName`) → `SCHEMA_INVALID`; `from` tidak ada → `TOKEN_UNKNOWN` (+ saran); `to` sudah ada → `CONFLICT`; `from === to` → tanpa efek dan tanpa invers.
  - Memindah definisi (posisi kunci di `tokens` tetap) dan mengganti setiap ref `{$token: from}` di semua halaman dalam satu commit. Invers = `{op:'renameToken', from: to, to: from}`.
  - Token baru datar di transaksi yang sama (`pendingFlat`) ikut pindah nama.
- **Parser `parseCssVariables(css, opts?)`** di `packages/render/src/css-vars.ts` (murni, aturan render: hanya `import type` dari luar, impor relatif `./css.js`). `opts = { tokens?: Record<name, {type}>, modes?: string[] }` (keadaan dokumen). Hasil `CssVariablesImport` (tipe di `@lakar/ports`):
  - `entries: [{variable, token, type, value, modes?, status:'new'|'update'}]` urut kemunculan; `tokenModes: string[] | null` (null = tidak berubah); `skipped: [{source, reason, detail}]`, `reason` ∈ `invalid-name | invalid-mode | unsupported-selector | unsupported-value | mixed-values`, `detail` kalimat Inggris pendek (siap UI).
  - **Selektor:** `:root`, `html`, `:host` = blok root; `[data-theme=X]` (kutip ganda/tunggal/tanpa kutip, boleh diawali `:root`/`html`) = mode `X`. Daftar koma diproses per selektor. At-rule (`@media`, …) dan selektor lain → `unsupported-selector` (satu entri per selektor/at-rule). Mode tidak cocok `^[a-z0-9][a-z0-9-]{0,31}$` → `invalid-mode`. Komentar dibuang; deklarasi non-custom diabaikan; `!important` dibuang; deklarasi berulang: yang terakhir menang.
  - **Nama:** variabel `--x` dengan `x` di luar `[a-z0-9-]` → `invalid-name`. Token = nama token dokumen yang `cssVarName`-nya sama dengan variabel (status `update`); bila tidak ada: semua `-` menjadi `.` bila sah `TokenName` (≤ 64), selain itu `x` apa adanya bila sah, selain itu `invalid-name`. Invarian: `cssVarName(token) === variable` untuk setiap entri.
  - **Tipe** (per variabel, dari semua nilainya): tipe token dokumen yang sudah ada bila semua nilai sah untuk tipe itu; selain itu `color` bila nilai warna; selain itu petunjuk nama (segmen `-`): `font-weight|weight|fw` → fontWeight, `line-height|leading|lh` → lineHeight, `letter-spacing|tracking` → letterSpacing, `font-size|text|fs` → fontSize, `radius|rounded` → radius, `breakpoint|bp|screen|screens` → breakpoint, `container` → container, `font|family|typeface` (+ nilai daftar family) → fontFamily, `spacing|space|gap|padding|margin|inset|size` → spacing; tanpa petunjuk: panjang ber-unit → spacing, daftar family berkutip/berkoma → fontFamily; lainnya → `unsupported-value`. Nilai yang gagal dikonversi ke tipe terpilih → `unsupported-value` (satu nilai) atau `mixed-values` (nilai mode berbeda jenis).
  - **Konversi nilai:** warna hex 3/4/6/8 digit, `rgb[a]()`, `hsl[a]()`, `transparent`, `white`, `black` → `#RRGGBB`/`#RRGGBBAA` huruf besar (alpha `FF` dibuang); panjang `px` apa adanya, `rem`/`em` ×16 (letterSpacing: `em` apa adanya, `0` → 0, unit lain ditolak); lineHeight tanpa unit ditolak (butuh ukuran font); fontWeight integer 100–900 kelipatan 100 atau `normal`/`bold`; fontFamily = family pertama tanpa kutip; `var(--y)` tanpa fallback diganti nilai `--y` di mode yang sama lalu root (maks 10 tingkat; alias di root ikut nilai `--y` tiap mode), selain itu `unsupported-value`. Batas nilai per tipe sama dengan skema v3 (panjang ≥ 0, lineHeight > 0).
  - **Mode:** `found` = mode dari selektor `[data-theme]` urut kemunculan; `rootMode` = mode pertama yang satu aturan dengan selektor root. Mode default impor = `rootMode` ?? (ada blok root: `light` bila `light` ada di `found`) ?? (tanpa blok root: `found[0]`). `value` = nilai root, atau bila tidak ada: `value` token dokumen bertipe sama, lalu nilai mode default, lalu mode pertama yang punya nilai. `modes[m]` hanya bila beda dari `value`.
  - **Gabung token yang ada** (keputusan review, delegasi "terima jadi"): untuk token dokumen bertipe sama, `modes` lama dipertahankan untuk mode yang tidak ada di `found`; mode di `found` memakai nilai CSS variabel itu, atau dihapus bila variabel hanya punya nilai root (root berlaku di mode itu). Tipe berbeda → definisi diganti.
    - Dokumen punya `tokenModes`: `tokenModes` = yang lama + mode baru (dan `rootMode`) di belakang; `null` bila tidak ada yang baru.
    - Tanpa `tokenModes` dan `found` tidak kosong: default = mode default impor ?? `'light'`; `tokenModes = [default, ...found tanpa default]`.
    - `found` kosong → `null`.
- **`importCssVariables(css)`** (op `execute`): `css` string tak kosong ≤ 256 KB (selain itu `SCHEMA_INVALID`); `entries` kosong → `SCHEMA_INVALID` dengan alasan skip (maks 5). Commit `setTokenModes(tokenModes)` bila tidak null, lalu satu `setTokens` berisi definisi bertipe (token lama bernama sama diperbarui sesuai aturan gabung; ref-nya tetap). Mengembalikan `{tokens:[{variable, token, type, status}], modes, skipped}`. Port tidak tersedia → `EXEC_ERROR`.
- **AD-4:** tool, route, dan input lama tetap; `setTokens` datar tetap diterima; respons hanya bertambah. `api.md` dibuat ulang dengan `node scripts/gen-skill-api.mjs`; `EXECUTE_DESCRIPTION` MCP menyebut tiga fungsi baru.
- **Skill `selection`:** `literal` juga melaporkan literal yang nilainya sama dengan nilai token dokumen (mode efektif board: `themeMode` ?? mode pertama) bertipe utama slot (warna → `color`, radius → `radius`, gap/columnGap/rowGap → `spacing`). Batas ukuran skill tetap (prosa ≤ 1200, total ≤ 2600).

**Never:**
- Menaikkan `schemaVersion` atau mengubah skema dokumen.
- UI viewer (panel Theme, dialog impor = story 3 / epic kode).
- Ganti nama mode, impor `@media (prefers-color-scheme)`, atau token bayangan/gradien.
- Exec bergantung langsung pada `@lakar/render`, atau salinan kedua fungsi nama variabel.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Baca token | `setTokenModes(['light','dark'])`, token `colors.bg` bermode | `getTokens()` → `{tokens:{'colors.bg':{type:'color', value, modes}}, modes:['light','dark']}` | — |
| Dokumen tanpa token | dokumen baru | `{tokens:{}, modes:[]}` | — |
| Rename | token `colors.a` dipakai 2 node + 1 stop gradien | token `colors.b` di posisi sama, 3 ref `{$token:'colors.b'}`, satu rev; invers mengembalikan dokumen | — |
| Rename tak dikenal | `renameToken('colors.x','colors.y')` | gagal, rollback | `TOKEN_UNKNOWN` + saran |
| Rename bentrok | `to` sudah ada | gagal | `CONFLICT` |
| Rename nama salah | `to = 'Bad Name'` | gagal | `SCHEMA_INVALID` |
| Route ops | `POST /viewer/docs/:slug/ops` `[{op:'renameToken', from, to}]` | satu commit, `inverse:[{op:'renameToken', from:to, to:from}]` | kunci asing → `SCHEMA_INVALID` |
| Impor dasar | `:root{--colors-bg:#fff;--radius-md:12px;--space-4:16px;--font-sans:"Inter", sans-serif} [data-theme="dark"]{--colors-bg:#0f0f0f}` di dokumen tanpa mode | `colors.bg` color `#FFFFFF` modes `{dark:'#0F0F0F'}`, `radius.md` radius 12, `space.4` spacing 16, `font.sans` fontFamily `Inter`; `tokenModes ['light','dark']` | — |
| Skip | `--shadow-card: 0 8px 24px #0003`, `--Brand: #fff`, `.dark{…}` | `skipped` `unsupported-value`, `invalid-name`, `unsupported-selector`; token lain tetap diimpor | — |
| Update | dokumen punya token color `colors.text-primary` dipakai node | `--colors-text-primary` → token `colors.text-primary`, status `update`, ref tetap | — |
| Mode tanpa root | `[data-theme=light]{--c:#fff}[data-theme=dark]{--c:#000}` | `value '#FFFFFF'`, `modes {dark:'#000000'}`, `tokenModes ['light','dark']` | — |
| Satuan | `--text-lg: 1.25rem`, `--leading-tight: 1.25`, `--tracking-wide: 0.05em`, `--font-weight-bold: 700` | fontSize 20; lineHeight skip; letterSpacing 0.05; fontWeight 700 | — |
| Alias | `--a:#111; --b: var(--a)` | `b` = `#111111` | var tak dikenal → `unsupported-value` |
| Tidak ada yang bisa diimpor | `css = 'body{color:red}'` | gagal | `SCHEMA_INVALID` |
| Round trip | setiap entri | `cssVarName(token) === variable` | — |
| setTokens lama | `setTokens({'spacing.2': 8})` | tetap sukses | — |

</intent-contract>

## Code Map

- `packages/schema/src/ops.ts` -- `DocOp` (tambah `renameToken`).
- `packages/core/src/transaction.ts` -- `OpKind`, interface `Transaction`, op `setTokens`/`setTokenModes` (pola invers), `pendingFlat`, `sameValue`.
- `packages/core/src/ops.ts` -- `OP_KEYS` + `switch` `applyOps` (route ops viewer).
- `packages/schema/src/tokens.ts` -- `suggestTokens` (saran TOKEN_UNKNOWN), `findTokenRefs`.
- `packages/ports/src/index.ts` -- port baru `CssVariablesPort` + tipe `CssVariablesImport`.
- `packages/render/src/css.ts` -- `cssVarName` (fungsi nama tunggal AD-11); `packages/render/src/index.ts` -- ekspor.
- `packages/exec/src/api.ts` -- `LakarApi`, `ApiContext` (port baru opsional), tabel `API`, referensi `Token`; `packages/exec/src/index.ts` -- `RunOptions` + `apiCtx`.
- `packages/daemon/src/server.ts` (sekitar baris 440) -- `runSnippet(... icons, photos)`: tambah port parser dari `@lakar/render`.
- `packages/mcp/src/server.ts` (sekitar baris 188) -- `EXECUTE_DESCRIPTION`; `tests/execute-description.test.ts` mewajibkan setiap fungsi API disebut.
- `packages/skills/skills/selection.md` -- blok cek konsistensi; `packages/mcp/src/selection-flow.test.ts` menjalankan contohnya.
- `scripts/gen-skill-api.mjs`, `packages/skills/skills/api.md`, `tests/skills.test.ts` -- api.md = `renderApiMarkdown()`.
- `tests/dependency-direction.ts` -- `EDGES` (exec tidak ke render; tes di `packages/*/src` ikut dipindai).

## Tasks & Acceptance

**Execution:**
- `packages/schema/src/ops.ts` -- tambah varian `renameToken`.
- `packages/core/src/transaction.ts` -- op `renameToken` + invers; `packages/core/src/ops.ts` -- `OP_KEYS`/`switch`.
- `packages/core/src/transaction.test.ts`, `packages/core/src/ops.test.ts` -- baris matriks rename (termasuk invers diterapkan ulang = dokumen awal, pending flat, ref di stops/padding tuple).
- `packages/ports/src/index.ts` -- `CssVariablesImport`, `CssVariableEntry`, `CssVariableSkip`, `CssVariablesPort`.
- `packages/render/src/css-vars.ts` (baru) + `index.ts` -- parser; `packages/render/src/css-vars.test.ts` -- semua baris matriks parser + properti round trip.
- `packages/exec/src/api.ts`, `index.ts` -- `getTokens`, `renameToken`, `importCssVariables`, port opsional, referensi Token; `packages/exec/src/index.test.ts` -- daftar API, port palsu, error.
- `packages/daemon/src/server.ts` -- suntik `parseCssVariables`; `packages/daemon/src/ops.test.ts` -- route ops renameToken; tes daemon execute `importCssVariables` + `getTokens` (contoh CSS).
- `tests/css-variables-import.test.ts` (baru) -- parser asli lewat `runSnippet` + core: tipe, nama, mode; `TokenName` menerima setiap nama hasil; `cssVarName(token) === variable`; resolve sukses.
- `packages/mcp/src/server.ts` -- `EXECUTE_DESCRIPTION`; `packages/skills/skills/api.md` -- dibuat ulang.
- `packages/skills/skills/selection.md` -- `literal` vs nilai token; `packages/mcp/src/selection-flow.test.ts` -- literal tanpa sejawat bertoken terdeteksi.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- tandai dua entri (API baca token; `literal` vs nilai token) selesai dengan catatan.

**Acceptance Criteria:**
- Given daemon dengan dokumen ber-token dan mode, when agen menjalankan `getTokens()` lewat `execute`, then `data.value` memuat token bertipe dan daftar mode, rev tetap.
- Given token dipakai beberapa node, when `renameToken` dijalankan lewat `execute` atau route ops, then semua ref berganti dalam satu rev, dan mengirim `inverse` route ops mengembalikan nama dan ref lama.
- Given contoh file CSS variables (matriks "Impor dasar"), when diimpor lewat MCP/daemon `execute` `importCssVariables`, then token terbentuk dengan tipe, nama, dan nilai mode yang diharapkan, `cssVarName` tiap nama sama dengan variabel sumber, dan board ber-`themeMode:'dark'` me-resolve nilai dark.
- Given snippet lama `setTokens({'colors.primary':'#0F62FE','spacing.4':16})`, when dijalankan, then tetap sukses.
- Given semua contoh `api.md` dan `selection.md`, when tes skill/contoh dijalankan, then lulus.

## Spec Change Log

### 2026-11-22 — Review t2 (keputusan intent_gap, delegasi "terima jadi")
- Pemicu: blind (impor ulang menghapus mode yang tidak disebut CSS; nama mode `default` buatan) dan edge (file khusus dark menimpa `value`; bentrok `default`).
- Diubah (di dalam `<intent-contract>`, keputusan delegasi): aturan Mode (mode default impor `light` bila ada blok light; `value` lama dipakai tanpa nilai root), aturan baru "Gabung token yang ada", rencana `tokenModes` tanpa `'default'`, kalimat `importCssVariables` (diperbarui, bukan diganti), dan tipe utama slot di skill `selection`.
- Keadaan buruk yang dihindari: impor ulang diam-diam menghapus nilai `dark`; file `dark.css` membuat board light memakai warna gelap; mode `default` yang tidak pernah ditulis pengguna.
- KEEP: parser murni di render + port; round trip `cssVarName`; skip bukan gagal; `getTokens`/`renameToken` apa adanya.

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 40 findings — high 0, medium 2, low 32, false 6, maybe-false 0
- findings:
  - `[medium]` `[intent_gap]` (blind) impor ulang menghapus nilai mode yang tidak disebut CSS — diputuskan: gabung untuk token bertipe sama (Design Notes); parser memakai `modes`/`value` token dokumen; tes css-vars dan tests/css-variables-import diperbarui.
  - `[low]` `[reject]` (blind) impor tidak atomik bila setTokens gagal dan snippet menangkap error — parser hanya mengeluarkan nilai yang sah per tipe, jadi setTokens hampir tidak bisa gagal seketika; kegagalan commit tetap rollback penuh; perbaikannya menambah cabang pemulihan.
  - `[low]` `[reject]` (blind) ganti tipe token yang sudah dipakai menggagalkan seluruh impor — jarang (nama sama, jenis nilai beda); gagal keras SCHEMA_INVALID menyebut path dan token, agen bisa memperbaiki; perbaikannya menambah cabang.
  - `[low]` `[intent_gap]` (blind) `:root` + `[data-theme=light]` menghasilkan mode `default` — diputuskan: root dipetakan ke `light`; `planModes` tanpa `'default'`; tes diperbarui.
  - `[low]` `[reject]` (blind) siklus alias dilaporkan "unknown variable" — jarang; variabel tetap dilewati dan dilaporkan; teks berbeda butuh sentinel baru.
  - `[low]` `[reject]` (blind) `var(--x, fallback)` tidak didukung — dilaporkan sebagai unsupported-value; jarang di file token; dukungan fallback adalah fitur baru.
  - `[low]` `[patch]` (blind) alpha yang dibulatkan ke FF menghasilkan `#RRGGBBFF` — `toHex` membuang alpha `FF`; tes `rgba(0,0,0,0.999)`.
  - `[low]` `[reject]` (blind) `em` diperlakukan ×16 — aturan eksplisit spec (Konversi nilai), terdokumentasi di api.md.
  - `[low]` `[reject]` (blind) selektor `.dark`/`:root.dark` tidak didukung — intent menetapkan `:root` + `[data-theme=…]`; selektor lain dilaporkan `unsupported-selector`.
  - `[low]` `[reject]` (blind) `TOKEN_NAME_MAX` tidak dijaga tes — batas skema jarang berubah; nama terlalu panjang gagal keras di setTokens.
  - `[low]` `[reject]` (blind) nama ambigu bila dokumen punya dua token sama variabel — kasus langka; akar sama dengan defer edge (cssVarName tidak injektif).
  - `[low]` `[patch]` (blind) `valTok` menyarankan token container/breakpoint untuk gap — dicocokkan dengan tipe utama slot (radius → radius, gap → spacing, warna → color).
  - `[low]` `[reject]` (blind) tidak ada tes daemon untuk error renameToken di route — kode error dan prefiks `ops[i]` dites di core ops.test; pemetaan status HTTP route sudah dites umum.
  - `[false]` `[reject]` (blind) `renameRefs` mengganti objek `{$token}` di mana saja — di `pages` setiap objek dengan satu kunci `$token` adalah TokenRef menurut skema strict; token tidak bisa merujuk token.
  - `[low]` `[patch]` (blind) `getTokens(undefined, 1)` diterima — cek kini `args.some(a => a !== undefined)`.
  - `[low]` `[reject]` (blind) `CssVariableEntry.type` bertipe string — ports tidak boleh bergantung pada schema; nilai divalidasi setTokens core.
  - `[low]` `[reject]` (blind) satuan batas ukuran (KB vs karakter) — perbaikannya mengedit spec.
  - `[false]` `[reject]` (blind) spec belum lengkap / Code Map salah path — log diisi di fase ini; `tests/dependency-direction.ts` memang file EDGES.
  - `[low]` `[reject]` (blind) path lokal di Verification — diwajibkan runner Windows; perbaikannya mengedit spec.
  - `[false]` `[reject]` (blind) deferred ditandai resolved terlalu dini — kedua celah tertutup dan terverifikasi (getTokens, literal vs nilai token, dites lewat MCP).
  - `[low]` `[reject]` (edge) impor tidak atomik bila error ditangkap — sama dengan baris blind kedua.
  - `[low]` `[reject]` (edge) ganti tipe token terpakai menggagalkan impor — sama dengan baris blind ketiga.
  - `[low]` `[reject]` (edge) renameToken(from, from) membuat rev tanpa perubahan — konsisten dengan setTokens bernilai sama; viewer tidak mengirim rename tanpa perubahan; perbaikannya menambah cabang di penghitung op.
  - `[low]` `[defer]` (edge) rename ke nama yang variabel CSS-nya sama dengan token lain — pasangan seperti itu sudah bisa dibuat setTokens sebelum story ini; dicatat di deferred.
  - `[low]` `[reject]` (edge) token ambigu di impor — sama dengan baris blind ke-11.
  - `[low]` `[reject]` (edge) variabel hanya di blok dark padahal ada `:root` → nilai dark jadi `value` — CSS sumber tidak punya nilai light, jadi tidak ada nilai benar; untuk token yang sudah ada `value` lama kini dipertahankan.
  - `[medium]` `[intent_gap]` (edge) file khusus mode tanpa root ke dokumen bermode menimpa `value` — grup dengan baris blind pertama; `value` lama dipakai bila CSS tidak punya nilai root.
  - `[low]` `[intent_gap]` (edge) bentrok mode `default` — grup dengan baris blind keempat; `'default'` tidak lagi dibuat.
  - `[low]` `[patch]` (edge) alpha dibulatkan ke FF — sama dengan baris blind ketujuh.
  - `[low]` `[patch]` (edge) `rgb(1 2 3 4)` tanpa `/` diterima — sintaks spasi kini mewajibkan `/` untuk alpha; tes.
  - `[low]` `[reject]` (edge) siklus alias salah pesan — sama dengan baris blind kelima.
  - `[low]` `[patch]` (edge) `}`/`;` liar di tingkat atas menelan aturan berikutnya — prelude direset; tes CSS tidak rapi.
  - `[low]` `[patch]` (edge) kerja kuadratik pada stylesheet besar — `order` jadi Set, peta variabel → token dihitung sekali.
  - `[low]` `[patch]` (edge) argumen ekstra getTokens — sama dengan baris blind ke-15.
  - `[low]` `[patch]` (edge) `valTok` memilih token pertama bertipe semantik salah — sama dengan baris blind ke-12.
  - `[low]` `[patch]` (vgap) cabang mode efektif dan warna `valTok` tidak dites — tes MCP baru di selection-flow: board `themeMode:'dark'`, literal `#0F0F0F` cocok `colors.bg` dark, `#FFFFFF` tidak, radius 12 → `radius.md`.
  - `[low]` `[patch]` (intent) impor/getTokens tidak dites lewat MCP execute — tes yang sama memanggil `importCssVariables` dan `getTokens` lewat tool MCP `execute`.
  - `[false]` `[reject]` (intent) nama impor `colors.text.primary` menyimpang dari contoh AD-11 — AD-11 mewajibkan fungsi nama tunggal (round trip dites); pemetaan titik mengikuti desain dialog impor (C6), token yang ada dipakai ulang.
  - `[false]` `[reject]` (intent) setTokens datar tidak diasersi eksplisit — contoh API `setTokens({'colors.primary': '#0F62FE', 'spacing.4': 16})` dijalankan tes exec dan skills-examples, plus tes transaksi setTokens datar.
  - `[false]` `[reject]` (intent) perubahan selection.md di luar intent — prompt orkestrator meminta menutup deferred spec-agen-4 (literal vs nilai token).

## Design Notes

- **Parser di render + port, bukan di exec/schema.** AD-5 menaruh tabel kebalikan importer di sebelah pemetaan CSS (`css.ts`), dan AD-11 mewajibkan impor memakai fungsi nama variabel yang sama (`cssVarName`). Render tidak boleh mengimpor nilai dari schema, dan exec tidak bergantung pada render (AD-17), jadi daemon (yang boleh ke render) menyuntikkan parser lewat `CssVariablesPort`, sama dengan katalog ikon dan foto. Viewer (epic kode) memakai parser yang sama langsung dari `@lakar/render`. Karena render tidak boleh mengimpor zod, parser memeriksa batas nilai sendiri; validasi akhir tetap `setTokens` core.
- **Nama hasil impor mengikuti desain.** Dialog impor di `lakar-ui.pen` (bagian 07/09, `wvCMu`) memetakan `--colors-brand-primary` → `colors.brand.primary` dan `--space-4` → `space.4`: semua `-` menjadi `.`. Token dokumen yang sudah ada dengan variabel sama dipakai lebih dulu (status *Update* di desain), sehingga `colors.text-primary` tetap. Kedua cara memenuhi `cssVarName(token) === variable`.
- **Root tanpa nama mode.** Desain memetakan `:root` ke kolom mode default (Light) dan `[data-theme="dark"]` ke Dark. Nilai root disimpan sebagai `value` (dipakai mode default), sehingga mode default dokumen baru harus mendahului mode impor; namanya `light`. Bila CSS juga punya blok `[data-theme=light]` terpisah, root dipetakan ke mode `light` dan nilai light yang berbeda masuk `modes.light` (tidak ada mode buatan `default`).
- **Skip, bukan gagal.** Desain menampilkan baris *Skipped* (`--shadow-card`), jadi variabel yang tak terpetakan dilaporkan dan sisanya tetap diimpor; impor gagal hanya bila tidak ada satu pun token. `detail` berbahasa Inggris karena ditampilkan di UI dialog; `reason` adalah kode stabil.
- **Impor ulang menggabung, bukan mengganti** (review t2). Desain: "Existing tokens with the same name are updated; their layers keep the reference" dan "Empty mode cells use the default mode value". Mengganti definisi utuh menghapus nilai mode lain diam-diam (board `dark` jatuh ke nilai default), jadi nilai yang disebut CSS menimpa dan sisanya dipertahankan; file khusus satu mode (tanpa `:root`) tidak mengubah `value`.
- **Kode error rename.** Token tidak ada → `TOKEN_UNKNOWN` (katalog: "token belum di-setTokens"); nama tujuan terpakai → `CONFLICT` (sama dengan `insert` ID terpakai).
- **`literal` nilai token juga untuk panjang.** Skill `selection` mencocokkan radius/gap literal dengan token grup panjang bermode efektif board (mis. gap 24 = `spacing.card` di fixture). Ini sengaja: deferred meminta pembandingan dengan nilai token dokumen, dan usulannya tetap baca saja.
- **Event live.** Rename tidak mengubah hasil resolve, jadi `touchedBoards` bisa kosong; viewer tetap menerima `change` dan memuat ulang dokumen (panel Theme story 3).

## Verification

**Commands** (Windows: awali dengan `set "PATH=C:\Users\Fatmuh\AppData\Local\nvm\v26.5.0;%PATH%" &&`; pnpm = `npx -y pnpm@12.21.0`):
- `npx -y pnpm@12.21.0 build && node scripts/gen-skill-api.mjs` -- expected: sukses, `api.md` ditulis
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: 0 error
- `npx -y pnpm@12.21.0 exec vitest run packages/schema packages/core packages/exec packages/render/src packages/ports tests/css-variables-import.test.ts tests/skills.test.ts tests/execute-description.test.ts tests/dependency-direction.test.ts packages/mcp` -- expected: semua lulus kecuali baseline Windows
- `npx -y pnpm@12.21.0 exec vitest run packages/daemon` -- expected: tidak ada kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`

## Auto Run Result

- **Ringkasan:**
  - `execute` mendapat `getTokens()` (token tersimpan + `tokenModes`), `renameToken(from, to)`, dan `importCssVariables(css)`.
  - `renameToken` adalah op core baru (`Transaction`, `DocOp`, route ops viewer) dengan invers rename balik.
  - Parser murni CSS variables di `@lakar/render` (`css-vars.ts`, memakai `cssVarName`), disuntikkan daemon ke exec lewat `CssVariablesPort`.
  - Skill `selection` membandingkan literal dengan nilai token mode efektif board.
- **File:**
  - `packages/schema/src/ops.ts` -- varian `DocOp` `renameToken`.
  - `packages/core/src/{transaction,ops}.ts` (+ tes) -- op `renameToken`, `OP_KEYS`.
  - `packages/ports/src/index.ts` -- `CssVariablesPort` dan tipe hasil impor.
  - `packages/render/src/{css-vars,index}.ts`, `css-vars.test.ts` -- parser + ekspor + tes matriks.
  - `packages/exec/src/{api,index}.ts` (+ tes) -- tiga fungsi API, port opsional, referensi Token.
  - `packages/daemon/src/server.ts`, `ops.test.ts` -- suntik parser; tes execute impor/baca + route ops rename/undo.
  - `packages/mcp/src/server.ts`, `selection-flow.test.ts` -- deskripsi execute; tes MCP execute impor/getTokens + literal mode dark.
  - `packages/skills/skills/{api,selection}.md` -- api.md dibuat ulang; `literal` vs nilai token.
  - `tests/css-variables-import.test.ts` -- parser asli lewat `runSnippet` + core, round trip nama, kesamaan pola schema.
  - `_bmad-output/implementation-artifacts/deferred-work.md` -- dua entri ditandai resolved, satu entri baru (cssVarName tidak injektif).
- **Review (t2):** 40 temuan.
  - 2 `intent_gap` (4 baris) diputuskan dengan delegasi dan diimplementasikan: impor menggabung token bertipe sama (mode yang tidak disebut CSS dan `value` lama tanpa root tetap); `:root` + blok light → mode `light`, tanpa mode `default`.
  - Patch (low): alpha `FF` dibuang, `rgb(a b c d)` tanpa `/` ditolak, `}`/`;` liar tidak menelan aturan, kerja linear (Set/Map), `getTokens` menolak argumen apa pun, `valTok` memakai tipe utama slot, tes MCP execute (impor, getTokens, literal mode dark/warna).
  - 1 defer (low, sudah ada sebelumnya): token berbeda nama dengan variabel CSS sama.
  - Ditolak: 6 false dan sisanya low dengan alasan di Triage Log (atomisitas saat error ditangkap, ganti tipe token terpakai, pesan siklus alias, `var()` fallback, `em` ×16, selektor `.dark`, `TOKEN_NAME_MAX`, nama ambigu, tes error route, tipe port string, satuan batas, path lokal, rename tanpa perubahan, variabel hanya di blok dark).
- **Follow-up review:** `false`. Entri patch/keputusan per verdict: medium 1 (gabung impor, kini dites di render dan tests/css-variables-import), low 9. Tidak ada high; tidak ada perilaku UI.
- **Verifikasi:**
  - `pnpm build` + `gen-skill-api` OK; `tsc -p tsconfig.test.json` 0 error.
  - vitest render/src, exec, core, schema, ports, mcp, tests/css-variables-import, execute-description, dependency-direction, skills, daemon ops + skills-examples: 604/607. Tiga yang gagal adalah baseline Windows: ukuran `core.md`/`landing.md` (CRLF) dan blok `photo()` api.md.
  - `vitest run packages/daemon`: tidak ada kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`.
  - Suite penuh (Fase A): di luar baseline hanya hash protokol bench (CRLF checkout), A1–A5 bench (pemisah path Windows), dan golden teks wrap (rendering font Windows). Tidak ada file bench yang disentuh.
- **Risiko sisa:**
  - CI Linux belum dijalankan.
  - `literal` di skill `selection` kini juga melaporkan jarak yang sama dengan token spacing, jadi bisa lebih ramai.
  - Selektor `.dark` dan `var()` dengan fallback dilewati dengan laporan (belum didukung).
