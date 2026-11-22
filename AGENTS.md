# AGENTS.md — aturan kerja untuk agen AI di repo Lakar

File ini dibaca otomatis oleh agen di berbagai ADE (Codex, Cursor, Windsurf, Zed, Copilot, Claude Code). Posisi pekerjaan terkini dan langkah berikutnya ada di [HANDOVER.md](HANDOVER.md).

## Apa itu Lakar

Lakar adalah alat desain berbasis AI.

- **Agen.** Agen di harness terpisah (Claude Code, Codex, klien ACP) mendesain lewat server MCP stdio `lakar` (`packages/mcp`). Server ini meneruskan permintaan ke daemon HTTP `lakard` (`packages/daemon`, fastify, `127.0.0.1:7466`, hanya loopback).
- **Render.** `lakard` merender dengan playwright-core. Default-nya chromium-headless-shell, yang dipakai bench di VPS. Aplikasi desktop memakai Chrome/Edge sistem lewat `LAKAR_BROWSER_CHANNEL=auto`.
- **Viewer.** `packages/viewer` (Vite + React) disajikan `lakard` di `/app/`. Sejak 2026-11-21 viewer juga bisa mengedit langsung: file, folder, page, layer, export, dan restore. Aplikasi sengaja tidak punya kotak prompt.
- **Desktop.** `apps/desktop` adalah Tauri v2. `lakard` berjalan sebagai sidecar (Node 26 dibundel + hasil `pnpm deploy`). Ada tray, single-instance, dan window chrome sendiri.
- **Desain.** `design/lakar-ui.pen` adalah sumber kebenaran visual. File ini terenkripsi, jadi buka hanya dengan aplikasi Pencil (pen.dev) atau tool MCP Pencil. Jangan dibaca atau diubah sebagai teks.

## Perintah

```sh
pnpm install
pnpm build          # tsc -b + build viewer (wajib sebelum menjalankan daemon atau tes yang memakai dist)
pnpm test           # typecheck tes + vitest
pnpm lakard         # jalankan daemon (viewer: http://127.0.0.1:7466/app/)
```

- Prasyarat: Node ≥ 26 dan pnpm 12.21.0 (`packageManager` di `package.json`).
- Desktop butuh toolchain Rust dan prasyarat Tauri. Lihat [apps/desktop/README.md](apps/desktop/README.md), termasuk `scripts/prepare-sidecar.mjs` dan `scripts/smoke-sidecar.mjs`.
- Menjalankan daemon lokal dengan render di Windows: `LAKAR_BROWSER_CHANNEL=msedge LAKAR_PORT=<port> LAKAR_DATA_DIR=<dir sementara> node packages/daemon/dist/main.js`.

## Aturan yang tidak boleh dilanggar

- **Route dan tool lama dibekukan.** Route daemon lama, bentuk respons, pesan error, dan tool MCP dipakai bench G1. Hanya boleh menambah route baru, misalnya di bawah `/viewer/*` (lihat `packages/daemon/src/files.ts`), atau field opsional baru. Default config daemon juga tidak boleh berubah.
- **Arah dependensi.** `tests/dependency-direction.test.ts` melarang viewer bergantung pada `@lakar/core`, `@lakar/exec`, atau `@lakar/icons`. Tes yang perlu sandbox asli diletakkan di `tests/` dan mengimpor lewat path relatif ke `packages/*/src`.
- **Route tulis `/viewer/*`** dilindungi guard Origin (CSRF localhost). Request lintas-origin ditolak 403.
- **Bahasa.**
  - Bahasa Indonesia: spec, dokumen, dan komentar kode.
  - Bahasa Inggris: commit message, judul dan isi PR, serta teks UI.
- **TypeScript strict.** Aplikasi berjalan lokal untuk satu pengguna, tanpa akun.

## Jebakan yang sudah diketahui

- **Windows.**
  - `fsync` direktori dan `ftruncate` pada handle append ditolak `EPERM`. `store.ts` sudah menanganinya (commit `1b6b60c`).
  - Sisa kegagalan tes yang khas Windows: SIGTERM/SIGKILL, izin file key foto, ukuran skill akibat CRLF, dan URL ESM `d:`. **CI Linux adalah acuan.**
- **Sumber C7 dan juri.** Tidak ada di repo. CI memakai `LAKAR_C7_ALLOW_MISSING_SOURCES=1`.
- **Release.**
  - `.github/workflows/release.yml`: tag `v*` membangun installer dan menerbitkannya. `workflow_dispatch` membangun saja, tetapi baru bisa dipicu setelah file workflow ada di `main`.
  - Untuk menguji release di branch lain, tambahkan trigger `push` sementara ke branch itu, lalu hapus lagi di commit berikutnya.
- **Desktop.** `desktop-check.yml` menjalankan `cargo clippy -D warnings` dan `cargo test` untuk PR yang menyentuh `apps/desktop`.
- **Viewer.** Viewer memakai satu stream `/viewer/events` per jendela lewat `activityHub` (`packages/viewer/src/activity.ts`). Jangan membuka `EventSource` sendiri, karena jumlah koneksi HTTP/1.1 per host terbatas.

## Proses kerja

- Setiap perubahan bermakna ditulis sebagai spec BMAD di `_bmad-output/implementation-artifacts/spec-*.md`: intent, batasan, matriks kasus, Code Map, tugas, dan triage review. Item yang ditunda dicatat di `deferred-work.md`.
- Skill BMAD v6 ada di `.claude/skills/` dan bisa dibaca sebagai panduan oleh agen lain.
- Branch dan PR: kerjakan di branch fitur, buka PR dengan judul dan isi berbahasa Inggris, dan pastikan CI hijau sebelum merge.
