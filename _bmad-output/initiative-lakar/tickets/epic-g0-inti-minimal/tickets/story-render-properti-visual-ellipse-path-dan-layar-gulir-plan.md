---
title: 'Render properti visual, ellipse, path, dan layar gulir'
type: feature
ticket: '8'
created: '2026-11-18'
status: built
baseline_revision: '77f0a2b552dd096937f2d93265c66dcecd8eecd2'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-render-layout-flex-teks-dan-font-lokal-plan.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Render story 7 hanya menggambar layout dan teks hitam: fills selain solid pertama board, stroke, radius, shadows, opacity, blend, blur, backdropBlur, rotation, rect/ellipse/path (masih kotak kosong), dan `scrollY` diabaikan, dan daemon belum menyajikan `/assets/<hash>`. PNG Lakar akan dibandingkan dengan pen.dev oleh juri buta, jadi setiap properti visual harus akurat.

**Approach:** `packages/render` memetakan properti visual bersama ke CSS/SVG dengan semantik tertulis di Design Notes (satu tempat, dipakai frame/rect/ellipse/path/board/text). Bentuk ellipse busur dan path memakai mask SVG + overlay stroke SVG, sedangkan rect/frame/ellipse penuh memakai box CSS. Gambar dimuat dan di-decode sebelum mount. Daemon menyajikan `<dataDir>/assets/<sha256>`. Golden baru membuktikan ring progres, kartu bergradien+berbayangan, dan layar gulir hasil `duplicate`.

## Boundaries & Constraints

**Always:**
- Aturan story 7 tetap: render tanpa API Node (AD-6, impor relatif `./x.js` saja), node berelemen `data-lakar-id` **tanpa CSS `border`** pada elemen node (border hanya boleh pada elemen overlay internal tanpa `data-lakar-id`), font tanpa fallback diam-diam, `CHROMIUM_ARGS`, DPR 1, viewport sebelum mount.
- Kontrak `measureBoard` tetap: `{width,height,nodes:[{id,x,y,width,height}],texts:[{id,lines,lineHeight}]}`, hanya elemen ber-`data-lakar-id`, bounds = `getBoundingClientRect` relatif board (node berotasi → AABB, anak `scrollY` → posisi setelah geser). Elemen internal (overlay stroke, lapisan fill, svg) tidak boleh ber-`data-lakar-id` dan tidak mengubah ukuran layout node.
- `RenderResult` hanya bertambah varian: `{ok:false, code:'NOT_FOUND', assets:string[], message}` untuk gambar gagal dimuat. Varian FONT_MISSING tidak berubah.
- Hasil sama di harness dan daemon: asset URL = `opts.assetBase ?? '/assets/'` + hash.
- C9: Node `/opt/node-26/bin`, tanpa dependensi baru, server tes `127.0.0.1:0`, browser `~/.cache/lakar/ms-playwright`, proses Chromium/daemon dimatikan.
- Golden lama yang berubah karena fill baru diubah **sengaja** (dokumen uji diberi fill), dibuat ulang dengan `LAKAR_UPDATE_GOLDEN=1` hanya untuk nama itu, lalu diperiksa visual (Read PNG). Bounds numerik lama tetap lulus tanpa diubah.

**Never:**
- Render `icon` (story 10; placeholder icon tetap, tapi efek bersama tetap diterapkan padanya).
- Impor/unduh gambar, upload aset, foto stok (sebelum G1); store/sesi daemon (story 9); check/LC (story 11); pool (story 12); skill/api.md (story 13).
- Mengubah `packages/schema`, `RenderPort`, bentuk respons `/screenshot`.
- Menyajikan SVG/HTML sebagai aset (hanya raster PNG/JPEG/WebP/GIF, dikenali dari magic bytes).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ring progres | 3 ellipse 120×120 `inner:0.8`, `startDeg` 0, `sweepDeg` 270/180/90 berbeda warna, bertumpuk absolute | 3 busur annulus mulus, mulai jam 12 searah jarum jam; ellipse tanpa busur = lingkaran penuh | — |
| Sweep negatif / 0 / ±360 | `sweepDeg:-90`; `0`; `360` + `inner` | busur berlawanan jarum jam; tidak tergambar; annulus penuh | — |
| Kartu gradien+bayangan | frame radius 16, fills [linear 135° 2 stops, radial], drop shadow 0/8/24/−4 + inner, stroke 1 inside | gradien sesuai sudut CSS, bayangan mengikuti radius, inner di atas fill di bawah anak, stroke di atas anak | — |
| Stroke align | rect 100×60 stroke 4 inside/center/outside | bounds node tetap 100×60; tinta stroke di dalam / ±2 / di luar tepi | — |
| Stroke sides | `sides:['bottom']` | hanya garis bawah | — |
| Layar gulir | board A (frame `Scroll /` clip berisi 6 baris), `duplicate` A → B, `scrollY:200` pada `Scroll /` di B | di B semua anak `Scroll /` bergeser −200 (bounds y −200), A tidak berubah | — |
| Fill gambar | frame dengan `{type:'image',assetId,fit}` cover/contain/fill/tile | gambar tampil sesuai fit setelah decode | — |
| Aset tak ada | `assetId` valid tapi file tak ada | render `{ok:false,code:'NOT_FOUND'}`; daemon HTTP 404 `NOT_FOUND` non-retryable, halaman tetap dipakai | hint: aset harus ada di store, assetId = sha256 file |
| `/assets` jahat | `GET /assets/../x`, hash bukan 64 hex, file non-raster | 404 | — |
| Path | `d` + `viewBox`, width/height tidak diisi | ukuran = viewBox w×h; dengan width/height → geometri diskalakan ke box | — |

</intent-contract>

## Code Map

- `packages/render/src/layout.ts` -- `renderChild` (titik terapkan sizing; tambahkan pemanggilan paint/efek setelah sizing), `renderFrame`, `renderText`, `renderPlaceholder` (ganti untuk rect/ellipse/path; icon tetap), `mountBoardNode` + `boardBackground` (ganti dengan fills penuh), `appendChildren` (tempat geser `scrollY`). Pertahankan pemetaan sizing apa adanya.
- `packages/render/src/index.ts` -- `renderBoard` (alur: font → glyph → load font → **decode aset** → mount → fonts.ready + 2 rAF → ukur), `RenderResult`, ekspor publik. Tambah opsi `assetBase?`.
- `packages/render/src/measure.ts` -- read-only kecuali bila perlu mengabaikan elemen internal (sudah: hanya `[data-lakar-id]`).
- Modul baru yang disarankan: `paint.ts` (fills/stroke/radius/shadows/efek → CSS), `shape.ts` (geometri busur ellipse + mask/overlay SVG path), `assets.ts` (kumpulkan assetId, decode). Semua impor relatif `.js`, tanpa Node.
- Tipe dari `@lakar/schema` (import type saja): `ResolvedFill`, `ResolvedStroke`, `ResolvedShadow`, `ResolvedRectNode`, `ResolvedEllipseNode`, `ResolvedPathNode` (`packages/schema/src/tokens.ts`). Skema: `packages/schema/src/nodes.ts` (Fill, Stroke, Radius, Shadow, effectShape, ellipse/path).
- `packages/render/test/harness.ts` -- tambah penyajian `/assets/<hash>` dari peta in-memory (`addAsset(bytes) → sha256`), builder `rect/ellipse/path`, dan opsi `assetBase` diteruskan. Pola evaluasi string, `compareGolden`, toleransi tetap.
- `packages/render/test/layout.test.ts` -- beri fill tint pada frame dokumen uji yang sesuai (golden jadi bermakna); bounds tidak diubah.
- `packages/core/src/index.ts` -- `beginTransaction(doc,{sessionId})`, `tx.duplicate(id, patch)`, `tx.update`, `commit`. Tes render boleh mengimpornya **lewat path relatif** `../../core/src/index.js` (tes tidak dipindai `tests/dependency-direction.ts`; manifest render TIDAK boleh mendapat `@lakar/core`).
- `packages/daemon/src/server.ts` -- tambah `GET /assets/:hash`; `packages/daemon/src/chromium.ts` -- petakan `{ok:false,code:'NOT_FOUND'}` → LakarError `NOT_FOUND` (retryable:false, halaman tidak dibuang); `RENDER_PAGE_HTML` meneruskan `assetBase:'/assets/'`.
- `packages/daemon/src/config.ts` -- `dataDir`; aset di `<dataDir>/assets/<sha256>` (tanpa ekstensi). Pola tes: `packages/daemon/src/index.test.ts` (dataDir tmp, `call`, `browserInstalled`).
- `packages/mcp/src/server.ts` -- read-only (deskripsi execute; semantik baru dicatat untuk story 13).

## Tasks & Acceptance

**Execution:**
- [x] `packages/render/src/{paint,shape,assets}.ts` (baru), `layout.ts`, `index.ts` -- terapkan semantik Design Notes; `renderBoard(doc, boardId, root, {fonts, assetBase?})` men-decode semua aset (`new Image()` + `decode()`) sebelum mount, gagal → varian NOT_FOUND; placeholder hanya untuk icon -- properti visual akurat.
- [x] `packages/render/test/harness.ts` -- `addAsset`, rute `/assets/:hash`, builder node, buat gambar uji deterministik di halaman (OffscreenCanvas, mis. 64×48 empat kuadran warna + garis diagonal) -- uji gambar tanpa fixture biner.
- [x] `packages/render/test/visual.test.ts` (baru) + golden -- golden dan assert:
  - `ring-progres` (3 busur, I/O matrix) + piksel sampel: titik di tengah pita jam 3 berwarna busur 270°, titik jam 9 pada busur 180° transparan/latar, pusat = latar.
  - `kartu-gradien` (kartu I/O matrix) + piksel sampel sudut gradien (kiri-atas vs kanan-bawah berbeda sesuai stop) dan piksel bayangan di bawah kartu lebih gelap dari latar.
  - `stroke-align` (inside/center/outside + sides bottom): bounds node 100×60 tetap; piksel tepat di luar tepi berwarna stroke hanya untuk outside/center.
  - `radius-clip` (radius angka dan 4 sudut, frame clip berisi anak penuh → sudut terpotong).
  - `efek` (opacity, blend multiply, blur, backdropBlur di atas pola, rotation 30° dengan bounds AABB lebih besar dari 100×60).
  - `ellipse-path` (ellipse penuh dengan gradien radial + stroke outside, sweep negatif, path segitiga/bintang dengan viewBox, path tanpa width = ukuran viewBox, drop shadow pada path).
  - `bayangan-path-vs-rect`: rect dengan box-shadow vs path persegi dengan drop shadow parameter sama → selisih piksel area bayangan ≤ toleransi golden (membuktikan semantik blur sama).
  - `gambar-fit` (cover/contain/fill/tile + ellipse avatar ber-gambar) + aset 404 → `{ok:false,code:'NOT_FOUND'}`.
  - `layar-gulir-a` dan `layar-gulir-b`: dokumen dibuat lewat `beginTransaction` core (`add` board A … `duplicate(A,{name, x})` lalu `update(scrollB,{scrollY:200})`), render kedua board; assert y setiap anak `Scroll /` di B = y di A − 200, bounds node di luar `Scroll /` identik.
- [x] `packages/render/test/layout.test.ts` + golden layout terdampak -- fill tint pada frame dan regenerasi terarah -- golden layout bermakna.
- [x] `packages/daemon/src/{server,chromium}.ts` + `packages/daemon/src/assets.ts` (baru, opsional) -- `GET /assets/:hash`: hash `^[a-f0-9]{64}$`, file `<dataDir>/assets/<hash>`, `content-type` dari magic bytes (png/jpeg/webp/gif, selain itu 404), `cache-control` immutable; pemetaan NOT_FOUND render.
- [x] `packages/daemon/src/index.test.ts` -- `/assets`: file PNG valid → 200 `image/png`; traversal/hash salah/file non-raster/tak ada → 404; `/screenshot` dokumen dengan fill gambar → 200 PNG; assetId tak ada → 404 `NOT_FOUND`, screenshot valid berikutnya 200.

**Acceptance Criteria:**
- Given build selesai, when `/opt/node-26/bin/pnpm --filter @lakar/render test`, then golden ring progres 3 busur, kartu bergradien dan berbayangan, dan board kedua hasil `duplicate` dengan `scrollY` lulus dalam toleransi, 0 skip, dan PNG-nya ada di `packages/render/test/out/`.
- Given PNG golden baru, when dibuka (Read), then gradien, bayangan, radius, stroke, opacity, blur, busur, path, dan gambar tampak benar menurut Design Notes.
- Given lakard uji, when screenshot dokumen dengan fill gambar dari store, then PNG 200 menampilkan gambar; assetId tak ada → 404 `NOT_FOUND`.
- Given `pnpm test` dan `verify.sh`, when dijalankan, then lulus, arah dependensi lulus, dan tidak ada proses Chromium/daemon Lakar tersisa.

## Implementation Notes

- Render dipecah: `paint.ts` (fills berlapis, radius, stroke box = overlay internal + box-shadow spread, shadows, efek, `applyEffects` dengan `translateY(-scrollY) rotate(r)`), `shape.ts` (geometri busur ellipse di ruang unit, mask-image SVG data URL, overlay `<svg>` stroke center/inside-clipPath/outside-mask), `assets.ts` (`assetIds`, `decodeAssets` tanpa cache antar-render: gambar di-decode ulang setiap `renderBoard`, referensi `HTMLImageElement` hanya dipegang lokal sampai pengukuran selesai). `layout.ts` memanggil paint setelah sizing; placeholder hanya untuk icon (efek bersama tetap diterapkan, shadows icon tidak).
- `renderBoard(doc, boardId, root, {fonts, assetBase?})`: urutan font → glyph → muat font → decode aset → mount. Aset gagal → `{ok:false, code:'NOT_FOUND', assets, message}`. `mountBoard` menerima `{assetBase?}` opsional.
- Kalibrasi blur: `DROP_SHADOW_BLUR_FACTOR = 0.5` (Chromium menafsirkan panjang `drop-shadow()` sebagai σ; box-shadow σ = blur/2). Dibuktikan tes `bayangan-path-vs-rect`: path persegi vs rect berselisih ≤ 0,5% piksel (tol 24), dan blur dua kali lipat jelas gagal (uji kepekaan). `filter: blur(blur/2)` dan `backdrop-filter: blur(backdropBlur/2)` memakai aturan σ yang sama.
- Tambahan kecil di luar Design Notes: board diberi `isolation: isolate` supaya `mix-blend-mode` anak hanya bercampur dengan isi board (tidak mengubah golden lama).
- Ellipse dengan `inner > 0` tanpa `sweepDeg` diperlakukan sebagai annulus penuh (dua lingkaran evenodd); `sweepDeg: 0` → elemen node kosong (bounds tetap ada).
- Ring progres: sampel piksel pada ring tunggal berdampingan (jam 3 pada 270°, jam 9 pada 180°, pusat) karena pada tumpukan identik titik jam 3/6/9 jatuh tepat di ujung busur; tumpukan absolute 3 busur tetap ada di golden dan diuji pada sudut tengah 45°/135°/225°/315°.
- Harness: `addAsset`, rute `/assets/<sha256>` in-memory, `testImageAsset()` (OffscreenCanvas 64×48 empat kuadran + diagonal), `pixels()`, `pixelDiffRatio()`, builder `rect/ellipse/path`, parameter `fills` pada `boardDoc`. `text.test.ts` hanya disesuaikan narrowing tipe (`result.code !== 'FONT_MISSING'`) karena varian baru.
- Golden layout lama (10 nama: row, column, hug, fill, fill-in-hug, min-max, gap-negatif, absolute, none, absolute-hug) dibuat ulang dengan `LAKAR_UPDATE_GOLDEN=1` hanya untuk `layout.test.ts` setelah frame diberi tint `#E3F2FD`/`#FFE0B2`; bounds numerik lulus tanpa diubah. `teks-wrap`/`teks-bobot` tidak berubah.
- Daemon: `assets.ts` (`ASSET_ID`, `rasterType` dari magic bytes PNG/JPEG/WebP/GIF, `readAsset`), rute `GET /assets/:hash` (`cache-control` immutable), `chromium.ts` memetakan NOT_FOUND render → LakarError `NOT_FOUND` non-retryable (halaman tidak dibuang), `RENDER_PAGE_HTML` meneruskan `assetBase:'/assets/'`.
- Golden baru yang dilihat (Read): ring-progres, kartu-gradien, stroke-align, radius-clip, efek, ellipse-path, bayangan-path-vs-rect, gambar-fit, layar-gulir-a/b, serta fill, fill-in-hug, gap-negatif, none, min-max, absolute-hug.
- Verifikasi: `pnpm build` exit 0; grep impor non-relatif dist kosong; grep `border` hanya overlay/`border-radius`/komentar; `pnpm --filter @lakar/render test` 30/30, 0 skip; 3× ulang tanpa FLAKY; `pnpm test` 349/349 (28 file), 0 skip; manifest render tanpa `@lakar/core`; tidak ada proses Chromium/daemon Lakar, port 7466 kosong; `verify.sh` exit 0 (snapshot C9 identik).
- Perbaikan review: cache decode modul (`Map` permanen di halaman daemon, memori tumbuh tanpa batas dan aset terhapus tetap tampil) dihapus. `kartu-gradien` kini punya anak absolute opak (teal 36×36) yang menutup pojok kiri atas termasuk tepi stroke dan pita inner shadow; piksel sampel membuktikan stroke di atas anak (tepi atas/kiri putih) dan inner shadow di bawah anak (pita inner = warna anak). Golden `kartu-gradien` saja dibuat ulang dengan `LAKAR_UPDATE_GOLDEN=1 -t kartu-gradien` dan dilihat (Read).
- Risiko sisa: setiap render men-decode ulang gambar (tetap dilayani cache HTTP browser karena `immutable`); spread/inner shadow tidak didukung pada ellipse busur/path; `sides` diabaikan pada bentuk mask; stroke overlay SVG memakai id `lakar-stroke-N` global per halaman.

## Plan Change Log

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 4 findings — high 0, medium 0, low 4, false 0, maybe-false 0
- findings:
  - `[low]` `[reject]` Stroke outside/center dengan `sides` sebagian (paint.ts `outerStrokeShadows`) meninggalkan celah w×w di sudut dua sisi bersebelahan dan bentuk sabit bila ber-radius — benar secara geometri, tetapi kombinasi sides sebagian + align outside/center + sisi bersebelahan jarang dipakai (divider = satu sisi); perbaikan butuh mekanisme baru (overlay luar / SVG), bukan koreksi langsung.
  - `[low]` `[patch]` Cache `decoded` modul di assets.ts menahan setiap gambar ter-decode selamanya di halaman daemon berumur panjang (memori tumbuh, aset terhapus tetap tampil) — diperbaiki: `decodeAssets` men-decode per render dan mengembalikan `{failed, images}` yang hanya dipegang `renderBoard` sampai pengukuran.
  - `[low]` `[patch]` Tes `kartu-gradien` tidak membuktikan urutan lapisan matriks (inner di bawah anak, stroke di atas anak) — diperbaiki: anak absolute opak teal 36×36 menutup tepi stroke dan pita inner; piksel sampel membuktikan stroke putih di atas anak dan pita inner = warna anak; golden `kartu-gradien` saja dibuat ulang dan diperiksa visual.
  - `[low]` `[reject]` Spread dan inner shadow dibuang diam-diam pada ellipse busur/path (drop-shadow) sehingga mengubah `inner` mengubah tampilan bayangan — keterbatasan yang sengaja dicatat di Design Notes; inner/spread pada busur/path jarang dipakai, dan perbaikan butuh filter SVG baru (kompleksitas), bukan koreksi langsung. Dicatat untuk skill (story 13).

## Design Notes

**Fills** (frame, rect, ellipse, path, board): `fills[0]` paling bawah, terakhir paling atas (konvensi Figma); CSS `background` berlapis dalam urutan terbalik. Warna hex8 langsung (CSS menerima `#RRGGBBAA`).
- solid → lapisan `linear-gradient(c,c)` (agar bisa ditumpuk).
- linear → `linear-gradient(<angle>deg, c offset%…)`: sudut CSS (0 = ke atas, 90 = ke kanan, searah jarum jam).
- radial → `radial-gradient(<r·100>% <r·100>% at <cx·100>% <cy·100>%, …)`: elips relatif box, default `center [0.5,0.5]`, `radius 0.5` (menyentuh tepi tengah, seperti SVG objectBoundingBox).
- image → `url(<assetBase><hash>)` dengan fit: cover/contain → `background-size` sama + center + no-repeat; fill → `100% 100%`; tile → ukuran asli, `repeat`, mulai kiri atas.
- Board: semua fills (tanpa fills → `#FFFFFF`).

**Radius:** angka atau `[tl,tr,br,bl]` → `border-radius`; clip + radius memotong anak membulat.

**Stroke** (tanpa `border` pada elemen node): bagian dalam (inside = w, center = w/2) = overlay `div` internal `position:absolute; inset:0; box-sizing:border-box; border:<w> solid` hanya pada `sides` (default semua), `border-radius` sama, `pointer-events:none`, ditambahkan **terakhir** (di atas anak, seperti Figma). Bagian luar (outside = w, center = w/2) = `box-shadow` spread pada elemen node (semua sisi: `0 0 0 w c`; sisi tertentu: offset ke arah sisi itu, mis. bawah `0 w 0 0 c`). Overlay tidak ikut `scrollY` (bukan anak yang digeser) dan tidak terpotong radius secara salah.

**Shadows** (urutan array = urutan CSS, pertama di atas): drop → `x y blur spread c`; inner → `inset …`. `blur` = blur radius CSS box-shadow (σ = blur/2). Ellipse busur dan path: drop → `filter: drop-shadow(x y b c)` dengan `b` dikalibrasi agar σ sama dengan box-shadow (verifikasi empiris lewat tes `bayangan-path-vs-rect`); spread dan inner tidak didukung pada bentuk ini (dicatat). Text: drop → `text-shadow`; inner diabaikan.

**Efek** (semua node anak termasuk text/icon): `opacity`; `blend` → `mix-blend-mode`; `blur` → `filter: blur(blur/2 px)` diselaraskan σ = blur/2 (sama dengan bayangan) — kalibrasi tercatat di Implementation Notes; `backdropBlur` → `backdrop-filter: blur(...)` dengan aturan σ sama; `rotation` derajat searah jarum jam → `transform: rotate()`, origin tengah, tidak memengaruhi layout. Urutan `filter`: drop-shadow lalu blur.

**Ellipse:** tanpa busur (sweep tidak diisi atau |sweep| ≥ 360 dan `inner` 0) → box CSS `border-radius:50%` (semua fitur rect berlaku). Selain itu bentuk dari path di ruang unit (pusat 0.5, R 0.5, r = 0.5·inner; titik θ: `(0.5+R·sinθ, 0.5−R·cosθ)`, θ dari jam 12 searah jarum jam; large-arc = |sweep| > 180; sweep-flag = sweep > 0); |sweep| ≥ 360 dengan inner → dua lingkaran `evenodd`; sweep 0 → tidak tergambar.

**Bentuk mask (ellipse busur, path):** elemen node berisi (1) lapisan fill `position:absolute; inset:0` dengan background fills dan `mask-image: url("data:image/svg+xml,…")` (viewBox shape, `preserveAspectRatio='none'`, `mask-size:100% 100%`, no-repeat), (2) overlay `<svg>` stroke dengan path sama, `vector-effect:non-scaling-stroke`: center = width w; inside = 2w + clipPath bentuk; outside = 2w + mask (rect besar putih, bentuk hitam, `maskUnits=userSpaceOnUse`). `sides` diabaikan untuk bentuk ini. Path: viewBox `[x,y,w,h]` dipetakan ke box (non-uniform); width/height tidak diisi atau hug → ukuran viewBox; `fill-rule` nonzero.

**scrollY:** setiap anak frame (flow dan absolute) mendapat `translateY(-scrollY px)` di depan transform-nya (`translateY(-s) rotate(r)`); tidak dipaksa clip.

**Aset:** `renderBoard` mengumpulkan semua `assetId` (board + node), memuat `new Image()` + `await decode()` sebelum mount; gagal → `{ok:false,code:'NOT_FOUND',assets,message}`. Daemon: 404 `NOT_FOUND`, `retryable:false`, hint "assetId adalah sha256 file gambar di store aset daemon; impor gambar dulu".

**Kualitas:** setiap golden baru dilihat dengan Read sebelum commit; bila hasil tampak salah (bayangan terpotong, busur bergerigi, gradien terbalik), perbaiki render — jangan longgarkan toleransi.

## Verification

**Commands:**
- `cd /root/lakar && /opt/node-26/bin/pnpm build` -- expected: exit 0
- `cd /root/lakar && grep -nE "(from|import)\s*\(?['\"][^./]" packages/render/dist/*.js` -- expected: tidak ada keluaran
- `cd /root/lakar && grep -n "border" packages/render/src/*.ts` -- expected: hanya pada overlay stroke internal / `border-radius`, bukan elemen node
- `cd /root/lakar && /opt/node-26/bin/pnpm --filter @lakar/render test` -- expected: lulus, 0 skip; `ls packages/render/test/out/` memuat `ring-progres.png`, `kartu-gradien.png`, `layar-gulir-b.png`
- `cd /root/lakar && for i in 1 2 3; do /opt/node-26/bin/pnpm --filter @lakar/render test >/dev/null || echo FLAKY; done` -- expected: tidak ada `FLAKY`
- `cd /root/lakar && /opt/node-26/bin/pnpm test` -- expected: exit 0, 0 skip, termasuk tes daemon `/assets` dan arah dependensi
- `grep -q '"@lakar/core"' /root/lakar/packages/render/package.json && echo BAD` -- expected: tidak ada keluaran
- `pgrep -f 'lakar.*(daemon|chrome)|chrome-headless-shell.*lakar'; ss -ltnp | grep -c 7466` -- expected: tidak ada proses dan 0
- `cd /root/lakar && bash tools/node26/verify.sh` -- expected: exit 0

**Manual checks:**
- Read `packages/render/test/out/{ring-progres,kartu-gradien,stroke-align,efek,ellipse-path,gambar-fit,layar-gulir-a,layar-gulir-b}.png` dan golden layout yang dibuat ulang: tampilan sesuai Design Notes.

## Auto Run Result

- **Status:** built. Route full, risk medium, review quick (pinned), 1 pass, tanpa loop.
- **Ringkasan:** render kini menggambar fills berlapis (solid, linear sudut CSS, radial relatif box, gambar cover/contain/fill/tile via `/assets/<sha256>`), radius, stroke inside/center/outside (overlay internal di atas anak + box-shadow spread; tanpa CSS `border` pada elemen node), shadows drop/inner, opacity, blend, blur, backdropBlur, rotation, rect, ellipse (box penuh atau busur `startDeg/sweepDeg/inner` via mask SVG), path (`d`+`viewBox`, overlay stroke SVG), dan `scrollY` (translateY anak). Gambar di-decode sebelum mount; gagal → NOT_FOUND. Daemon menyajikan `GET /assets/:hash` (raster dari magic bytes) dan memetakan NOT_FOUND render → 404.
- **File:**
  - `packages/render/src/{paint,shape,assets}.ts` (baru), `layout.ts`, `index.ts` — properti visual, bentuk, aset.
  - `packages/daemon/src/assets.ts` (baru), `server.ts`, `chromium.ts`, `index.ts` — rute `/assets`, pemetaan NOT_FOUND.
  - `packages/render/test/{harness,visual.test,layout.test,text.test}.ts` + 11 golden baru, 10 golden layout dibuat ulang (frame diberi tint).
  - `packages/daemon/src/index.test.ts` — tes `/assets` dan screenshot fill gambar.
- **Review:** 2 low di-patch (cache decode permanen; tes urutan lapisan kartu), 2 low ditolak (celah sudut stroke sides sebagian di luar; spread/inner diabaikan pada busur/path — keduanya jarang, perbaikan menambah mekanisme). Tidak ada defer.
- **Follow-up review:** false (hanya 2 low yang di-patch).
- **Verifikasi:** `pnpm build` exit 0; grep impor non-relatif dist kosong; `border` hanya pada overlay internal; manifest render tanpa `@lakar/core`; `pnpm --filter @lakar/render test` 30/30, 0 skip, 3× ulang tanpa FLAKY; `pnpm test` 349/349 (28 file), 0 skip; tidak ada proses Chromium/daemon Lakar, port 7466 kosong; `verify.sh` exit 0. Manual: golden ring-progres, kartu-gradien, ellipse-path, efek, gambar-fit, layar-gulir-b dilihat (Read) — sesuai Design Notes.
- **Residual risk:** spread/inner shadow dan `sides` tidak didukung pada busur/path; celah sudut stroke luar dengan sides bersebelahan; semantik (fills[0] paling bawah, sudut CSS, radius radial relatif box, rotasi searah jarum jam, blur σ = blur/2) harus didokumentasikan di skill story 13; `measureBoard` memberi AABB untuk node berotasi dan posisi setelah `scrollY` (relevan LC-02a story 11); tes render mengimpor core lewat path relatif.
