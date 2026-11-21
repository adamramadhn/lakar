---
title: 'Aplikasi 8: kelola halaman di viewer'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: '729baa0386ac93f11968f8cb0970150fef973e2b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/design/README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Halaman dokumen hanya bisa dilihat dan dipilih di viewer; tidak ada cara menambah, mengganti nama, menghapus, atau mengurutkan halaman, dan sandbox `/execute` tidak punya operasi halaman. Desain "03 · Viewer" punya "+" di header Pages dan komponen Page Row (default/active).

**Approach:** Route tulis viewer baru `/viewer/docs/:slug/pages…` di daemon (file baru `pages.ts`) meng-commit lewat jalur yang sama dengan Restore (`docLocks` → `store.commit` → `docs`, riwayat atas nama sesi viewer, event aktivitas), sehingga History, snapshot, dan Restore tetap berlaku. Viewer mendapat `PagesPanel.tsx`. Sandbox agen tidak berubah, kecuali `add(pageId, board)` diterima core supaya board baru dari viewer masuk ke halaman aktif.

## Boundaries & Constraints

**Always:**
- **Route** (semua `POST`/`DELETE`, dijaga Origin guard `/viewer/*` yang ada; respons AD-11 `{ok, data:{slug, rev, pageId}}`):
  - `POST /viewer/docs/:slug/pages` `{name?}` → halaman baru di akhir; nama default "Page N" (N mulai dari jumlah halaman + 1, naik sampai nama belum dipakai).
  - `POST /viewer/docs/:slug/pages/:pageId/rename` `{name}` → nama di-trim, 1–100 karakter.
  - `POST /viewer/docs/:slug/pages/:pageId/move` `{index}` → pindah ke indeks 0..n-1 (indeks sama → tanpa rev baru, `rev` tetap).
  - `DELETE /viewer/docs/:slug/pages/:pageId` → hapus beserta board-nya; halaman terakhir → `CONFLICT`.
- Setiap operasi: rev+1, satu entri riwayat (`Added page "Page 2"`, `Renamed page to "X"`, `Moved page "X"`, `Deleted page "X"`, opsSummary `pages`), snapshot seperti commit lain, event aktivitas `tool:'pages'` dari `lakar-viewer` (viewer lain memuat ulang; tidak tampil di Activity, sama seperti Restore).
- ID halaman baru dari `IdAllocator.forDocument` (unik terhadap node dan halaman).
- **Viewer** (Pages section saja):
  - Header "Pages" + tombol "+" (ikon plus 13px) → tambah halaman, halaman baru jadi aktif.
  - Page Row: default = ikon `file`; active = latar `--surface-hover`, ikon `check`, teks primer.
  - Double-click atau menu konteks "Rename" → edit inline (Enter/blur simpan, Escape batal, kosong = batal).
  - Menu konteks (klik kanan): Rename, Move up, Move down, Delete (danger; nonaktif pada halaman terakhir yang tersisa, title "A file needs at least one page").
  - Delete → dialog konfirmasi ("Delete “X”?", jumlah board, "You can undo this from History.").
  - Drag baris untuk mengurutkan; garis penanda posisi jatuh.
  - Halaman aktif dilacak per ID: tetap sama setelah reorder/rename oleh siapa pun; dihapus → tetangga (sebelumnya, atau berikutnya).
  - Semua aksi tulis nonaktif saat pratinjau versi dan offline; gagal → toast yang ada.
- Board baru dari viewer (tool Frame di kanvas kosong, menu "+" Layers tanpa board) masuk ke halaman aktif: kode `add(<pageId>, {...board})`; posisi tanpa klik = kanan board terakhir halaman itu + 80, atau (0,0) bila kosong.
- Agen: `add(null)`, `children(null)`, `place` tetap memakai halaman pertama. Viewer mengikuti agen ke halaman board yang disentuh (perilaku Follow yang ada).
- Teks UI Inggris; spec dan komentar Indonesia.

**Never:**
- Mengubah perilaku atau dokumentasi `/execute` dan tool MCP yang ada (ID halaman tidak pernah terlihat agen, jadi `add(pageId)` tidak mengubah perilaku yang mungkin dipakai agen).
- Duplicate page, memindah board antarhalaman, undo selain lewat History.
- Mengubah layout Viewer di luar section Pages.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tambah | dok 1 halaman | "Page 2" di akhir, rev+1, aktif di viewer | N/A |
| Nama default bentrok | halaman "Page 1", "Page 3" | N mulai dari jumlah+1 (=3), "Page 3" terpakai → "Page 4" | N/A |
| Rename | `{name:"  Home "}` | nama "Home" | kosong / > 100 → 400 `SCHEMA_INVALID` |
| Move | 3 halaman, pindah idx 2 → 0 | urutan baru, rev+1 | indeks di luar 0..n-1 → 400 |
| Delete | halaman berisi 2 board | halaman + board hilang, rev+1 | halaman terakhir → 409 `CONFLICT` |
| ID tidak ada | pageId asing | — | 404 `NOT_FOUND` |
| Dokumen tidak ada | slug asing | — | 404 `NOT_FOUND` |
| Undo | Restore rev sebelum hapus | halaman dan board kembali | N/A |
| Board baru di halaman 2 | tool Frame di kanvas kosong | board di halaman 2, bukan halaman 1 | N/A |

</frozen-after-approval>

## Code Map

- `packages/daemon/src/files.ts` -- pola acuan: `restore` (:~290) — kunci `docLocks.run(slug)`, `docs.get ?? store.read`, `store.commit(slug, next, historyEntry)`, `docs.set`, event `ActivityCall` running→done/error. Jangan diubah (sesi folder juga menyentuh file ini); `historyEntry` disalin/diekspor seperlunya.
- Baru `packages/daemon/src/pages.ts` -- `registerPageRoutes(app, {docs, store, docLocks, activity})`; didaftarkan di `server.ts` tepat sesudah `registerFileRoutes` (:669). Test baru `pages.test.ts` (pola `setup()` dari `files.test.ts`).
- `packages/core/src/transaction.ts` -- `add` (:199): `parentId` yang cocok dengan ID halaman → board ditambahkan ke halaman itu (selain board → `SCHEMA_INVALID`). Test di `transaction.test.ts`.
- `packages/viewer/src/activity.ts` -- `isDocChangeFromViewer` (:57) dan label (:189) ikut `pages`.
- `packages/viewer/src/api.ts` -- `addPage/renamePage/movePage/deletePage` lewat `#write` (pola `restore` :296).
- `packages/viewer/src/codegen.ts` -- `insertBoardAt/insertBoardPlaced` menerima `pageId` opsional + posisi.
- Baru `packages/viewer/src/PagesPanel.tsx` -- header, baris, inline rename, menu (`Menu` dari FileMenu.tsx), dialog hapus (`Modal`), drag.
- `packages/viewer/src/Viewer.tsx` -- ganti blok `.pages` (:523-533) dengan `<PagesPanel>`; `pageIndex` → dilacak per ID halaman (state `pageIndex` tetap untuk viewState).
- `packages/viewer/src/icons.tsx` -- ikon `check`, `arrowUp`, `arrowDown`.
- `packages/viewer/src/app.css` -- gaya header Pages, rename input, drop indicator (dekat `.pages` :990).

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/transaction.ts` + test -- `add(pageId, board)`.
- [x] `packages/daemon/src/pages.ts`, `server.ts`, `pages.test.ts` -- empat route + matriks I/O + Restore mengembalikan halaman.
- [x] `packages/viewer/src/{api,activity,codegen,icons}.ts(x)` + test -- klien, label, codegen pageId.
- [x] `packages/viewer/src/PagesPanel.tsx`, `Viewer.tsx`, `app.css` -- UI dan pelacakan halaman aktif.

**Acceptance Criteria:**
- Given viewer dokumen 1 halaman, when klik "+" di Pages, then "Page 2" muncul aktif dengan kanvas kosong dan entri History "Added page" tercatat.
- Given dua viewer membuka dokumen yang sama, when satu mengurutkan halaman, then viewer lain memuat ulang dan tetap di halaman yang sama (per ID).
- Given halaman 2 aktif, when tool Frame diklik di kanvas kosong, then board baru ada di halaman 2.

## Implementation Notes

- Helper murni viewer: `packages/viewer/src/pages.ts` (`resolvePageIndex`, `dropTarget`); target sisipan board (`canvasInsertTarget`, `menuInsertTarget`) di `codegen.ts` supaya teruji tanpa harness komponen.
- `historyEntry` disalin ke `pages.ts` agar `files.ts` (disentuh sesi folder) tidak berubah.
- Rename ke nama yang sama dan move ke indeks yang sama: tanpa rev baru.
- Menu "+" Layers tanpa board kini menaruh board di (0,0) halaman aktif (bukan `place()`, yang hanya melihat halaman pertama).

## Spec Change Log

## Review Triage Log

| # | Sumber | Temuan | Verdict | Bukti / rute |
|---|--------|--------|---------|--------------|
| 1 | edge, blind | move/delete tanpa `baseRev`: indeks/hapus dari daftar usang | low (ditolak) | Aplikasi lokal satu pengguna; agen tidak bisa mengubah urutan halaman; hasilnya bisa dibatalkan lewat History. Perbaikan menambah parameter route. |
| 2 | blind | jumlah board di dialog hapus beku | low (ditolak) | Sama dengan #1; hapus bisa di-Restore. |
| 3 | edge, blind | dialog hapus tetap aktif saat pratinjau/offline | low → patch | Efek `!editable` tidak mengosongkan `deleteAsk`; perbaikan langsung. |
| 4 | edge | drag memakai indeks asal; reload di tengah drag memindah halaman salah | low → patch | Simpan ID halaman, cari indeks saat drop. |
| 5 | edge, blind | `pendingPage` macet bila muat ulang gagal / halaman tidak pernah muncul | low (ditolak) | Pulih sendiri saat muat ulang berikutnya (reconnect/visibility); skenario jarang, perbaikan menambah cabang. |
| 6 | edge, blind, vgap | `nextBoardPosition` bisa tumpang tindih (bukan `place()`) | false | `onMenuInsert` hanya memakai jalur ini saat halaman tanpa board → selalu (0,0). |
| 7 | vgap | tidak ada test bahwa sisipan board membawa `pageId` halaman aktif | medium → patch | Helper murni + test. |
| 8 | vgap, blind | pelacakan halaman aktif di Viewer.tsx tanpa test | medium → defer | Butuh harness komponen React yang belum ada; diperiksa manual di browser. |
| 9 | blind | agen tidak bisa menjangkau halaman selain pertama | low (ditolak) | Disengaja oleh intent (Never: `/execute`/MCP tidak berubah); dicatat di Boundaries. Dicatat juga di deferred-work sebagai tindak lanjut produk. |
| 10 | blind | rename ke nama sama membuat rev baru | low → patch | Tidak konsisten dengan move indeks sama; perbaikan langsung (`mutation: null`). |
| 11 | blind | lompat halaman setelah keluar pratinjau | low (ditolak) | Hanya saat memilih halaman yang sudah dihapus di pratinjau; jatuh ke tetangga, tidak merusak data. |
| 12 | blind | path lokal di spec | low (ditolak — perbaikan = edit spec) | Baris lingkungan dihapus sebelum commit sebagai housekeeping. |
| 13 | blind | aksesibilitas keyboard reorder, data drag `text/plain` | low (ditolak) | Move up/down tersedia lewat menu konteks (tombol ContextMenu/Shift+F10 memicu `contextmenu`). |
| 14 | blind | nama dengan newline/duplikat | low (ditolak) | Input rename satu baris; nama duplikat sah (sama seperti nama board). |
| 15 | blind | muat ulang ganda sesudah operasi halaman | false | Event viewer sendiri memakai `loadDoc(true)` (onlyIfChanged): rev sama → tanpa perubahan state. |
| 16 | blind | celah test daemon (404 move, `.strict()`, opsSummary) | low (ditolak) | Jalur bersama `run`/`pageIndexOf` sudah teruji lewat rename/delete. |

## Verification

**Commands:**
- `pnpm build && pnpm exec vitest run packages/core packages/viewer packages/daemon/src/pages.test.ts` -- hijau (daemon commit test di Linux CI).
- `pnpm typecheck && pnpm lint` (bila ada) -- hijau.

**Manual checks:**
- Browser: tambah/rename/hapus/urut halaman di `/app/`, bandingkan dengan Pages section desain 03.
