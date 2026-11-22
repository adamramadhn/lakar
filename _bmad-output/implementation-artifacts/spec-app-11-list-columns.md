---
title: 'Kolom List view Dashboard sesuai desain (Created, Last agent, Checks)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: '93e3a6fe7b3593efbc89a2fc43d49dd891263365'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Desain `design/lakar-ui.pen` (Section 01, "Desktop — List — Dark/Light", komponen `List Row` `KoeAF`) menggambar List view Dashboard dengan kolom `Name | Edited | Created | Last agent | Checks`, sedangkan kode menampilkan `Name | Edited | Boards | Revision`. Daftar `GET /viewer/docs` belum membawa data untuk tiga kolom baru.

**Approach:** Tambah field OPSIONAL di ringkasan `GET /viewer/docs`: `createdAt` (entri riwayat pertama), `lastClient` (klien penulis entri riwayat terakhir), `check` (`{error, warning}` hasil check terakhir yang diketahui, hanya bila mencakup semua board pada rev terkini). Hasil check dicatat dalam memori dari check yang sudah berjalan (execute + layout_check), tanpa menjalankan check baru. Viewer merender kolom sesuai desain; tablet menyembunyikan Created dan Checks (layar "Tablet — List"), mobile tetap tanpa kolom.

## Boundaries & Constraints

**Always:** Bentuk respons lama tidak berubah: field baru hanya ditulis bila ada (tes bentuk `toEqual` lama tetap hijau). Ringkasan riwayat di-cache per `slug@mtime` (riwayat tidak dibaca ulang bila file tidak berubah). Teks UI bahasa Inggris, komentar/spec bahasa Indonesia. Token tema yang ada (`--agent`, `--codex`, `--avatar`, `--success`, `--danger`, `--warning`).

**Never:** Menjalankan layout check atau render demi daftar. Route/tool baru atau berubah. Perubahan Dashboard lain (Grid, sidebar, sort). Menyentuh `apps/desktop`.

**Keputusan (desain tidak menjawab / data tidak ada):**
- Created = `at` entri riwayat pertama. Dokumen tanpa riwayat (dibuat `open_doc` tanpa execute, atau file dari luar) → tanpa `createdAt`, UI "—". Birthtime file tidak dipakai (tidak andal di Linux, dan mengubah bentuk tes lama).
- Last agent = klien entri riwayat terakhir: `client` yang kini ikut ditulis ke entri riwayat execute (field opsional baru di `HistoryEntry`), lalu sesi yang masih dikenal, lalu id tetap `lakar-viewer`. Entri lama dari sesi yang hilang (restart) → tanpa `lastClient`, UI "—".
- Label: `harnessLabel` (Claude Code, Codex, MCP agent, You). Edit manual tampil "You" dengan avatar bulat `--avatar` (aplikasi tidak punya nama pengguna; desain memakai "Muhammad F."). Agen: avatar kotak radius 6, Codex `--codex`, lainnya `--agent`, huruf awal tebal.
- Checks: per dokumen (kunci id dokumen, tahan rename) disimpan `{rev, boards: id → {error, warning}}`. Execute menggabungkan board tersentuh bila rev dasar = rev tercatat (selain itu mulai baru); layout_check menggabungkan bila rev sama. Diketahui hanya bila rev tercatat = rev dokumen dan setiap board dokumen punya hasil. Hanya memori (hilang saat restart) → "—" sampai agen menjalankan execute/layout_check lagi. "N errors" (`--danger`) > "N warnings" (`--warning`) > "Passed" (`--success`).
- Edited memakai `relativeTime` yang sudah ada ("1 h ago"), sama dengan kartu Grid.
- `/viewer/archive` tidak mendapat field baru (riwayat arsip di path lain); kolom tampil "—".

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| File baru dari aplikasi | POST /viewer/docs | `createdAt` = waktu entri "Created file", `lastClient: 'lakar-viewer'`, tanpa `check` | — |
| Execute agen | sesi `claude-code`, execute sukses | `lastClient: 'claude-code'`, `check` = ringkasan board tersentuh (bila semua board tersentuh) | — |
| Restart daemon | riwayat berisi `client` | `lastClient` tetap; `check` hilang | — |
| Board lain belum dicek | dokumen 2 board, execute menyentuh 1 | tanpa `check`; sesudah `layout_check` semua board → `check` | — |
| Tulis tanpa check | Restore / pages / rename board lewat aplikasi menaikkan rev | tanpa `check` (rev tidak cocok) | — |
| Rename | dokumen dicek lalu di-rename | `check` tetap (kunci id dokumen) | — |
| Tanpa riwayat | file `.lakar.json` saja | bentuk lama persis (tanpa field baru) | riwayat rusak → baris dilewati |

</frozen-after-approval>

## Code Map

- `packages/daemon/src/checks.ts` (baru) -- `CheckLedger`: `record(docId, baseRev, rev, boards)`, `forDoc(doc)`.
- `packages/daemon/src/server.ts` -- buat ledger; catat di `/execute` (sesudah commit, `ran.boards`) dan `/layout-check`; tulis `client` sesi ke entri riwayat execute; teruskan ledger ke `registerViewerRoutes`.
- `packages/daemon/src/viewer.ts` -- `ViewerDocSummary` + field opsional; cache meta riwayat per `slug@mtime` (juga dokumen di memori); `check` dihitung per permintaan; route history memakai `h.client` sebagai fallback.
- `packages/schema/src/nodes.ts` -- `HistoryEntry.client?`.
- `packages/viewer/src/api.ts` -- tipe `DocSummary`.
- `packages/viewer/src/Dashboard.tsx` -- `list-head`/`list-row` (~baris 630): kolom baru, komponen kecil `LastAgent`, `CheckStatus`.
- `packages/viewer/src/app.css` -- grid 360/160/160/200/fill/28; tablet `fill/170/190/28` sembunyikan kolom 3 dan 5; avatar agen dan titik status.

## Tasks & Acceptance

**Execution:**
- [x] `packages/daemon/src/checks.ts` -- ledger check -- sumber Checks murah.
- [x] `packages/schema/src/nodes.ts`, `packages/daemon/src/server.ts` -- `client` di riwayat execute + pencatatan ledger -- Last agent tahan restart.
- [x] `packages/daemon/src/viewer.ts` -- field opsional `createdAt`, `lastClient`, `check` -- data kolom.
- [x] `packages/daemon/src/list-columns.test.ts` -- matriks I/O (route) + unit ledger.
- [x] `packages/viewer/src/api.ts`, `api.test.ts` -- tipe + kontrak klien meneruskan field opsional.
- [x] `packages/viewer/src/Dashboard.tsx`, `app.css` -- render kolom desktop/tablet.

**Acceptance Criteria:**
- Given 1440px gelap/terang, when List view dibuka, then header `Name | Edited | Created | Last agent | Checks` dan baris berisi avatar + nama agen serta titik status, sesuai `List Row`.
- Given 768px, when List view dibuka, then kolom `Name | Edited | Last agent` (layar "Tablet — List"); given 769–1100px, then `Name | Edited | Last agent | Checks`; given <768px, then baris kompak tanpa kolom seperti sebelumnya.
- Given data tidak diketahui, when baris dirender, then kolom menampilkan "—" (redup), tidak kosong dan tidak salah.

## Implementation Notes

- Desain dibaca lewat MCP Pencil (baca saja): `List Row` `KoeAF` = Name 360 · Edited 160 · Created 160 · "Col Created by" 200 (avatar 24 radius 6 + nama, gap 10) · "Col Active" sisa (titik 7 + label 13px). Avatar agen: `$agent` (Claude Code), `#0EA5E9` = `--codex` (Codex, huruf X). "Tablet — List" (768×1024) = Name · Edited 170 · Last agent 190.
- `CheckLedger` (`checks.ts`) diisi di `server.ts` dari `ran.boards` (ringkasan per board yang sudah dihitung `runCheck`); tidak ada render tambahan. Pencatatan layout_check memakai rev snapshot yang dibaca tanpa kunci: bila execute menyusul di tengah, catatan tertinggal satu rev → "—" (konservatif, tidak pernah salah).
- Meta riwayat di-cache per `slug@mtime` untuk dokumen di memori juga (sebelumnya ringkasan dokumen di memori dihitung ulang tiap permintaan; kini riwayat tidak dibaca ulang).
- `HistoryEntry.client` opsional hanya ditulis oleh `/execute` (sesi agen atau sesi viewer `lakar-viewer`). Route history viewer kini juga memakai field ini sebagai fallback sehingga label harness History tetap ada setelah restart.
- Tambahan sesudah cek visual: rentang 769–1100px (desktop sempit, sidebar tetap) menyembunyikan Created; tanpa itu judul file terpotong jadi 1–2 huruf di 1024px.
- Cek visual (Edge headless, lakard lokal, data nyata: Claude Code dengan teks meluber → "1 error", Codex → "Passed", file baru aplikasi → "You" + "—"): 1440 gelap/terang, 1024 gelap, 768 gelap/terang, 375 terang; tanpa overflow horizontal.

## Review Triage Log

| # | Temuan (review mandiri) | Verdict | Bukti / tindakan |
|---|---|---|---|
| 1 | Tes bentuk lama `GET /viewer/docs` (`toEqual`) pecah bila field baru selalu ditulis | false | Field hanya ditulis bila ada; file tanpa riwayat → bentuk lama persis (viewer.test.ts hijau). |
| 2 | Execute yang menyentuh sebagian board bisa melaporkan "Passed" padahal board lain error | false | Board lain hanya dipakai bila catatan ada di rev dasar execute; selain itu catatan mulai baru dan board tanpa hasil → tidak diketahui (tes "Board lain belum dicek", unit ledger). |
| 3 | Rename slug kehilangan check | false | Ledger berkunci id dokumen; tes rename. |
| 4 | Lebar 1024 membuat kolom Name terlalu sempit dengan 5 kolom | medium | Diperbaiki: media query 769–1100px menyembunyikan Created. |
| 5 | Check hilang saat restart, Archive tanpa kolom, nama pengguna | low | Dicatat di `deferred-work.md`. |

## Verification

**Commands:**
- `pnpm build` -- sukses.
- `pnpm test` (dengan `LAKAR_C7_ALLOW_MISSING_SOURCES=1`) -- tidak ada kegagalan baru dibanding baseline Windows.

**Manual checks:**
- Edge headless 1440 gelap/terang dan 1024: kolom dan warna sesuai desain, tanpa overflow.
