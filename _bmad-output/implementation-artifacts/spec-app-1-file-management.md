---
title: 'Aplikasi 1: kelola file (New file, rename, duplicate, archive, delete)'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: 'afeadb19daef0f557c9f55e63ea1a3a386a930b7'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/design/README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Membuat dan mengelola file hanya bisa lewat agen. Pengguna ingin membuat file baru dari aplikasi seperti di Figma, lalu mengelolanya (rename, duplicate, archive, delete).

**Approach:**
- Tambah route tulis baru `/viewer/docs*` di `lakard`.
- Di Dashboard: tombol **New file** dengan dialog (nama + board awal), context menu kartu, halaman **Files** dan **Archive**.
- Semua mengikuti `design/lakar-ui.pen` bagian 01–02.

## Boundaries & Constraints

**Always:**
- **Route baru dan perilaku lama.** Route baru: `POST /viewer/docs`, `POST /viewer/docs/:slug/{rename,duplicate,archive,unarchive}`, `DELETE /viewer/docs/:slug`, `GET /viewer/archive`. Respons memakai bentuk AD-11. Route dan tool MCP lama tidak berubah perilakunya (bench).
- **Penguncian dan memori.** Setiap operasi berjalan di dalam `docLocks.run(slug)` dan memperbarui `docs` Map.
  - **Rename** memindahkan `.lakar.json` + `.history.jsonl` dan mengalihkan `activeSlug` sesi ke slug baru.
  - **Archive/delete** menghapus entri memori dan mengosongkan `activeSlug` sesi yang menunjuk slug itu. Agen lalu mendapat `NO_ACTIVE_DOC`, dan `/execute` tidak bisa menghidupkan file lagi.
- **Archive** disimpan di `<dataDir>/docs/archive/`, dengan pola nama file sama.
- **Nama file = slug.**
  - Input nama diubah ke slug kebab-case (`My Landing` → `my-landing`); bila sudah ada, diberi sufiks `-2`, `-3`.
  - Dialog menampilkan pratinjau slug.
  - Slug kosong/tidak valid → error `SCHEMA_INVALID`.
- **New file** membuat dokumen dengan satu board bernama sesuai preset:
  - Desktop 1440×900 `screen:'landing'`
  - Tablet 768×1024 `screen:'app'`
  - Mobile 375×812 `screen:'mobile'`
  - Custom: lebar/tinggi 1..10000, `screen:'app'`

  Board berisi fill putih. Ada satu entri history ("Created file"), lalu viewer langsung membuka `#/d/<slug>`.
- **Context menu kartu** (klik kanan atau tombol "…"): Open, Rename (dialog), Duplicate, Copy link (`http://127.0.0.1:<port>/app/#/d/<slug>`), Move to Archive, Delete (dialog konfirmasi, tidak bisa dibatalkan).
  - Halaman Archive memakai menu Unarchive dan Delete.
- **Halaman Files** (`#/files`): semua file urut nama, grid/list.
- **Halaman Archive** (`#/archive`): file terarsip, dengan empty state sesuai desain.
- Sidebar: nav Recents, Files, Archive, Settings.
- Teks UI berbahasa Inggris; spec dan komentar berbahasa Indonesia. Node 26, TS strict, test lolos di CI Linux.

**Never:**
- Folder / "Move to…" dan "Open in new tab". Item ini tidak ditampilkan.
- Akun, berbagi, kolaborasi.
- Mengubah `/docs/open`, `/execute`, atau respons route lama.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New file | `{name:"My Landing", board:{preset:"desktop"}}` | `{slug:"my-landing", rev:1}`; file + history ada; board 1440×900 | N/A |
| Nama bentrok | `my-landing` sudah ada | slug `my-landing-2` | N/A |
| Nama tidak valid | `{name:"!!!"}` | 400 `SCHEMA_INVALID` | file tidak dibuat |
| Rename saat dibuka agen | sesi agen `activeSlug=a`, rename a→b | sesi pindah ke b; execute berikut menulis ke b | target sudah ada → 409 `CONFLICT` |
| Delete saat dibuka agen | sesi agen aktif di a | file + history hilang; `/execute` agen → `NO_ACTIVE_DOC` | slug tidak ada → 404 |
| Archive/unarchive | a di docs ↔ archive | hilang dari `GET /viewer/docs`, muncul di `GET /viewer/archive` | bentrok nama saat unarchive → 409 |
| Duplicate | a | `a-copy` (atau `-copy-2`), rev 0 history baru "Duplicated from a" | N/A |

</frozen-after-approval>

## Code Map

- `packages/daemon/src/store.ts` -- `DocStore`: tambah `rename`, `remove`, `archive`, `unarchive`, `listArchive`, `exists`. Pakai `#writeAtomic` dan pola fsync yang sudah ada.
- `packages/daemon/src/viewer.ts` -- route `/viewer/*` yang sudah ada. Route tulis baru taruh di file baru `files.ts` dan daftarkan dari `server.ts` (+1 baris), karena butuh `docLocks`, `docs`, dan `sessions` dari `buildServer`.
- `packages/daemon/src/sessions.ts` -- `Session.activeSlug`; tambah helper untuk iterasi sesi.
- `packages/core/src` -- `createDocument()`, `transact()`. Pakai transaksi core untuk menambah board, supaya id, validasi, dan entri history konsisten.
- `packages/viewer/src/{App,Dashboard,api}.tsx/ts` -- routing hash, sidebar, kartu. `api.ts`: tambah metode tulis, dan invalidasi cache list/thumbnail sesudahnya.
- Desain: `design/lakar-ui.pen` (Pencil MCP saja). Layar: "Dashboard — New File", "Dashboard — Context Menu", "Dashboard — Delete Confirm", "Files —", "Archive — Empty —". Komponen Menu Item dan Button.

## Tasks & Acceptance

**Execution:**
- [x] `packages/daemon/src/store.ts`, `files.ts`, `server.ts`, `sessions.ts` + `files.test.ts` -- route dan operasi file, uji seluruh matriks.
- [x] `packages/viewer/src/api.ts`, `App.tsx`, `Dashboard.tsx`, `NewFileDialog.tsx`, `FileMenu.tsx`, `app.css` + test logika murni (slugify, routing) -- UI.

**Acceptance Criteria:**
- Given Dashboard, when klik New file → isi nama → Create file, then viewer terbuka dengan satu board kosong ukuran preset.
- Given kartu file, when Rename/Duplicate/Archive/Delete, then daftar Recents/Files/Archive langsung diperbarui tanpa reload manual.

## Implementation Notes

- Route tulis di `packages/daemon/src/files.ts`. Kunci global `#files` + `docLocks` per slug (urut). `sessions.retarget()` mengalihkan atau mengosongkan `activeSlug`.
- Entri history buatan viewer memakai sessionId `lakar-viewer`. Route history menambah `client:'lakar-viewer'` hanya untuk entri itu (field opsional baru).
- Delete dari arsip: `DELETE /viewer/docs/:slug?archived=true`. Archive slug yang sudah terarsip → 409.
- Risiko diketahui: execute agen yang sudah lolos cek dokumen aktif lalu menunggu kunci saat rename/archive/delete berjalan mendapat 500, bukan `NO_ACTIVE_DOC`. Perbaikannya butuh perubahan `/execute` (dibekukan).
- Diuji di UI nyata (lakard + browser): New file, Duplicate, Rename, Archive, Delete, Files list.

## Spec Change Log

## Review Triage Log

Review gabungan batch 1–4 (spec-app-1..4), tiga reviewer: Blind Hunter (B), Edge Case Hunter (E), Verification Gap (V). Semua temuan yang lolos ber-rute `patch` atau `defer`.

| Temuan | Verdict | Keputusan |
|---|---|---|
| CSRF: route tulis `/viewer/*` tanpa cek Origin (B) | high | patch: guard `onRequest` Origin, 403 lintas-situs |
| `/execute` antre di belakang rename/delete → 500 (V, juga laporan implementer) | medium | patch: cek ulang `docs.get` di dalam kunci → `NO_ACTIVE_DOC` + tes interleaving |
| Restore tanpa penjaga versi basi / restore rev terkini (B, E) | medium | patch: `baseRev` + 409 `CONFLICT` |
| Modal fokus ulang tiap re-render 5 s → ketikan tertimpa (E) | medium | patch: `onClose` via ref, efek sekali |
| Upload gambar lalu sisip saat pratinjau/offline; tanpa indikator (B, E) | medium | patch: cek ulang editable + toast "Uploading image…" |
| Delete/Backspace tanpa undo (B) | medium | patch: toast Undo → restore rev sebelumnya bila ada snapshot |
| Guard event viewer duplikat dari `revChange` (V) | low | patch: `revChange` satu-satunya gerbang |
| "Saved to Downloads" sebelum tersimpan / nama salah (B, E, V) | low | patch: "Download started: <file>" |
| Padding Copy as tidak konsisten (B, E) | low | patch |
| Slug baru mengabaikan arsip → Unarchive 409 (B) | medium | patch: slug arsip dianggap terpakai |
| Komentar header usang/salah tempat (B) | low | patch |
| Event lintas-jendela untuk operasi viewer (B, E, V) | medium | defer (deferred-work.md) |
| Handler unduhan Tauri tanpa tes integrasi (B, V) | medium | defer: smoke manual per OS |
| A11y kontrol bersarang di kartu (B) | low | defer |
| Snapshot tanpa batas byte, blob URL tidak di-revoke (B) | low | defer |
| Delete/rename/archive dokumen yang hanya di memori (B, E, V) | low | defer/ditolak: hanya setelah data dir diubah dari luar |
| Race nama unduhan ganda di `unique_path` (E) | low | ditolak: dua export bernama sama dalam milidetik yang sama |

## Verification

**Commands:**
- `pnpm build && pnpm exec vitest run packages/daemon/src/files.test.ts packages/viewer` -- hijau (Windows: kegagalan fsync lama di luar file ini diabaikan).
