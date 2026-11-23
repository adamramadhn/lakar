# Digest editor-r1-1 — fitur editor dan kanvas open-pencil

- Topik: fitur editor/kanvas yang benar-benar dikirim open-pencil (OpenPencil).
- Keputusan yang dilayani: fitur mana yang layak diadopsi Lakar, diurutkan menurut dampak pada apa yang bisa dihasilkan desainer dan agen.
- Sumber: clone lokal `open-pencil/open-pencil` @ `68f8cad` (disebut `op/` di bawah), ditambah rilis GitHub lewat `gh`. Clone tidak dijalankan.
- Diakses: 2026-11-23. Publisher semua sumber repo: proyek OpenPencil (open-pencil/open-pencil).
- Catatan pub_date: `git log -1 --format=%cs` mengembalikan 2026-11-23 untuk setiap path. Kemungkinan clone dangkal (shallow), jadi tanggal ini adalah tanggal HEAD, bukan tanggal perubahan terakhir file. Matriks Figma menulis tanggalnya sendiri, "Last updated: 2026-10-27", yaitu sebelum rilis 0.17.0.

## Findings

### 1. Mesin layout

**F1.** Auto layout memakai Taffy, implementasi Rust untuk CSS flexbox dan CSS Grid yang dibangun ke WASM dari fork OpenPencil. Taffy yang sama juga melayout impor HTML lewat Blitz. Core membangun pohon `LayoutNode` dengan style bernama CSS, lalu memanggil satu `computeLayout(root)` dan mengukur daun teks lewat callback `measure`. Default yang berbeda dari CSS: arah kolom, `flexShrink: 0`, `alignContent: flex-start`, dan ukuran minimum 0. Kotak memakai border-box dan tidak dibulatkan ke piksel.
- source: `op/packages/docs/development/architecture.md:63-65`
- pub_date: 2026-11-23
- confidence: high
- class: mechanism

**F2.** Properti Figma dipetakan satu-satu ke CSS:
- `stackMode` → `flexDirection`
- `stackSpacing` → `gap`
- `stackPadding` → `padding`
- `stackJustify` → `justifyContent`
- `stackCounterAlign` → `alignItems`
- `stackPrimarySizing FIXED/HUG/FILL` → width/auto/`flexGrow`
- `stackChildAlignSelf` → `alignSelf`
- `stackPositioning ABSOLUTE` → `position: absolute`

- source: `op/packages/docs/reference/scene-graph.md:64-79`
- pub_date: 2026-11-23
- confidence: high
- class: mechanism

**F3.** Fitur auto layout yang ada:
- arah horizontal/vertikal dan wrap;
- gap, padding per sisi;
- justify (start/center/end/space-between) dan align (start/center/end/stretch);
- ukuran anak Fixed/Fill/Hug;
- reorder dengan drag beserta indikator sisip, dan Ctrl-drag untuk menaruh anak secara absolut;
- Shift+A membungkus seleksi dan mengurutkannya menurut posisi visual.

- source: `op/packages/docs/user-guide/auto-layout.md:8-66`
- pub_date: 2026-11-23
- confidence: high
- class: capability

**F4.** Mode CSS Grid tersedia: track `fr`/`px`/`auto`, gap kolom dan baris terpisah, penempatan otomatis per baris, serta override column/row start dan span. Grid diekspor ke Tailwind (`grid-cols-3`, `col-start-2 row-span-2`).
- source: `op/packages/docs/user-guide/auto-layout.md:78-106`
- pub_date: 2026-11-23
- confidence: high
- class: capability

**F5.** Fitur pendukung layout:
- min/max width dan height, dan nilainya bisa di-bind ke variabel number;
- constraints (left/right/center/stretch/scale per sumbu) yang berlaku saat parent di-resize, termasuk di dalam instance;
- layout guides (grid, kolom, baris);
- urutan auto layout kanan-ke-kiri untuk teks RTL.

- source: `op/packages/docs/reference/figma-compatibility.md:53,55,97,154`
- pub_date: 2026-11-23 (matriks bertanggal 2026-10-27)
- confidence: high
- class: capability

**F6.** Alasan memilih Taffy: menyerahkan flexbox dan Grid ke library yang sudah mapan, karena Taffy juga melayout Servo, Blitz, Bevy, Slint, dan Zed. Penpot disebut sebagai pembanding: Penpot memelihara sekitar 3.000+ LOC kode layout buatan sendiri yang diduplikasi di dua bahasa. Arsitekturnya satu proses: Taffy WASM dipanggil secara sinkron, scene graph berupa `Map<string, SceneNode>` datar, dan Skia CanvasKit dipanggil langsung dari TS. Catatan roadmap v0.17.0: "auto layout on Taffy". Frasa ini mengisyaratkan migrasi ke Taffy baru selesai di rilis itu.
- source: `op/packages/docs/overview/comparison.md:51,197,287`; `op/packages/docs/development/roadmap.md:29`
- pub_date: 2026-11-23
- confidence: high untuk alasannya; medium untuk tafsir "baru selesai"
- class: mechanism/trajectory

### 2. Komponen, variabel, dan style

**F7.** Komponen:
- Dibuat dengan ⌥⌘K. Layer apa pun bisa dibungkus menjadi komponen.
- Component set dibuat dengan ⇧⌘K. Set mendukung varian multidimensi yang sparse (kombinasi tidak harus lengkap), validasi duplikat, dan varian kiri-atas sebagai default/fallback.
- Tombol "Add variant" bekerja seperti di Figma.

- source: `op/packages/docs/user-guide/components.md:16-30`; `op/packages/docs/reference/figma-compatibility.md:160-163`
- pub_date: 2026-11-23
- confidence: high
- class: capability

**F8.** Component properties bertipe text, boolean visibility, instance-swap, dan slot. Properti diedit pada instance tanpa melepas link. Properti nested instance bisa diekspos ("Expose properties from nested instances"). Semuanya bertahan saat simpan/buka `.fig`.
- source: `op/packages/docs/user-guide/components.md:32-40`
- pub_date: 2026-11-23
- confidence: high
- class: capability

**F9.** Slot adalah frame di dalam main component yang isinya bisa diganti oleh setiap instance. Pengaturan slot mencakup deskripsi, komponen yang disukai, dan batas jumlah item. Instance yang melanggar batas mendapat peringatan. Tool MCP `create_slot` tersedia.
- source: `op/packages/docs/user-guide/components.md:42-44`; `op/packages/core/src/tools/create/behaviours.ts:38-53`
- pub_date: 2026-11-23
- confidence: high
- class: capability

**F10.** Live sync dan override:
- Properti yang tidak di-override mengikuti main component. Cakupannya ukuran, fill, stroke, efek, opacity, blend, radius dan smoothing, setting layout, teks, dan lainnya.
- Posisi, rotasi, constraints, dan mask anak di dalam instance tidak bisa di-override. Script yang mencobanya menerima error Figma.
- Anak baru di komponen ikut dikloning ke semua instance.

- source: `op/packages/docs/user-guide/components.md:123-143`
- pub_date: 2026-11-23
- confidence: high
- class: mechanism

**F11.** Behaviour membuat komponen bekerja sebagai kontrol Reka UI. Jenisnya: Button, Text field, Textarea, Number field, Toggle, Switch, Checkbox, Radio(group), Toggle group, Slider, Progress, Tabs/Tab, Collapsible, Accordion.
- Binding-nya ke Values (properti varian/boolean/teks), Parts (slot), dan States (varian hover/pressed/focus/disabled/invalid). Tersedia aksi "Add state variants".
- Preview (⌥⌘↩) menjalankan kontrol hidup di atas kanvas.
- Behaviour tersimpan di `.fig` dan ikut dipublikasikan bersama library.

- source: `op/packages/docs/user-guide/components.md:46-60`
- pub_date: 2026-11-23
- confidence: high
- class: capability

**F12.** Tool agen `set_behaviour` dan `get_behaviour`:
- `set_behaviour` menerima `{kind, values, parts, states}` berdasarkan nama properti dan slot. Nilai on/off varian ditebak dari nama seperti On/Off. Hasilnya mengembalikan behaviour beserta apa yang masih kurang.
- `get_behaviour` tanpa ID mendaftar semua jenis behaviour dan binding-nya.

- source: `op/packages/core/src/tools/create/behaviours.ts:8-70`
- pub_date: 2026-11-23
- confidence: high
- class: mechanism

**F13.** Library komponen:
- Publikasi menghasilkan revisi immutable berisi komponen, style, dan koleksi variabel, dengan identitas library/aset/revisi yang stabil.
- Publikasi bisa selektif. Pointer "latest" bersifat kondisional untuk mencegah dua publisher saling menimpa.
- Update ditinjau berdampingan, dengan cakupan per instance, per aset, per halaman, atau semua halaman.
- Revisi disimpan di cache offline dan dipersistenkan ke `.fig`.

- source: `op/packages/docs/user-guide/components.md:62-107`
- pub_date: 2026-11-23
- confidence: high
- class: capability

**F14.** Variabel:
- Empat tipe: color, number, string, boolean.
- Koleksi dengan mode. Setiap mode punya kondisi "Applies when" yang menulis CSS: atribut `[data-theme]`, `prefers-color-scheme`, `prefers-contrast`, `prefers-reduced-motion`, `@media`/`@container` lebar, atau CSS kustom.
- Alias, scopes, unit (px/rem/%/ms/s/deg), dan "CSS expression" seperti `clamp(...)`.

- source: `op/packages/docs/user-guide/variables.md:16-83`
- pub_date: 2026-11-23
- confidence: high
- class: capability

**F15.** Formula variabel:
- Aritmetika, logika, perbandingan, `if()`, `text()`, `truthy()`.
- Formula number ditulis ke stylesheet sebagai `calc(var(--a) * 2 ...)` dan dideklarasikan ulang per mode.
- Formula dengan `if()`, teks, atau boolean tidak punya bentuk CSS dan tidak ikut ke stylesheet.

- source: `op/packages/docs/user-guide/variables.md:49-62`
- pub_date: 2026-11-23
- confidence: high
- class: mechanism

**F16.** Design token W3C (DTCG):
- Ekspor berupa zip: satu file per mode koleksi, style teks dan efek sebagai token typography dan shadow, dan resolver untuk Style Dictionary.
- Impor menerima file dari Figma, resolver, dan tema Tokens Studio.
- Sebelum impor diterapkan, ada dialog pemetaan collection/mode serta hitungan add/update/skip. Impor tidak menghapus apa pun, dan satu undo membatalkan semuanya.
- Stylesheet bisa disalin sebagai CSS atau tema Tailwind v4.

- source: `op/packages/docs/user-guide/variables.md:85-96`
- pub_date: 2026-11-23
- confidence: high
- class: format

**F17.** Style (paint, text, effect, grid) baru parsial: style dari `.fig`, library, atau token bisa diterapkan dan dilepas, tetapi tidak ada UI untuk membuat atau mengedit style. Pada 0.17 Plugin API menambah `figma.createPaintStyle()` dan sejenisnya, sehingga script dan agen bisa membuat style.
- source: `op/packages/docs/reference/figma-compatibility.md:89,168`; release v0.17.0 body baris 71, https://github.com/open-pencil/open-pencil/releases/tag/v0.17.0 (2026-11-22)
- confidence: high
- class: capability

### 3. Format impor/ekspor

**F18.** `.fig` adalah format kelas satu dan mendukung baca/tulis penuh:
- codec Kiwi dengan 605 definisi skema dan sekitar 590 field per `NodeChange`;
- ekspor memakai Zstd dengan tingkat per dokumen (fast/smaller/smallest) dan thumbnail;
- clipboard dua arah dengan Figma (`application/x-figma-design`).

Ada inkonsistensi angka: `features.md` menyebut 194 definisi dan sekitar 390 field, kemungkinan angka lama.
- source: `op/packages/docs/reference/figma-compatibility.md:193-197`; `op/packages/docs/reference/file-format.md:63-88`; `op/packages/docs/overview/features.md:5-7`
- pub_date: 2026-11-23
- confidence: high
- class: format

**F19.** `.pen` (Pencil/pen.dev) hanya bisa dibuka (baca), tanpa simpan. Paket `@open-pencil/pen` hanya mengekspor `parsePenFile`, `readPenFile`, dan tipe-tipenya. Modulnya mencakup layout, instances, variables, paints, effects, dan icons.
- source: `op/packages/docs/reference/file-format.md:71-74`; release v0.17.0 body baris 19; `ls op/packages/pen/src`
- confidence: high
- class: format

**F20.** Ekspor gambar dan dokumen:
- PNG/JPG/WEBP pada skala 0,5×–4×, multi-preset per node, dengan pratinjau langsung.
- SVG (style run, gradien, efek, blend mode).
- PDF dengan font tertanam lewat backend PDF Skia (build CanvasKit sendiri, `@open-pencil/canvaskit`).
- PPTX, draw.io, dan subset `.fig`.
- Copy as text/SVG/PNG/JSX.

Tabel di `file-format.md:69-79` sudah usang karena tidak memuat PDF, PPTX, dan draw.io.
- source: `op/packages/docs/reference/figma-compatibility.md:199`; `op/packages/docs/user-guide/exporting.md:10-45`; release v0.17.0 body baris 20; daftar `op/packages/core/src/io/formats/` (design-tokens, drawio, fig, html, mermaid, pdf, pen, pptx, raster, svg)
- confidence: high
- class: format

**F21.** Target codegen:
- Panel Code menampilkan Design JSX, HTML, Vue, dan React dengan CSS atau Tailwind, nilai yang sadar token, dan editing Design JSX dua arah yang menambal kode saat layer berubah.
- CLI mengekspor `tailwind-jsx`, `storybook` (stories per komponen), dan `jsx`.
- Tidak ada Swift, Kotlin, atau Compose.
- Paket `emit` membangun JS/TS/JSX sebagai ESTree lalu mencetaknya dengan esrap.

- source: `op/packages/docs/overview/features.md:33`; `op/README.md:85-95`; `op/packages/docs/reference/figma-compatibility.md:217-220`; `op/packages/emit/package.json` (description)
- confidence: high
- class: format

**F22.** Impor HTML/CSS dan URL menjadi layer yang bisa diedit. Mesinnya `@open-pencil/html-engine`: Blitz (Stylo + Taffy + Parley) dikompilasi ke WASM, melayout HTML "seperti browser tanpa browser", dan menangkap border box serta computed style.
- "Open from URL" menawarkan viewport Desktop 1440×900, Tablet 768×1024, dan Mobile 390×844.
- Impor mempertahankan tabel, CSS grid multi-kolom, dan blok center/margin sebagai auto layout.
- SVG inline dan ikon mask CSS menjadi vektor.

- source: `op/packages/html-engine/README.md:1-15`; `op/packages/docs/user-guide/exporting.md:59-67`; release v0.17.0 body baris 47
- confidence: high
- class: format/mechanism

**F23.** draw.io dan Mermaid (baru di 0.17):
- `.drawio`/`.dio`, serta PNG/SVG editable dari draw.io, dibuka sebagai shape dan connector FigJam. Warna, label, panah, bend point, layer, dan container dipertahankan.
- `.mmd`/`.mermaid`, atau Mermaid yang di-paste, di-layout otomatis. Saat ini hanya flowchart: paket mermaid hanya punya `parseFlowchart`.
- Desain bisa disimpan sebagai draw.io.

- source: release v0.17.0 body baris 44; `op/packages/mermaid/src/index.ts:1-12`; `op/packages/drawio/src/index.ts:6-19`; `op/packages/core/src/editor/bridges/clipboard.ts:21`
- confidence: high
- class: format

### 4. Kolaborasi dan cloud

**F24.** Multiplayer P2P lewat WebRTC (Trystero + Yjs), tanpa server dan tanpa akun:
- kursor, seleksi, follow mode, dan panggilan suara;
- konflik pindah/reorder layer diselesaikan dengan tree CRDT Evan Wallace;
- room hanya hidup di perangkat peserta.

- source: `op/packages/docs/user-guide/collaboration.md:8-53`; `op/packages/docs/reference/figma-compatibility.md:214`
- pub_date: 2026-11-23
- confidence: high
- class: capability/mechanism

**F25.** Agen sebagai kolaborator. Chat AI bawaan, chat ACP/Pi, dan setiap klien MCP tampil sebagai kursor di layer yang mereka baca atau edit, masing-masing dengan callsign. Saat JSX di-stream, kursor bergerak melalui elemen yang muncul. Agen milik pengguna di-follow otomatis selama bekerja. Avatar menunjukkan jumlah agen per orang beserta apa yang sedang dikerjakan dan di halaman mana.
- source: `op/packages/docs/user-guide/collaboration.md:33-43`
- pub_date: 2026-11-23
- confidence: high
- class: capability

**F26.** Komentar ditambatkan ke layer dengan thread, balasan, resolve, dan daftar yang bisa difilter, lalu disimpan di `.fig`. Di Cloud ada mention `@` dan notifikasi email.
- source: `op/packages/docs/reference/figma-compatibility.md:213`; release v0.17.0 body baris 35-36
- confidence: high
- class: capability

**F27.** Status (Draft, In review, Ready for dev, …) bisa dipasang pada section, frame, komponen, dan instance, dan tampil di samping judul. Status Ready for dev dan Completed dipetakan ke status Figma. Script dan agen bisa membaca dan mengaturnya.
- source: release v0.17.0 body baris 58
- confidence: high
- class: capability

**F28.** OpenPencil Cloud (baru di 0.17), self-hostable, lisensi Apache 2.0. Bisa dijalankan di Node atau Cloudflare Workers. Isinya:
- akun (email, Google, Apple, GitHub, 2FA) dan workspace tim;
- dokumen dengan room live dan undangan/link tamu;
- riwayat versi (named dan autosave, restore), Trash;
- kredit AI per plan, konsol admin, dan galeri komunitas.

Paketnya besar (sekitar 34,8 ribu LOC, 140 file tes).
- source: `op/packages/docs/cloud/index.md:6-43`; `op/packages/cloud/package.json` (description); `op/packages/docs/development/roadmap.md:26`; release v0.17.0 body baris 1, 33-36
- confidence: high
- class: capability/trajectory

### 5. UX editor

**F29.** Vektor:
- vector networks yang kompatibel dengan Figma (bukan path sederhana);
- pen tool dan pencil (freehand yang dihaluskan);
- boolean union/subtract/intersect/exclude yang hasilnya tetap bisa diedit;
- flatten, outline stroke, text ke path.

Belum ada: mirroring per titik, shape builder, offset path, simplify.
- source: `op/packages/docs/reference/figma-compatibility.md:62-76`
- confidence: high
- class: capability

**F30.** Teks:
- editing langsung di kanvas dengan IME;
- rich text per karakter (style run) dan list bernomor/berpoin bertingkat;
- variable font (sumbu bisa diatur per rentang karakter);
- fallback CJK, RTL dengan shaping Arab, text on path (parsial);
- link per rentang (round-trip saja, tanpa UI).

- source: `op/packages/docs/reference/figma-compatibility.md:78-98`; release v0.17.0 body baris 50
- confidence: high
- class: capability

**F31.** Efek dan paint:
- drop/inner shadow dan layer/background/foreground blur;
- di 0.17 bertambah efek glass, progressive blur, noise, dan texture ala Figma, serta penyesuaian gambar;
- blend mode pada layer, fill, dan efek, ditambah pass-through;
- banyak fill/stroke per layer, gradien linear/radial/angular/diamond, corner smoothing, stroke per sisi.

Matriks bertanggal 2026-10-27 masih mencatat "Image property adjustment 🔲". Ini contoh matriks yang tertinggal dari rilis.
- source: `op/packages/docs/reference/figma-compatibility.md:100-137`; `op/packages/docs/development/roadmap.md:28`
- confidence: high
- class: capability

**F32.** Prototyping belum ada. Seluruh 11 baris prototyping di matriks bertanda 🔲, mencakup connections, triggers, overlays, smart animate, dan variables in prototypes. Roadmap menaruhnya di "Later → Product depth" sebagai prototyping "on top of the existing component preview", ditambah Motion. Pengganti saat ini adalah behaviour dan preview (F11).
- source: `op/packages/docs/reference/figma-compatibility.md:173-187`; `op/packages/docs/development/roadmap.md:118-121`
- confidence: high
- class: trajectory

**F33.** Board ala FigJam (baru di 0.17):
- Design dan Board tersedia berdampingan di New file. Board punya sticky note, shape (30 jenis FigJam), connector, section, teks, dot grid dan snap 16 unit, Tidy Up, serta Auto Arrange.
- Board disimpan sebagai `.jam`.
- Connector terikat ke layer, dirutekan ulang saat layer pindah, dan round-trip ke Figma.

Tabel node-types masih menandai `STICKY` tanpa ✅, sedangkan `SHAPE_WITH_TEXT` dan `CONNECTOR` sudah ✅. Ini dokumentasi yang tertinggal.
- source: release v0.17.0 body baris 41-43; `op/packages/docs/development/roadmap.md:27`; `op/packages/docs/reference/node-types.md:29-40`
- confidence: high untuk rilisnya; medium untuk kedalaman fitur
- class: capability

**F34.** Slice: `SLICE` ada di tabel node-types tanpa ✅. Roadmap menyebut region ekspor mirip slice ada lewat tooling, "not as true Figma slice nodes". Section memakai title pill dan otomatis mengadopsi node yang tumpang-tindih.
- source: `op/packages/docs/reference/node-types.md:29`; `op/packages/docs/development/roadmap.md:183`; `op/packages/docs/overview/features.md:20`
- confidence: high
- class: capability

**F35.** Permukaan agen dan otomasi:
- 125–126 tool di chat AI, ACP, dan MCP (stdio dan HTTP), dengan nama verb-first setelah konsolidasi 0.17;
- CLI dengan 24 perintah, termasuk query XPath, lint, analyze (colors/typography/spacing/clusters), diff, dan `eval` Figma Plugin API;
- lint langsung di panel (kontras, target sentuh, warna yang tidak terikat variabel, spasi di luar skala) dengan binding variabel satu klik;
- verifikasi visual oleh AI.

- source: `op/packages/docs/reference/figma-compatibility.md:31,222-223`; `op/packages/docs/overview/features.md:34,74`; release v0.17.0 body baris 6
- confidence: high
- class: capability

### 6. Investasi (ukuran dan tes)

**F36.** LOC sumber non-tes (`.ts/.vue/.rs`, perkiraan dari `find | wc -l`) dan jumlah file tes:

| Bagian | LOC sumber | File tes |
|---|---|---|
| app `src/` | ~160k | — (e2e ada di `tests/e2e`) |
| core | ~118k | 917 |
| vue SDK | ~38k | 102 |
| cloud | ~35k | 140 |
| scene-graph | ~29k | 161 |
| fig | ~19k | 122 |
| dom-css | ~15k | 49 |
| design-jsx | ~11k | 22 |
| collab | ~2,1k | 6 |
| pen | ~2,9k | 13 |
| html-engine | ~2k | 7 |
| mermaid | ~1k | 2 |
| drawio | ~0,6k | 2 |
| emit | ~0,5k | 3 |

Direktori tes terpadat:
- `tests/e2e/canvas` (71);
- tes ekspor/impor/roundtrip `.fig` di core (41 + 31 + 25);
- `packages/fig/tests/document` (31);
- `instance-overrides` (22).

Kesimpulan: fidelitas `.fig`/Figma, kanvas, dan komponen/override adalah investasi terdalam. Mermaid, draw.io, dan pen tipis secara kode, sebagian karena memakai ulang core (`op/packages/core/src/io/formats/{mermaid,drawio}`).
- source: penghitungan atas `op/packages/*`, `op/src`, `op/tests`
- confidence: medium (LOC kasar, termasuk kode yang dihasilkan, tanpa membedakan komentar)
- class: trajectory

**F37.** Ritme rilis padat: v0.17.0 dirilis 2026-11-22 setelah beta.1–beta.7 dalam tiga minggu, ditambah build nightly 0.18. Rilis itu memuat banyak breaking change, antara lain format room, skema library v2, ID dari GUID `.fig`, dan tool MCP yang digabung atau diganti nama. API dan format belum stabil.
- source: `gh release list -R open-pencil/open-pencil`; release v0.17.0 body baris 3-28
- confidence: high
- class: trajectory

## Leads worth chasing

- `op/packages/docs/reference/design-authoring.md` dan `op/packages/design-jsx`: bahasa Design JSX yang di-stream agen, dengan `property()` dan `defineVars()`. Relevan sebagai pembanding langsung untuk model dokumen/op Lakar.
- `op/packages/docs/development/behaviours-and-preview.md`: mekanisme preview kontrol hidup di atas kanvas, kandidat pengganti prototyping.
- `op/packages/docs/user-guide/checking-designs.md` dan rule lint: kandidat untuk umpan balik `check` agen.
- `op/packages/docs/development/roadmap.md:149-272`: matriks kompatibilitas mentah per kolom (read/write/render/API) dan "Highest-priority visual gaps".
- `op/packages/dom-css` (~15k LOC, `dom-css-mapping.md`): pemetaan DOM/CSS ke node, relevan untuk impor HTML dan codegen.
- `op/packages/docs/overview/comparison.md`: perbandingan arsitektur dengan Penpot, dibaca hanya sebagian.
- Isi lengkap release body v0.17.0 bagian Added/Changed (baris 33-80+), dibaca hanya lewat grep.

## Looked for, not found

- Prototyping (connections, triggers, smart animate, flows): tidak ada, semuanya 🔲 (F32).
- Slice sebagai node sejati: tidak ada (F34).
- UI untuk membuat atau mengedit style: tidak ada, hanya apply/detach dan Plugin API (F17).
- Menulis `.pen`: tidak ada, hanya baca (F19).
- Diagram Mermaid selain flowchart: tidak ditemukan (paket hanya punya `parseFlowchart`).
- Codegen Swift, Kotlin, Compose, dan Code Connect: tidak ada (`figma-compatibility.md:218-219`).
- Branching/merging, cursor chat, find & replace: 🔲.
- Impor Sketch: 🔲.
- Pernyataan eksplisit tentang hug/fill pada teks di dalam grid, atau tentang aspect ratio di layout: tidak ditemukan di dokumen yang dibaca.
- Situs openpencil.dev tidak dibuka. Docs di repo (`packages/docs`) adalah sumber situs itu.
