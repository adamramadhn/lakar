---
title: 'Upgrade Windows tidak gagal karena lakar-node.exe terkunci'
type: 'bugfix'
created: '2026-11-23'
status: 'built'
baseline_commit: '221b668'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-desktop-release-1.md'
  - '{project-root}/apps/desktop/README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Upgrade v0.1.2 → v0.1.3 dengan `Lakar_0.1.3_x64-setup.exe` berhenti di dialog Abort/Retry/Ignore "Error opening file for writing: C:\Users\<user>\AppData\Local\Lakar\lakar-node.exe". Windows tidak mengizinkan executable yang sedang berjalan ditimpa. Ada dua pemegang:
- (a) daemon sidecar `lakard`, yang tetap hidup di tray setelah jendela ditutup atau menjadi yatim bila `lakar.exe` mati tidak rapi;
- (b) server MCP stdio yang dijalankan Claude Code, Codex, dan harness lain. Settings → Connections menyuruh pengguna memakai `%LOCALAPPDATA%\Lakar\lakar-node.exe` sebagai `command`, sehingga setiap sesi agen yang terbuka mengunci file itu.

Template NSIS Tauri hanya menghentikan executable utama (`CheckIfAppIsRunning` lewat Restart Manager).

**Approach:**
1. Hook installer NSIS menghentikan `lakar.exe` dan setiap `lakar-node.exe` yang image-nya berada di dalam `$INSTDIR` sebelum file disalin atau dihapus. Proses lain tidak disentuh.
2. Config MCP baru di Windows memakai salinan Node di app-data (`%LOCALAPPDATA%\id.lakar.desktop\mcp\lakar-node.exe`). Salinan ini di luar direktori instalasi dan path-nya stabil lintas versi, sehingga sesi agen tidak lagi mengunci installer.
3. Upgrade di atas aplikasi yang berjalan diuji otomatis di job Windows `release.yml`.

## Boundaries & Constraints

**Always:**
- Filter proses persis: nama image `lakar.exe` (`${MAINBINARYNAME}.exe`) atau `lakar-node.exe` **dan** `ExecutablePath` diawali `$INSTDIR\` (tidak peka huruf besar/kecil). `taskkill /IM` tidak dipakai, karena akan membunuh instalasi lakar-node lain dan Node pengguna.
- Tunggu sampai handle lepas: loop 250 ms, batas 15 detik, dan cek bahwa executable bisa dibuka untuk tulis. Daemon (`...\sidecar\daemon\...` di command line) diberi jeda 2 detik untuk keluar rapi lewat stdin yang tertutup.
- Konfirmasi "Lakar is running" muncul paling banyak sekali, memakai teks template (`$(appRunningOkKill)`). Konfirmasi itu dilewati dalam mode senyap/pasif, dan Cancel membatalkan instalasi. `CheckIfAppIsRunning` template sesudah hook tidak lagi menemukan proses, jadi tidak bertanya lagi.
- Kompatibel mundur (semangat AD-4). Config lama yang menunjuk `%LOCALAPPDATA%\Lakar\lakar-node.exe` + `...\resources\sidecar\mcp\dist\main.js` tetap berlaku setelah upgrade, karena installer tetap memasang file di sana. `GET /viewer/connections` hanya mengganti nilai `command` (bentuk respons sama), dan kunci config baru `mcp_node` / `LAKAR_MCP_NODE` opsional (tidak diset → `process.execPath`, perilaku lama).
- Hanya memakai alat bawaan Windows: Windows PowerShell 5.1 (`Get-CimInstance Win32_Process`, `Stop-Process`). Path dikirim lewat env, bukan disisipkan ke string perintah, agar spasi dan kutip aman.

**Ask First:**
- Mengganti mode instalasi (perMachine) atau mematikan langkah "uninstall before installing" template.

**Never:**
- Menghentikan proses di luar `$INSTDIR`. Pengecualian: uninstall dengan *Delete app data* dicentang juga menghentikan salinan Node MCP di `%LOCALAPPDATA%\<bundle id>\mcp` yang akan dihapus.
- Menyentuh salinan Node MCP stabil saat upgrade. Inilah yang membuat sesi agen dengan config baru selamat melewati upgrade.
- Mengubah route, nama tool MCP, atau bentuk respons.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Upgrade, app di tray | `lakar.exe` + daemon berjalan, installer interaktif | satu konfirmasi → app dan daemon berhenti → file disalin | Cancel → Abort (seperti template) |
| Upgrade senyap/pasif | `/S` atau `/P`, app berjalan | tanpa dialog; proses berhenti; exit 0 | — |
| Daemon yatim | `lakar.exe` mati, daemon masih hidup | daemon dihentikan setelah jeda 2 detik | — |
| MCP config lama | sesi agen menjalankan `$INSTDIR\lakar-node.exe` | proses dihentikan; harness perlu reconnect | — |
| MCP config baru | sesi agen menjalankan salinan di app-data | tidak disentuh; upgrade sukses | — |
| Node lain | `node.exe` sistem, `lakar-node.exe` di direktori lain | tidak disentuh | — |
| Proses tak bisa dihentikan | milik pengguna lain/elevated | setelah 15 detik, executable terkunci diganti nama menjadi `*.old` sehingga File tetap bisa menulis | gagal ganti nama → dialog File template (Retry) |
| Sisa `*.old` | upgrade sebelumnya meninggalkan `*.old` | dihapus saat tidak ada proses yang tersisa | gagal hapus → diabaikan |
| Salinan Node MCP usang | aplikasi baru pertama kali jalan, salinan lama dipakai sesi agen | salinan lama diganti nama menjadi `*.old`, salinan baru dipasang, `*.old` dihapus pada peluncuran berikutnya | gagal menyalin → `command` = Node instalasi (perilaku lama) |
| `mcp_node` tidak ada | `LAKAR_MCP_NODE` menunjuk file yang hilang | `command` = `process.execPath` | — |
| Uninstall | proses MCP config lama berjalan | dihentikan, `lakar-node.exe` terhapus | — |
| MSI | `.msi` di atas instalasi yang berjalan | Windows Installer: dialog FilesInUse/Restart Manager (UI) atau penggantian setelah reboot (senyap) | ditunda (lihat Deferred) |

</frozen-after-approval>

## Code Map

- `apps/desktop/src-tauri/windows/installer-hooks.nsh` -- baru. `NSIS_HOOK_PREINSTALL` / `NSIS_HOOK_PREUNINSTALL` (nama makro sesuai template `tauri-bundler` milik `@tauri-apps/cli` 2.12.4, disisipkan di awal `Section Install` / `Section Uninstall` sebelum `CheckIfAppIsRunning`). Makro `LAKAR_STOP_PROCESSES` mengekstrak script ke `$PLUGINSDIR`, mengisi env, menjalankan cek lalu stop.
- `apps/desktop/src-tauri/windows/stop-lakar.ps1` -- baru. `-Mode check` (exit 2 bila app utama berjalan) dan `-Mode stop` (hentikan, tunggu, ganti nama sebagai fallback).
- `apps/desktop/src-tauri/tauri.conf.json` -- `bundle.windows.nsis.installerHooks`.
- `apps/desktop/src-tauri/src/main.rs` -- `mcp_node_copy()`, `Paths.mcp_node`, env `LAKAR_MCP_NODE` (hanya Windows, di luar jalur `stable_runtime` AppImage/Translocation), ditambah tes unit.
- `packages/daemon/src/{config,connections,server,index}.ts` -- kunci `mcp_node` / `LAKAR_MCP_NODE` dan `resolveMcpNode()` untuk `command` di `GET /viewer/connections`.
- `packages/daemon/src/desktop.test.ts`, `packages/viewer/src/connections.test.ts` -- tes config, route, dan fixture snippet bentuk baru.
- `apps/desktop/scripts/smoke-installer.mjs` + `.github/workflows/release.yml` -- uji upgrade di atas aplikasi berjalan (Windows). `desktop-check.yml` -- `node --check` script baru.
- `apps/desktop/README.md` -- dokumentasi MCP Windows, hook, dan smoke test.

## Tasks & Acceptance

**Execution:**
- [x] Hook NSIS + `stop-lakar.ps1` + `installerHooks` di config.
- [x] Salinan Node MCP stabil di app-data (Rust) + `LAKAR_MCP_NODE` di daemon + tes.
- [x] `smoke-installer.mjs` dan langkah release Windows (unduh installer rilis terakhir bila ada → install → app + MCP lama/baru + decoy berjalan → install ulang `/S` → uninstall `/S`).
- [x] README desktop + deferred-work.

**Acceptance Criteria:**
- Given app di tray dan sesi agen dengan config lama, when installer baru dijalankan, then instalasi selesai tanpa dialog "Error opening file for writing" dan tanpa Task Manager.
- Given sesi agen dengan config baru (salinan app-data), when upgrade, then sesi itu tetap hidup.
- Given `node.exe` lain atau `lakar-node.exe` di direktori lain, when installer berjalan, then proses itu tetap hidup.
- Given config lama dari v0.1.2/v0.1.3, when upgrade selesai, then config itu tetap menjalankan server MCP.

## Design Notes

**Pilihan untuk (b).** Dari tiga opsi yang ditimbang, dipilih varian (iii) yang paling kecil: hanya executable yang disalin keluar dari `$INSTDIR`, karena hanya image proses yang dikunci Windows. Node membaca file `.js` lalu menutupnya, jadi `args` tetap boleh menunjuk server MCP di direktori instalasi dan otomatis ikut versi baru tanpa stub atau pointer.
- Path salinan tidak berversi, sehingga config tidak pernah basi dan tidak ada direktori lama yang perlu dibersihkan.
- Opsi (i) (shim yang menyalin dirinya) dan stub `.cmd` ditolak. Harness memanggil `command` tanpa shell, dan spawn `.cmd` di Node butuh `shell:true`.
- Opsi (ii) (`node`/`npx` sistem) ditolak karena tidak terjamin ada dan versinya bisa di bawah 26.

**Trade-off.**
- Config lama tetap mengunci `$INSTDIR\lakar-node.exe`, dan hook menghentikan prosesnya saat upgrade. Harness akan menampilkan server MCP terputus, lalu pengguna me-reconnect atau memulai ulang sesi. Menyalin ulang snippet dari Connections menghilangkan masalah ini untuk upgrade berikutnya.
- Saat upgrade, server MCP dari salinan stabil tetap menjalankan kode lama yang sudah dimuat, sementara file `.js` di `$INSTDIR` diganti. Paket MCP hanya memakai import statis, jadi tidak ada modul yang dimuat belakangan. Sesi baru langsung memakai kode baru.
- PowerShell menambah sekitar 1–2 detik per pemanggilan (cek + stop) di setiap install/uninstall.

**Mengapa tidak memakai `CheckIfAppIsRunning` template di hook.** Makro itu memakai `${__LINE__}` untuk label. Menyisipkannya kedua kali di section yang sama berisiko bentrok label, dan tidak bisa diverifikasi tanpa toolchain NSIS lokal. Karena itu konfirmasi dibuat sendiri dengan string bahasa yang sama.

## Spec Change Log

## Review Triage Log

Pass 1, self-review (Blind = B, Edge = E). Semua temuan yang lolos ber-rute `patch`.

| # | Temuan | Verdict | Bukti / keputusan |
|---|---|---|---|
| E1 | Pola daemon `\\sidecar\\daemon\\` tidak cocok untuk command line dengan `/` | low | Nyata (ditemukan saat uji lokal: daemon dibunuh tanpa jeda). patch: `[\\/]`. |
| E2 | `-Filter '*.old'` juga cocok dengan nama pendek 8.3 (mis. `x.olders`) | low | Nyata secara teori. patch: saring ulang `Name -like '*.old'`. |
| B1 | Hook uninstall dipakai juga oleh langkah "uninstall before installing" saat upgrade, sehingga bisa membunuh sesi MCP salinan stabil | medium | Nyata. patch: direktori app-data hanya disertakan bila *Delete app data* dicentang dan bukan `/UPDATE`. |
| B2 | Komentar non-ASCII di `.nsh`/`.ps1` (NSIS dan PowerShell 5.1 membaca ANSI tanpa BOM) | low | patch: file dibuat ASCII murni. |
| B3 | Dua kali `!insertmacro` di uninstall menyematkan script dua kali | low | patch: satu sisipan dengan daftar direktori di `$2`. |
| E3 | `TEMP` runner berbentuk 8.3 membuat perbandingan path smoke test meleset | low | patch: `realpathSync.native`. |
| E4 | Executable dan JS lama bisa dipakai bersamaan bila sesi MCP salinan stabil hidup melewati upgrade | low | Diterima (lihat Trade-off); MCP tanpa import dinamis. |
| B4 | Proses milik pengguna lain tidak terbaca `ExecutablePath` | low | Diterima: fallback ganti nama `*.old`, lalu dialog File template. |

## Verification

**Commands:**
- `pnpm build` dan `pnpm test`. Tes yang relevan (`packages/daemon/src/desktop.test.ts`, `packages/viewer/src/connections.test.ts`, `tests/dependency-direction.test.ts`) lulus lokal di Windows.
- `stop-lakar.ps1` diuji lokal di Windows dengan direktori uji berspasi. Proses `lakar-node.exe` di dalamnya dihentikan, sementara `lakar-node.exe` decoy di direktori lain, `node.exe` sistem, dan instalasi Lakar asli pengguna tetap hidup. Jeda daemon 2 detik teramati, mode `check` mengembalikan 0/2, dan fallback mengganti nama executable yang sedang berjalan menjadi `*.old`.
- Rust tidak terpasang lokal: `cargo clippy -D warnings` dan `cargo test` berjalan di `desktop-check.yml`.
- NSIS tidak terpasang lokal: hook dikompilasi dan smoke test installer berjalan di job Windows `release.yml` (`gh workflow run release.yml --ref fix/installer-locked-node`). Run https://github.com/fatmuh/lakar/actions/runs/45134702742 hijau di Windows: Lakar 0.1.3 dari rilis dipasang, lalu build ini dipasang di atasnya. `/viewer/connections` menunjuk salinan Node stabil. Pemasangan ulang `/S` di atas app + MCP lama/baru + decoy selesai dengan exit 0 dalam 14 detik, dan semua asersi lolos. Uninstall `/S` saat MCP lama berjalan juga lolos.
