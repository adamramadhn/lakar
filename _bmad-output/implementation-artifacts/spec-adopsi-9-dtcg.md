---
title: 'Impor dan ekspor token W3C DTCG (epic adopsi-open-pencil story 9)'
type: 'feature'
created: '2026-11-24'
status: 'done'
baseline_revision: '9ece3808caa82247ce5e81b7071771405b68379c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/design/README.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-adopsi-open-pencil/tickets/story-impor-dan-ekspor-token-w3c-dtcg-plan.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Token Lakar (bertipe, dengan mode tema) belum bisa keluar/masuk sebagai JSON W3C DTCG, padahal agen dan pengguna perlu membawa token dari/ke toolchain luar.

**Approach:**
- Modul murni `dtcg.ts` di `@lakar/codegen`: `dtcgTokensJson(doc)` (sisi tulis) dan `parseDtcgTokens(input, opts)` (sisi baca, adaptor `DtcgPort` dari `@lakar/ports`). Tanpa IO, tanpa DOM.
- Agen: `export_code {target:'dtcg'}` menghasilkan satu berkas `tokens.json` untuk seluruh token dokumen (tanpa board/node); `importDtcgTokens(json)` di execute meng-commit `setTokenModes` + `setTokens` dalam satu transaksi, sama dengan `importCssVariables`.
- Viewer: menu Import/Export di header panel Theme (desain Section 11) — "DTCG tokens (.json)…" membuka dialog impor dengan pratinjau baris (path/alias/tipe/nilai per mode/status) lalu satu `commitOps`; "Export DTCG JSON" mengunduh `tokens.json`, "Copy DTCG JSON" menyalin byte yang sama.

## Boundaries & Constraints

**Always:**
- Hanya penambahan: nilai enum `target:'dtcg'` baru, fungsi execute baru, route/tool/ops lama tidak berubah (AD-4). Input lama `export_code` identik.
- Satu modul murni di codegen untuk impor dan ekspor; daemon menyuntikkan `{parse: parseDtcgTokens}` ke `runSnippet` (sama seperti `cssVariables`); viewer memakai `parseDtcgTokens`/`dtcgTokensJson` langsung (AD-17).
- Deterministik: dokumen sama → byte JSON sama (indent 2, urutan token = urutan tersimpan, newline akhir).
- Round-trip lossless untuk semua `TokenType`: color/fontFamily/fontWeight dipetakan `$type` 1:1; tipe lain ditulis `dimension` + `$extensions["com.lakar"].type`; mode di `$extensions.mode`; urutan mode di `$extensions["com.lakar"].tokenModes` akar. Impor menghormati `com.lakar.type` > `$type` > inferensi nama. Nilai yang sudah sah (mis. heksadesimal `#RRGGBBAA`, huruf kecil) dipertahankan apa adanya; `rgb()/hsl()` dinormalkan `parseCssColor`.
- Alias `{token.lain}` di-resolve terhadap token di file yang sama (memoized, kedalaman ≤ 10); target tak ada/siklus → `unknown-alias`. Nilai alias per mode mengikuti nilai target pada mode itu.
- Yang tidak bisa diimpor tidak dibuang diam-diam: `skipped` berisi `{source, reason, detail}` dengan `reason` ∈ `invalid-name | invalid-mode | unsupported-type | unsupported-value | unknown-alias`, diurutkan mengikuti posisi di file.
- Impor atomic: `setTokenModes` (bila daftar mode berubah) lalu satu `setTokens` dalam transaksi yang sama — satu rev, satu entri History, bisa di-undo; kegagalan membatalkan semuanya.
- Teks UI Inggris; komentar Indonesia. Batas ukuran 256 K karakter di execute dan dialog.

**Never:**
- Mengubah skema, op core, route/tool lama, bentuk respons lama, `tokens.css`, atau perilaku `importCssVariables`/`setTokens` datar.
- Viewer bergantung pada core/exec/icons, membuka `EventSource` baru, atau memanggil daemon untuk konversi.
- Fetch jaringan, dependensi baru, atau remap mode (mode file tidak cocok `MODE_NAME_PATTERN` → `invalid-mode`, bukan dipetakan diam-diam).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ekspor token bertipe | `radius.md: 12`, `tracking: 0.02` | `{radius:{md:{$type:'dimension',$value:{value:12,unit:'px'},$extensions:{'com.lakar':{type:'radius'}}}}}`; letterSpacing → `unit:'em'` | - |
| Nama menimpa prefix grup | token `a` dan `a.b` | `a` jadi token; `a.b` ditulis datar di akar | - |
| Round-trip korpus | `dtcgTokensJson` → `parseDtcgTokens` | token, tipe, nilai, modes, tokenModes identik; ekspor ulang byte sama | - |
| Mode file | `$extensions.mode:{dark:…}` + `com.lakar.tokenModes` | `tokenModes` = urutan deklarasi + mode tambahan urut kemunculan; `null` bila ⊆ mode dokumen | - |
| Alias | `$value:'{colors.bg}'` | nilai = nilai target; `alias` dicatat; mode alias mewarisi modes target | siklus/tak dikenal → `unknown-alias` |
| Dimension rem | `{value:1.5,unit:'rem'}` | ×16 px (dibulatkan 4 digit) | - |
| fontFamily array | `['Inter','sans-serif']` | `'Inter, sans-serif'` | - |
| Keyword weight | `'semi-bold'` | `600` | bukan keyword/angka 100–900 → `unsupported-value` |
| Tipe asing | `$type:'shadow'/'typography'` | masuk `skipped` `unsupported-type` | - |
| Nama/mode buruk | `Bad Name`, mode `Dark Mode` | `invalid-name` / `invalid-mode` | - |
| Warna rusak | `$value:'not-a-color'` | `unsupported-value` | - |
| JSON rusak/non-objek | `'{oops'`, `'42'` | `LakarError SCHEMA_INVALID` | - |
| execute tanpa port | host tanpa `dtcg` | - | `EXEC_ERROR` |
| execute tanpa token sah | semua skipped | - | `SCHEMA_INVALID` + daftar skip |
| execute argumen/ukuran | bukan string, > 256 K | - | `SCHEMA_INVALID` |
| `export_code {target:'dtcg'}` | dokumen aktif, tanpa `id` | `{id:null, name:null, files:[tokens.json], warnings:[]}` | - |
| Dialog tanpa entri sah | semua baris Unsupported | tombol nonaktif + pesan | - |

</intent-contract>

## Code Map

- `packages/ports/src/index.ts` — tipe `DtcgTokenValue`, `DtcgEntry`, `DtcgSkip(Reason)`, `DtcgImport`, `DtcgParseOptions`, `DtcgPort`.
- `packages/codegen/src/dtcg.ts` — `dtcgTokensJson`, `parseDtcgTokens` (murni, deterministik); `index.ts` — ekspor; `package.json` — dep `@lakar/ports`; `dtcg.test.ts` — unit.
- `packages/exec/src/api.ts` — `importDtcgTokens` + `DtcgImportResult` + `DTCG_IMPORT_MAX_CHARS` + entri tabel API; `index.ts` — `RunOptions.dtcg`, injeksi ke `ApiContext`.
- `packages/daemon/src/server.ts` — suntik `{parse: parseDtcgTokens}`; `code-export.ts` — `CODE_TARGETS` + cabang `dtcg` (satu `tokens.json`, tanpa board).
- `packages/mcp/src/server.ts` — enum target `dtcg` + deskripsi `export_code`/`execute`.
- `packages/viewer/src/dtcgImport.ts` — rencana impor murni (baris, counts, ops, label, error); `TokensCss.tsx` — `ImportDtcgDialog`; `ThemePanel.tsx` — menu Import/Export; `Viewer.tsx` — state + `commitOps`; `app.css` — gaya.
- `packages/skills/skills/api.md` — diregenerasi dari `api.ts`.
- `tests/dtcg-roundtrip.test.ts` + `tests/fixtures/dtcg/modes-alias-unsupported.json` — round-trip korpus + fixture mode/alias/skipped.
- Tes: `packages/codegen/src/dtcg.test.ts`, `packages/exec/src/index.test.ts`, `packages/daemon/src/code-export.test.ts`, `packages/mcp/src/index.test.ts`, `packages/viewer/src/dtcgImport.test.ts`, `packages/viewer/src/ThemePanel.dom.test.tsx`, `tests/execute-description.test.ts`, `tests/dependency-direction.test.ts`.

## Tasks & Acceptance

**Execution:** (selesai) modul codegen, port, execute, route ekspor, enum MCP, dialog viewer + menu Theme, tes unit/DOM/round-trip, regen `api.md`.

**Acceptance Criteria:**
- `pnpm build` hijau; `dtcgTokensJson` deterministik dan berakhir newline.
- Round-trip keenam dokumen korpus: `tokens`/`tokenModes` identik, ekspor ulang byte sama.
- Fixture dengan mode, alias, dan tipe tak didukung: entri sah ter-parse, skipped terlaporkan.
- `export_code {target:'dtcg'}` → satu `tokens.json`; input lama `export_code` tidak berubah.
- `importDtcgTokens` commit atomic (satu rev); tanpa port → `EXEC_ERROR`; tanpa entri → `SCHEMA_INVALID`.
- Menu Theme menampilkan item DTCG dan memanggil callback yang benar (tes DOM).

**Verification (2026-11-24, Windows, Node 26.5.0):**
- `pnpm install` + `pnpm build` ✓; `node scripts/gen-skill-api.mjs` ✓ (`api.md` +16 baris).
- Vitest terfokus: `codegen/dtcg.test.ts` 9, `viewer/dtcgImport.test.ts` 3, `tests/dtcg-roundtrip.test.ts` 8, `exec/index.test.ts` 78, `daemon/code-export.test.ts` 9, `mcp/index.test.ts` 29, `ThemePanel.dom.test.tsx` 2, `execute-description` 28, `dependency-direction` ✓.
- `pnpm test` penuh: 2877 lulus; 61 gagal semuanya kegagalan lingkungan pra-ada (Chromium render, sumber C7, kunci Unsplash, SIGTERM/SIGKILL & store Windows, CRLF skills, skrip bash release) — tidak ada di berkas yang disentuh; blok `importDtcgTokens` di `api.md` lulus terhadap daemon nyata (satu-satunya masalah blok 21 = kunci foto).

## Review Triage

Catatan desain yang disengaja:
- `skipped` mengikuti urutan traversal file (posisi token di JSON), bukan urutan fase validasi — lebih mudah dicari pengguna.
- Nilai warna yang sudah sah dipertahankan verbatim (mis. `#ffffff` tetap huruf kecil, `#RRGGBBAA` tetap 8 digit) — syarat lossless; `rgb()/hsl()` dinormalkan.
- `type:'number'` hanya menjadi `fontWeight` bila nama mengandung `weight`; selain itu `unsupported-type`.
