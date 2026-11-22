---
title: 'Ikon Lucide dan Simple Icons lewat nama kanonik'
type: feature
ticket: '10'
created: '2026-11-18'
status: done
baseline_revision: 'e5fdd26d3caab26a16cd74aab6d4ae07be5079e7'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-api-execute-lengkap-baca-model-place-keep-dan-perbaikan-via-plan.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Node `icon` sudah ada di skema, tetapi render hanya menggambar kotak kosong, alias Lucide (mis. `home`) tidak dikonversi, nama yang tidak dikenal lolos tanpa error, dan agen tidak punya `icon_search`. Akibatnya agen tidak bisa memakai ikon sungguhan, padahal DESIGN.md melarang emoji/glyph sebagai pengganti ikon (AD-9).

**Approach:** `packages/icons` memuat lucide-static 1.74.0 dan simple-icons 16.38.0 dari node_modules. Isinya: katalog kanonik + alias, `tags.json`, pencarian, saran `ICON_UNKNOWN`, dan data glyph. Exec mengkanonikkan node icon di `add/update/replace/duplicate` lewat port katalog, lalu mengekspos `iconSearch(...)`. Daemon menyelesaikan glyph sebelum render dan menyediakan `POST /icons/search`. MCP mendapat tool `icon_search`. Render menggambar SVG dari data glyph yang dikirim lewat opsi render, tanpa impor Node (AD-6).

## Boundaries & Constraints

**Always:**
- Nama ikon kanonik ada di field `icon`; `name` = nama layer AD-3. Bila `name` tidak diisi pada node icon (add/replace), exec mengisinya `Icon / <lib> / <icon kanonik>`.
- `version` diisi exec dengan versi pustaka terpasang (`1.74.0` / `16.38.0`) setiap kali `icon`/`lib`/`version` ditulis. Kalau agen mengirim versi lain → `SCHEMA_INVALID` (hint: hapus `version`, diisi otomatis).
- `ICON_UNKNOWN`: pesan memuat **tepat 3** saran nama kanonik yang berbeda dari pustaka yang sama. Kalau nama ada di pustaka lain, hint menyebut `lib` yang benar. Hint juga menyebut `icon_search`/`iconSearch`. Error dilempar host, jadi exec memberi `baris L:K` + `editId` seperti error lain.
- Render tetap murni browser: hanya `import type` dari luar paket. Glyph datang sebagai data JSON lewat opsi `renderBoard`/`mountBoard` (serializable lewat `page.evaluate`). Elemen SVG dibuat dengan `createElementNS` dari daftar `[tag, attrs]`, tidak lewat `innerHTML`.
- Semantik gambar (didokumentasikan di JSDoc dan deskripsi MCP):
  - Lucide: `stroke = color` (default `#000000`, sama dengan teks); `stroke-width = strokeWidth` dalam unit grid 24 (default 2, seperti `strokeWidth` lucide); linecap/linejoin `round`; `fill none`. `filled: true` → bentuk diisi `color`. Atribut glyph `fill="currentColor"` → `color`.
  - Simple Icons: fill = `color` (default = hex brand dari data simple-icons); `strokeWidth`/`filled` diabaikan.
  - Kotak node = `size`×`size`, viewBox glyph dipetakan penuh, overflow terlihat (stroke di tepi tidak terpotong).
- Efek ikon: opacity/blend/blur/rotation lewat `applyEffects` yang sudah ada. Shadow `drop` → `drop-shadow()` mengikuti bentuk glyph (`dropShadowFilters`, seperti path); `inner`/`spread` tidak didukung (sama dengan path).
- Arah dependensi spine tetap: `icons → schema` saja; `exec → core, ports`; `render → schema, ports`; daemon merakit. `tests/dependency-direction.test.ts` lulus.
- Node: `/opt/node-26/bin/node`, `/opt/node-26/bin/pnpm` (path absolut). Dependensi baru hanya `lucide-static@1.74.0` dan `simple-icons@16.38.0` (dipin persis), diinstal lewat pnpm workspace. Chromium/daemon yang dinyalakan tes dimatikan lagi.

**Never:**
- Menggambar ikon manual, memakai emoji, atau memakai pustaka lain (Phosphor dsb. milik tonggak ke-2).
- `icons.md`/skill/`read_skill`/`api.md` (story 13), LC/`layout_check` (11), pool/status (12).
- Mengubah kontrak `{ok, data|error}` atau enum AD-11 (`ICON_UNKNOWN` sudah ada).
- Membaca `design/` atau `golden-set.md`, atau memasukkan rubrik ke teks apa pun (C7). Menyentuh service, port tetap, cache global, atau `~/.cache/ms-playwright` (C9).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Alias | `add(b,{type:'icon', lib:'lucide', icon:'home', size:24})` | tersimpan `icon:'house'`, `version:'1.74.0'`, `name:'Icon / lucide / house'`; PNG menampilkan rumah | — |
| Kanonik + nama layer | `icon:'search', name:'Cari'` | `icon` tetap, `name` tetap `Cari` | — |
| Nama tak dikenal | `icon:'hoem'` / `icon:'zzzqx'` | rollback | `ICON_UNKNOWN`, pesan memuat tepat 3 saran berbeda (`hoem` → `house` termasuk), `baris L:K`, `editId` |
| Salah pustaka | `lib:'lucide', icon:'github'` | rollback | `ICON_UNKNOWN` + hint `lib:'simple-icons'` |
| update/replace/duplicate | `update(i,{icon:'more-horizontal'})`; `update(i,{lib:'simple-icons'})` pada `house` | `ellipsis` + version di-stamp; `house` di simple-icons → error | `ICON_UNKNOWN` |
| Versi asing | `version:'0.1.0'` | rollback | `SCHEMA_INVALID` + hint |
| Slug simple-icons ber-underscore | `lib:'simple-icons', icon:'hive_blockchain'` | diterima (regex skema `icon` diperluas ke `_`) | — |
| iconSearch / icon_search | `'dumbbell'`; `'gym'`; `{lib:'simple-icons'}`; `limit` | hasil urut skor: nama persis > awalan nama/alias > token nama > tag persis > tag sebagian; `dumbbell` pertama; `gym` memuat `dumbbell`; default 10, maks 50 | query kosong / opsi asing / limit di luar 1–50 → `SCHEMA_INVALID` |
| Render | lucide stroke/filled/strokeWidth/ukuran 16–32, simple-icons warna brand default, opacity/rotation/shadow | piksel glyph sesuai warna; drop shadow mengikuti bentuk | glyph tidak diberikan → `RenderResult {ok:false, code:'ICON_UNKNOWN'}` |
| Screenshot dokumen lama | dokumen di disk berisi `icon` tak dikenal | — | 422 `ICON_UNKNOWN` + 3 saran sebelum render; screenshot valid berikutnya 200 |

</intent-contract>

## Code Map

- `packages/schema/src/nodes.ts` (`iconShape`, baris ~261) -- regex `icon` → `^[a-z0-9][a-z0-9_-]*$` (6 slug simple-icons memakai `_`). Bagian lain tidak diubah.
- `packages/schema/src/icons.ts` (baru, diekspor dari `index.ts`) -- tipe data bersama: `ICON_LIBS`, `IconLib`, `IconGlyph = {lib, icon, viewBox:[0,0,24,24], kind:'stroke'|'fill', nodes: [tag, Record<string,string>][], brandColor?: '#RRGGBB'}`, `IconMatch = {lib, icon, tags?: string[], title?: string, aliasOf?: string}`, `iconKey(lib, icon)` = `"lib/icon"`. Tanpa IO.
- `packages/ports/src/index.ts` -- `IconCatalogPort<Lib extends string = string>`: `canonical(lib, icon): {icon, version}` (melempar ICON_UNKNOWN), `search(query, {lib?, limit?}): IconMatch-like[]`, `glyph(lib, icon): glyph | undefined`, `versions`. Generik/struktural karena ports tanpa dependensi; `icons` mengimplementasikannya secara struktural (tidak mengimpor ports).
- `packages/icons/src/index.ts` (+ file pendukung, mis. `catalog.ts`, `search.ts`) -- `IconCatalog.load()` (singleton malas) membaca:
  - Lucide: `lucide-static/icon-nodes.json` (2089 kanonik, elemen path/circle/rect/line/ellipse/polyline/polygon), `tags.json`, dan alias dari `dist/esm/lucide-static.mjs` (`export { default as Home, default as House } from './icons/house.mjs'`). 312 file `icons/*.svg` yang tidak ada di icon-nodes dipetakan lewat kebab→Pascal.
  - Simple Icons: `simple-icons/icons.json` (`slug`, `title`, `hex`, `aliases`) dan path dari `simple-icons/icons/<slug>.svg`. Path bisa dibaca malas dan di-cache. Paket ini punya `exports`, jadi `package.json`-nya tidak bisa di-resolve; versi dibaca lewat path root paket.
  - Versi dibaca dari package.json yang terpasang.
  - Fungsi: `canonical`, `search`, `suggest(lib, name)` (3 nama: hasil search token nama, ditambah jarak edit), `glyph`, `glyphs(refs)`.
  - `package.json`: dependensi `lucide-static: 1.74.0`, `simple-icons: 16.38.0`, devDependency `@types/node`. Tambah script `test` dengan pola paket lain.
- `packages/exec/src/api.ts` -- tambahkan `icons: IconCatalogPort` ke `ApiContext`. Helper kanonikalisasi dipanggil sebelum `ctx.tx.*`:
  - `add`/`replace`: node bertipe icon.
  - `update`/`duplicate`: patch yang menyentuh `icon`/`lib`/`version` pada node icon (`ctx.view()`). lib/icon digabung dari node lama.
  - Input non-objek atau lib tak valid dibiarkan sampai ke validasi core (SCHEMA_INVALID).

  Fungsi baru `iconSearch(query, {lib?, limit?})` (`kind:'read'`), dengan JSDoc di `LakarApi`, entri tabel `API`, dan contoh teruji. Perbarui doc `add` (alias, default name/version, ICON_UNKNOWN).
- `packages/exec/src/index.ts` -- `RunOptions.icons` wajib, diteruskan ke `ApiContext`. `packages/exec/src/index.test.ts`: katalog palsu kecil (struktural) untuk tes exec; tes kanonikalisasi, version, default name, ICON_UNKNOWN + lokasi baris, `iconSearch`, dan contoh API (termasuk `iconSearch`).
- `packages/render/src/icon.ts` (baru) + `layout.ts` (`renderPlaceholder` → `renderIcon`; `RenderContext.icons: ReadonlyMap<string, IconGlyph>`; filters `dropShadowFilters` untuk icon) + `index.ts`:
  - `iconRefs(board)` diekspor, setara `fontRequests`.
  - `renderBoard` opsi `icons?: readonly IconGlyph[]`. Glyph yang tidak lengkap → `{ok:false, code:'ICON_UNKNOWN', icons:string[], message}` sebelum mount.
  - `mountBoard` menerima `icons` opsional; glyph yang tidak ada → elemen kosong berukuran size.
- `packages/render/test/visual.test.ts` + golden baru `packages/render/test/golden/ikon.png` (dan `harness.ts` bila perlu meneruskan icons):
  - Data glyph fixture diambil dari lucide-static/simple-icons sungguhan, tidak digambar tangan. Pilih fixture JSON yang dibuat sekali, atau devDependency + pembacaan di harness. Generator dan sumbernya dicatat.
  - Kasus: house/star filled/check dengan warna dan strokeWidth berbeda, ukuran 16/20/24/32, github + whatsapp dengan warna brand default, ikon di row bersama teks, opacity/rotation, dan drop shadow.
  - Asersi piksel (warna di pusat glyph, latar di luar) + golden.
- `packages/daemon/src/chromium.ts` -- `ChromiumOptions.icons` (katalog). `screenshot` menyelesaikan `iconRefs(board)` → glyph, lalu mengirimnya ke `__lakarRender(doc, boardId, fonts, icons)` di `RENDER_PAGE_HTML`. Hasil render `ICON_UNKNOWN` → LakarError non-retryable.
- `packages/daemon/src/server.ts` -- `buildServer({..., icons = IconCatalog.load()})`, diteruskan ke `runSnippet({icons})`.
  - `POST /icons/search` (zod strict `{query, lib?, limit?}`, sesi wajib seperti endpoint lain, tanpa dokumen aktif) → `{query, results}`.
  - `/screenshot`: setiap ref ikon board yang tidak dikenal katalog → `ICON_UNKNOWN` + 3 saran sebelum render.
  - `Daemon` mengekspos `icons`.
- `packages/daemon/src/{start,main,index}.ts` -- teruskan katalog ke renderer dan server; ekspor bila perlu.
- `packages/daemon/src/index.test.ts`:
  - execute `home` → `get` mengembalikan `house` + version + default name; screenshot menampilkan piksel ikon berwarna di dalam kotak ikon.
  - `hoem` → 422 ICON_UNKNOWN dengan tepat 3 saran + editId.
  - `/icons/search` dumbbell → hasil pertama `lucide/dumbbell`.
  - Setiap `API[*].example` dijalankan dengan katalog asli.
- `packages/mcp/src/server.ts`, `index.test.ts` -- tool `icon_search` (`{query, lib?, limit?}` → `/icons/search`). Deskripsi menyebut nama kanonik, alias otomatis, dan simple-icons khusus logo brand. `EXECUTE_DESCRIPTION`: bagian icon (strokeWidth grid 24 default 2, filled, default color/name/version, alias, ICON_UNKNOWN) + `iconSearch(`. Tes fake daemon untuk icon_search.
- `tests/execute-description.test.ts` -- otomatis mewajibkan `iconSearch(`. Tambah asersi bahwa deskripsi menyebut `icon_search`/`ICON_UNKNOWN`.
- Read-only: `packages/core` (semantik op tidak diubah), `packages/render/src/paint.ts` (pakai ulang `dropShadowFilters`, `applyEffects`), `scripts/tracer-*`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/schema/src/{nodes,icons,index}.ts` + tes -- regex `_`, tipe glyph/match -- kontrak data bersama.
- [x] `packages/ports/src/index.ts` -- `IconCatalogPort` -- port exec/daemon.
- [x] `packages/icons/**` + `package.json` + pnpm install (lockfile) -- katalog, alias, search, suggest, glyph + tes data asli (2089 kanonik, 312 alias semua terpetakan, `home→house`, `more-horizontal→ellipsis`, 3472 simple-icons, versi = pin) -- AD-9.
- [x] `packages/exec/src/{api,index,index.test}.ts` -- kanonikalisasi, version/name default, `iconSearch` -- AD-7/AD-9.
- [x] `packages/render/src/{icon,layout,index}.ts` + `test/visual.test.ts` + golden -- SVG sungguhan, shadow ikon -- AD-6.
- [x] `packages/daemon/src/{chromium,server,start,main,index,index.test}.ts` -- resolusi glyph sebelum render, `/icons/search`, ICON_UNKNOWN screenshot -- AD-9/AD-10.
- [x] `packages/mcp/src/{server,index.test}.ts`, `tests/execute-description.test.ts` -- tool `icon_search`, deskripsi.

**Acceptance Criteria:**
- Given daemon sungguhan (Chromium Lakar), when execute menambah `icon:'home'` lalu screenshot, then `get` mengembalikan `icon:'house'` dan PNG memuat piksel berwarna ikon di kotak ikon.
- Given execute dengan `icon:'tidak-ada'`, then respons 422 `ICON_UNKNOWN`, pesan memuat tepat 3 saran, dan dokumen tidak berubah (rev tetap).
- Given klien MCP, when memanggil `icon_search {query:'dumbbell'}`, then hasil tidak kosong dan hasil pertama `lucide`/`dumbbell`.
- Given golden `ikon.png`, when dibandingkan secara visual, then glyph tajam, warnanya sesuai properti, stroke tidak terpotong, dan shadow mengikuti bentuk.
- Given `pnpm test` penuh, then lulus dengan 0 skip dan tes arah dependensi + tes browser-pure render lulus.

## Implementation Notes

- Data simple-icons ada di `simple-icons/data/simple-icons.json` (bukan `icons.json`); tag pencarian = `aliases.aka/old/dup/loc`. Root kedua paket dicari dari entry yang di-resolve (`packageRoot`).
- `pnpm add` menambahkan `minimumReleaseAgeExclude: [lucide-static@1.74.0]` ke `pnpm-workspace.yaml` (rilis lebih muda dari kebijakan umur minimum pnpm); dibiarkan agar pin persis tetap terpasang.
- `IconMatch`: bila yang cocok alias, `icon` = alias dan `aliasOf` = kanonik (satu hasil per ikon kanonik); alias tetap diterima `add` dan disimpan kanonik.
- Saran ICON_UNKNOWN: jarak edit Damerau-OSA ≤ max(1, ⌊len/3⌋) dulu, lalu hasil `search` token nama, lalu jarak edit terdekat; selalu tepat 3. Format pesan `…; saran: a, b, c`.
- `glyph()` menerima alias juga (dokumen lama berisi alias tetap ter-render); `/screenshot` memvalidasi setiap ref lewat `canonical` sebelum render.
- Render: elemen/atribut glyph disaring whitelist (bentuk SVG dasar; tanpa `on*`/href). `iconKey` diduplikasi di render (render hanya boleh `import type`).
- Fixture glyph tes render: `packages/render/test/fixtures/icon-glyphs.json`, dibuat oleh `gen-icon-glyphs.mjs` dari dist `@lakar/icons`.
- `packages/mcp/package.json` mendapat script `test` (pola paket lain) supaya perintah verifikasi `--filter @lakar/mcp` benar-benar menjalankan tes.

## Plan Change Log

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 2 findings — high 0, medium 0, low 2, false 0, maybe-false 0
- findings:
  - `[low]` `[patch]` nama `icon` tak dikenal yang sangat panjang (mis. 100k karakter; regex tanpa batas panjang) membuat `suggest` menghitung jarak edit O(len) terhadap ~2400/3472 nama secara sinkron di host, memblokir daemon melewati batas 2 dtk — diperbaiki: `suggest` (dan kueri token di hint) hanya memakai 64 karakter pertama (`SUGGEST_MAX_NAME`); tes baru: 100k karakter → ICON_UNKNOWN + 3 saran < 500 ms.
  - `[low]` `[patch]` kueri hanya pemisah (`-`, ` _ `) lolos guard trim lalu `tokens=[]` sehingga semua ikon cocok (hasil acak) di iconSearch, POST /icons/search, dan MCP icon_search — diperbaiki: `search` melempar SCHEMA_INVALID bila kueri tanpa token (hint sama dengan kueri kosong); tes baru untuk `-`, ` _ `, ` - `.

## Design Notes

- **Glyph lewat opsi render, bukan dokumen ter-resolve:** tipe `Resolved*` dokumen tidak berubah. Glyph mengikuti pola font: daemon menyelesaikan `iconRefs` → data, lalu render memeriksa kelengkapannya. B nanti memakai jalur yang sama.
- **Kanonikalisasi di exec, bukan core:** core tanpa katalog (spine). Exec adalah satu-satunya jalur mutasi agen, dan katalog datang lewat port, jadi tes exec memakai katalog palsu.
- Contoh render lucide (24 grid, size 32, strokeWidth 1.5):
  ```html
  <div data-lakar-id="I1" style="width:32px;height:32px"><svg viewBox="0 0 24 24" width="100%" height="100%"
    fill="none" stroke="#0F62FE" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="overflow:visible;display:block">
    <path d="M15 21v-8a1 1 0 0 0-1-1h-4…"/><path d="M3 10a2 2 0 0 1 .709-1.528…"/></svg></div>
  ```
- Skor search sederhana dan deterministik (tanpa dependensi fuzzy). Seri diputus dengan lucide lebih dulu, lalu nama terpendek, lalu alfabet.

## Verification

**Commands:**
- `cd /root/lakar && /opt/node-26/bin/pnpm build` -- expected: exit 0
- `cd /root/lakar && /opt/node-26/bin/pnpm --filter @lakar/icons --filter @lakar/exec --filter @lakar/render --filter @lakar/daemon --filter @lakar/mcp test` -- expected: exit 0, 0 skip
- `cd /root/lakar && /opt/node-26/bin/pnpm test` -- expected: exit 0, 0 skip
- `pgrep -af 'lakar.*(daemon|chrome)|headless_shell'; ss -ltn | grep -c ':7466 '` -- expected: tidak ada proses Lakar tersisa, 0
- `cd /root/lakar && bash tools/node26/verify.sh` -- expected: exit 0

**Manual checks (if no CLI):**
- Buka (Read) `packages/render/test/golden/ikon.png`: ikon tajam, warna/stroke sesuai, tidak ada kotak placeholder.

## Auto Run Result

- **Status:** built.
- **Ringkasan:** `packages/icons` memuat lucide-static 1.74.0 (2089 kanonik + 312 alias, `tags.json`) dan simple-icons 16.38.0 (3472 logo) dari node_modules. Isinya: kanonikalisasi, pencarian deterministik, `ICON_UNKNOWN` dengan tepat 3 saran (+ hint lib yang benar, `iconSearch`/`icon_search`), dan glyph. Exec mengkanonikkan node icon di add/replace/update/duplicate: alias → kanonik, `version` di-stamp, `name` default `Icon / <lib> / <icon>`, versi asing → SCHEMA_INVALID. Exec juga menambah `iconSearch(query, {lib?, limit?})`. Render menggambar SVG sungguhan dari glyph JSON yang dikirim daemon (createElementNS, whitelist tag/atribut): lucide stroke/filled/strokeWidth grid 24, simple-icons warna brand, drop shadow mengikuti bentuk. Daemon menyelesaikan glyph sebelum render dan menyediakan `POST /icons/search`; screenshot dokumen berisi ikon tak dikenal → 422 ICON_UNKNOWN. MCP mendapat tool `icon_search` dan deskripsi execute bagian ikon.
- **File:** `packages/icons/src/{catalog,data,index,index.test}.ts` (katalog + tes data asli); `packages/schema/src/{icons,nodes,index,v1.test}.ts` (tipe glyph/match, regex `_`); `packages/ports/src/index.ts` (`IconCatalogPort`); `packages/exec/src/{api,index,index.test}.ts` (kanonikalisasi, `iconSearch`); `packages/render/src/{icon,layout,index}.ts` + `test/{visual.test,harness}.ts`, `test/fixtures/{gen-icon-glyphs.mjs,icon-glyphs.json}`, `test/golden/ikon.png`; `packages/daemon/src/{chromium,server,start,main,index,index.test}.ts`; `packages/mcp/src/{server,index.test}.ts` + `package.json` (script test); `tests/execute-description.test.ts`; `pnpm-workspace.yaml` (`minimumReleaseAgeExclude` lucide-static), `pnpm-lock.yaml`.
- **Review (quick):** 2 temuan low, keduanya di-patch; 0 defer, 0 reject.
- **Follow-up review:** `false` (patch: low×2).
- **Verifikasi:** `pnpm build` exit 0; tes per paket icons 17 / exec 51 / render 32 / daemon 73 / mcp 10 lulus, 0 skip; `pnpm test` 30 file / 461 tes lulus, 0 skip (termasuk arah dependensi dan browser-pure render); tidak ada proses daemon/Chromium Lakar tersisa, port 7466 bebas (`[headless_shell] <defunct>` milik `node app.js` PID 1931892 sejak 17 Nov, bukan Lakar); `tools/node26/verify.sh` exit 0 (snapshot C9 identik). Golden `ikon.png` diperiksa visual: glyph tajam, warna/stroke sesuai, star terisi, simple-icons warna brand, shadow mengikuti bentuk rumah, tidak ada placeholder.
- **Risiko residual:** hasil search yang cocok lewat alias mengembalikan `icon` = alias (+ `aliasOf` kanonik), jadi agen bisa menulis alias (tetap disimpan kanonik). Pesan ICON_UNKNOWN memuat nama penuh (nama sangat panjang → pesan panjang). Fixture glyph tes render harus dibuat ulang bila versi pustaka naik. `minimumReleaseAgeExclude` untuk lucide-static ada di workspace. Simple Icons berisi merek dagang (hanya untuk logo brand).
