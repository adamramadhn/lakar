---
title: 'Aplikasi 2: Export PNG dan Copy as CSS/Tailwind/JSON'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: '4f28633f392ac666913457f6d3c33ff2c778a4d3'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/design/README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Viewer belum bisa mengekspor board, dan Inspect hanya punya "Copy as JSON". Desain (`Viewer — Desktop — Export`, panel Inspect) menyediakan popover Export dan Copy as CSS/Tailwind/JSON.

**Approach:** Tombol Export di kanvas membuka popover dengan pilihan board, skala 1x/2x, dan tombol "Export PNG". Byte PNG diambil dari route baru dan diunduh ke folder Downloads, termasuk di aplikasi desktop. Inspect mendapat tombol Copy as CSS, Tailwind, dan JSON yang dihasilkan di sisi klien dari data inspect.

## Boundaries & Constraints

**Always:**
- **Route baru `POST /viewer/docs/:slug/export`** dengan body `{boardId, scale:1|2}`. Route ini merender lewat renderer/pool yang sudah ada, lalu mengembalikan PNG mentah (`content-type: image/png`) dengan header `content-disposition: attachment; filename="<slug>-<board-name>@<scale>x.png"`. Route `POST /export` lama tidak berubah.
- **Popover** sesuai desain: Board (select, default board terpilih atau board pertama), Scale (segmented 1x/2x), info `PNG · W × H px`, dan tombol Export PNG. Saat merender, tombol menampilkan loading. Gagal → pesan error di popover.
- **Unduhan di aplikasi desktop.** File tersimpan di folder Downloads OS lewat handler unduhan Tauri (`on_download` pada jendela utama; tujuan `download_dir()`, nama dari server, tanpa menimpa: `name (2).png`). Setelah selesai, popover menampilkan "Saved to Downloads".
- **Unduhan di browser.** Memakai `<a download>` biasa.
- **Copy as** memakai `copyText()` yang sudah ada:
  - **CSS:** properti dari node terpilih: ukuran, posisi absolut bila ada, fills (solid → `background`, gradient → `linear-gradient`), stroke → `border`, radius, opacity, shadow → `box-shadow`, teks (font-family/size/weight/line-height/letter-spacing/color), layout flex (direction/gap/padding/align).
  - **Tailwind:** kelas dengan nilai arbitrer bila perlu, misalnya `w-[298px] bg-[#F97316]`.
  - **JSON:** perilaku lama.
- Fungsi pemetaan bersifat murni dan diuji.
- Teks UI berbahasa Inggris; spec dan komentar berbahasa Indonesia.

**Never:**
- Format SVG/PDF.
- Mengubah `/export` atau `/screenshot` lama.
- Menulis ke `<dataDir>/exports` dari route baru.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Export 2x | board 1440×900, scale 2 | PNG 2880×1800, attachment | N/A |
| Board tidak ada | boardId salah | 404 `NOT_FOUND` | popover menampilkan pesan |
| Render gagal (browser tidak ada) | pool error | 503 `RENDER_FAILED` retryable | pesan + hint |
| CSS teks | node text Inter 16/600, color #111 | `font-family: Inter; font-size: 16px; font-weight: 600; color: #111111;` | N/A |
| Tailwind frame flex | layout row gap 8 padding 16 | `flex flex-row gap-[8px] p-[16px]` | N/A |

</frozen-after-approval>

## Code Map

- `packages/daemon/src/chromium.ts` -- `ChromiumRenderer.screenshot(doc, boardId, {scale})` mengembalikan PNG; dipakai ulang.
- `packages/daemon/src/server.ts` -- pola route `POST /export` (sekitar :530-558) dan `POST /screenshot`. Route baru masuk ke `files.ts` (batch 1) atau file `export.ts`, didaftarkan dari `server.ts`.
- `packages/viewer/src/Canvas.tsx` -- toolbar (tool select/hand/zoom, :353+); tombol Export di kanan atas kanvas sesuai desain.
- `packages/viewer/src/panels.tsx` -- `InspectPanel` (:68-195), dengan tombol "Copy as → JSON" (:178-184) dan catatan "Read-only…" (:187-190; ubah sesuai desain baru). Tambah `copyas.ts` (fungsi murni) + `copyas.test.ts`.
- `apps/desktop/src-tauri/src/main.rs` -- jendela utama dibuat dari `tauri.conf.json` (label `main`). Untuk `on_download`, buat jendela di `setup` dengan `WebviewWindowBuilder` (hapus dari config, atau `create: false` + `from_config`), sambil mempertahankan URL awal `index.html`, ukuran, dan judul.

## Tasks & Acceptance

**Execution:**
- [x] daemon route export + test.
- [x] `packages/viewer/src/{ExportPopover.tsx,copyas.ts,copyas.test.ts,panels.tsx,Canvas.tsx,api.ts,app.css}`.
- [x] `apps/desktop/src-tauri/src/main.rs` + `tauri.conf.json` -- handler unduhan; `cargo clippy` dan `cargo test` tetap lulus (CI desktop-check).

**Acceptance Criteria:**
- Given Viewer dengan board terpilih, when Export → 2x → Export PNG, then file PNG 2× muncul di Downloads, di browser maupun di aplikasi desktop.
- Given node terpilih, when Copy as CSS/Tailwind, then clipboard berisi teks yang sesuai pemetaan dan tombol menampilkan "Copied".

## Implementation Notes

- Route di `packages/daemon/src/export.ts` (didaftarkan dari `server.ts`); nama board di nama file di-slugify (kosong → id board). Tes di `files.test.ts` menulis dokumen langsung ke disk (tanpa fsync) agar juga jalan di Windows.
- Popover: skala default 1x; daftar board = board halaman aktif kanvas. Pesan "Saved to Downloads" tampil setelah unduhan dipicu (viewer tidak punya IPC untuk tahu kapan Tauri selesai menulis).
- Desktop: `tauri.conf.json` `create: false`; `build_main_window` memakai `WebviewWindowBuilder::from_config` + `on_download` (tujuan `download_dir()` + nama dari webview, `unique_path` → `name (2).png`). Rust tidak dikompilasi lokal; CI desktop-check yang memverifikasi.
- Copy as: token → `var(--nama-token)`; Tailwind memakai petunjuk tipe (`text-[color:var(...)]`) untuk utilitas ambigu. Fill image/noise/mesh tidak dipetakan.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm build && pnpm exec vitest run packages/viewer packages/daemon/src/files.test.ts` -- hijau.
- CI `desktop-check.yml` -- clippy + test lulus.
