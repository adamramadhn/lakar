---
title: 'Buat, sisipkan, dan override instance di viewer (epic komponen story 4)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: '1e2cc78956c538664563d40556adfcf7fad00e42'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Core dan route ops sudah mendukung komponen (story 3), tetapi viewer belum. Pengguna tidak bisa menjadikan seleksi komponen, menyisipkan instance, melihat mana master dan mana instance, masuk ke isi instance, meng-override properti lewat panel Design, me-reset override, atau men-detach instance.

**Approach:** Viewer mengikuti desain bagian 08 Components (TnNIS: Create ZHqtv, Master+Assets C2xbUQ, Instance xTIr4, Inside instance dQRib; komponen Component Tag gNzrP, Override Marker X826b0; warna `component`/`component-soft`).
- Modul murni `componentModel.ts` menurunkan info komponen dari dokumen tersimpan: master, instance, override per alamat, ringkasan override, op reset, dan target sisip instance.
- Semua tulis lewat `POST /viewer/docs/:slug/ops` dengan op yang sudah ada (`setComponent`, `add` node `instance`, `update` alamat komposit, `resetOverride`, `detach`). Respons `inverse` masuk tumpukan undo per jendela (AD-7, AD-8).
- Seleksi beralamat komposit (`I/<idMaster>…`, AD-12) memakai node hasil ekspansi. Panel Design membaca node efektif dari `expandedNodeAt` (ref token utuh), sehingga setiap edit menjadi override di core.

## Boundaries & Constraints

**Always:**
- **Create component** (menu konteks item pertama + separator, ikon `component` ungu, shortcut Ctrl/⌘+Alt+K):
  - satu node non-board dan non-instance → `setComponent(id, {props:[], slots:[]})`;
  - beberapa node satu parent, atau satu instance → plan group (story 6), `update('@group', {name:'Component'})`, lalu `setComponent('@group', …)`;
  - satu permintaan, seleksi = master.
  - Ditolak dengan toast: board ("Boards can't become components"), node di dalam instance ("Layers inside an instance can't become components"), master yang sudah ada ("This layer is already a component"), node di dalam master ("Layers inside a component can't become components"), parent berbeda (pesan group).
- **Detach instance** (menu konteks, hanya tampil bila seleksi memuat instance; Ctrl/⌘+Alt+B; tombol Detach di grup Instance): satu op `detach` ber-`ref` per instance terpilih dalam satu permintaan; seleksi = node hasil detach.
- **Assets** (tab kiri, desain C2xbUQ):
  - search "Search components", header "LOCAL COMPONENTS" + jumlah, satu kartu per master (urut dokumen): thumb ikon, nama, meta `N instance(s) · <board>`, tombol `+`, lalu hint.
  - Klik kartu = pilih master (halaman ikut pindah). `+` = sisip instance ke target seleksi. Kartu bisa di-drag ke canvas live.
  - Daftar gambar/ikon lama tetap di bawah, dengan judul "Images & icons".
- **Target sisip** (`instanceTarget`):
  - `+`: node primer board, atau frame tersimpan non-instance → node itu. Node lain → parent tersimpannya. Alamat komposit → parent instance terluar. Tanpa seleksi → board pertama halaman.
  - Drop: kontainer tersimpan (board/frame, bukan instance/komposit) terdalam di bawah kursor. Parent frame `none` → `position:'absolute'`, x/y dibulatkan relatif kotak parent.
  - Target = master itu atau turunannya → toast "A component can't contain an instance of itself", tanpa request.
  - Op: `add(parent, {type:'instance', name:<nama master>, componentId}, ref)`. Seleksi = instance baru.
- **Penanda canvas:**
  - Seleksi berisi master/instance saja → kotak seleksi, handle, dan badge ungu (`--component`).
  - Master terpilih → Component Tag master di atas master, dan tag instance di atas setiap instancenya di halaman ini. Instance terpilih → tag instance (nama master).
  - Seleksi komposit → outline putus-putus ungu di instance terluar + tag `<nama instance> · <nama master>`; seleksi anak tetap accent; breadcrumb kiri atas (`◇ <instance> › <node> | Esc to exit instance`). Klik nama instance = pilih instance.
- **Layers:** master = ikon `component` ungu, instance = ikon `diamond` ungu. Pohon dibangun dari dokumen ter-resolve, sehingga instance bisa dibuka dan isinya (alamat komposit) bisa dipilih. Leluhur seleksi komposit dibuka otomatis.
- **Masuk instance:**
  - dobel-klik node di dalam instance yang terpilih memilih anak beralamat komposit (`pickTarget` `enter` yang ada); dobel-klik teks komposit = edit inline → `update(<alamat>, {content})` (override).
  - Escape dengan seleksi komposit → pilih instance terluar.
  - Marquee tidak turun ke isi instance. Reorder node komposit tidak dimulai. Instance/komposit bukan kontainer drop.
  - Aksi struktural (group, ungroup, duplicate, delete, z-order) nonaktif untuk alamat komposit; ungroup nonaktif untuk instance. Geser/resize/nudge/align komposit = `update` x/y/ukuran (override).
- **Panel Design:**
  - Target instance/komposit: `stored` = node efektif `expandedNodeAt(doc, alamat)` (ref utuh), `resolved` = node dokumen ter-resolve, `overrides` = entri override instance terluar untuk alamat itu.
  - Header: instance = badge `diamond` di `component-soft` + "Instance of <master> · <path parent>"; master = badge `component` + "Component · N instance(s)"; komposit = badge tipe + "<Tipe> · inside <instance> (<master>)".
  - Grup Instance (instance tunggal, desain xTIr4): chip master (ikon `component`, nama, tombol ke master), tombol Detach, dan baris "N overrides · <daftar>" + "Reset all" (`update(I, {overrides:null})`) bila ada override.
  - Setiap grup properti yang punya override pada salah satu target menampilkan Override Marker ("Overridden"; "Text overridden" bila hanya `content`) dengan Reset → satu permintaan `resetOverride(alamat, [props grup])` per target.
- Pratinjau versi/offline: kontrol tulis komponen nonaktif. Teks UI Inggris; komentar Indonesia. Viewer hanya bergantung pada schema/render (AD-17).

**Never:**
- Panel definisi props/slot dan kontrol nilai props/isi slot (story 5); swap komponen; komponen lintas dokumen.
- Op core, route, skema, atau tool MCP baru; `execute`/codegen untuk aksi komponen.
- `EventSource` baru; viewer mengimpor core/exec/icons.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create dari frame | frame F terpilih, Ctrl+Alt+K | 1 rev `setComponent(F)`; Layers ikon component ungu; seleksi F | board → toast, tanpa request |
| Create dari 2 node | A, B satu parent | group + rename `Component` + `setComponent('@group')`, 1 rev | parent beda → toast group |
| Sisip dari Assets | master F, frame Row terpilih, klik `+` | `add(Row, {type:'instance', name, componentId:F})`; seleksi instance | target di dalam F → toast |
| Drop ke canvas | drag kartu ke frame `none` di (px,py) | instance `position:'absolute'`, x/y relatif frame | di luar board → toast "Drop the component onto a board" |
| Masuk instance | instance I terpilih, dobel-klik teks T di dalamnya | edit inline `I/T`; commit `update('I/T', {content})` | Escape → batal |
| Override fill | instance I terpilih, ubah hex Fill | `update(I, {fills})`; marker "Overridden" di Fill; ringkasan "1 override · Fill" | - |
| Ubah master | fill master diubah | instance lain berubah; instance ber-override tetap | - |
| Reset grup | klik Reset di marker Fill | `resetOverride(I, ['fills'])`; nilai master kembali | - |
| Reset all | klik "Reset all" | `update(I, {overrides:null})` | - |
| Detach | instance terpilih, tombol Detach | `detach(I, ref)`; seleksi node baru (frame biasa) | - |
| Undo | Ctrl+Z sesudah setiap aksi di atas | dokumen kembali, 1 rev | invers ditolak → toast Undo skipped |
| Komposit struktural | `I/T` terpilih, Delete / Ctrl+D / Ctrl+G | tanpa request | - |
| Escape | seleksi `I/T` | seleksi = `I` | - |

</intent-contract>

## Code Map

- `packages/viewer/src/componentModel.ts` (baru) -- info komponen murni: master/instance (termasuk isi slot), kunci override per alamat, props per grup, ringkasan, op reset, label header, target sisip.
- `packages/viewer/src/gesture.ts` -- `GeoNode.component?`; `dropContainer`/`marqueeSelect` melewati instance/komposit.
- `packages/viewer/src/liveGeometry.ts` -- `measureBoard(…, kinds)` menandai node master/instance.
- `packages/viewer/src/editActions.ts` -- aksi `create-component`, `detach`, guard komposit/instance, shortcut Ctrl+Alt+K/B.
- `packages/viewer/src/EditMenu.tsx` -- item Create component (+ separator) dan Detach instance.
- `packages/viewer/src/canvasEdit.tsx` -- kind geometri, blok reorder komposit, overlay tag/outline/breadcrumb, kotak seleksi ungu.
- `packages/viewer/src/Canvas.tsx` -- prop `components`, drop kartu Assets, Escape keluar instance.
- `packages/viewer/src/Viewer.tsx` -- indeks ter-resolve, `findNode` + slot, target Design untuk instance/komposit, Assets, `runAction` komponen, sisip instance, inspect dilewati untuk komposit.
- `packages/viewer/src/DesignPanel.tsx` -- header komponen, grup Instance, Override Marker per grup lewat context.
- `packages/viewer/src/designModel.ts` -- `DesignTarget.overrides?`.
- `packages/viewer/src/icons.tsx`, `packages/viewer/src/tokens.css`, `packages/viewer/src/app.css` -- ikon `component`, `mousePointerClick`; token `--component(-soft)`; gaya tag, marker, Assets, grup Instance.

## Tasks & Acceptance

**Execution:**
- [x] `packages/viewer/src/componentModel.ts` -- `componentInfo(doc)`, `isComposite`, `instanceRootOf`, `overrideEntry`, `GROUP_PROPS`, `groupOverrides`, `resetGroupOps`, `overrideSummary`, `resetAllOps`, `instanceTarget` (`+` dan drop), `instanceNode`.
- [x] `packages/viewer/src/componentModel.test.ts` -- baris matriks: info master/instance/slot, kunci akar vs komposit vs bersarang, grup/marker, ringkasan, op reset, target sisip (frame, leaf, komposit, kosong, siklus, drop frame `none` / flow / luar board).
- [x] `packages/viewer/src/editActions.ts` + `editActions.test.ts` -- plan create component (tunggal, multi, instance, error), detach multi dengan ref, aksi struktural nonaktif untuk komposit, shortcut.
- [x] `packages/viewer/src/gesture.ts` + `gesture.test.ts` -- drop/marquee melewati instance dan komposit.
- [x] `tests/editor-actions.test.ts` -- plan create component dan detach dijalankan lewat `applyOps` core, lalu inverse mengembalikan dokumen.
- [x] `packages/viewer/src/liveGeometry.ts`, `canvasEdit.tsx`, `Canvas.tsx`, `EditMenu.tsx`, `Viewer.tsx`, `DesignPanel.tsx`, `designModel.ts`, `icons.tsx`, `tokens.css`, `app.css` -- UI sesuai Boundaries dan desain 08.

**Acceptance Criteria:**
- Given dokumen dengan frame kartu di viewer, when pengguna memilih frame lalu Create component, menyisipkan dua instance dari Assets, mengubah Fill salah satu instance, lalu mengubah Fill master, then canvas live menampilkan instance tanpa override dengan fill master baru, instance ber-override tetap dengan fill-nya, dan setiap langkah menambah tepat satu rev dan satu entri `lakar-viewer`.
- Given instance ber-override, when Reset di Override Marker Fill diklik, then fill instance kembali ke nilai master dalam satu rev.
- Given instance terpilih, when Detach diklik, then Layers menampilkan layer biasa (ikon frame) di posisinya dan Ctrl+Z mengembalikan instance.
- Given instance terpilih, when pengguna dobel-klik teks di dalamnya lalu mengetik dan Enter, then teks instance itu berubah (override) dan master serta instance lain tidak.
- Given pratinjau versi atau offline, when menu konteks atau Assets dibuka, then aksi komponen tidak mengirim request.

## Spec Change Log

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 44 findings — high 0, medium 4, low 29, false 11, maybe-false 0
- findings:
  - `[medium]` `[intent_gap]` (blind) Klik kartu Assets lalu `+` selalu memberi toast siklus, karena kartu memilih master lalu master menjadi target sisip. Aturan intent-contract "target = master → toast" tidak membedakan seleksi hasil klik kartu. — Diputuskan (delegasi "terima jadi", Design Notes "Keputusan review k4"): untuk `+`, target di dalam master jatuh ke parent master, sedangkan drop tetap ditolak. `instanceTarget` diperbarui (`componentModel.ts`), tes unit dan core diperbarui, dan smoke ulang "klik kartu lalu + dua kali" lulus tanpa toast.
  - `[low]` `[reject]` (blind) Cek siklus hanya leluhur langsung, siklus tak langsung (B memuat instance A, sisip A ke B) lolos ke core. — Nyata, tetapi core menolaknya dengan `SCHEMA_INVALID` dan Viewer menampilkan toast tanpa kerusakan. Kasusnya jarang, dan perbaikannya butuh graf pemakaian transitif.
  - `[low]` `[reject]` (blind) Highlight komposit jatuh ke `[0,0,0,0]` bila geometri belum terukur. — Pada canvas live `bounds` hanya mencegah board tampil terpilih. Kotak `hRect` hanya digambar di jalur PNG (pratinjau versi), tempat seleksi komposit tidak bisa dibuat dari canvas.
  - `[medium]` `[patch]` (blind) Cache geometri praktis mati: `kinds` dibandingkan per identitas, padahal `componentInfo` dibuat ulang tiap rev. — Patch: kunci cache memakai tanda tangan isi `kindsKey` (`canvasEdit.tsx`), sehingga board hanya diukur ulang saat mount/kotak/penanda berubah.
  - `[false]` `[reject]` (blind) `align`/`size`/`color` tumpang tindih antargrup sehingga marker salah grup pada seleksi campuran. — `designGroups` hanya menampilkan grup yang berlaku untuk semua target. Seleksi frame+teks atau teks+ikon hanya menyisakan Position & size dan Effects, yang propertinya tidak tumpang tindih.
  - `[low]` `[reject]` (blind) Marker bergantung pada string judul grup (`TITLE_GROUP`). — Tidak ada kerugian saat ini. Mengganti ke kunci eksplisit menyentuh delapan pemanggil, dan judul grup stabil (desain).
  - `[low]` `[patch]` (blind) Instance bersarang (`I/J`) di Layers tanpa ikon diamond. — Patch: ikon Layers memakai segmen terakhir alamat (`Viewer.tsx` LayerTree).
  - `[false]` `[reject]` (blind) Leluhur seleksi komposit tidak dibuka otomatis. — Efek LayerTree yang ada menelusuri `parentId` dari indeks yang kini ter-resolve (`I/T` → `I` → board). Smoke menunjukkan baris "Title" terbuka di bawah instance.
  - `[false]` `[reject]` (blind) "Go to component" aktif saat master hilang. — Instance dengan `componentId` tanpa master ditolak `componentIssues` saat commit (story 2), jadi keadaan itu tidak bisa terjadi di dokumen sah.
  - `[low]` `[reject]` (blind) Kartu `role="button"` memuat `<button>` bersarang (a11y). — Pola sama dengan baris aset lama. Perbaikan butuh restrukturisasi markup, dan `+` tetap bisa dijangkau keyboard.
  - `[low]` `[patch]` (blind) Escape membuang seleksi banyak. — Patch: `exitInstanceSelection` (murni, dites) memetakan setiap alamat komposit ke instance terluarnya dan mempertahankan node lain (`componentModel.ts`, `Canvas.tsx`).
  - `[false]` `[reject]` (blind) Toast penolakan Create component tidak pernah tampil. — Shortcut Ctrl+Alt+K memanggil `runAction` → `planAction` → toast error. Menu menonaktifkan item seperti Group/Ungroup (pola story 6).
  - `[low]` `[patch]` (blind) Pesan "to group" untuk Create component dari parent berbeda. — Patch: pesan khusus "Select layers in the same parent to create a component" (`editActions.ts`) + tes.
  - `[low]` `[reject]` (blind) Ctrl+Alt bentrok dengan AltGr. — Hanya tata letak yang memakai AltGr+K/B, yang jarang. Guard `AltGraph` menambah cabang, dan tidak ada shortcut Ctrl+Alt lain yang terhalang.
  - `[low]` `[reject]` (blind) Kerja berat per render (`overrideSummary`, `designTargets`). — Hanya saat tab Design dan seleksi tunggal. Ekspansi satu instance berorde milidetik untuk dokumen lokal, dan memoisasi menambah dependensi state.
  - `[low]` `[reject]` (blind) Tidak ada tes wiring UI. — Repo tidak punya harness tes komponen React (pola story 4–6). Yang bisa diuji murni sudah diekstrak dan dites (`componentTarget`, `exitInstanceSelection`, `measureBoard` kinds); alur penuh diverifikasi smoke msedge.
  - `[low]` `[reject]` (blind) Spec belum lengkap (status, log). — Perbaikannya mengedit spec build ini; status dan log diisi di langkah ini.
  - `[low]` `[reject]` (blind) Verification memakai path mesin lokal. — Perbaikannya mengedit spec build ini; pola sama dengan spec sebelumnya (runner Windows).
  - `[low]` `[reject]` (blind) Tidak ada umpan balik visual saat drag di atas canvas. — UX tambahan yang menambah state overlay; hasil drop terlihat langsung (instance terpilih) atau sebagai toast.
  - `[low]` `[patch]` (blind) Urutan import dan indentasi Provider di DesignPanel. — Patch: import dipindah ke kelompok lokal, dan anak Provider/Fragment diindentasi.
  - `[low]` `[reject]` (edge) Siklus tak langsung di `insideMaster`. — Satu akar dengan baris blind siklus tak langsung; alasan sama.
  - `[false]` `[reject]` (edge) Drop ke board `layout:none` tanpa x/y. — Board selalu kolom (`measureBoard` root `layout:'column'`, render board = kolom), jadi tidak ada board `none`.
  - `[false]` `[reject]` (edge) Nama slot berisi `:` merusak `split(':')`. — Nama slot `^[a-z][A-Za-z0-9]{0,31}$` dan ID alfanumerik, sehingga tidak mungkin memuat `:`.
  - `[low]` `[reject]` (edge) Isi slot yatim memakai parent instance sehingga `+` ditolak core. — Slot yatim adalah keadaan LC-32 yang jarang. Hasilnya toast error tanpa kerusakan, dan perbaikannya menambah cabang fallback.
  - `[false]` `[reject]` (edge) `masterNode` tidak masuk slot. — Master di isi slot ditolak `componentIssues` (story 2).
  - `[false]` `[reject]` (edge) `component: null` dianggap master. — Skema tersimpan tidak menerima `component: null` (`update {component:null}` menghapus kunci).
  - `[low]` `[patch]` (edge) Seleksi banyak yang memuat master membungkus master ke master baru. — Patch: `planCreateComponent` menolak bila ada anggota master ("This layer is already a component") + tes.
  - `[low]` `[reject]` (edge) Highlight 0×0. — Satu akar dengan baris blind highlight; alasan sama.
  - `[low]` `[patch]` (edge) Detach panel diam bila geometri belum terukur. — Patch: tombol Detach panel membangun op `detach` dari ID tersimpan (`detachInstance`, `Viewer.tsx`), bukan dari scene. Smoke ulang lulus.
  - `[low]` `[reject]` (edge) "Go to component" diam saat pratinjau. — Navigasi saat pratinjau memang dinonaktifkan `locate`. Efeknya kosmetik, dan perbaikan menambah prop status.
  - `[low]` `[reject]` (edge) Drop kartu dari dokumen lain diam tanpa toast. — Drag antar-tab dokumen jarang, dan tidak ada tulisan yang salah.
  - `[false]` `[reject]` (edge) Seleksi tidak ada di `stored` jatuh ke board pertama. — Seleksi selalu ID tersimpan atau alamat komposit (ditangani `instanceRootOf`); tidak ada node "resolve-only" lain.
  - `[false]` `[reject]` (edge) Isi slot di-drag keluar instance. — `move` dari/ke slot didukung core (story 3) dan merupakan operasi sah yang bisa di-undo.
  - `[false]` `[reject]` (edge) Seleksi banyak komposit flow lolos guard. — Jalur multi hanya memindah node `absolute` (`movable`); x/y komposit absolut adalah override sah.
  - `[medium]` `[patch]` (vgap) `measureBoard` dengan `kinds` tidak dites. — Patch: tes `liveGeometry.test.ts` menegaskan `component` master/instance dan ketiadaannya di node lain.
  - `[medium]` `[patch]` (vgap) Target panel Design untuk instance/komposit tidak dites. — Patch: derivasi diekstrak ke `componentTarget` (+ `effectiveNode`) di `componentModel.ts` dan dites dengan fixture (node efektif, entri override, node biasa/alamat tak ada). `Viewer.tsx` memakainya.
  - `[low]` `[patch]` (vgap) Escape keluar instance tidak dites. — Patch: `exitInstanceSelection` murni + tes (satu akar dengan baris blind Escape).
  - `[low]` `[reject]` (vgap, other) Highlight 0×0. — Satu akar dengan baris blind highlight; alasan sama.
  - `[low]` `[patch]` (vgap, other) Create component dengan seleksi memuat master. — Satu akar dengan baris edge; patch sama.
  - `[low]` `[reject]` (intent) Propagasi master ke dua instance hanya dites di core, bukan canvas live. — Diverifikasi smoke msedge (dua instance, override fill, ubah master, computed style live), juga sesudah patch. Repo tidak punya harness e2e otomatis.
  - `[low]` `[patch]` (intent) Invers langkah override tidak ditegaskan. — Patch: langkah override di `tests/editor-actions.test.ts` kini memakai `roundTrip`.
  - `[low]` `[reject]` (intent) Marker/Reset panel tidak dites di permukaan UI. — Diverifikasi smoke (marker tampil, Reset mengembalikan fill master), dan logika reset dites murni.
  - `[low]` `[reject]` (intent) Dobel-klik masuk instance tidak dites. — Memakai `pickTarget` `enter` yang sudah dites (story 4 editor). Alur komposit diverifikasi smoke (edit inline → override).
  - `[low]` `[reject]` (intent) Nilai efektif sesudah reset/detach hanya dicek di dokumen tersimpan. — Smoke memeriksa computed style canvas sesudah Reset dan Layers sesudah Detach.

## Design Notes

- **Node efektif sebagai `stored`.** Panel Design story 5 membangun patch dari `stored`. Dengan node efektif `expandedNodeAt` (ref token utuh), patch komposit/instance berisi properti efektif. Core menerjemahkannya ke override (kunci node) atau ke instance (`name/x/y/position/grid*`), jadi panel tidak perlu cabang khusus.
- **Indeks ter-resolve.** Indeks Viewer (`indexDocument`) dibangun dari dokumen ter-resolve agar alamat komposit dan isi slot dikenal (seleksi tidak dipangkas, halaman/board ditemukan). Tipe instance diambil dari `componentInfo` dokumen tersimpan. Resolve gagal → indeks dokumen tersimpan. Node yang disembunyikan prop boolean tidak tampil di Layers (sama dengan canvas).
- **`/inspect` untuk komposit dilewati** (route lama menerima ID tersimpan saja). Copy as nonaktif untuk komposit; X/Y anak flow komposit tanpa posisi terukur. Highlight seleksi komposit memakai kotak dari geometri canvas live, sehingga board tidak tampil terpilih.
- **Override Marker lewat context.** `Group` di DesignPanel membaca target lewat React context dan menampilkan marker per judul grup, jadi tanda tangan setiap grup tidak berubah. Reset memakai antrean edit panel yang sama (`ctx.run`).
- **Isi slot** di Layers memakai alamat parent slot `I/<frameSlot>`, sehingga `+` Assets pada isi slot menyisip ke slot itu (didukung core story 3).
- **Elemen tanpa desain (C6):** item menu "Detach instance" (ikon `unlink`, sesudah Create component) dan shortcut Ctrl/⌘+Alt+B mengikuti Figma. Judul "Images & icons" untuk daftar aset lama. Toast error memakai Toast yang ada. Semua memakai token dan kelas menu yang ada.
- **Props/Slots** di grup Instance dan grup Component master (desain C2xbUQ/xTIr4) milik story 5; story ini hanya menampilkan chip master, Detach, dan ringkasan override.
- **Create dari instance tunggal** dibungkus frame (master berisi instance), karena master tidak boleh bertipe instance (AD-12).
- **Keputusan review k4 (intent_gap, delegasi "terima jadi"):**
  - **`+` Assets dengan master/isi master terpilih** (misalnya sesudah mengklik kartu, yang memilih master): instance disisip di parent master, tidak ditolak. Hint desain C2xbUQ ("click + to insert an instance into the selected frame") mengandaikan frame tujuan yang sah. Klik kartu adalah navigasi, bukan pilihan tujuan.
  - **Drop** ke master/isinya tetap ditolak dengan toast siklus, karena tujuannya eksplisit.
  - **Siklus tak langsung** (master B memuat instance A, sisip A ke B) dibiarkan ditolak core dengan toast error.
- **Tombol Detach panel** membangun op dari ID tersimpan (bukan geometri canvas), sehingga tetap bekerja sebelum board terukur. Menu konteks/shortcut tetap memakai plan geometri (seleksi banyak).
- **Create component** menolak seleksi yang memuat master, termasuk pada seleksi banyak (master tidak bersarang, AD-12).
- **Tag di atas node** diposisikan 18px di atas sisi atas node dalam koordinat layar (tidak ikut skala zoom), seperti badge ukuran.

## Verification

**Commands** (Windows: awali dengan `set "PATH=C:\Users\Fatmuh\AppData\Local\nvm\v26.5.0;%PATH%" &&`; pnpm = `npx -y pnpm@12.21.0`):
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: 0 error.
- `npx -y pnpm@12.21.0 exec vitest run packages/viewer tests/editor-actions.test.ts tests/dependency-direction.test.ts` -- expected: lulus.
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`.

**Manual checks:**
- Smoke playwright-core msedge terhadap daemon lokal (data dir sementara): create component dari frame, sisip dua instance lewat Assets `+`, override fill satu instance lewat panel, ubah fill master, cek computed style kedua instance di shadow root, Reset, dobel-klik teks instance + edit, Detach, Ctrl+Z per langkah; rev naik satu per aksi.

## Auto Run Result

- **Ringkasan:** Viewer mendukung komponen sesuai desain bagian 08:
  - Create component (menu konteks + Ctrl/⌘+Alt+K; satu node → `setComponent`, beberapa node/instance → dibungkus frame `Component`).
  - Daftar komponen di Assets: search, `+` sisip ke frame terpilih, drag ke canvas.
  - Ikon master/instance di Layers; pohon dari dokumen ter-resolve sehingga isi instance bisa dibuka dan dipilih.
  - Penanda canvas: seleksi ungu, Component Tag, outline instance, dan breadcrumb "Esc to exit instance".
  - Dobel-klik masuk ke isi instance (alamat komposit), dan edit teks inline menjadi override.
  - Panel Design untuk instance/isi instance: node efektif, sehingga edit menjadi override. Override Marker per grup dengan Reset; grup Instance berisi chip master, Detach, dan "N overrides · …" + Reset all.
  - Detach (panel, menu, Ctrl/⌘+Alt+B).
  - Semua lewat route ops dengan undo per jendela.
- **File:**
  - `packages/viewer/src/componentModel.ts` (baru, + tes): info master/instance/slot, kunci dan entri override, `componentTarget`/`effectiveNode`, props per grup, ringkasan, op reset, target sisip (`+`/drop), `exitInstanceSelection`.
  - `editActions.ts` (+ tes): aksi `create-component`/`detach`, guard alamat komposit/instance, shortcut.
  - `gesture.ts` (+ tes): `GeoNode.component`; drop/marquee tidak masuk instance.
  - `liveGeometry.ts` (+ tes): `measureBoard` menandai master/instance.
  - `canvasEdit.tsx`: cache per tanda tangan `kinds`, blok reorder komposit, tag/outline/breadcrumb, seleksi ungu.
  - `Canvas.tsx`: prop `components`, drop kartu Assets, Escape keluar instance.
  - `Viewer.tsx`: indeks ter-resolve, `findNode` + slot, target Design komponen, Assets, sisip/Detach/Reset all, highlight komposit, ikon Layers.
  - `DesignPanel.tsx`: header komponen, grup Instance, Override Marker lewat context.
  - `designModel.ts`: `DesignTarget.overrides`.
  - `EditMenu.tsx`: Create component + Detach instance.
  - `icons.tsx`, `tokens.css`, `app.css`: ikon, token `--component(-soft)`, gaya.
  - `tests/editor-actions.test.ts`: aksi komponen lewat `applyOps` core dengan invers persis.
- **Review:** 44 temuan (high 0, medium 4, low 29, false 11).
  - **Patch:**
    - medium 3: cache `kindsKey`, tes `measureBoard` kinds, `componentTarget` diekstrak + dites;
    - low 9: ikon instance bersarang, Escape seleksi banyak (`exitInstanceSelection` + tes, dua baris), pesan Create component, import/indentasi, tolak master di seleksi banyak (dua baris), Detach panel dari ID tersimpan, `roundTrip` langkah override.
  - **Intent_gap diputuskan:** medium 1, `+` dengan master terpilih → sisip di parent master. Kode diperbarui dan dicatat di Design Notes.
  - **Defer:** tidak ada.
  - **Ditolak** (alasan per baris di Review Triage Log):
    - siklus tak langsung (dua baris), highlight 0×0 (tiga baris), string judul grup, a11y kartu, AltGr, kerja per render, tes wiring UI, edit spec (dua baris), umpan balik drag, slot yatim, Go to saat pratinjau, drop lintas dokumen;
    - divergensi intent yang diverifikasi smoke (empat baris);
    - false (11 baris).
- **Rekomendasi follow-up review: false.**
  - Pass pertama mem-patch 3 entri medium (+1 intent_gap medium), sehingga awalnya `true` dengan risiko: perilaku UI sesudah patch (`+` sesudah klik kartu, cache geometri, Detach panel, Escape) belum terverifikasi.
  - Smoke msedge diulang pada kode yang sudah di-patch dan lulus, sehingga tidak ada risiko UI yang belum terverifikasi.
  - Jumlah patch per verdict: high 0, medium 3, low 9.
- **Verifikasi:**
  - `pnpm build` sukses; `tsc -p tsconfig.test.json` dan `tsc -p packages/viewer/tsconfig.json` 0 error.
  - `vitest run packages/viewer tests/editor-actions.test.ts tests/dependency-direction.test.ts`: 29 file / 444 tes lulus.
  - `pnpm test` penuh: 56 baris FAIL, semua ada di baseline Windows; tidak ada kegagalan baru. Snapshot bench yang berubah CRLF dikembalikan.
  - Smoke msedge awal (daemon lokal port 7493, data sementara, dibersihkan): create component, dua instance via Assets, override fill + ringkasan/marker, ubah master (computed style: instance biasa ikut, instance ber-override tetap), Reset, dobel-klik teks instance → override, breadcrumb + Escape, Detach, Ctrl+Z, menu konteks, drop kartu, tanpa error halaman.
  - Smoke ulang sesudah patch (port 7494, dibersihkan): klik kartu lalu `+` dua kali tanpa toast, ubah master/override/Reset, edit teks inline, Escape → instance terpilih, Detach panel, Ctrl+Z, tanpa error halaman.
- **Risiko sisa:**
  - Wiring komponen React (marker, header, Assets) hanya diverifikasi smoke, tanpa tes otomatis (repo tanpa harness komponen).
  - Siklus tak langsung ditolak core, tidak di viewer.
  - Drag kartu tanpa umpan balik visual sebelum dilepas.
  - Props/slot menunggu story 5.
