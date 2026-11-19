---
title: 'Tracer: Claude Code membuat board lewat execute dan menerima PNG'
type: feature
ticket: '3'
created: '2026-11-17'
status: built
baseline_revision: 'b61f9eff851fb33d2f61dc7b2d6958b3729a03d0'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/initiative-lakar/architecture-lakar-core/architecture-lakar-core.md'
  - '{project-root}/tools/node26/README.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Workspace Lakar masih berisi 11 paket kosong. Belum ada bukti bahwa jalur Claude Code → MCP stdio → daemon HTTP → exec QuickJS → core → render Chromium → PNG bisa berjalan di VPS bersama tanpa mengganggu aplikasi lain (C9). Story berikutnya (5–12) memperdalam setiap lapisan di atas jalur ini.

**Approach:** Bangun irisan paling tipis di setiap lapisan:
- skema minimal `board/frame/text` (zod) + enum error AD-11;
- `core` dengan op `add` transaksional;
- `exec` QuickJS sync yang mengekspos `add`;
- `render` murni yang membuat DOM;
- `lakard` (fastify, 127.0.0.1) dengan sesi, dokumen aktif, satu halaman Chromium, dan penulisan `<slug>.lakar.json`;
- `lakar-mcp` stdio dengan tool `open_doc`, `execute`, dan `screenshot`.

Chromium-headless-shell dipasang ke cache khusus Lakar. lakar-mcp didaftarkan lewat `.mcp.json` project, dengan Node 26 berpath absolut. Bukti end-to-end memakai `claude -p --strict-mcp-config`.

## Boundaries & Constraints

**Always:**
- Node/pnpm hanya lewat `/opt/node-26/bin/node` dan `/opt/node-26/bin/pnpm`. Versi dependensi terpin eksak sesuai architecture §Stack: `zod` 4.6.7, `fastify` 5.12.8, `playwright-core` 1.65.1 (revisi browser 1255), `@modelcontextprotocol/server` 2.4.0, `quickjs-emscripten` 0.32.0. `@modelcontextprotocol/client` 2.4.0 hanya devDep untuk tes mcp.
- Arah dependensi spine tetap utuh. `pnpm test` (termasuk `tests/dependency-direction.test.ts`) harus lulus:
  - `mcp` hanya bergantung ke `schema` dan berbicara dengan daemon lewat HTTP.
  - `render` tanpa API Node, tanpa playwright, dan tanpa impor runtime non-relatif. `import type` boleh, supaya `dist/index.js` bisa dimuat apa adanya di halaman Chromium/browser (AD-6).
  - `core` tanpa IO.
  - Paket yang butuh Node (`daemon`, `mcp`, dan `exec` bila perlu) menambah `@types/node` 26.6.6 serta `"types": ["node"]` di tsconfig-nya sendiri.
- **C9 (a) Chromium:** `PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/lakar/ms-playwright`. Jangan pakai `~/.cache/ms-playwright`, karena sudah dipakai aplikasi lain (chromium-1148, headless_shell-1148/1255, ffmpeg). Lokasinya di bawah `~/.cache` agar cadangan direktori data tidak membengkak. Instal lewat `scripts/install-browser.sh`: `/opt/node-26/bin/pnpm --filter @lakar/daemon exec playwright-core install chromium-headless-shell`. Daemon menetapkan `process.env.PLAYWRIGHT_BROWSERS_PATH` dari config sebelum `import('playwright-core')` dinamis. Instal tidak memakai `--with-deps` dan tidak memanggil apt.
- **C9 (b) MCP:** `.mcp.json` di root repo hanya berisi server `lakar`:
  - `command: "/opt/node-26/bin/node"`, `args: ["/root/lakar/packages/mcp/dist/main.js"]`, `env: {"LAKAR_URL": "http://127.0.0.1:7466"}`.
  - `~/.claude.json`, `~/.claude/settings.json`, dan MCP lain (`pencil`, `pen-headless`) tidak diubah. Jangan pakai `claude mcp add`.
- **C9 (c) Port:**
  - Daemon selalu bind ke `127.0.0.1` (AD-14), tanpa opsi host lain.
  - Port default 7466 (dicek bebas lewat `ss -ltnp` dan `docker ps -a` pada 2026-11-17), bisa diubah lewat `LAKAR_PORT`.
  - Kalau port terpakai, daemon keluar dengan kode 1 dan pesan yang menyebut `LAKAR_PORT`. Daemon tidak mencoba port lain.
  - Tes memakai port 0.
- **C9 (d) Data:**
  - Direktori data adalah `LAKAR_DATA_DIR` (default `~/.local/share/lakar`). Dokumen ditulis di `<data>/docs/<slug>.lakar.json`, dan entri riwayat ditambahkan ke `<data>/docs/<slug>.history.jsonl`.
  - Tulis lewat file tmp + rename.
  - Jangan menghapus atau menulis ulang `c9-baseline.txt` atau isi lain di luar `docs/`. Tes memakai direktori tmp.
- Bentuk respons HTTP `{ok:true,data} | {ok:false,error:{code,message,hint,retryable}}`. `code` berasal dari enum AD-11 di `schema` (kedua belas kode didefinisikan sekarang).
- Mutasi hanya lewat transaksi core (AD-4): salinan kerja (`structuredClone`) di-commit utuh atau dibuang utuh. ID 8 karakter `[A-Za-z0-9]` dialokasikan core dan dikembalikan sinkron ke snippet (AD-3). Respons `execute` berbentuk `created: [{id,name,path}]`.
- Snippet QuickJS tidak punya fs/jaringan dan memakai batas waktu (interrupt handler, default 2000 ms, kemudian `EXEC_TIMEOUT`) serta batas memori.

**Never:**
- Jangan instal paket apt, ubah PATH/profil shell, pakai `/usr/bin/node`/`npm -g`/corepack, buat unit systemd, atau sentuh Penpot (127.0.0.1:9101) dan container lain.
- Di luar cakupan (story lain): op selain `add` (6), properti visual/token/katalog node penuh (5, 8), registry font dan `FONT_MISSING` (7), `get/find/place/keep/editId/description` (9), ikon (10), check (11), pool, systemd, `config.toml`, tool MCP lain, dan `VERSION_MISMATCH` (12), skill (13).
- Jangan membaca `design/` atau `ux-lakar/golden-set.md` (C7).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Buka dokumen baru | `open_doc {slug:"tracer-a"}`, file belum ada | dokumen kosong (1 halaman) dibuat dan ditulis, lalu menjadi dokumen aktif sesi. `data: {docId, slug, rev:0, created:true}` | — |
| Buka dokumen yang ada | slug sama, sesi baru | dokumen dibaca dari file. `created:false`, rev tetap | file rusak → `SCHEMA_INVALID` |
| Slug tidak valid | `"../x"`, `"A B"`, `""` | ditolak. Pola: `^[a-z0-9][a-z0-9-]{0,63}$` | `SCHEMA_INVALID` + hint pola |
| Execute tanpa dokumen | sesi tanpa `open_doc` | tidak ada perubahan | `NO_ACTIVE_DOC` + hint "panggil open_doc" |
| Execute sukses | `const b=add(null,{type:'board',name:'Tracer',x:0,y:0,width:390,height:844,screen:'mobile'}); add(b,{type:'text',name:'Judul',content:'Halo dari Lakar',size:32})` | rev +1, file ditulis, satu baris riwayat. `created` berisi 2 entri | — |
| x/y pada node flow | `add(b,{type:'text',x:10,...})` | rollback penuh, file tidak berubah | `SCHEMA_INVALID` + hint "x/y hanya untuk board/node absolute" |
| Error tak tertangkap | snippet `add(...); throw new Error('x')` | rollback penuh, rev tetap, tanpa baris riwayat | `EXEC_ERROR` + pesan |
| Loop tak berujung | `while(true){}` | daemon tetap melayani permintaan lain | `EXEC_TIMEOUT` |
| Screenshot | `screenshot {boardId}` (atau tanpa id → board pertama) | PNG 390×844 skala 1 dengan teks terlihat | board tak ada → `NOT_FOUND`. Chromium gagal → `RENDER_FAILED` retryable |
| Daemon mati | tool MCP dipanggil, `LAKAR_URL` tidak menjawab | hasil tool `isError` dengan pesan yang menyebut URL dan cara menjalankan `lakard` | proses mcp tidak crash |

</intent-contract>

## Code Map

- `tests/dependency-direction.ts` -- aturan arah (EDGES, IO_FORBIDDEN, IO_LIBRARIES termasuk `playwright-core`, `fastify`, `@modelcontextprotocol/*`, `@types/node`) beserta pemindai regex. Read-only. Kode baru harus lulus pemindai ini.
- `tsconfig.base.json` -- `nodenext`, `verbatimModuleSyntax`, `types: []`, `noUncheckedIndexedAccess`. `${configDir}` dipakai untuk outDir/rootDir.
- `packages/render/tsconfig.json` -- lib DOM, `types: []`. Pertahankan.
- `packages/*/package.json` -- dependensi `workspace:*` sesuai arah. `daemon` sudah bergantung ke core/exec/render/check/icons/skills, dan `mcp` hanya ke schema. Tambah dependensi eksternal di sini.
- `vitest.config.ts`, `tsconfig.test.json` -- tes `packages/*/src/**/*.test.ts` ikut di-typecheck. Tes daemon yang menyalakan Chromium harus `skip` dengan pesan jelas bila browser di `LAKAR_BROWSERS_PATH` belum terpasang, supaya `pnpm test` tetap deterministik di mesin tanpa browser. Di mesin ini browser wajib terpasang dan tes tersebut wajib jalan.
- `tools/node26/verify.sh` -- bukti C9. Snapshot mencakup service yang berjalan, docker, npm -g, dan profil. Daemon tracer harus sudah dimatikan sebelum skrip ini dijalankan. Read-only.
- `.git/info/exclude`, `_bmad/`, `tools/node26/*`, `design/` -- jangan disentuh.
- Fakta mesin (2026-11-17): Ubuntu 26.04 aarch64. `ldd` biner `chrome-headless-shell` revisi 1255 di cache global tidak menunjukkan pustaka hilang, jadi apt kemungkinan tidak dibutuhkan. Port 7466 bebas. `~/.claude.json` hanya punya MCP global `pen-headless` dan `pencil`, dan project `/root/lakar` belum punya MCP.

## Tasks & Acceptance

**Execution:**
- [x] `packages/schema/src/` -- zod: `Board` (`type:'board'`, name, x, y, width, height, `screen: landing|app|mobile`, children), `Frame` (layout `none|row|column`, gap, padding, align, justify, width/height, `position?:'absolute'` + x/y hanya bila absolute), `Text` (name, content, size, color hex, tanpa family), `Document` (`schemaVersion:1`, pages[] berisi board), enum `ErrorCode` AD-11, serta tipe `ApiResult`. `.strict()` menolak x/y pada node flow. Tes: matriks validasi.
- [x] `packages/ports/src/index.ts` -- `RenderPort { screenshot(doc, boardId): Promise<Uint8Array> }`.
- [x] `packages/core/src/` -- `IdAllocator` (8 karakter, unik per dokumen), `beginTransaction(doc)` mengembalikan objek berisi `add(parentId|null, node) → id` (validasi zod per node, parent null = halaman pertama khusus board), `commit()` (rev +1, entri riwayat `{rev, sessionId, description, opsSummary, at}`, `created[]`), dan `rollback()`. Tes: commit, rollback, ID unik, serta `created` berupa list dengan nama ganda.
- [x] `packages/exec/src/` -- `api.ts` (permukaan tracer: `add`) + `runSnippet(code, tx, {timeoutMs, memoryBytes})` dengan quickjs-emscripten sync. Node dikirim sebagai JSON, dan id dikembalikan sinkron. Error tak tertangkap → `EXEC_ERROR`, timeout → `EXEC_TIMEOUT`. Kedua kasus berujung rollback oleh pemanggil. Tes: sukses, throw, loop, akses `require/fetch` tidak ada.
- [x] `packages/render/src/index.ts` -- `mountBoard(doc, boardId, root: HTMLElement)`: board menjadi div ukuran tetap dengan `overflow:hidden`, frame menjadi flexbox (pemetaan 1:1), text menjadi div dengan `font-family: sans-serif` [sementara sampai story 7]. Hanya `import type` dari schema.
- [x] `packages/daemon/src/` -- `config.ts` (env `LAKAR_PORT`=7466, `LAKAR_DATA_DIR`, `LAKAR_BROWSERS_PATH`, host terkunci 127.0.0.1), `store.ts` (baca/tulis atomik `docs/<slug>.lakar.json` + append riwayat), `sessions.ts` (`POST /sessions` → `sessionId`, dokumen aktif per sesi, header `X-Lakar-Session`), `chromium.ts` (satu browser + satu halaman yang dibuat malas dan diserialkan dengan mutex; memuat halaman render yang disajikan daemon di `GET /render/page` + `GET /render/index.js` dari dist render; screenshot elemen board dengan `scale:'css'`; adaptor `RenderPort`), `server.ts` (rute `POST /docs/open`, `POST /execute`, `POST /screenshot`), dan `main.ts` (entry `lakard`, menangani EADDRINUSE dan SIGTERM). Tes: integrasi HTTP sesuai matriks (port 0, data dir tmp), termasuk PNG 390×844 dengan piksel teks.
- [x] `packages/mcp/src/` -- `main.ts` stdio dengan McpServer v2 dan tiga tool: `open_doc {slug}`, `execute {code, description?}`, dan `screenshot {boardId?}` → konten `image/png`. `sessionId` dibuat malas pada panggilan pertama, sehingga proses mcp tetap hidup walau daemon mati. Tes: klien MCP in-memory/stdio terhadap daemon tiruan.
- [x] `package.json` (root) -- skrip `lakard` (`node packages/daemon/dist/main.js`) dan `install-browser`.
- [x] `scripts/install-browser.sh` -- set `PLAYWRIGHT_BROWSERS_PATH` ke `${LAKAR_BROWSERS_PATH:-$HOME/.cache/lakar/ms-playwright}`, instal chromium-headless-shell (idempoten), lalu coba launch. Kalau gagal karena pustaka hilang, cetak daftar pustaka dan keluar ≠ 0 tanpa memanggil apt.
- [x] `.mcp.json` -- seperti di Boundaries (b).
- [x] `scripts/tracer-e2e.sh` + `scripts/tracer-check.mjs` -- menyalakan `lakard` di latar (Node 26, port 7466), menjalankan `claude -p` (prompt: open_doc slug `tracer-<ts>`, satu execute board 390×844 berisi teks "Halo dari Lakar", lalu screenshot) dengan `--strict-mcp-config --mcp-config /root/lakar/.mcp.json --allowedTools mcp__lakar__open_doc mcp__lakar__execute mcp__lakar__screenshot --output-format stream-json --verbose`, dan menyimpan stream ke direktori `mktemp -d`. Checker lalu: (1) memastikan urutan tool_use open_doc → execute (tepat satu) → screenshot; (2) mengekstrak PNG dari tool_result, menyimpannya, dan memastikan IHDR 390×844 serta ada piksel non-latar di area teks; (3) memastikan `~/.local/share/lakar/docs/tracer-<ts>.lakar.json` ada dan berisi board 390×844 dengan text tersebut. Daemon dimatikan di `trap EXIT`. Path PNG dicetak.

**Acceptance Criteria:**
- Given browser terpasang dan build selesai, when `bash scripts/tracer-e2e.sh`, then exit 0, checker melaporkan ketiga cek lulus, dan path PNG dicetak untuk dilihat Adam.
- Given `ls -la ~/.cache/ms-playwright` dicatat sebelum story, when story selesai, then listing identik, dan browser Lakar hanya ada di `~/.cache/lakar/ms-playwright`.
- Given `lakard` jalan, when `ss -ltnp | grep 7466`, then hanya `127.0.0.1:7466`. Given port terpakai, when `lakard` dijalankan, then exit 1 dengan pesan `LAKAR_PORT`.
- Given selesai, when `jq '.mcpServers|keys' ~/.claude.json` dan `md5sum ~/.claude/settings.json`, then sama dengan sebelum story (`["pen-headless","pencil"]`).
- Given selesai dan daemon sudah dimatikan, when `bash tools/node26/verify.sh`, then exit 0 dan `c9-baseline.txt` tidak berubah.

## Langkah HITL (butuh Adam)

1. **Sebelum implementasi (plan_checkpoint):** setujui (a) unduhan chromium-headless-shell revisi 1255 (sekitar 100–200 MB) ke `~/.cache/lakar/ms-playwright`, (b) port 7466, (c) `.mcp.json` project yang di-commit, dan (d) satu panggilan `claude -p` berbayar untuk verifikasi.
2. **Kondisional:** kalau `install-browser.sh` gagal launch karena pustaka sistem hilang, implementasi HALT `blocked` dengan daftar paket apt (nama Ubuntu 26.04, mis. `libasound2t64`). Paket apt hanya dipasang Adam, setelah ia menyetujuinya.
3. **Setelah build:** Adam melihat PNG yang dicetak `tracer-e2e.sh`. Opsional: jalankan `/opt/node-26/bin/pnpm lakard` di satu terminal, lalu `claude` interaktif di `/root/lakar` dan setujui server project `lakar`. Persetujuan itu dicatat Claude Code per project dan dilakukan Adam sendiri, bukan agen.

## Implementation Notes

- **Batas memori QuickJS:** di build release-sync 0.32.0, `runtime.setMemoryLimit` tidak efektif (QuickJS melaporkan `malloc_usable_size unavailable`, sehingga setiap alokasi dihitung ~8 byte; uji 160 MB lolos dengan limit 8 MB). Batas ditegakkan dengan `WebAssembly.Memory` ber-`maximum` (16 MB dasar + `memoryBytes`) yang diberikan lewat `newVariant(RELEASE_SYNC, {wasmMemory})`. Satu modul per nilai batas; snippet berjalan berurutan, jadi batas modul = batas per panggilan. Runtime yang gagal di-dispose setelah OOM membuat modul dibuang dan dimuat ulang. `setMemoryLimit` tetap dipanggil.
- **Error host di snippet:** `add` yang melempar `LakarError` muncul di snippet sebagai `Error` bernama `LakarError` (bisa ditangkap, AD-4). Bila tidak tertangkap, kode aslinya (mis. `SCHEMA_INVALID` + hint x/y) diteruskan, bukan `EXEC_ERROR`.
- **`ports` tanpa dependensi:** `RenderPort<Doc = unknown>` generik, karena `ports` tidak boleh mengimpor `schema` (EDGES).
- **`core`/`exec` tanpa lib DOM/@types/node:** `structuredClone`, `crypto.getRandomValues`, `WebAssembly.Memory` diakses lewat tipe minimal di `globalThis` (bukan impor modul IO).
- **`render`:** `/// <reference lib="dom" />` di `src/index.ts` agar typecheck tes root (`tsconfig.test.json`, tanpa DOM) tetap lulus.
- **Kesalahan internal daemon** (mis. gagal tulis file) tidak punya kode AD-11 khusus; dipetakan ke `EXEC_ERROR` `retryable:true`, HTTP 500.
- **Sesi tidak dikenal** (daemon restart) → `NOT_FOUND` HTTP 401; lakar-mcp membuat sesi baru dan mengulang sekali (dokumen aktif hilang, agen akan menerima `NO_ACTIVE_DOC`).
- **Loop tak berujung:** QuickJS sync memblokir event loop sampai batas waktu (2000 ms); permintaan lain antre lalu dilayani. Worker thread menyusul bila perlu (pool, story 12).
- **Screenshot:** `POST /screenshot` → `{boardId,width,height,mimeType,png(base64)}`; mcp mengembalikan konten `image/png` + teks metadata.
- **Dekoder PNG** (`packages/daemon/src/png.ts`) dipakai tes daemon dan `scripts/tracer-check.mjs` (lewat `dist/png.js`).
- **Verifikasi orkestrator (step 3):** tes `SIGTERM → exit 0` flaky (1 dari ~5 run: exit `null`, proses terbunuh aksi default) karena baris `mendengarkan` dicetak sebelum handler sinyal terpasang. `main.ts` kini memasang handler SIGTERM/SIGINT dulu, baru mencetak baris kesiapan; 10/10 run `pnpm test` lulus setelahnya.
- **Audit matriks:** baris Screenshot "Chromium gagal → `RENDER_FAILED` retryable" belum punya tes. Ditambah dua tes di `packages/daemon/src/index.test.ts`: render port gagal → HTTP 503 `RENDER_FAILED` retryable (dokumen tidak berubah), dan adaptor `ChromiumRenderer` dengan halaman render tak terjangkau → `LakarError RENDER_FAILED` retryable.
- **Listing `~/.cache/ms-playwright`:** `diff` harfiah berbeda hanya di baris `..` (nlink/mtime `~/.cache` karena `~/.cache/lakar` dibuat); semua entri di dalamnya identik (`diff` tanpa baris `..` kosong).
- **Bukti PNG:** salinan PNG e2e di [evidence/1.3-tracer.png](evidence/1.3-tracer.png) (5,9 KB).

## Plan Change Log

- 2026-11-17: dependensi workspace tambahan yang diizinkan closure EDGES: `exec` → `@lakar/schema`; `daemon` → `@lakar/schema`, `@lakar/ports`, `zod` 4.6.7. `mcp` → `zod` 4.6.7 (input schema tool). `exec` tidak memakai `@types/node`.

## Review Triage Log

### 2026-11-17 — Review pass
- verdicts: 5 findings — high 0, medium 2, low 3, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` HTTP 401 dipilih lewat regex `/sesi|X-Lakar-Session/` pada pesan error, sehingga NOT_FOUND biasa (mis. slug `sesi-latihan`) jadi 401 dan lakar-mcp membuang sesinya → agen menerima NO_ACTIVE_DOC — dikonfirmasi di `server.ts` error handler + `client.ts` retry 401; diperbaiki: `UnknownSessionError` di `sessions.ts`, 401 hanya untuk kelas itu; tes baru slug `sesi-latihan` → 404.
  - `[medium]` `[patch]` `appendHistory` yang gagal setelah `store.write` membuat file di rev N+1 sementara salinan memori tetap rev N; execute berikutnya menimpa perubahan — dikonfirmasi dari urutan write → appendHistory → docs.set; diperbaiki: `docs.set` tepat setelah `store.write` berhasil, sebelum appendHistory.
  - `[low]` `[patch]` Dua tool call paralel sebelum sesi ada membuat dua sesi; dokumen aktif hilang — dikonfirmasi (`#session()` menyimpan id setelah await); diperbaiki: promise sesi yang tertunda di-cache dan dibagi, direset saat gagal/401; tes dua `open_doc` paralel → satu `/sessions`.
  - `[low]` `[reject]` Respons JSON non-AD-11 (mis. 404 bawaan fastify, layanan lain di LAKAR_URL) menghasilkan pesan TypeError yang membingungkan — benar, tetapi hanya terjadi bila LAKAR_URL salah sasaran/versi tak cocok (story 12 menangani VERSION_MISMATCH); perbaikannya menambah guard bentuk respons, tidak sepadan untuk tracer.
  - `[low]` `[patch]` Guard `install-browser.sh` terhadap `~/.cache/ms-playwright` membandingkan string mentah (slash akhir, `./`, symlink lolos) — dikonfirmasi; diperbaiki: bandingkan `realpath -m` kedua path (dicek manual: kedua varian ditolak exit 2).

## Design Notes

- **Font tracer:** text memakai `sans-serif` dari sistem (fonts-liberation sudah terpasang). Ini pengecualian sementara AD-6 yang tercatat di sini. Story 7 menggantinya dengan registry Fontsource dan `FONT_MISSING`, dan skema text tracer sengaja belum punya `family`.
- **Render dimuat tanpa bundler:** daemon menyajikan `packages/render/dist/index.js` ke halaman Chromium sebagai module. Karena itu render tidak boleh punya impor runtime non-relatif. Tes daemon memastikan `dist/index.js` render tidak berisi `from '@` atau specifier bare.
- **Halaman tunggal + mutex:** cukup untuk tracer. Story 12 menggantinya dengan pool sewa eksklusif di balik `RenderPort` yang sama.
- **`claude -p --strict-mcp-config`:** membuktikan "sesi Claude Code baru" tanpa menyentuh konfigurasi MCP global. Konfigurasi `.mcp.json` yang sama dipakai sesi interaktif setelah Adam menyetujuinya.

## Verification

**Commands:**
- `ls -la ~/.cache/ms-playwright > "$SCRATCH/pw-before.txt"` (sebelum mulai) -- expected: tercatat
- `cd /root/lakar && /opt/node-26/bin/pnpm install --frozen-lockfile=false && /opt/node-26/bin/pnpm build` -- expected: exit 0
- `cd /root/lakar && bash scripts/install-browser.sh` -- expected: exit 0, `~/.cache/lakar/ms-playwright/chromium_headless_shell-1255` ada, launch OK
- `cd /root/lakar && /opt/node-26/bin/pnpm test` -- expected: exit 0, tes Chromium daemon jalan (tidak skip), dan tes arah dependensi lulus
- `cd /root/lakar && bash scripts/tracer-e2e.sh` -- expected: exit 0, tiga cek lulus, path PNG dicetak
- `diff <(ls -la ~/.cache/ms-playwright) "$SCRATCH/pw-before.txt"` -- expected: tidak ada beda
- `jq -r '.mcpServers|keys[]' ~/.claude.json` -- expected: `pen-headless`, `pencil` saja
- `ss -ltnp | grep -c 7466` (setelah e2e selesai) -- expected: 0
- `cd /root/lakar && bash tools/node26/verify.sh` -- expected: exit 0

**Manual checks:**
- Adam membuka PNG yang dicetak `tracer-e2e.sh`. Expected: board 390×844 dengan teks "Halo dari Lakar" terbaca.

## Auto Run Result

- Status: ready-for-dev (HALT setelah planning, sesuai invocation). Menunggu persetujuan plan oleh Adam (plan_checkpoint, hitl).
- 2026-11-17 implementasi: build + `pnpm test` (12 file, 100 tes, tes Chromium daemon jalan) lulus; `install-browser.sh` OK (chromium_headless_shell-1255 + ffmpeg-1013 di `~/.cache/lakar/ms-playwright`); `tracer-e2e.sh` exit 0, ketiga cek lulus (claude -p ~10 s, ~$0.18), PNG `/tmp/lakar-tracer-UXlYoJ/tracer-1794954511.png`; isi `~/.cache/ms-playwright` identik (hanya mtime/nlink entri `..` = `~/.cache` berubah karena `~/.cache/lakar` dibuat); MCP global `["pen-headless","pencil"]` dan md5 settings.json tetap; port 7466 bebas setelah e2e; `verify.sh` exit 0, `c9-baseline.txt` tidak berubah. Menunggu cek manual PNG oleh Adam.
- 2026-11-17 hasil akhir (build-auto, orkestrator):
  - **Ringkasan:** jalur tracer Claude Code → lakar-mcp (stdio) → lakard (HTTP 127.0.0.1) → QuickJS → core → Chromium → PNG berjalan; skema board/frame/text + 12 kode AD-11, core transaksional, exec QuickJS sync, render DOM murni, daemon, mcp 3 tool, `.mcp.json` project, skrip install-browser dan tracer-e2e.
  - **File:** `packages/schema/src/index.ts` (skema zod, ErrorCode, LakarError); `packages/ports/src/index.ts` (RenderPort); `packages/core/src/index.ts` (IdAllocator, transaksi); `packages/exec/src/{api,index}.ts` (permukaan `add`, runSnippet); `packages/render/src/index.ts` (mountBoard); `packages/daemon/src/{config,store,sessions,mutex,chromium,server,start,main,png,index}.ts` (lakard); `packages/mcp/src/{client,server,main,index}.ts` (lakar-mcp); tes `*.test.ts` per paket; `package.json` (skrip lakard, install-browser); `scripts/install-browser.sh`, `scripts/tracer-e2e.sh`, `scripts/tracer-check.mjs`; `.mcp.json`; `pnpm-lock.yaml`; bukti `evidence/1.3-tracer.png`.
  - **Review:** 4 patch (2 medium, 2 low), 0 defer, 1 reject (respons non-AD-11 → guard tidak sepadan, lihat triage log). Patch per verdict: medium 2, low 2, high 0.
  - **Follow-up review:** `true` — dua patch medium pada pass pertama. Risiko yang belum diverifikasi ulang end-to-end: patch sesi (`UnknownSessionError`, promise sesi bersama di lakar-mcp) belum dilalui `claude -p` sungguhan; hanya tes unit/integrasi (104 lulus) yang menutupinya.
  - **Verifikasi:** `pnpm install` + `pnpm build` exit 0; `install-browser.sh` exit 0 (launch OK 159.0.8154.6, `~/.cache/lakar/ms-playwright/chromium_headless_shell-1255`); `pnpm test` 12 file/104 tes lulus, 0 skip, 5/5 run berturut stabil (tes Chromium daemon jalan); `tracer-e2e.sh` exit 0, ketiga cek LULUS ($0,18, ~10 s) sebelum patch review; `~/.cache/ms-playwright` identik kecuali baris `..`; MCP global `["pen-headless","pencil"]`, md5 settings.json tetap; port 7466 bebas, tidak ada proses Chromium Lakar tersisa; `tools/node26/verify.sh` exit 0, snapshot C9 identik.
  - **Risiko residual:** loop tak berujung memblokir event loop daemon ≤2 s (permintaan lain antre); dokumen tracer e2e tertinggal di `~/.local/share/lakar/docs/` (tracer-1794954511, tracer-1794954773); persetujuan server project `lakar` di sesi interaktif tetap langkah Adam; respons non-AD-11 menghasilkan pesan error kurang jelas.
