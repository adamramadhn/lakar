---
title: 'Updater otomatis aplikasi desktop'
type: feature
ticket: '10'
created: '2026-11-23'
status: in-progress
baseline_revision: '9ece3808caa82247ce5e81b7071771405b68379c'
route: full
route_source: auto
risk: medium
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/design/README.md'
  - '{project-root}/apps/desktop/README.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Aplikasi desktop Lakar tidak punya updater; pengguna harus memasang ulang installer untuk tiap rilis. Ticket 10 epic `epic-adopsi-open-pencil` (verify: `cargo clippy -D warnings` dan `cargo test` hijau; dry run release menghasilkan `.sig` dan `latest.json` valid; UI menangani tersedia/tidak/gagal; tanpa kunci di repo atau log).

**Approach:** Plugin `tauri-plugin-updater` di `apps/desktop` dengan endpoint statis `latest.json` di GitHub Release `fatmuh/lakar`; viewer (di origin remote `http://127.0.0.1`) memanggil command aplikasi sendiri lewat `__TAURI__.core.invoke` (pola `set_ui_theme`, bukan JS plugin, supaya tidak bergantung pada injeksi JS plugin ke origin remote). `release.yml` menandatangani artefak updater (secret `TAURI_SIGNING_PRIVATE_KEY`) dan menerbitkan `latest.json`; UI Settings → Updates dan banner update mengikuti desain Section 11 (`k6R96Q`, `ynWXN`, `b4i13`, `vQY8e`, `mOkHY`).

## Boundaries & Constraints

**Always:**
- Kunci privat updater TIDAK PERNAH di-commit, dicetak, atau di-log. Dibuat lewat `pnpm tauri signer generate -w C:\Users\Fatmuh\.lakar-updater-key\lakar-updater.key` (di luar repo, tanpa password), disimpan sebagai secret repo lewat `gh secret set TAURI_SIGNING_PRIVATE_KEY < file` (stdin, tidak di-echo); hanya pubkey yang masuk `tauri.conf.json`.
- `bundle.createUpdaterArtifacts` hanya di overlay `ci-config.json` CI dan hanya bila secret ada; build `pnpm tauri build` lokal tanpa kunci tetap jalan.
- Perubahan `release.yml` aditif: semua langkah yang ada tetap berjalan tanpa secret baru.
- Teks UI Inggris; komentar kode dan spec Indonesia. Viewer remote hanya mendapat izin command baru di `viewer-window.json` (tidak menambah izin lain).
- Viewer tidak bergantung pada `@lakar/core`/`@lakar/exec`/`@lakar/icons` (dependency-direction).
- Command baru: `app_version`, `check_update`, `download_update`, `install_update`, `relaunch_app`; `Update` di-Clone keluar `Mutex` sebelum await (guard `std::sync::Mutex` tidak Send).
- `latest.json` dibuat oleh satu skrip `apps/desktop/scripts/make-latest-json.mjs` dari berkas `*.sig` hasil matrix build; dipakai job `latest-json` (semua trigger → artefak run, bisa diverifikasi dry run) dan diunggah ke Release di job publish.

**Never:**
- Mengubah format/nama installer lama (exe, msi, dmg, deb, AppImage tetap) atau route/route respons daemon.
- Mengaktifkan `createUpdaterArtifacts` di `tauri.conf.json` dasar atau mengedit `Cargo.lock` manual (regenerasi lewat cargo).
- Auto-update tanpa interaksi pengguna (banner/panel tetap meminta persetujuan restart); plugin `dialog` tetap nonaktif.
- Dependensi plugin JS updater/process (`@tauri-apps/plugin-*`) di viewer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Check, tidak ada update | `check_update` → `null` | Badge "Up to date" + versi + tombol Check for updates | — |
| Check, ada update | `check_update` → metadata | Badge "Update available", "Download and install", section "What's new in X.Y" | — |
| Check gagal | network/endpoint error | Badge "Check failed" + "Try again" | error ditampilkan di kartu |
| Auto policy + update | `updatePolicy=auto` saat launch | `download_update` di background → banner "ready to install" di Recents | gagal download → state failed di Settings, tanpa banner |
| Restart now | klik banner saat `ready` | `install_update` (bytes tersimpan) → `relaunch_app`; Windows keluar otomatis | — |
| Manual "Download and install" | klik di Settings | `install_update` mengunduh (progress via Channel) + memasang, lalu relaunch | gagal → "Check failed"/error di kartu |
| Setelah restart | app_version == versi tersimpan | Banner "Updated to Lakar X.Y" + "See what's new" + "Dismiss" | — |
| Browser (tanpa `__TAURI__`) | Dashboard/Settings di browser | Tab Updates dan banner tidak tampil | — |
| Rilis bertanda | tag `v*` + secret ada | `.sig` per artefak + `latest.json` (4 platform) terunggah | sig hilang → job latest-json gagal jelas |
| Rilis tanpa secret | tag `v*` tanpa secret | installer tetap terbit; latest.json dilewati dengan warning | tidak gagal |
</intent-contract>

## Code Map

- `apps/desktop/src-tauri/Cargo.toml` — tambah `tauri-plugin-updater = "2.14"` (rilis 2026-10-28); `Cargo.lock` diregenerasi `cargo update -w` (bukan edit manual).
- `apps/desktop/src-tauri/src/main.rs` — `.plugin(tauri_plugin_updater::Builder::new().build())`, `app.manage(PendingUpdate)`; modul `updates` baru (lihat di bawah); tambah 5 command ke `invoke_handler`; tes capability diperbarui.
- `apps/desktop/src-tauri/src/updates.rs` (baru) — `PendingUpdate(Mutex<Option<Pending>>)`, `Pending{update: Update, bytes: Option<Vec<u8>>}`; `UpdateMetadata{version, current_version, notes, pub_date}`; `DownloadEvent` serde `tag="event" content="data"` (`started{contentLength}`, `progress{chunkLength}`, `finished`); command `check_update` (UpdaterExt::updater().check()), `download_update` (download → simpan bytes), `install_update` (bytes → `install(bytes)`; tanpa bytes → `download_and_install`), `relaunch_app` (`app.restart()`), `app_version` (`package_info().version`). Semua `Result<_, String>`.
- `apps/desktop/src-tauri/build.rs` — `COMMANDS` += 5 nama baru.
- `apps/desktop/src-tauri/capabilities/viewer-window.json` — tambah `allow-app-version`, `allow-check-update`, `allow-download-update`, `allow-install-update`, `allow-relaunch-app`.
- `apps/desktop/src-tauri/tauri.conf.json` — `plugins.updater = {pubkey, endpoints:["https://github.com/fatmuh/lakar/releases/latest/download/latest.json"], windows:{installMode:"passive"}}`.
- `.github/workflows/release.yml` — env `HAS_UPDATER_KEY` + `TAURI_SIGNING_PRIVATE_KEY`/`_PASSWORD` di step Build; `createUpdaterArtifacts:true` di Compose config saat kunci ada; Collect menambah `*.sig`, `*.app.tar.gz`; job `latest-json` (needs build, semua trigger) membuat `latest.json` lewat skrip → upload-artifact; publish mengunggahnya bersama installer.
- `apps/desktop/scripts/make-latest-json.mjs` — peta `*_x64-setup.exe.sig`→windows-x86_64 (url `-setup.exe`, NSIS dipilih atas msi), `*_x64.app.tar.gz.sig`→darwin-x86_64, `*_aarch64.app.tar.gz.sig`→darwin-aarch64, `*_amd64.AppImage.sig`→linux-x86_64; arg `--dir --version --tag --repo [--notes-file --out]`; gagal bila 0 sig.
- `packages/viewer/src/updates.ts` (baru) — logika murni + store (pola theme.ts): `isDesktop`, `useUpdateState`, `checkForUpdate`, `downloadUpdate`, `installAndRelaunch`, `dismissUpdated`, `UPDATE_POLICY_KEY`/`parseUpdatePolicy`, `UPDATED_KEY`/persist just-updated; invoke via `desktopInvoke`, Channel via `__TAURI__.core.Channel`.
- `packages/viewer/src/SettingsUpdates.tsx` (baru) — halaman Updates (pola SettingsGeneral + kartu pola `conn-daemon`): Version card, "What's new", Automatic updates (select "Download updates": Automatically/Ask me first, `lakar.viewer.updatePolicy`).
- `packages/viewer/src/UpdateBanner.tsx` (baru) — banner Recents: `ready` (accent-soft, What's new + Restart now) dan `updated` (nada success, See what's new + Dismiss).
- `packages/viewer/src/files.ts` — `UPDATES_HASH='#/settings/updates'` + route `updates`.
- `packages/viewer/src/{SettingsGeneral,Dashboard,App}.tsx` — TABS += Updates (icon `download`), `DashboardPage`, judul dokumen, render `<SettingsUpdates/>` + `<UpdateBanner/>` (recents) + autoCheck sekali saat mount.
- `packages/viewer/src/app.css` — `.update-banner` (varian `accent`/`success`, pola `.offline-banner`), `.update-notes`, `.status-pill.info`.
- `tests/latest-json.test.ts` — spawn `node` pada skrip dengan fixture sig → assert isi JSON (pola release.test.ts, tanpa import .mjs ke typecheck).
- `packages/viewer/src/updates.test.ts` + `SettingsUpdates.dom.test.tsx` — state machine dan tiga state kartu + banner.
- `apps/desktop/README.md` — bagian updater: secret `TAURI_SIGNING_PRIVATE_KEY`, backup kunci di `C:\Users\Fatmuh\.lakar-updater-key\`, alur latest.json.

## Tasks & Acceptance

**Execution:**
- [ ] `apps/desktop/src-tauri/{Cargo.toml,tauri.conf.json}` — dep updater + config plugins.updater (pubkey dari key yang digenerate) — pondasi plugin
- [ ] `apps/desktop/src-tauri/src/{main.rs,updates.rs,build.rs}` + `capabilities/viewer-window.json` + `Cargo.lock` — plugin, command, izin — sisi native
- [ ] `apps/desktop/scripts/make-latest-json.mjs` + `tests/latest-json.test.ts` — generator latest.json — kontrak release
- [ ] `packages/viewer/src/updates.ts` + `updates.test.ts` — store/state machine updater — logika UI
- [ ] `packages/viewer/src/{SettingsUpdates,UpdateBanner}.tsx` + `files.ts` + `SettingsGeneral.tsx` + `Dashboard.tsx` + `App.tsx` + `app.css` + `SettingsUpdates.dom.test.tsx` — UI desain Section 11 — permukaan pengguna
- [ ] `.github/workflows/release.yml` — signing + job latest-json + publish — distribusi
- [ ] Generate key + `gh secret set TAURI_SIGNING_PRIVATE_KEY` + pubkey ke `tauri.conf.json`; `apps/desktop/README.md` — operasional kunci
- [ ] Dry run: trigger `push` sementara ke branch → verifikasi artefak `.sig` + `latest.json` di run → hapus trigger

**Acceptance Criteria:**
- Given build lokal tanpa `TAURI_SIGNING_PRIVATE_KEY`, when `pnpm tauri build`, then build sukses dan tidak mencoba menandatangani.
- Given aplikasi desktop dengan update tersedia, when Settings → Updates dibuka, then badge "Update available", tombol "Download and install", dan section "What's new in <versi>" tampil.
- Given check gagal (jaringan/endpoint), when user menekan "Try again", then check diulang; saat sukses "Up to date", saat tetap gagal badge "Check failed" kembali.
- Given `updatePolicy=auto` dan update terunduh, when Recents tampil, then banner "ready to install"; when "Restart now" diklik, then `install_update` + `relaunch_app` terpanggil.
- Given aplikasi habis update, when Recents dimuat, then banner "Updated to Lakar <versi>" tampil; when "Dismiss" diklik, then banner hilang dan tidak muncul lagi.
- Given viewer di browser (tanpa `__TAURI__`), when Dashboard/Settings dirender, then tab Updates dan banner update tidak tampil.
- Given tag `v*` dan secret ada, when release.yml jalan, then artefak `*.sig` dan `latest.json` dengan 4 platform terunggah ke Release.
- Given secret tidak ada, when release.yml jalan di tag atau dispatch, then job build tetap hijau dan `latest.json` dilewati.
- `cargo clippy --locked -D warnings` dan `cargo test --locked` hijau; `pnpm test` tanpa kegagalan baru.

## Design Notes

- Viewer memakai command aplikasi, bukan `__TAURI__.updater`: viewer adalah origin remote `http://127.0.0.1:*` dengan ACL ketat (`viewer-window.json`); jalur `core.invoke` sudah terbukti (`set_ui_theme`), ACL command aplikasi transparan dan dites di main.rs.
- `install_update` menyimpan `bytes` unduhan di `PendingUpdate`: banner "Restart now" memasang tanpa unduh ulang; jalur manual memakai `download_and_install`.
- Tidak ada `tauri-plugin-process`: `app.restart()` mencakup relaunch macOS/Linux; Windows keluar sendiri saat install.
- `windows-x86_64` → `*-setup.exe` (NSIS, hook `installer-hooks.nsh` menghentikan `lakar-node` saat update); `.msi.sig` tetap diunggah tetapi tidak masuk latest.json.
- UI Updates disembunyikan di browser: desain hanya menaungi aplikasi desktop (C6), bukan state "bukan desktop".

## Verification

**Commands:**
- `set "PATH=%TEMP%\lakar-pnpm;%LOCALAPPDATA%\nvm\v26.5.0;%PATH%" && set LAKAR_C7_ALLOW_MISSING_SOURCES=1 && pnpm build && pnpm test` — hijau, tanpa kegagalan baru vs origin/main (baseline Windows ~49–55 gagal lama).
- `cargo clippy --locked --all-targets -- -D warnings` dan `cargo test --locked` di `apps/desktop/src-tauri` — hijau (lokal bila toolchain terpasang; acuan CI `desktop-check.yml`).
- `node apps/desktop/scripts/make-latest-json.mjs --dir <dir-fixture-sig> --version 0.2.0 --tag v0.2.0 --repo fatmuh/lakar` — `latest.json` valid dengan 4 platform.
- `gh workflow run release.yml --ref feat/op-8-10-desktop-updater` (via trigger push sementara) — artefak run berisi `*.sig` dan `latest.json`.
