---
title: 'Instal konfigurasi MCP Lakar ke harness otomatis'
type: feature
ticket: '12'
created: '2026-11-23'
status: done
baseline_revision: 'bdd59dc12c69f4009be3b726dc91acc22f89fa3e'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: true
context: ['{project-root}/design/README.md']
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Layar Connections hanya bisa menyalin config MCP; Fatmuh ingin Lakar memasang server MCP `lakar` ke harness yang terpasang di mesin (Claude Code, Codex, Pi, OpenCode) secara otomatis dan aman. Desain final: `design/README.md` Section 11 "Install to app" + "About (revisi story 8.11)".

**Approach:** Daemon mendapat modul `harnesses.ts` dengan deteksi harness + route baru `/viewer/connections/harnesses*` (GET rescan; POST install/uninstall/revert/reveal) yang menulis entri `lakar` dengan backup `.bak`, merge tanpa menimpa setting lain, dan atomic write. Viewer mengganti section "Add an agent" dengan "Install in an agent" (baris per harness, 5 state, dialog Confirm, dialog Manual setup berisi Setup Card lama, Toast sukses dengan Undo). Blok "This computer" di Settings → General dipoles ke pola About revisi (tanpa kartu, tombol Copy build info + Open-source licenses) karena halaman Settings → Updates belum ada (dibangun story 8.10 paralel).

## Boundaries & Constraints

**Always:**
- Route baru hanya di bawah `/viewer/*`; guard Origin `server.ts:288–302` berlaku otomatis untuk non-GET. Respons lama tidak berubah bentuk (AD-4/C5).
- Backup `<file>.bak` (byte-identik) ditulis sebelum setiap tulis; tulis lewat `writeFileAtomic` (`assets.ts:30`); merge mempertahankan semua key/section lain; kegagalan sebelum tulis = "Nothing was changed".
- Entri yang ditulis identik dengan `GET /viewer/connections` `mcp` (`resolveMcpEntry`/`resolveMcpNode`, `connections.ts:33–43`).
- Komentar kode & pesan error daemon Bahasa Indonesia; teks UI Inggris. Viewer tidak mengimpor kode daemon (dependency-direction test); semua data lewat respons route.
- Log hanya `lakard: <aksi> <id> → <state>`; tidak pernah path absolut, isi file, atau nilai env.
- Deteksi/IO lewat dependency yang diinjeksikan (`home`, `env`, fs) supaya tes tidak menyentuh home user asli dan tidak men-stub `process.env`.

**Never:**
- Tidak mengubah route/tool lama, bentuk error, atau `GET /viewer/connections` (hanya boleh menambah route baru).
- Tidak menulis di luar file config harness milik target; tidak menjalankan binary harness; tidak ada akun/jaringan.
- Tidak menambah `EventSource` kedua (satu `/viewer/events` per jendela via `activityHub`).
- Tidak membuat halaman Settings → Updates (milik story 8.10); tidak mengubah file `.pen`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Scan tidak ada harness | `GET /viewer/connections/harnesses`, home kosong | 4 harness `state:'not-found'` + `other` `state:'manual'` | none |
| Installed sudah ada | config berisi `lakar` | `state:'installed'`, `matches` perbandingan dengan entri kini | none |
| Install claude | `POST …/claude-code/install`, `~/.claude.json` berisi key lain | `.bak` byte-identik; `mcpServers.lakar` ditambah, key lain utuh; `state:'installed'` | JSON corrupt → `state:'failed'`, file tak berubah |
| Install codex | `config.toml` ada `[mcp_servers.lakar]` lama | blok lama diganti (bukan dobel), section lain utuh | file tak terbaca → `failed` |
| Install opencode `.jsonc` | hanya `opencode.jsonc` ada, berkomentar | komentar ditoleransi saat parse; ditulis balik sebagai JSON rapi ke file yang sama; `.bak` simpan asli | parse gagal → `failed` |
| Install not-found | `POST …/opencode/install`, dir `~/.config/opencode` tak ada | `state:'failed'`, pesan "harness tidak terdeteksi"; tidak membuat apa pun | — |
| Undo | `POST …/:id/revert` setelah install | `.bak` dipulihkan ke path asli (tulis atomic); `restored:true` | `.bak` tak ada → `restored:false` |
| Remove | `POST …/:id/uninstall` pada installed | entri `lakar` dihapus, `.bak` dibuat; `state:'not-installed'` | parse gagal → `failed` |
| Reveal | `POST …/:id/reveal` | buka file di file manager OS (win `explorer /select`, mac `open -R`, linux `xdg-open` dir) | file tak ada → `opened:false` |
| mcpEntry tak ada | `LAKAR_MCP_ENTRY` & default entry missing | `install` → `failed` "entry MCP tidak ditemukan"; GET tetap 200 `preview:null` | — |
| Origin asing | POST lintas-origin | 403 oleh guard yang ada | — |

</intent-contract>

## Code Map

**Daemon (`packages/daemon/src/`):**
- `harnesses.ts` — BARU. Tabel harness, deteksi, merge writer (JSON / TOML / JSONC), `registerHarnessRoutes`. Keputusan path:
  - `claude-code`: `CLAUDE_CONFIG_DIR`→`<dir>/.claude.json`, else `~/.claude.json`; marker `~/.claude` atau file itu. JSON merge key `mcpServers.lakar`.
  - `codex`: `CODEX_HOME`→`<dir>/config.toml`, else `~/.codex/config.toml`; marker `~/.codex`. Text-surgery: buang blok `[mcp_servers.lakar(.…)]` (header regex sampai `[` berikut), append blok baru.
  - `pi`: `PI_CODING_AGENT_DIR`→`<dir>/mcp.json`, else `~/.pi/agent/mcp.json`; marker `~/.pi`. JSON merge `mcpServers.lakar`.
  - `opencode`: `~/.config/opencode/` (Windows sama; non-win hormati `XDG_CONFIG_HOME`); `opencode.json` > `opencode.jsonc`. Shape `{mcp:{servers:{lakar:{type:"local",command:[cmd,...args],environment:{LAKAR_URL}}}}}`.
  - `other`: virtual, `state:'manual'`, `configPath:null`.
- `harnesses.test.ts` — BARU. `app.inject` + `mkdtemp` home palsu (pola `files.test.ts:14`, `desktop.test.ts:164`); env lewat opsi `env`, bukan `process.env`.
- `connections.ts` — reuse `McpServerConfig`, `resolveMcpEntry`, `resolveMcpNode`; ekspor helper ke harnesses.ts.
- `server.ts:862` — tambah `registerHarnessRoutes(app,{host,port,mcpEntry,mcpNode,log})` setelah `registerConnectionRoutes`.
- `assets.ts:30` `writeFileAtomic` — untuk tulis config + `.bak` restore.

**Viewer (`packages/viewer/src/`):**
- `api.ts` — tambah tipe `HarnessInfo {id,label,configPath,detected,installed,matches,format,preview,linesAdded}`, `HarnessResult {id,state,message?,backup?}`; method `harnesses()`, `installHarness(id)`, `uninstallHarness(id)`, `revertHarness(id)`, `revealHarness(id)` — lewat `request` biasa (bukan `#write`).
- `harnesses.ts` — perbarui `HARNESSES` ke claude-code, codex, pi, opencode, other (untuk tab Manual setup); tetap import-free.
- `Connections.tsx` — ganti `AddAgent`→`InstallAgents` section "Install in an agent": header + Rescan; baris state (not-installed / installed(+Reinstall,More menu `FileMenu.tsx` `Menu`/`Item`) / not-found / failed / other); `ConfirmInstallDialog` + `ManualSetupDialog` (`Modal` dari `NewFileDialog.tsx`, kartu lama apa adanya); `Toast` dari `AddLayer.tsx` dengan aksi Undo → revert. Hapus section "Tools exposed" (desain membuangnya; `MCP_TOOLS` boleh tetap diekspor bila tes memakai).
- `SettingsGeneral.tsx` — `LocalInfo`→About: judul section "About", daftar kunci-nilai polos `.settings-about` (Version mono, Channel `stable`, Daemon `lakard <ver>`, Data folder + CopyButton), tombol `Copy build info` + `Open-source licenses` (Modal daftar singkat atribusi OSS). Section rules sudah benar (hairline antar-section, `:last-child` tanpa garis).
- `Dashboard.tsx:80` — `ConnectCard`: ganti `CopyMcpConfig` dengan tombol ke `CONNECTIONS_HASH` (menutup deferred story 11; hapus `CopyMcpConfig` bila tak dipakai di tempat lain).
- `app.css` — tambah `.conn-install*` (baris, pill, `.failed` latar `--danger-soft`, ikon `not-found` opacity .5, tombol nonaktif opacity .35), `.settings-about`.
- `connections.dom.test.tsx` — BARU, pola `App.dom.test.tsx`/`dom().daemon` FakeDaemon + `renderUi`.
- `connections.test.ts` — perbarui assertion snippet untuk daftar harness baru.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/daemon/src/harnesses.ts` -- modul deteksi + route + merge writers -- inti fitur
- [ ] `packages/daemon/src/server.ts` + `packages/daemon/src/index.ts` -- registrasi route -- wiring
- [ ] `packages/daemon/src/harnesses.test.ts` -- tes matrix I/O di atas + Origin -- verifikasi
- [ ] `packages/viewer/src/api.ts` + `harnesses.ts` -- tipe + method + snippet baru -- kontrak UI
- [ ] `packages/viewer/src/Connections.tsx` -- Install in an agent + dialog + toast -- UI utama
- [ ] `packages/viewer/src/app.css` -- style baris/dialog/about -- parity desain
- [ ] `packages/viewer/src/SettingsGeneral.tsx` + `Dashboard.tsx` -- About + link sidebar -- revisi About + deferred
- [ ] `packages/viewer/src/connections.dom.test.tsx` + `connections.test.ts` -- tes DOM state & snippet -- verifikasi
- [ ] `_bmad-output/implementation-artifacts/spec-mcp-harness-install.md` -- spec BMAD (Indonesia) -- aturan repo

**Acceptance Criteria:**
- Given home palsu dengan `~/.claude.json` berisi `{"oauth":…,"mcpServers":{"lain":…}}`, when `POST /viewer/connections/harnesses/claude-code/install`, then file memuat `mcpServers.lakar` = entri `GET /viewer/connections`, `oauth`/`lain` utuh, dan `~/.claude.json.bak` byte-identik dengan file lama.
- Given `~/.codex/config.toml` berisi `[model] x=1` + `[mcp_servers.lakar]` lama, when install, then hanya blok `lakar` berganti, `[model]` utuh byte-per-byte.
- Given dir `~/.config/opencode` tak ada, when scan, then baris OpenCode `not-found` dengan hint "Install OpenCode on this computer, then Rescan." dan tombol Install nonaktif.
- Given install berhasil, when pengguna klik Undo di toast, then isi file kembali ke isi `.bak` dan baris kembali `not-installed`.
- Given file config corrupt, when install, then baris `failed` (latar `danger-soft`, pesan pendek + "Nothing was changed") dan file asli tak berubah.
- Given halaman Settings → General, when dibuka, then section About menampilkan pola baru tanpa kartu pembungkus dan tombol Copy build info + Open-source licenses.

## Implementation Notes

Keputusan yang dicatat (delegasi Fatmuh "terima jadi", 2026-11-23): (1) deteksi = file config atau marker-dir/env-override ada — binary di PATH tidak dicek (Rescan murah); (2) `opencode.jsonc` diparse toleran-komentar lalu ditulis ulang JSON rapi — `.bak` menjaga aslinya; (3) kegagalan bisnis install kembali 200 `{state:'failed'}` (bukan throw) supaya baris Failed terisi pesannya — input tak dikenal tetap 400; (4) Channel About = `stable` (belum ada konsep channel); (5) About diterapkan di blok "This computer" Settings → General karena halaman Updates belum ada; (6) tombol sidebar jadi link ke Connections (deferred story 11).

## Plan Change Log

## Review Triage Log

### 2026-11-23 — Review pass (quick)
- verdicts: 10 findings — high 0, medium 3, low 7, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` `stripCodexLakar` merapikan baris kosong di seluruh config.toml — Regex `\n{3,}` + trim global menulis ulang byte di luar blok lakar; diperbaiki jadi hanya merapikan sambungan tempat blok dibuang.
  - `[medium]` `[patch]` File config + `.bak` ditulis mode 0644 walau aslinya 0600 — `writeFileAtomic` chmod 644; config harness bisa berisi OAuth/key. Diperbaiki: mode file asli dipertahankan di config + `.bak`; file baru 0600.
  - `[medium]` `[patch]` `.bak` tidak byte-identik untuk file non-UTF-8 — backup ditulis dari string hasil decode; jalur TOML tak mem-parse jadi byte rusak tertulis. Diperbaiki: `.bak` ditulis dari byte mentah; decode fatal → `failed`.
  - `[low]` `[patch]` Entri TOML lakar bentuk quoted/dotted tak terdeteksi — `[mcp_servers."lakar"]` / `mcp_servers.lakar.command=…` lolos scan+strip lalu append menghasilkan TOML invalid. Diperbaiki: header quoted ikut dikenali; bentuk dotted → `failed` dengan pesan manual.
  - `[low]` `[patch]` Menu More terbuka bergeser ~56px — offset `b.right - 176` padahal `.menu` min-width 232. Diperbaiki: `x = b.right - 232`.
  - `[low]` `[reject]` `.settings-about` tak punya aturan CSS — class hanya hook semantik; daftar tampil benar tanpa aturan; tidak ada cacat visual.
  - `[low]` `[patch]` CSS mati `.settings-info`/`.settings-row` + `.conn-tools`/`.conn-tool` tak direferensikan lagi — dihapus langsung (`.settings-path`/`.settings-unavailable` tetap dipakai).
  - `[low]` `[patch]` `defaultDeps().reveal` mengabaikan `platform` terinjeksi — memakai `process.platform`; default reveal kini memakai `d.platform` hasil merge.
  - `[low]` `[patch]` Undo tak bisa memulihkan install ke file yang belum ada — tanpa `.bak` respons `restored:false` padahal state pra-instal = file tak ada. Diperbaiki: bila `.bak` tak ada tapi file berisi entri lakar → file dihapus, `restored:true`.
  - `[low]` `[reject]` `configPath` dievaluasi ulang dari env per request — env berubah di tengah sesi jarang dan hasilnya hanya `restored:false` (bukan korupsi); pelacakan path menambah state yang tak sebanding.

## Design Notes

Entry per format (untuk `preview` di dialog Confirm dan merge):
- JSON (`~/.claude.json`, `~/.pi/agent/mcp.json`): `"mcpServers": { "lakar": { "command": …, "args": […], "env": { "LAKAR_URL": … } } }`.
- TOML (`~/.codex/config.toml`): `[mcp_servers.lakar]` + `command`/`args`/`env = { LAKAR_URL = … }` (escape `JSON.stringify`).
- OpenCode: `"mcp": { "servers": { "lakar": { "type": "local", "command": ["…","…"], "environment": { "LAKAR_URL": … } } } }`.
`linesAdded` = jumlah baris snippet preview (badge "Adds N lines").

## Verification

**Commands:**
- `pnpm build` — expected: tsc + viewer build bersih
- `pnpm test` dengan `LAKAR_C7_ALLOW_MISSING_SOURCES=1` — expected: tidak ada kegagalan baru vs baseline Windows (~49–55 fails dikenal); `harnesses.test.ts`, `connections.dom.test.tsx`, `connections.test.ts` hijau

## Auto Run Result

**Ringkasan.** Daemon mendapat modul `harnesses.ts` (deteksi + route `/viewer/connections/harnesses*` untuk scan/install/uninstall/revert/reveal) yang menulis entri MCP `lakar` ke config Claude Code (JSON), Codex (TOML text-surgery), Pi (JSON), dan OpenCode (JSON/JSONC) dengan backup `.bak` byte-identik, mode file dipertahankan, dan atomic write; kegagalan bisnis kembali `state:'failed'` di amplop 200. Viewer mengganti "Add an agent" menjadi "Install in an agent" (baris per harness dengan 5 state, Rescan, dialog Confirm berisi path + "Adds N lines" + preview, dialog Manual setup berisi Setup Card lama, toast sukses dengan Undo). Blok About revisi diterapkan di Settings → General; aksi sidebar "Connect an agent" kini link ke Connections.

**File berubah** (15 file, +2234/−149):
- `packages/daemon/src/harnesses.ts` — modul baru: deteksi per harness, parser/merger JSON+TOML+JSONC, route scan/install/uninstall/revert/reveal, `.bak` byte-identik dari byte mentah, mode 0600 file baru / mode asli dipertahankan.
- `packages/daemon/src/harnesses.test.ts` — 31 tes matriks I/O spec (1 skip POSIX-only di Windows).
- `packages/daemon/src/assets.ts` — `writeFileAtomic` menerima parameter `mode` opsional (default 644, kompatibel).
- `packages/daemon/src/server.ts`, `index.ts` — registrasi `registerHarnessRoutes` + opsi `harnessDeps` terinjeksi; ekspor tipe/route.
- `packages/viewer/src/api.ts` — tipe `HarnessInfo`/hasil + method install/uninstall/revert/reveal; `DaemonStatus` bertambah field `node`.
- `packages/viewer/src/harnesses.ts` — metadata harness + snippet manual per format.
- `packages/viewer/src/Connections.tsx` — section "Install in an agent" lengkap (state, dialog Confirm/Manual, More menu, toast Undo).
- `packages/viewer/src/connections.dom.test.tsx` — 6 tes DOM alur install/undo/menu/dialog.
- `packages/viewer/src/connections.test.ts` — pembaruan snippet manual.
- `packages/viewer/src/app.css` — style install/dialog/toast/About; CSS mati dihapus.
- `packages/viewer/src/SettingsGeneral.tsx` — blok About revisi (Version/Channel/Daemon/Data folder + Copy build info + dialog lisensi).
- `packages/viewer/src/Dashboard.tsx` — aksi sidebar jadi link ke Connections.
- `_bmad-output/implementation-artifacts/spec-mcp-harness-install.md` — spec BMAD.
- File plan ini.

**Review (quick, 1 pass):** 10 temuan — high 0, medium 3, low 7, false 0. Dipatch: 8 (3 medium: normalisasi whitespace TOML lintas-batas, mode file turun ke 0644, `.bak` non-UTF-8; 5 low: header/dotted TOML, offset menu, CSS mati, `reveal` mengabaikan platform terinjeksi, Undo tanpa `.bak`). Direject: 2 low (`settings-about` hanya hook semantik tanpa cacat visual; evaluasi ulang `configPath` dari env jarang & hasilnya `restored:false` yang jinak). Subagen implementasi tak bisa dilanjutkan → patch diterapkan langsung.

**Follow-up review:** `true` — 3 entry medium dipatch di jalur tulis file-safety; risiko belum teruji: interaksi mode/backup dengan config symlink atau folder tersinkron (OneDrive/dotted ACL Windows) belum tercakup tes.

**Verifikasi.** `pnpm build` hijau (tsc + vite). Fokus pasca-patch: `vitest run harnesses.test.ts connections.test.ts connections.dom.test.tsx` → 44 lulus, 1 skip (tes mode POSIX). `pnpm test` penuh sebelum patch: 2923 lulus / 53 gagal — semua kategori baseline Windows dikenal (SIGTERM/SIGKILL, izin key foto, CRLF, URL `d:`, timing render/bench); tidak ada kegagalan di file yang disentuh. Suite penuh pasca-patch: 2927 lulus / 58 gagal — delta vs pra-patch hanya `judge-c7` (+3, artefak `set` tanpa quote meninggalkan spasi di nilai env; lulus saat diulang dengan `set "LAKAR_C7_ALLOW_MISSING_SOURCES=1"`) dan −2 file flaky yang kini hijau (`index.test.ts` level-file, `paste-html.test.ts`); gagal efektif 55 — dalam rentang baseline, nol kegagalan baru dari perubahan.

**Risiko residual.** Deteksi marker-dir/env tanpa cek binary PATH (keputusan terdokumentasi); entri TOML bentuk dotted-key sengaja digagalkan ke manual; baseline gagal Windows (~53) belum di-root-cause; `.pen` tidak diubah (Pencil MCP offline).
