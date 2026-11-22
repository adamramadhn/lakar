---
title: 'Importer paste SVG di daemon, route paste viewer, tool MCP paste, dan Ctrl+V di viewer (epic paste-vektor story 3)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: '5a974dbb4746d7c05a8a05e415e9037d7f4a4ac5'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-vektor-2-schema.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Skema v6 sudah bisa menyimpan atribut presentasi SVG pada node `path` dan `vectorToSvg` bisa mengekspornya, tetapi belum ada cara membawa SVG masuk. Pengguna tidak bisa menempel ikon dengan Ctrl+V, dan agen juga tidak punya tool untuk itu (R6, R7).

**Approach:** Daemon mendapat satu importer SVG murni (AD-15) yang mengurai SVG sesuai AD-14. Hasilnya node `path`, atau `frame` berisi path. Atribut presentasi menjadi properti bertipe atau masuk allowlist `svg`. Sisanya dibuang dan dilaporkan. Hasil di-commit sebagai op `add` core lewat `applyOps` (AD-2). Ada dua pintu yang memakai importer dan jalur commit yang sama:
- route viewer `POST /viewer/docs/:slug/paste` (guard Origin, respons membawa `inverse` untuk undo);
- route sesi `POST /viewer/paste` untuk tool MCP baru `paste`.

Di viewer, Ctrl+V dengan teks atau file SVG menyisipkan layer ke board/frame terpilih, lalu menampilkan toast desain G0vf1/nE6dL ("Pasted SVG as N paths"). Toast itu punya aksi Undo paste dan Details, yang membuka Paste Report w2am0.

## Boundaries & Constraints

**Always:**
- **Importer** (`importSvg(content, {name?})`, murni, deterministik):
  - **Pengurai XML** kecil buatan sendiri, tanpa dependensi baru. Menangani komentar, PI, DOCTYPE, CDATA, entitas standar dan numerik. Akar harus `<svg>`.
  - **Ukuran:** `width`/`height` akar (angka/px) dengan `viewBox`. Bila salah satu tidak ada, nilainya diambil dari yang lain. Bila keduanya tidak ada, dipakai kotak titik kendali semua path.
  - **preserveAspectRatio:** `none` membuat path diregangkan. Selain itu dipakai meet beserta perataannya (path diberi offset), dan `slice` dilaporkan.
  - **Pewarisan** dari `<svg>`/`<g>`/`<a>`: fill, fill-opacity, fill-rule, stroke, stroke-width, stroke-opacity, stroke-linecap, stroke-linejoin, stroke-miterlimit, stroke-dasharray, stroke-dashoffset, paint-order, shape-rendering, color, visibility. Deklarasi `style` menimpa atribut. `inherit` dan `currentColor` (dari `color`, default hitam) di-resolve.
  - **Bentuk:** `path`, `rect` (rx/ry), `circle`, `ellipse`, `line`, `polyline`, `polygon` menjadi satu node `path`. Isinya `d`, `viewBox` = viewBox akar, dan kotak = ukuran SVG di 0,0 (atau offset meet). Tanpa `position`/`x`/`y` di dalam frame.
  - **Transform** (matrix/translate/scale/rotate/skewX/skewY, bertumpuk dari leluhur) dipanggang ke `d`: arc menjadi kubik, lalu titik ditransformasi. Tanpa transform, `d` disalin byte-identik.
  - **Pemetaan atribut:**
    - fill solid (hex 3/4/6/8 digit, `rgb[a]()`, `hsl[a]()`, nama warna CSS, `transparent`) → `fills:[{type:'solid', color:'#RRGGBB[AA]'}]`. Default SVG hitam; `none` berarti tanpa fills.
    - stroke solid dengan lebar > 0 → `stroke {color, width: sw × skala px, align:'center'}`. Skala px = skala viewBox→kotak (rata-rata geometris pada sumbu tak seragam) × √|det transform|. Bila `vector-effect="non-scaling-stroke"`, skala px = 1.
    - `fill-rule`, `stroke-linecap`, `stroke-linejoin` (nilai di luar enum dibuang) → properti bertipe dengan nilai apa adanya.
    - `stroke-miterlimit` 1..100 → `strokeMiterlimit`.
    - `stroke-dasharray` (1–16 angka ≥ 0, × skala px; `none` diabaikan) → `strokeDasharray`.
    - `stroke-dashoffset` (× skala px) → `svg['stroke-dashoffset']`.
    - `fill-opacity`/`stroke-opacity` (dijepit 0..1, angka dinormalkan) → `svg[...]`.
    - `paint-order`/`shape-rendering` yang lolos `SVG_ATTR_PATTERNS` → `svg[...]`.
    - `opacity` elemen × leluhur → `opacity` node (bila < 1).
  - **Atribut tanpa efek:** atribut stroke-* hasil warisan pada path tanpa stroke dan fill-rule/fill-opacity warisan pada path tanpa fill tidak disalin. Atribut yang ditulis langsung pada elemen tetap disalin.
  - **Struktur hasil:** tepat satu path tanpa offset → node `path` (nama dari `inkscape:label`/`id`/`<title>`, lalu opsi `name`/judul akar/`SVG`). Selain itu → `frame` (tanpa `layout`, ukuran SVG, nama dari opsi `name` → `<title>` akar → `id` akar → `SVG`) berisi path urut dokumen (nama `inkscape:label`/`id`/`<title>`/`Path N`). Nama dipotong 120 karakter.
  - **Dibuang dan dilaporkan** (`dropped: {kind, name, count}[]`, urut kemunculan pertama):
    - elemen `element`: `<mask>`, `<clipPath>`, `<filter>`, `<linearGradient>`, `<radialGradient>`, `<pattern>`, `<marker>`, `<symbol>`, `<use>`, `<image>`, `<text>`, `<foreignObject>`, `<style>`, `<script>`, `<switch>`, `<svg>` bersarang, dan elemen tak dikenal;
    - atribut `attribute` tanpa padanan, mis. `filter`, `mask`, `clip-path`, `marker-*`, `mix-blend-mode`, `pathLength`, `on*`, dan properti `style` tak dikenal;
    - nilai `value` tak didukung, mis. `fill`/`stroke` `url()`, enum asing, angka di luar batas, satuan %, `d` rusak, dan `preserveAspectRatio` slice.
  - **Diabaikan tanpa laporan:** `id`, `class`, `xmlns*`, `xml:*`, `version`, `baseProfile`, `data-*`, `aria-*`, `role`, `focusable`, atribut ber-prefiks namespace editor (`inkscape:`, `sodipodi:`, `xlink:` di luar `<use>`), atribut geometri, `<title>`/`<desc>`/`<metadata>`, elemen ber-prefiks namespace, serta `display="none"`/`visibility="hidden"` (elemen dilewati).
  - **Laporan `kept`:** nama atribut SVG yang dipetakan, dari daftar tetap: `fill-rule`, `stroke-linecap`, `stroke-linejoin`, `stroke-dasharray`, `stroke-dashoffset`, `stroke-miterlimit`, `fill-opacity`, `stroke-opacity`, `paint-order`, `shape-rendering`, `opacity`, `transform`.
- **Commit:** importer → op `add` berantai (`ref` akar, anak `parentId:'@root'`) → `transact` + `applyOps` di bawah `docLocks` slug → `store.commit`. Satu paste = satu rev = satu entri riwayat. Deskripsi `Paste SVG` atau `description` klien (1–200).
  - **Parent** = ID board atau frame (bukan instance/isi instance). Parent lain → `SCHEMA_INVALID`; ID tak ada → `NOT_FOUND`.
  - **Posisi:** di board atau frame `layout:'none'`, akar mendapat `position:'absolute'` + `x`/`y` (dari body, atau ditengahkan bila parent berukuran angka, selain itu 0,0, dibulatkan). Di parent flow, akar ditambahkan tanpa x/y.
- **Route viewer** `POST /viewer/docs/:slug/paste`, body `{kind?:'svg', content, parentId, x?, y?, name?, description?}`:
  - Respons `{slug, rev, created, inverse, refs, nodeId, report:{kind:'svg', paths, kept, dropped}}`.
  - Riwayat dicatat dengan sesi/klien `lakar-viewer` dan event `change` `edit` (dengan `origin`).
  - Guard Origin yang sudah ada berlaku (lintas-origin → 403).
- **Route sesi** `POST /viewer/paste` (header sesi, dokumen aktif), body sama tanpa slug:
  - Respons `{docId, slug, rev, created, nodeId, report}`.
  - Riwayat memakai `sessionId` dan `client` sesi.
  - `TOOL_ROUTES['/viewer/paste'] = 'paste'`, sehingga Activity mencatat rev dan created, dan viewer memuat ulang lewat `revChange`.
- **Batas:** `content` maks 1.000.000 karakter (body route 8 MiB). Path maks `OPS_MAX − 1`; lebih dari itu → `SCHEMA_INVALID`.
- **Tool MCP** `paste` (`{content, parentId, x?, y?, name?, description?, kind?}`) → `/viewer/paste`. Deskripsi tool menyebut pemetaan dan laporan; hasilnya teks JSON.
- **Viewer** (C6, desain G0vf1/nE6dL, Toast r69qO, Paste Report w2am0):
  - Event `paste` di jendela, bukan saat mengetik atau saat dialog/menu terbuka, dokumen bisa diedit. Sumbernya file `image/svg+xml`/`.svg` (nama file tanpa ekstensi menjadi `name`) atau `text/plain` yang diawali `<svg`/`<?xml` (sesudah spasi/komentar).
  - **Target** (fungsi murni): node terpilih terakhir. Bila board atau frame non-instance, node itu sendiri; bila bukan, kontainer leluhur terdekat. Alamat isi instance diganti instance terluarnya. Tanpa seleksi → toast "Select a board or frame to paste into.".
  - **Sukses:** invers masuk tumpukan undo dengan label `Paste SVG`, dokumen dimuat ulang, node baru dipilih, toast paste muncul.
    - Judul "Pasted SVG as N path(s)".
    - Deskripsi "Kept … ." (label: fill-rule, stroke caps, joins, dashes, dash offsets, miter limits, fill opacity, stroke opacity, paint order, shape rendering, opacity, transforms; digabung "a, b and c") ditambah "Not imported: x, <y> (no matching property)." bila ada yang dibuang. Tanpa keduanya → "All attributes kept.".
    - Aksi "Undo paste" (undo hanya bila entri paste masih teratas), "Details", dan tutup.
    - Ikon `file-code` di wadah success-soft. Hilang sendiri sesudah 6 detik (berhenti saat di-hover).
  - **Details** membuka Paste Report:
    - header ikon `clipboard-check`, judul sama, deskripsi "N path(s) in “Nama” · 1 change in History";
    - "Not imported (n)" berisi baris per item: ikon `code`/`paintbrush`, teks "count × <el>" atau nama, dan alasan "No matching Lakar property" (element/attribute) atau "Value not supported";
    - aksi Undo paste, Copy report, dan petunjuk Ctrl+Z.
  - **Gagal:** toast error yang sudah ada (`failureText`).

**Never:**
- Menyimpan SVG mentah, `transform`, atau atribut di luar allowlist di dokumen. Importer HTML (story 4). Pen tool atau edit titik (story 5). Mengubah skema, route, tool, atau respons lama. Membuka `EventSource` baru. Viewer tidak mengimpor `@lakar/core`. Render/check di route paste.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Korpus ikon | `tests/fixtures/svg/ikon-vektor/*.svg` | node sama dengan frame fixture v6 `ikon-vektor` (kecuali id/nama); `vectorToSvg` hasilnya memuat ulang setiap atribut efektif sumber dan `d` identik | - |
| Satu path | `<svg viewBox="0 0 24 24"><path d="M0 0h24v24z"/></svg>` | node `path` 24×24, fill `#000000`, paths 1 | - |
| Bentuk dasar | rect rx, circle, ellipse, line, polyline, polygon | `d` setara, `kept` kosong | - |
| Transform | `<g transform="translate(2 2) scale(2)"><path d="M0 0L5 0" stroke="red" stroke-width="1"/></g>` | `d` `M2 2L12 2`, stroke width × 2 × skala px, `kept` memuat `transform` | - |
| rotate + arc | `rotate(90 12 12)` pada path ber-arc | arc menjadi kubik terotasi | - |
| Style + warisan | `style="stroke:#f00;stroke-width:2"` di `<g>`, `currentColor` + `color` | stroke dari style, warna dari `color` | - |
| Dibuang | `filter="url(#f)"`, `<mask>`, `<text>`, `fill="url(#g)"`, `stroke-linejoin="arcs"` | `dropped` attribute filter, element `<mask>`, element `<text>`, value `fill`, value `stroke-linejoin`, count benar | - |
| Bukan SVG / rusak | `hello`, `<svg><path d=</svg>`, `<svg></svg>` | tidak ada commit | 400 `SCHEMA_INVALID` (pesan menyebut alasan) |
| Parent salah | ID text/instance, ID tak ada | tidak ada commit | 400 `SCHEMA_INVALID` / 404 `NOT_FOUND` |
| Satu rev + undo | paste di board | rev+1, satu entri riwayat; `inverse` dikirim ke `/ops` mengembalikan dokumen | - |
| Lintas-origin | header `origin: https://evil.example` | tidak ada commit | 403 |
| MCP | `paste` di sesi dengan dokumen aktif | node sama dengan route viewer untuk input yang sama; Activity `paste` membawa rev | tanpa dokumen aktif → `NO_ACTIVE_DOC` |
| Terlalu besar | > 1.000.000 karakter atau > 999 path | tidak ada commit | 400 `SCHEMA_INVALID` |
| Viewer tanpa seleksi | Ctrl+V teks SVG | tidak ada permintaan | toast "Select a board or frame to paste into." |

</intent-contract>

## Code Map

- `packages/render/src/path-data.ts` (baru) + `index.ts` -- parser/serializer `d` murni (absolut, H/V/S/T dinormalkan), arc → kubik, transform afin, kotak batas. Dipakai importer, dan editor titik story 5 nanti (viewer boleh bergantung pada render).
- `packages/daemon/src/paste/xml.ts` (baru) -- pengurai XML minimal.
- `packages/daemon/src/paste/svg.ts` (baru) -- `importSvg`: warna, transform, pewarisan, bentuk → path, pemetaan, laporan.
- `packages/daemon/src/paste.ts` (baru) -- `pasteOps` (NodeInput → op `add`), `registerPasteRoutes` (dua route, commit bersama).
- `packages/daemon/src/server.ts` -- daftarkan route paste (docs, store, docLocks, activity, sessions).
- `packages/daemon/src/events.ts` -- `TOOL_ROUTES` `/viewer/paste`, `finish` `paste` (created, boards).
- `packages/mcp/src/server.ts` -- tool `paste` + `PASTE_DESCRIPTION`; komentar daftar tool.
- `packages/viewer/src/paste.ts` (baru) -- murni: deteksi SVG di clipboard, target parent, teks toast/report.
- `packages/viewer/src/PasteToast.tsx` (baru) -- toast + Paste Report.
- `packages/viewer/src/api.ts` -- `paste(slug, body)` lewat `#write`.
- `packages/viewer/src/Viewer.tsx` -- listener `paste`, commit, tumpukan undo, seleksi, toast.
- `packages/viewer/src/activity.ts` -- `callTitle` `paste` ("Paste SVG").
- `packages/viewer/src/icons.tsx`, `app.css` -- ikon `fileCode`, `clipboardCheck`, `code`, `paintbrush`, `triangleAlert` bila belum ada; gaya toast/report.
- `packages/skills/skills/api.md` / `packages/exec/src/api.ts` -- tidak berubah (tool baru didokumentasikan di deskripsi tool).

## Tasks & Acceptance

**Execution:**
- `packages/render/src/path-data.ts` -- buat `parsePath`, `serializePath`, `transformPath`, `pathBounds`, `arcToCubics`, tipe `Matrix`, `multiply`, `IDENTITY`; ekspor dari `index.ts` -- satu parser `d` (AD-14).
- `packages/render/src/path-data.test.ts` -- uji parse semua perintah (relatif, implisit, angka rapat `1.5.5`, eksponen), round trip, transform, arc → kubik (titik ujung), dan error.
- `packages/daemon/src/paste/xml.ts` + `xml.test.ts` -- pengurai dan tes (entitas, komentar, CDATA, rusak → error).
- `packages/daemon/src/paste/svg.ts` + `svg.test.ts` -- importer dan matriks I/O di level importer, termasuk korpus vs fixture v6 dan round trip `vectorToSvg`.
- `packages/daemon/src/paste.ts` + `paste.test.ts` -- route: satu rev, riwayat, undo lewat `/ops`, posisi, parent salah, 403, event `change`, route sesi + `NO_ACTIVE_DOC`, Activity `paste`, batas.
- `packages/daemon/src/server.ts`, `events.ts` -- pendaftaran dan Activity.
- `packages/mcp/src/server.ts` (+ tes mcp yang menghitung tool bila ada) -- tool `paste`.
- `packages/viewer/src/paste.ts` + `paste.test.ts` -- deteksi, target, teks.
- `packages/viewer/src/PasteToast.tsx`, `Viewer.tsx`, `api.ts` (+ `api.test.ts`), `activity.ts`, `icons.tsx`, `app.css` -- UI.

**Acceptance Criteria:**
- Given setiap SVG korpus ikon-vektor, when di-paste lewat route viewer dan lewat tool `paste` ke board kosong, then kedua layer identik (kecuali id) dan sama dengan frame fixture v6 (kecuali id/nama). Dan when `vectorToSvg` dijalankan pada hasilnya, then setiap atribut efektif sumber muncul dengan nilai sama dan `d` identik.
- Given paste sukses dari viewer, when respons `inverse` dikirim ke `/viewer/docs/:slug/ops`, then dokumen kembali seperti sebelum paste.
- Given viewer dengan frame terpilih, when pengguna menekan Ctrl+V dengan teks SVG, then layer muncul di frame itu, terpilih, toast "Pasted SVG as N paths" tampil, dan Ctrl+Z atau "Undo paste" menghapusnya (smoke msedge).

## Spec Change Log

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 38 findings — high 0, medium 7, low 27, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) Nesting `<g>` yang dalam meluapkan stack di `walk`/`textOf`, sehingga route mengembalikan 500. Benar. Patch:
    - `walk` membawa `depth` dan melempar `SvgImportError` (400) bila melewati `SVG_DEPTH_MAX` = 256;
    - `textOf` hanya membaca teks langsung (tanpa rekursi);
    - tes 100.000 tingkat dan 255 tingkat.
  - `[medium]` `[patch]` (blind) Tokenizer `d` kuadratik karena `NUMBER.exec(d.slice(i))`. Benar. Patch: regex sticky + `lastIndex` di `path-data.ts`; tes `d` ≈1 MB diurai < 2 dtk.
  - `[low]` `[reject]` (blind) Batas `OPS_MAX − 1` baru dicek sesudah impor penuh. Sesudah dua patch di atas, biaya impor linear terhadap `content` yang sudah dibatasi 1 MB. Pemeriksaan dini menambah cabang di `walk`.
  - `[low]` `[patch]` (blind) Tanpa viewBox dengan satu ukuran saja, isi digeser dan diskalakan dari kotak bentuk. Benar. Patch: satuan user = px dari 0,0, yaitu `vb = [0, 0, width ?? tepi kanan, height ?? tepi bawah]`; tes.
  - `[low]` `[patch]` (blind) `width`/`height` akar dengan satuan tak didukung tidak dilaporkan. Benar (spec: satuan % dilaporkan). Patch: drop `value` `width`/`height`; tes `100%`/`2em`.
  - `[medium]` `[patch]` (blind) `dropped.count` menggelembung untuk nilai warisan: satu `<g fill="url()">` dengan 10 anak dihitung 10. Benar (V3 "count benar"). Patch:
    - nilai gaya membawa `src` (nomor elemen penulis);
    - `Report.dropFrom` melaporkan sekali per elemen sumber;
    - tes `<g>` 3 anak dihitung 1, ditambah satu path sendiri, total 2.
  - `[low]` `[patch]` (blind) Nama frame akar memakai `id` sebelum `<title>`, berlawanan dengan spec. Benar. Patch: `ownName(root, true)` memakai `<title>` lalu `id`; tes.
  - `[low]` `[intent_gap]` (blind) `name` eksplisit diabaikan untuk SVG satu path yang punya `id`. Benar. Bertentangan dengan deskripsi tool ("nama layer akar") dan dengan nama file di viewer. Keputusan (delegasi pemilik, konsisten dengan kontrak tool): `name` eksplisit selalu menamai layer akar, termasuk path tunggal. Patch di `importSvg`; tes.
  - `[low]` `[patch]` (blind) JSDoc `OpsResult` di `api.ts` tertimpa tipe paste. Benar. Patch: `PasteBody`/`PasteResult` dipindah ke bawah `OpsResult`.
  - `[low]` `[reject]` (blind) `PasteReport` didefinisikan dua kali (daemon dan viewer). Viewer tidak boleh bergantung pada daemon (AD-17). Nilai `kept` baru jatuh ke label mentah (`KEPT_LABELS[k] ?? k`) tanpa rusak. Memindahkan tipe ke schema adalah permukaan publik baru.
  - `[low]` `[patch]` (blind) Paste ditelan diam-diam saat tulis lain berjalan. Benar (`preventDefault` lalu `return`). Patch: toast "Another edit is still saving. Paste again in a moment."
  - `[low]` `[reject]` (blind) Paste berulang menumpuk di tengah parent. Perilaku yang diputuskan (tengah parent). Offset bertingkat butuh state posisi baru.
  - `[low]` `[patch]` (blind) `svgFromText` menerima dokumen `<?xml` yang tidak berakar svg (XHTML dengan SVG inline). Benar. Patch: lewati komentar, PI, dan DOCTYPE, lalu wajibkan `^<svg`; tes XHTML dan DOCTYPE.
  - `[low]` `[patch]` (blind) Paste Report ber-`role="dialog"` tanpa manajemen fokus, dan shortcut `Ctrl+Z` juga di macOS. Benar. Patch:
    - `role="region"` (report non-modal di atas canvas, tanpa jebakan fokus);
    - `⌘Z` di Mac (pola `IS_MAC` yang sudah ada).

    "1 change in History" selalu benar karena satu paste = satu rev.
  - `[low]` `[patch]` (blind) Komentar "and N more" tidak sesuai keluaran, dan alasan campuran memakai bentuk tunggal. Benar. Patch: komentar diperbaiki, teks menjadi "unsupported values".
  - `[low]` `[reject]` (blind) `styleDecls` memecah `;` di dalam `url("data:…;base64")`. Jarang di SVG paste. Pengurai sadar kutip menambah logika. Akibatnya hanya laporan atribut palsu; tidak merusak.
  - `[low]` `[reject]` (blind) Opacity `<g>` yang dikalikan ke anak bertumpuk hanya pendekatan. Dicatat di Design Notes. Grup beropasitas dengan anak bertumpuk jarang di ikon. Padanan persis butuh frame bersarang ber-opacity, dan itu tidak diekspor `vectorToSvg` (story 2).
  - `[low]` `[reject]` (blind) Spec melenceng: `boards` di respons sesi, `triangleAlert`, status frontmatter. Perbaikannya mengedit spec build ini.
  - `[low]` `[patch]` (blind) Celah cakupan tes. Patch tes:
    - `<a>`, akar `svg:`, `<svg>` bersarang;
    - fallback `url() currentColor`;
    - slice, xMin, xMax;
    - kedalaman;
    - satuan akar;
    - transform pada ekspor ulang;
    - klasifikasi clipboard dan `canUndoPaste`.

    Klaim kelonggaran XML (`&#0;`, atribut tanpa spasi) ditolak: menerima input longgar tidak merugikan, dan importer tetap memvalidasi isinya.
  - `[medium]` `[patch]` (edge) Nesting dalam menyebabkan RangeError dan 500. Satu akar dengan baris blind pertama; patch yang sama.
  - `[low]` `[patch]` (edge) Angka `1e999` menjadi Infinity di width/viewBox/points/d. Benar. Patch:
    - `length`, `numbers`, dan `opacity` menolak nilai non-finite;
    - `tokenize` melempar `PathDataError`;
    - tes.
  - `[low]` `[patch]` (edge) Jumlah `points` ganjil membuang koordinat terakhir diam-diam. Benar. Patch: drop `value` `points`; tes.
  - `[low]` `[patch]` (edge) Fallback `url(#g) currentColor` menjadi none. Benar. Patch: fallback `currentColor` memakai `color`; tes.
  - `[low]` `[patch]` (edge) Alpha 0.999 menghasilkan `#RRGGBBFF`. Benar. Patch: alpha yang dibulatkan ke 255 menjadi 6 digit; tes.
  - `[low]` `[patch]` (edge) Paste ditelan saat ada edit berjalan. Satu akar dengan baris blind; patch yang sama.
  - `[low]` `[patch]` (edge) "Undo paste" saat edit berjalan menutup toast tanpa pesan. Benar. Patch: toast "Couldn't undo the paste while another edit is saving. Try again in a moment."
  - `[low]` `[reject]` (edge) Sesudah Ctrl+Z lalu redo, entri baru tidak sama identitasnya sehingga "Undo paste" ditolak. Hanya bila undo/redo keyboard terjadi selama 6 dtk toast tampil. Pesan penolakan tetap jujur, dan Ctrl+Z tetap bekerja. Penandaan entri menambah state.
  - `[low]` `[patch]` (edge) `<?xml` non-SVG dibajak paste. Satu akar dengan baris blind; patch yang sama.
  - `[low]` `[patch]` (edge) `vector-effect` selain `non-scaling-stroke`/`none` tidak dilaporkan. Benar. Patch: drop `value` `vector-effect`; tes `non-rotation`.
  - `[medium]` `[patch]` (vgap) Alur Ctrl+V viewer (pilihan clipboard, guard "Undo paste") tanpa verifikasi otomatis. Patch:
    - keputusan diekstrak ke `clipboardSvg` dan `canUndoPaste` (murni, `paste.ts`) dan dites di `paste.test.ts`;
    - `Viewer.tsx` memakai keduanya;
    - wiring sisanya diverifikasi ulang lewat smoke msedge.
  - `[medium]` `[patch]` (vgap) Perataan preserveAspectRatio xMin/xMax dan laporan slice tidak dites. Tes baru menemukan bug nyata: xMinYMin pada kotak tak sebanding meregangkan path ke seluruh SVG, karena kotak dianggap penuh bila offset 0. Patch:
    - kotak penuh hanya bila ukuran meet = ukuran SVG;
    - path tunggal hanya bila kotak penuh;
    - slice dan nilai rusak dilaporkan sekali;
    - tes xMin, xMax, slice, dan `foo`.
  - `[false]` `[reject]` (intent) Route kedua `/viewer/paste` bertentangan dengan route tunggal di ticket. AD-15 menuntut importer yang sama, dan `commitPaste` dipakai keduanya. Route sesi mengikuti pola tool `export_code` (dokumen aktif, Activity). Guard Origin global (`server.ts`) berlaku untuk semua POST `/viewer/*`; kini dites juga di `/viewer/paste` (403).
  - `[low]` `[patch]` (intent) Layer identik lintas pintu hanya dites untuk `lonceng.svg`. Benar. Patch: tes route mengulang perbandingan untuk `cincin`, `zigzag`, dan varian ber-transform (layer dan laporan identik).
  - `[low]` `[patch]` (intent) Transform tidak masuk uji ekspor ulang. Benar. Patch: tes `zigzag` dalam `<g rotate(90 12 12)>`. Atribut efektif sumber utuh sesudah `vectorToSvg`, dan `d` sama dengan transform yang dipanggang.
  - `[false]` `[reject]` (intent) `transform` tidak diekspor ulang sebagai atribut (F2). AD-14 menetapkan `d` sebagai format simpan, dan allowlist `svg` story 2 sengaja tanpa `transform` (AD-1: tanpa string bebas). Tampilan dipertahankan dengan memanggang ke `d`, dan tes ekspor ulang membuktikan atribut lain utuh.
  - `[medium]` `[patch]` (intent) Undo viewer (tumpukan, "Undo paste") tanpa tes otomatis. Satu akar dengan baris vgap pertama; patch yang sama. Agen tidak memakai tumpukan undo (AD-8), jadi route sesi tanpa `inverse` memang disengaja.
  - `[false]` `[reject]` (intent) Akurasi laporan hanya dites di level importer. Route meneruskan `imported.dropped` apa adanya (`commitPaste`), dan tampilan toast/report sesuai desain diverifikasi smoke msedge dengan screenshot.
  - `[false]` `[reject]` (intent) Ctrl+V juga menerima file dan naik ke kontainer leluhur. Ini perluasan yang tidak bertentangan: ticket tetap terpenuhi (teks SVG ke board/frame terpilih), dan prompt orkestrator meminta "Ctrl+V with SVG text/file".

## Design Notes

- **Satu path → node path, multi → frame:** AD-14 hanya menetapkan multi-path → frame. Ikon satu path tidak perlu dibungkus, dan `vectorToSvg` mendukung keduanya.
- **Transform dipanggang:** allowlist `svg` sengaja tidak memuat `transform` (story 2). Memanggang transform ke `d` mempertahankan tampilan, dan `kept` melaporkan `transform`. Stroke Lakar non-scaling, jadi skala anisotropik didekati dengan √|det|. Opacity `<g>` dikalikan ke anak (persis untuk anak tunggal atau anak yang tidak bertumpuk).
- **Atribut warisan tanpa efek tidak disalin:** fixture v6 (sumber kebenaran "layer identik") tidak memberi cap/join pada path `stroke="none"`. Atribut milik elemen sendiri tetap disalin.
- **Lokasi parser `d`:** `@lakar/render` itu murni dan sudah dipakai viewer, sehingga editor titik (story 5) bisa memakainya tanpa melanggar AD-17. Pengurai XML dan pemetaan tetap di daemon (AD-15).
- **Dua route:** route viewer per slug dengan guard Origin dan `inverse` untuk tumpukan undo jendela (AD-8). Route sesi untuk MCP mengikuti pola `export_code`, yaitu dokumen aktif dan tercatat di Activity. Keduanya memanggil fungsi commit yang sama.
- **Target paste tanpa seleksi:** desain menampilkan paste ke node terpilih. Path tidak boleh di halaman, dan menebak board bisa salah, jadi tanpa seleksi ditolak dengan toast.
- **Nama file `path-data.ts`:** harness render dan halaman Chromium daemon hanya menyajikan `/render/[a-z0-9-]+.js`, jadi nama modul render memakai huruf kecil dan tanda hubung.
- **Gradien `url()` tanpa fallback menjadi tanpa fill**, dan dilaporkan sebagai `value fill`. Fallback warna (`url(#g) red`) dipakai bila ada. Gradien SVG `objectBoundingBox` tidak setara dengan fill gradien CSS (lihat story 2).
- **Toast dan report memakai kelas `.undo-skipped`** (komponen Toast r69qO yang sama). Ikon diberi varian success, `color-mix` 15%, setara `#22C55E26` di desain. Report berada di posisi yang sama dengan toast (bawah tengah canvas), karena desain tidak menetapkan jangkar.
- **`name` eksplisit selalu menamai layer akar** (keputusan triage, delegasi pemilik): ini juga berlaku untuk path tunggal yang punya `id`. Alasannya, nama file di viewer dan argumen `name` tool lebih bermakna daripada `id` hasil ekspor (`path1`).
- **Report SVG:** komponen w2am0 didesain untuk HTML. Untuk SVG, baris memakai ikon `code` (elemen) dan `paintbrush` (atribut/nilai), dan deskripsi menyebut jumlah path dan nama layer.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 exec vitest run packages/render/src/path-data.test.ts packages/daemon/src/paste packages/daemon/src/paste.test.ts packages/viewer/src/paste.test.ts packages/viewer/src/api.test.ts packages/mcp tests/dependency-direction.test.ts` -- expected: hijau.
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`.

**Manual checks:**
- Smoke msedge: daemon lokal, dokumen dengan board terpilih, `paste` event berisi SVG korpus → layer frame + 2–3 path, toast sesuai desain, Details membuka report, Undo paste menghapus layer.

## Auto Run Result

**Ringkasan:** satu importer SVG murni di daemon (AD-15) dipakai dua pintu.
- **Pemetaan (AD-14):** SVG menjadi node `path`, atau `frame` berisi path. Atribut presentasi menjadi properti bertipe atau allowlist `svg`. Transform dipanggang ke `d`. Sisanya dibuang dan dilaporkan sebagai `element`/`attribute`/`value` dengan jumlah per elemen sumber.
- **Commit:** lewat op core `add` berantai (AD-2): satu paste = satu rev.
- **Route viewer** `POST /viewer/docs/:slug/paste`: guard Origin, respons membawa `inverse`.
- **Route sesi** `POST /viewer/paste`: dipakai tool MCP baru `paste`, tercatat di Activity.
- **Viewer:** Ctrl+V dengan teks atau file SVG menyisip layer ke board/frame terpilih dan memilihnya. Invers masuk tumpukan undo. Toast r69qO tampil dengan Undo paste dan Details, yang membuka Paste Report w2am0.

**File berubah:**
- `packages/daemon/src/paste/xml.ts`, `colors.ts`, `svg.ts` (baru) -- pengurai XML, warna CSS, dan importer SVG (pemetaan, transform, warisan, laporan).
- `packages/daemon/src/paste.ts` (baru) -- `pasteOps`, `commitPaste`, dua route paste.
- `packages/daemon/src/server.ts`, `events.ts` -- pendaftaran route; Activity `paste` (target, created, boards).
- `packages/render/src/path-data.ts` (baru), `index.ts` -- parser/serializer `d`, arc → kubik, transform afin, kotak batas.
- `packages/mcp/src/server.ts`, `index.ts` -- tool `paste` + `PASTE_DESCRIPTION`.
- `packages/viewer/src/paste.ts` (baru) -- deteksi clipboard (`clipboardSvg`), target, `canUndoPaste`, teks toast/report.
- `packages/viewer/src/PasteToast.tsx` (baru) -- toast dan report.
- `packages/viewer/src/Viewer.tsx`, `api.ts`, `activity.ts`, `icons.tsx`, `app.css` -- listener paste, klien `paste`, judul Activity, ikon, gaya.
- Tes:
  - `packages/daemon/src/paste/{xml,svg}.test.ts`, `packages/daemon/src/paste.test.ts`, `packages/render/src/path-data.test.ts`;
  - `packages/viewer/src/paste.test.ts`, `api.test.ts`, `activity.test.ts`;
  - `packages/mcp/src/index.test.ts`.

**Temuan review:** 38 (high 0, medium 7, low 27, false 4).
- **Patch** (medium 5 entri, low 19 baris):
  - medium: batas kedalaman (stack overflow → 400); tokenizer `d` linear; jumlah laporan per elemen sumber; ekstraksi dan tes `clipboardSvg`/`canUndoPaste`; bug perataan preserveAspectRatio xMin (path diregangkan) + laporan slice.
  - low:
    - viewBox dengan satu ukuran;
    - satuan akar dilaporkan;
    - urutan nama akar;
    - `name` eksplisit menamai path tunggal (keputusan intent_gap);
    - JSDoc `api.ts`;
    - toast saat paste/undo bentrok dengan tulis lain;
    - `svgFromText` mewajibkan akar `<svg>`;
    - report `role="region"` + `⌘Z`;
    - teks ringkasan;
    - angka non-finite;
    - `points` ganjil;
    - fallback `currentColor`;
    - alpha ≈ 1;
    - `vector-effect` lain dilaporkan;
    - tes lintas pintu untuk semua korpus + transform, tes 403 route sesi, tes celah cakupan.
- **Ditunda:** tidak ada.
- **Ditolak** (alasan di triage log):
  - pemeriksaan batas dini (biaya linear terhadap `content` yang dibatasi);
  - tipe `PasteReport` ganda (AD-17, fallback label aman);
  - posisi paste bertingkat (butuh state baru);
  - `style` dengan `;` dalam `url()` (jarang, laporan saja);
  - opacity grup bertumpuk (pendekatan tercatat);
  - drift spec (perbaikannya mengedit spec);
  - kelonggaran XML;
  - identitas entri sesudah redo (jarang, pesan jujur);
  - 4 temuan `false` (route kedua, transform F1, laporan di route, perluasan Ctrl+V).

**Rekomendasi review lanjutan:** `false`.
- Pass ini mem-patch 5 entri medium, sehingga perhitungan awalnya `true`.
- Risiko yang bisa disebut adalah perilaku UI viewer sesudah refactor listener dan guard undo. Smoke msedge diulang pada kode yang sudah dipatch dan lulus:
  - teks biasa tidak di-`preventDefault`;
  - file `ring.svg` menjadi frame "ring" berisi 2 path, dengan toast dan report sesuai desain;
  - Undo paste mengembalikan isi;
  - paste teks lalu Ctrl+Z menghapus layer;
  - tanpa page error.
- Patch daemon tertutup tes unit dan route.

**Verifikasi:**
- `pnpm build` sukses; `tsc -p tsconfig.test.json` bersih.
- Tes terarah (paste daemon, path-data, viewer paste/api/activity, mcp, dependency-direction) hijau.
- `pnpm test` penuh: 53 tes gagal, semuanya ada di `%TEMP%\lakar-fail-base.txt` (0 kegagalan baru). Snapshot bench yang berubah CRLF saja dikembalikan.
- Smoke msedge Fase A dan ulang sesudah patch (daemon lokal, data dir sementara, dibersihkan).

**Risiko sisa:**
- Stroke anisotropik didekati dengan √|det|, dan opacity `<g>` dikalikan ke anak.
- Gradien `url()` tanpa fallback menjadi tanpa fill (dilaporkan).
- `slice` diperlakukan seperti meet (dilaporkan).
- Paste tanpa seleksi ditolak dengan toast.
