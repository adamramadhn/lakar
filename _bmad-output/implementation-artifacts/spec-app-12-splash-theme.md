---
title: 'Aplikasi 12: layar mulai desktop mengikuti tema Light/Dark dari Settings'
type: 'bugfix'
created: '2026-11-22'
status: 'in-review'
baseline_commit: '93e3a6fe7b3593efbc89a2fc43d49dd891263365'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Layar mulai desktop (`apps/desktop/ui/index.html`) hanya mengikuti `prefers-color-scheme` OS, bukan pilihan Light/Dark di Settings → General (localStorage viewer `lakar.viewer.theme`). Layar mulai berasal dari origin lain (`tauri.localhost` / `tauri://localhost`) daripada viewer (`http://127.0.0.1:<port>/app/`) dan dimuat sebelum viewer, sehingga tidak bisa membaca pilihan itu: paint pertama bisa berwarna kebalikan (asal: deferred-work, spec-app-6).

**Approach:** Viewer di aplikasi desktop mengirim pilihannya ke command Tauri `set_ui_theme`. Rust menyimpannya di `<app-config>/theme`, dan sebelum jendela dibuat menyetel tema native jendela (`WindowConfig.theme`) serta warna latar native (`background_color`). Webview mengikuti tema native, sehingga `prefers-color-scheme` di layar mulai sudah benar sejak paint pertama tanpa mengubah CSS-nya. `system` = tanpa tema native (ikut OS, perilaku lama).

## Boundaries & Constraints

**Always:**
- `system` tetap mengikuti `prefers-color-scheme` OS, termasuk saat OS berubah.
- Viewer mendeteksi desktop lewat `window.__TAURI__.core.invoke` (tanpa `@tauri-apps/api`), sama seperti `TitleBar.tsx`. Kegagalan IPC tidak pernah memblokir penerapan tema.
- Capability minimal: viewer remote hanya mendapat `allow-set-ui-theme`. Layar mulai lokal mendapat `allow-daemon-state` dan `allow-restart-daemon`, yang wajib setelah ada manifest ACL aplikasi.
- Komentar Indonesia, TypeScript strict.

**Never:**
- Tidak mengubah route daemon, `files.ts`, `api.ts`, atau `Dashboard.tsx`. Tidak menambah dependensi npm atau crate.
- Tidak membaca localStorage viewer dari Rust atau dari layar mulai (origin berbeda).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dark, OS terang | file `theme` = `dark` | jendela dibuat dengan tema Dark + latar `#111113`; layar mulai gelap | N/A |
| Light, OS gelap | file `theme` = `light` | tema Light + latar `#fafafa`; layar mulai terang | N/A |
| System | `system`, file tidak ada, atau isi rusak | tanpa tema/latar native; ikut OS | baca gagal → `System` |
| Ganti di Settings | viewer `setTheme('dark')` | `set_ui_theme('dark')`: file ditulis, tema jendela langsung berubah | invoke ditolak/melempar → diabaikan |
| Pilihan lama | localStorage sudah `dark` sebelum fitur ini | `initTheme` mengirim pilihan sekali saat viewer dimuat | N/A |
| Nilai asing | `set_ui_theme('blue')` | ditolak dengan error, file tidak berubah | N/A |
| Browser biasa | tanpa `__TAURI__` | tidak ada IPC | N/A |

</frozen-after-approval>

## Code Map

- `packages/viewer/src/theme.ts` -- `initTheme`/`update`: tempat sinkron ke desktop. `desktopInvoke` adalah helper murni.
- `apps/desktop/src-tauri/src/main.rs` -- `build_main_window` (konfigurasi jendela sebelum dibuat), `invoke_handler`, `mod tests`.
- `apps/desktop/src-tauri/build.rs` -- manifest ACL aplikasi (`AppManifest::commands`).
- `apps/desktop/src-tauri/capabilities/{default,viewer-window}.json` -- izin per origin.
- `apps/desktop/ui/index.html` -- layar mulai. CSS tetap `prefers-color-scheme`.

## Tasks & Acceptance

**Execution:**
- [x] `apps/desktop/src-tauri/src/main.rs` -- `UiTheme`, `parse_ui_theme`, `native_theme`, `window_background`, `apply_ui_theme`, `read_ui_theme`, command async `set_ui_theme`, dan penerapan di `build_main_window`. Tes untuk helper dan capability.
- [x] `apps/desktop/src-tauri/build.rs` -- manifest ACL dengan `daemon_state`, `restart_daemon`, dan `set_ui_theme`.
- [x] `apps/desktop/src-tauri/capabilities/*.json` -- `allow-daemon-state` dan `allow-restart-daemon` di `default`, `allow-set-ui-theme` di `viewer-window`.
- [x] `packages/viewer/src/theme.ts` + `theme.test.ts` -- `desktopInvoke`, plus `syncDesktop` saat init dan saat pilihan berubah. Tes kirim, tidak kirim ulang, dan gagal IPC.
- [x] `apps/desktop/ui/index.html` -- komentar asal tema (tanpa perubahan perilaku).

**Acceptance Criteria:**
- Given OS terang dan Settings = Dark, when aplikasi ditutup lewat tray lalu dibuka lagi, then layar mulai langsung gelap tanpa kilatan terang.
- Given OS gelap dan Settings = Light, when aplikasi dibuka ulang, then layar mulai terang.
- Given Settings = System, when tema OS berubah, then layar mulai dan viewer ikut OS.

## Implementation Notes

- Pendekatan dipilih karena paling sederhana di tiga OS. Tema native diteruskan ke webview oleh Tauri: di Windows, tauri-runtime-wry memakai `window.theme()` saat membuat WebView2 dan meneruskan `ThemeChanged` ke `webview.set_theme`. Di macOS, WKWebView mengikuti NSAppearance. Di Linux, WebKitGTK mengikuti preferensi gelap GTK. Jadi `prefers-color-scheme` layar mulai sudah benar sebelum JS berjalan. Alternatif yang ditolak:
  - query URL atau `initialization_script`: statis per jendela dan basi setelah pilihan berubah dalam sesi yang sama.
  - membaca tema lewat `daemon_state` di layar mulai: async, jadi paint pertama masih salah.
- Manifest ACL wajib: Tauri 2.12 (`webview/mod.rs`, `plugin_command || has_app_acl_manifest || !is_local`) menolak setiap command dari origin remote yang tidak diizinkan ACL. Tanpa manifest, viewer tidak bisa memanggil command aplikasi sama sekali. Dengan manifest, command layar mulai juga harus diizinkan eksplisit di `default.json` (dijaga tes `start_screen_capability_has_window_controls` dan `build_manifest_lists_every_command`).
- Latar native memakai `--bg` layar mulai (`#fafafa` / `#111113`), bukan `--bg` viewer gelap (`#232323`), karena yang ter-paint pertama adalah layar mulai.
- Toolchain Rust tidak terpasang di mesin pengembangan ini. `cargo clippy` dan `cargo test` dijalankan oleh CI `desktop-check.yml`. Signature API diperiksa terhadap sumber tauri 2.12.7, tauri-runtime-wry 2.12.5, dan tauri-build 2.7.

## Review Triage Log

| # | Sumber | Temuan | Verdict | Bukti / rute |
|---|--------|--------|---------|--------------|
| 1 | self | Viewer memanggil `set_ui_theme` setiap dimuat → menulis file setiap kali | low | Tulis hanya bila isi berbeda → patch |
| 2 | self | Linux: WebKitGTK mungkin tidak mengikuti preferensi gelap GTK | maybe-false | Perlu build release Linux → defer |
| 3 | self | Tema native Dark saat viewer = Light: kontrol bawaan/scrollbar viewer mengikuti `color-scheme` token, bukan OS | false | `tokens.css` menyetel `color-scheme` per `data-theme` |
| 4 | self | `daemon_state`/`restart_daemon` dulu bisa dipanggil viewer? | false | Sudah ditolak sebelumnya (`!is_local` tanpa ACL); sekarang dikunci eksplisit hanya untuk layar mulai |

## Verification

**Commands:**
- `pnpm build` -- expected: sukses
- `pnpm test` (`LAKAR_C7_ALLOW_MISSING_SOURCES=1`) -- expected: tidak ada kegagalan baru dibanding baseline Windows. `theme.test.ts` hijau.
- `cargo clippy --all-targets -- -D warnings` dan `cargo test` di `apps/desktop/src-tauri` -- expected: hijau (CI).

**Manual checks:**
- Installer nyata: OS terang, Settings → Dark, Quit dari tray, buka lagi → layar mulai gelap. Lalu OS gelap, Settings → Light → layar mulai terang. Lalu System → ikut OS.
