---
title: 'Rilis desktop pertama Lakar (Tauri v2 + sidecar lakard)'
type: 'feature'
created: '2026-11-21'
status: 'in-progress'
baseline_commit: 'dd4e339dfd06f8df695e5952c7fb0694f7e66cd2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/initiative-lakar/sprint-change-proposal-2026-11-21.md'
  - '{project-root}/design/README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Lakar hanya berjalan sebagai `lakard` di VPS atau dari checkout repo. Pengguna desktop belum punya installer, dan harness tidak tahu config MCP yang harus dipakai untuk daemon lokal.

**Approach:** Aplikasi `apps/desktop` (Tauri v2, ukuran terkecil) menjalankan `lakard` sebagai sidecar (runtime Node 26 dibundel + hasil `pnpm deploy` daemon dan mcp), merender dengan Chrome/Edge sistem, membuka viewer `/app/`, dan punya ikon tray. Halaman Connections di viewer menampilkan config MCP. `release.yml` membangun installer tiga OS lewat GitHub Actions.

## Boundaries & Constraints

**Always:**
- Keputusan sidecar: **runtime Node 26 dibundel** (sidecar `lakar-node`, `externalBin` Tauri) + direktori hasil `pnpm deploy --prod` (node-linker hoisted, tanpa symlink) sebagai resource. Node SEA ditolak: daemon membaca banyak file saat runtime (font `@fontsource` lewat `import.meta.resolve`, dist render yang disajikan ke halaman browser, dist viewer, skill, data ikon, wasm quickjs), jadi SEA butuh bundler + VFS aset; penghematannya nol karena biner Node tetap dominan.
- Opsi daemon baru saja, default lama tidak berubah: `browser_channel` / `LAKAR_BROWSER_CHANNEL` (`chrome`, `msedge`, `auto`; kosong = chromium-headless-shell seperti sekarang), `viewer_dir` / `LAKAR_VIEWER_DIR`, `mcp_entry` / `LAKAR_MCP_ENTRY`, dan env `LAKAR_EXIT_ON_STDIN_CLOSE=1` (daemon berhenti saat stdin ditutup, agar tidak jadi yatim bila aplikasi mati).
- Browser sistem tidak ditemukan → pesan jelas "Chrome atau Edge tidak ditemukan …" di `pool.lastError`, di layar mulai aplikasi, dan di halaman Connections.
- Data di direktori app-data OS; daemon tetap 127.0.0.1 (AD-14). Port 7466; bila terpakai, port bebas lain (Connections menampilkan URL sebenarnya).
- Satu instance aplikasi; menutup jendela menyembunyikannya, daemon tetap jalan; "Keluar" di tray menghentikan daemon.
- Release: matrix windows-latest (x64), macos-latest arm64 dan x64, ubuntu-latest; tag `v*` → GitHub Release; `workflow_dispatch` → artefak saja. Signing hanya bila secret ada.
- Teks UI viewer berbahasa Inggris (mengikuti desain); spec/komentar berbahasa Indonesia.

**Never:**
- Mengubah default daemon (headless-shell, port, data dir) atau route/respons lama; menyentuh Activity/History viewer dan `/viewer/events`/history (milik viewer-slice-2).
- Membundel chromium-headless-shell di aplikasi desktop.
- Daftar "Connected agents" per harness (butuh identitas harness, belum ada); auto-update.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Channel auto | `LAKAR_BROWSER_CHANNEL=auto`, Chrome ada | pool siap memakai Chrome | Chrome gagal → coba Edge → (Linux) chromium sistem |
| Tanpa browser | `auto`, tidak ada Chrome/Edge | pool `lastError` = pesan jelas berbahasa Indonesia | layar mulai menampilkan pesan + tombol lanjut |
| Channel tidak valid | `LAKAR_BROWSER_CHANNEL=firefox` | daemon gagal start dengan pesan nilai valid | exit 1 |
| Config koneksi | `GET /viewer/connections` | `{url, mcp:{command,args,env:{LAKAR_URL}}|null}` | `mcp:null` bila entry mcp tidak ditemukan |
| Stdin ditutup | `LAKAR_EXIT_ON_STDIN_CLOSE=1`, parent mati | daemon shutdown rapi | timeout paksa 5 s seperti SIGTERM |
| Port terpakai | 7466 dipakai proses lain | aplikasi memakai port bebas | N/A |

</frozen-after-approval>

## Code Map

- `packages/daemon/src/config.ts` -- `KEYS`, `loadConfig`, `DaemonConfig`: tambah kunci `browser_channel`, `viewer_dir`, `mcp_entry` (validasi channel).
- `packages/daemon/src/chromium.ts` -- `ChromiumRenderer` `launch`: default tetap `chromium.launch({headless,...})` dengan `PLAYWRIGHT_BROWSERS_PATH`; channel → `channel`, auto → urutan coba, error ringkas.
- `packages/daemon/src/start.ts` -- teruskan channel ke renderer.
- `packages/daemon/src/main.ts` -- shutdown saat stdin `end` bila env diset.
- `packages/daemon/src/server.ts` -- daftarkan route baru (satu baris, dekat `registerViewerRoutes`); jangan ubah route lama.
- `packages/daemon/src/viewer.ts` -- JANGAN diubah (slice-2 mengubahnya); route koneksi di file baru `connections.ts`.
- `packages/skills/package.json` -- `files` belum memuat `skills/` → `pnpm deploy` kehilangan file skill; tambahkan.
- `packages/viewer/src/{App,Dashboard,api}.tsx/ts` -- routing hash `#/`, `#/d/<slug>`; sidebar `connect-card`; tambah `#/settings/connections` dan `Connections.tsx` (desain `lakar-ui.pen` node `e7hIme`: kartu status lakard, "Add an agent" bertab + Copy, "Tools exposed").
- `.github/workflows/ci.yml` -- tetap; cek kompilasi Tauri di workflow terpisah berfilter path.

## Tasks & Acceptance

**Execution:**
- [x] `packages/daemon/src/{config,chromium,start,main,connections,server}.ts` + test -- opsi baru, launch channel, stdin-exit, `GET /viewer/connections` -- sidecar dan helper MCP.
- [x] `packages/skills/package.json` -- `files` + `skills` -- deploy lengkap.
- [x] `packages/viewer/src/Connections.tsx`, `App.tsx`, `Dashboard.tsx`, `api.ts`, `app.css` -- halaman Connections -- helper MCP.
- [x] `apps/desktop/` -- `package.json` (@tauri-apps/cli), `ui/index.html` (layar mulai), `scripts/prepare-sidecar.mjs` (deploy daemon/mcp/viewer + unduh Node 26.13.1 dengan verifikasi SHA256), `src-tauri/` (Cargo.toml, tauri.conf.json, capabilities, src/main.rs: sidecar, tray, single-instance, port, app-data) -- aplikasi.
- [x] `pnpm-workspace.yaml`, `pnpm-lock.yaml` -- masukkan `apps/desktop`.
- [x] `.github/workflows/release.yml`, `.github/workflows/desktop-check.yml` -- rilis dan cek kompilasi.
- [x] `apps/desktop/README.md` -- cara build, signing secret, keputusan sidecar.

**Acceptance Criteria:**
- Given daemon tanpa env baru, when start, then perilaku dan test lama tidak berubah.
- Given aplikasi terpasang dan Chrome/Edge ada, when dibuka, then viewer tampil dari `http://127.0.0.1:<port>/app/` dan render berjalan.
- Given jendela ditutup, when tray "Open Lakar" diklik, then jendela muncul lagi dan daemon tetap sama.
- Given tag `v*`, when release.yml jalan, then installer `.msi`/`.exe`, `.dmg`, `.AppImage`/`.deb` terunggah ke Release; tanpa secret signing workflow tetap hijau.

## Implementation Notes

- Daemon + viewer dikerjakan subagen; `apps/desktop` + workflow dikerjakan sesi utama secara paralel.
- `chromium.ts`: `browserCandidates()` + `launchSystemBrowser()`; `BrowserLaunchError` (pool.ts) membuat `lastError` diawali "Chrome atau Edge tidak ditemukan" tanpa awalan lama. Deteksi "tidak terpasang" memakai teks error Playwright (risiko bila wording berubah).
- `connections.ts` baru (bukan `viewer.ts`, milik slice-2); `server.ts` hanya +1 import +1 baris.
- Viewer: route `#/settings/connections` lewat `Dashboard page="connections"`; `copyText()` dengan fallback `execCommand` untuk WKWebView/WebKitGTK.
- `prepare-sidecar.mjs`: `pnpm deploy --prod --config.node-linker=hoisted` (pnpm 12 tidak butuh `inject-workspace-packages`); pangkas `lucide-static` (`font/`, `sprite.svg`, dist selain esm + entry `main`) dan metadata pnpm → daemon 96 MB, Node 26.13.1 win-x64 95 MB.
- Diuji lokal (Windows, tanpa Rust): sidecar bundel dijalankan dengan `lakar-node.exe` + env desktop → pool siap dengan Edge (fallback `auto`), `/viewer/connections` menunjuk runtime + mcp bundel, `/app/` 200, stdin ditutup → keluar rapi; MCP bundel menjawab `initialize` dan `status`.
- Rust tidak terpasang lokal: `desktop-check.yml` (clippy `-D warnings`) di CI lulus percobaan pertama; `Cargo.lock` diambil dari artefak run itu.
- `workflow_dispatch` hanya bisa dipicu bila workflow ada di branch default, jadi validasi memakai trigger `push` sementara ke branch ini (dihapus sebelum PR siap merge).

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm build && pnpm test` -- hijau di CI Linux (Windows lokal: ~100 kegagalan lama diketahui).
- `gh workflow run release.yml --ref <branch>` -- keempat job membangun installer.
- `desktop-check.yml` -- `cargo check` lulus di PR.
