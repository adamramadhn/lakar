---
title: 'Impor dan ekspor token W3C DTCG'
type: feature
ticket: '9'
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
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Token Lakar (bertipe, dengan mode tema) belum bisa keluar/masuk sebagai JSON W3C DTCG, padahal agen dan pengguna perlu membawa token dari/ke toolchain luar (butir Adopsi riset open-pencil [52]).

**Approach:** Modul murni `dtcg.ts` di `@lakar/codegen` mengekspor `tokens`/`tokenModes` dokumen ke JSON DTCG dan meng-parse JSON DTCG menjadi definisi token Lakar (tipe tak didukung dilaporkan, tidak dibuang diam-diam). Panel Theme mendapat aksi Import/Export sesuai desain Section 11; agen mendapat `export_code {target:'dtcg'}` (nilai enum baru, kompatibel mundur) dan `importDtcgTokens(json)` di execute (port disuntikkan daemon, sama dengan `importCssVariables`).

## Boundaries & Constraints

**Always:**
- Hanya penambahan: nilai enum `target:'dtcg'` baru, fungsi execute baru, route/ops lama tidak berubah (C5/AD-4). Input lama `export_code` menghasilkan keluaran identik.
- Impor/ekspor memakai satu modul murni yang sama di codegen (tanpa IO); impor meng-commit lewat `setTokenModes` + `setTokens` satu commit (bisa di-undo, AD-7/AD-8).
- Deterministik: dokumen sama → byte JSON sama (indent 2, urutan token = urutan tersimpan, newline akhir).
- Round-trip lossless untuk semua `TokenType`: ekspor menulis `$extensions["com.lakar"].type` bila tipe DTCG tidak 1:1; impor menghormatinya.

**Never:**
- Tidak mengubah nama/input/output tool lama, route lama, perilaku `importCssVariables`, `tokens.css`, atau `setTokens` datar.
- Tidak ada fetch jaringan; viewer tidak bergantung pada core/exec/icons (AD-17).
- Tipe DTCG tak dikenal tidak di-skip diam-diam dan tidak diabaikan total (harus muncul di laporan `skipped`/baris Unsupported).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| EXPORT_MODES | doc tokens + tokenModes `['light','dark']` | JSON DTCG: grup bersarang per `.`, `$type`, `$value` = nilai default, mode lain di `$extensions.mode`, `com.lakar.type` bila perlu | — |
| IMPORT_MODES_ALIAS | DTCG dgn `$extensions.mode` dan `$value:"{a.b}"` | tokenModes diperbarui bila perlu; alias di-resolve ke nilai target, kolom alias menunjukkan `{a.b}` | alias ke token tak ada → skipped `unknown-alias` |
| UNSUPPORTED | `$type:"shadow"|"typography"|"duration"|…` atau value tak valid | baris/entri `skipped` dengan reason `unsupported-type`/`unsupported-value`, token lain tetap masuk | bukan error kecuali tak ada satupun token valid |
| ROUNDTRIP | korpus token → `dtcgTokensJson` → `parseDtcgTokens` | `entries` identik dengan `doc.tokens` (nama, type, value, modes) | — |
| AGENT | `export_code {target:'dtcg'}`; `importDtcgTokens(json)` | berkas `tokens.json`; commit token + `{tokens, modes, skipped}` | JSON rusak → SCHEMA_INVALID; tanpa port → EXEC_ERROR |
| FLAT_NAMES | nama token tanpa `.` / segmen bentrok grup-token | grup tunggal/akar; nama path ↔ nama dot 1:1 | nama tak sah untuk TokenName → skipped `invalid-name` |

</intent-contract>

## Code Map

- `packages/codegen/src/dtcg.ts` -- BARU. `dtcgTokensJson(doc): string` (nested groups; `$type`/`$value`; `$extensions.mode` per mode non-default; `$extensions["com.lakar"].type` saat tipe Lakar tak terpetakan 1:1 dari `$type`) dan `parseDtcgTokens(input: unknown, opts): DtcgImport` (string JSON atau objek; jalan grup, `$type` warisan grup, alias `{path}`, mode dari `$extensions.mode`). Pemetaan di Design Notes.
- `packages/codegen/src/index.ts` -- ekspor API baru.
- `packages/ports/src/index.ts` -- `DtcgEntry`/`DtcgSkip`/`DtcgImport`/`DtcgParseOptions`/`DtcgPort` (pola `CssVariablesImport`; nilai hasil parse sudah bentuk Lakar `string|number`).
- `packages/exec/src/api.ts` -- fungsi `importDtcgTokens(json)` pola `importCssVariables` (batas 256K karakter, `ctx.dtcg` port; commit `setTokenModes` bila perlu + `setTokens`; hasil `{tokens, modes, skipped}`).
- `packages/exec/src/index.ts` -- `RunOptions.dtcg?: DtcgPort` + oper ke ctx.
- `packages/daemon/src/server.ts` -- `const DTCG = { parse: parseDtcgTokens }` dari `@lakar/codegen`, disuntikkan ke `runSnippet`.
- `packages/daemon/src/code-export.ts` -- `CODE_TARGETS` + `'dtcg'`; bila `dtcg` → `files=[{path:'tokens.json', contents:dtcgTokensJson(stored)}]` tanpa resolusi node (`id`/`name` `null`), `warnings:[]`.
- `packages/mcp/src/server.ts` -- enum `target` + `'dtcg'`; deskripsi `export_code` menyebutnya (id/opsi lain diabaikan untuk dtcg). `formatExportCode` sudah generik.
- `packages/viewer/src/dtcgImport.ts` -- BARU, pola `cssImport.ts`: `dtcgImportPlan(doc, json)` → `{modes, rows, counts, unsupported, ops, label, error}`; kolom Path/Alias/Type/Value-per-mode/Status; status `new|update|unsupported` (bukan dropped).
- `packages/viewer/src/TokensCss.tsx` -- `ImportDtcgDialog` (salinan `ImportCssDialog`: sumber paste/file `.json`, pemetaan mode dari `$extensions`, tabel, footer stat new/update/unsupported + catatan).
- `packages/viewer/src/ThemePanel.tsx` -- header: tombol **Import** (menu: "CSS variables…" → `onImportCss`; "DTCG tokens (.json)…" → `onImportDtcg`) dan **Export** (menu: "Copy tokens as CSS" → `CopyTokensPopover`; "Export DTCG JSON" → `download(Blob, 'tokens.json')` dari `ExportPopover`; "Copy DTCG JSON" → `copyText`). Menu popover kecil pola `tokens-pop`/menu yang ada; Escape & klik luar menutup.
- `packages/viewer/src/Viewer.tsx` -- state `dtcgImportOpen`, render `ImportDtcgDialog` dengan `onImport` yang sama seperti CSS.
- `packages/viewer/src/app.css` -- kelas menu/row status baru bila perlu (pakai ulang `css-import-*`).
- `packages/exec/src/index.test.ts` -- daftar `Object.keys(API)` + `importDtcgTokens`.
- `packages/mcp/src/index.test.ts` -- kasus `export_code {target:'dtcg'}`.
- `packages/daemon/src/code-export.test.ts` -- matriks target dtcg.
- `packages/viewer/src/test/dom.tsx` -- harness DOM yang ada.
- `tests/codegen.test.ts` / `tests/dtcg.test.ts` -- round-trip korpus `tests/fixtures/docs/*` (khususnya `v3/tema-mode.lakar.json`); fixture `tests/fixtures/dtcg/*.json` untuk mode+alias+unsupported.

## Tasks & Acceptance

**Execution:**
- [x] `packages/ports/src/index.ts` -- tipe `Dtcg*` + `DtcgPort` -- kontrak parser untuk exec.
- [x] `packages/codegen/src/dtcg.ts` + ekspor di `index.ts` -- ekspor/impor murni + `dtcg.test.ts` di codegen -- inti fitur.
- [x] `packages/exec/src/{api.ts,index.ts}` -- `importDtcgTokens` + port `dtcg` -- akses agen (impor).
- [x] `packages/daemon/src/{server.ts,code-export.ts}` -- injeksi port + `target:'dtcg'` -- akses agen (ekspor) dan parser.
- [x] `packages/mcp/src/server.ts` -- enum target + deskripsi -- permukaan tool.
- [x] `packages/viewer/src/dtcgImport.ts` -- model pratinjau/op impor DTCG -- UI logic.
- [x] `packages/viewer/src/{TokensCss.tsx,ThemePanel.tsx,Viewer.tsx,app.css}` -- menu Import/Export + dialog -- UI sesuai desain Section 11.
- [x] Tes: `dtcg.test.ts` (codegen), `tests/dtcg-roundtrip.test.ts` atau tambahan di `tests/codegen.test.ts`, exec `index.test.ts`, daemon `code-export.test.ts`, mcp `index.test.ts`, viewer `dtcgImport.test.ts` + `ThemePanel.dom.test.tsx`.

**Acceptance Criteria:**
- Given dokumen bertoken bermode (korpus), when diekspor lalu diimpor kembali lewat DTCG, then token, tipe, nilai, mode, dan `tokenModes` identik.
- Given fixture DTCG ber-`$extensions.mode` dan alias `{a.b}`, when diimpor, then mode menjadi `tokenModes`, alias ter-resolve, dan baris menunjukkan path/alias/tipe/nilai/status.
- Given fixture DTCG ber-tipe tak didukung, when diimpor, then tipe itu dilaporkan `unsupported` (UI: badge Unsupported + catatan; agen: `skipped`), token valid tetap terimpor.
- Given panel Theme, when Import → "DTCG tokens (.json)…" → paste JSON → Import N tokens, then satu rev tercatat dan Ctrl+Z mengembalikan token; Export → "Copy DTCG JSON" menyalin JSON yang sama dengan ekspor codegen.
- Given agen, when `export_code {target:'dtcg'}` then berkas `tokens.json` DTCG; `importDtcgTokens` commit token; tool lama tidak berubah (tools/list tetap 19 tool, anotasi tetap).

## Implementation Notes

## Plan Change Log

## Review Triage Log

### 2026-11-23 — Review pass
- verdicts: 8 findings — high 0, medium 3, low 5, false 0, maybe-false 0 (2 low rejected)
- findings:
  - `[medium]` `[patch]` `parseDtcgTokens`: `tokenModes` dari deklarasi `com.lakar` selalu menimpa mode dokumen (subset/reorder tidak dinormalisasi) — verified at dtcg.ts:399; doc `['light','dark','contrast']` + file `['light','dark']` → `setTokenModes(['light','dark'])` menghapus mode / gagal commit bila token memakai mode itu. Diperbaiki: `wanted ⊆ docModes` → `null`; selisih → `docModes + baru`.
  - `[medium]` `[patch]` `parseDtcgTokens`: `com.lakar.tokenModes: []` atau duplikat (`['light','light']`) lolos validasi per-elemen lalu `setTokenModes` gagal `SCHEMA_INVALID` di commit — verified; `[]` truthy → `tokenModes = []` → `TokenModes.min(1)` gagal. Diperbaiki: deklarasi kosong → `undefined` (diperlakukan seperti file asing), dedupe via `new Set`.
  - `[medium]` `[patch]` `parseDtcgTokens`: objek ber-`$type` tanpa `$value` dan tanpa anak diperlakukan sebagai grup → hilang tanpa baris `skipped` — verified at dtcg.ts:253; melanggar constraint "tak di-skip diam-diam". Diperbaiki: skip `unsupported-value` "Token declares $type but has no $value." + tes.
  - `[low]` `[patch]` `nameType`: segmen multi-kata berhyphen (`line-height-lg`, `letter-spacing-x`) tidak cocok keyword `line-height`/`letter-spacing` — verified; `flat.some` menuntut segmen utuh. Diperbaiki: tambah `pairs` segmen bersebelahan (pola `pair` di parseCssVariables) + tes.
  - `[low]` `[patch]` `TokensCss.tsx` `isColor` regex hanya uppercase — verified; parser DTCG mempertahankan hex lowercase apa adanya → swatch tak pernah muncul di pratinjau DTCG. Diperbaiki: flag `a-f`.
  - `[low]` `[patch]` `ImportDtcgDialog` footer menulis "skipped" sedangkan desain/Code Map menyebut "unsupported" — diperbaiki: label stat menjadi `unsupported`.
  - `[low]` `[patch]` `ThemePanel` trigger Export: `aria-expanded` false saat `CopyTokensPopover` terbuka — diperbaiki: `menu === 'export' || copyOpen`. Sub-keluhan label "Copied" ditolak: umpan balik pada kontrol yang dipakai adalah pola wajar, tidak ada kerugian nyata.
  - `[low]` `[reject]` Menu `theme-menu` tanpa navigasi panah/roving tabindex — menuitems adalah `<button>` native (tetap bisa dioperasikan keyboard via Tab/Enter); perbaikan focus management jauh melebihi koreksi langsung. Ditolak per aturan low.

## Design Notes

Pemetaan tipe Lakar → DTCG (`$type`/`$value`; `com.lakar.type` di `$extensions` selalu ditulis bila tipe Lakar bukan nama `$type` DTCG):

| Lakar | `$type` | `$value` | `com.lakar.type` |
|---|---|---|---|
| color | `color` | `"#RRGGBB"` | tidak perlu |
| fontFamily | `fontFamily` | `"Inter"` | tidak perlu |
| fontWeight | `fontWeight` | `600` | tidak perlu |
| radius/spacing/container/breakpoint/fontSize/lineHeight | `dimension` | `{value:n, unit:"px"}` | ya (selalu, agar round-trip) |
| letterSpacing | `dimension` | `{value:n, unit:"em"}` | ya |

Impor: `com.lakar.type` sah → pakai; tanpa itu infer dari `$type` (`color`→color, `fontFamily`→fontFamily, `fontWeight`→fontWeight, `dimension` px→spacing, `dimension` em→letterSpacing, `number`→fontWeight bila nama mengandung `weight` selain itu unsupported) lalu dari nama segmen (radius→radius, breakpoint→breakpoint, container→container, size/font-size→fontSize, leading/line-height→lineHeight). `$type` tak didukung (`typography`, `shadow`, `border`, `gradient`, `strokeStyle`, `transition`, `duration`, `cubicBezier`, `fontStyle`, `boolean`, …) → `unsupported-type`. Nilai tak valid untuk tipenya → `unsupported-value`. `fontWeight` keyword (thin…black, normal=400, bold=700) → angka. `fontFamily` array → join ", ".

Mode: ekspor `$extensions: {"mode": {<mode>: <value>}, "com.lakar": {"type": …}}` (mode default = `$value`); impor membaca `$extensions.mode` (nama harus `MODE_NAME_PATTERN`, lainnya → `invalid-mode`). Alias: `$value` string `"{path}"` dipecah ke nilai token target di file yang sama; `$extensions.mode` alias juga di-resolve. Nama token = path grup digabung `.`; segmen harus lolos `TokenName`.

Contoh ekspor `colors.accent` {type:color, value:#2563EB, modes:{dark:#60A5FA}}:
```json
"colors": { "accent": { "$type": "color", "$value": "#2563EB", "$extensions": { "mode": { "dark": "#60A5FA" } } } }
```

## Verification

**Commands:**
- `pnpm build` -- typecheck + build hijau.
- `pnpm test` -- dengan `LAKAR_C7_ALLOW_MISSING_SOURCES=1`; tidak ada kegagalan baru di atas baseline Windows origin/main (49–55 gagal Windows-only yang sudah diketahui).
- `pnpm vitest run packages/codegen/src/dtcg.test.ts tests/dtcg-roundtrip.test.ts packages/viewer/src/dtcgImport.test.ts packages/viewer/src/ThemePanel.dom.test.tsx` -- tes baru hijau.

**Manual checks (if no CLI):**
- Panel Theme: Import/Export menu sesuai desain `Y2Penr`/`muQTg` (Import: CSS variables…, DTCG tokens (.json)…; Export: Copy tokens as CSS, Export DTCG JSON, Copy DTCG JSON).

## Auto Run Result

**Ringkasan:** Modul murni `dtcg.ts` di `@lakar/codegen` mengekspor token Lakar (bertipe + mode tema) ke JSON W3C DTCG dan mengimpor JSON DTCG kembali menjadi definisi token; agen mendapat `export_code {target:'dtcg'}` (berkas `tokens.json`) dan `importDtcgTokens(json)` lewat port `DtcgPort` yang disuntikkan daemon; panel Theme mendapat menu Import (CSS variables…, DTCG tokens (.json)…) dan Export (Copy tokens as CSS, Export DTCG JSON, Copy DTCG JSON) plus dialog pratinjau Import DTCG sesuai desain Section 11. Semua permukaan lama tidak berubah (enum/opsi tambahan saja).

**Files changed:**
- `packages/codegen/src/dtcg.ts` — eksporter/pengimpor DTCG murni (grup bersarang ↔ nama dot, `$extensions.mode`, alias `{a.b}`, `com.lakar.type`, skipped stabil).
- `packages/codegen/src/dtcg.test.ts`, `tests/dtcg-roundtrip.test.ts`, `tests/fixtures/dtcg/modes-alias-unsupported.json` — tes unit + round-trip korpus + fixture asing.
- `packages/ports/src/index.ts` — kontrak `DtcgEntry/DtcgSkip/DtcgImport/DtcgParseOptions/DtcgPort`.
- `packages/exec/src/{api.ts,index.ts}` — `importDtcgTokens` (batas 256 KB, commit `setTokenModes`+`setTokens` satu rev) + `RunOptions.dtcg`.
- `packages/daemon/src/{server.ts,code-export.ts}` — injeksi parser + `CODE_TARGETS += 'dtcg'` (`tokens.json`, `id/name: null`).
- `packages/mcp/src/server.ts` — enum `dtcg` + deskripsi `export_code`/`execute`.
- `packages/viewer/src/dtcgImport.ts` — model pratinjau/op impor DTCG (baris Path/Alias/Type/Value-per-mode/Status).
- `packages/viewer/src/{TokensCss.tsx,ThemePanel.tsx,Viewer.tsx,app.css}` — `ImportDtcgDialog`, menu Import/Export, state dialog, gaya.
- `packages/skills/skills/api.md` — dokumentasi `importDtcgTokens` untuk agen.
- `packages/exec/src/index.test.ts`, `packages/daemon/src/code-export.test.ts`, `packages/mcp/src/index.test.ts`, `packages/viewer/src/{dtcgImport.test.ts,ThemePanel.dom.test.tsx}` — cakupan tes baru.

**Review findings:** 8 findings dari lensa `quick` — 3 medium + 5 low. Patch diterapkan untuk 6 (tokenModes ⊆ doc → null + gabungan aman; deklarasi `tokenModes` kosong/duplikat tidak lagi menggagalkan commit; objek `$type` tanpa `$value` dilaporkan `unsupported-value`; inferensi nama multi-kata berhyphen; swatch hex lowercase; label footer "unsupported"; `aria-expanded` trigger Export). Ditolak: label "Copied" pada trigger Export (umpan balik wajar) dan navigasi panah/roving tabindex pada menu (item `<button>` native sudah bisa dioperasikan keyboard; perbaikan bukan koreksi langsung).

**Follow-up review recommendation:** `true` — 3 entri medium di-patch; risiko yang belum terverifikasi: rekonsiliasi `tokenModes` baru (subset → null; selisih → gabungan `docModes + baru`) diuji unit tetapi belum dijalankan end-to-end lewat `importDtcgTokens` → commit `setTokenModes` pada dokumen yang tokennya mereferensikan mode ekstra (jalur validasi `resolveDocument`/`tokenModeIssues`).

**Verification:**
- `pnpm build` — hijau (tsc -b + viewer build).
- `pnpm vitest run packages/codegen/src/dtcg.test.ts tests/dtcg-roundtrip.test.ts packages/viewer/src/dtcgImport.test.ts packages/viewer/src/ThemePanel.dom.test.tsx packages/exec/src/index.test.ts packages/daemon/src/code-export.test.ts packages/mcp/src/index.test.ts` — 138 tes hijau (sebelum patch); setelah patch: 100 tes hijau untuk berkas yang disunting.
- `pnpm test` (`LAKAR_C7_ALLOW_MISSING_SOURCES=1`) — 2883 lulus, 56 gagal; semua kegagalan masuk kategori baseline Windows yang diketahui (kunci Unsplash/Pexels hilang, SIGTERM/SIGKILL, skema ESM `c:`/`d:`, ukuran skill CRLF, timing render Chromium, sumber C7, skrip shell release). Tidak ada kegagalan baru dari perubahan ini; satu-satunya tes yang membaca berkas yang disunting (`skills-examples.test.ts` → `api.md`) gagal pada blok `photo` unsplash yang sudah ada (kunci hilang), bukan blok `importDtcgTokens` baru yang lulus terhadap daemon nyata.

**Residual risks:** Nilai hex DTCG dipertahankan verbatim (huruf kecil/`#RRGGBBAA` lolos) — disengaja untuk round-trip lossless; renderer lain mungkin menormalisasi. Inferensi tipe dari nama tetap heuristik — nama asing yang tidak cocok kata kunci tetap jatuh ke `spacing`/`unsupported` sesuai tabel.
