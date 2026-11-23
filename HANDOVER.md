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

0. **Agen di canvas: selesai dan sudah di `main` (2026-11-23).** Riset pendukung ada di `research-agent-canvas-references.md`. Agar `bmad-build` ter-render dengan benar, skrip `_bmad` harus versi 6.13.0-next (commit `138d7f1`).
   1. **Agen bekerja di dokumen yang terbuka** (#20, `spec-agent-open-doc.md`). `open_doc {}` memakai dokumen yang sedang difokuskan di aplikasi, atau membuat dokumen baru dan membuka tabnya. Ada juga tool `list_documents`, dan respons tulis membawa `target`.
   2. **Skill desain dari Emil Kowalski** (#22, `spec-design-skills-emil.md`). Skill opsional `break-ui` dan `variants`, isi non-animasi masuk ke `ui`/`review`. Lima skill animasi dipasang di `.claude/skills/`. Atribusi MIT ada di `packages/skills/NOTICE.md`.
   3. **Efek canvas saat agen bekerja** (#21, `spec-canvas-agent-effects.md`). Desainnya ada di `lakar-ui.pen` section 04, baris `GRlb7`. Isinya: identitas agen lewat header `x-lakar-agent`, warna per sesi, label "✦ Generating", fade-in node, cursor 180 ms, dan baris Activity `terminal-chunk-in`.
   4. **Tinggi board landing** (#22, `spec-board-height-fit.md`). LC-12 memberi peringatan bila ada ruang kosong di bawah isi board landing yang sudah jadi, dan skill `landing` mengambil tinggi dari `bounds`.

   5. **Identitas agen di History/Dashboard dan warna sesi yang konsisten** (#24, `spec-agent-identity-history.md`).
   6. **Harness tes DOM viewer** (#25, `spec-viewer-dom-harness.md`). Tes ditulis sebagai `*.dom.test.tsx` (jsdom + Testing Library) dan dijalankan oleh `pnpm test` sebagai project vitest `viewer-dom`.
   7. **Build live per seksi** (#26, `spec-progressive-live-build.md`) dan **board `height:'hug'`** (#28, `spec-board-hug-height.md`, skema v8).
   8. **Sidebar kiri/kanan bisa di-collapse, pill `layout_check` dihapus** (#27, `spec-viewer-collapsible-panels.md`).
   9. **Kerangka dulu, lalu satu blok per execute, plus prelude bawaan** (#29, `spec-skeleton-live-build.md`). Marker `[Skeleton] `, helper `Skel`/`Build`/`Palette`, dan LC-33.
   10. **Installer menutup `lakar-node.exe` yang sedang berjalan** (#30, `spec-installer-locked-node.md`). Config MCP di Windows menunjuk salinan Node yang stabil.
   11. **Epic loop verifikasi agen** (riset `research-open-pencil-features-for-lakar/`):
       - `undo`/`redo` agen (#31, `spec-agent-undo.md`);
       - `visual_diff` (#32, `spec-agent-visual-diff.md`);
       - `fix_check` (#33, `spec-check-autofix.md`).

       Ketiganya berbagi hook `AgentSteps.onAgentWrite`. Server MCP kini punya 19 tool.

   **Rilis:** `v0.1.1` sampai `v0.1.5` terbit pada 2026-11-23. Cek `claude-review` di CI gagal di sisi layanan (`api.moccilabs.com` menolak dalam sekitar 1 detik). Sebagai gantinya, PR besar di-review lokal oleh subagen sebelum merge. Key atau kuota secret itu perlu dicek Fatmuh.

   **Perlu uji manual Fatmuh** dengan installer terbaru:
   - Dari sesi Claude baru, prompt "buatkan landing page menggunakan lakar". Kerangka seksi muncul dengan shimmer, lalu terisi per blok secara live.
   - Dua agen (Claude Code dan Codex) tampil dengan warna dan nama masing-masing.
   - Upgrade installer saat aplikasi dan sesi MCP sedang berjalan berhasil tanpa dialog error.
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
