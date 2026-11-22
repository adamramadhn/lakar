---
title: 'Uji paritas piksel ekspor kode terhadap render Chromium (epic kode story 4)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: '2d2dbeda8bb91a4ba5ac8cdff02b8a650e6a86b1'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-kode-3-components.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Penemuan driver komponen (probe satu-flip + pewarisan driver kehadiran) belum terbukti lengkap untuk state anak yang hanya berubah oleh kombinasi dua prop gaya parent sekaligus.
    evidence: |-
      Review c4 (edge E1/E2, vgap other). Tidak ada dokumen konkret yang memicunya: state anak bergantung pada parent hanya lewat layout, gap negatif, dan scrollY, yang biasanya berubah oleh satu flip. Pemakaian di dokumen tetap benar karena dicek terhadap ekspansi (fallback inline). Penentu: fuzz master acak (≤ 64 kombinasi) yang membandingkan evalComponent dengan expandInstances untuk semua kombinasi.
    location: >-
      packages/codegen/src/components.ts (presenceDrivers, loop titik tetap)
    severity: medium (unverified)
  - summary: >-
      Fill mesh tidak diekspor codegen (dilewati dengan warning mesh-fill), jadi board ber-mesh di canvas berbeda dari kode; uji paritas membuang mesh dari acuan.
    evidence: |-
      Review c4 (intent I3). Keterbatasan sejak story 2 (README codegen). Usul: ekspor mesh sebagai lapisan gambar (PNG mesh yang sama dengan render) lalu hapus withoutMeshFills dari tes paritas.
    location: >-
      packages/codegen/src/tree.ts (fill mesh); tests/support/parity.ts (withoutMeshFills)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** R5 meminta kode hasil ekspor dirender sama dengan canvas, tetapi sampai story 3 belum ada bukti. Kelas Tailwind belum pernah dikompilasi Tailwind sungguhan, modul CSS belum pernah dimuat di browser, dan komponen dengan banyak prop yang saling berinteraksi belum pernah diuji. Ambang selisih piksel R5 juga masih ditunda di spine (Deferred) dan harus diputuskan di sini.

**Approach:**
- Tes `tests/codegen-parity.test.ts` mengekspor board dan node dengan `generateCode`, lalu memproses keluarannya seperti proyek React sungguhan:
  - CSS modules di-scope seperti bundler;
  - Tailwind v4 dikompilasi dengan `tailwindcss` + pemindai `@tailwindcss/oxide` asli, termasuk preflight;
  - komponen di-SSR dengan React.
- Hasilnya dirender di Chromium Lakar dan dibandingkan dengan render acuan `renderBoard` (dist render, `CHROMIUM_ARGS` daemon; AD-6). Ambang: piksel yang selisih kanalnya > 24 harus < 1% luas yang dibandingkan.
- Bug codegen yang ditemukan tes ini diperbaiki di `@lakar/codegen`.

## Boundaries & Constraints

**Always:**
- **Ambang R5 (keputusan final):**
  - `PARITY_TOLERANCE = 24`: selisih maksimum per kanal RGBA per piksel, sama dengan toleransi golden render.
  - `PARITY_MAX_RATIO = 0.01`: piksel di atas toleransi harus < 1% luas.
  - Keduanya ada di `tests/support/parity.ts`.
- **Acuan (AD-6):** harness render tanpa daemon (`packages/render/test/harness.ts`), yaitu dist render yang sama dengan yang dimuat daemon, `CHROMIUM_ARGS` daemon, Inter dari `@fontsource/inter`, dan glyph ikon dari katalog `@lakar/icons` asli.
  - Board → screenshot board.
  - Node non-master → screenshot node itu di render board.
  - Master → screenshot instance default master yang disisipkan sebagai anak pertama parent-nya. Ekspor master adalah komponen dengan props default, sedangkan master di canvas tampil sebagai node tersimpan.
  - Lapisan fill `mesh` dibuang dari acuan, karena codegen melewatinya dengan warning `mesh-fill`.
- **Render ekspor:** halaman Chromium terpisah dengan gaya dasar halaman harness yang sama, `@font-face` setara FontFace render, CSS aplikasi, dan markup SSR `renderToStaticMarkup` dari `export default` berkas utama.
  - `react-css`: `tokens.css` lalu modul CSS ter-scope, dalam urutan evaluasi impor ESM. Nama kelas ter-scope diambil dari modul CSS yang diimpor komponen.
  - `react-tailwind`: `@import "tailwindcss"; @import "./theme.css";` (preflight ikut), dikompilasi `compile()` Tailwind dengan kandidat dari `Scanner.scanFiles` atas semua TSX.
  - Node → dibungkus elemen yang meniru parent-nya di board (arah flex, align, lebar konten).
  - Tunggu font, gambar, latar `url()`, `fonts.ready`, dan 2 rAF, lalu screenshot elemen akar.
- **Tooling tes hanya devDependency root, versi dipin persis:**
  - `tailwindcss` dan `@tailwindcss/oxide` 4.3.5 (terbit 2026-11-06, ≥ 7 hari);
  - `react` dan `react-dom` 19.3.1 (sama dengan viewer, satu salinan di lockfile).
- **CI Linux:** tes berjalan di CI karena chromium-headless-shell terpasang di sana. Tanpa Chromium, `describe.skipIf(!browserInstalled)` membuat tes skip bersih. Berkas kerja di `tests/.parity/` (gitignore) dihapus `afterAll`, kecuali `LAKAR_PARITY_KEEP=1`.
- **Perbaikan codegen** tetap murni dan deterministik. Deps tetap `schema` + `render`. `components:false` tetap identik byte dengan golden story 2.

**Never:**
- Mengubah skema, render, viewer, daemon, MCP, atau route/tool lama.
- Menambah dependensi runtime paket mana pun.
- Bundler/Vite programatik sebagai tooling tes. Transformasi TSX memakai pipeline vitest yang sudah ada.
- Menurunkan ambang demi meluluskan kasus. Kasus yang gagal diperbaiki di codegen atau di acuannya (dengan alasan yang dicatat).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Korpus | setiap board v1..v5 + fixture komponen, kedua target (dengan/tanpa komponen bila ada instance) | < 1% piksel berbeda | gagal → PNG acuan/ekspor/diff di `packages/render/test/out/parity/` |
| Landing | `landing.lakar.json`: token bermode, Tombol (enum ikon, boolean), Fitur (slot, boolean absolute, gradien, bayangan, stroke), gambar, board gelap | lulus kedua target | - |
| Interaksi prop | `interaksi.lakar.json`: Chip dengan open × detail × tone(3) × arah(2) × rata(3), 24 instance kombinasi, Baris dengan Chip bersarang | setiap instance jadi `<Chip …/>`, hanya master canvas yang di-inline; lulus | - |
| Master/instance sebagai berkas utama | Tombol, Fitur, Chip, Baris, Kartu, instance Tombol | lulus terhadap instance default / node | - |
| Ubah token | nilai warna/spacing/radius/ukuran teks (per mode) diganti, ekspor ulang | tetap lulus; acuan berubah > 1%; hanya `tokens.css` (dan `theme.css`) berbeda | - |
| Regresi sengaja | padding dibuang dari modul CSS / kelas `p-[…]` | paritas gagal (> 1%) | - |
| Tanpa Chromium | `LAKAR_BROWSERS_PATH` kosong | suite paritas skip | - |

</intent-contract>

## Code Map

- `tests/codegen-parity.test.ts` -- harness paritas (baru): acuan, ekspor, Tailwind/CSS modules, SSR, perbandingan, kasus.
- `tests/support/parity.ts` -- helper murni (baru): ambang, scoping/urutan CSS modules, halaman ekspor, mutasi dokumen, regresi sengaja.
- `tests/parity-support.test.ts` -- tes unit helper murni (baru).
- `packages/render/test/harness.ts` -- `comparePngs` diekspor (perbandingan yang sama dengan golden).
- `packages/codegen/src/jsx.ts` -- template `className` akar komponen.
- `packages/codegen/src/components.ts` -- penemuan driver titik tetap.
- `tests/codegen.test.ts` -- golden/kesetaraan/typecheck mendapat fixture baru; kesetaraan master memakai instance default.
- `tests/fixtures/codegen/{landing,interaksi}.lakar.json` + `*.components.txt` -- fixture dan golden.

## Tasks & Acceptance

**Execution:**
- `package.json`, `pnpm-lock.yaml` -- devDependency `tailwindcss`, `@tailwindcss/oxide`, `react`, `react-dom` dipin persis -- tooling tes R5.
- `tests/support/parity.ts` -- `PARITY_TOLERANCE`, `PARITY_MAX_RATIO`, `withinParity`, `scopeCssModule`, `cssModuleClasses`, `cssModuleOrder`, `fontFaceCss`, `exportPageHtml`, `withoutMeshFills`, `withDefaultInstance`, `withTokenValues`, `dropPadding` -- logika murni harness.
- `tests/parity-support.test.ts` -- tes unit untuk semua helper di atas.
- `packages/render/test/harness.ts` -- ekspor `comparePngs(a, b, tol, maxRatio)`.
- `tests/codegen-parity.test.ts` -- kasus board korpus + fixture, node, interaksi prop, ubah token, regresi sengaja (di pemetaan `frameDecls` lewat `vi.mock` dist render yang dipakai codegen, dan di berkas keluaran); skip tanpa Chromium.
- `.github/workflows/ci.yml` -- unggah `packages/render/test/out/` sebagai artefak `render-diffs` bila tes gagal.
- `packages/codegen/src/jsx.ts` -- akar komponen Tailwind menulis `` `<kelas> ${className ?? ''}`.trimEnd() `` -- kelas statis terakhir tidak lagi menempel ke `${` sehingga terbaca pemindai Tailwind.
- `packages/codegen/src/components.ts` -- hanya driver yang mengubah kehadiran parent yang diwariskan ke anak -- kombinasi daun tidak meledak melewati `COMBOS_MAX`.
- `packages/codegen/src/components.test.ts` -- tes unit kedua perbaikan.
- `tests/codegen.test.ts`, `tests/fixtures/codegen/*` -- fixture baru di golden, kesetaraan, dan typecheck; golden Tailwind komponen diperbarui (hanya template akar).
- `packages/codegen/README.md`, `.gitignore` -- catatan paritas/ekspor master; `tests/.parity/`.

**Acceptance Criteria:**
- Given CI Linux dengan chromium-headless-shell, when `pnpm test` dijalankan, then `tests/codegen-parity.test.ts` lulus untuk kedua target di semua board korpus, fixture komponen, landing (terang dan gelap), interaksi, dan ekspor node, dengan < 1% piksel berbeda (toleransi kanal 24).
- Given fixture landing dengan nilai token diganti, when diekspor ulang, then paritas tetap lulus, acuan berubah > 1%, dan hanya berkas token yang berbeda.
- Given regresi sengaja (padding dibuang) pada keluaran, when dibandingkan, then paritas gagal dengan rasio > 1%.
- Given Chromium tidak terpasang, when tes dijalankan, then suite paritas di-skip tanpa error.
- Given `components:false`, when korpus diekspor, then keluaran sama dengan golden story 2.

## Spec Change Log

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 33 findings — high 0, medium 3, low 11, false 15, maybe-false 4
- findings:
  - `[low]` `[patch]` (blind) tes unit driver gaya hanya memeriksa 3 kombinasi -- tes kini membandingkan `equivalent()` untuk semua 72 kombinasi (open × detail × tone × arah × rata) dan memastikan 72 pemakaian `<Chip`.
  - `[low]` `[reject]` (blind) `presenceDrivers`/`expand` dihitung ulang per anak, dan cek `COMBOS_MAX` ganda -- `expand` di-cache per kombinasi, jadi sisanya hanya lookup map pada ≤ 64 kombinasi. Cache per parent menambah struktur untuk biaya yang tidak terukur.
  - `[false]` `[reject]` (blind) cabang `cls.expr` dan `String.raw` + `.trimEnd()` tidak terbukti terbaca pemindai -- cabang expr menulis string kelas berkutip di dalam lookup, dan komponen Tombol/Chip (expr) lulus paritas Tailwind. `String.raw\`…\`.trimEnd()` adalah JS sah dan lolos typecheck korpus.
  - `[low]` `[patch]` (blind) batas `≤` di `comparePngs` dan `<` di `withinParity` berbeda -- `parity()` kini memanggil `comparePngs(…, 0)`, sehingga diff selalu dibuat bila ada piksel berbeda. Lulus/gagal hanya dari `withinParity`.
  - `[false]` `[reject]` (blind) uji ubah token lulus tanpa bukti bila dimensi berbeda -- kedua acuan adalah screenshot board berukuran tetap (BrdLnd01/02). Dimensi selalu sama, dan dimensi yang berbeda pun berarti piksel berubah.
  - `[low]` `[patch]` (blind) doc `dropPadding` mengklaim "semua padding" -- komentar diperbaiki: shorthand saja, `p-[0px]` di Tailwind, dan pemanggil memastikan jumlah > 0, sehingga perubahan format gagal keras.
  - `[false]` `[reject]` (blind) `withDefaultInstance` di indeks 0 merusak acuan, layout absolute, dan master di bawah page -- hanya instance sintetis yang di-screenshot, jadi sibling yang bergeser tidak relevan. Board tidak bisa menjadi master (`boardShape` tanpa `component`, strict). 0,31% adalah kasus instance Tombol, bukan instance default.
  - `[low]` `[patch]` (blind) diagnosis PNG hilang di CI -- `ci.yml` kini mengunggah `packages/render/test/out/` sebagai artefak `render-diffs` saat gagal.
  - `[maybe-false]` `[reject]` (blind) `tests/.parity/` tetap, berisiko crash/konkuren/watch -- isinya dibersihkan di awal setiap run dan di-gitignore, dan worktree berbeda punya folder sendiri. Loop di mode watch belum diuji (penentu: `vitest` watch pada berkas ini). Bila benar, dampaknya low karena skrip repo memakai `vitest run`.
  - `[false]` `[reject]` (blind) biaya CI tidak dibahas -- suite terukur ±25 s lokal (62 kasus, 0,2–0,8 s per kasus), jauh di bawah batas job 30 menit.
  - `[low]` `[reject]` (blind) spec belum lengkap (status, log kosong, path pribadi) -- perbaikannya mengedit spec build ini. Path dan baseline mengikuti instruksi runner.
  - `[low]` `[patch]` (blind) `LAKAR_PARITY_LOG`/`KEEP` tidak terdokumentasi -- keduanya kini didokumentasikan di header tes dan README codegen. Perilaku inline master sudah ditegaskan oleh tes interaksi (warning persis).
  - `[low]` `[reject]` (blind) angka tetap (25 Chip, 4 Baris, daftar berkas) rapuh -- asersi sengaja persis untuk fixture tetap dan disertai komentar. Menurunkannya dari fixture menambah logika tes.
  - `[false]` `[reject]` (blind) helper duplikat dan `hasInstances` lewat string `"componentId"` -- nama token hanya `[a-z0-9-]`. Teks berisi `"componentId"` di-escape `\"` oleh JSON, jadi substring berkutip tidak muncul. Dampaknya pun hanya kasus tambahan.
  - `[low]` `[reject]` (blind) Never "render" vs harness tes, dan pin langsung oxide -- perbaikan pertama mengedit spec. Untuk yang kedua, `tailwindcss` 4.3.5 tidak membawa oxide, sehingga pin langsung dibutuhkan untuk pemindai dan versinya sama persis.
  - `[maybe-false]` `[defer]` (edge) state anak yang hanya berubah oleh dua prop gaya parent sekaligus tidak tertangkap -- belum ada dokumen pemicu (lihat `deferred`). Penentu: fuzz komponen acak. Pemakaian di dokumen tetap dicek terhadap ekspansi.
  - `[maybe-false]` `[defer]` (edge) penghapusan pewarisan penuh bisa menghilangkan varian -- akar penyebab sama dengan baris sebelumnya (`deferred`).
  - `[false]` `[reject]` (edge) `styles[n]` undefined → `.undefined` -- proxy CSS modules vitest mengembalikan nama ter-scope untuk setiap kunci (diuji di prototipe), dan kelas yang hilang akan gagal paritas secara keras.
  - `[false]` `[reject]` (edge) master berupa board di bawah page -- skema melarang `component` pada board.
  - `[false]` `[reject]` (edge) `board.id === nodeId` untuk master board -- sama: board tidak bisa menjadi master.
  - `[low]` `[patch]` (edge) rasio tepat 0,01 → tanpa diff -- digabung dengan baris blind batas; `maxRatio` 0.
  - `[false]` `[reject]` (edge) regex impor tanpa kutip ganda/side-effect -- codegen selalu menulis impor relatif berkutip tunggal dengan `from`. Modul yang terlewat membuat paritas gagal keras, bukan lulus.
  - `[false]` `[reject]` (edge) `files[0]` bukan TSX -- urutan berkas codegen tetap: berkas utama `.tsx` selalu pertama (spec story 2/3).
  - `[false]` `[reject]` (edge) komponen render null → timeout -- tidak ada kasus yang mencapainya, dan timeout adalah kegagalan keras.
  - `[medium]` `[patch]` (vgap) pewarisan driver kehadiran tidak dipaku tes untuk node tanpa bind di bawah dua frame visible bersarang -- tes unit baru (Body > More > Deep) dengan tiga kombinasi probe. Tes ini terbukti gagal bila `presenceDrivers` dinonaktifkan.
  - `[maybe-false]` `[defer]` (vgap other) probe satu-flip mungkin tidak lengkap untuk interaksi gaya bersama -- akar penyebab sama dengan baris edge (`deferred`).
  - `[medium]` `[intent_gap]` (intent I1) regresi disuntik di keluaran, bukan di pemetaan -- diputuskan (delegasi): kasus baru memalsukan `frameDecls` (css.ts) yang dipakai codegen lewat `vi.mock` dist render. Paritas gagal di kedua target, dan regresi keluaran tetap ada. Dicatat di Design Notes.
  - `[false]` `[reject]` (intent I2) acuan dari harness, bukan daemon -- dist, `CHROMIUM_ARGS`, gaya dasar halaman (`RENDER_PAGE_HTML`), dan chromium-headless-shell sama dengan daemon. Keputusan dicatat di Design Notes.
  - `[medium]` `[defer]` (intent I3) acuan diubah (mesh dibuang, master → instance default) -- mesh adalah keterbatasan codegen sejak story 2 (ditunda, `deferred`). Acuan master adalah keputusan AD-16 yang dicatat di Design Notes.
  - `[false]` `[reject]` (intent I4) SSR, bukan runtime browser -- komponen ekspor statis, sehingga `renderToStaticMarkup` = DOM render klien. HTML + CSS dirender di Chromium.
  - `[false]` `[reject]` (intent I5) penyebut luas yang dibandingkan, bukan luas board -- nilainya sama untuk board dan lebih ketat untuk node. Keputusan dicatat di Design Notes.
  - `[false]` `[reject]` (intent I6) perubahan codegen di story tes -- prompt story meminta "Fix codegen bugs the test reveals" (R-B).
  - `[low]` `[reject]` (intent I7) suite bisa skip diam-diam di CI -- CI memasang chromium-headless-shell sebelum tes, sama seperti suite render lain. Prompt meminta skip bersih tanpa Chromium, dan guard CI menambah cabang.

## Design Notes

- **Ambang 1% / kanal 24 (keputusan R5).** Pada implementasi ini, 60 dari 62 perbandingan memberi 0,0000% piksel berbeda. Kasus ekspor instance Tombol memberi 0,31%, karena posisi pecahan di acuan menggeser antialias. Regresi padding memberi 48,6%. Margin antara kasus sah dan regresi sangat lebar. Toleransi 24 sama dengan golden render, sehingga satu definisi "sama" berlaku untuk render dan ekspor.
- **Bug codegen yang ditemukan:**
  1. **Kelas Tailwind hilang.** Template akar komponen menulis `` `… w-[fit-content]${className ? …}` ``. Pemindai oxide tidak menerima kandidat yang diikuti `$`, sehingga kelas statis terakhir akar setiap komponen Tailwind tidak dikompilasi. Badge v5 meregang selebar kartu (1,56%), dan border kiri `::after` Kartu juga hilang. Perbaikannya memberi pemisah spasi plus `.trimEnd()`, dan kelas yang dirender tetap sama.
  2. **Interaksi prop jatuh ke inline.** Penemuan driver story 3 mewariskan semua driver parent ke anak. Contohnya, akar Chip bervariasi menurut `arah` × `rata`, dan anak di detail bervariasi menurut `open` × `detail` × `tone`. Daun mendapat 72 kombinasi (> 64), sehingga seluruh komponen jatuh ke inline (`component-too-complex`).
     - Kini yang diwariskan hanya driver yang mengubah kehadiran parent. Itu cukup untuk node yang hanya hadir bila dua prop non-default (E1 story 3).
     - Pengaruh gaya parent ke anak tetap tertangkap probe titik tetap.
     - Golden lama tidak berubah oleh perbaikan ini, dan kesetaraan pohon tetap hijau.
- **Master di canvas ≠ komponen default (keputusan).** Bind `visible` dan nilai default lain tidak diterapkan pada master di canvas. Master dengan layer yang disembunyikan default karena itu tampil berbeda dari `<Comp />`.
  - Ekspor master tetap komponen dengan props default, sesuai API komponen (AD-16).
  - Acuannya adalah instance default master itu.
  - Di ekspor board, master tersebut di-inline (perilaku story 3). Tes kesetaraan `tests/codegen.test.ts` untuk master kini memakai acuan yang sama.
- **SSR, bukan bundling.** Komponen hasil ekspor statis, tanpa efek atau state, sehingga `renderToStaticMarkup` menghasilkan DOM yang sama dengan render klien. TSX ditransformasi pipeline vitest. Tooling tes cukup React dan Tailwind, tanpa Vite programatik.
- **Preflight Tailwind ikut.** Proyek Tailwind sungguhan memakainya. Lulusnya tes membuktikan deklarasi eksplisit codegen (box-sizing, margin, display, line-height) tahan terhadap reset itu.
- **Keputusan review c4 (intent, delegasi "terima jadi"):**
  - **Regresi di pemetaan (I1).** Verify ticket menyebut "regresi sengaja di pemetaan codegen". Tes kini juga memalsukan `frameDecls` (css.ts, AD-5) yang dipakai codegen lewat `vi.mock` dist render, sehingga padding hilang dari pemetaan. Render acuan memuat dist apa adanya di Chromium. Regresi pasca-proses berkas tetap ada sebagai kasus kedua.
  - **Acuan = harness, bukan proses `lakard` (I2).** Harness memakai dist render, `CHROMIUM_ARGS`, dan gaya dasar halaman yang sama dengan `RENDER_PAGE_HTML` daemon (`packages/daemon/src/chromium.ts`), di chromium-headless-shell yang sama dengan default daemon. Pola ini sama dengan tes korpus render (AD-6).
  - **Penyebut ambang = luas yang dibandingkan (I5).** Untuk board, nilainya sama dengan luas board. Untuk ekspor node, nilainya luas node, yang lebih ketat daripada luas board.
  - **SSR (I4)**, **acuan master/mesh (I3)**, dan **perbaikan codegen dalam story tes (I6, diminta prompt)** tetap seperti di atas. Mesh dicatat di `deferred`.

## Verification

**Commands** (Windows: awali `set "PATH=C:\Users\Fatmuh\AppData\Local\nvm\v26.5.0;%PATH%" &&`; pnpm = `npx -y pnpm@12.21.0`):
- `npx -y pnpm@12.21.0 install --frozen-lockfile` -- expected: sukses
- `npx -y pnpm@12.21.0 build` -- expected: sukses
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: 0 error
- `npx -y pnpm@12.21.0 exec vitest run tests/codegen-parity.test.ts tests/parity-support.test.ts tests/codegen.test.ts packages/codegen` -- expected: lulus
- `LAKAR_BROWSERS_PATH=<dir kosong> npx -y pnpm@12.21.0 exec vitest run tests/codegen-parity.test.ts` -- expected: suite di-skip
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`

## Auto Run Result

- **Ringkasan:**
  - Uji paritas piksel R5 `tests/codegen-parity.test.ts` mengekspor setiap board korpus, fixture komponen, landing (terang dan gelap), dan interaksi prop, ditambah ekspor master dan instance. Target React + CSS modules memakai scoping seperti bundler. Target React + Tailwind dikompilasi Tailwind v4.3.5 dan pemindai oxide asli, dengan preflight. Hasilnya di-SSR dengan React, dirender di Chromium Lakar, lalu dibandingkan dengan render acuan `renderBoard` (AD-6).
  - Ambang final: selisih kanal > 24 dihitung berbeda, dan piksel berbeda harus < 1% luas yang dibandingkan.
    - 60 dari 62 perbandingan sah memberi 0,0000%, dan instance Tombol memberi 0,31%.
    - Regresi di pemetaan (`frameDecls` di-mock) dan di keluaran membuat tes gagal (48,6%).
    - Ubah token lalu ekspor ulang tetap lulus, dan hanya berkas token yang berubah.
    - Tanpa Chromium, suite skip bersih (62 skipped).
  - Dua bug codegen diperbaiki:
    - kelas statis terakhir akar komponen Tailwind tidak terbaca pemindai (menempel ke `${`);
    - pewarisan semua driver parent membuat komponen berprop enum jatuh ke inline (> 64 kombinasi). Kini hanya driver kehadiran yang diwariskan.
- **File:**
  - `tests/codegen-parity.test.ts`, `tests/support/parity.ts`, `tests/parity-support.test.ts` (baru): harness, helper murni, dan tes unit.
  - `packages/render/test/harness.ts`: `comparePngs` diekspor.
  - `packages/codegen/src/jsx.ts`, `packages/codegen/src/components.ts`, `packages/codegen/src/components.test.ts`: kedua perbaikan beserta tes. Tesnya mencakup 72 kombinasi dan node tanpa bind di bawah dua frame visible bersarang.
  - `tests/codegen.test.ts`: fixture baru masuk golden, kesetaraan, dan typecheck. Kesetaraan master memakai instance default, dan batas waktu tes kesetaraan dinaikkan menjadi 60 s.
  - `tests/fixtures/codegen/{landing,interaksi}.lakar.json` + golden `*.components.txt`: fixture baru. Dua golden Tailwind lama diperbarui, hanya pada template akar.
  - `package.json`, `pnpm-lock.yaml`: devDependency `tailwindcss` dan `@tailwindcss/oxide` 4.3.5, `react` dan `react-dom` 19.3.1.
  - `.github/workflows/ci.yml`: artefak `render-diffs` saat gagal.
  - `packages/codegen/README.md`, `.gitignore`, `deferred-work.md`: dokumentasi dan item tunda.
- **Review (33 temuan: medium 3, low 11, false 15, maybe-false 4):**
  - **Patch (6 entri):**
    - tes unit 72 kombinasi;
    - batas `comparePngs` (`maxRatio` 0, diff selalu dibuat);
    - komentar `dropPadding`;
    - artefak CI;
    - dokumentasi `LAKAR_PARITY_LOG`/`KEEP`;
    - tes pewarisan kehadiran bersarang (vgap, medium).
  - **intent_gap I1** diputuskan (delegasi): regresi juga disuntik di pemetaan `frameDecls` lewat `vi.mock`.
  - **Ditunda (2):**
    - kelengkapan probe satu-flip untuk interaksi gaya bersama (maybe-false, medium bila benar);
    - fill mesh tidak diekspor (keterbatasan sejak story 2).
  - **Ditolak** (alasan per baris di Review Triage Log):
    - biaya rekomputasi driver;
    - cabang expr/`String.raw`;
    - dimensi uji ubah token;
    - acuan `withDefaultInstance`;
    - folder kerja tetap;
    - biaya CI;
    - kelengkapan spec;
    - angka tetap;
    - helper duplikat/`hasInstances`;
    - Never "render" dan pin oxide;
    - `styles[n]` undefined;
    - master board (dua baris);
    - regex impor;
    - `files[0]`;
    - render null;
    - acuan harness vs daemon;
    - SSR;
    - penyebut ambang;
    - perbaikan codegen dalam story;
    - skip di CI.
- **Follow-up review:** `false`. Patch per verdict: medium 1, low 5. Tidak ada patch high dan hanya satu medium. Tidak ada perilaku UI.
- **Verifikasi:**
  - `pnpm install --frozen-lockfile`, `pnpm build`, dan `tsc -p tsconfig.test.json` OK.
  - vitest codegen/paritas/helper: lulus (62 kasus paritas).
  - Suite paritas dengan `LAKAR_BROWSERS_PATH` kosong: 62 skipped.
  - `pnpm test` penuh: 0 kegagalan baru dibanding baseline Windows (53 kegagalan, semua di baseline). Run pertama menemukan timeout 5 s pada tes kesetaraan interaksi saat suite paralel; batasnya dinaikkan menjadi 60 s.
  - Snapshot bench yang hanya berubah CRLF dikembalikan.
- **Risiko sisa:**
  - Kelengkapan penemuan driver untuk interaksi dua prop gaya sekaligus (ditunda).
  - Mesh tidak diekspor.
  - Paritas di CI Linux belum dijalankan di sesi ini. Tes yang sama lulus di Windows dengan headless shell yang sama.
