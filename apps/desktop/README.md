# Lakar desktop (`apps/desktop`)

Aplikasi desktop Tauri v2 untuk Windows, macOS, dan Linux. Aplikasi ini menjalankan `lakard` di komputer pengguna, lalu menampilkan viewer dari daemon itu. `lakard` di VPS tetap menjadi target bench/G1; aplikasi ini hanya tambahan.

## Cara kerja

- **Sidecar.** Runtime Node 26 resmi dibundel sebagai `externalBin` `lakar-node`. Daemon dan server MCP ikut sebagai resource, dari hasil `pnpm deploy --prod` (node-linker hoisted, tanpa symlink) di `resources/sidecar/{daemon,mcp,viewer}`.
  - Node SEA tidak dipakai. Daemon membaca banyak file saat runtime: font `@fontsource`, dist render yang disajikan ke browser, dist viewer, skill, data ikon, dan wasm quickjs. SEA butuh bundler dan VFS aset, padahal ukuran tetap didominasi biner Node.
- **Render.** Aplikasi memakai Chrome atau Edge yang sudah terpasang (`LAKAR_BROWSER_CHANNEL=auto`), tanpa chromium-headless-shell. Bila keduanya tidak ada, layar mulai dan halaman Connections menampilkan pesan.
- **Data.** Data disimpan di direktori app-data OS (`<app-local-data>/data`). Config ada di `<app-config>/config.toml`, dan log daemon di `<app-log>/lakard.log`. Daemon hanya mendengarkan `127.0.0.1`, di port 7466. Bila port itu terpakai, aplikasi memakai port cadangan yang dipakai terakhir kali (disimpan di `<app-local-data>/port`), atau port bebas baru.
- **Tray.** Menutup jendela hanya menyembunyikannya, dan daemon tetap jalan. Menu tray berisi Open Lakar, Restart lakard, dan Quit Lakar. Quit menutup stdin daemon (`LAKAR_EXIT_ON_STDIN_CLOSE=1`) agar daemon berhenti dengan rapi; daemon juga berhenti sendiri bila aplikasi mati.
- **MCP.** Halaman *Settings → Connections* di viewer menampilkan config MCP untuk harness. Config itu menunjuk ke `lakar-node` dan server MCP yang dibundel, dengan `LAKAR_URL` daemon lokal. Di AppImage (mount baru setiap peluncuran) dan macOS App Translocation, runtime + server MCP disalin dulu ke `<app-local-data>/runtime/<versi>` agar path di config tetap berlaku.
- **MCP di Windows.** Windows mengunci executable yang sedang berjalan, sehingga sesi agen yang menjalankan `lakar-node.exe` dari direktori instalasi membuat installer gagal menimpanya. Karena itu `command` config MCP di Windows menunjuk salinan Node di `%LOCALAPPDATA%\id.lakar.desktop\mcp\lakar-node.exe` (env `LAKAR_MCP_NODE` ke daemon), sedangkan `args` tetap ke server MCP di direktori instalasi. Path salinan stabil lintas versi. Aplikasi memperbaruinya saat versi berubah; bila salinan lama masih dijalankan sesi agen, file itu diganti nama menjadi `*.old` dan dihapus pada peluncuran berikutnya. Config lama yang menunjuk `%LOCALAPPDATA%\Lakar\lakar-node.exe` tetap berlaku, tetapi prosesnya dihentikan installer saat upgrade.
- **Installer Windows (NSIS).** Hook `src-tauri/windows/installer-hooks.nsh` (`bundle.windows.nsis.installerHooks`) menjalankan `stop-lakar.ps1` sebelum file disalin atau dihapus. Script itu menghentikan `lakar.exe` dan setiap `lakar-node.exe` yang `ExecutablePath`-nya berada di dalam `$INSTDIR`, lalu menunggu hingga 15 detik sampai executable tidak terkunci. Proses Node lain dan salinan Lakar di direktori lain tidak disentuh. Daemon diberi jeda 2 detik untuk keluar rapi. Bila aplikasi berjalan dan installer interaktif, pengguna ditanya sekali dengan teks template Tauri. Uninstall juga menghentikan salinan Node MCP di app-data, tetapi hanya bila *Delete app data* dicentang. MSI belum memakai hook ini; Windows Installer menangani file terkunci lewat dialog Restart Manager atau penggantian setelah reboot.
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
- **Smoke test installer (Windows).** `scripts/smoke-installer.mjs` memasang installer rilis terakhir (bila ada) dan installer build ini secara senyap (`/S`). Script lalu menjalankan `lakar.exe`, server MCP dari config lama, server MCP dari salinan stabil, dan proses decoy, kemudian memasang ulang di atasnya. Upgrade harus sukses; hanya proses dari direktori instalasi yang berhenti. Terakhir script menguji uninstall senyap saat server MCP berjalan.
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
| `TAURI_SIGNING_PRIVATE_KEY` | Kunci privat updater (isi berkas minisign). Mengaktifkan `bundle.createUpdaterArtifacts` → artefak `*.sig` + `latest.json` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password kunci updater (kosongkan bila tanpa password) |

## Updater otomatis

Aplikasi memakai `tauri-plugin-updater` dengan endpoint statis `latest.json` di GitHub Release (`releases/latest/download/latest.json`, dikonfigurasi di `src-tauri/tauri.conf.json` `plugins.updater`). Pengguna memeriksa dan memasang update dari *Settings → Updates*; banner di Recents menawarkan restart setelah update terunduh. Pemasangan selalu meminta persetujuan — tidak ada update otomatis tanpa interaksi.

- **Kunci.** Kunci privat dibuat sekali di luar repo: `pnpm tauri signer generate -w C:\Users\Fatmuh\.lakar-updater-key\lakar-updater.key` (tanpa password), lalu disimpan sebagai secret repo: `gh secret set TAURI_SIGNING_PRIVATE_KEY < lakar-updater.key` (lewat stdin — jangan pernah di-echo atau di-commit). Cadangkan berkas `.key` di tempat aman; kehilangannya berarti update ke versi baru harus ditandatangani ulang dengan kunci baru dan semua pengguna harus memasang ulang manual. Hanya pubkey (`.key.pub`) yang masuk `tauri.conf.json`.
- **Alur rilis.** Bila `TAURI_SIGNING_PRIVATE_KEY` ada, langkah *Compose Tauri CI config* menambahkan `bundle.createUpdaterArtifacts` di overlay `ci-config.json` (bukan di `tauri.conf.json`, supaya build lokal tanpa kunci tetap jalan). Artefak updater macOS (`Lakar.app.tar.gz{,.sig}`) tidak membawa versi/arch di nama, jadi langkah *Collect installers* menamainya ulang `Lakar_<versi>_<aarch64|x64>.app.tar.gz{,.sig}` (pola nama dmg) agar kedua leg darwin tidak saling menimpa saat merge artifact. Job `latest-json` menggabungkan `*.sig` dari keempat matrix build menjadi `latest.json` lewat `scripts/make-latest-json.mjs` (pemetaan: `-setup.exe` → windows-x86_64, `_x64/_aarch64.app.tar.gz` → darwin-x86_64/aarch64, `.AppImage` → linux-x86_64; `.msi.sig`/`.deb.sig` tidak masuk) dan menyematkan `notes` dari `releases/generate-notes` (best-effort). Job *publish* mengunggahnya ke Release bersama installer dan `*.sig`. Tanpa secret, langkah ini dilewati dengan warning dan rilis tetap terbit; bila secret ada tetapi sig tidak dihasilkan, job `latest-json` gagal eksplisit.
- **UI.** Viewer adalah origin remote, jadi ia memanggil command aplikasi sendiri (`app_version`, `check_update`, `download_update`, `install_update`, `relaunch_app`) lewat `__TAURI__.core.invoke`, bukan JS plugin updater. Bytes unduhan disimpan aplikasi agar "Restart now" tidak mengunduh ulang. Di Windows `installMode: passive` memasang dan memulai ulang aplikasi sendiri.
