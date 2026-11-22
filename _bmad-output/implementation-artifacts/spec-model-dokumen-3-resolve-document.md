---
title: 'Satu pipa resolveDocument dipakai semua konsumen (epic model-dokumen story 3)'
type: 'refactor'
created: '2026-11-22'
status: 'done'
baseline_revision: '4fed389e6403d2bd8bfaafcef200c1c641f55bb4'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** AD-10 spine mewajibkan `resolveDocument(doc, { mode? })` di `@lakar/schema` sebagai satu-satunya pintu dari dokumen tersimpan ke dokumen ter-resolve. Konsumen yang memanggil tahap resolusi sendiri-sendiri akan berbeda hasil begitu epic komponen menambah ekspansi instance. Saat ini daemon dan core memanggil `resolveTokens` langsung di sembilan tempat.

**Approach:**
- Tambah `resolveDocument` di `@lakar/schema`. Untuk sekarang isinya hanya tahap token (`resolveTokens`). Epic komponen nanti menambah tahap ekspansi instance di dalam fungsi yang sama.
- Ganti semua pemanggilan `resolveTokens` di kode produksi luar `packages/schema` dengan `resolveDocument`.
- Tambah tes penjaga yang gagal bila kode produksi di luar `packages/schema` memanggil `resolveTokens`.

## Boundaries & Constraints

**Always:**
- **Tanda tangan:** `resolveDocument(doc: LakarDocument, opts?: { mode?: string }): ResolvedDocument`.
- **Perilaku** identik dengan `resolveTokens(doc, opts)` untuk dokumen tanpa instance: hasil, error, kode, dan pesan sama persis.
- **Komentar fungsi** (bahasa Indonesia) menyebut urutan tahap AD-10: ekspansi instance (belum ada, milik epic komponen), lalu resolve token. Komentar juga menyatakan bahwa konsumen tidak boleh menulis ulang tahap mana pun.
- **`resolveTokens` tetap diekspor.** Tahap ini dipakai terpisah oleh codegen nanti (AD-10).
- **Cakupan penjaga:** hanya file `packages/*/src/**/*.ts` non-tes di luar `packages/schema`. File tes dan `packages/render/test` boleh tetap memakai `resolveTokens`.
- **Komentar yang menyebut `resolveTokens` sebagai pintu render** diperbarui: `packages/render/src/index.ts:5` dan `packages/schema/README.md`.

**Never:**
- Mengubah perilaku, respons route, atau pesan error.
- Menambah ekspansi instance atau tipe node `instance`.
- Mengubah render, check, viewer, atau tes yang tidak terkait.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Setara `resolveTokens` | setiap fixture korpus setelah `parseDocument` | `resolveDocument(d)` deep-equal `resolveTokens(d)` | — |
| Paksa mode | fixture v3 `tema-mode`, `{mode:'dark'}` | sama dengan `resolveTokens(d,{mode:'dark'})` | mode tak dikenal → `SCHEMA_INVALID` sama |
| Token tak dikenal | ref ke token yang tidak ada | error yang sama dengan `resolveTokens` | `TOKEN_UNKNOWN` |
| Penjaga | file produksi di luar schema yang memanggil `resolveTokens(` | tes penjaga gagal dan menyebut path file | — |

</intent-contract>

## Code Map

- `packages/schema/src/tokens.ts` -- `resolveTokens(doc, opts)`. `resolveDocument` diletakkan di modul baru `packages/schema/src/resolve.ts` (nama file dari Structural Seed spine) dan diekspor lewat `packages/schema/src/index.ts`.
- `packages/core/src/transaction.ts:14,426` -- `commit` memanggil `resolveTokens(w)` sebagai validasi.
- `packages/daemon/src/export.ts:9,46,70` -- export PNG / revisi.
- `packages/daemon/src/server.ts:21,449,450,506,533,557,573,621` -- execute (before/after untuk check), screenshot, boards, inspect, export, layout-check.
- `packages/render/src/index.ts:5` -- komentar saja.
- `packages/schema/README.md` -- daftar ekspor.
- `tests/dependency-direction.ts` / `tests/dependency-direction.test.ts` -- contoh pola tes penjaga yang memindai sumber paket (pakai `loadWorkspace` bila cocok, atau baca file langsung).

## Tasks & Acceptance

**Execution:**
- `packages/schema/src/resolve.ts` + `index.ts` -- `resolveDocument` beserta komentar AD-10.
- `packages/core/src/transaction.ts`, `packages/daemon/src/export.ts`, `packages/daemon/src/server.ts` -- ganti pemanggilan dan impornya.
- `packages/render/src/index.ts`, `packages/schema/README.md` -- komentar dan dokumen.
- `packages/schema/src/resolve.test.ts` -- baris matriks: setara korpus, paksa mode, `TOKEN_UNKNOWN`. Korpus dibaca lewat `tests/support/doc-corpus.ts` dan `parseDocument` relatif `../../core/src/index.ts`.
- `tests/resolve-document.test.ts` -- tes penjaga, termasuk satu kasus negatif yang membuktikan pemindainya mendeteksi pemanggilan `resolveTokens(` di sumber contoh.

**Acceptance Criteria:**
- Given repo sesudah perubahan, when mencari `resolveTokens(` di kode produksi luar `packages/schema`, then tidak ada hasil, dan tes penjaga lulus.
- Given suite daemon, when dijalankan, then tidak ada kegagalan baru dibanding baseline Windows.

## Spec Change Log

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 21 findings — high 0, medium 2, low 16, false 3, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) penjaga tidak menangkap re-export atau akses bracket — pola itu tidak dipakai di repo; penjaga adalah heuristik, dan review kode tetap berlaku.
  - `[low]` `[reject]` (blind) false positive pada komentar yang berisi `resolveTokens(` — tidak ada komentar seperti itu di produksi; bila muncul, pesan penjaga menunjuk file-nya.
  - `[low]` `[reject]` (blind) impor tanpa titik koma — gaya repo selalu memakai titik koma.
  - `[low]` `[reject]` (blind) pemindaian hanya `src` — sesuai batas spec; pengecualian `render/test` hanya dokumentasi.
  - `[low]` `[reject]` (blind) tes schema mengimpor sumber core — pola tes repo yang sudah ada (`packages/render/test/visual.test.ts`).
  - `[low]` `[reject]` (blind) impor `LakarDocument` ganda — kosmetik.
  - `[low]` `[reject]` (blind) tidak ada cek mutasi input di jalur `{mode}` — jalur yang sama dengan `resolveTokens` yang sudah dites tidak memutasi.
  - `[low]` `[reject]` (blind) opsi belum siap untuk tahap instance — milik epic komponen.
  - `[false]` `[reject]` (blind) sapuan pemanggil belum dibuktikan — `git grep` dan tes penjaga menunjukkan nol pemanggil produksi di `packages/*/src`.
  - `[low]` `[reject]` (blind) README menjanjikan codegen — AD-10 mewajibkan tahap token diekspor terpisah.
  - `[medium]` `[patch]` (intent) `scripts/photo-offline-check.mjs` masih memanggil `resolveTokens` pada dokumen tersimpan — diganti `resolveDocument` (diverifikasi `node --check` dan ekspor dist).
  - `[false]` `[reject]` (intent) `/viewer/docs/:slug` mengirim dokumen tersimpan — canvas viewer sekarang PNG lewat `/screenshot` yang sudah memakai `resolveDocument`; canvas DOM hidup milik epic editor (AD-6).
  - `[low]` `[reject]` (intent) celah cakupan regex penjaga — duplikat temuan blind pertama.
  - `[false]` `[reject]` (intent) baru satu tahap yang ada — intent menyatakan tahap instance ditambahkan epic komponen.
  - `[medium]` `[patch]` (verification-gap) skrip foto di luar cakupan penjaga — satu akar dengan temuan intent di atas; patch yang sama.
  - `[low]` `[reject]` (verification-gap, other) skrip mem-parse JSON tanpa migrasi — sudah ada sebelumnya; skrip diagnostik dijalankan pada dokumen yang baru dibuat daemon (versi terkini).
  - `[low]` `[reject]` (edge) komentar memicu penjaga — duplikat.
  - `[low]` `[reject]` (edge) re-export lolos penjaga — duplikat.
  - `[low]` `[reject]` (edge) akses lewat referensi — duplikat.
  - `[low]` `[reject]` (edge) `import type` ikut ditandai — `resolveTokens` adalah fungsi; impor tipe saja tidak masuk akal.
  - `[low]` `[reject]` (edge) fixture `tema-mode` hilang → TypeError — tes cakupan versi korpus sudah gagal lebih dulu dengan pesan jelas.

## Verification

**Commands** (Windows: awali dengan `set "PATH=C:\Users\Fatmuh\AppData\Local\nvm\v26.5.0;%PATH%" &&`; pnpm = `npx -y pnpm@12.21.0`):
- `npx -y pnpm@12.21.0 build` -- expected: sukses
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: 0 error
- `npx -y pnpm@12.21.0 exec vitest run packages/schema packages/core tests/resolve-document.test.ts tests/dependency-direction.test.ts tests/doc-corpus.test.ts` -- expected: semua lulus
- `npx -y pnpm@12.21.0 exec vitest run packages/daemon` -- expected: tidak ada kegagalan baru dibanding baseline Windows (`%TEMP%\lakar-fail-base.txt`; bandingkan nama tes tanpa karakter non-ASCII)

## Auto Run Result

- **Ringkasan:**
  - `resolveDocument(doc, {mode?})` di `packages/schema/src/resolve.ts` menjadi satu-satunya pintu resolusi (AD-10). Isinya sekarang hanya tahap token; tahap ekspansi instance milik epic komponen.
  - Sembilan pemanggilan produksi di core dan daemon, plus `scripts/photo-offline-check.mjs`, dipindah ke `resolveDocument`.
  - Tes kesetaraan atas korpus dan tes penjaga yang memindai `packages/*/src`.
- **File:**
  - `packages/schema/src/{resolve,index,tokens}.ts`, `README.md` -- fungsi, ekspor, komentar.
  - `packages/core/src/transaction.ts`, `packages/daemon/src/{server,export}.ts`, `scripts/photo-offline-check.mjs` -- pemanggil.
  - `packages/render/src/index.ts` -- komentar.
  - `packages/schema/src/resolve.test.ts`, `tests/resolve-document.test.ts` -- tes.
- **Review:** 21 temuan; 1 entri di-patch (medium, skrip foto); 0 ditunda; 19 ditolak (3 false, 16 low).
- **Follow-up review:** `false`. Hanya satu entri medium yang di-patch, berupa penggantian satu baris.
- **Verifikasi:**
  - build OK; `tsc -p tsconfig.test.json` 0 error.
  - schema/core/penjaga/dependency/korpus/render-korpus: 393/393.
  - Daemon: tidak ada kegagalan baru dibanding baseline (dilaporkan subagen implementasi, 33 kegagalan baseline).
  - Skrip foto: `node --check` OK, dan dist mengekspor `resolveDocument`.
- **Risiko sisa:** penjaga berbasis regex; akses tidak langsung (namespace, bracket) tidak terdeteksi.
