# Eksplorasi desain UI Lakar (B: viewer)

Status: eksplorasi visual, belum spesifikasi final. Bahan masukan untuk `bmad-ux` epic B setelah G1 lulus (initiative-lakar §Notes, open question spesifikasi UX B).
Dibuat 2026-11-21 di Pencil (pen.dev) lewat MCP.

## File

- `lakar-ui.pen`: dokumen desain. Buka di aplikasi Pencil. File ini terenkripsi, jadi akses hanya lewat Pencil atau MCP pencil.
- `shimmer.glsl`, `pulse.glsl`: shader untuk animasi live di canvas Pencil. Harus berada di folder yang sama dengan `.pen`.
- Prototype animasi (HTML, privat): https://claude.ai/artifact/HVWWXrmpWXKMzKuqdrzjsb

Catatan: `lakar-ui.pen` adalah salinan snapshot dari `untitled.pen` di folder dokumen Pencil. Lanjutkan pekerjaan dari salinan ini supaya tidak ada dua versi.

## Model produk

- Lakar UI adalah **viewer**. Aplikasi ini tidak punya kotak prompt. Desain dibuat sepenuhnya oleh agen di harness terpisah (Claude Code, Codex, atau klien ACP lain) lewat tool MCP `lakar`.
- Viewer menampilkan hasil, aktivitas tool call yang masuk secara live, temuan `layout_check`, dan riwayat perubahan.
- Tidak ada edit manual (C), edit komponen atau variabel (D), kolaborasi, berbagi, atau akun. Ini sesuai Boundaries di initiative-lakar. Aplikasi hanya lokal untuk satu pengguna.
- Indikator status koneksi agen di header sengaja tidak dipakai. Koneksi hanya terlihat di halaman Connections dan di banner saat `lakard` offline.

## Struktur dokumen

| Bagian | Isi |
|---|---|
| 00 · Components | Library komponen (lihat di bawah) |
| 01 · Dashboard — Recents | Grid dan list. Desktop 1440, tablet 768, mobile 375, plus menu drawer mobile |
| 02 · Dashboard — Pages & states | Files, Archive kosong, Recents first-run, Settings, Connections, context menu, konfirmasi delete, search (ada hasil / tidak ada hasil), offline, loading. Desktop, tablet, mobile |
| 03 · Viewer | Activity, Inspect, Checks, History, Waiting, Offline, Error, Export. Desktop 1440, tablet 1024 lanskap, mobile 375 |
| 04 · Agent presence & motion | Storyboard 4 langkah, state baris layer, tabel spesifikasi motion, aturan reduced motion |

Setiap layar punya versi dark dan light yang disusun sejajar atas-bawah.

## Layar Viewer (inti)

- **Canvas:** hanya pan, zoom, dan seleksi. Ada kontrol Select, Hand, zoom, Fit, dan tombol Export.
- **Panel kiri:** Pages dan Layers, hanya untuk dilihat.
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
