---
title: 'Desain UI adopsi open-pencil di lakar-ui.pen'
type: feature
ticket: '1'
created: '2026-11-23'
status: in-review
baseline_revision: '01390e5ca062fc1b6f6020cd6fcdeb84bc80037e'
route: oneshot
route_source: auto
risk: low
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: ['{project-root}/design/README.md']
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 5–10 epic `epic-adopsi-open-pencil` menambah UI baru (snapping dan smart guide, pengukur jarak Alt+hover, zoom 100% dan zoom ke seleksi, Wrap dan gap baris di auto layout, Copy as PNG, dialog impor URL, Import/Export DTCG di panel Theme, Settings → Updates dan banner update), tetapi aturan C6 mewajibkan desainnya ada dulu di `design/lakar-ui.pen`.

**Approach:** Tambah section baru `11 · Editor ergonomics & import` di `lakar-ui.pen` lewat MCP Pencil, dengan pola section 10: header, baris Components (sheet dark dan light), lalu baris Dark dan Light berisi layar desktop 1440×900 yang disalin dari layar yang sudah ada (Editor, Theme, Settings, Recents) supaya komponen dan token tetap sama. Versi light adalah salinan versi dark dengan `theme.mode = light`. Catat section, layar, dan id node di `design/README.md`.

</intent-contract>

## Implementation Notes

Route oneshot: perubahan teks di repo hanya `design/README.md` (di bawah 100 baris); desain dikerjakan langsung lewat tool `execute` Pencil, tanpa kode aplikasi.

Keputusan desain (atas delegasi Fatmuh):
- Desain disetujui atas delegasi Fatmuh (terima jadi, 2026-11-23).
- File yang diedit: `file:///D:/Work/Personal/lakar/design/lakar-ui.pen` (checkout utama). Isi commit-nya sama dengan salinan di worktree `feat/skeleton-live-build` yang sedang aktif di Pencil, jadi tidak ada versi yang tertimpa.
- Smart guide dan pengukur jarak memakai token `danger` (merah), mengikuti konvensi editor desain (guide merah, seleksi biru `accent`), sehingga guide tidak tertukar dengan seleksi pengguna atau aktivitas agen (`agent`).
- Shortcut zoom: Shift+0 untuk 100%, Shift+1 untuk Fit, Shift+2 untuk zoom ke seleksi (padanan Figma). Menu dibuka dari indikator zoom di View Controls.
- Wrap ditampilkan sebagai Segmented Control (No wrap / Wrap) di grup Auto layout; Field "Row gap" hanya muncul saat Wrap aktif, di sebelah Gap yang menjadi "Column gap".
- Copy as PNG ada di context menu layer (Copy as PNG, Shift+Ctrl+C) di bawah item copy lain; hasilnya ditampilkan Toast yang sudah ada ("Copied as PNG · 2x"), dan error memakai Toast dengan nada `danger`.
- Dialog impor URL dibuka dari menu "+" Add layer dan context menu canvas ("Import from URL…"). Tiga state: form (alamat, preset lebar Desktop 1440 / Tablet 768 / Mobile 375, catatan bahwa skrip tidak dijalankan), progres (langkah fetch → render → convert), dan error (alamat privat ditolak, plus timeout/ukuran sebagai teks bantuan).
- DTCG: menu "…" di header panel Theme berisi Import DTCG JSON…, Export DTCG JSON, Copy tokens as CSS. Hasil impor memakai pola laporan (seperti Paste Report): jumlah token, mode, alias, dan daftar tipe yang tidak didukung.
- Updates: item nav Settings baru "Updates" dengan state Up to date, Update available (unduh + catatan rilis) dan Check failed; banner update available di Settings dan banner "ready to restart" di Recents memakai pola Offline Banner.

Catatan implementasi (2026-11-23):
- Insiden: tab Pencil untuk `design/lakar-ui.pen` di checkout utama memegang salinan lama di memori (sebelum commit `25f06d1` dan `f358e57`), sehingga save pertama menghapus panel toggle, isi section 04 (skeleton build), dan perubahan lain di section 00 sampai 10. Commit WIP `b6881467be1835a4a91cffef48894742a0c2ed97` berisi versi rusak itu.
- Perbaikan: `git show HEAD:design/lakar-ui.pen` disalin ke folder sementara, dibuka di Pencil, section 11 dibangun ulang di atasnya dengan skrip yang sama (lookup berdasarkan nama), lalu file disalin kembali ke `design/lakar-ui.pen`. Hasilnya, terhadap `baseline_revision` diff hanya berupa penambahan (94039 baris, 0 hapus). Jumlah node section 00 sampai 10 sama persis dengan baseline.
- Tab Pencil lama untuk `design/lakar-ui.pen` di checkout utama masih memegang salinan basi. Tab itu harus ditutup atau dimuat ulang tanpa disimpan.
- Section 11 = `PciUW`, berisi 15 layar dark dan 15 light, plus sheet komponen. Id node tercatat di `design/README.md`.
- File yang diubah: `design/lakar-ui.pen`, `design/README.md`, dan plan ini.

## Verification

**Manual checks (if no CLI):**
- Screenshot setiap layar baru lewat `TakeScreenshot` Pencil: tidak ada node yang terpotong atau meluap (`ctx.problems` kosong untuk node buatan story ini).
- Setiap layar dark punya pasangan light dengan `theme.mode = light`, dan semua warna baru memakai variabel (`$...`).
- `design/README.md` mencantumkan section 11, layar, dan id node.
