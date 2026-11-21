---
title: 'Aplikasi 7: title bar bertab banyak dokumen + kontrol jendela desktop'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: '81952c86804969be670ebd496537bfce8ab4a724'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/design/README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Title bar viewer hanya punya tab Dashboard + satu tab dokumen aktif; desain "Title Bar" (semua layar Dashboard/Viewer di `design/lakar-ui.pen`) punya banyak tab, tombol "+", dan tombol jendela minimize / maximize-restore / close. Aplikasi desktop masih memakai dekorasi native.

**Approach:** Daftar tab dokumen di App (tersimpan di localStorage), state tampilan per dokumen disimpan di memori agar pindah tab tidak kehilangan kamera/seleksi. Di Tauri: tanpa dekorasi native (Windows/Linux) atau `titleBarStyle: Overlay` (macOS), plus capability remote sempit untuk halaman viewer dari lakard. Kedua tujuan sengaja satu spec (diminta sesi pemanggil).

## Boundaries & Constraints

**Always:**
- Urutan title bar sesuai desain: menu (mobile) · tab Dashboard · tab dokumen (ikon file, nama 600, x) · "+" · spacer (drag region) · tombol jendela 44×32 (minus, copy saat maximized / square saat normal, x). Tinggi 44.
- Tab dokumen: membuka dokumen (klik kartu, Open, hash `#/d/<slug>`) mengaktifkan tabnya bila sudah ada, kalau belum menambah tab di akhir. Close lewat x, klik tengah, atau Ctrl/Cmd+W (tab aktif); menutup tab aktif pindah ke tetangga kanan, lalu kiri, lalu Dashboard.
- "+" membuka NewFileDialog yang ada; file baru terbuka di tab baru.
- Card context menu (non-arsip) punya "Open in new tab" sesudah Open: tab ditambahkan tanpa berpindah halaman.
- Rename dari aplikasi mengganti slug tab (hash ikut bila aktif, tanpa entri history baru); Archive/Delete menutup tabnya.
- Saat mulai, bila `listDocs` berhasil, tab yang slug-nya tidak ada lagi dibuang.
- Pindah tab mempertahankan per dokumen: halaman aktif, node terpilih, tab panel kanan, dan kamera per halaman (memori sesi, bukan localStorage).
- Tombol jendela hanya tampil bila `window.__TAURI__.window` ada; macOS (UA Mac) tidak menampilkannya dan memberi padding kiri 78px untuk traffic lights.
- Close jendela tetap menyembunyikan ke tray (handler `CloseRequested` di main.rs tidak berubah).
- Capability baru: `remote.urls = ["http://127.0.0.1:*"]`, window `main`, izin hanya `core:window:allow-minimize|toggle-maximize|internal-toggle-maximize|close|start-dragging|is-maximized`. Layar mulai lokal (`ui/index.html`) juga mendapat strip judul ber-drag-region dengan tombol yang sama.
- Teks UI Inggris, komentar Indonesia, TypeScript strict.

**Never:**
- Tidak mengubah route daemon atau tool MCP; tidak menambah dependensi npm (`@tauri-apps/api`) ke viewer.
- Tidak menjaga Viewer tersembunyi tetap ter-mount (listener keyboard global akan bentrok).
- Perubahan di `Canvas.tsx`, `Viewer.tsx`, `Dashboard.tsx` hanya sebatas kait state tampilan / plumbing tab.
- Tidak drag-reorder tab, tidak menyinkronkan rename/hapus yang dilakukan agen lewat MCP (Viewer tetap menampilkan status error-nya).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Buka lagi | tab `a` sudah ada, buka `a` | tab `a` aktif, tidak duplikat | N/A |
| Tutup aktif | tabs `[a,b,c]`, aktif `b`, tutup `b` | aktif `c` | tutup `c` terakhir → `b`; satu-satunya → Dashboard |
| Rename | tabs `[a,b]`, rename `a`→`x` | `[x,b]` | target sudah ada di daftar → buang duplikat |
| Reload | localStorage `["a","b"]`, hash `#/d/c` | tabs `[a,b,c]` | JSON rusak/bukan array string → `[]` |
| Browser | tanpa `__TAURI__` | tombol jendela tidak ada | N/A |

</frozen-after-approval>

## Code Map

- `packages/viewer/src/App.tsx` -- kerangka + title bar; `openDoc`/`openDashboard` diekspor. Tempat state tab, "+", Ctrl/Cmd+W.
- `packages/viewer/src/files.ts` -- `parseRoute`, `docHash` (logika murni, dites Node) -- pola untuk `tabs.ts`.
- `packages/viewer/src/FileMenu.tsx` -- item menu (`Item[]`), aksi lewat `api`.
- `packages/viewer/src/api.ts:173` -- `onDocsChanged` tanpa detail; `renameFile/archiveFile/deleteFile` lewat `#write`.
- `packages/viewer/src/NewFileDialog.tsx` -- butuh `taken` (slug aktif + arsip), navigasi ke `docHash` setelah sukses.
- `packages/viewer/src/Viewer.tsx:63-68` -- `pageIndex`, `selectedId`, `tab` state; `Canvas key={page?.id}`.
- `packages/viewer/src/Canvas.tsx:148-193` -- `cam`, `fitted` (auto-fit saat pertama).
- `packages/viewer/src/app.css:46-110` -- gaya `.titlebar`, `.tab*`.
- `apps/desktop/src-tauri/src/main.rs:566` -- `build_main_window` (`WebviewWindowBuilder::from_config`); tes di `mod tests`.
- `apps/desktop/src-tauri/capabilities/default.json`, `apps/desktop/ui/index.html` -- layar mulai lokal.

## Tasks & Acceptance

**Execution:**
- [x] `packages/viewer/src/tabs.ts` + `tabs.test.ts` -- logika murni: `readTabs/serialize`, `openTab`, `closeTab` (→ tabs + slug tujuan), `renameTab`, `pruneTabs`; tes matriks I/O.
- [x] `packages/viewer/src/viewState.ts` -- peta memori per slug (page, selected, panel tab, kamera per page) + `moveViewState` untuk rename.
- [x] `packages/viewer/src/api.ts` -- `onFileEvent` (rename/archive/delete dengan slug) dipancarkan setelah tulis sukses.
- [x] `packages/viewer/src/Tabs.tsx` -- komponen title bar (tab, "+", drag region, `WindowControls` via `__TAURI__`).
- [x] `packages/viewer/src/App.tsx` -- state tab + localStorage, sinkron hash, event file, Ctrl/Cmd+W, NewFileDialog dari "+".
- [x] `packages/viewer/src/FileMenu.tsx` -- "Open in new tab".
- [x] `packages/viewer/src/Viewer.tsx`, `Canvas.tsx` -- inisialisasi/simpan state tampilan dari `viewState`.
- [x] `packages/viewer/src/app.css` -- gaya tab, "+", tombol jendela, padding macOS, scroll tab horizontal.
- [x] `apps/desktop/src-tauri/src/main.rs` -- `apply_chrome(&mut WindowConfig, macos)` (decorations false / Overlay + hiddenTitle + trafficLightPosition) + tes; tes pola remote capability.
- [x] `apps/desktop/src-tauri/capabilities/viewer-window.json`, `default.json`, `ui/index.html` -- capability remote + strip judul layar mulai.

**Acceptance Criteria:**
- Given dua dokumen terbuka di tab, when pengguna memilih node dan zoom di A, pindah ke B, lalu kembali, then seleksi dan kamera A sama seperti sebelumnya.
- Given kartu di Recents, when "Open in new tab", then tab baru muncul dan Dashboard tetap tampil.
- Given aplikasi desktop Windows/Linux, when tombol minimize/maximize/close atau drag/dobel-klik spacer dipakai, then jendela bereaksi dan close menyembunyikan ke tray.

## Implementation Notes

- Komponen title bar bernama `TitleBar.tsx` (bukan `Tabs.tsx`): `Tabs.tsx` dan `tabs.ts` bentrok di sistem file tidak peka huruf besar (Windows/macOS).
- Pruning saat mulai tidak membuang slug yang sedang tampil (Viewer menampilkan error not-found-nya). Menutup tab juga membuang state tampilannya.
- Posisi traffic lights macOS `{x:16, y:15}` (y = tepi atas tombol). Ctrl+W di browser biasa ditangkap browser sebelum halaman; pintasan efektif hanya di aplikasi desktop.

## Review Triage Log

| # | Sumber | Temuan | Verdict | Bukti / rute |
|---|--------|--------|---------|--------------|
| 1 | blind, edge | Listener `onFileEvent` yang throw membuat tulis sukses ditolak | low | Handler App hanya setState/replaceState, tidak terbukti throw; guard menambah cabang → ditolak |
| 2 | blind, edge | Dua jendela browser saling menimpa `lakar.viewer.tabs` | low | Nyata, dampak hanya urutan tab saat reload; perlu listener `storage` → ditolak |
| 3 | blind | Dokumen dihapus agen lewat MCP menyisakan tab mati | false | Intent "Never": sinkron perubahan agen di luar cakupan |
| 4 | blind | Ctrl/Cmd+W ditangkap browser | low | Batasan browser, tidak bisa dicegah; dicatat di Implementation Notes → ditolak |
| 5 | blind, edge | Ctrl/Cmd+W saat mengetik / menu terbuka / auto-repeat | low | Nyata (repeat menutup banyak tab); perbaikan langsung → patch |
| 6 | blind | Linux tanpa border resize | maybe-false | Perlu cek build release Linux → defer |
| 7 | blind | Snap Layouts Windows hilang; padding 78px saat fullscreen macOS | low | Kosmetik, perbaikan butuh API native/cabang baru → ditolak |
| 8 | blind, verif | Capability `http://127.0.0.1:*` mencakup semua port | false | Intent mewajibkan tepat pola ini |
| 9 | blind | Tombol maximize layar mulai tidak berubah ke Restore; `hidden` + `display` redundan | low | Kosmetik di layar sementara; `display:flex` diperlukan karena div default block → ditolak |
| 10 | blind, edge | State tampilan pulihan tidak dicek terhadap dokumen baru | medium | `selectedId` usang memicu Inspect error; `pageIndex` jatuh ke `pages[0]` lewat `??` → patch (seleksi) |
| 11 | blind, verif | `viewState.ts` tanpa tes | medium | Tidak ada tes mengimpor modul (verification-gap) → patch |
| 12 | blind, verif | Penanganan FileEvent di App tanpa tes | medium | Cabang `archive \|\| !archived` tak teruji (verification-gap) → patch (helper murni `applyFileEvent`) |
| 13 | blind | Siklus impor FileMenu → App | low | Nyata, perbaikan pindah modul sederhana → patch |
| 14 | blind | Aturan `.tab` / `.tab.doc` terpecah di app.css | low | Penggabungan langsung → patch |
| 15 | blind | Celah antar tab bukan drag region | low | Atribut di `nav` → patch |
| 16 | edge | Back setelah menutup tab membuka lagi tab itu | low | Perilaku mirip browser, entri tab aktif diganti; jarang → ditolak |
| 17 | edge | Prune saat mulai membuang tab yang ditambah sebelum respons `listDocs` | low | Hanya file yang dibuat dalam jendela milidetik itu → ditolak |
| 18 | edge | Dokumen arsip dibuka via hash lalu dihapus dari Archive, tab tersisa | low | Jalur langka, Viewer menampilkan error → ditolak |
| 19 | edge | `__TAURI__` tidak ada di halaman remote → jendela tanpa kontrol | maybe-false | Dampak tinggi bila benar; perlu build release → defer |
| 20 | edge | Spec menyebut `Tabs.tsx` | false | Perbaikannya mengedit spec; dicatat di Implementation Notes |

## Verification

**Commands:**
- `pnpm test` -- hijau (termasuk `tabs.test.ts`).
- `pnpm build` -- tsc + vite sukses.
- CI `desktop-check.yml` -- clippy `-D warnings` dan `cargo test` hijau.

**Manual checks:**
- Browser: buka beberapa dokumen, pindah tab, tutup via x/klik tengah, reload, rename/archive dari Dashboard.
