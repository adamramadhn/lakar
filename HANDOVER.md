# HANDOVER — posisi pekerjaan Lakar (build lakar-paper selesai)

Catatan serah-terima untuk melanjutkan di ADE atau IDE lain. Aturan dan jebakan repo ada di [AGENTS.md](AGENTS.md).

## Branch dan PR

Semua PR ada di repo GitHub `fatmuh/lakar` (dulu `adamramadhn/lakar`; alamat lama di-redirect).

Semua PR di bawah sudah di-merge ke `main`.

| Branch | Isi | PR |
|---|---|---|
| `claude/desktop-tauri-f5e05a` | Aplikasi desktop Tauri + release workflow + halaman Connections (MCP) | #5 |
| `claude/app-design-parity` | Semua fitur edit di aplikasi + audit desain (#7 sampai #14 sudah masuk ke sini) | #6 |
| `g1` | Pekerjaan G1 dari VPS: aturan `layout_check` sisa, skill per domain, rubrik v2.3, golden A–E | #15 |
| `docs/new-initiative` | Inisiatif `initiative-lakar-paper`, inisiatif lama ditutup, spine arsitektur model dokumen | #16, #17 |
| `feat/model-dokumen` | Build ketujuh epic `initiative-lakar-paper`, skema v7 | #18 |

**Rilis.** Tag `v0.1.0` ada di `20b913c` (merge #18). `release.yml` menerbitkan GitHub Release dengan installer Windows (exe, msi), macOS (arm64, x64), Linux (AppImage, deb) dan `SHA256SUMS.txt`: https://github.com/fatmuh/lakar/releases/tag/v0.1.0. Job `macos-x64` gagal sekali di langkah Smoke-test sidecar lalu lolos saat dijalankan ulang. Lognya tidak sempat terbaca, jadi penyebabnya belum diketahui. Awasi bila terulang.

## Isi `claude/app-design-parity`

Spec per fitur ada di `_bmad-output/implementation-artifacts/`.

| Fitur | Spec |
|---|---|
| Kelola file: New file + preset board, rename, duplicate, archive, delete, halaman Files/Archive | `spec-app-1-file-management.md` |
| Export PNG 1x/2x, Copy as CSS/Tailwind/JSON, unduhan desktop ke Downloads | `spec-app-2-export-copy.md` |
| Snapshot per rev, History Restore/Compare/pratinjau | `spec-app-3-history-restore.md` |
| Sisip/hapus layer manual (Frame, Rectangle, Ellipse, Text, Image, Icon), Undo | `spec-app-4-manual-layers.md` |
| Presence agen (cursor, outline, "Just changed") | `spec-app-5-agent-presence.md` |
| Search dropdown, Settings General | `spec-app-6-dashboard-search-settings.md` |
| Tab multi-dokumen, window chrome desktop | `spec-app-7-titlebar-tabs.md` |
| Kelola Pages | `spec-app-8-pages.md` |
| Layout tablet/mobile | `spec-app-9-viewer-responsive.md` |
| Folder + Move to… | `spec-app-10-folders.md` |

Perubahan sesudah gelombang fitur di atas:
- **Perbaikan tulis di Windows** (`1b6b60c`). Sebelumnya New file dan semua commit gagal dengan `EPERM fsync`. Smoke test release kini juga membuat dan menduplikasi file.
- **Sinkron antar-jendela.** Event `change` dikirim untuk penulisan dari aplikasi. Cache blob dan ukuran snapshot dibatasi.
- **Audit desain Dashboard dan Viewer.** Celah visual dan state ditutup, error daemon diterjemahkan ke pesan Inggris, dan aksesibilitas kartu diperbaiki.

**Installer uji terakhir:** artefak run GitHub Actions `44963466533` di workflow "Release desktop".

## Arah kerja (sejak 2026-11-22)

- **Inisiatif aktif: `_bmad-output/initiative-lakar-paper/`.** Tujuannya Lakar setara paper.design: editor canvas, agen di canvas yang sama, token dan tema, komponen, ekspor kode, paste HTML/SVG dan vektor. Tidak ada gerbang benchmark.
- **`initiative-lakar` ditutup dan tidak mengikat.** G0 selesai, B (viewer + desktop) sudah dibangun, G1 vs pen.dev tidak dilanjutkan. File-nya disimpan sebagai riwayat.
- **Desain dulu, baru kode (C6 inisiatif baru).** UI/UX/motion mengikuti `design/lakar-ui.pen`. Layar baru didesain dulu di Pencil, lalu dikodekan lewat MCP pencil.
- **Installer sudah diuji Fatmuh** dari build GitHub Actions dan terpasang aman.

## Langkah berikutnya

0. **Agen di canvas (prioritas, mulai di sesi baru, branch `feat/agent-open-doc`).** Urutannya:
   1. **Agen bekerja di dokumen yang terbuka.** Spec `_bmad-output/implementation-artifacts/spec-agent-open-doc.md` sudah disetujui Fatmuh (`ready-for-dev`, rute full). Lanjutkan dengan `bmad-build` dari spec itu; workflow langsung masuk ke step implementasi.
   2. **Skill desain dari Emil Kowalski** (MIT, aiforui.dev/skills), diadaptasi untuk MCP.
   3. **Efek canvas saat agen bekerja** (fade-in node, label "Generating", outline, cursor per agen, shimmer). Desain dulu di `lakar-ui.pen` section 04.
   4. **Tinggi board landing mengikuti isi.**

   Butir 2–4 tercatat di `deferred-work.md`. Riset pendukung (open-pencil, Paper, pen.dev, skill Emil) ada di `research-agent-canvas-references.md`. Agar `bmad-build` ter-render dengan benar, skrip `_bmad` harus versi 6.13.0-next (commit `138d7f1`).
1. **Uji manual `v0.1.0` oleh Fatmuh.** Pasang installer rilis, lalu cek butir Done-when yang tersisa (lihat "Sisa" di bawah).
2. **Build `initiative-lakar-paper` selesai dan sudah di `main` (#18).** Semua 34 tiket berstatus done. Semua story dijalankan lewat `bmad-build-auto`. Spec ada di `_bmad-output/implementation-artifacts/spec-{model-dokumen,editor,agen,token,komponen,kode,vektor}-*.md`. Spine arsitektur ada di `_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md`. Skema kini v7.
   - **Model dokumen.** Korpus v1/v2, token bertipe dengan mode tema (v3), `resolveDocument` sebagai satu pintu resolusi, dan `css.ts` sebagai pemetaan CSS tunggal.
   - **Editor canvas.** Route `/viewer/docs/:slug/ops` dengan op invers untuk undo/redo, board sebagai DOM hidup, select/move/resize, panel Design, aksi edit, dan grid (v4).
   - **Agen di canvas.** Seleksi bersama lewat `get_selection`, perubahan agen tampil live tanpa menimpa edit manual, dan skill `selection`.
   - **Token dan tema.** API baca token untuk agen, panel Theme, dan Token Picker di panel Design.
   - **Komponen.** Master dan instance (v5), op komponen, UI komponen di viewer, serta props dan slot.
   - **Kode.** Paket `@lakar/codegen` (React + Tailwind atau CSS), komponen sebagai file React, uji paritas piksel, dialog Export code, tool `export_code`, dan impor CSS variables.
   - **Paste dan vektor.** Atribut SVG bertipe pada path (v6), importer SVG dan HTML dengan tool `paste` (tag v7), Pen tool, dan edit titik.
   - **Sisa (butuh Fatmuh).** Butir Done-when yang butuh installer release desktop dan demo manual Fatmuh: membuat landing page dari nol dan alur varian lewat agen.
   - **Tema tertunda utama.** Viewer belum punya harness tes DOM/komponen, jadi wiring UI hanya dites lewat logika murni. Dokumen nyata v1/v2 pengguna dan bench (termasuk di VPS) belum masuk korpus; caranya ada di `tests/fixtures/docs/README.md`. Item lain ada di `deferred-work.md`.
3. **Item tertunda.** Lihat `_bmad-output/implementation-artifacts/deferred-work.md`.

## Merapikan lingkungan lokal

- Worktree lama ada di `.claude/worktrees/`. Hapus dengan `git worktree remove <path>` bila tidak dipakai lagi.
- Checkout utama `D:\Work\Personal\lakar` mungkin masih menunjukkan `design/lakar-ui.pen` sebagai modified. Salinannya sudah di-commit di `claude/app-design-parity`.
