# AGENTS.md — aturan kerja untuk agen AI di repo Lakar

File ini dibaca otomatis oleh agen di berbagai ADE (Codex, Cursor, Windsurf, Zed, Copilot, Claude Code). Posisi pekerjaan terkini dan langkah berikutnya ada di [HANDOVER.md](HANDOVER.md).

## Apa itu Lakar

Lakar adalah alat desain berbasis AI.

- **Agen.** Agen di harness terpisah (Claude Code, Codex, klien ACP) mendesain lewat server MCP stdio `lakar` (`packages/mcp`). Server ini meneruskan permintaan ke daemon HTTP `lakard` (`packages/daemon`, fastify, `127.0.0.1:7466`, hanya loopback).
- **Render.** `lakard` merender dengan playwright-core. Default-nya chromium-headless-shell, yang dipakai bench di VPS. Aplikasi desktop memakai Chrome/Edge sistem lewat `LAKAR_BROWSER_CHANNEL=auto`.
- **Viewer.** `packages/viewer` (Vite + React) disajikan `lakard` di `/app/`. Sejak 2026-11-21 viewer juga bisa mengedit langsung: file, folder, page, layer, export, dan restore. Aplikasi sengaja tidak punya kotak prompt.
- **Desktop.** `apps/desktop` adalah Tauri v2. `lakard` berjalan sebagai sidecar (Node 26 dibundel + hasil `pnpm deploy`). Ada tray, single-instance, dan window chrome sendiri.
- **Desain.** `design/lakar-ui.pen` adalah sumber kebenaran visual. File ini terenkripsi, jadi buka hanya dengan aplikasi Pencil (pen.dev) atau tool MCP Pencil. Jangan dibaca atau diubah sebagai teks.
- **Cloud (private).** `services/api` + `services/sync` + `deploy/` dipindah ke repo private `fatmuh/lakar-cloud` (lisensi terpisah — repo ini MIT). Repo itu memasang repo ini sebagai git submodule `lakar/`; `@lakar/schema`/`@lakar/core` tetap di-resolve lewat workspace di sana. Klien cloud tetap di sini: viewer rooms/bridge, daemon `room-client.ts`, mcp `sync-client.ts`. Tes e2e yang menjalankan server sync sungguhan ikut pindah ke `tests/` di repo private.

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

- **Route dan tool lama kompatibel mundur** (sejak 2026-11-22, AD-4 di `_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md`). Pembekuan demi bench G1 dicabut.
  - Tetap dijaga: nama tool MCP dan route lama, input yang dulu valid (termasuk node v2 dan token datar di `setTokens`), kode error, status HTTP, dan default config yang membuat config lama tetap berlaku.
  - Respons hanya boleh bertambah field. Pesan dan hint error boleh diperbaiki, dan tesnya diperbarui di PR yang sama.
  - Route baru diletakkan di bawah `/viewer/*` (lihat `packages/daemon/src/files.ts`). Perubahan yang memutus kompatibilitas butuh persetujuan Fatmuh.
- **Model dokumen.** Spine `architecture-model-dokumen` (AD-1 sampai AD-17) mengikat semua epic `initiative-lakar-paper`:
  - JSON bertipe dengan semantik CSS, tanpa HTML/CSS mentah;
  - semua tulis lewat op `core`;
  - setiap perubahan skema menaikkan `schemaVersion` disertai migrasi.
- **Arah dependensi.** `tests/dependency-direction.test.ts` melarang viewer bergantung pada `@lakar/core`, `@lakar/exec`, atau `@lakar/icons`. AD-17 mengizinkan viewer bergantung pada `render` dan `codegen`; `EDGES` diperluas saat paket itu dipakai. Tes yang perlu sandbox asli diletakkan di `tests/` dan mengimpor lewat path relatif ke `packages/*/src`.
- **Route tulis `/viewer/*`** dilindungi guard Origin (CSRF localhost). Request lintas-origin ditolak 403.
- **Bahasa.**
  - Bahasa Indonesia: spec, dokumen, dan komentar kode.
  - Bahasa Inggris: commit message, judul dan isi PR, serta teks UI.
- **TypeScript strict.** Aplikasi berjalan lokal untuk satu pengguna, tanpa akun.

## Jebakan yang sudah diketahui

- **Windows.**
  - `fsync` direktori dan `ftruncate` pada handle append ditolak `EPERM`. `store.ts` sudah menanganinya (commit `1b6b60c`).
  - Sisa kegagalan tes yang khas Windows: SIGTERM/SIGKILL, izin file key foto, ukuran skill akibat CRLF, dan URL ESM `d:`. **CI Linux adalah acuan.**
  - Node 26 mungkin tidak ada di PATH. nvm memasangnya di `C:\Users\Fatmuh\AppData\Local\nvm\v26.5.0`. pnpm bisa dijalankan lewat `npx -y pnpm@12.21.0`.
  - `design/lakar-ui.pen` berupa teks JSON, jadi git menormalkan CRLF-nya di Windows. Perubahan ini tidak berbahaya.
- **Sumber C7 dan juri.** Tidak ada di repo. CI memakai `LAKAR_C7_ALLOW_MISSING_SOURCES=1`.
- **Release.**
  - `.github/workflows/release.yml`: tag `v*` membangun installer dan menerbitkannya. `workflow_dispatch` membangun saja, tetapi baru bisa dipicu setelah file workflow ada di `main`.
  - `.github/workflows/nightly.yml`: tiap malam (01:00 WIB) + `workflow_dispatch` memanggil `release.yml` dengan `nightly: true` — build tip `dev` dan menerbitkan rilis pra-rilis `nightly-<ts>` baru (tag unik; repo mengaktifkan *immutable releases* sehingga tag bergulir mustahil — tag tak bisa dipindah/dihapus/dipakai ulang). Feed `latest.json` nightly di-push ke branch `nightly-feed` setelah rilis terbit, lalu rilis `nightly-*` lama dihapus. Pointer `latest` updater stabil tidak terpengaruh. Fitur baru masuk `dev` dulu, `main` hanya untuk rilis stabil bertag `v*`.
  - Untuk menguji release di branch lain, tambahkan trigger `push` sementara ke branch itu, lalu hapus lagi di commit berikutnya.
- **Desktop.** `desktop-check.yml` menjalankan `cargo clippy -D warnings` dan `cargo test` untuk PR yang menyentuh `apps/desktop`.
- **Viewer.** Viewer memakai satu stream `/viewer/events` per jendela lewat `activityHub` (`packages/viewer/src/activity.ts`). Jangan membuka `EventSource` sendiri, karena jumlah koneksi HTTP/1.1 per host terbatas.

## Proses kerja

- Setiap perubahan bermakna ditulis sebagai spec BMAD di `_bmad-output/implementation-artifacts/spec-*.md`: intent, batasan, matriks kasus, Code Map, tugas, dan triage review. Item yang ditunda dicatat di `deferred-work.md`.
- Skill BMAD v6 ada di `.claude/skills/` dan bisa dibaca sebagai panduan oleh agen lain.
- Branch dan PR: kerjakan di branch fitur, buka PR dengan judul dan isi berbahasa Inggris, dan pastikan CI hijau sebelum merge.
