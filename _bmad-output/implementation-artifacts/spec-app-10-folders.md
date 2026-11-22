---
title: 'Aplikasi 10: folder di Dashboard'
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

**Problem:** Halaman Files hanya daftar datar. Desain 02 ("Files — Light/Dark": baris "Folders" berisi komponen Folder Item, lalu "Files"; "Dashboard — Context Menu": item "Move to…") belum ada di aplikasi, jadi file tidak bisa dikelompokkan.

**Approach:**
- Folder = metadata viewer di `<dataDir>/folders.json` (tulis atomik), bukan direktori: slug, path file, `/docs/open`, dan tool MCP tidak berubah.
- Route baru `/viewer/folders*` (di belakang guard Origin yang ada): daftar, buat, rename, hapus folder, pindahkan file. Route kelola file lama menjaga keanggotaan: rename → tetap di folder dengan slug baru; archive/delete → keluar folder; duplicate → salinan ke folder yang sama; unarchive → root.
- Viewer: `#/files` menampilkan bagian "Folders" (Folder Item) lalu "Files" (hanya file di root); `#/files/<id>` membuka folder dengan breadcrumb `Files › <nama>`. Tombol "New folder", menu folder (Open, Rename, Delete), "Move to…" di context menu file (pemilih: "Files" root + folder), seret kartu/baris ke folder atau ke breadcrumb "Files".

**Keputusan (dari brief sesi induk):** hapus folder selalu boleh, sesudah konfirmasi; file di dalamnya kembali ke root (tidak ada file yang dihapus). Tab "All files / Drafts / Shared with me" dan Sort tidak dikerjakan (tanpa akun/berbagi).

## Boundaries & Constraints

**Always:**
- Teks UI bahasa Inggris. Folder Item mengikuti desain: 56px tinggi, ikon folder di kotak 32px, nama 13/500, meta 12 (`Empty`, `1 file`, `N files`), tombol "…". Label bagian "Folders"/"Files" 12/600, letter-spacing 0.3, warna sekunder. "Move to…" ikon folder-input, di antara "Copy link" dan "Move to Archive".
- Id folder stabil acak (`f` + 10 karakter [a-z0-9]); rename tidak mengubah URL. Nama: dipangkas, 1–60 karakter, unik tanpa peka huruf besar → bentrok `CONFLICT`.
- Keanggotaan: satu slug paling banyak satu folder. `GET` hanya mengembalikan keanggotaan slug aktif yang ada (memori atau disk).
- File baru dari dialog New file di halaman folder masuk ke folder itu. Recents dan Search tetap menampilkan semua file.
- `folders.json` rusak → dipindah ke `folders.json.corrupt-<ms>`, lanjut kosong, dicatat log. Gagal menulis keanggotaan saat operasi file lama tidak menggagalkan operasi itu (dicatat log).

**Never:**
- Tidak mengubah bentuk respons/perilaku route lama dan tool MCP; tidak membuat direktori folder di disk.
- Tidak mengedit `Canvas.tsx`, `Viewer.tsx`, `apps/desktop`; `App.tsx` hanya prop folder ke Dashboard + judul tab. Tanpa dependensi baru.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Buat | `POST /viewer/folders {name:" Client work "}` | `{folder:{id,name:"Client work",createdAt}}` | nama kosong/ >60 → 400; sama (beda huruf) → 409 |
| Pindah | `POST /viewer/folders/move {slug:"a", folder:id}` lalu `folder:null` | `a` masuk folder lalu kembali ke root | slug tidak ada → 404; folder tidak ada → 404 |
| Rename file | `a` di folder F, rename → `b` | `b` di F, `a` tidak ada | N/A |
| Archive/Delete | `a` di F | `a` keluar F; unarchive → root | N/A |
| Duplicate | `a` di F | `a-copy` di F | N/A |
| Hapus folder | F berisi 2 file | F hilang, kedua file di root, file utuh | id tidak ada → 404 |
| Rename folder | `POST /viewer/folders/:id/rename {name}` | nama baru, id sama | bentrok → 409 |
| Route tidak dikenal | `#/files/zzz` | empty state "Folder not found" + tautan ke Files | N/A |
| File rusak | `folders.json` bukan JSON | daftar kosong, file lama disimpan `.corrupt-*` | log |
| Origin asing | POST folder dengan Origin lain | 403 | guard yang ada |

</frozen-after-approval>

## Code Map

- `packages/daemon/src/folders.ts` (baru) -- `FolderStore`: cache memori + antrean serial sendiri (tidak memakai `docLocks`, jadi tidak ada urutan kunci baru), `load/list/create/rename/remove/move/onRenamed/onRemoved/onDuplicated`, tulis lewat `writeFileAtomic` (`assets.ts`, tanpa fsync → aman di Windows).
- `packages/daemon/src/files.ts` -- `registerFileRoutes`: buat `FolderStore` dari `dataDir`; route `GET/POST /viewer/folders`, `POST /viewer/folders/:id/rename`, `DELETE /viewer/folders/:id`, `POST /viewer/folders/move` (memegang kunci slug lewat `locked` lalu `mustExist`). Kait di rename/duplicate/archive/unarchive/delete sesudah operasi disk sukses (best-effort + `log`).
- `packages/daemon/src/server.ts` -- guard Origin `/viewer/*` sudah mencakup route baru; tidak diubah.
- `packages/viewer/src/files.ts` -- `Route` `files` + `folder?`; `parseRoute('#/files/<id>')`; `folderHash`; helper murni `folderMeta(n)`, `inFolder(docs, membership, folder|null)`.
- `packages/viewer/src/api.ts` -- tipe `Folder`, `FolderState`; `listFolders/createFolder/renameFolder/deleteFolder/moveToFolder` lewat `#write` (memanggil pendengar `onDocsChanged`).
- `packages/viewer/src/Folders.tsx` (baru) -- `FolderItem`, `FolderMenu` (Open/Rename/Delete + dialog), `FolderNameDialog` (New/Rename), `MoveToDialog`.
- `packages/viewer/src/FileMenu.tsx` -- item "Move to…" (fase `move`), prop `folders`/`folderOf`.
- `packages/viewer/src/Dashboard.tsx` -- prop `folder`; muat folder di halaman Files; bagian Folders/Files, breadcrumb, New folder, drag & drop.
- `packages/viewer/src/NewFileDialog.tsx` -- prop opsional `folder`: sesudah dibuat, `moveToFolder`.
- `packages/viewer/src/App.tsx` -- teruskan `route.folder`.
- `packages/viewer/src/icons.tsx` -- ikon `folder`, `folderInput`, `folderPlus`.
- `packages/viewer/src/app.css` -- blok baru `.folder-*`, `.breadcrumb`, `.section-label`, `.drop-target` di akhir file.

## Tasks & Acceptance

**Execution:**
- [x] `packages/daemon/src/folders.ts` -- FolderStore + validasi -- metadata terpisah dari dokumen.
- [x] `packages/daemon/src/files.ts` -- route folder + kait operasi file -- konsistensi keanggotaan.
- [x] `packages/daemon/src/folders.test.ts` -- seluruh matriks I/O daemon, termasuk file rusak dan restart (muat ulang dari disk).
- [x] `packages/viewer/src/files.ts` + `files.test.ts` -- route + helper murni dan tesnya.
- [x] `packages/viewer/src/api.ts` -- klien folder.
- [x] `packages/viewer/src/Folders.tsx`, `FileMenu.tsx`, `Dashboard.tsx`, `NewFileDialog.tsx`, `App.tsx`, `icons.tsx`, `app.css` -- UI.

**Acceptance Criteria:**
- Given daemon dimulai ulang, when `GET /viewer/folders`, then folder dan keanggotaan yang sama kembali.
- Given file di folder F, when agen memanggil `/docs/open` dengan slug itu, then dokumen yang sama terbuka (path tidak berubah).
- Given halaman Files, when kartu diseret ke Folder Item, then file pindah ke folder dan hilang dari root.
- Given halaman folder, when "Move to…" → "Files", then file kembali ke root dan hilang dari halaman folder.

## Implementation Notes

- Persetujuan spec: sesi ini dijalankan oleh sesi induk dengan brief lengkap (cakupan, penyimpanan, keputusan hapus); checkpoint dianggap disetujui oleh brief tersebut.

## Spec Change Log

## Review Triage Log

| # | Sumber | Temuan | Verdict | Bukti / rute |
|---|--------|--------|---------|--------------|
| 1 | blind, edge, vgap | onRenamed/onDuplicated tidak membersihkan keanggotaan basi slug tujuan | medium | `from` di root → `membership[to]` lama tetap; patch |
| 2 | edge | slug `constructor` membaca properti Object.prototype dari objek membership (daemon + viewer) | medium | `inFolder` mengembalikan fungsi ≠ null → file hilang dari root; patch |
| 3 | blind, edge | rename `.corrupt` gagal → save berikut menimpa file rusak | low | jalur `catch` lanjut kosong; patch (copyFile, lalu lempar) |
| 4 | edge | baca folders.json non-ENOENT → 500 | false | gagal keras yang terlihat adalah perilaku benar |
| 5 | blind, edge | `moved` di DELETE folder memuat slug yang tidak ada | low | `remove` tidak memfilter; patch (filter `taken`) |
| 6 | edge | kunci membership tidak divalidasi saat decode | low | slug sembarang sampai ke `store.exists`; patch |
| 7 | blind, edge | gagal muat folder di `#/files/<id>` → "Folder not found" | medium | `setFolderState(s ?? NO_FOLDERS)` → folderMissing; patch |
| 8 | edge | judul tab tetap nama folder yang dihapus dari jendela lain | low | efek keluar lebih awal; patch |
| 9 | blind, edge | MoveToDialog: listbox/option tanpa navigasi panah; autofocus indeks hilang | low | patch |
| 10 | blind | menu folder di header menawarkan Open | low | patch; F2/Del di Folder Item ditolak (bukan bagian intent) |
| 11 | edge | DELETE arsip tanpa kait folder | low | patch |
| 12 | vgap | kait create/unarchive tidak teruji pada kasus yang dituju | medium | patch (tes keanggotaan basi) |
| 13 | vgap | metode folder api.ts tanpa tes kontrak | medium | patch |
| 14 | blind | `folderOf()`/`load()` tidak dipakai | low | patch (hapus) |
| 15 | blind | path mesin pribadi di Verification spec | low | patch (catatan generik) |
| 16 | blind | filter di halaman Files hanya file root | false | filter berlaku pada tampilan saat ini; Search dropdown mencakup semua file sesuai intent |
| 17 | blind | NewFileDialog menelan gagal masuk folder | low | ditolak: jarang, dialog langsung membuka viewer sehingga notice hilang; perbaikan menambah alur |
| 18 | blind | tanpa toast/Undo saat memindah | false | bukan bagian intent; file terlihat di folder tujuan |
| 19 | blind | `.max(200)` vs batas 60 | low | ditolak: pesan berbeda saja, batas tetap ditegakkan |
| 20 | blind | `setTimeout(0)` untuk judul | false | bekerja; App tidak tahu nama folder |
| 21 | vgap, edge | `/docs/open` agen tidak membersihkan keanggotaan basi | maybe-false | defer (route agen dibekukan) |
| 22 | vgap | alur UI hanya manual | medium | defer (tanpa setelan tes komponen) |
| 23 | blind | `setup()` tidak di-close di tes | false | pola sama dengan files.test.ts; tmp dihapus afterAll |

## Verification

**Commands:**
- `npx tsc -b && npx tsc -p tsconfig.test.json --noEmit` (root) -- tanpa error
- `npx vitest run packages/daemon/src/folders.test.ts packages/daemon/src/files.test.ts packages/viewer/src` (root) -- lulus
- Windows: daemon tests that commit can fail with EPERM fsync; Linux CI is the reference.

**Manual checks (if no CLI):**
- Browser `http://127.0.0.1:7466/app/#/files`: bandingkan dengan "Files — Light/Dark"; buat/rename/hapus folder, Move to…, seret kartu, breadcrumb.
