---
title: 'Instal konfigurasi MCP Lakar ke harness otomatis'
type: 'feature'
created: '2026-11-23'
status: 'done'
baseline_commit: 'bdd59dc12c69f4009be3b726dc91acc22f89fa3e'
route: 'full'
review_loop_iteration: 0
context: ['{project-root}/design/README.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Layar Connections hanya bisa menyalin config MCP; Fatmuh ingin Lakar memasang server MCP `lakar` ke harness yang terpasang di mesin (Claude Code, Codex, Pi, OpenCode) secara otomatis dan aman. Desain final: `design/README.md` Section 11 "Install to app" + "About (revisi story 8.11)".

**Approach:** Daemon mendapat modul `harnesses.ts` dengan deteksi harness + route baru `/viewer/connections/harnesses*` (GET rescan; POST install/uninstall/revert/reveal) yang menulis entri `lakar` dengan backup `.bak`, merge tanpa menimpa setting lain, dan atomic write. Viewer mengganti section "Add an agent" dengan "Install in an agent" (baris per harness, 5 state, dialog Confirm, dialog Manual setup berisi Setup Card lama, Toast sukses dengan Undo). Blok "This computer" di Settings → General dipoles ke pola About revisi (tombol Copy build info + Open-source licenses) karena halaman Settings → Updates belum ada.

## Boundaries & Constraints

**Always:**
- Route baru hanya di bawah `/viewer/*`; guard Origin `server.ts` berlaku otomatis untuk non-GET. Respons lama tidak berubah bentuk (AD-4/C5).
- Backup `<file>.bak` (byte-identik) ditulis sebelum setiap tulis; tulis lewat `writeFileAtomic` (`assets.ts`); merge mempertahankan semua key/section lain; kegagalan sebelum tulis = "Nothing was changed".
- Entri yang ditulis identik dengan `GET /viewer/connections` `mcp` (`resolveMcpEntry`/`resolveMcpNode`).
- Komentar kode & pesan error daemon Bahasa Indonesia; teks UI Inggris. Viewer tidak mengimpor kode daemon; semua data lewat respons route.
- Log hanya `lakard: <aksi> <id> → <state>`; tidak pernah path absolut, isi file, atau nilai env.
- Deteksi/IO lewat dependency yang diinjeksikan (`home`, `env`, `platform`, `exists`/`isDir`, `reveal`) supaya tes tidak menyentuh home user asli dan tidak men-stub `process.env`.

**Never:**
- Mengubah route/tool lama, bentuk error, atau `GET /viewer/connections` (hanya menambah route baru).
- Menulis di luar file config harness milik target; menjalankan binary harness; akun/jaringan.
- Menambah `EventSource` kedua (satu `/viewer/events` per jendela via `activityHub`).
- Membuat halaman Settings → Updates (milik story 8.10); mengubah file `.pen`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Scan tidak ada harness | `GET /viewer/connections/harnesses`, home kosong | 4 harness `state:'not-found'` + `other` `state:'manual'` | none |
| Installed sudah ada | config berisi `lakar` | `state:'installed'`, `matches` perbandingan dengan entri kini | none |
| Install claude | `POST …/claude-code/install`, `~/.claude.json` berisi key lain | `.bak` byte-identik; `mcpServers.lakar` ditambah, key lain utuh; `state:'installed'` | JSON corrupt → `state:'failed'`, file tak berubah |
| Install codex | `config.toml` ada `[mcp_servers.lakar]` lama | blok lama diganti (bukan dobel), section lain utuh byte-per-byte | file tak terbaca → `failed` |
| Install opencode `.jsonc` | hanya `opencode.jsonc` ada, berkomentar | komentar ditoleransi saat parse; ditulis balik sebagai JSON rapi ke file yang sama; `.bak` simpan asli | parse gagal → `failed` |
| Install not-found | `POST …/opencode/install`, dir `~/.config/opencode` tak ada | `state:'failed'`, pesan "harness tidak terdeteksi"; tidak membuat apa pun | — |
| Undo | `POST …/:id/revert` setelah install | `.bak` dipulihkan ke path asli (tulis atomic); `restored:true` | `.bak` tak ada → `restored:false` |
| Remove | `POST …/:id/uninstall` pada installed | entri `lakar` dihapus, `.bak` dibuat; `state:'not-installed'` | parse gagal → `failed` |
| Reveal | `POST …/:id/reveal` | buka file di file manager OS (win `explorer /select`, mac `open -R`, linux `xdg-open` dir) | file tak ada → `opened:false` |
| mcpEntry tak ada | `LAKAR_MCP_ENTRY` & default entry missing | `install` → `failed` "entry MCP tidak ditemukan"; GET tetap 200 `preview:null` | — |
| Origin asing | POST lintas-origin | 403 oleh guard yang ada | — |
| Input tak dikenal | `:id` bukan harness; install/uninstall `other` | 400 `{ok:false,error}` SCHEMA_INVALID | — |

</frozen-after-approval>

## Code Map

- `packages/daemon/src/harnesses.ts` (baru) — `HARNESS_DEFS` (claude-code / codex / pi / opencode + `other` virtual), `HarnessDeps` terinjeksi, `mergeCodexToml`/`stripCodexLakar` (text-surgery, section lain utuh), `stripJsonComments` + `parseObject`/`mergeObject`/`stripObject` (JSON & JSONC), `scan*` untuk `installed`/`matches`, `registerHarnessRoutes` (GET + 4 POST; kegagalan bisnis 200 `{state:'failed'}`, input tak dikenal 400).
- `packages/daemon/src/harnesses.test.ts` (baru) — 24 tes: matriks I/O + Origin 403 + `stripJsonComments`.
- `packages/daemon/src/server.ts` — `registerHarnessRoutes` sesudah `registerConnectionRoutes`; `BuildOptions.harnessDeps` untuk tes.
- `packages/daemon/src/index.ts` — ekspor `registerHarnessRoutes`, `stripJsonComments`, dan tipe `Harness*`.
- `packages/viewer/src/api.ts` — tipe `HarnessInfo`/`HarnessResult`/`HarnessRevertResult`/`HarnessRevealResult`, `DaemonStatus.node`; method `harnesses()`/`installHarness`/`uninstallHarness`/`revertHarness`/`revealHarness` (lewat `request` biasa).
- `packages/viewer/src/harnesses.ts` — `HARNESSES` baru (claude-code, codex, pi, opencode, other) untuk tab Manual setup; tetap tanpa import.
- `packages/viewer/src/Connections.tsx` — `InstallAgents` + `HarnessRow` + `ConfirmInstallDialog` + `ManualSetupDialog` + `SetupCard` (kartu lama); toast Undo → `revertHarness`; menu More memakai `Menu`/`Item` `FileMenu.tsx`.
- `packages/viewer/src/SettingsGeneral.tsx` — blok "This computer" → `About` (`.settings-about`, Copy build info, `LicensesDialog`).
- `packages/viewer/src/Dashboard.tsx` — `CopyMcpConfig` → `ConnectLink` (anchor ke `CONNECTIONS_HASH`, menutup deferred story 11).
- `packages/viewer/src/app.css` — `.conn-section-head`, `.conn-install*` (baris, `.failed` latar `--danger-soft`, `.dim`, actions), `.conn-confirm-*`, `.conn-lines`, `.status-pill.muted`, `.settings-about`/`.about-*`, `.lic-list`.
- `packages/viewer/src/connections.dom.test.tsx` (baru), `connections.test.ts` (diperbarui) — DOM 5 state + alur, snippet per format.

## Tasks & Acceptance

**Execution:**
- [x] `packages/daemon/src/harnesses.ts` -- modul deteksi + route + merge writers -- inti fitur
- [x] `packages/daemon/src/server.ts` + `packages/daemon/src/index.ts` -- registrasi route -- wiring
- [x] `packages/daemon/src/harnesses.test.ts` -- tes matrix I/O + Origin -- verifikasi
- [x] `packages/viewer/src/api.ts` + `harnesses.ts` -- tipe + method + snippet baru -- kontrak UI
- [x] `packages/viewer/src/Connections.tsx` -- Install in an agent + dialog + toast -- UI utama
- [x] `packages/viewer/src/app.css` -- style baris/dialog/about -- parity desain
- [x] `packages/viewer/src/SettingsGeneral.tsx` + `Dashboard.tsx` -- About + link sidebar -- revisi About + deferred
- [x] `packages/viewer/src/connections.dom.test.tsx` + `connections.test.ts` -- tes DOM state & snippet -- verifikasi
- [x] `_bmad-output/implementation-artifacts/spec-mcp-harness-install.md` -- spec BMAD (Indonesia) -- aturan repo

**Acceptance Criteria:**
- Given home palsu dengan `~/.claude.json` berisi `{"oauth":…,"mcpServers":{"lain":…}}`, when `POST /viewer/connections/harnesses/claude-code/install`, then file memuat `mcpServers.lakar` = entri `GET /viewer/connections`, `oauth`/`lain` utuh, dan `~/.claude.json.bak` byte-identik dengan file lama.
- Given `~/.codex/config.toml` berisi `[model] x=1` + `[mcp_servers.lakar]` lama, when install, then hanya blok `lakar` berganti, `[model]` utuh byte-per-byte.
- Given dir `~/.config/opencode` tak ada, when scan, then baris OpenCode `not-found` dengan hint "Install OpenCode on this computer, then Rescan." dan tombol Install nonaktif.
- Given install berhasil, when pengguna klik Undo di toast, then isi file kembali ke isi `.bak` dan baris kembali `not-installed`.
- Given file config corrupt, when install, then baris `failed` (latar `danger-soft`, pesan pendek + "Nothing was changed") dan file asli tak berubah.
- Given halaman Settings → General, when dibuka, then section About menampilkan pola baru dan tombol Copy build info + Open-source licenses.

## Implementation Notes

- Deteksi = file config atau marker-dir/env-override ada — binary di PATH tidak dicek (Rescan murah). Override env per harness: `CLAUDE_CONFIG_DIR` (→`<dir>/.claude.json`), `CODEX_HOME` (→`<dir>/config.toml`), `PI_CODING_AGENT_DIR` (→`<dir>/mcp.json`); opencode tanpa env override khusus, non-Windows hormati `XDG_CONFIG_HOME`; marker dir: `~/.claude`, `~/.codex`, `~/.pi`, `~/.config/opencode`.
- `opencode.json` didahulukan dari `opencode.jsonc`; JSONC diparse toleran-komentar (`stripJsonComments` menghormati `//`/`/*` di dalam string) lalu ditulis ulang JSON rapi ke file yang sama — `.bak` menjaga aslinya.
- Codex memakai text-surgery: header regex `\[\s*mcp_servers\.lakar(\.|…\])` menandai blok sampai header tabel berikut, dibuang lalu blok baru di-append; `[[array]]` dan tabel lain tidak tersentuh.
- Kegagalan bisnis install/uninstall kembali 200 `{state:'failed', message}` (baris Failed terisi pesannya); id tak dikenal dan install/uninstall `other` tetap 400 — dikirim langsung `realOr400`/`defOr400` dengan envelope `{ok:false,error}` ala handler global (modul mandiri saat didaftarkan tanpa error handler).
- Preview/GET memakai `resolveMcpEntry`/`resolveMcpNode` yang sama dengan `GET /viewer/connections`; entry hilang → `preview:null`, `linesAdded:0`, install `failed`.
- Revert menyalin `.bak` ke path asli via `writeFileAtomic`; `restored:false` bila `.bak` tidak ada — toast Undo menampilkan "No backup to restore".
- `DaemonStatus.node` ditambah untuk "Copy build info"; versi daemon tetap satu sumber (`status.version`).
- Lisensi dialog mencantumkan paket OSS utama (React, Vite, Fastify, zod, playwright-core, MCP SDK, Lucide); repo belum punya LICENSE root — atribusi singkat sesuai desain.
- `HarnessRow` overlay klien: `state:'failed'` + `message` dan `justInstalled` hanya hidup sampai Rescan berikutnya (state kanonik selalu dari GET).

## Review Triage Log

| # | Temuan (review mandiri) | Verdict | Bukti / tindakan |
|---|---|---|---|
| 1 | `LakarError` yang dilempar handler tak terpetakan 400 saat modul didaftarkan tanpa error handler global | medium | Diperbaiki: `defOr400`/`realOr400` membalas `{ok:false,error}` 400 di modul; tes id tak dikenal/`other` hijau. |
| 2 | `writeFileAtomic` gagal bila direktori config belum ada (pi `~/.pi/agent`, opencode) | medium | Diperbaiki: `mkdir(dirname(file), {recursive:true})` sebelum backup/tulis; tes pi marker-only hijau. |
| 3 | Objek `MCP` tes dievaluasi sebelum `entry` diisi `beforeAll` | medium | Diperbaiki: `let` + pengisian di `beforeAll`. |
| 4 | State `failed` di baris bertahan setelah Rescan | false | `scan()` mengganti seluruh `rows` dari GET; `failed` hanya overlay klien sampai scan berikutnya (GET tidak pernah mengembalikannya). |
| 5 | `stripJsonComments` bisa memotong `//` di dalam string JSONC | false | Parser menghormati `"` dan escape `\`; tes `"http://u"` + `"/*c*/"` hijau. |
| 6 | `XDG_CONFIG_HOME` ikut menandai OpenCode "detected" walau dir belum ada | low | Sengaja: env generik ini tidak menjadi marker (hanya menggeser path); deteksi tetap file/dir ada — mencegah false positive di semua Linux. |

## Verification

**Commands:**
- `pnpm build` — tsc + viewer build.
- `pnpm test` dengan `LAKAR_C7_ALLOW_MISSING_SOURCES=1` — `harnesses.test.ts` (24), `connections.dom.test.tsx` (6), `connections.test.ts` (8) hijau; tidak ada kegagalan baru vs baseline Windows (~49–55 fails dikenal).

**Manual checks:**
- (belum dilakukan di lingkungan Windows ini) Cek visual Connections 1440 gelap/terang: baris state, dialog Confirm, toast Undo, Settings → General About.
