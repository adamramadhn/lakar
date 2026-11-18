---
title: 'Render layout flex, teks, dan font lokal'
type: feature
ticket: '7'
created: '2026-11-18'
status: built
baseline_revision: 'f81e3eb69029365038a44d7b0a26a58571d755db'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/architecture-lakar-core/architecture-lakar-core.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `packages/render` masih tracer: hug/fill diabaikan, gap negatif tidak bisa (CSS `gap` menolak nilai negatif), teks memakai `sans-serif` sistem, dan tidak ada pengukuran DOM. Akibatnya PNG tidak mencerminkan dokumen, dan story 11 (check) tidak punya bounds. Daemon juga belum punya font lokal. Mesin ini punya 159 font fontconfig, sehingga fallback diam-diam ke font sistem adalah risiko nyata.

**Approach:** Render memetakan frame/text ke flexbox dengan aturan sizing yang tertulis di Design Notes. Render memuat font hanya dari daftar face yang diberikan pemanggil (AD-6: input ter-resolve), lalu mengukur bounds dan baris teks setelah `fonts.ready` dan dua rAF. Daemon punya registry font Fontsource untuk 8 keluarga arketipe DESIGN.md, menyajikan `/fonts/...`, dan menghasilkan `FONT_MISSING`. Tes golden berjalan di Chromium Lakar lewat server statis tanpa daemon, sekaligus menjadi bukti AD-6.

## Boundaries & Constraints

**Always:**
- **Batas AD-6 untuk render:**
  - `src` hanya memakai `import type` dari `@lakar/schema`, dan dist hanya berisi impor relatif `./x.js`, tanpa API Node/`process`.
  - Hasil lintas `page.evaluate` berupa objek serializable `{ok:true,…} | {ok:false,code:'FONT_MISSING',missing}`, bukan exception.
  - Render tidak memakai CSS `border` (agar padding-box = border-box untuk x/y absolute). Aturan ini juga mengikat story 8: stroke harus memakai outline/box-shadow/pseudo.
- **Font tanpa fallback diam-diam:**
  - `font-family` di DOM hanya berisi satu nama keluarga terdaftar, tanpa generic fallback.
  - Setiap `{family,weight,style}` yang dipakai teks harus punya face di input dan berstatus `loaded` (`FontFace.load()` di-await) sebelum mount diukur. Kalau tidak, hasilnya `FONT_MISSING`.
  - Default teks tanpa `family`/`weight`/`style` adalah Inter / 400 / normal.
- **Dependensi:**
  - `@fontsource/{inter,plus-jakarta-sans,jetbrains-mono,manrope,ibm-plex-mono,bricolage-grotesque,dm-sans,dm-mono}` dipasang dengan versi persis `5.3.0` (semuanya OFL-1.1, terverifikasi lewat `metadata.json` npm) sebagai `dependencies` `@lakar/daemon`. `@fontsource/inter@5.3.0` juga dipasang sebagai devDependency `@lakar/render`.
  - `playwright-core@1.65.1` menjadi devDependency **root** (`-w`). Ini bukan devDependency render, karena manifest render dipindai `tests/dependency-direction.ts`.
  - Semuanya lewat `/opt/node-26/bin/pnpm add -E` (store pnpm user `/root/.local/share/pnpm/store/v11`), dan versi terpin di `pnpm-lock.yaml`.
- **Subset font:** registry hanya memakai subset `latin` + `latin-ext` dalam format `.woff2`, dengan `unicode-range` diambil dari `unicode.json` paket.
- **C9:**
  - Node selalu lewat `/opt/node-26/bin`.
  - Tidak ada apt, fontconfig/`fc-cache`, font sistem, npm global, service, atau port tetap. Server tes memakai `127.0.0.1:0`.
  - Browser memakai `~/.cache/lakar/ms-playwright` yang sudah ada.

**Never:**
- Scope story 8: fills/stroke/radius/shadows/opacity/blend/blur/rotation, render rect/ellipse/path, `scrollY`, `/assets`. Placeholder story 5 untuk rect/ellipse/path/icon tetap.
- Scope story 11/12: check atau temuan AD-8, pool, `status`, dan perubahan bentuk `RenderPort` maupun respons `/screenshot`.
- Mengubah skema (`packages/schema`), font sistem, atau mengunduh font saat render.
- Membuat golden otomatis saat file golden tidak ada. Golden yang hilang harus membuat tes gagal.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Row fixed+fill | row w400 pad10 gap8: A w100, B fill | B.width = 272, B.x = 118 | — |
| Fill di hug | row hug: A w100, B fill (teks "Halo") | B selebar kontennya, parent = A + gap + B | — |
| Fill silang di hug | column hug: A w200, B width fill | B.width = 200 | — |
| Min/max | fill dengan maxWidth 120 di row 400 | B.width = 120 | — |
| Gap negatif | row gap −12: tiga fixed 40 | x = 0, 28, 56 | — |
| Absolute | anak `position:'absolute',x:5,y:7` di frame pad 20 | bounds relatif parent (5,7), tidak menggeser flow | — |
| Layout none | frame none, anak absolute (x,y) dan anak flow | absolute di (x,y), anak flow di (0,0) | — |
| Teks wrap | text wrap di width 120, kalimat panjang Inter 16/24 | `lines` ≥ 2, height = lines × 24 | — |
| Font tak terdaftar | text family 'Roboto' → `/screenshot` | HTTP 422 | `FONT_MISSING`, hint memuat daftar keluarga terdaftar |
| Varian hilang | Manrope italic / DM Mono 700 | HTTP 422 | `FONT_MISSING` yang menyebut varian tersedia |
| Face gagal muat | render diberi face ber-URL 404 | `{ok:false,code:'FONT_MISSING'}` | daemon → LakarError `FONT_MISSING`, non-retryable, tidak membuang halaman |
| Path font jahat | `GET /fonts/inter/..%2Fpackage.json`, id tak terdaftar | 404 | — |

</intent-contract>

## Code Map

- `packages/render/src/index.ts`
  - `mountBoard`/`renderFrame`/`renderText`/`applySize`/`renderPlaceholder` dibangun ulang.
  - Boleh dipecah menjadi `layout.ts`, `text.ts`, `fonts.ts`, `measure.ts`, asalkan antarfile memakai impor relatif `.js`.
  - Pertahankan ekspor `PACKAGE`, `NODE_ATTR`, `findBoard`, dan `mountBoard`, karena daemon `server.ts` memakai `findBoard`.
  - Board tetap kolom flex dari kiri atas, ukurannya fixed, dan selalu clip.
- `packages/daemon/src/chromium.ts`
  - Isi `RENDER_PAGE_HTML` (`__lakarMount`) diganti dengan pemanggilan `renderBoard`.
  - `readRenderModule` hanya membaca satu file. Ganti dengan penyajian direktori dist render.
  - Viewport di-set ke ukuran board **sebelum** mount.
  - Blok `catch` membungkus semua error menjadi `RENDER_FAILED`. `FONT_MISSING` harus dilempar di luar pembungkus itu.
- `packages/daemon/src/server.ts`
  - Rute `/render/index.js` → `/render/:file` (regex `^[a-z0-9-]+\.js$`, dari dir dist render).
  - Tambahkan rute `/fonts/:pkg/:file`.
  - `STATUS.FONT_MISSING` sudah 422.
- `packages/daemon/src/config.ts` -- `browsersPath` default. Harness tes render menduplikasi default yang sama (`~/.cache/lakar/ms-playwright`).
- `packages/daemon/src/index.test.ts` -- pola `browserInstalled` + `it.skipIf`, port 0, dan data dir tmp. Kasus HTTP baru ditambahkan di sini.
- `tests/dependency-direction.ts` -- read-only. Hanya `src/**` yang dipindai, dan manifest render tidak boleh memuat pustaka IO.
- `vitest.config.ts`, `tsconfig.test.json` -- include ditambah `packages/render/test/**/*.test.ts` (vitest) dan `packages/render/test/**/*.ts` (typecheck).
- `packages/core/package.json` -- pola skrip `"test": "vitest run --root ../.. packages/core/"`.
- Fakta mesin: Ubuntu aarch64, chromium_headless_shell-1255 terpasang, dan fontconfig punya 159 font sistem.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `packages/daemon/package.json`, `packages/render/package.json`, `pnpm-lock.yaml`
  - Dependensi seperti di Boundaries.
  - Skrip render `"test": "vitest run --root ../.. packages/render/"`.
  - `.gitignore` + `packages/render/test/out/`.
- [x] `packages/render/src/*.ts`
  - Pemetaan sizing/layout/teks sesuai Design Notes. `clip:true` → `overflow:hidden`.
  - Ekspor tipe `FontFaceSource {family,weight,style,url,unicodeRange?}`, `BoardMeasure`, `RenderResult`, konstanta `CHROMIUM_ARGS`, `fontRequests(board)` (daftar unik `{family,weight,style}` setelah default diterapkan), dan `async renderBoard(doc, boardId, root, {fonts})`.
  - Alur `renderBoard`: (1) cek setiap request punya face, kalau tidak → FONT_MISSING; (1b) cek cakupan glyph (Design Notes **Cakupan glyph**), karakter tak tercakup → FONT_MISSING; (2) `new FontFace` + `document.fonts.add` + `await load()`, gagal → FONT_MISSING; (3) mount; (4) `await document.fonts.ready` + 2 rAF; (5) verifikasi ulang status `loaded`; (6) `measureBoard`.
  - `measureBoard(el)` → `{width,height,nodes:[{id,x,y,width,height}] relatif border-box board (float), texts:[{id,lines,lineHeight}]}`. Baris dihitung dari `Range.getClientRects()` pada node teks, dikelompokkan per `top` yang berbeda (pembulatan 0,5px).
- [x] `packages/daemon/src/fonts.ts` (baru) + `chromium.ts` + `server.ts`
  - `FontRegistry` dibangun dari `metadata.json` + `unicode.json` 8 paket via `import.meta.resolve`. Paket yang tidak ter-resolve masuk `missing` (untuk `status` story 12).
  - `resolveFaces(requests)` → `FontFaceSource[]` dengan URL `/fonts/<id>/<id>-<subset>-<w>-<style>.woff2`, atau `LakarError FONT_MISSING`. Pesannya menyebut varian yang diminta, dan hint menyebut keluarga terdaftar + weight/style yang tersedia untuk keluarga itu.
  - `filePath(id,file)` hanya untuk id terdaftar dan nama file yang cocok `^[a-z0-9-]+-(latin|latin-ext)-\d{3}-(normal|italic)\.woff2$` serta ada di registry. Respons berupa `font/woff2`.
  - `ChromiumRenderer` menerima `fonts: FontRegistry` di options. `screenshot` me-resolve face board **sebelum** blok try, memanggil `__lakarRender`, lalu memetakan `{ok:false,code:'FONT_MISSING'}` → LakarError `FONT_MISSING` (halaman tetap dipakai).
  - Launch memakai `args: CHROMIUM_ARGS`. `start.ts`/`main.ts` meneruskan registry.
- [x] `packages/render/test/harness.ts` (baru)
  - Server `node:http` di `127.0.0.1:0` menyajikan halaman HTML kosong tanpa import map, `/render/*.js` dari `packages/render/dist`, dan `/fonts/inter/*` dari `@fontsource/inter/files`.
  - Launch chromium-headless-shell via `playwright-core` (`PLAYWRIGHT_BROWSERS_PATH`, `CHROMIUM_ARGS`, `deviceScaleFactor:1`).
  - Ekspor `browserInstalled`, `render(doc, boardId, fonts)` → `{result, png}` (viewport = ukuran board, screenshot elemen `animations:'disabled'`, `caret:'hide'`), dan `compareGolden(name, png)`.
  - `compareGolden`: tulis `test/out/<name>.png`, lalu bandingkan dengan `test/golden/<name>.png` di dalam halaman (`createImageBitmap` + `OffscreenCanvas.getImageData`). Gagal bila dimensi berbeda, atau bila > 0,5% piksel punya selisih kanal maksimum > 24. Kalau gagal, tulis juga `test/out/<name>.diff.png`. Golden yang tidak ada → gagal, kecuali `LAKAR_UPDATE_GOLDEN=1`.
- [x] `packages/render/test/layout.test.ts`, `text.test.ts`, `browser-pure.test.ts` (baru) + `packages/render/test/golden/*.png`
  - Setiap baris matriks render diuji dengan assert bounds numerik (±0,5px) **dan** golden: `row`, `column`, `hug`, `fill`, `fill-in-hug`, `min-max`, `gap-negatif`, `absolute`, `none`, `teks-wrap`, `teks-bobot` (Inter 400 vs 700 dengan lebar berbeda).
  - Font: face tidak diberikan → FONT_MISSING, URL 404 → FONT_MISSING. Cakupan glyph: teks memuat `→` (U+2192) atau `✓` (U+2713) dengan face Inter latin+latin-ext → FONT_MISSING yang pesannya menyebut `U+2192`/`U+2713`; teks `Łódź` (latin-ext) → ok; face tanpa `unicodeRange` dianggap mencakup semua.
  - Absolute hug = `max-content`: frame `none` hug padding 10 berisi teks absolute `wrap:'wrap'` (width tidak diisi) kalimat panjang → teks 1 baris dan lebarnya > lebar frame (tidak diperas). Ditambahkan ke golden `none` atau golden baru `absolute-hug`. Lebar "Hamburgefonstiv" Inter 400 32px berbeda > 2px dari lebar yang sama di halaman tanpa face. Ini membuktikan font Inter yang dipakai, bukan fallback.
  - `browser-pure`: di halaman harness `typeof process === 'undefined' && typeof require === 'undefined'`, `import('/render/index.js')` berhasil, dan regex atas `dist/*.js` tidak menemukan specifier impor non-relatif.
  - Golden dibuat sekali dengan `LAKAR_UPDATE_GOLDEN=1`, diperiksa visual (Read PNG), lalu di-commit bersama kode.
- [x] `packages/daemon/src/index.test.ts`
  - Lewat HTTP: family `Roboto` → 422 `FONT_MISSING` (hint memuat `Inter`), Manrope italic dan DM Mono 700 → `FONT_MISSING`, Inter 700 → PNG 200. Teks `Lihat →` → 422 `FONT_MISSING` (pesan memuat `U+2192`, hint menyarankan node `icon` untuk simbol), dan screenshot valid berikutnya tetap 200.
  - `GET /fonts/inter/inter-latin-400-normal.woff2` → 200 `font/woff2`, traversal dan id asing → 404.
  - Tes PNG tracer lama tetap lulus dengan default Inter.

**Acceptance Criteria:**
- Given build selesai, when `/opt/node-26/bin/pnpm --filter @lakar/render test`, then semua tes golden (row/column/hug/fill/gap negatif/teks wrap, dll.) lulus tanpa skip, dan `packages/render/test/out/*.png` ada untuk dilihat.
- Given lakard uji, when screenshot dokumen dengan family tak terdaftar, then `{ok:false,error:{code:'FONT_MISSING',retryable:false}}` HTTP 422, dan screenshot berikutnya yang valid tetap berhasil.
- Given halaman browser biasa tanpa Node/daemon, when `dist/index.js` render dimuat, then render dan pengukuran berjalan (bukti AD-6).
- Given selesai, when `pnpm test` dan `verify.sh`, then lulus. Arah dependensi tetap lulus, dan tidak ada proses Chromium/daemon Lakar yang tersisa.

## Implementation Notes

- Render dipecah: `fonts.ts` (request/face/load, cache FontFace per halaman), `layout.ts` (pemetaan sizing/gap/posisi/teks), `measure.ts`, `index.ts` (`renderBoard`, `CHROMIUM_ARGS`). `RenderResult` gagal juga membawa `message`.
- Teks `wrap` memaksa tinggi hug (angka height diabaikan), sesuai Design Notes.
- Registry font mencocokkan family tanpa peka huruf besar; face memakai nama family persis seperti di node.
- Harness mengevaluasi kode halaman sebagai string supaya transform vitest tidak menyentuh `import()`.
- Golden diperiksa visual (Inter: `a` dua lantai). Karena fill/stroke baru di story 8, golden hanya berisi teks hitam di latar putih, sehingga ambang 0,5% relatif longgar; bounds numerik tetap bukti utama (uji tamper: golden salah → gagal 0,75%).

## Plan Change Log

### 2026-11-18 — Review pass 1 (bad_plan, iterasi 1)
- **Pemicu:** review Quick menemukan (a) karakter di luar subset `latin`/`latin-ext` (mis. `→` U+2192, `✓` U+2713) dirender diam-diam dengan font sistem dan `renderBoard` tetap `ok:true`, melanggar AD-6 dan Boundaries "Font tanpa fallback diam-diam"; (b) anak absolute/anak frame `none` dengan hug memakai `fit-content` sehingga teks/frame yang bisa wrap diperas lebar parent.
- **Diamandemen:** Design Notes (bagian baru **Cakupan glyph**; aturan `max-content` untuk hug anak absolute), Tasks (langkah 1b `renderBoard`, tes cakupan glyph dan absolute-hug di render, tes HTTP `Lihat →` di daemon), Verification (perintah tambahan).
- **Keadaan buruk yang dihindari:** PNG dengan glyph DejaVu/Liberation tanpa error; overlay absolute yang terbungkus sempit.
- **KEEP:** implementasi percobaan 1 lulus semua Verification dan review lain; tersimpan utuh (termasuk golden PNG biner, `package.json`, `pnpm-lock.yaml`) di `/tmp/claude-0/-root-lakar/ff3247e7-b8d6-48ae-acb4-dd6a2a7ac61e/scratchpad/story-1-7-attempt1.patch`. Terapkan ulang dengan `git apply --binary` dari root repo, lalu tambahkan hanya perubahan amandemen ini. Pertahankan: pemecahan `fonts.ts`/`layout.ts`/`measure.ts`, cache FontFace per halaman, harness yang mengevaluasi kode halaman sebagai string, pembanding golden di halaman, registry daemon dan rute `/fonts`/`/render/:file`, semua tes yang ada. Golden yang berubah karena `max-content` dibuat ulang dengan `LAKAR_UPDATE_GOLDEN=1` hanya untuk nama yang terdampak, lalu diperiksa visual.

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 5 findings — high 1, medium 1, low 3, false 0, maybe-false 0
- findings:
  - `[high]` `[bad_plan]` Karakter di luar subset latin/latin-ext (→ U+2192, ✓ U+2713, sebagian huruf Vietnam) jatuh ke font sistem secara diam-diam, `renderBoard` tetap ok:true — terverifikasi di `unicode.json` Inter 5.3.0 (latin hanya U+2191/U+2193, bukan U+2192); melanggar AD-6. Amandemen: Design Notes **Cakupan glyph**, langkah 1b, tes render + HTTP.
  - `[medium]` `[bad_plan]` Anak absolute/anak frame `none` dengan hug memakai `fit-content` sehingga konten yang bisa wrap diperas oleh lebar containing block (`layout.ts` `applyAbsolute`) — benar menurut definisi CSS fit-content (min(max-content, max(min-content, available))). Ikut diamandemen (aturan `max-content` + tes), karena kode diturunkan ulang.
  - `[low]` `[reject]` Suite golden hijau dengan skip bila browser tidak terpasang — pola `browserInstalled + skipIf` dipilih plan (Code Map) dan sama dengan tes daemon; di mesin ini browser terpasang dan Verification menuntut 0 skip; perbaikan menambah mekanisme baru.
  - `[low]` `[reject]` Tes HTTP Roboto di-skip tanpa browser walau bagian 422 tidak butuh browser — kasus Manrope/DM Mono sudah menguji jalur yang sama tanpa browser; di mesin ini tes berjalan; dampak sehari-hari nihil.
  - `[low]` `[reject]` Golden layout lemah karena frame tak terlihat sebelum story 8 — plan sudah menyatakan bounds numerik sebagai bukti utama dan toleransi menyerap antialias; golden akan bermakna setelah fill story 8; memperkuatnya butuh fill (scope story 8).

### 2026-11-18 — Review pass
- verdicts: 5 findings — high 0, medium 0, low 3, false 1, maybe-false 0 (plus 1 di-reject karena perbaikannya mengedit plan)
- findings:
  - `[low]` `[reject]` Tes "face gagal dimuat" dan tes HTTP tidak membuktikan halaman Chromium dipakai ulang (hanya bahwa screenshot berikutnya berhasil) — kode `chromium.ts` terverifikasi tidak memanggil `#failed()` pada cabang `!result.ok`; mengunci identitas halaman butuh membuka internal renderer (kompleksitas baru), dampak sehari-hari nihil.
  - `[low]` `[patch]` `compareGolden` membiarkan `test/out/<name>.diff.png` basi dari run gagal sebelumnya saat golden kini lulus — diperbaiki: `rm(<name>.diff.png, {force:true})` sebelum perbandingan di `packages/render/test/harness.ts`. (Ketidakcocokan dimensi tanpa diff.png dibiarkan: diff piksel tidak terdefinisi untuk dimensi berbeda, alasan dimensi ada di pesan error.)
  - `[low]` `[reject]` Bagian Auto Run Result plan masih berstatus ready-for-dev — perbaikannya mengedit plan build ini (ditulis ulang saat finalisasi).
  - `[false]` `[reject]` Face yang sudah dimuat tetap terdaftar di `document.fonts` antar-render sehingga gambar tidak hanya bergantung pada face input — pemeriksaan face hilang dan cakupan glyph memakai face input, bukan yang terdaftar; face basi memakai file dan deskriptor identik (Fontsource terpin), face gagal dihapus dari `document.fonts`; tidak ada keluaran yang berbeda.
  - `[low]` `[reject]` Hint daemon untuk FONT_MISSING akibat face gagal dimuat ikut menyebut subset latin/node icon — hanya terjadi bila paket font rusak (bukan pemakaian sehari-hari); `message` sudah membedakan penyebab; perbaikan menambah cabang.

## Design Notes

**Sizing → CSS (anak flow di parent flex; sumbu utama = arah parent, board = kolom):**

| Nilai | Sumbu utama | Sumbu silang |
|---|---|---|
| angka N | `flex:0 0 Npx` + dimensi N | dimensi N |
| `hug` / tidak diisi | `flex:0 0 auto` | `hug` → dimensi `fit-content`; tidak diisi → `auto` (ikut `align:stretch`) |
| `fill` | `flex:1 1 0px` + `min-<dim>:0` | `align-self:stretch`, dimensi `auto` |

- `min/max*` → `min-/max-width/height` dan menimpa `min-<dim>:0` milik fill.
- Fill di dalam parent hug **berperilaku hug**, karena ukuran intrinsik flex memakai kontribusi konten anak. Fill silang di parent hug meregang ke anak terlebar. Kedua perilaku ini dikunci golden.
- `align`/`justify` memakai peta yang sudah ada.
- **Gap:**
  - `gap ≥ 0` → CSS `gap`.
  - `gap < 0` → tanpa CSS `gap`. Anak flow ke-2 dan seterusnya mendapat `margin-left` (row) atau `margin-top` (column) = gap. Anak absolute dilewati.
- **x/y:**
  - Skema story 5 tetap jadi penjaga: x/y hanya ada bersama `position:'absolute'`.
  - Anak absolute → `position:absolute; left:x; top:y` relatif border-box parent. Anak ini tidak ikut flow, gap, maupun ukuran hug parent.
  - Dimensi hug/tidak diisi pada anak absolute (termasuk semua anak frame `none`) → `max-content`, **bukan** `fit-content`: ukuran hug anak absolute adalah ukuran kontennya sendiri, tidak diperas oleh lebar containing block parent.
  - Fill pada anak absolute → `left:x; right:0` (atau `top:y; bottom:0`).
  - Frame `layout:'none'`: **semua** anak ditempatkan absolute di `(x??0, y??0)`. Anak tanpa `position` berada di (0,0). Akibatnya hug pada frame `none` = padding saja.
  - Di row/column, x/y hanya untuk overlay absolute.
- **Teks:**
  - `wrap` default: `auto` bila width tidak diisi/hug, `wrap` bila width angka/fill.
  - `auto` → `white-space:pre`, satu baris per `\n`.
  - `wrap` → `pre-wrap` + `overflow-wrap:break-word`. Width mengikuti sizing, height hug.
  - `fixed` → width dan height sesuai angka, overflow tidak dipotong (LC-01b di story 11).
  - Pemetaan properti: `lineHeight` px, `letterSpacing` em, `align` → `text-align`, `numeric:'tabular'` → `font-variant-numeric:tabular-nums`, `color` default `#000000`.
- **Stabilitas golden:**
  - Chromium rev 1255 dan `@fontsource` 5.3.0 terpin.
  - `CHROMIUM_ARGS` = `--font-render-hinting=none`, `--force-color-profile=srgb`, `--disable-lcd-text`, dipakai bersama daemon dan harness.
  - DPR 1, viewport di-set sebelum mount, face di-load eksplisit, lalu `fonts.ready` + 2 rAF.
  - Teks golden hanya ASCII yang tercakup subset `latin`, supaya tidak ada fallback glyph ke font sistem.
- **Cakupan glyph (AD-6: tanpa fallback diam-diam):**
  - Membuang generic fallback tidak cukup: Chromium tetap memakai font sistem (fontconfig) untuk karakter di luar `unicode-range` face yang dimuat. Contoh nyata: `→` (U+2192) dan `✓` (U+2713) tidak ada di subset `latin`/`latin-ext` Fontsource.
  - Maka `renderBoard`, sebelum memuat face, memeriksa setiap code point (iterasi per code point, bukan per UTF-16 unit) di `content` setiap teks: harus berada di `unicodeRange` salah satu face yang diberikan untuk `{family,weight,style}` teks itu. Face tanpa `unicodeRange` mencakup semua. Parser `unicode-range` mendukung `U+X`, `U+X-Y`, dan wildcard `U+4??`. `\n` dan `\t` tercakup oleh `U+0000-00FF`.
  - Tak tercakup → `{ok:false, code:'FONT_MISSING', missing:[request], message}`; `message` menyebut karakter dan kodenya (mis. `"→" U+2192`) serta id node teks. Bentuk `RenderResult` tidak berubah.
  - Daemon memetakan hasil ini seperti FONT_MISSING lain (422, non-retryable, halaman tetap dipakai). Hint daemon untuk FONT_MISSING dari render menyebut keluarga terdaftar dan menambahkan: simbol/panah/emoji pakai node `icon` (AD-9), font hanya mencakup subset latin + latin-ext.
  - Pemeriksaan ini berbasis `unicode-range`, bukan isi glyph font; karakter dalam range yang tidak punya glyph di font masih mungkin fallback (residual risk, dicatat).
  - Toleransi menyerap antialias, sedangkan bounds numerik menjadi bukti utama.

## Verification

**Commands:**
- `cd /root/lakar && grep -cE "'@fontsource/(inter|plus-jakarta-sans|jetbrains-mono|manrope|ibm-plex-mono|bricolage-grotesque|dm-sans|dm-mono)@5\.3\.0'" pnpm-lock.yaml` -- expected: ≥ 8
- `cd /root/lakar && /opt/node-26/bin/pnpm build` -- expected: exit 0
- `cd /root/lakar && grep -nE "(from|import)\s*\(?['\"][^./]" packages/render/dist/*.js` -- expected: tidak ada keluaran
- `cd /root/lakar && /opt/node-26/bin/pnpm --filter @lakar/render test` -- expected: lulus, 0 skip, dan `ls packages/render/test/out/*.png` berisi ≥ 11 PNG
- `cd /root/lakar && /opt/node-26/bin/pnpm test` -- expected: exit 0, 0 skip, termasuk tes daemon FONT_MISSING dan arah dependensi
- `cd /root/lakar && /opt/node-26/bin/pnpm exec vitest run packages/render/test/text.test.ts packages/daemon/src/index.test.ts -t 'U\+2192|cakupan|glyph' 2>&1 | tail -5` -- expected: ≥ 2 tes cakupan glyph lulus, 0 skip
- `cd /root/lakar && for i in 1 2 3; do /opt/node-26/bin/pnpm --filter @lakar/render test >/dev/null || echo FLAKY; done` -- expected: tidak ada `FLAKY`
- `pgrep -f 'lakar.*(daemon|chrome)|chrome-headless-shell.*lakar'; ss -ltnp | grep -c 7466` -- expected: tidak ada proses dan 0
- `cd /root/lakar && bash tools/node26/verify.sh` -- expected: exit 0, snapshot C9 identik

**Manual checks:**
- Buka `packages/render/test/out/teks-wrap.png` dan `teks-bobot.png`. Teks harus Inter (huruf `a` dua lantai, `G` tanpa taji), bukan DejaVu/Liberation.

## Auto Run Result

- **Status:** built. Route full, risk high, review quick (pinned), 2 pass review + 1 loop bad_plan.
- **Ringkasan:** render memetakan frame/text ke flexbox sesuai Design Notes (fixed/hug/fill, min/max, gap negatif via margin, absolute dan `layout:'none'`, hug absolute = `max-content`, teks auto/wrap/fixed) tanpa CSS `border`; `renderBoard` memuat face hanya dari input, memeriksa cakupan glyph per code point terhadap `unicode-range`, `fonts.ready` + 2 rAF, verifikasi `loaded`, lalu `measureBoard` (bounds float + jumlah baris). Daemon punya `FontRegistry` 8 keluarga Fontsource 5.3.0 (latin + latin-ext), rute `/fonts/:pkg/:file` dan `/render/:file`, FONT_MISSING 422 non-retryable tanpa membuang halaman. Harness golden tanpa daemon (server statis 127.0.0.1:0 + playwright-core) menjadi bukti AD-6.
- **File:**
  - `package.json`, `packages/{daemon,render}/package.json`, `pnpm-lock.yaml` — 8 `@fontsource/*@5.3.0` (daemon), `@fontsource/inter` (dev render), `playwright-core@1.65.1` (dev root), skrip test render.
  - `packages/render/src/{index,fonts,layout,measure}.ts` — render, font/cakupan glyph, pemetaan layout, pengukuran.
  - `packages/daemon/src/{fonts,chromium,server,start,main,index}.ts` — registry font, adaptor Chromium, rute, wiring.
  - `packages/render/test/{harness,layout.test,text.test,browser-pure.test}.ts` + `test/golden/*.png` (12) — tes golden/bounds/font.
  - `packages/daemon/src/index.test.ts` — tes HTTP FONT_MISSING, `/fonts`, `/render/:file`.
  - `vitest.config.ts`, `tsconfig.test.json`, `.gitignore` — include tes render, abaikan `test/out/`.
- **Review:** pass 1 → 1 high + 1 medium (bad_plan: fallback glyph diam-diam di luar subset; hug absolute diperas `fit-content`) → plan diamandemen, kode diturunkan ulang; 3 low ditolak. Pass 2 → 1 low di-patch (diff.png basi), 3 low + 1 false ditolak. Tidak ada yang di-defer.
- **Follow-up review:** false (pass terakhir hanya mem-patch 1 low; temuan high pass 1 sudah ditinjau ulang di pass 2).
- **Verifikasi:** lockfile 16 cocok; `pnpm build` exit 0; grep impor non-relatif dist kosong; `pnpm --filter @lakar/render test` 21/21 lulus, 0 skip, 12 PNG di `test/out`; `pnpm test` 338/338 (27 file) termasuk arah dependensi; tes cakupan glyph terfilter 4 lulus (42 "skipped" hanya karena filter `-t`); 3× ulang tanpa FLAKY; tidak ada proses Chromium/daemon Lakar, port 7466 kosong; `verify.sh` exit 0 (snapshot C9 identik). Manual: `teks-wrap`, `teks-bobot`, `absolute-hug`, `fill-in-hug`, `gap-negatif`, `row` dilihat — Inter (a dua lantai).
- **Residual risk:** cakupan glyph berbasis `unicode-range`, bukan isi glyph; golden layout hanya teks hitam sampai fill story 8 (bounds numerik bukti utama); tes browser memakai `skipIf` bila browser tidak terpasang; dokumen dengan `→`/`✓`/emoji kini gagal FONT_MISSING (sengaja, arahkan ke node icon).
