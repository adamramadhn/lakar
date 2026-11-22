---
title: 'Importer paste HTML lewat Chromium terisolasi, tag semantik skema v7, dan Ctrl+V text/html di viewer (epic paste-vektor story 4)'
type: 'feature'
created: '2026-11-23'
status: 'done'
baseline_revision: '76ac9cb5c552b53120b1bc0dca30728b1995c94b'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-vektor-3-svg-import.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Wiring viewer paste HTML (Ctrl+V text/html → body kind html, report langsung terbuka, Pasted Tag) tanpa tes otomatis.
    evidence: |-
      Review v4 (vgap). Hanya clipboardPaste dan teks report yang dites murni; Viewer.tsx pasteContent, PasteToast, dan pastedTag diverifikasi smoke msedge (viewer belum punya harness DOM, pola sama dengan story 3).
    location: >-
      packages/viewer/src/Viewer.tsx (pasteContent)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Story 3 hanya mengimpor SVG. Potongan HTML (kartu, navbar, grid harga) belum bisa dibawa ke canvas sebagai layer, padahal R6 meminta struktur dan gayanya terjaga. Selain itu, skema belum punya `tag` semantik (AD-1), sehingga `nav`/`h1`/`button` hilang saat ekspor kode (deferred spec-kode-2).

**Approach:** Importer paste yang sama (AD-15) menerima `kind:'html'`.
- **Isolasi.** Daemon merender HTML di context Chromium baru dengan JavaScript mati dan semua permintaan jaringan diblokir (hanya dokumen dan font Lakar yang dilayani dari origin internal).
- **Snapshot.** Skrip milik daemon (bukan skrip halaman) membaca pohon DOM, kotak, computed style, dan nilai grid tertulis menjadi snapshot JSON.
- **Pemetaan.** Modul murni memetakan snapshot ke `NodeInput` lewat tabel kebalikan `css.ts` (`css-reverse.ts`, AD-5). Snapshot dibuang sesudahnya; HTML/CSS mentah tidak disimpan.
- **Skema v7.** Menambah `tag` opsional dari allowlist pada frame dan text. Codegen memakainya sebagai nama elemen.
- **Viewer.** Ctrl+V dengan `text/html` (bila teks bukan SVG) memanggil route paste yang sama dan membuka Paste Report desain rkIyP/GXHxW dengan label "Pasted · nama" di canvas.

## Boundaries & Constraints

**Always:**
- **Skema v7 (AD-3, AD-1):**
  - `SCHEMA_VERSION` 7 dan `MIGRATIONS[6]` identitas.
  - `HTML_TAGS` = `header nav main section article aside footer figure figcaption blockquote ul ol li h1 h2 h3 h4 h5 h6 p button a`.
  - `tag: z.enum(HTML_TAGS).optional()` pada `frameShape` dan `textShape`. Kunci ini otomatis bisa di-override.
  - Korpus `tests/fixtures/docs/v7/html-paste.lakar.json` berisi hasil impor tiga sampel, plus golden codegen v7.
  - Tes yang menyebut versi 6 sebagai versi terkini diperbarui.
- **Render dan codegen (AD-5, AD-16):**
  - Render canvas mengabaikan `tag`.
  - Codegen menulis `tag ?? 'div'`, didahului `tagResetDecls(tag)` dari `css.ts`:
    - `ul`/`ol`: `list-style:none`, `padding:0`;
    - `li`: `list-style:none`;
    - `button`: `background:none`, `border:0`, `padding:0`, `font:inherit`, `color:inherit`, `text-align:inherit`;
    - `a`: `color:inherit`, `text-decoration:none`.
  - Deklarasi node menimpa reset itu (merge, yang terakhir menang).
- **Isolasi (AD-15):** `snapshotHtml(browser, html, {width, fonts})` di `paste/html-page.ts`.
  - Context baru `javaScriptEnabled:false`, viewport `width`×800, DPR 1. `context.route('**/*')` hanya melayani:
    - `http://paste.lakar.invalid/`, sekali (dokumen = prefix + HTML pengguna);
    - `/fonts/<id>/<file>` (via `FontRegistry.filePath`).
  - Permintaan lain di-`abort` dan dicatat per `resourceType`: `image` → `external image`, `stylesheet` → `external stylesheet`, `font` → `external font`, lainnya → `network request`.
  - Prefix: `<!doctype html><meta charset="utf-8">` + `<style>` berisi `@font-face` semua face terdaftar + `html,body{margin:0;padding:0}` + `:root{font-family:Inter}`. Font yang tidak disebut berarti default Lakar.
  - Sesudah `load` dan `document.fonts.ready`, satu `page.evaluate` skrip daemon menghasilkan snapshot. Context selalu ditutup.
  - Dipanggil lewat `ChromiumRenderer.snapshotHtml`, di dalam sewa pool sehingga batas waktu dan antrean sama dengan render.
- **Snapshot** (JSON, ≤ 5000 elemen, kedalaman ≤ 256):
  - Elemen terlihat: tag, `id`/kelas pertama/`aria-label`, kotak dokumen, subset computed style (display, position, flex, grid, padding, border, radius, background, shadow, opacity, blend, filter, transform, overflow, margin, font, teks, ukuran min/max), dan nilai tertulis `width`, `height`, `flex-basis`, `grid-template-columns`, `grid-template-rows` (style inline, lalu aturan stylesheet yang cocok dengan spesifisitas tertinggi; urutan dokumen sebagai pemecah seri).
  - Kandidat teks: elemen yang hanya berisi teks, `<br>`, dan elemen inline tanpa kotak. Disertai `innerText`, jumlah baris, dan tag inline yang gaya teksnya berbeda.
  - Teks anonim: konten dirapatkan, kotak, dan jumlah baris.
  - `<img>`: `src` data URI (raster/SVG); src lain tidak dimuat.
  - `<svg>` inline: XML hasil serialisasi dengan ukuran tampil dan computed `fill`/`stroke`/`stroke-width`/`color` dipanggang ke elemen bentuk.
  - Atribut `on*`, `<script>`, dan elemen yang dibuang dihitung. `display:none` dan `<head>`/`<style>`/`<link>`/`<meta>`/`<template>`/`<title>` dilewati tanpa laporan.
- **Pemetaan** (`importHtml(snapshot, {name?, fonts})`, murni, deterministik):
  - **Akar:** satu elemen anak body menjadi akar. Selain itu body menjadi frame `HTML`. Akar diberi `width` = lebar kotak dan `height` hanya bila tetap atau layout `none`.
  - **Teks:** kandidat teks tanpa kotak → `text`. Kandidat dengan kotak (latar, border, padding, bayangan) → `frame` berisi `text`.
    - `size`, `weight` (dibulatkan ke 100 terdekat yang tersedia), `style`.
    - `family`: famili pertama yang terdaftar. Generik sans → Inter, monospace → JetBrains Mono. Selain itu Inter, dengan laporan `font “X”`. Inter tidak ditulis.
    - `lineHeight` px, `letterSpacing` px/size, `align`, `color` hex, `shadows` dari `text-shadow`, `numeric:'tabular'`.
    - `content` = `innerText` (text-transform ikut).
  - **Kotak:**
    - `fills`: `background-color` di bawah, lalu lapisan `background-image` (urutan CSS dibalik). Lapisan yang dipetakan: `linear-gradient` (sudut, `to <sisi>`, `to <sudut>` dari rasio kotak; stop warna dengan %), `conic-gradient`, dan `url(data:raster)` dengan `background-size` cover/contain → `fit` itu, `100% 100%` → `fill`, `auto` + repeat → `tile`.
    - `stroke`: border solid dengan lebar dan warna sama → `{color, width, align:'inside', sides?}`. Lebar border selalu ditambahkan ke `padding`.
    - `radius`: px; persen dihitung dari kotak.
    - `shadows`: dari `box-shadow`, termasuk inset.
    - Efek: `opacity`; `blend` dari `mix-blend-mode`; `blur` = 2×`blur()`; `backdropBlur`; `rotation` dari matrix rotasi murni; `clip` dari overflow ≠ visible.
  - **Layout:**
    - flex (row/column, nowrap, tanpa margin anak, justify start/center/end/space-between, align normal/stretch/start/center/end) → `layout`, `gap` sumbu utama, `padding`, `align`, `justify`.
    - grid (track tertulis `px|fr|auto|minmax|repeat(n, …)`, selain itu track px terpakai dengan laporan `value grid-template-*`; penempatan anak angka/span; tanpa margin anak; `grid-auto-flow` row) → `layout:'grid'`, template, `columnGap`/`rowGap`.
    - Blok: anak yang menumpuk vertikal rata kiri dengan jarak seragam (±0.5px) → `column`. Padding diturunkan dari kotak, gap = jarak itu.
    - Selain itu `layout:'none'`: anak absolute dengan x/y relatif dan ukuran tetap. Dilaporkan sebagai `layout <alasan>`, kecuali kontainer tanpa anak flow.
    - Anak `position:absolute|fixed` selalu absolute.
  - **Ukuran anak flow:**
    - nilai tertulis panjang/persen → px terpakai (100% sumbu silang → `fill`);
    - `flex-grow>0` di sumbu utama → `fill`;
    - teks yang meregang di kolom → `fill`;
    - teks satu baris → hug;
    - teks multi-baris → lebar px.
    - Selain itu tidak diisi (auto CSS).
  - **Gambar dan vektor:**
    - `<img>` data raster → `rect` + fill image (`object-fit` cover/contain/fill). Byte dikembalikan sebagai aset tertunda (sha256).
    - `<img>` data SVG dan `<svg>` inline → `importSvg` (story 3), lalu diberi ukuran tampil.
    - `<img>` lain → `rect` tanpa fill seukuran kotak (layout terjaga, laporan dari jaringan).
    - `iframe video audio canvas object embed input textarea select` → `rect` dengan paint kotaknya, dilaporkan sebagai elemen.
  - **Nama dan tag:**
    - nama: opsi `name` (akar) → `aria-label` → `id` → kelas pertama (dimanusiakan) → nama tag (`Nav`, `Button`, `Link`, `Frame`, `Image`);
    - teks: konten ≤ 40 karakter;
    - `tag` dari `HTML_TAGS` bila tag sumber ada di allowlist.
  - **Laporan HTML** `{kind:'html', layers, autoLayout, texts, images, vectors, dropped}`. `dropped` (urut kemunculan pertama, count per elemen) memakai jenis:
    - `element` (`<script>`, `<iframe>`, …);
    - `attribute` (`onclick`, …);
    - `request` (dari log jaringan);
    - `property` (CSS tanpa padanan: `text-decoration`, `filter`, `transform`, `outline`, `clip-path`, `mask-image`, `z-index`, `text-overflow`);
    - `value` (nilai tak didukung: `border-style`, `border`, `background-image`, `background-size`, `border-radius`, `mix-blend-mode`, `color`, `grid-template-*`, `position`, `text styles`);
    - `font`;
    - `layout`.
- **Route dan tool (aditif, AD-4):**
  - `PASTE_KINDS` = `svg|html`, default `svg`. Field opsional `width` 1..4096 = lebar viewport HTML. Default: lebar board, lebar frame angka dikurangi padding horizontal, atau 1280.
  - Deskripsi default `Paste HTML`.
  - Aset data URI ditulis (`writeAsset`) sebelum transaksi.
  - Op `add` berantai bersarang: ref akar `paste`, frame dalam `paste-1`, `paste-2`, …. Daun tanpa ref, jadi op SVG tidak berubah.
  - Node > `OPS_MAX` → `SCHEMA_INVALID`.
  - Renderer tanpa `snapshotHtml` → `RENDER_FAILED`. HTML tanpa elemen atau teks terlihat → `SCHEMA_INVALID`.
  - Tool MCP `paste`: `kind` `svg|html`, `width?`, dan deskripsi diperbarui.
- **Viewer (C6; rkIyP/GXHxW, Paste Report w2am0, Pasted Tag):**
  - **Sumber clipboard:** file SVG → teks SVG → `text/html` berisi `<` → selain itu dibiarkan. Target dan guard sama dengan story 3.
  - **Undo:** label `Paste HTML`.
  - **Paste Report** langsung terbuka:
    - judul "Pasted N layer(s) from HTML";
    - deskripsi "<Auto layout, text and 2 images> kept as layers · 1 change in History" (bagian kosong dilewati; semua kosong → "Layers kept");
    - baris "Not imported (n)":
      - elemen "count × <tag>" (ikon `code`), alasan "Scripts never run and are not stored" untuk `<script>` dan `on*`, selain itu "No matching Lakar layer";
      - request "N external image(s)/stylesheet(s)/font(s)/network request(s)" (`imageOff`), alasan "Network is blocked while importing";
      - satu baris gabungan property "a, b" (`paintbrush`), alasan "No matching Lakar property";
      - satu baris gabungan value (`paintbrush`), alasan "Value not supported";
      - satu baris gabungan layout (`paintbrush`), alasan "Kept with fixed positions";
      - font `font “X”` (`type`), alasan "Not installed — replaced with Inter".
  - **Pasted Tag:** label accent "Pasted · nama" (ikon `clipboardPaste`) di bawah kiri kotak node paste, selama report terbuka dan node itu terpilih.
  - **SVG** tidak berubah.

**Never:**
- Menjalankan skrip halaman.
- Mengizinkan permintaan jaringan selain dokumen/font internal.
- Menyimpan HTML, CSS, atau snapshot di dokumen atau riwayat.
- Importer kedua di viewer atau MCP.
- Mengubah route/tool/respons lama selain field opsional baru.
- Kontrol `tag` di panel Design.
- Paste dari Figma.
- Pen tool (story 5).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Kartu | `tests/fixtures/html/kartu.html` (kolom, padding, radius, border, shadow, gambar data URI, h3/p, button) | frame `column` + text bertag + rect image + frame `button`; render board vs HTML sumber selisih piksel < 2% | - |
| Navbar | `navbar.html` (`nav` flex row space-between, logo SVG inline, tautan, tombol) | frame `nav` row `justify:'space-between'`, path/frame SVG, text; piksel < 2% | - |
| Grid harga | `grid-harga.html` (`repeat(3, 1fr)`, gap, kartu bergradien) | frame `grid` `[{fr:1}×3]` + `columnGap`; piksel < 2% | - |
| Skrip dan jaringan | `<script>`, `onerror`, `<img src=http://127.0.0.1:P/x>`, `<link rel=stylesheet href=…>`, `@import`, `background:url(http://…)` | server uji menerima 0 permintaan; DOM tidak berubah; laporan `element <script>`, `attribute onerror`, `request external image/stylesheet` | - |
| Tidak terpetakan | `text-decoration`, `outline`, `transform: skew`, `margin-left:auto` di flex, font Satoshi | `property`, `layout margins`, `font “Satoshi”`; family Inter | - |
| Tanpa elemen | `<!-- x -->`, `   ` | tidak ada commit | 400 `SCHEMA_INVALID` |
| Tanpa Chromium | renderer palsu, `kind:'html'` | tidak ada commit | 503/`RENDER_FAILED` (status dari `STATUS`) |
| SVG lama | body story 3 tanpa `kind` | hasil identik dengan story 3 | - |
| Viewer | Ctrl+V `text/html` dengan frame terpilih | layer di frame, terpilih, report + Pasted Tag; Undo paste menghapus | tanpa seleksi → toast "Select a board or frame to paste into." |

</intent-contract>

## Code Map

- `packages/schema/src/nodes.ts`, `index.ts`, `README.md` -- `SCHEMA_VERSION` 7, `HTML_TAGS`, `tag` di frame/text.
- `packages/core/src/migrate.ts` -- `MIGRATIONS[6]`.
- `packages/render/src/css-reverse.ts` (baru) + `index.ts` -- tabel kebalikan AD-5: warna, panjang, shadow, gradien, radius, align/justify (kebalikan `ALIGN`/`JUSTIFY`), track/penempatan grid, blend, blur, rotasi.
- `packages/render/src/css.ts` -- `tagResetDecls`.
- `packages/codegen/src/tree.ts` -- nama elemen dari `tag` + reset.
- `packages/daemon/src/paste/html-page.ts` (baru) -- isolasi, routing jaringan, skrip snapshot, tipe `HtmlSnapshot`.
- `packages/daemon/src/paste/html.ts` (baru) -- `importHtml` murni dan laporan.
- `packages/daemon/src/paste.ts` -- kind html, `width`, aset, op bersarang, port snapshot.
- `packages/daemon/src/chromium.ts` -- `snapshotHtml` di dalam sewa pool.
- `packages/daemon/src/server.ts` -- meneruskan renderer dan `dataDir` ke route paste.
- `packages/mcp/src/server.ts` -- skema dan deskripsi tool `paste`.
- `packages/exec/src/api.ts`, `packages/skills/skills/api.md` -- satu kalimat `tag`.
- `packages/viewer/src/paste.ts`, `PasteToast.tsx`, `Viewer.tsx`, `api.ts`, `canvasEdit.tsx`/`Canvas.tsx`, `icons.tsx` (`imageOff`, `clipboardPaste`), `app.css` -- clipboard HTML, report HTML, Pasted Tag.
- `packages/viewer/src/activity.ts` -- judul Activity tool `paste` menjadi "Paste layers" (event tidak membawa kind).
- `tests/fixtures/html/{kartu,navbar,grid-harga}.html`, `tests/fixtures/docs/v7/html-paste.lakar.json`, `tests/fixtures/codegen/v7-html-paste.*.txt`.

## Tasks & Acceptance

**Execution:**
- `packages/schema/src/nodes.ts` (+ `index.ts`, README, tes versi) -- v7 + `tag` -- AD-1, AD-3.
- `packages/core/src/migrate.ts` (+ `migrate.test.ts`) -- langkah 6 → 7 identitas.
- `packages/render/src/css-reverse.ts` + `css-reverse.test.ts` -- parser kebalikan; tes round trip terhadap fungsi maju `css.ts`.
- `packages/render/src/css.ts`, `packages/codegen/src/tree.ts` (+ tes codegen) -- `tagResetDecls` dan elemen bertag.
- `packages/daemon/src/paste/html-page.ts` -- snapshot terisolasi.
- `packages/daemon/src/paste/html.ts` + `html.test.ts` -- pemetaan dari snapshot sintetis: teks, flex, grid, blok, fallback `none`, laporan, aset.
- `packages/daemon/src/paste.ts`, `chromium.ts`, `server.ts` (+ `paste.test.ts`) -- route: kind html tanpa Chromium → `RENDER_FAILED`, SVG tidak berubah.
- `packages/daemon/src/paste-html.test.ts` (baru; skip bila Chromium tidak ada) -- tiga sampel lewat daemon nyata: struktur, auto layout, tag, tanpa HTML mentah di dokumen/riwayat, piksel board vs HTML sumber; uji skrip/jaringan dengan server lokal penghitung.
- `packages/mcp/src/server.ts` (+ `index.test.ts`) -- tool.
- `packages/viewer/src/paste.ts` + `paste.test.ts`, `PasteToast.tsx`, `Viewer.tsx`, `api.ts`, `canvasEdit.tsx`, `icons.tsx`, `app.css` -- UI.
- `tests/fixtures/html/*.html`, `tests/fixtures/docs/v7/html-paste.lakar.json`, README korpus, golden codegen v7, `tests/doc-corpus.test.ts` -- korpus v7.

**Acceptance Criteria:**
- Given sampel kartu, navbar, dan grid harga, when di-paste lewat `POST /viewer/paste` `kind:'html'` ke board selebar sampel, then layer akar memuat frame dengan `layout` row/column/grid, `tag` semantik, dan teks. Render Chromium node itu berbeda < 2% piksel (toleransi 24/kanal) dari screenshot elemen akar HTML sumber, dan berkas dokumen serta riwayat tidak memuat `<div`, `class=`, atau `style=`.
- Given HTML berisi `<script>`, handler `on*`, dan sumber eksternal ke server lokal, when di-paste, then server menerima 0 permintaan, efek skrip tidak terlihat di hasil, dan laporan menyebut ketiganya.
- Given viewer dengan frame terpilih, when Ctrl+V dengan `text/html`, then layer muncul terpilih, Paste Report "Pasted N layers from HTML" dan Pasted Tag tampil, dan "Undo paste" menghapusnya (smoke msedge).

## Spec Change Log

## Review Triage Log

### 2026-11-23 — Review pass
- verdicts: 48 findings — high 0, medium 6, low 35, false 7, maybe-false 0
- findings:
  - `[false]` `[reject]` (blind) h1–h6 diekspor tebal karena tanpa reset heading. `textDecls` selalu menulis `font-weight` (`weight ?? 400`) dan `font-size`; frame tidak memakai p/h (patch E13), dan anak teks menulis bobotnya sendiri.
  - `[false]` `[reject]` (blind) Lebar/tinggi `a` diabaikan karena inline. Setiap anak Lakar adalah item flex/grid atau absolute (terblokkan), dan frame selalu menulis `display` (`frameDecls`). Paritas piksel codegen v7 (navbar dengan `a`) lulus.
  - `[low]` `[reject]` (blind) Reset `button` di Always (shorthand) tidak sama dengan kode (longhand), dan Change Log kosong. Perbaikannya mengedit spec build ini, sedangkan alasan longhand sudah dicatat di Design Notes.
  - `[low]` `[patch]` (blind) Pekerjaan tertunda tidak dicatat di `deferred-work.md`, dan item kode-2 (tag) tidak ditutup. Patch: item kode-2 diberi `resolved`. Defer V3 dicatat di frontmatter dan di `deferred-work.md`. HANDOVER milik orkestrator.
  - `[low]` `[patch]` (blind) Render Chromium berjalan sebelum dokumen/parent divalidasi. Benar. Patch: `pasteParent` dipakai untuk pra-cek tanpa kunci sebelum `snapshotHtml` dan untuk cek ulang di bawah kunci. Tes: parent/dokumen salah → 404 tanpa panggilan snapshot.
  - `[low]` `[patch]` (blind) Kegagalan snapshot muncul sebagai `Error` biasa. Bagian `browser()` null tidak terjadi, karena pool memakai `chromium.launch` dan context-nya punya browser. Bagian "snapshot tanpa body" (`body{display:none}`) benar: slot pool dibuang dan `RENDER_FAILED` retryable. Patch: body kosong sintetis, sehingga importer melapor `SCHEMA_INVALID`.
  - `[medium]` `[patch]` (blind) Biaya snapshot hanya dibatasi timeout pool, dan evaluate terus jalan. Benar. Patch: timer `timeoutMs` menutup paksa context paste; `finally` membersihkan timer.
  - `[low]` `[reject]` (blind) CSP sebagai pertahanan lapis kedua. Isolasi teruji (route abort + JS mati + resolver loopback). CSP akan memblokir permintaan sebelum route, sehingga laporan "external image" hilang. Menambah lapisan adalah kompleksitas baru.
  - `[low]` `[reject]` (blind) Viewport 800px mengubah layout berbasis vh tanpa laporan. Hasilnya tetap sama dengan sumber pada viewport itu, jadi tidak ada piksel yang salah. Laporan vh butuh pembacaan CSSOM tambahan, dan potongan seperti ini jarang.
  - `[false]` `[reject]` (blind) Generik serif dilaporkan, dan lookup font peka huruf. `FontRegistry.entry` memakai `toLowerCase`. Serif memang tidak terpasang dan diganti Inter, jadi laporannya akurat.
  - `[low]` `[patch]` (blind) Item terpotong mendapat alasan "No matching Lakar layer". Benar. Patch: viewer memberi baris sendiri, "Elements beyond the import limit" / "Too many elements — paste a smaller snippet"; tes `paste.test.ts`.
  - `[low]` `[patch]` (blind) Setiap rich text menjadi impor HTML, dan kode HTML dari editor mengimpor pewarnaan sintaks. Bagian kode benar: VS Code menaruh `<pre><span>` di text/html. Satu akar dengan baris intent D4. Keputusan (delegasi, AD-15 R6): text/plain yang berupa markup HTML (`htmlSource`) didahulukan. Rich text dari halaman web tetap menjadi impor HTML (sesuai desain rkIyP). Tes viewer.
  - `[low]` `[patch]` (blind) `htmlViewportWidth` mengabaikan token. Benar. Patch: parent dibaca dari `resolveDocument(current)`.
  - `[low]` `[patch]` (blind) Komentar tes menjanjikan undo, tetapi undo tidak diuji. Benar. Patch: `inverse` HTML bersarang dikirim ke `/ops`, lalu isi dokumen diuji sama dengan sebelum paste.
  - `[low]` `[patch]` (blind) Jalur route HTML penting tanpa tes. Patch untuk HTML kosong di route (400 + hint, rev tetap) dan snapshot terpotong. Font routing dan prefix teruji tidak langsung lewat paritas piksel (font dimuat). `OPS_MAX`/`dataDir` direject sebagai cabang guard jarang.
  - `[low]` `[reject]` (blind) Aset ditulis di bawah kunci tanpa batas. `content` dibatasi 1 MB (≤ 0,75 MB byte terdekode), dan penulisan content-addressed itu singkat. Memindahkan penulisan menambah jalur tanpa bahaya nyata.
  - `[low]` `[patch]` (edge) `body{display:none}` / navigasi menghasilkan Error biasa yang membuang slot. Satu akar dengan baris blind "Error biasa"; patch yang sama.
  - `[low]` `[patch]` (edge) Body `display:contents` hanya menyimpan anak pertama. Benar. Patch: cabang contents dilewati untuk `document.body`.
  - `[medium]` `[patch]` (edge) Evaluate tanpa timeout sehingga context bocor. Satu akar dengan baris blind biaya snapshot; patch timer yang sama.
  - `[low]` `[patch]` (edge) `<base href>` mengalihkan URL font Lakar. Benar (URL relatif). Patch: `@font-face` memakai URL absolut `PASTE_ORIGIN`.
  - `[low]` `[patch]` (edge) `font-size:0` melanggar skema dan menolak seluruh paste. Benar. Patch: size 16 + laporan `value font-size`; tes.
  - `[low]` `[patch]` (edge) Teks yang hanya ada di turunan `display:none` menjadi layer kosong. Benar. Patch: kandidat teks memakai `innerText.trim()`.
  - `[low]` `[patch]` (edge) Penempatan grid di luar batas skema menolak seluruh paste. Benar. Patch: `gridPlacementFromCss` mengembalikan undefined di luar ±25/24, sehingga importer jatuh ke posisi tetap; tes.
  - `[medium]` `[patch]` (edge) `repeat(10000000, …)` membangun jutaan track. Benar (event loop daemon terblokir). Patch: batas dicek sebelum mengisi; tes.
  - `[low]` `[reject]` (edge) Ukuran elemen berotasi diambil dari kotak terotasi. Benar tetapi jarang di potongan, dan perbaikannya butuh ukuran untransformed di snapshot plus posisi origin. Dicatat sebagai risiko.
  - `[low]` `[reject]` (edge) `order` flex diabaikan. Jarang. Perbaikannya menambah properti dan cabang gagal.
  - `[low]` `[patch]` (edge) Akar body sintetis tidak pernah `=== body`, sehingga `height:100%` menjadi tinggi tetap. Benar. Patch: penanda `bodyRoot`; tes.
  - `[low]` `[reject]` (edge) Parent `visibility:hidden` dengan anak visible. Jarang, dan memerlukan pemetaan visibilitas per turunan.
  - `[medium]` `[patch]` (edge) Frame bertag p/h berisi `<div>` (DOM tidak sah, peringatan hydration React). Benar: elemen teks berkotak menjadi frame p + text div. Patch: importer memasang p/h1–h6 pada teks di dalamnya, bukan pada frame; codegen menulis frame bertag p/h sebagai `<div>`; tes.
  - `[low]` `[patch]` (edge) Pra-cek parent sebelum snapshot. Satu akar dengan baris blind render-sebelum-validasi; patch yang sama.
  - `[low]` `[patch]` (edge) Padding token dihitung 0 di lebar viewport. Satu akar dengan baris blind token; patch yang sama.
  - `[low]` `[patch]` (edge) Akar hug ditaruh di y=0, bukan di tengah. Benar. Patch: `importHtml` mengembalikan ukuran kotak akar, dan `pasteOps` memakainya untuk menengahkan ukuran non-angka.
  - `[low]` `[patch]` (edge) Salin gambar dari browser menghasilkan rect kosong. Benar. Patch: file gambar + text/html yang hanya berisi satu `<img>` dibiarkan (`isImageOnly`); tes.
  - `[low]` `[reject]` (edge) preconnect/dns-prefetch tidak lewat route. DNS untuk host luar ditolak resolver daemon (`MAP * ~NOTFOUND`); hanya TCP preconnect loopback yang mungkin, tanpa permintaan HTTP. Dicatat sebagai risiko.
  - `[medium]` `[patch]` (edge) Context paste tetap terbuka sesudah timeout. Satu akar dengan baris blind biaya snapshot; patch timer yang sama.
  - `[low]` `[patch]` (vgap) HTML kosong → `SCHEMA_INVALID` belum diuji di route. Patch: tes route dengan snapshot kosong (400, hint HTML, rev tetap).
  - `[low]` `[patch]` (vgap) Undo HTML tidak diuji. Satu akar dengan baris blind komentar undo; patch yang sama.
  - `[medium]` `[defer]` (vgap) Wiring viewer `kind:'html'` tanpa tes otomatis. Disposisi vgap: defer. Pola sama dengan wiring SVG story 3; viewer belum punya harness DOM. Smoke msedge lulus. Dicatat di `deferred` dan `deferred-work.md`.
  - `[low]` `[patch]` (vgap) Laporan terpotong tidak diuji. Patch: kasus `truncated:true` di `html.test.ts`.
  - `[low]` `[patch]` (vgap) Baris README v7 terpisah dari tabel oleh baris kosong. Benar. Patch: baris kosong dihapus.
  - `[low]` `[patch]` (vgap) Snapshot sebelum validasi. Satu akar dengan baris blind render-sebelum-validasi; patch yang sama.
  - `[false]` `[reject]` (intent D1) Sampel "grid fitur" vs grid harga. Prompt orkestrator untuk story ini menetapkan "card, nav bar, pricing grid".
  - `[low]` `[intent_gap]` (intent D2) Oracle piksel = HTML yang dinormalisasi harness. Keputusan (delegasi): tetap C2. AD-6 menjadikan Chromium daemon dengan font Lakar sebagai acuan. Tanpa font Lakar yang disuntikkan, sumber dirender dengan font sistem lain, sehingga piksel tidak bisa dibandingkan. Prefix hanya menambah font, reset margin body (di luar kotak elemen yang dipotret), dan font default. Dicatat di Design Notes; tanpa perubahan kode.
  - `[low]` `[patch]` (intent D3) Hanya satu pintu yang diuji end-to-end dengan Chromium. Patch: tes kartu juga mem-paste lewat `/viewer/docs/:slug/paste`, dan layer serta laporannya identik dengan route sesi.
  - `[low]` `[patch]` (intent D4) Clipboard: kode HTML di text/plain diabaikan. Satu akar dengan baris blind rich text; patch `htmlSource` yang sama.
  - `[false]` `[reject]` (intent D5) `tag` hanya di frame/text. AD-1 menyatakan tag "untuk ekspor". Gambar dan vektor diekspor sebagai kotak/SVG tanpa padanan elemen semantik di allowlist. Keputusan E2 tercatat di Design Notes.
  - `[false]` `[reject]` (intent D6) Tabel kebalikan sebagai modul terpisah. AD-5 menulis "berada di sebelahnya", dan konsistensinya dijaga tes round trip.
  - `[false]` `[reject]` (intent D7) Kenaikan skema dan codegen di luar teks ticket. Ticket meminta "tag semantik"; AD-1/AD-3/AD-5 mewajibkan skema, pemetaan, dan golden dalam PR yang sama.

## Design Notes

- **Font tidak terpasang diganti Inter (menyimpang dari teks desain w2am0):** desain menulis "kept the family name, renders with fallback". Render daemon menolak famili tak terdaftar (`FONT_MISSING`, AD-6 tanpa fallback diam-diam), sehingga screenshot dan ekspor board akan gagal. Famili diganti Inter, dan alasannya ditulis "Not installed — replaced with Inter".
- **`tag` masuk story ini:** ticket meminta "layer bertipe dengan tag semantik", dan deferred spec-kode-2 menunggu kunci ini. Allowlist dibatasi pada tag yang reset UA-nya bisa ditulis codegen. `span`/`strong`/`label` tidak termasuk, karena teks Lakar satu gaya.
- **Nilai grid tertulis dari CSSOM:** computed `grid-template-columns` selalu px terpakai, sehingga `fr` hilang. Skrip daemon membaca aturan stylesheet yang cocok. Spesifisitasnya dihitung kira-kira (id, kelas/atribut/pseudo, tipe; `!important` menang). Track yang gagal diurai memakai px terpakai dan dilaporkan.
- **Fallback `layout:'none'`:** konstruksi tanpa padanan Lakar diubah menjadi posisi tetap, sehingga tampilan tetap persis dan dilaporkan sebagai `layout`. Contohnya margin anak flex, wrap, space-around, baseline, konten inline berkotak, dan blok yang tidak rata kiri.
- **Border menjadi padding + stroke inside:** stroke Lakar tidak memakan ruang layout, sehingga lebar border ditambahkan ke padding agar isi tetap di tempatnya.
- **Report langsung terbuka untuk HTML:** desain rkIyP menampilkan Paste Report tanpa toast. SVG tetap memakai toast story 3.
- **Pasted Tag:** desain menaruh label accent di bawah node hasil paste. Label ini memakai kelas `.change-tag` (u43MYm) dengan latar accent, dan hanya tampil selama report terbuka.
- **Viewport HTML** = lebar tujuan paste, supaya elemen selebar halaman (navbar) mengisi board.
- **`align-self:flex-start` di kolom stretch → `hug` silang:** pola umum (badge/tag di kartu). Lakar tidak punya align-self, tetapi lebar `hug` (fit-content) memberi posisi yang sama. Chromium menyerialkan nilai computed-nya sebagai `flow-start`, sehingga alias itu ditambahkan di `alignFromCss`/`justifyFromCss`.
- **Anak absolute diurutkan sesudah anak flow:** urutan lukis CSS menaruh elemen terposisi di atas elemen statis. Urutan layer mengikuti urutan lukis, bukan urutan DOM.
- **Reset tag codegen hanya longhand:** `background-color`, `border-width`, `padding`, `font-*`, dan `color`. Dengan begitu `mergeDecls` membuang reset yang ditimpa node, dan kelas Tailwind tidak bergantung urutan. Shorthand `background:none` sempat membuat paritas Tailwind kartu gagal.
- **Judul Activity `paste` = "Paste layers":** event Activity tidak membawa `kind`, sehingga judulnya dibuat umum.
- **p/h1–h6 hanya untuk teks** (triage): elemen teks berkotak memberi tag itu ke teks di dalamnya. Codegen menulis frame bertag p/h sebagai `<div>`, karena anak frame selalu `<div>`.
- **Kode HTML di text/plain didahulukan** (triage, delegasi): kode HTML yang disalin dari editor/chat menaruh markup di text/plain dan pewarnaan sintaks di text/html. Rich text dari halaman web tetap menjadi impor HTML. File gambar + text/html yang hanya berisi satu `<img>` dibiarkan.
- **Oracle piksel C2** (triage, delegasi): sumber dirender di harness yang sama (font Lakar, JS mati). AD-6 menjadikan render Chromium daemon acuan, dan tanpa font yang sama piksel tidak sebanding.
- **Pra-cek parent sebelum render** (triage): dokumen/parent salah gagal sebelum sewa Chromium. Lebar viewport dihitung dari parent ter-resolve (token).
- **Elemen teks berkotak** (latar/padding/border) menjadi frame + text. Kotak teks sintetis = kotak konten elemen, sehingga turunan padding blok tetap persis.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 exec vitest run packages/render/src/css-reverse.test.ts packages/daemon/src/paste packages/daemon/src/paste.test.ts packages/daemon/src/paste-html.test.ts packages/viewer/src/paste.test.ts packages/mcp packages/codegen tests/doc-corpus.test.ts packages/core/src/migrate.test.ts tests/dependency-direction.test.ts` -- expected: hijau.
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`.

**Manual checks:**
- Smoke msedge: daemon lokal, frame terpilih, event `paste` dengan `text/html` sampel kartu → layer, report, Pasted Tag, Undo paste.

## Auto Run Result

**Ringkasan:** importer paste yang sama (AD-15) kini menerima HTML.
- **Render terisolasi:** HTML dirender di context Chromium baru dengan JavaScript mati. Hanya dokumen dan font Lakar yang dilayani; permintaan lain dibatalkan dan dilaporkan.
- **Pemetaan:** skrip snapshot milik daemon membaca DOM, kotak, dan computed style. `importHtml` memetakannya lewat tabel kebalikan `css-reverse.ts` (AD-5): flex/grid/blok menjadi auto layout, teks menjadi text, gambar data URI menjadi rect gambar, SVG menjadi path, dan tag semantik menjadi `tag`. Yang tidak terpetakan dilaporkan.
- **Commit:** satu op `add` berantai bersarang = satu rev.
- **Skema v7:** menambah `tag` (AD-1), dan codegen memakainya sebagai nama elemen.
- **Viewer:** Ctrl+V text/html membuka Paste Report (rkIyP) dengan Pasted Tag.

**File berubah:**
- `packages/schema/src/nodes.ts`, `index.ts`, `README.md`; `packages/core/src/migrate.ts` -- v7, `HTML_TAGS`, `tag`, migrasi 6 → 7.
- `packages/render/src/css-reverse.ts` (baru), `css.ts` (`tagResetDecls`), `index.ts` -- tabel kebalikan dan reset tag.
- `packages/codegen/src/tree.ts` -- elemen bertag (p/h pada frame menjadi div).
- `packages/daemon/src/paste/html-page.ts`, `html.ts` (baru); `paste.ts`, `chromium.ts`, `server.ts` -- isolasi, snapshot, pemetaan, route kind html, pra-cek, aset.
- `packages/mcp/src/server.ts` -- tool `paste` dengan `kind` html dan `width`.
- `packages/exec/src/api.ts`, `packages/skills/skills/api.md` -- dokumentasi `tag`.
- `packages/viewer/src/paste.ts`, `PasteToast.tsx`, `Viewer.tsx`, `api.ts`, `canvasEdit.tsx`, `Canvas.tsx`, `icons.tsx`, `app.css`, `activity.ts` -- clipboard HTML, report, Pasted Tag.
- Tes:
  - `paste/html.test.ts`, `paste-html.test.ts`, `css-reverse.test.ts`, serta pembaruan `paste.test.ts`, `svg.test.ts`, `mcp/index.test.ts`, dan `viewer/paste.test.ts`;
  - tes versi (`schema`, `core`, `codegen`, `daemon/store`, `viewer`, `bench/round` + snapshot);
  - `tests/doc-corpus.test.ts`, `tests/codegen.test.ts`.
- Fixture: `tests/fixtures/html/*.html`, `tests/fixtures/docs/v7/html-paste.lakar.json`, `tests/fixtures/codegen/v7-html-paste.*.txt`, dan README korpus.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- item tag kode-2 di-resolve, defer wiring viewer.

**Review:** 48 temuan (high 0, medium 6, low 35, false 7, maybe-false 0).
- **Patch, entri medium (3):**
  - context paste ditutup paksa saat timeout;
  - batas `repeat()` dicek sebelum mengisi;
  - p/h tidak pada frame, dan codegen menulis frame bertag p/h sebagai div.
- **Patch, low:**
  - pra-cek parent sebelum render, dengan lebar dari parent ter-resolve;
  - body tidak terlihat → `SCHEMA_INVALID`;
  - body `display:contents`;
  - URL font absolut;
  - `font-size:0`;
  - teks `innerText` kosong;
  - batas penempatan grid;
  - akar body tanpa tinggi tetap;
  - akar hug ditengahkan;
  - kode HTML di text/plain didahulukan, gambar-saja dibiarkan;
  - alasan baris terpotong di viewer;
  - README tabel;
  - deferred-work;
  - tes: undo bersarang, HTML kosong di route, terpotong, dan pintu viewer identik dengan Chromium.
- **Defer (1):** wiring viewer tanpa tes otomatis (medium).
- **Intent gap diputuskan (1):** oracle piksel C2, tanpa perubahan kode.
- **Reject dengan alasan di log:**
  - mismatch spec reset button (perbaikannya mengedit spec);
  - CSP;
  - vh 800;
  - aset di bawah kunci;
  - rotasi;
  - `order` flex;
  - visibility bersarang;
  - preconnect;
  - tes `OPS_MAX`/`dataDir`;
  - temuan false: heading, `a` inline, font generik, D1, D5, D6, D7.

**Follow-up:** `true`. Ini pass pertama, dan 3 entri medium di-patch (high 0, medium 3, low 15 entri). Risiko yang belum terverifikasi: jalur penutupan paksa context paste ketika evaluate macet melewati `timeoutMs` tidak dilatih tes otomatis apa pun. Yang terverifikasi hanya bahwa timer dibersihkan pada jalur normal.

**Verifikasi:**
- `pnpm build`: sukses.
- vitest pada `css-reverse`, `paste/*`, `paste.test`, `paste-html` (Chromium, selisih piksel kartu 0,42%, navbar 0%, grid 0%), `viewer/paste`, `codegen`, `codegen-parity`, `doc-corpus`, `core`, `mcp`: hijau.
- `pnpm test`: kegagalan = baseline Windows (tidak ada yang baru).
- Smoke msedge (pass implementasi): Ctrl+V text/html → layer, report, Pasted Tag, Undo paste.

**Risiko sisa:**
- elemen berotasi berukuran kotak terotasi;
- preconnect loopback;
- viewport tinggi 800 untuk vh;
- wiring viewer hanya smoke;
- track grid tertulis memakai spesifisitas pendekatan.
