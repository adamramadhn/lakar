---
type: initiative
title: "Lakar setara paper.design: editor, token, komponen, kode, dan agen di satu canvas"
parent: none
sources:
  - _bmad-output/initiative-lakar-paper/brief-lakar-paper/brief-lakar-paper.md
  - _bmad-output/initiative-lakar/initiative-lakar.md
companions:
  - _bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md
after: []
risk: high
---

# Lakar setara paper.design: editor, token, komponen, kode, dan agen di satu canvas

## Description

Lakar sekarang punya inti agen (G0) serta viewer dan aplikasi desktop (B) dari initiative-lakar. Inisiatif ini menjadikan Lakar setara paper.design dalam empat hal:
- editor canvas penuh untuk manusia;
- token, tema, dan komponen;
- ekspor serta sinkron kode;
- agen di harness yang bekerja di canvas yang sama.

Arah ini ditetapkan Fatmuh pada 2026-11-22 (brief-lakar-paper). UI-nya tetap desain Lakar di `design/lakar-ui.pen`.

## Outcome

Fatmuh bisa mendesain sendiri atau bersama agen di Lakar seperti di paper.design, lalu membawa hasilnya ke kode. Ukurannya fitur yang bisa didemokan di installer desktop (Done when), tanpa gerbang benchmark.

## Requirements

- R1 (brief §Editor): pengguna mengedit desain langsung di canvas, yaitu:
  - pilih dan multi-select, geser, ubah ukuran;
  - edit teks inline, group, duplikat, hapus, align;
  - undo/redo dan shortcut;
  - edit properti di panel properti: fill, stroke, radius, efek, tipografi, dan auto-layout flex/grid.

  Terbukti bila satu landing page lengkap bisa dibuat dari kosong tanpa agen.
- R2 (brief §Agen di canvas): agen di harness membaca dan menulis dokumen yang sama lewat MCP, termasuk seleksi pengguna. Perubahan manual maupun perubahan agen tampil live di kedua sisi. Terbukti bila pengguna memilih frame, meminta varian responsif di harness, lalu hasilnya muncul live di canvas.
- R3 (brief §Token dan tema): token dikelola di panel Theme. Jenisnya: warna, radius, spacing, container, breakpoint, font family, font weight, font size, line height, dan letter spacing. Token dipakai dan dilepas dari panel properti, dan mendukung mode tema. Terbukti bila mengubah satu token mengubah semua node pemakainya, baik di canvas maupun di ekspor kode.
- R4 (brief §Komponen): komponen punya instance, override, props, dan slot. Perubahan pada master menyebar ke semua instance. Terbukti bila mengubah master memperbarui semua instance tanpa menimpa override.
- R5 (brief §Kode): frame diekspor ke React dengan Tailwind atau CSS idiomatik yang memakai token. Token bisa diimpor dari CSS variables di codebase. Terbukti bila komponen hasil ekspor dirender di browser sama dengan canvas, dengan selisih piksel di bawah ambang yang ditetapkan.
- R6 (brief §Editor, paste): HTML dan SVG yang di-paste menjadi layer yang bisa diedit. Terbukti bila potongan HTML dan SVG contoh menjadi layer dengan struktur dan gaya yang terjaga.
- R7 (brief §Editor, vektor): pen tool dan edit path vektor, dengan detail SVG yang terjaga. Terbukti bila ikon SVG bisa diimpor, diedit titiknya, lalu diekspor kembali tanpa kehilangan atribut.

## Constraints

- C1 (brief §Arahan pemilik): yang dikejar adalah kesetaraan fitur dan alur kerja, bukan salinan. UI mengikuti `design/lakar-ui.pen` yang diperluas di Pencil. Nama, API, aset, dan kode Paper tidak disalin.
- C2 (brief §Arahan pemilik): untuk sekarang lokal, satu pengguna, tanpa akun. Akun, tim, berbagi, dan cloud menyusul di inisiatif berikutnya.
- C3 (initiative-lakar C1, C5): format dokumen milik Lakar, dengan `schemaVersion` dan migrasi. Tanpa Penpot, dan tanpa format `.pen` atau Paper.
- C4 (initiative-lakar C3): bila kualitas hasil desain bertukar dengan kecepatan membangun, kualitas yang menang.
- C5 (AGENTS.md; architecture-model-dokumen AD-4, AD-17): aturan repo tetap berlaku:
  - route dan tool MCP lama dijaga kompatibel mundur, tidak lagi dibekukan demi bench;
  - arah dependensi dijaga;
  - route tulis `/viewer/*` dilindungi guard Origin.
- C6 (arahan Fatmuh 2026-11-22): UI, UX, dan motion mengikuti `design/lakar-ui.pen` yang sudah ada. Layar atau komponen yang belum ada didesain dulu di Pencil, lalu dikodekan dari desain itu lewat MCP pencil (design to code). Tidak ada UI baru yang dikodekan tanpa desain di pen.

## Done when

- Fatmuh membuat satu landing page lengkap dari kosong di editor Lakar tanpa agen, memakai token dan komponen.
- Mengubah satu token atau master komponen memperbarui semua pemakainya, di canvas dan di ekspor kode.
- Frame yang diekspor ke React/Tailwind dirender sama dengan canvas, di bawah ambang selisih piksel.
- Agen di harness membuat varian dari frame yang dipilih pengguna, dan hasilnya muncul live.
- Semua fitur di atas ada di installer desktop rilis untuk tiga OS.

## Boundaries

- Di luar (C2): akun, tim, berbagi dan izin, kolaborasi, hosting aset/CDN, dan MCP hosted.
- Di luar untuk sekarang: paste dari Figma, ekstensi Snapshot situs langsung, script/prompt engine, video, Lottie/Rive, three.js, dan sistem partikel.
- Di luar: Penpot, serta format `.pen` dan Paper sebagai format penyimpanan.
- Touch point: paper.design — hanya acuan fitur dan alur kerja (dokumentasi publik). Tidak ada pembanding bench.
- Touch point: pen.dev (MCP pencil) — sumber desain UI/UX/motion (`design/lakar-ui.pen`). Layar baru didesain di sana, lalu dikodekan lewat MCP pencil (C6). Pemiliknya setiap epic yang punya UI baru (2–7). Story pembuka epic itu adalah desain di pen (C6).
- Dipakai ulang dari initiative-lakar: daemon `lakard`, render, `layout_check`, skill, harness bench, viewer, dan aplikasi desktop.
- Jalur tracer: pengguna mengedit di canvas → dokumen Lakar → agen di harness membaca seleksi dan menulis lewat MCP → canvas live → ekspor React.

## References

- brief — _bmad-output/initiative-lakar-paper/brief-lakar-paper/brief-lakar-paper.md
- pendahulu — _bmad-output/initiative-lakar/initiative-lakar.md (ditutup 2026-11-22, tidak mengikat; hanya riwayat)
- design — design/lakar-ui.pen (terenkripsi, hanya lewat Pencil) dan design/README.md
- paper — https://paper.design/llms.txt, https://paper.design/docs/tokens, https://paper.design/docs/mcp, https://paper.design/roadmap

## Notes

- Decision: 2026-11-22 — pemilik keputusan sekarang Fatmuh. Arah Paper menjadi inisiatif baru, dan initiative-lakar ditutup pada G0 + B supaya riwayat keputusan Adam tetap utuh (Sofia atas delegasi Fatmuh).
- Decision: 2026-11-22 — inisiatif ini tidak terikat pada initiative-lakar maupun gerbang benchmark apa pun (G1 vs pen.dev atau pembanding Paper). Aplikasi desktop sudah dibangun lewat GitHub Actions dan terpasang aman di mesin Fatmuh, jadi pekerjaannya melengkapi fitur. R8, C5 lama, dan epic gerbang kualitas dihapus (arahan Fatmuh).
- Decision: 2026-11-22 — paste dari Figma dan ekstensi Snapshot di luar cakupan awal. Paste HTML dan SVG masuk cakupan (R6).
- Open question (ditutup 2026-11-22 oleh architecture-model-dokumen AD-1): model dokumen. Pilihannya tetap skema JSON Lakar yang diperluas, atau bergeser ke model HTML/CSS-native seperti Paper. Keputusan: JSON Lakar bertipe dengan semantik properti CSS, tanpa HTML/CSS mentah.
- Open question (ditutup 2026-11-22 oleh C6): desain UI untuk panel baru belum ada di `design/lakar-ui.pen`. Setiap epic membuka dengan story desain di pen.
- Decision: 2026-11-22 — epic disetujui Fatmuh, satu per kemampuan yang bisa dikirim sendiri. Epic pembuka memutuskan model dokumen (`bmad-architecture`), dan epic lain menunggu keputusan itu.
- Decision: 2026-11-22 — tidak ada epic platform-baseline. Monorepo, CI, daemon, viewer, dan release desktop sudah ada dari initiative-lakar.
- Decision: 2026-11-22 — alur kerja desain-dulu (C6) punya satu tempat, yaitu Constraints inisiatif ini. Setiap epic 2–7 membuka dengan story desain di pen (hitl, disetujui Fatmuh) sebelum story kode.
- Open question (ditutup 2026-11-22 oleh architecture-model-dokumen AD-4): route daemon dan tool MCP lama dibekukan demi bench (AGENTS.md). Tanpa bench, apakah pembekuan itu masih perlu? Keputusan: pembekuan dicabut, diganti kontrak kompatibilitas mundur. AGENTS.md dan C5 sudah diselaraskan.
- Decision: 2026-11-22 — spine architecture-model-dokumen (AD-1 sampai AD-17) disetujui Fatmuh dan menjadi companion inisiatif ini. Epic 2–7 membangun di atasnya.
