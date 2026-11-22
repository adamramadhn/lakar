---
title: 'Props dan slot di panel komponen (epic komponen story 5)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: '82bb2d4fbfc91967a54560623c6b24d516c05c0f'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Penanda temuan Checks pada node di dalam isi slot instance tidak tampil karena POST /inspect (route lama) membalas 404 untuk node itu.
    evidence: |-
      Review k5 (vgap). Efek penanda temuan di Viewer.tsx memanggil api.inspect untuk setiap node temuan dan menelan error; locateNode di route /inspect hanya menelusuri children (pra-ada sejak isi slot story 3). Usul: kotak penanda dari geometri canvas live (sceneBounds) untuk node inSlotContent.
    location: >-
      packages/viewer/src/Viewer.tsx (efek findingBounds)
    severity: low
---

<intent-contract>

## Intent

**Problem:** Core, skema, dan MCP sudah mendukung props (text/boolean/enum dengan binds) dan slot (story 2–3), dan viewer sudah bisa membuat, menyisipkan, meng-override, dan men-detach instance (story 4). Pengguna viewer belum bisa mendefinisikan props atau slot pada master, mengisi nilai props per instance, atau mengisi slot instance dengan layer.

**Approach:** Ikuti desain 08 Components: Master+Assets+props C2xbUQ/yjpLy (grup Component: Properties, Add property menu, Slots, hint), Instance xTIr4/rmfSe (grup Instance: Properties dan Slots), dan komponen Prop Row zbNXr.
- Modul murni `componentProps.ts` membangun model panel (baris prop/slot, kandidat bind/frame/pindah) dan `DocOp` dari dokumen tersimpan terbaru.
- Semua tulis lewat `POST /viewer/docs/:slug/ops`:
  - definisi master → `setComponent(masterId, def)`;
  - nilai prop instance → `update(I, {props})`;
  - isi slot → `add`/`move` dengan parent alamat slot `I/<frameSlot>`.
- Respons `inverse` masuk tumpukan undo per jendela (AD-7, AD-8). Tidak ada op, route, atau skema baru.

## Boundaries & Constraints

**Always:**
- **Grup Component (master tunggal terpilih, sesudah header):**
  - Header "Properties" dengan `+`. `+` membuka menu "Add property" berisi Text ("Bind to text"), Boolean ("Show / hide a layer"), dan Enum ("Pick one of values").
  - Satu Prop Row per prop, urut definisi: ikon tipe (`type`/`toggleRight`/`list`), nama mono, tag tipe, baris 2 (default + ikon `link2` + target bind), dan tombol `…`.
  - Header "Slots" dengan `+`, lalu satu Prop Row per slot (ikon `squareDashedBottom`, tag "Slot", baris 2 `N layer(s)` + nama frame), lalu hint "Select a frame inside the master and mark it as slot.".
- **Tambah prop** (satu `setComponent`; editor baris prop langsung terbuka):
  - Text: bind ke node `text` pertama master yang belum terikat `content` (urut dokumen, termasuk akar), dengan default = isi teksnya. Nama = camelCase nama layer itu (fallback `text`), dibuat unik di gabungan props+slots dengan sufiks angka.
  - Boolean: `show` (unik), default `true`, tanpa bind.
  - Enum: `variant` (unik), options `['default','alternate']`, default `default`, tanpa bind.
- **Editor prop** (klik baris atau `…` → Edit; satu editor terbuka):
  - Name. Commit nama sah dan unik → `setComponent`, ditambah `update(I, {props})` untuk setiap instance yang menyimpan nilai nama lama, sehingga nilai dipindah ke nama baru. Nama tidak sah atau bentrok → pesan inline, tanpa request.
  - Default: text = input, boolean = switch, enum = select options.
  - Options (enum): daftar dipisah koma, dirapikan (trim, buang kosong/duplikat); minimal satu. Default yang hilang diganti option pertama.
  - Bindings: satu baris per bind (select layer + select properti + hapus) dan "Add binding".
    - Layer = master dan turunan tersimpannya (tanpa isi instance bersarang).
    - Properti per tipe prop: text → text `content`, icon `icon`; boolean → `visible`, untuk semua layer kecuali akar master; enum → text `content/color/align/family`, frame `layout/align/justify`, icon `icon/color`, ditambah `blend` untuk semua tipe kecuali instance.
    - Bind enum ke `align`/`justify`/`layout`/`blend` saat options masih bawaan mengganti options dengan nilai enum skema, dan default dengan nilai node saat ini (atau option pertama).
- **Hapus prop** (`…` → Delete property): `setComponent` tanpa prop itu, ditambah `update(I, {props})` yang membuang nilainya di setiap instance (`props:null` bila kosong).
- **Slot:**
  - Tandai: `+` Slots membuka menu frame turunan master (bukan akar, rantai children tersimpan) yang belum menjadi slot, atau satu item nonaktif "No frames inside this component". Selain itu, frame seperti itu yang terpilih menampilkan grup "Slot" dengan tombol "Mark as slot". Nama slot = camelCase nama frame (fallback `content`), dibuat unik.
  - Slot yang terpilih menampilkan "Slot · <nama>" + "Remove slot".
  - Rename (`…` → Rename) sama dengan nama prop, dan isi `slots` instance dipindah lewat `update(I, {slots})`.
  - Remove (`…` → Remove slot, atau tombol di grup Slot): `setComponent` tanpa slot itu. Isi slot instance dibiarkan (yatim LC-32, bisa di-undo).
- **Grup Instance (instance tunggal):** di bawah ringkasan override, tampilkan "Properties" (bila master punya props) dan "Slots" (bila punya slots), masing-masing satu baris label + kontrol:
  - text: input, berisi nilai efektif (nilai instance sah, atau default);
  - boolean: switch + "Shown"/"Hidden" bila ada bind `visible`, selain itu "On"/"Off";
  - enum: select options;
  - commit → `update(I, {props})`. Nilai sama dengan default membuang kuncinya; peta kosong → `props:null`.
  - Slot: Slot Box putus-putus ungu berisi ikon `layers`, teks `N layer(s)` (isi instance) atau `Default · N layer(s)` (isi master), dan `+`.
    - Klik kotak → pilih alamat slot `I/<frame>`.
    - `+` membuka menu: Insert (Text, Frame, Rectangle, Ellipse → `add('I/F', nodeProps(kind))`), Components (instance master lain → `add('I/F', instanceNode)`), dan "Move into slot" (maks. 20 layer tersimpan di board yang sama → `move(id, 'I/F')`).
    - Kandidat pindah tidak memuat board, instance itu, leluhurnya, isi slot itu, master instance itu beserta turunannya, dan leluhur master.
    - Seleksi sesudahnya = layer baru atau yang dipindah.
- Setiap aksi = satu permintaan ops dari dokumen terbaru, berurutan: aksi berikutnya menunggu rev aksi sebelumnya tampil. Gagal → toast yang ada. Pratinjau versi/offline → kontrol nonaktif, tanpa request.
- Teks UI Inggris, komentar Indonesia. Viewer hanya bergantung pada schema/render (AD-17). Desain diikuti lewat token yang ada (`--component`, `--input`, `--surface-hover`, kelas `switch`).

**Never:**
- Op core, route, skema, tool MCP, atau isi `api.md` baru (agen sudah punya `setComponent`/`add` slot, story 3).
- Mengubah tipe prop yang sudah ada (hapus lalu tambah). Instance swap. Reset per prop di instance di luar "nilai = default".
- Drag-drop layer ke slot di canvas/Layers. `EventSource` baru. Viewer mengimpor core/exec/icons.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tambah prop text | master Card (text Title "Brand"), Add property → Text | 1 rev `setComponent(Card, {props:[{name:'title',type:'text',default:'Brand',binds:[{nodeId:Title,prop:'content'}]}], slots})` | tanpa node text → tanpa bind, default `''` |
| Nilai text per instance | instance I, ketik "Digital" | `update(I,{props:{title:'Digital'}})`; canvas I menampilkan "Digital", master dan instance lain tidak | nilai = default → kunci dibuang |
| Boolean sembunyikan | prop `show` bind Tag `visible`, switch I off | `update(I,{props:{show:false}})`; Tag hilang dari I | akar master tidak ditawarkan |
| Enum ganti nilai | prop `tone` options `start,center` bind Title `align`, pilih `center` | `update(I,{props:{tone:'center'}})`; teks I rata tengah | - |
| Rename prop | `title`→`heading`, I punya `title:'X'` | 1 rev: `setComponent` + `update(I,{props:{heading:'X'}})` | nama `Bad Name`/bentrok → pesan inline |
| Hapus prop | Delete property `show` | `setComponent` tanpa `show` + bersihkan `props` instance | - |
| Tandai slot | frame Body di dalam master terpilih, Mark as slot | `setComponent` + `slots:[{name:'body',nodeId:Body}]` | akar master/non-frame → tidak ditawarkan |
| Isi slot | I terpilih, `+` slot → Text | `add('I/Body', text)`; seleksi = text baru; master berubah → isi tetap | - |
| Pindah ke slot | `+` slot → Move into slot → layer L | `move(L,'I/Body')` | L leluhur I / di master → tidak ditawarkan |
| Undo | Ctrl+Z sesudah setiap aksi di atas | dokumen kembali, 1 rev | invers ditolak → toast Undo skipped |
| Pratinjau/offline | panel terbuka | kontrol nonaktif | tanpa request |

</intent-contract>

## Code Map

- `packages/viewer/src/componentProps.ts` (baru) -- model murni: def master, layer bind, properti bind per tipe, nama unik/camelCase, op tambah/ubah/rename/hapus prop, op slot (tandai/rename/hapus), nilai prop instance + op, baris slot instance, kandidat pindah, op sisip/pindah ke slot.
- `packages/viewer/src/componentProps.test.ts` (baru) -- baris matriks pada level model.
- `tests/component-props.test.ts` (baru) -- op model dijalankan lewat `applyOps` core + `resolveDocument`: nilai text/boolean/enum tampil di ekspansi, slot tetap terisi saat master berubah, invers persis.
- `packages/viewer/src/ComponentPropsPanel.tsx` (baru) -- UI grup Component master, grup Slot (frame di master), Properties/Slots instance, editor prop, menu.
- `packages/viewer/src/DesignPanel.tsx` -- `ComponentPanel` diperluas (model + `edit`), render grup baru.
- `packages/viewer/src/Viewer.tsx` -- `panelInfo` mengisi model; `componentEdit` berurutan (tunggu rev) dengan seleksi sesudah aksi.
- `packages/viewer/src/FileMenu.tsx` -- `Item.heading?`/`key?` (judul bagian menu, kunci unik).
- `packages/viewer/src/componentQueue.ts` (+ tes, review k5) -- antrean aksi murni (efek disuntikkan): urutan, tunggu rev, error/kosong tanpa request, seleksi sesudah rev, tidak macet sesudah gagal.
- `packages/viewer/src/componentModel.ts` (+ tes) -- `inSlotContent`: isi slot instance dilewati `/inspect` seperti alamat komposit.
- `packages/viewer/src/icons.tsx`, `packages/viewer/src/app.css` -- ikon `toggleRight`, `squareDashedBottom`, `link2`; gaya Prop Row, editor, Slot Box, switch.

## Tasks & Acceptance

**Execution:**
- [x] `packages/viewer/src/componentProps.ts` -- fungsi murni sesuai Boundaries; semua op dibangun dari `LakarDocument` tersimpan + `ComponentInfo`.
- [x] `packages/viewer/src/componentProps.test.ts` -- tambah prop (bind otomatis, nama unik), properti bind per tipe, rename/hapus memigrasi props instance, options enum, nilai = default membuang kunci, kandidat frame slot, kandidat pindah, label slot box.
- [x] `tests/component-props.test.ts` -- skenario matriks lewat core: text/boolean/enum di `resolveDocument`, rename slot memindah isi, isi slot bertahan saat master diubah, setiap langkah `roundTrip`.
- [x] `packages/viewer/src/FileMenu.tsx` -- `heading`/`key` opsional pada `Item`.
- [x] `packages/viewer/src/ComponentPropsPanel.tsx` + `DesignPanel.tsx` + `Viewer.tsx` -- UI dan wiring sesuai Boundaries.
- [x] `packages/viewer/src/icons.tsx`, `app.css` -- ikon dan gaya desain C2xbUQ/xTIr4.

**Acceptance Criteria:**
- Given master Card dengan teks Title dan dua instance di viewer, when pengguna menambah prop Text lalu mengetik nilai di Properties salah satu instance, then canvas live menampilkan teks baru hanya di instance itu, setiap langkah menambah satu rev, dan Ctrl+Z mengembalikannya.
- Given prop boolean terikat `visible` ke layer Tag, when switch instance dimatikan, then Tag hilang dari instance itu di canvas live.
- Given prop enum terikat ke properti node, when option lain dipilih di instance, then nilai node itu di instance berubah.
- Given frame Body di dalam master ditandai slot, when Text disisipkan lewat `+` Slot Box di instance lalu fill master diubah, then instance tetap menampilkan teks sisipan di Body dan Layers menampilkannya di bawah slot.
- Given pratinjau versi atau offline, when panel komponen dibuka, then semua kontrol props/slot nonaktif.

## Spec Change Log

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 47 findings — high 0, medium 5, low 35, false 7, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) Antrean `componentEdit` bisa macet selamanya sesudah satu janji ditolak. — Patch: antrean dipindah ke `createActionQueue` (`componentQueue.ts`) dengan `.catch` → toast, sehingga aksi berikutnya tetap berjalan. Tes "Throw lalu Ok" ada di `componentQueue.test.ts`.
  - `[low]` `[reject]` (blind) Antrean tidak menangani ganti slug, unmount, seleksi terlambat, dan timer. — Viewer di-mount dengan `key={slug}`, jadi aksi yang mengantre tetap menulis ke dokumennya sendiri. Seleksi terlambat hanya terjadi dalam ≤3 detik sesudah aksi milik pengguna sendiri. Timer kini dibersihkan saat rev tiba (bagian dari patch antrean).
  - `[low]` `[reject]` (blind) Menu Components di Slot Box bisa membuat komponen rekursif. — Core menolak siklus dengan toast tanpa kerusakan. Kasusnya jarang (instance di dalam master lain), dan perbaikannya butuh graf pemakaian transitif (keputusan sama dengan k4).
  - `[low]` `[patch]` (blind) `moveCandidates` menawarkan master lain dan isinya. — Patch: walk melewati node master mana pun beserta subtree-nya (`componentProps.ts`), dan tes menambah master lain di Row.
  - `[medium]` `[patch]` (blind) Bind `icon` di Boundaries tidak diimplementasikan. — Patch: `bindProps` text → icon `icon`, enum → icon `icon`/`color`, ditambah label "Icon" dan tes. Nama tak dikenal ditolak route ops (Design Notes).
  - `[low]` `[patch]` (blind) `camelName` merusak nama berawalan angka ("2 Column" → "olumn"). — Patch: awalan non-huruf dibuang sebelum camelCase, dengan tes "2 Column" → `column` dan "3D View" → `dView`.
  - `[low]` `[patch]` (blind) Options enum berubah tanpa migrasi nilai instance. — Patch: `updatePropOps` membuang nilai instance yang hilang dari options dalam rev yang sama, dengan tes.
  - `[low]` `[reject]` (blind) `pendingOpen` di-set di dalam pembangun op, dan Mark as slot tidak membuka editor. — Stale hanya bila `setComponent` tambah prop gagal, yang jarang. Spec hanya meminta editor terbuka untuk tambah prop. Perbaikannya butuh kanal hasil commit ke panel.
  - `[low]` `[reject]` (blind) Editor bind mengizinkan bind ganda. — Bind identik menulis nilai yang sama dua kali (tanpa efek salah). Urutan dua prop pada node yang sama deterministik (urut definisi). Guard menambah cabang untuk kasus yang jarang.
  - `[low]` `[patch]` (blind) `TextInput` membuang teks tidak sah tetapi tetap menampilkan pesannya. — Patch: draft tidak sah dipertahankan di samping pesan. Smoke memeriksa "Bad Name" tetap ada.
  - `[low]` `[reject]` (blind) Spec tanpa item deferred/follow-up. — Perbaikannya mengedit spec build ini. Deferred dari review ini dicatat di frontmatter.
  - `[low]` `[reject]` (blind) Tidak ada tes lapisan UI/wiring. — Repo tidak punya harness komponen React (pola story 4/k4). Antrean diekstrak dan dites (baris vgap), dan UI diverifikasi smoke msedge.
  - `[low]` `[reject]` (blind) `panelInfo` membangun ulang model tiap render. — Hanya saat tab Design dengan seleksi tunggal. Walk dokumen lokal berorde milidetik, dan memoisasi menambah dependensi state (keputusan sama dengan k4).
  - `[low]` `[reject]` (blind) Delete property tanpa konfirmasi. — Satu Ctrl+Z memulihkan definisi dan nilai instance (invers core). Desain tidak memuat konfirmasi.
  - `[false]` `[reject]` (blind) Field `shortcut` menu dipakai untuk teks hint. — Desain Add Property Menu (t64CbB) memakai Menu Item GePVA, yang teks kanannya (`DAsig`/`X55vqa`, 11px) berada di slot yang sama dengan shortcut. Penempatannya sesuai desain.
  - `[low]` `[patch]` (edge) Antrean tanpa catch. — Satu akar dengan baris blind pertama; patch sama.
  - `[false]` `[reject]` (edge) `applyEdit` gagal → aksi berikutnya dibangun dari dokumen basi. — Commit yang gagal tidak mengubah dokumen, jadi `docRef` tetap keadaan tersimpan terakhir yang benar.
  - `[false]` `[reject]` (edge) `loadDoc` keluar lebih awal sebelum melepas penunggu rev. — Penunggu terdaftar hanya bila `docRef.rev < rev`. Setiap muatan yang menaikkan `docRef` ke ≥ rev melewati kode pelepas. Keluar awal hanya terjadi bila rev tidak berubah atau mundur.
  - `[false]` `[reject]` (edge) Ganti slug → aksi berjalan di dokumen lain. — `<Viewer key={route.slug}>` me-mount ulang; closure antrean lama terikat pada `docRef`/slug lama.
  - `[low]` `[patch]` (edge) Editor tertutup sesudah rename. — Patch: `onRenamed` menaruh kunci baru di `pendingOpen` sehingga editor tetap terbuka. Smoke memeriksa editor masih berisi "heading".
  - `[low]` `[patch]` (edge) `TextInput` membuang teks tidak sah. — Satu akar dengan baris blind `TextInput`; patch sama.
  - `[low]` `[reject]` (edge) `pendingOpen` basi sesudah gagal. — Satu akar dengan baris blind `pendingOpen`; alasan sama.
  - `[low]` `[reject]` (edge) Bind ganda dari select. — Satu akar dengan baris blind bind ganda; alasan sama.
  - `[low]` `[patch]` (edge) Enum terikat ke properti ber-enum dengan options yang tidak cocok. — Patch: mengganti bind mengganti options yang tidak cocok dengan nilai skema; options yang tidak cocok → error/toast. Tes model dan smoke ("row, middle" → toast tanpa request).
  - `[low]` `[patch]` (edge) Editor Options tanpa validasi terhadap enum skema. — Satu akar dengan baris sebelumnya; patch sama.
  - `[low]` `[patch]` (edge) Rename dengan nilai yatim bernama sama. — Patch: kunci yatim bernama baru dibuang sebelum nilai dipindah, dengan tes.
  - `[low]` `[reject]` (edge) Menu Components rekursif. — Satu akar dengan baris blind komponen rekursif; alasan sama.
  - `[low]` `[patch]` (edge) `moveCandidates` menawarkan master/isi master. — Satu akar dengan baris blind `moveCandidates`; patch sama.
  - `[low]` `[reject]` (edge) Slot bersarang/tumpang tindih. — Slot di dalam isi default slot lain sah (berlaku saat slot luar tidak diisi). Mengisi slot luar menyembunyikan slot dalam seperti isi lainnya, dan pembatasannya menambah cek leluhur.
  - `[false]` `[reject]` (edge) `masterLayers` masuk ke master bersarang. — Master tidak bisa bersarang di master (AD-12; Create component menolak, story 4), jadi tidak ada master lain di bawah akar.
  - `[low]` `[patch]` (edge) Select layer bind menampilkan ID mentah. — Patch: opsi cadangan memakai nama layer (atau "Missing layer"), dan select properti selalu memuat properti tersimpan.
  - `[medium]` `[patch]` (edge) Klaim: text tidak bisa bind ke icon `icon`. — Satu akar dengan baris blind bind icon; patch sama.
  - `[medium]` `[patch]` (edge) Klaim: enum tidak bisa bind ke icon `icon`. — Satu akar dengan baris blind bind icon; patch sama.
  - `[false]` `[reject]` (edge) Klaim: urutan tidak dijamin sesudah aksi gagal. — Aksi gagal tidak menghasilkan rev, sehingga dokumen yang dibaca aksi berikutnya sama dengan keadaan tersimpan.
  - `[medium]` `[patch]` (vgap) Antrean `componentEdit` tidak dites. — Patch: `componentQueue.ts` (efek disuntikkan) + `componentQueue.test.ts`, mencakup dua aksi berurutan pada rev baru, error/kosong/throw tanpa request, request gagal, baca-saja, dan seleksi sesudah rev.
  - `[low]` `[patch]` (vgap) Ubah default prop tidak dites. — Patch: tes default text/boolean/enum, plus tes core (default baru berlaku untuk instance tanpa nilai).
  - `[low]` `[patch]` (vgap) Penggantian options enum hanya dites untuk align teks. — Patch: tes frame align → `Align`, options cocok dipertahankan, dan tes core layout akar → default `column`.
  - `[medium]` `[patch]` (vgap, other) `bindProps` berbeda dari Boundaries (icon). — Satu akar dengan baris blind bind icon; patch sama.
  - `[low]` `[defer]` (vgap, other) Penanda temuan untuk isi slot gagal diam-diam (/inspect 404). — Pra-ada sejak isi slot story 3. Dicatat di `deferred` dan `deferred-work.md`.
  - `[low]` `[reject]` (intent) Canvas live tidak dites otomatis. — Diverifikasi smoke msedge (teks, visibilitas, flex, fill, dan isi slot di shadow root), dua kali termasuk sesudah patch. Repo tidak punya harness e2e.
  - `[low]` `[reject]` (intent) Undo viewer tidak dites. — Kode tumpukan undo tidak berubah (`applyEdit` yang sama). Ctrl+Z/Ctrl+Shift+Z diverifikasi smoke, dan invers persis dites `roundTrip`.
  - `[low]` `[reject]` (intent) Route ops tidak dilatih tes diff. — Route tidak berubah dan dites di `packages/daemon/src/ops.test.ts`. Smoke mengirim semua aksi lewat route itu.
  - `[low]` `[reject]` (intent) Interaksi panel tidak dites. — Satu akar dengan baris blind tes UI; alasan sama.
  - `[low]` `[patch]` (intent) Nilai prop saat master berubah (struktural) tidak dites. — Patch: tes core yang mengubah size/content node terikat; nilai prop instance tetap.
  - `[low]` `[patch]` (intent) Interaksi override × prop tidak dites. — Patch: tes core yang membuktikan override content menang dan reset override mengembalikan nilai prop.
  - `[false]` `[reject]` (intent) Sub-ambiguitas diselesaikan sempit. — Keputusan diambil dari spine dan desain, dicatat di Design Notes, dan didelegasikan ("terima jadi"); tidak ada perilaku yang diminta intent yang hilang.
  - `[low]` `[patch]` (intent) Remove slot (isi yatim) tidak dites lewat core. — Patch: `roundTrip` `removeSlotOps` di `tests/component-props.test.ts`; frame kembali ke isi master.

## Design Notes

- **Bind enum** hanya ke properti bernilai string, karena nilai enum adalah string yang ditulis apa adanya ke properti (`applyLenient`). Contoh desain "tone → Fill" tidak bisa dipetakan, karena `fills` berupa array. Warna teks/ikon (`color`, hex) menjadi padanan terdekat.
- **Override menang atas prop**, karena ekspansi menerapkan props lalu override. Bila instance meng-override `content` node terikat, nilai prop tidak terlihat sampai override di-reset (marker story 4 tetap menunjukkannya).
- **Boolean tidak ditawarkan untuk akar master**: akar tersembunyi menghapus instance dari canvas dan Layers, sehingga seleksi hilang.
- **Default prop berlaku di instance, bukan di master.** Master tetap menampilkan nilai node aslinya.
- **Aksi berurutan**: pembangun op dievaluasi sesudah rev aksi sebelumnya dimuat (batas 3 detik), seperti antrean panel Design, sehingga dua edit cepat tidak saling menimpa definisi.
- **Elemen tanpa desain (C6):** editor prop (field Name/Default/Options/Bindings), menu `…`, menu `+` Slot Box, dan grup "Slot" untuk frame di master. Semuanya memakai kelas panel yang ada (`dp-inline`, `dp-select`, `menu`, `switch`) dan token `--component`. Header Properties/Slots di instance tanpa `+`, karena props hanya didefinisikan di master.
- **Isi slot dan `/inspect`.** Route lama `/inspect` mencari node lewat children saja (`locateNode`), jadi isi slot instance menghasilkan 404. Route itu dibekukan (AD-4), sehingga viewer melewati inspect untuk isi slot (`inSlotContent`), seperti alamat komposit di story 4. Highlight memakai geometri canvas live, dan Copy as nonaktif untuk node itu.
- **Seleksi sesudah sisip/pindah ke slot** baru diset setelah rev commit dimuat, supaya indeks sudah mengenal node itu.
- **Keputusan review k5:**
  - **Bind `icon`:** text dan enum boleh mengikat `icon` pada node icon, sesuai Boundaries. Nama ikon yang tidak dikenal katalog ditolak route ops (ICON_UNKNOWN + saran) saat commit, jadi tidak ada render rusak.
  - **Enum ke properti ber-enum skema:**
    - Mengganti bind mengganti options bila options belum cocok dengan nilai properti itu (bukan hanya bila options masih bawaan).
    - Options yang diketik harus cocok dengan setiap properti ber-enum yang terikat. Bila tidak, toast muncul tanpa request.
  - **Options berubah** membuang nilai instance yang tidak lagi ada (kembali ke default) dalam rev yang sama. Rename membuang nilai yatim bernama sama.
  - **"Move into slot"** tidak menawarkan master mana pun beserta isinya, karena memindah isinya mengubah semua instancenya. Ini lebih ketat daripada daftar pengecualian Boundaries.
  - **Antrean aksi** dipindah ke `componentQueue.ts` (murni, dites). Kegagalan satu aksi tidak mematikan aksi berikutnya, dan timer tunggu rev dibersihkan saat rev tiba.
- **Menu "Move into slot"** dibatasi 20 kandidat (urut dokumen) supaya menu tetap pendek. Layer lain bisa dipindah agen lewat `move(id, '<I>/<frameSlot>')`.

## Verification

**Commands** (Windows: awali dengan `set "PATH=C:\Users\Fatmuh\AppData\Local\nvm\v26.5.0;%PATH%" &&`; pnpm = `npx -y pnpm@12.21.0`):
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: 0 error.
- `npx -y pnpm@12.21.0 exec vitest run packages/viewer tests/component-props.test.ts tests/editor-actions.test.ts tests/dependency-direction.test.ts` -- expected: lulus.
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`.

**Manual checks:**
- Smoke playwright-core msedge terhadap daemon lokal (data dir sementara): buat master kartu (teks Title, rect Tag, frame Body), dua instance, Add property Text/Boolean/Enum + bind, ubah nilai di satu instance (cek teks/visibility/align di shadow root), Mark as slot Body, sisip Text ke slot instance, ubah fill master (isi slot tetap), rename prop, Ctrl+Z per langkah; rev naik satu per aksi.

## Auto Run Result

- **Ringkasan:** Panel komponen mendukung props dan slot sesuai desain 08 (C2xbUQ/xTIr4, Prop Row zbNXr):
  - **Master:** grup Component dengan Properties (menu Add property Text/Boolean/Enum), Prop Row per prop, dan editor (Name, Default, Options, Bindings). Text di-bind otomatis ke teks master pertama yang belum terikat. Slots punya menu frame, Prop Row slot dengan Rename/Remove, dan hint.
  - **Frame di dalam master:** grup Slot dengan Mark as slot / Remove slot.
  - **Instance:** Properties (input/switch Shown·Hidden/select) dan Slot Box. Klik Slot Box memilih slot; `+` membuka Insert Text/Frame/Rectangle/Ellipse, instance komponen lain, atau Move into slot.
  - Semua tulis lewat route ops dengan undo per jendela, lewat antrean berurutan yang dibangun dari dokumen terbaru. Tidak ada op/route/skema baru.
- **File:**
  - `packages/viewer/src/componentProps.ts` (baru, + tes): model panel dan op prop/slot. Mencakup nama camelCase unik, properti bind per tipe (termasuk icon), migrasi/pembersihan nilai instance saat rename/options/hapus, validasi options enum skema, kandidat slot/pindah, dan nilai instance.
  - `packages/viewer/src/componentQueue.ts` (baru, + tes): antrean aksi murni (tunggu rev, error/kosong tanpa request, seleksi sesudah rev, tahan gagal).
  - `packages/viewer/src/ComponentPropsPanel.tsx` (baru): UI grup Component, grup Slot, Properties/Slots instance, editor, dan menu.
  - `DesignPanel.tsx`: `ComponentPanel` (model master/instance, `slotFrame`) dan render grup.
  - `Viewer.tsx`: `panelInfo` mengisi model, antrean `componentEdit` + `revWaiters`, dan inspect dilewati untuk isi slot.
  - `componentModel.ts` (+ tes): `inSlotContent`.
  - `FileMenu.tsx`: `Item.heading`/`key`.
  - `icons.tsx`, `app.css`: ikon `toggleRight`/`squareDashedBottom`/`link2` dan gaya.
  - `tests/component-props.test.ts`: op lewat core + `resolveDocument` + `roundTrip`.
- **Review:** 47 temuan (high 0, medium 5, low 35, false 7).
  - **Patch** (16 entri; per verdict entri: medium 2, low 14):
    - bind `icon` (medium);
    - antrean diekstrak + dites (medium);
    - antrean tahan gagal;
    - `camelName` berawalan angka;
    - nilai instance dibuang saat options berubah;
    - kandidat pindah tanpa master;
    - draft tidak sah dipertahankan;
    - editor tetap terbuka sesudah rename;
    - validasi/penggantian options enum skema;
    - nilai yatim saat rename;
    - label select bind;
    - tes default, tes enum frame/layout, tes nilai prop saat master berubah, tes override × prop, tes remove slot.
  - **Defer** (1): penanda temuan Checks untuk isi slot (/inspect 404, pra-ada).
  - **Ditolak** (alasan per baris di Review Triage Log):
    - low: antrean slug/seleksi terlambat, komponen rekursif via menu (dua baris), `pendingOpen` (dua baris), bind ganda (dua baris), edit spec, tes UI (dua baris), performa `panelInfo`, konfirmasi hapus, slot bersarang, canvas live/undo/route hanya smoke/tes yang ada (tiga baris);
    - false (7 baris).
- **Rekomendasi follow-up review: false.**
  - Dua entri medium di-patch, jadi awalnya `true`. Risikonya: perilaku UI sesudah patch (antrean baru, editor sesudah rename, draft tidak sah, toast options) belum terverifikasi.
  - Smoke msedge diulang pada kode yang sudah di-patch dan lulus, sehingga tidak ada risiko UI yang belum terverifikasi.
  - Jumlah patch per verdict entri: high 0, medium 2, low 14.
- **Verifikasi:**
  - `pnpm build` sukses; `tsc -p tsconfig.test.json` dan `tsc -p packages/viewer/tsconfig.json` 0 error.
  - `vitest run packages/viewer tests/component-props.test.ts tests/editor-actions.test.ts tests/dependency-direction.test.ts`: 32 file / 469 tes lulus.
  - `pnpm test` penuh: 55 baris FAIL, semuanya ada di baseline Windows; tidak ada kegagalan baru. Snapshot bench yang berubah CRLF dikembalikan.
  - Smoke msedge awal (port 7495, data sementara, dibersihkan): Text/Boolean/Enum + bind, nilai per instance (teks, Tag tersembunyi, flex row di shadow root), undo/redo, Mark as slot, sisip dan pindah ke slot, isi slot tetap saat fill master berubah, rename, hapus + undo, grup Slot frame; tanpa error halaman dan tanpa 404.
  - Smoke ulang sesudah patch (port 7496, dibersihkan):
    - dua Add property cepat → dua rev, keduanya tersimpan;
    - nilai/undo/redo, bind boolean/enum;
    - options tidak cocok → toast tanpa request;
    - rename dengan draft tidak sah dipertahankan, lalu editor tetap terbuka;
    - slot sisip/pindah dengan master tidak ditawarkan;
    - tanpa error halaman.
- **Risiko sisa:**
  - Wiring komponen React panel hanya diverifikasi smoke (repo tanpa harness komponen).
  - Komponen rekursif lewat menu Components ditolak core (toast), bukan disaring viewer.
  - Penanda temuan Checks untuk isi slot belum tampil (deferred).
  - Override pada node terikat menyembunyikan nilai prop sampai di-reset (Design Notes).
