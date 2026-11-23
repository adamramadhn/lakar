# Eksplorasi desain UI Lakar (B: viewer)

Status: eksplorasi visual, belum spesifikasi final. Bahan masukan untuk `bmad-ux` epic B setelah G1 lulus (initiative-lakar §Notes, open question spesifikasi UX B).
Dibuat 2026-11-21 di Pencil (pen.dev) lewat MCP.

## File

- `lakar-ui.pen`: dokumen desain. Buka di aplikasi Pencil. File ini terenkripsi, jadi akses hanya lewat Pencil atau MCP pencil.
- `shimmer.glsl`, `pulse.glsl`: shader untuk animasi live di canvas Pencil. Harus berada di folder yang sama dengan `.pen`.
- Prototype animasi (HTML, privat): https://claude.ai/artifact/HVWWXrmpWXKMzKuqdrzjsb

Catatan: `lakar-ui.pen` adalah salinan snapshot dari `untitled.pen` di folder dokumen Pencil. Lanjutkan pekerjaan dari salinan ini supaya tidak ada dua versi.

## Model produk

- Lakar UI tidak punya kotak prompt. Agen di harness terpisah (Claude Code, Codex, atau klien ACP lain) mendesain lewat tool MCP `lakar`.
- Viewer menampilkan hasil, aktivitas tool call yang masuk secara live, temuan `layout_check`, dan riwayat perubahan.
- **Sejak 2026-11-21, pengguna juga bisa bekerja langsung dari aplikasi:**
  - Membuat file baru: tombol **New file**, lalu dialog nama dan board awal (Desktop 1440×900, Tablet 768×1024, Mobile 375×812, Custom).
  - Mengelola file: rename, duplicate, archive, delete.
  - Export, dan Copy as CSS/Tailwind/JSON.
  - Restore atau Compare riwayat.
  - Menambah layer manual: tool Frame, Rectangle, Ellipse, Text, Image, Icon, dan menu "+" di Layers.
- Edit komponen atau variabel (D), kolaborasi, berbagi, dan akun tetap di luar cakupan. Aplikasi hanya lokal untuk satu pengguna.
- Indikator status koneksi agen di header sengaja tidak dipakai. Koneksi hanya terlihat di halaman Connections dan di banner saat `lakard` offline.

## Struktur dokumen

| Bagian | Isi |
|---|---|
| 00 · Components | Library komponen (lihat di bawah) |
| 01 · Dashboard — Recents | Grid dan list. Desktop 1440, tablet 768, mobile 375, plus menu drawer mobile |
| 02 · Dashboard — Pages & states | Files, Archive kosong, Recents first-run, Settings, Connections, context menu, konfirmasi delete, dialog New file, search (ada hasil / tidak ada hasil, dengan aksi New file), offline, loading. Desktop, tablet, mobile |
| 03 · Viewer | Activity, Inspect, Checks, History, Waiting, Offline, Error, Export, Add layer (menu), New File (board kosong). Desktop 1440, tablet 1024 lanskap, mobile 375 |
| 04 · Agent presence & motion | Storyboard 4 langkah, state baris layer, tabel spesifikasi motion, aturan reduced motion |
| 11 · Editor ergonomics & import | Smart guide, pengukur jarak Alt+hover, menu zoom, Wrap di auto layout, Copy as PNG, impor dari URL, DTCG di panel Theme, Settings → Updates dan banner update (lihat [Section 11](#section-11--editor-ergonomics--import)) |

Setiap layar punya versi dark dan light yang disusun sejajar atas-bawah.

## Layar Viewer (inti)

- **Canvas:** kontrol Select, Hand, tool sisip (Frame, Rectangle, Ellipse, Text, Image, Icon), zoom, Fit, dan tombol Export.
- **Panel kiri:** Pages dan Layers. Header Layers punya tombol "+" untuk menu tambah layer.
- **Panel kanan, tab:**
  - **Activity:** sesi per harness (Live, Idle, Disconnected) dan daftar tool call (running, done, warning/error) dengan nama tool, durasi, dan jumlah node.
  - **Inspect:** properti node terpilih yang hanya bisa dibaca, plus Copy as CSS/Tailwind/JSON.
  - **Checks:** jumlah error, warning, dan aturan yang lolos, plus kartu temuan berisi ID LC dan node terkait.
  - **History:** timeline per hari, sebelum/sesudah, Compare, Restore, dan banner pratinjau versi.
- **Kondisi khusus:**
  - **Waiting:** dokumen terbuka tapi belum ada board.
  - **Offline:** `lakard` tidak bisa dihubungi. Ada banner, perintah restart, dan Retry.
  - **Error:** `execute` gagal dan perubahan di-rollback, sementara agen kedua bekerja di saat yang sama.
- **Mobile:** canvas di atas, bottom sheet berisi tab Activity, Inspect, Checks, dan History.

## Komponen (bagian 00)

- **Kontrol:** Button (primary, secondary), Icon Button, Avatar, Badge, Field, View Toggle (grid, list), Input, Empty State, Folder Item.
- **Navigasi dan menu:** Nav Item (default, active), Menu Item (default, hover, danger).
- **File:** File Card (default, hover; badge Live), List Row, List Row Compact, Thumbnail mini/large.
- **Editor dan Viewer:** Layer Row (default, selected, agent), Page Row, Panel Tab, Tool Button, Section Header, Role Select, Tool Call Row (done, running, warning).
- **Agent presence:** Agent Cursor (working, idle).

## Token warna

Variabel tema `mode: dark | light`: `bg`, `titlebar`, `sidebar`, `surface`, `surface-hover`, `canvas`, `input`, `border`, `text-primary`, `text-secondary`, `text-muted`, `btn-bg`, `btn-text`, `modal`, `scrim`, `thumb`, `gallery`.

Warna semantik:

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `accent` | #3B82F6 | Seleksi oleh pengguna |
| `agent` | #F97316 | Aktivitas agen pertama |
| `codex` | #0EA5E9 | Agen kedua |
| `success` | — | Status berhasil |
| `warning` | — | Status warning |
| `danger` | — | Status error |
| `danger-soft`, `agent-soft`, `accent-soft` | — | Latar lembut untuk ketiga status di atas |

Font: Inter untuk UI, JetBrains Mono untuk nama tool, kode, dan nilai.

## Motion

| Elemen | Animasi | Durasi | Easing |
|---|---|---|---|
| Cursor agen | Meluncur ke node target | 400ms | ease-out |
| Garis tepi node | Berdenyut | 1.6s loop | — |
| Skeleton | Shimmer | 1.2s loop | linear |
| Node baru | Fade dan naik 8px, jeda 40ms antar elemen | 180ms | — |
| Highlight "Just changed" | Memudar | 1.5s | — |
| Kamera "Follow agent" | Bergeser ke area yang berubah | 500ms | — |

Untuk `prefers-reduced-motion`: cursor melompat langsung, skeleton diam, garis tepi solid, dan kamera tidak bergeser.

Di Pencil, shimmer dan denyut berjalan live lewat shader `@time`. Gerakan berurutan (cursor meluncur, node muncul bertahap, kamera) hanya ada di prototype HTML.

## Section 11 · Editor ergonomics & import

Desain story 8.1 epic `epic-adopsi-open-pencil` (2026-11-23), dasar UI story 8.5–8.10. Desain disetujui atas delegasi Fatmuh (terima jadi, 2026-11-23).

Section `iYLJg`, header `mfCQ7`. Baris Components `prQlr` (sheet dark `g6Mfg`, sheet light `eeKks`), baris Dark `oolM4` (layar di `Zrkzx`), baris Light `fLgUo` (layar di `klCN3`). Semua layar desktop 1440×900. Versi light adalah salinan versi dark dengan `theme.mode = light`.

| Layar | Dark | Light | Story |
|---|---|---|---|
| Canvas — Smart guides · Snapping | `GFDrS` | `Pv7gD` | 8.5 |
| Canvas — Alt+hover distance | `JtQT2` | `Qyk7D` | 8.5 |
| Canvas — Zoom menu | `j9OTVN` | `gNXNe` | 8.5 |
| Design — Auto layout · Wrap | `UroZX` | `hs3ew` | 8.6 |
| Canvas — Context menu · Copy as PNG | `rlBaX` | `GXHgL` | 8.7 |
| Import from URL — Form | `bh4AW` | `hTNuW` | 8.8 |
| Import from URL — Importing | `wrh3d` | `AUXAh` | 8.8 |
| Import from URL — Error | `E4CtvM` | `Y5RKo` | 8.8 |
| Theme — Import menu · DTCG | `t5wwvB` | `m8IeW` | 8.9 |
| Theme — Export menu · DTCG | `Rsz7g` | `GDIh3` | 8.9 |
| Theme — DTCG import report | `AXMO0` | `O01BK` | 8.9 |
| Settings — Updates · Up to date | `ORtUr` | `BjQ0J` | 8.10 |
| Settings — Updates · Update available | `H81KwZ` | `Zi1oA` | 8.10 |
| Settings — Updates · Check failed | `v2Ckpl` | `Ze114` | 8.10 |
| Recents — Update installed banner | `DZkuy` | `XNpid` | 8.10 |

Komponen baru (sheet `g6Mfg`): **Distance Label** `e3Dob` dan **Smart Guide** `ighoH` (reusable), Toast "Copied as PNG" `fZ2Go` dan "Couldn't copy as PNG" `K8Mi4` (instance Toast), serta menu entry point `NKSOy` (Import from URL…, Copy as PNG, Zoom to selection).

Keputusan desain:

- **Smart guide dan pengukur jarak** memakai token `danger` (merah), terpisah dari seleksi `accent` dan aktivitas `agent`. Guide menandai tepi dan tengah dengan titik snap (×). Badge posisi menampilkan nilai bulat yang akan di-commit (`X 32 · Y 26`). Petunjuk di bawah canvas menyebut target snap dan "Hold Ctrl to move freely". Resize memakai guide yang sama untuk tepi yang ditarik.
- **Alt+hover:** layer yang di-hover diberi garis tepi `danger`. Jarak dari seleksi ke layer itu tampil sebagai garis ukur dengan Distance Label, dan sisi yang tidak bertumpuk diberi garis bantu putus-putus.
- **Zoom:** indikator zoom di View Controls membuka menu Zoom in (Ctrl +), Zoom out (Ctrl −), Zoom to 100% (Shift+0), Zoom to fit (Shift+1), Zoom to selection (Shift+2), dan toggle Snap to layers.
- **Wrap:** grup Auto layout mendapat baris Segmented "No wrap / Wrap". Saat Wrap aktif, Gap menjadi jarak antar kolom dan Field "Row gap" muncul di sebelahnya. Padding pindah ke baris sendiri. Di canvas, penanda "Row gap 14" tampil di antara dua baris.
- **Copy as PNG** ada di context menu layer (Ctrl+Shift+C), di bawah Duplicate dan bersebelahan dengan Copy as CSS. Hasilnya berupa Toast: berhasil (2x, ukuran piksel) atau gagal (Try again / Dismiss).
- **Import from URL** dibuka dari menu "+" di Layers dan context menu canvas (Ctrl+Shift+I). Dialog punya tiga state:
  - Form: alamat, preset lebar Desktop 1440 / Tablet 768 / Mobile 375, tempat board baru, dan catatan bahwa skrip tidak dijalankan.
  - Importing: langkah Fetched → Rendering → Converting dengan progress bar.
  - Error: alamat privat ditolak (field `danger`), plus daftar error lain: timeout 15 s, lebih dari 5 MB, bukan http(s).
- **DTCG:** header panel Theme kini punya tombol Import dan Export, masing-masing membuka menu.
  - Import: Import DTCG JSON…, Import CSS variables….
  - Export: Export DTCG JSON, Copy DTCG JSON, Copy tokens as CSS.
  - Laporan impor menampilkan jumlah new, updated, aliases, dan not supported, pemetaan mode, serta daftar token yang tidak diimpor beserta alasannya. Token tidak pernah dibuang diam-diam.
- **Updates:** item nav Settings baru "Updates".
  - Kartu versi punya tiga state: Up to date (Check for updates), Update available (Release notes, Install and restart, catatan rilis, progres unduh), dan Check failed (Try again, garis tepi `danger`).
  - Toggle: cek otomatis, dan pasang saat keluar.
  - Info About: versi, channel, dan tanda tangan.
  - Banner update tersedia (`accent-soft`) tampil di atas jendela. Banner terpasang ("Lakar was updated to 0.1.6", What's new, Dismiss) tampil di Recents setelah restart. Keduanya memakai pola Offline Banner.

Catatan audit: `ctx.problems` di layar baru hanya berisi handle seleksi yang sengaja menonjol keluar dari frame Selection, node yang dinonaktifkan, dan selisih pembulatan float pada kartu "Feature Spatial design" yang diwarisi dari layar dasar.

## Celah teknis yang perlu diputuskan arsitektur

Server MCP v1 punya 10 tool: `status`, `read_skill`, `open_doc`, `list_boards`, `execute`, `inspect`, `layout_check`, `screenshot`, `export`, `icon_search`. Desain di atas membutuhkan hal-hal berikut yang belum ada:

1. **Seleksi sebagai konteks agen (R10).** Butuh tool baru, misalnya `get_selection`, atau seleksi disertakan di respons `status`/`inspect`. Keterangan "Agent sees your selection" di Activity bergantung pada ini.
2. **Stream event live dari `lakard` ke viewer.** Isinya tool call yang dimulai/selesai, node yang berubah, dan posisi target untuk cursor. Viewer membutuhkan id node target per `execute`.
3. **Identitas harness.** Nama agen (Claude Code, Codex) per sesi, kemungkinan dari `clientInfo` MCP.
4. **Riwayat versi.** Snapshot per sesi atau per `execute`, diff jumlah node, dan endpoint Restore.
5. **Format error `execute`.** Pesan yang ramah pengguna dan informasi rollback, mengikuti pemetaan AD-11.
6. **Operasi file dari viewer.** Rename, Delete, dan Export PNG, apakah lewat daemon HTTP langsung (bukan MCP).
7. **Status daemon untuk banner offline.** Health check dari viewer ke `http://127.0.0.1:7466`.

## Keputusan terbuka

- Tablet Viewer memakai orientasi lanskap 1024. Dashboard tablet memakai orientasi tegak 768.
- Isi Settings → Notifications belum didesain. Profile (nama dan email) mungkin tidak perlu untuk aplikasi lokal tanpa akun.
- Teks error dan ID LC di contoh hanya ilustrasi: LC-05 (teks < 12px) dan LC-12 (ukuran board), diambil dari `packages/check`.
