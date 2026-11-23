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
| 11 · Editor ergonomics & import | Snapping dan smart guide, ukur jarak Alt, menu zoom, Wrap di Auto layout, Copy as PNG, Import from URL, impor/ekspor token DTCG, Settings → Updates dan banner update. Desktop 1440, dark dan light |

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

Desain story 8.1 epic `epic-adopsi-open-pencil` (2026-11-23), dasar UI story 8.5–8.10. Desain disetujui atas delegasi Fatmuh (terima jadi, 2026-11-23). Versi ini menggantikan draf sebelumnya yang di-revert di `fcd2ded`.

Section `ZDg9M`, header `led6I`. Pola mengikuti section 10: baris Components `AEPtu` (sheet dark `vnnM4`, sheet light `IUxUE`), lalu tiga kelompok baris, masing-masing Dark lalu Light:

- Canvas & Design panel: `z3WZmU` / `jW5Wg`
- Import & tokens: `k9fXC3` / `vpkcm`
- Updates: `HvxCF` / `F6FTho`

Semua layar desktop 1440×900. Setiap layar adalah salinan layar yang sudah ada (Editor `fdf6D`/`XZif7` di section 05, Theme `gXCqM` dan Import CSS `wvCMu` di section 07/09, Settings `GM2nq` dan Recents `QkniH` di section 01/02), jadi komponen, token, grid, dan tipografinya sama. Versi light adalah salinan versi dark dengan `theme.mode = light`.

| Layar | Dark | Light | Story |
|---|---|---|---|
| Editor — Snap · Smart guides | `fvbjN` | `VxLKW` | 8.5 |
| Editor — Measure distance · Alt | `GSpGv` | `yq3cH` | 8.5 |
| Editor — Zoom menu | `pSUKZ` | `dVToz` | 8.5 |
| Editor — Auto layout · Wrap | `PU4cd` | `oMWUS` | 8.6 |
| Editor — Context menu · Copy as PNG | `gj8lD` | `BD9N7` | 8.7 |
| Import from URL — Form | `d37Gbx` | `zVjj4` | 8.8 |
| Import from URL — Progress | `cembT` | `tdesM` | 8.8 |
| Import from URL — Error | `w28zTP` | `sG9nl` | 8.8 |
| Theme — Import menu · DTCG | `Y2Penr` | `ShWsl` | 8.9 |
| Theme — Import DTCG tokens · Review | `muQTg` | `It7sY` | 8.9 |
| Settings — Updates · Up to date | `k6R96Q` | `t6B4U` | 8.10 |
| Settings — Updates · Available | `ynWXN` | `cZjOf` | 8.10 |
| Settings — Updates · Check failed | `b4i13` | `g5kaS` | 8.10 |
| Recents — Update ready banner | `vQY8e` | `jfXR8` | 8.10 |
| Recents — Updated banner | `mOkHY` | `gKj0Y` | 8.10 |

Komponen baru (sheet `vnnM4`): **Smart Guide** `xUDJD` (garis 1px `danger`, ukuran diatur per instance) dan **Distance Label** `CVzUp` (label angka putih di atas `danger`). Sheet yang sama memuat contoh pemakaian komponen lama: Toast "Copied as PNG" `FLIHe` dan "Couldn't copy as PNG" `Y7G9rn` (instance Toast `r69qO`), menu Add layer `p9x1J` dengan item baru "Import from URL…", dan menu Export panel Theme `Fr1q6`.

Keputusan desain:

- **Snapping.** Guide dan pengukur jarak memakai `danger` supaya tidak tertukar dengan seleksi (`accent`) dan agen (`agent`). Contoh: board "Hero — Mobile" digeser, tepi atasnya menempel ke tepi atas "Hero — Desktop" (guide penuh), jarak 40 antar board ditampilkan dengan Distance Label, dan badge di bawah seleksi menunjukkan posisi bulat yang akan di-commit (`664, 64`). Panel Design ikut menampilkan X/Y/W/H board tersebut.
- **Alt+hover.** Seleksi tetap biru, layer yang di-hover diberi Hover Outline biasa. Jarak horizontal (28) dan vertikal (26) digambar dengan Smart Guide + Distance Label. Tooltip pola "Undo" yang sudah ada dipakai untuk petunjuk "Measuring to Visual · Alt".
- **Zoom.** Indikator zoom di View Controls menjadi tombol (latar `surface-hover`, chevron) yang membuka menu: Zoom in (Ctrl +), Zoom out (Ctrl −), Zoom to 100% (Shift 0), Zoom to fit (Shift 1), Zoom to selection (Shift 2). Shift+1 sudah berarti Fit di viewer.
- **Wrap.** Grup Auto layout mendapat baris baru di bawah Direction: Segmented "No wrap / Wrap" dan Field "Row gap" di sebelahnya. Gap yang ada tetap menjadi jarak antar kolom. Contoh canvas: chip layanan di "Feature grid" terbungkus ke dua baris, dengan sorotan row gap dan Distance Label 8. Baris Inner shadow di grup Effects disembunyikan di layar ini supaya panel tetap muat 900px.
- **Copy as PNG.** Item baru di context menu layer, tepat di bawah Duplicate, shortcut Ctrl+Shift+C (tidak dipakai di viewer). Hasilnya memakai Toast yang ada: berhasil (2x) atau gagal (Try again / Dismiss).
- **Import from URL.** Dibuka dari menu Add layer (tombol "+" di Layers dan context menu canvas), tanpa shortcut. Dialog adalah salinan dialog New file: Page address, Board width (Desktop 1440 / Tablet 768 / Mobile 375), catatan batas (http(s) publik, 15 detik, 10 MB), lalu Cancel / Import page. State Progress mengunci form dan menampilkan langkah Fetched page → Rendered → Converting to layers. State Error memberi field `danger` dan pesan untuk alamat lokal/privat, dengan tombol Try again.
- **DTCG.** Header panel Theme kini punya tombol Import dan Export (menggantikan "Import CSS variables" dan "Copy tokens as CSS", yang pindah ke dalam menu). Menu Import: CSS variables…, DTCG tokens (.json)…. Menu Export ada di sheet komponen: Copy tokens as CSS, Export DTCG JSON, Copy DTCG JSON. Dialog review DTCG adalah salinan dialog Import CSS variables: sumber JSON, pemetaan mode dari `$extensions`, tabel path DTCG/alias/tipe/nilai/status, dan token bertipe yang tidak didukung ditandai "Unsupported" serta dijelaskan di catatan, bukan dibuang diam-diam.
- **Updates.** Halaman Settings memakai struktur Settings → General apa adanya: Settings Nav (item baru "Updates" aktif), lalu section dengan Section Intro 220px dan Section Fields, garis bawah, dan Spacer 28. Section Version memakai kartu status dari Settings → Connections (pola kartu lakard) dengan badge Up to date / Update available / Check failed dan tombol Check for updates / Download and install / Try again. State Available menambah section "What's new in 0.10.0". Section Automatic updates memakai komponen Input (mode select) "Download updates". Banner di Recents memakai pola Offline Banner: "ready to install" (`accent-soft`, What's new + Restart now) sebelum restart, dan "Updated to Lakar 0.10.0" (nada `success`, See what's new + Dismiss) setelah restart.

Catatan audit: peringatan `fill_container` dari Pencil di layar baru hanya mengenai node yang dinonaktifkan (Option Custom, Inner shadow, Note) dan master Segmented Control yang sudah ada. Diff `lakar-ui.pen` terhadap `main` hanya penambahan.

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
