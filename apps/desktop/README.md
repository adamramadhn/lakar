# Lakar desktop (`apps/desktop`)

Aplikasi desktop Tauri v2 untuk Windows, macOS, dan Linux. Aplikasi ini menjalankan `lakard` di komputer pengguna, lalu menampilkan viewer dari daemon itu. `lakard` di VPS tetap menjadi target bench/G1; aplikasi ini hanya tambahan.

## Cara kerja

- **Sidecar.** Runtime Node 26 resmi dibundel sebagai `externalBin` `lakar-node`. Daemon dan server MCP ikut sebagai resource, dari hasil `pnpm deploy --prod` (node-linker hoisted, tanpa symlink) di `resources/sidecar/{daemon,mcp,viewer}`.
  - Node SEA tidak dipakai. Daemon membaca banyak file saat runtime: font `@fontsource`, dist render yang disajikan ke browser, dist viewer, skill, data ikon, dan wasm quickjs. SEA butuh bundler dan VFS aset, padahal ukuran tetap didominasi biner Node.
- **Render.** Aplikasi memakai Chrome atau Edge yang sudah terpasang (`LAKAR_BROWSER_CHANNEL=auto`), tanpa chromium-headless-shell. Bila keduanya tidak ada, layar mulai dan halaman Connections menampilkan pesan.
- **Data.** Data disimpan di direktori app-data OS (`<app-local-data>/data`). Config ada di `<app-config>/config.toml`, dan log daemon di `<app-log>/lakard.log`. Daemon hanya mendengarkan `127.0.0.1`, di port 7466. Bila port itu terpakai, aplikasi memakai port cadangan yang dipakai terakhir kali (disimpan di `<app-local-data>/port`), atau port bebas baru.
- **Tray.** Menutup jendela hanya menyembunyikannya, dan daemon tetap jalan. Menu tray berisi Open Lakar, Restart lakard, dan Quit Lakar. Quit menutup stdin daemon (`LAKAR_EXIT_ON_STDIN_CLOSE=1`) agar daemon berhenti dengan rapi; daemon juga berhenti sendiri bila aplikasi mati.
- **MCP.** Halaman *Settings → Connections* di viewer menampilkan config MCP untuk harness. Config itu menunjuk ke `lakar-node` dan server MCP yang dibundel, dengan `LAKAR_URL` daemon lokal. Di AppImage (mount baru setiap peluncuran) dan macOS App Translocation, runtime + server MCP disalin dulu ke `<app-local-data>/runtime/<versi>` agar path di config tetap berlaku.
- **Pengawasan.** Bila lakard berhenti tiba-tiba, jendela kembali ke layar mulai dengan pesan dan tombol Restart.

## Build lokal

Prasyarat: Node 26, pnpm 12, toolchain Rust stable, dan [prasyarat Tauri](https://v2.tauri.app/start/prerequisites/) untuk OS Anda.

```sh
pnpm install
pnpm build                                          # dist daemon, mcp, render, viewer
node apps/desktop/scripts/prepare-sidecar.mjs       # deploy sidecar + unduh Node (SHA256 diverifikasi)
pnpm --filter @lakar/desktop tauri build            # installer di src-tauri/target/release/bundle
pnpm --filter @lakar/desktop tauri dev              # mode pengembangan
```

`prepare-sidecar.mjs --target <triple>` menyiapkan Node untuk target lain, misalnya `x86_64-apple-darwin` di Mac arm64.

## Rilis (`.github/workflows/release.yml`)

- **Push tag `v*`.** Workflow membangun installer `.msi`/`-setup.exe` (Windows x64), `.dmg` (macOS arm64 dan x64), serta `.AppImage`/`.deb` (Linux x64), lalu mengunggahnya ke GitHub Release bersama `SHA256SUMS.txt`. Tag yang mengandung `-` menjadi pre-release. Versi aplikasi diambil dari tag bila berbentuk `x.y.z`.
- **Smoke test.** Setiap target menjalankan `scripts/smoke-sidecar.mjs`: daemon + MCP hasil bundel dijalankan seperti di aplikasi (status, connections, `/app/`, `read_skill`, `icon_search`, berhenti saat stdin ditutup).
- **`workflow_dispatch`.** Workflow hanya membangun; installer tersedia sebagai artefak run.
- **Cek PR.** `desktop-check.yml` menjalankan `cargo clippy` dan `cargo test` hanya bila `apps/desktop/**` atau workflow desktop berubah. CI utama (`ci.yml`) tidak menyentuh Rust.

### Signing (opsional)

Tanpa secret, build tetap jalan tanpa tanda tangan. macOS memakai tanda tangan ad-hoc. Pengguna mungkin perlu menjalankan `xattr -cr /Applications/Lakar.app` atau melewati SmartScreen di Windows.

| Secret | Fungsi |
|---|---|
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` | Sertifikat Developer ID (.p12, base64) |
| `APPLE_SIGNING_IDENTITY` | Mis. `Developer ID Application: Nama (TEAMID)` |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Notarisasi (app-specific password) |
| `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD` | Sertifikat code signing (.pfx, base64) |
