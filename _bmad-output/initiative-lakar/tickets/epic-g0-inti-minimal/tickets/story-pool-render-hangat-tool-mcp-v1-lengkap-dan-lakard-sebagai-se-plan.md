---
title: 'Pool render hangat, tool MCP v1 lengkap, dan lakard sebagai service'
type: feature
ticket: '12'
created: '2026-11-18'
status: done
baseline_revision: '47c7e112abcc90b21c6e7b0245e3d101694937f5'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-check-gerbang-g0-otomatis-setiap-execute-dan-lewat-layout-ch-plan.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `ChromiumRenderer` memakai SATU halaman di balik satu mutex, sehingga check execute, screenshot, dan layout_check dari dokumen/sesi berbeda saling antre, dan halaman yang crash membuang seluruh browser. MCP baru punya 5 dari 10 tool v1 (AD-11), tidak ada `status` maupun pemeriksaan versi, dan `lakard` hanya dijalankan manual (tidak ada service, R9).

**Approach:** Ganti halaman tunggal dengan pool sewa eksklusif ≥ 2 halaman hangat di satu chromium-headless-shell (AD-18) di balik `RenderPort` yang sama. Lengkapi endpoint daemon + tool MCP `status`, `read_skill`, `list_boards`, `inspect`, `export` (+ `nodeId` pada screenshot) dan `VERSION_MISMATCH` saat sesi MCP dibuat. Pasang `lakard` sebagai systemd **user** service (127.0.0.1:7466, `/opt/node-26/bin/node`, `Restart=on-failure`) plus skrip rilis.

## Boundaries & Constraints

**Always:**
- **Pool (AD-18)** di `packages/daemon`:
  - Satu browser; `LAKAR_RENDER_PAGES` halaman (default 2, min 2, maks 8), dibuat hangat saat daemon start (warm-up tidak memblokir listen; gagal → status `ready:false` + `lastError`, permintaan → RENDER_FAILED retryable).
  - Setiap screenshot/measure/export/inspect menyewa satu halaman eksklusif sampai selesai (antrean FIFO). Tidak ada mutex global.
  - Batas waktu host per sewa (`renderTimeoutMs`, env `LAKAR_RENDER_TIMEOUT_MS`, default 15000) mencakup render + screenshot; tunggu antrean dibatasi 2× nilai itu. Lewat batas → RENDER_FAILED retryable; halaman yang melewati batas dibuang dan dibuat ulang.
  - Halaman crash/rusak (event `crash`/`close`, evaluate gagal) → permintaan yang sedang menyewanya gagal RENDER_FAILED `retryable:true`; HANYA halaman itu dibuat ulang (browser lain/halaman lain tetap). Browser putus → browser + semua halaman dibuat ulang. Error dokumen (FONT_MISSING/NOT_FOUND/ICON_UNKNOWN) tidak membuang halaman.
  - Statistik pool: `size, ready, idle, busy, waiting, recreated, peakBusy, browserVersion?, lastError?`.
- **Endpoint daemon** (bentuk `{ok,data|error}`, enum AD-11 tetap; semua zod `.strict()`):
  - `GET /status` tanpa sesi: `{version, schemaVersion, node, pid, startedAt, uptimeSec, host, port, dataDir, pool, fonts:{families, missing}, icons:{lucide, 'simple-icons'}, sessions:{count, active:[{id: 8 karakter pertama, activeSlug?, createdAt, lastAt?, executes}]}}` (maks 10 terbaru menurut aktivitas).
  - `POST /sessions {client?, version?, schemaVersion?}`: bila version/schemaVersion dikirim dan berbeda dari milik daemon → 409 `VERSION_MISMATCH` (pesan menyebut kedua versi; hint: `systemctl --user restart lakard` setelah `pnpm build`, atau `scripts/release.sh`). Respons sukses: `{sessionId, version, schemaVersion}`.
  - `POST /boards` (dokumen aktif) → `{docId, slug, rev, boards:[{id, name, page, screen, x, y, width, height, expectedSize?, wip, childCount}]}` (`wip` = nama diawali `[WIP] `).
  - `POST /inspect {id, depth?}` (depth default 2, 0–6): node/board → `{docId, rev, boardId, node}`; `node` = properti tersimpan (token apa adanya) + `bounds:[x,y,w,h]` (dibulatkan, relatif board, dari `RenderPort.measure` dengan `allowGlyphs` hasil `glyphScan`) + `children` bersarang sampai depth, lebih dalam → `childCount`. JSON > 32 KB → depth diturunkan sampai muat + `truncated:true`. ID tak ada → NOT_FOUND; error render = kode screenshot.
  - `POST /screenshot {boardId?, nodeId?}` (keduanya → SCHEMA_INVALID): `nodeId` memotret elemen node itu (skala 1).
  - `POST /export {id?, scale?}`: id board/node (default board pertama), scale 1|2 (default 1; lain → SCHEMA_INVALID). Tulis PNG atomik ke `<dataDir>/exports/<slug>/<id>-r<rev>@<scale>x.png` → `{path, id, name, rev, scale, width, height, bytes}` (width/height = piksel PNG). Gagal tulis → `EXPORT_FAILED`. Skala 2 = render asli DPR 2 (bukan upscale).
  - `POST /skills/read {name?}`: tanpa name → `{skills:[{name, available}]}`; dengan name → `{name, content}`. Nama di luar `SKILL_NAMES` (`core, landing, mobile, icons, api`) atau file belum ada → NOT_FOUND + hint daftar yang tersedia. Isi skill ditulis story 13 (12 hanya mekanisme).
- **Versi:** satu sumber `LAKAR_VERSION` (`'0.1.0'`) di `@lakar/schema`; daemon dan mcp (`SERVER_VERSION`) memakainya. MCP mengirim versinya saat membuat sesi DAN membandingkan respons; tidak cocok → setiap tool (kecuali `status`) mengembalikan error VERSION_MISMATCH; tetap dicoba ulang di panggilan berikutnya (daemon bisa di-restart).
- **Tool MCP v1 lengkap** (AD-11): `status, read_skill, open_doc, list_boards, execute, inspect, layout_check, screenshot, export, icon_search`. `status` mengembalikan teks ringkas (versi daemon/mcp + cocok/tidak, pool, font hilang, ikon, sesi) dan bekerja walau versi tidak cocok; daemon mati → error berisi `systemctl --user start lakard`. `START_HINT` diperbarui ke service.
- **Konfigurasi:** `~/.config/lakar/config.toml` (path `LAKAR_CONFIG`) opsional, kunci datar `port, data_dir, browsers_path, render_pages, render_timeout_ms`; env `LAKAR_*` menang; kunci tak dikenal/nilai salah → gagal start yang jelas. File config TIDAK dibuat di mesin.
- **Service (C9, disetujui orkestrator):**
  - Template `tools/lakard/lakard.service` + `tools/lakard/install-service.sh` (idempoten) menulis `~/.config/systemd/user/lakard.service`: `ExecStart=/opt/node-26/bin/node <root>/packages/daemon/dist/main.js`, `Restart=on-failure`, `Environment=` `LAKAR_PORT=7466`, `LAKAR_BROWSERS_PATH`/`PLAYWRIGHT_BROWSERS_PATH=%h/.cache/lakar/ms-playwright` (env Lakar HANYA di unit), `WantedBy=default.target`; lalu `daemon-reload`, `enable --now lakard`, tunggu `/status`.
  - Skrip menolak bila 7466 dipakai proses non-lakard; TIDAK mengubah unit lain; `loginctl enable-linger` tidak pernah dipanggil (Linger root sudah `yes`; skrip hanya melaporkan).
  - `tools/node26/verify.sh`: snapshot mengecualikan unit `lakard*` saja (`grep -v '^lakard'`); cek eksplisit baru: `systemctl --user is-active lakard` = active, semua listener `:7466` hanya `127.0.0.1` dan milik MainPID lakard (atau turunannya), ExecStart memuat `/opt/node-26/bin/node`, `Restart=on-failure`. Baseline lain tidak diregenerasi.
  - `scripts/release.sh [--dry-run]`: tree bersih → tag `v<LAKAR_VERSION>` (tolak bila tag ada di commit lain) → `pnpm build` → `scripts/install-browser.sh` → `systemctl --user restart lakard` → tunggu `/status` melaporkan versi itu. `--dry-run` hanya mencetak langkah + hasil cek (tree kotor dilaporkan, bukan gagal) tanpa efek. Story ini hanya menjalankan `--dry-run`.
  - `scripts/tracer-e2e.sh`: bila service lakard aktif di 7466, pakai service (tidak menyalakan daemon kedua); selain itu perilaku lama.
- C7: deskripsi tool baru lolos `tests/check-c7.test.ts`. C9: Node lewat `/opt/node-26/bin/{node,pnpm}`; tanpa dependensi baru; tanpa apt/npm global/Docker/`~/.cache/ms-playwright`/Penpot/konfigurasi Claude global; jangan sentuh chrome-headless-shell milik aplikasi lain; proses tes dimatikan; service lakard DIBIARKAN berjalan di akhir.
- Arah dependensi tetap (`tests/dependency-direction.ts`); render tetap browser-pure; mcp hanya ke daemon lewat HTTP.

**Never:**
- Isi skill (story 13), bench (14/16), aturan check baru, perubahan kontrak/enum AD-11.
- Bind selain 127.0.0.1; port selain 7466 untuk service; menyentuh `.git/info/exclude`.
- Melewati pool (mis. halaman ad hoc di luar sewa) atau skip tes diam-diam.
- Push, merge, atau membuat tag git sungguhan.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Paralel | 2 sesi, 2 dokumen berbeda (board 390×844 merah / 300×500 biru), screenshot bersamaan | kedua PNG ukuran & warna benar; `pool.peakBusy` = 2 | — |
| Crash di tengah sewa | halaman disewa lalu di-crash paksa (hook tes / CDP `Page.crash`) | permintaan itu 503 RENDER_FAILED `retryable:true`; screenshot berikutnya 200; status `size 2, ready 2, recreated ≥ 1` | — |
| Batas waktu host | sewa macet > timeout | RENDER_FAILED retryable; halaman dibuat ulang; permintaan berikutnya sukses | — |
| Versi beda | POST /sessions `{version:'9.9.9'}` | 409 VERSION_MISMATCH | MCP tool → teks error VERSION_MISMATCH + hint restart; `status` tetap jalan |
| Export skala 2 | board 390×844 | PNG 780×1688 di `exports/<slug>/…@2x.png` | scale 3 → 400 SCHEMA_INVALID |
| Export node | id teks | PNG seukuran bounds node | id tak ada → 404 NOT_FOUND |
| inspect emoji | board berisi `Halo 👋` | 200 dengan bounds (allowGlyphs) | — |
| read_skill | `{name:'core'}` tanpa file / `{name:'x'}` | NOT_FOUND + daftar skill | — |
| Chromium hilang | browsersPath kosong | daemon tetap listen; status `ready:false, lastError`; screenshot 503 RENDER_FAILED | — |
| config.toml salah | kunci `prot = 1` | lakard keluar 1 dengan pesan kunci tak dikenal | — |

</intent-contract>

## Code Map

- `packages/daemon/src/chromium.ts` -- `ChromiumRenderer` (mutex + `#page` tunggal, `#renderOnPage`, `#failed` menutup seluruh browser). Ganti internal dengan pool; pertahankan `RENDER_PAGE_HTML`, `readRenderModule`, `ASSET_HINT`, pemetaan error dokumen → LakarError, viewport = ukuran board sebelum mount, `CHROMIUM_ARGS`, `process.env.PLAYWRIGHT_BROWSERS_PATH` di-set sebelum import playwright-core. Boleh pecah ke `pool.ts`. Tambah hook opsional tes (mis. `onLease?(page)` di `ChromiumOptions`) untuk crash/macet deterministik.
- `packages/daemon/src/mutex.ts` -- pola FIFO; pool boleh memakai pola serupa. Hapus bila tak terpakai.
- `packages/ports/src/index.ts` -- `RenderPort.screenshot(doc, boardId, opts?: {nodeId?, scale?: 1|2})`; tambahkan opsional `status?()` bila perlu; RenderPort tiruan di tes tetap valid.
- `packages/daemon/src/{start,main,config,server,sessions,check}.ts` -- start: warm-up pool; main: baris kesiapan tetap `lakard: mendengarkan …` (dipakai tes/tracer); config: TOML + `renderPages`; server: endpoint baru, `/sessions` versi, `/status`; sessions: `lastAt`/jumlah execute; check: `runCheck` boleh mengukur board paralel (urutan hasil tetap urutan dokumen).
- `packages/daemon/src/fonts.ts` -- `FontRegistry.missing` (paket font hilang) + `families()` untuk status.
- `packages/icons` -- `IconCatalog.versions` untuk status.
- `packages/skills/src/index.ts` -- `SKILL_NAMES`, `SKILLS_DIR` (`packages/skills/skills/`, di luar dist), `listSkills(dir?)`, `readSkill(name, dir?)`; tes dengan direktori sementara.
- `packages/schema/src/` -- `LAKAR_VERSION` (file baru, diekspor `index.ts`).
- `packages/mcp/src/{server,client,index,index.test}.ts` -- 5 tool baru, `screenshot.nodeId`, versi di sesi, `START_HINT`. Tes MCP integrasi yang sudah ada menjalankan `daemon/dist/main.js` dengan `LAKAR_PORT=0` di balik proxy; ikuti pola itu.
- `packages/daemon/src/index.test.ts` -- pola `startDaemon({...baseConfig, port:0, dataDir, browsersPath})`; tes `RENDER_FAILED` ada di §RENDER_FAILED (tes adaptor halaman tak bisa dimuat harus tetap lulus).
- `tests/check-c7.test.ts`, `tests/execute-description.test.ts`, `tests/dependency-direction.ts` -- penjaga yang harus tetap hijau.
- `tools/node26/verify.sh`, `scripts/{install-browser,tracer-e2e}.sh`, `.mcp.json` (sudah `LAKAR_URL=http://127.0.0.1:7466`) -- lihat Boundaries.
- Read-only: `packages/core`, `packages/exec`, `packages/check/src`, `packages/render/src` (kecuali butuh hook kecil yang tetap browser-pure).

## Tasks & Acceptance

**Execution:**
- [x] `packages/schema/src/{version,index}.ts`, `packages/ports/src/index.ts` -- `LAKAR_VERSION`; opsi screenshot -- kontrak bersama.
- [x] `packages/daemon/src/{chromium,pool?,start,main,config,sessions,check,server}.ts` -- pool AD-18, endpoint baru, TOML, versi sesi -- inti story.
- [x] `packages/skills/src/index.ts` + tes -- mekanisme read_skill.
- [x] `packages/daemon/src/index.test.ts` (+ `config` tes) -- tes matrix: paralel, crash, timeout, Chromium hilang, versi, export 1×/2×/node, inspect emoji, list_boards, read_skill, config.toml.
- [x] `packages/mcp/src/{server,client,index,index.test}.ts` -- 10 tool, VERSION_MISMATCH, status -- permukaan agen.
- [x] `tools/lakard/{lakard.service,install-service.sh}`, `tools/node26/verify.sh`, `scripts/{release,tracer-e2e}.sh` (+ tes `release.sh --dry-run` di `tests/`) -- service + rilis.
- [x] Mesin: `bash tools/lakard/install-service.sh` setelah build; service berjalan di akhir.

**Acceptance Criteria:**
- Given build terbaru dan service terpasang, when `systemctl --user status lakard`, then `active (running)`, ExecStart `/opt/node-26/bin/node …/daemon/dist/main.js`, `Restart=on-failure`, dan `ss -ltnp | grep 7466` hanya `127.0.0.1:7466` milik proses itu.
- Given service berjalan, when `curl -s 127.0.0.1:7466/status`, then memuat `version`, `schemaVersion`, pool `size 2 ready 2`, `fonts.missing` (array), versi ikon, dan sesi.
- Given service berjalan, when renderer process satu halaman pool dibunuh paksa (`kill -9` proses `--type=renderer` turunan MainPID lakard), then permintaan berikutnya sukses dan `/status` kembali `ready 2` dengan `recreated` naik (bukti manual dicatat).
- Given MCP `lakar` (`.mcp.json`) terhadap service, when `scripts/tracer-e2e.sh` dijalankan sekali, then LULUS tanpa menyalakan daemon kedua.
- Given `tools/node26/verify.sh`, when dijalankan, then exit 0 termasuk cek lakard baru, tanpa regenerasi baseline.
- Given `pnpm test` penuh, then lulus 0 skip, termasuk dependency-direction, browser-pure, C7, execute-description.

## Implementation Notes

- Pool di `packages/daemon/src/pool.ts` (`RenderPool`), `ChromiumRenderer` hanya membungkusnya; `mutex.ts` dihapus. Slot = halaman DPR 1 + halaman DPR 2 malas (context `deviceScaleFactor: 2`, disewa bersama slotnya; pilihan Design Notes yang disarankan). Screenshot skala 2 memakai `scale: 'device'`.
- Batas waktu sewa mencakup penyiapan halaman + hook + render + screenshot. Lewat batas/kegagalan non-LakarError → slot dibuang (`gen++`, context ditutup) dan dibuat ulang di latar; `recreated` naik saat slot yang pernah punya halaman berhasil dibuat lagi. Crash/close halaman yang sedang disewa ditandai `dead` dan dibuang saat sewa dilepas; di luar sewa langsung dibuang. LakarError dokumen (FONT_MISSING/NOT_FOUND/ICON_UNKNOWN/SCHEMA_INVALID node 0 px) tidak membuang halaman.
- `pool.ready` di `/status` adalah jumlah (0 = belum siap, plus `lastError`), bukan boolean; AC memakai `ready 2`.
- Hook tes `onLease(page)` di `ChromiumOptions`/`startDaemon` (crash lewat CDP `Page.crash`, macet lewat sleep). Warm-up dipicu setelah listen (`RunningDaemon.warmed`); `main.ts` mencetak baris siap/gagal pool SETELAH baris `mendengarkan`.
- `runCheck` mengukur board paralel (`Promise.allSettled`), error pertama menurut urutan board, hasil urut `boardIds`.
- `/screenshot {nodeId}`: lebar/tinggi respons = piksel PNG; `{boardId}` tetap ukuran board. Node tidak ada di DOM → NOT_FOUND tanpa menunggu locator.
- `/inspect`: properti dari dokumen tersimpan (token apa adanya), bounds dari `measure` dokumen ter-resolve; depth turun saat > 32 KB, respons `truncated:true` + `depth` efektif. `/boards` `page` = nama halaman.
- Config: `LAKAR_CONFIG` yang diset tetapi file tidak ada → gagal start; default `~/.config/lakar/config.toml` opsional. Parser TOML datar sendiri (tanpa dependensi). `LAKAR_RENDER_TIMEOUT_MS` 100..600000.
- `@lakar/skills`: `SKILLS_DIR` relatif `import.meta.url` (`../skills/`), tsconfig `types:["node"]` (resolusi @types/node root, tanpa ubah package.json dependencies); script `test` ditambah. Daemon menerima `skillsDir` (tes).
- MCP: `VersionMismatchError` dilempar saat membuat sesi (409 atau respons sukses tanpa/beda versi, mis. lakard lama) → setiap tool bersesi mengembalikan teks `VERSION_MISMATCH: …`; sesi dicoba ulang di panggilan berikutnya. `status` memakai `GET /status` tanpa sesi.
- `install-service.sh` menunggu `/status` dengan `ready ≥ 1` atau `lastError`; unit identik + aktif → tidak restart. `release.sh` cek service via `systemctl --user cat lakard`.
- Bukti manual (service): `kill -9` satu renderer turunan MainPID → screenshot berikutnya 200, `/status` `ready 2, recreated 1`, MainPID tetap. Insiden: pada percobaan pertama skrip pencari renderer salah (variabel bash tertimpa) dan `kill -9` mengenai MainPID lakard sendiri; systemd me-restart service (`Restart=on-failure`) tanpa proses Chromium yatim; tidak ada proses lain tersentuh.
- tracer-e2e terhadap service: LULUS ($0,20), tanpa daemon kedua.

## Plan Change Log

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 6 findings — high 0, medium 1, low 5, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Tool `status` (dan tool lain) terhadap lakard lama tanpa route: 404 bawaan fastify `{message,error,statusCode}` bukan bentuk AD-11 → `formatError(undefined)` TypeError, tanpa hint versi — terverifikasi (`client.ts` `#post` mengembalikan body apa adanya). Fix: `#post` memetakan body non-AD-11 ke error terformat (404 → `VERSION_MISMATCH` + hint restart; lainnya `EXEC_ERROR` retryable); tes baru dengan server 404 fastify persis (gagal sebelum patch).
  - `[low]` `[reject]` `runCheck` paralel + batas tunggu antrean 2× timeout bisa membuat dokumen sangat besar gagal RENDER_FAILED — butuh total render > 60 dtk (latensi terukur ~60 ms/board → ratusan board); jarang, dan perbaikan menambah mekanisme konkurensi/antrean.
  - `[low]` `[reject]` `inspect` depth 0 tetap bisa > 32 KB (satu node dengan `content`/`d` sangat besar) — plan hanya menetapkan penurunan depth; memotong properti menambah cabang; kasus jarang.
  - `[low]` `[reject]` `pool.lastError` tidak pernah dihapus setelah pulih — field dan teks MCP memang "error terakhir" (riwayat diagnosis); kesiapan dibaca dari `ready`; menghapus butuh state tambahan.
  - `[low]` `[reject]` Cek kepemilikan port di `install-service.sh`/`verify.sh` lolos bila `ss -p` tidak menampilkan pid (non-root) — service ini milik root sehingga `ss` selalu menampilkan pid; perbaikan berupa guard tambahan.
  - `[low]` `[reject]` `tracer-e2e.sh`: service aktif tetapi `/status` belum menjawab dalam 3 dtk → pesan menyalahkan proses lain — jarang (hanya saat service baru start), perbaikan berupa cabang tambahan.

## Design Notes

- **Kenapa pool di daemon, bukan render:** render tetap modul browser murni (AD-6); sewa/timeout/crash adalah urusan adaptor Chromium.
- **Crash vs dokumen salah:** hanya kegagalan Playwright/halaman yang membuang halaman; hasil `{ok:false}` dari `__lakarRender` adalah kesalahan dokumen dan halaman tetap dipakai (perilaku lama dipertahankan).
- **Skala 2:** cara yang disarankan: setiap slot pool punya halaman DPR 2 yang dibuat malas di context `deviceScaleFactor: 2` dan disewa bersama slotnya; alternatif CDP `Emulation.setDeviceMetricsOverride` boleh bila dipulihkan setelah sewa. Catat pilihan di Implementation Notes.
- Contoh `status` MCP:
  ```
  lakard 0.1.0 (schema 1, node v26.x, pid 1234, uptime 3m) · mcp 0.1.0: cocok
  pool: 2 halaman · 2 siap · 0 sibuk · 0 antre · dibuat ulang 0× · chromium 14x
  font: 8 keluarga, hilang: -
  ikon: lucide 1.74.0, simple-icons 16.38.0
  sesi: 1 (a1b2c3d4 landing-kopi, 3 execute)
  ```

## Verification

**Commands:**
- `cd /root/lakar && /opt/node-26/bin/pnpm build` -- expected: exit 0
- `cd /root/lakar && /opt/node-26/bin/pnpm test` -- expected: exit 0, 0 skip
- `cd /root/lakar && bash scripts/release.sh --dry-run` -- expected: exit 0, mencetak langkah tag → build → install-browser → restart, tanpa membuat tag
- `cd /root/lakar && bash tools/lakard/install-service.sh && systemctl --user status lakard --no-pager` -- expected: active (running)
- `ss -ltnp | grep 7466` -- expected: hanya `127.0.0.1:7466`
- `curl -s http://127.0.0.1:7466/status` -- expected: ok, pool size 2 ready 2
- `cd /root/lakar && bash tools/node26/verify.sh` -- expected: exit 0
- `pgrep -af 'lakar-(daemon|tracer)|lakar-.*test'` -- expected: tidak ada proses tes tersisa (service lakard boleh)

**Manual checks (if no CLI):**
- Bunuh paksa satu renderer pool service (hanya turunan MainPID lakard), lalu screenshot lewat HTTP dan baca `/status`: pulih, `recreated` naik.
- Satu run `scripts/tracer-e2e.sh` terhadap service (~$0,2).

## Auto Run Result

- **Status:** built.
- **Ringkasan:** pool render AD-18 (`RenderPool`, 2 halaman hangat default, sewa eksklusif FIFO, batas waktu host per sewa, halaman crash/macet dibuat ulang sendiri, browser putus → semua dibuat ulang) menggantikan halaman tunggal + mutex; check execute/layout_check mengukur board paralel. Endpoint + tool MCP v1 lengkap: `status` (GET tanpa sesi: versi, schema, node, pool, font hilang, versi ikon, sesi), `read_skill` (mekanisme; isi = story 13), `list_boards`, `inspect` (bounds terukur, allowGlyphs), `export` (PNG atomik skala 1/2 DPR asli, board/node), `screenshot.nodeId`; `VERSION_MISMATCH` di `POST /sessions` dan di klien MCP. `LAKAR_VERSION` 0.1.0 di schema. config.toml datar opsional. `lakard` sebagai systemd user service 127.0.0.1:7466 (`/opt/node-26/bin/node`, `Restart=on-failure`, env Lakar hanya di unit), `release.sh`, tracer memakai service.
- **File:**
  - `packages/daemon/src/{pool,pool.test,inspect}.ts` (baru), `{chromium,start,main,config,server,sessions,check,index,index.test}.ts`, `mutex.ts` (dihapus) — pool, endpoint, config, tes Chromium asli untuk semua baris matrix.
  - `packages/ports/src/index.ts` — `ScreenshotOptions`, `RenderStatus`, `RenderPort.status?`.
  - `packages/schema/src/{version,index}.ts` — `LAKAR_VERSION`.
  - `packages/skills/{src/index,src/index.test}.ts`, `package.json`, `tsconfig.json` — `SKILL_NAMES`, `listSkills`, `readSkill`.
  - `packages/mcp/src/{server,client,index,index.test}.ts` — 10 tool, versi sesi, `formatStatus`, body non-AD-11 → error terformat.
  - `tools/lakard/{lakard.service,install-service.sh}`, `tools/node26/verify.sh`, `scripts/{release,tracer-e2e}.sh`, `tests/release.test.ts` — service, cek C9 lakard, rilis.
- **Review (quick):** 6 temuan — 1 patch (medium: status/tool vs lakard lama tanpa route), 0 defer, 5 reject (low; alasan di Review Triage Log).
- **Follow-up review:** `false` (1 patch medium, 0 high). Patched per verdict: high 0, medium 1, low 0.
- **Verifikasi:** `pnpm build` exit 0; `pnpm test` 34 file / 576 tes lulus, 0 skip; tes baru MCP gagal sebelum patch; `release.sh --dry-run` exit 0 tanpa tag; `systemctl --user status lakard` active (running), MainPID `/opt/node-26/bin/node …/daemon/dist/main.js`; `ss -ltnp` hanya `127.0.0.1:7466`; `/status` version 0.1.0, schema 1, pool size 2 ready 2, fonts.missing [], lucide 1.74.0 / simple-icons 16.38.0; kill -9 renderer service → pulih (recreated 1); `tools/node26/verify.sh` exit 0 (snapshot C9 identik, 4 cek lakard OK); tracer-e2e 1× LULUS terhadap service ($0,20); tidak ada proses tes tersisa. Linger root sudah `yes` (tidak diubah).
- **Risiko residual:** chromium-headless-shell memindahkan dirinya ke scope systemd sendiri (`app-org.chromium.Chromium-*.scope`), bukan cgroup lakard — pembersihan bergantung pada penutupan pipe Playwright (teramati tanpa yatim saat MainPID di-kill -9); `pool.lastError` permanen setelah satu kejadian; batas antrean 2× timeout untuk dokumen sangat besar; `inspect` depth 0 bisa > 32 KB; `read_skill` belum punya isi (story 13); dokumen uji `manual-crash-12` dan `tracer-*` ada di `~/.local/share/lakar/docs`.
