---
title: 'Skema vektor v6: atribut presentasi SVG bertipe, allowlist svg, dan ekspor SVG (epic paste-vektor story 2)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: '1a55afd0c42b8d31126f16486356f5a1e1b4a227'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
  - '{project-root}/tests/fixtures/docs/README.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Node `path` hanya menyimpan `d`, `viewBox`, fill, dan stroke box (`color/width/align`). Atribut presentasi SVG (fill-rule, cap, join, dash, miter, dan lainnya) tidak punya tempat, sehingga ikon yang di-paste (story 3) akan kehilangan atribut dan tidak bisa diekspor ulang (AD-14). Belum ada serializer node → SVG.

**Approach:** Naikkan `SCHEMA_VERSION` ke 6 dengan `MIGRATIONS[5]` identitas.
- **Skema:** node `path` mendapat `fillRule`, `strokeLinecap`, `strokeLinejoin`, `strokeDasharray`, `strokeMiterlimit`, dan `svg` (record terbatas allowlist atribut presentasi, nilai divalidasi per atribut).
- **Render (AD-5):** satu fungsi murni `vectorSvgAttrs` di `css.ts` memetakan properti itu ke atribut SVG; `shape.ts` memasangnya pada mask fill, clip/mask stroke, dan path stroke. Codegen ikut lewat `pathShape`/`strokeSvgSpec` (AD-16).
- **Ekspor:** serializer murni `vectorToSvg` di `@lakar/render` untuk node `path` atau frame berisi path → string SVG mandiri + daftar properti yang tidak diekspor.
- **Viewer:** panel Design untuk path memakai kontrol desain J7AmQi/S8w37: Fill rule (select) di grup Fill, Cap/Join (segmented) dan Dash/Miter (field) di grup Stroke menggantikan baris Sides.
- **Korpus:** fixture v6 berisi ikon multi-path yang dirender sama dengan SVG sumbernya.

## Boundaries & Constraints

**Always:**
- **Properti path baru (semua opsional):**
  - `fillRule: 'nonzero' | 'evenodd'` (default render `nonzero`);
  - `strokeLinecap: 'butt' | 'round' | 'square'` (default SVG `butt`);
  - `strokeLinejoin: 'miter' | 'round' | 'bevel'` (default `miter`, sama dengan render lama);
  - `strokeDasharray: number[]` (1..16 angka ≥ 0, finite, px seperti `stroke.width`);
  - `strokeMiterlimit: number` (1..100);
  - `svg: Partial<Record<SvgPresentationAttr, string>>` dengan allowlist `SVG_PRESENTATION_ATTRS` = `fill-opacity`, `paint-order`, `shape-rendering`, `stroke-dashoffset`, `stroke-opacity`. Nilai divalidasi pola per atribut (`SVG_ATTR_PATTERNS`): opacity = angka 0..1 atau persen; `stroke-dashoffset` = angka (opsional `px`, px seperti stroke); `shape-rendering` = `auto|optimizeSpeed|crispEdges|geometricPrecision`; `paint-order` = `normal` atau 1–3 kata unik dari `fill|stroke|markers`. Kunci di luar allowlist → `SCHEMA_INVALID` yang menyebut allowlist.
- Properti baru hanya pada node `path` (strict: tipe lain menolaknya). Semua bisa di-override instance (OVERRIDABLE_PROPS turunan otomatis). Tidak menerima ref token.
- **Pemetaan (`vectorSvgAttrs`, css.ts):** `rule` = fillRule ?? nonzero; `fill` = atribut path mask fill (`fill-opacity`, `shape-rendering`); `stroke` = `stroke-linejoin` (selalu, default `miter`), lalu `stroke-linecap`, `stroke-miterlimit`, `stroke-dasharray`, `stroke-dashoffset`, `stroke-opacity`, `shape-rendering` bila diisi; `strokeUnder` = `paint-order` menaruh `stroke` sebelum `fill`. Node path tanpa properti baru menghasilkan DOM, mask, dan keluaran codegen yang byte-identik dengan sebelumnya.
- **Render:** fill-rule berlaku pada mask fill, clipPath stroke inside, dan mask stroke outside; `strokeUnder` → overlay stroke dipasang sebelum lapisan fill. Codegen memakai jalur yang sama (urutan anak ikut `strokeUnder`).
- **`vectorToSvg(node)`** (murni, deterministik) menerima `ResolvedPathNode` atau `ResolvedFrameNode`, mengembalikan `{ svg, dropped: {nodeId, prop}[] }`:
  - Path tunggal: `<svg xmlns width height viewBox>` dengan viewBox node, ukuran = ukuran efektif (`effectiveSizing`, `fill` → viewBox).
  - Frame: ukuran frame (angka; selain angka → ukuran gabungan anak). Bila semua anak path memakai viewBox sama dan kotaknya = kotak frame, root memakai viewBox itu dan anak menjadi `<path>` polos; selain itu root `viewBox="0 0 W H"` dan tiap path dibungkus `<g transform="matrix(...)">`. Frame bersarang → `<g transform="translate(x y)">`. Posisi anak = `x/y` (absolute atau parent `none`); anak flow di frame row/column/grid ditaruh di 0,0 dan dilaporkan (`prop: 'layout'`).
  - Atribut path: `d`; `fill` (solid → `#RRGGBB`, alpha ≠ FF → `fill-opacity` = alpha × `svg['fill-opacity']`; tanpa fill → `none`; >1 fill solid → path tambahan berisi fill bawah); `stroke`, `stroke-width` (dan `stroke-dasharray`, `stroke-dashoffset`) dikonversi px → unit user bila skala seragam, bila tidak seragam tetap px + `vector-effect="non-scaling-stroke"`; stroke inside/outside lewat clipPath/mask (sama dengan render); `fill-rule`, `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit` hanya bila diisi; semua entri `svg` dikeluarkan; `opacity` node → `opacity`.
  - Tidak diekspor dan dilaporkan: fill non-solid, `rotation`, `blur`, `backdropBlur`, `shadows`, `blend`, `stroke.sides`, fill/stroke/radius/efek frame, anak bukan frame/path, nilai berupa ref token.
- **Panel Design (C6, desain J7AmQi/S8w37):** hanya bila semua target `path`:
  - grup Fill: Select Field "Fill rule" (Nonzero/Evenodd) di bawah paint row, tampil bila ada fill;
  - grup Stroke (bila ada stroke): baris W + align tetap; baris Sides diganti "Cap" (Butt/Round/Square), "Join" (Miter/Round/Bevel), lalu baris Field "Dash" (teks `4 2`, kosong/0/none = hapus) dan Field "Miter" (≥ 1). Nilai kosong menampilkan default (Butt, Miter, 4).
  - Setiap edit = satu commit lewat route ops (AD-7). `GROUP_PROPS` fill/stroke memuat kunci baru (penanda override).
- **Kompatibilitas (AD-3, AD-4):** `MIGRATIONS[5]` hanya menaikkan versi; v1–v5 bermigrasi tanpa perubahan lain; route, tool, kode error lama tetap; asersi versi 5 → 6 di tes lama; golden render dan codegen lama tidak berubah.

**Never:**
- Importer SVG/HTML, route paste, tool MCP paste (story 3/4); pen tool dan edit titik (story 5); UI ekspor SVG (belum ada desain; serializer dipakai story 3 dan 5).
- Format simpan path selain `d`; string CSS/SVG bebas; atribut svg di luar allowlist; mengubah arti `stroke.width`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Migrasi | dokumen v5 (`komponen-kartu`) | `{...raw, schemaVersion:6}` | - |
| Path lama | path tanpa properti baru | DOM/mask/codegen identik dengan v5 (`stroke-linejoin="miter"` tetap) | - |
| Typed | `fillRule:'evenodd'`, cap round, join bevel, dash `[4,2]`, miter 8 | mask `fill-rule="evenodd"`; stroke path membawa `stroke-linecap="round" stroke-linejoin="bevel" stroke-miterlimit="8" stroke-dasharray="4 2"` | - |
| svg allowlist | `svg:{'stroke-opacity':'0.5','fill-opacity':'0.25'}` | stroke path `stroke-opacity`, mask path `fill-opacity` | - |
| paint-order | `svg:{'paint-order':'stroke'}` | overlay stroke sebelum lapisan fill (DOM dan codegen) | - |
| Di luar allowlist | `svg:{transform:'rotate(4)'}` / `svg:{onload:'x'}` | ditolak | `SCHEMA_INVALID` menyebut allowlist |
| Nilai tak sah | `svg:{'stroke-opacity':'url(#a)'}`, dash `[-1]`, dash `[]`, miter `0.5`, cap `'arrow'` | ditolak | `SCHEMA_INVALID` |
| Tipe lain | rect `fillRule` | ditolak (strict) | `SCHEMA_INVALID` |
| Ekspor path 1:1 | path 24×24 viewBox 24, stroke center 2 | `stroke-width="2"`, tanpa vector-effect, semua atribut bertipe + svg keluar | - |
| Ekspor skala | path 96×96 viewBox 24, stroke 8, dash `[8,8]` | `stroke-width="2" stroke-dasharray="2 2"` | - |
| Ekspor non-seragam | 48×24 viewBox 24 | stroke px + `vector-effect="non-scaling-stroke"`, `preserveAspectRatio="none"` | - |
| Ekspor frame ikon | frame 24×24, 3 path viewBox sama di 0,0 | satu `<svg viewBox="0 0 24 24">` berisi 3 `<path>` | - |
| Ekspor terbuang | fill linear, shadow, teks di frame | tidak diekspor | `dropped` berisi `{nodeId, prop}` per item |
| Panel Dash | ketik `4, 2` / `` / `abc` | `strokeDasharray:[4,2]` / dihapus (`null`) / tidak commit | input tak sah diabaikan |

</intent-contract>

## Code Map

- `packages/schema/src/nodes.ts` -- `SCHEMA_VERSION` 6, `pathShape`, konstanta `FILL_RULES`, `STROKE_LINECAPS`, `STROKE_LINEJOINS`, `STROKE_DASH_MAX`, `STROKE_MITERLIMIT_MAX`, `SVG_PRESENTATION_ATTRS`, `SVG_ATTR_PATTERNS`, `SvgAttrs`.
- `packages/schema/src/index.ts`, `README.md` -- ekspor dan dokumentasi.
- `packages/core/src/migrate.ts` -- `MIGRATIONS[5]`.
- `packages/render/src/css.ts` -- `vectorSvgAttrs` (AD-5).
- `packages/render/src/shape.ts` -- `Shape` membawa atribut vektor; `pathShape`, `maskImage`, `strokeSvgSpec`.
- `packages/render/src/layout.ts` -- `renderShape` urutan `strokeUnder`.
- `packages/render/src/svg.ts` (baru) + `index.ts` -- `vectorToSvg`.
- `packages/codegen/src/tree.ts` -- `shapeChildren` urutan `strokeUnder`.
- `packages/viewer/src/designModel.ts`, `DesignPanel.tsx`, `componentModel.ts` -- kontrol vektor, parser dash/miter, `GROUP_PROPS`.
- `packages/exec/src/api.ts`, `packages/skills/skills/api.md` -- dokumentasi agen untuk properti path baru.
- `tests/fixtures/docs/v6/ikon-vektor.lakar.json`, `tests/fixtures/svg/*.svg`, `tests/fixtures/docs/README.md` -- korpus dan SVG sumber.
- `tests/doc-corpus.test.ts`, `packages/render/test/corpus.test.ts` -- migrasi v5 → v6, cakupan fixture, paritas piksel ikon vs SVG sumber dan vs ekspor.
- `tests/fixtures/codegen/v6-ikon-vektor.*.txt` -- golden codegen korpus baru.
- Tes versi lama: `packages/schema/src/{index,v1,v2,v3,v4,components}.test.ts`, `packages/core/src/migrate.test.ts`, `packages/daemon/src/store.test.ts`, `bench/src/round/round.test.ts` + snapshot, dan tes lain yang menyebut versi 5.

## Tasks & Acceptance

**Execution:**
- `packages/schema/src/nodes.ts` -- tambah properti path dan allowlist, versi 6 -- AD-14, AD-3.
- `packages/core/src/migrate.ts` -- langkah 5 → 6 identitas -- AD-3.
- `packages/render/src/css.ts`, `shape.ts`, `layout.ts` -- pemetaan dan render atribut -- AD-5.
- `packages/render/src/svg.ts`, `index.ts` -- serializer ekspor -- AD-14.
- `packages/codegen/src/tree.ts` -- urutan `strokeUnder` -- AD-16.
- `packages/viewer/src/designModel.ts`, `DesignPanel.tsx`, `componentModel.ts` -- kontrol desain -- C6.
- `packages/exec/src/api.ts`, `packages/skills/skills/api.md` -- satu kalimat properti path baru.
- `tests/fixtures/docs/v6/ikon-vektor.lakar.json`, `tests/fixtures/svg/*.svg`, README -- korpus v6: frame ikon multi-path stroke (cap/join round), ikon fill evenodd, ikon dash + dashoffset + miter + square cap + shape-rendering, ikon dengan fill-opacity/stroke-opacity/paint-order.
- Tes: `packages/schema/src/vector.test.ts` (validasi matriks), `packages/render/src/svg.test.ts` (pemetaan, serializer, path lama identik), `packages/viewer/src/designVector.test.ts` (parser dan ops), `packages/core/src/migrate.test.ts`, `tests/doc-corpus.test.ts`, `packages/render/test/corpus.test.ts` (piksel), tes versi lama 5 → 6, golden codegen v6.

**Acceptance Criteria:**
- Given korpus v1–v6, when dimigrasi, divalidasi, `resolveDocument`, dan dirender per board di Chromium, then semuanya sukses.
- Given setiap board ikon fixture v6, when dirender Chromium dan dibandingkan dengan SVG sumbernya (`tests/fixtures/svg`) dirender di ukuran sama, then piksel berbeda (selisih kanal > 24) ≤ 1%.
- Given frame ikon fixture v6, when `vectorToSvg` lalu SVG hasilnya dirender, then sama (≤ 1%) dengan render Lakar, dan SVG memuat setiap atribut bertipe dan setiap entri `svg` fixture.
- Given path di panel Design, when pengguna memilih Cap Round, Join Bevel, Dash `4 2`, Miter 8, dan Fill rule Evenodd, then masing-masing satu commit yang menulis properti bertipe itu (tes model ops).
- Given ekspor kode board ikon v6, when React+CSS dan React+Tailwind dirender, then lolos uji paritas piksel yang sudah ada (corpus otomatis masuk `tests/codegen-parity.test.ts`).

## Spec Change Log

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 30 findings — high 0, medium 6, low 17, false 7, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) `vectorToSvg` memetakan ulang cap/join/miter/dash/dashoffset sendiri, bukan dari `vectorSvgAttrs` (AD-5). Benar (svg.ts `pathElements`). Patch: atribut stroke bertipe kini diambil dari `v.stroke` (join hanya bila diisi, panjang px → unit user), fill-rule dari `v.rule`.
  - `[medium]` `[patch]` (blind) opacity node hanya di path teratas; fill bawah dan komposit fill+stroke berbeda dari render. Benar. Patch: semua elemen node dibungkus satu `<g opacity>`; tes `svg.test.ts` "opacity node membungkus semua elemen".
  - `[low]` `[reject]` (blind) `paint-order` stroke dengan lebih dari satu fill solid: stroke hanya di bawah fill teratas. Benar tetapi jarang (path ber-fill ganda + paint-order); perbaikannya menambah cabang urutan elemen.
  - `[low]` `[patch]` (blind) kondisi `fillEl` di cabang outside selalu benar dan mengeluarkan `<path fill="none">` kosong. Patch: elemen fill hanya bila ada fill solid; `rest` tetap di elemen stroke.
  - `[false]` `[reject]` (blind) opacity/miter/dash non-numerik dan lebar frame non-angka tidak dilaporkan. Input adalah node ter-resolve yang lolos skema: `opacity` (Unit), `strokeMiterlimit`, `strokeDasharray` tidak menerima token atau string; frame hug memakai gabungan kotak anak sesuai spec.
  - `[medium]` `[patch]` (blind) tes korpus ekspor tidak memeriksa kehadiran atribut seperti AC. Benar. Patch: `packages/render/test/corpus.test.ts` menegaskan setiap properti bertipe (dengan nilainya untuk rule/cap/join/miter) dan setiap kunci `svg` fixture ada di SVG ekspor.
  - `[low]` `[patch]` (blind) viewer menduplikasi batas skema. Patch: `DASH_MAX`/`MITER_MAX` dari `STROKE_DASH_MAX`/`STROKE_MITERLIMIT_MAX`, scrub Miter memakai `MITER_MAX`. Daftar CAPS/JOINS di css.ts tetap (render hanya boleh `import type` dari luar paket, AD-17).
  - `[low]` `[reject]` (blind) panel tidak bisa kembali ke "unset". Sebagian salah: klik tombol yang sudah aktif tidak menulis apa pun (`Segmented` onClick). Nilai eksplisit sama dengan bawaan secara visual; aksi reset baru butuh UI tanpa desain.
  - `[low]` `[reject]` (blind) `stroke.sides` lama pada path tidak bisa dihapus dari panel. Render mengabaikan `sides` pada bentuk; hanya bisa muncul dari agen; perbaikan menambah UI/cabang.
  - `[low]` `[patch]` (blind) dokumentasi agen tidak menjelaskan satuan px dash. Patch: `packages/exec/src/api.ts` (px kotak render, kalikan skala saat menyalin dari SVG; nilai `svg` string) + `api.md` diregenerasi.
  - `[low]` `[patch]` (blind) pola nilai menerima `1.`/`0.`. Patch: `OPACITY_ATTR` dan `stroke-dashoffset` mewajibkan digit sesudah titik; tes `vector.test.ts`. Notasi eksponen sengaja ditolak (importer story 3 menormalkan); pola JSON Schema memakai regex ECMA-262 sesuai spesifikasi JSON Schema.
  - `[false]` `[reject]` (blind) spec tanpa triage/deferred. Triage diisi pada langkah ini; story 3/5 adalah tiket terencana di tickets.toml, bukan pekerjaan tertunda. Perbaikannya juga mengedit spec build ini.
  - `[low]` `[reject]` (blind) Code Map menyebut `tests/fixtures/svg/*.svg` dan `v1/components.test.ts`. Path sebenarnya di subfolder `ikon-vektor/`; v1/components tidak menyebut versi 5 sehingga tidak perlu diubah. Perbaikannya mengedit spec build ini.
  - `[low]` `[reject]` (blind) paritas BrdLen01 tanpa SVG sumber. SVG tidak punya stroke inside/outside, jadi tidak ada sumber setara; board itu dicek ekspor vs render dan atributnya kini ditegaskan teks.
  - `[low]` `[patch]` (edge) path berukuran 0 → `stroke-width="Infinity"`. Benar. Patch: `pathElements` mengembalikan kosong bila skala 0 (render juga tidak menggambar); tes "path berukuran 0".
  - `[medium]` `[patch]` (edge) fill ganda + opacity node: fill bawah opak penuh. Satu akar dengan baris opacity blind; patch yang sama.
  - `[low]` `[reject]` (edge) fill ganda + `svg` fill-opacity diterapkan per path, bukan sekali pada komposit. Jarang; perlu grup fill tambahan (cabang baru).
  - `[low]` `[reject]` (edge) frame hug dengan anak di x/y negatif terpotong. Jarang untuk ikon; perlu pelacakan min x/y dan viewBox bergeser.
  - `[false]` `[reject]` (edge) opacity non-numerik hilang diam-diam. Skema `opacity` hanya angka 0..1 tanpa token, jadi node ter-resolve tidak bisa membawanya.
  - `[low]` `[reject]` (edge) reset cap/join/miter ke unset. Satu klaim dengan baris "unset" blind; alasan sama.
  - `[low]` `[patch]` (edge) Dash `4, 2,` ditolak. Patch: `parseDash` membuang bagian kosong (`filter(Boolean)`); kasus ditambah di `designVector.test.ts`.
  - `[low]` `[reject]` (edge) override `svg` fill-opacity menandai grup Stroke, bukan Fill. Hanya lewat override agen pada `svg`; memecah `svg` per grup menambah logika.
  - `[low]` `[patch]` (vgap) kunci vektor `GROUP_PROPS` tidak dites. Patch: tes "properti vektor (v6) masuk marker dan reset grup Fill/Stroke" di `componentModel.test.ts`.
  - `[false]` `[reject]` (intent) kontrol panel Design di luar tiket 2. Prompt orkestrator story ini meminta eksplisit "Design panel vector stroke controls per design" (J7AmQi/S8w37); keputusan dicatat di Design Notes.
  - `[medium]` `[patch]` (intent) cap/join/miter/dash hilang diam-diam pada path tanpa stroke (V3). Benar. Patch: atribut stroke bertipe dan `stroke-dashoffset` dikeluarkan juga tanpa stroke; tes "path tanpa stroke tetap mengeluarkan atribut".
  - `[medium]` `[patch]` (intent) V3 hanya dicek pada node sintetis, bukan fixture. Satu akar dengan baris tes korpus blind; patch yang sama.
  - `[false]` `[reject]` (intent) V2 parsial dan berbasis toleransi. Tiga board ikon dibandingkan dengan SVG sumber; board keempat tidak punya padanan SVG (inside/outside); ambang piksel adalah bentuk "sama" yang dipakai seluruh repo (spec kode-4, AD-6 subpiksel).
  - `[low]` `[patch]` (intent) V4 hanya dites di level zod. Penolakan berlaku di jalur tulis lewat skema yang sama; patch: tes transaksi core di `tests/doc-corpus.test.ts` (update vektor diterima, `svg.transform` dan nilai `url()` ditolak SCHEMA_INVALID, dokumen utuh).
  - `[false]` `[reject]` (intent) "nilai ditransformasi (px → user, alpha → opacity)" sebagai divergensi V3. Transformasi itu mempertahankan tampilan dan atribut; ikon 1:1 kembali ke angka sumbernya (tes korpus vs SVG sumber).
  - `[false]` `[reject]` (intent) pemetaan tunggal AD-5 vs serializer, beda default join. Satu akar dengan baris AD-5 blind yang sudah di-patch; default join export (hanya bila diisi) sama artinya dengan bawaan SVG `miter`, jadi tidak ada perbedaan tampilan.

## Design Notes

- **Satuan panjang stroke tetap px:** render memakai `vector-effect:non-scaling-stroke`, jadi `strokeDasharray` dan `svg['stroke-dashoffset']` dalam px seperti `stroke.width`. Serializer membagi dengan skala bila seragam, sehingga ikon 1:1 kembali ke angka sumbernya; importer (story 3) mengalikan.
- **Allowlist kecil dan semuanya dirender:** AD-1 meminta setiap properti gaya punya padanan render, jadi allowlist hanya berisi atribut yang bisa dipasang render pada path SVG internal (`fill-opacity` lewat alpha mask, `paint-order` lewat urutan lapisan). Atribut lain (transform, opacity, color) adalah tugas importer: dipetakan ke properti bertipe yang ada atau dibuang dan dilaporkan. Menambah atribut kelak = kenaikan versi skema.
- **Fill ekspor hanya solid:** gradien CSS pada kotak tidak setara persis dengan gradien SVG `objectBoundingBox`; fill non-solid dilaporkan `dropped` (ikon hasil paste memakai solid).
- **Kontrol di panel ada di story ini:** ticket story 5 juga menyebut kontrol stroke vektor; karena prompt story ini meminta kontrol desain, kontrol dibangun di sini dan story 5 tinggal memakainya. Grup Point (desain) milik story 5.
- **Panel tidak menyunting `svg`:** desain J7AmQi hanya memuat lima properti bertipe. Opacity paint row tetap alpha warna; `svg['stroke-opacity']`/`fill-opacity` dipertahankan apa adanya (penanda override grup Stroke ikut membaca `svg`). Label Cap/Join lebar 44px mengikuti desain (`.dp-vec-label`).
- **Lokasi serializer:** `@lakar/render` (sebelah `css.ts`/`shape.ts` yang memegang pemetaan atribut), sehingga viewer, codegen, dan daemon (importer story 3) memakai satu serializer tanpa dependensi baru (AD-17).

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 exec vitest run packages/schema packages/render packages/core packages/codegen packages/viewer tests/doc-corpus.test.ts tests/codegen.test.ts tests/codegen-parity.test.ts` -- expected: hijau.
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`.

**Manual checks:**
- Smoke msedge: daemon lokal dengan dokumen berisi path; panel Design menampilkan Fill rule, Cap, Join, Dash, Miter; mengubahnya menulis rev baru dan canvas berubah.

## Auto Run Result

**Ringkasan:** skema naik ke v6 (`MIGRATIONS[5]` identitas). Node `path` mendapat `fillRule`, `strokeLinecap`, `strokeLinejoin`, `strokeDasharray`, `strokeMiterlimit`, dan `svg` (allowlist 5 atribut, pola nilai per atribut). Atribut dipetakan tunggal oleh `vectorSvgAttrs` (css.ts) dan dipakai render, codegen, dan serializer murni `vectorToSvg` (path atau frame berisi path → SVG + `dropped`). Panel Design punya Fill rule, Cap, Join, Dash, dan Miter untuk path (desain J7AmQi/S8w37). Korpus v6 `ikon-vektor` (4 board) dirender sama dengan SVG sumbernya.

**File berubah:**
- `packages/schema/src/nodes.ts`, `index.ts`, `README.md` -- skema v6, allowlist `svg`, konstanta vektor.
- `packages/core/src/migrate.ts` -- langkah 5 → 6.
- `packages/render/src/css.ts`, `shape.ts`, `layout.ts`, `index.ts` -- `vectorSvgAttrs`, atribut di mask/stroke, urutan `paint-order`.
- `packages/render/src/svg.ts` (baru) -- serializer `vectorToSvg`.
- `packages/codegen/src/tree.ts` -- urutan stroke/fill untuk `paint-order`.
- `packages/viewer/src/DesignPanel.tsx`, `designModel.ts`, `componentModel.ts`, `app.css` -- kontrol vektor dan `GROUP_PROPS`.
- `packages/exec/src/api.ts`, `packages/skills/skills/api.md` -- dokumentasi agen.
- `tests/fixtures/docs/v6/ikon-vektor.lakar.json`, `tests/fixtures/svg/ikon-vektor/*.svg`, `tests/fixtures/docs/README.md`, `tests/fixtures/codegen/v6-ikon-vektor.*.txt` -- korpus, SVG sumber, golden codegen.
- Tes: `packages/schema/src/vector.test.ts`, `packages/render/src/svg.test.ts`, `packages/viewer/src/designVector.test.ts`, `packages/viewer/src/componentModel.test.ts`, `packages/render/test/corpus.test.ts`, `tests/doc-corpus.test.ts`, `packages/core/src/migrate.test.ts`, dan asersi versi 5 → 6 di tes lama (schema v2/v3/v4/index, daemon store, bench round + snapshot, codegen, viewer codeExport/cssImport).

**Temuan review:** 30 (high 0, medium 6, low 17, false 7).
- Patch (12 entri; medium 4, low 8): serializer memakai `vectorSvgAttrs` (AD-5); opacity node satu `<g>`; atribut stroke bertipe tidak hilang tanpa stroke; tes korpus menegaskan atribut ekspor; elemen fill kosong di cabang outside dihapus; path ukuran 0 tanpa `Infinity`; batas viewer dari skema; dokumentasi satuan px; pola `1.` ditolak; `parseDash` menerima pemisah di ujung; tes `GROUP_PROPS` vektor; tes jalur tulis core menolak `svg` di luar allowlist.
- Ditunda: tidak ada.
- Ditolak: paint-order + fill ganda, fill-opacity per path pada fill ganda, frame hug dengan anak negatif, override `svg` di grup Stroke (jarang, perlu cabang baru); reset ke unset dan `stroke.sides` lama (perlu UI tanpa desain); Code Map dan kelengkapan spec (perbaikan = edit spec build); BrdLen01 tanpa SVG sumber (tidak ada padanan SVG inside/outside); 7 temuan `false` dengan bantahan di triage log.

**Rekomendasi review lanjutan:** `false`. Empat entri medium yang di-patch semuanya di serializer murni dan tertutup tes (unit `svg.test.ts` + paritas piksel ekspor vs render korpus); patch UI hanya parser Dash dan konstanta. Tidak ada risiko tak terverifikasi yang bisa disebut.

**Verifikasi:**
- `pnpm build` sukses.
- `vitest run packages/render packages/schema/src/vector.test.ts packages/viewer/src/designVector.test.ts packages/viewer/src/componentModel.test.ts tests/doc-corpus.test.ts tests/codegen.test.ts tests/skills.test.ts`: 351 lulus, 6 gagal yang semuanya baseline Windows (ukuran skill core/landing CRLF, 2 layout, 2 teks).
- `pnpm test` penuh: 53 tes gagal / 56 entri FAIL, semuanya ada di `%TEMP%\lakar-fail-base.txt`; tidak ada kegagalan baru. Paritas piksel korpus v6 (vs SVG sumber dan vs ekspor) dan `tests/codegen-parity.test.ts` hijau.
- Smoke msedge (Fase A, daemon lokal): Cap/Join/Dash/Miter/Fill rule tampil sesuai desain, setiap edit satu rev, canvas memakai atribut baru, tanpa page error.

**Risiko sisa:** ekspor SVG hanya fill solid (gradien dilaporkan `dropped`); allowlist `svg` kecil sehingga menambah atribut berarti kenaikan versi skema; belum ada UI ekspor SVG (dipakai story 3/5).
