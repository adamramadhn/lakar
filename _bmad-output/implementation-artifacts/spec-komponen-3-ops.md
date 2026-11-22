---
title: 'Op komponen di core, execute, dan route ops (epic komponen story 3)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: '464798771a191a0e7112abea2dcfddb4f8611ad8'
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

**Problem:** Skema v5 (story 2) sudah mengenal master dan instance, tetapi belum ada jalur tulis komponen. Agen dan viewer belum bisa menjadikan node master, meng-override isi instance lewat alamat komposit, me-reset override, mengisi slot, atau men-detach instance. Menghapus master yang masih punya instance ditolak. Suntingan master yang membuat override lama tidak sah juga menolak commit (deferred k2), padahal AD-12 meminta referensi basi diabaikan dan dilaporkan.

**Approach:**
- Op core baru (AD-2): `setComponent`, `resetOverride`, `detach`.
- Perluasan op lama:
  - `update` ke alamat komposit (atau properti non-instance pada instance) menjadi override pada instance terluar;
  - `add`/`move`/`insert` ke alamat slot `I/<frameSlot>` mengisi slot;
  - `remove`/`replace`/`update {component:null}` pada master men-detach instancenya dalam commit yang sama.
- Setiap op punya invers (AD-8). Op diekspos di `DocOp` + `applyOps` (route ops) dan API `execute`. `get` menerima alamat komposit; `find`/`children` melihat isi slot.
- Tahap ekspansi di `@lakar/schema` menjadi longgar untuk nilai override/bind: nilai yang tidak lagi sah diabaikan dan dilaporkan (LC-32), bukan menolak commit.

## Boundaries & Constraints

**Always:**
- **Alamat:** ID tersimpan 8 karakter atau alamat komposit `<I>/<seg>…` (`NODE_ADDRESS_PATTERN`). Segmen pertama komposit = instance tersimpan terluar `I` (boleh berada di isi slot instance lain). Sisanya = kunci override relatif ke master `I`.
- **`update(address, patch)`:**
  - **Komposit:** node efektif dicari pada hasil ekspansi `I` di lokasi tersimpannya. Tidak ada → `NOT_FOUND`. Kunci `type/id/children/component` atau kunci di luar `OVERRIDABLE_PROPS` → `SCHEMA_INVALID`.
  - Properti efektif + patch (null menghapus) divalidasi `NodeInput` (pesan `update`, termasuk `implicitAbsolute` dengan parent efektif). Patch di-merge ke `I.overrides[kunci]`; nilai `null` disimpan sebagai `null` (hapus properti master).
  - **ID instance:** kunci instance (`name, position, x, y, gridColumn, gridRow, componentId, props, overrides, slots`) di-merge biasa. Kunci lain menjadi override akar (kunci = `componentId`) dengan aturan komposit.
  - **Invers:** per properti override: dulu ada → `update(address, {p: lama})`; dulu tidak ada → `resetOverride(address, [p…])`. Bagian instance memakai `revertPatch` biasa.
- **`resetOverride(address, props?)`:**
  - `address` = ID instance (akar, kunci `componentId`) atau komposit. Target bukan instance → `SCHEMA_INVALID`; tidak ada → `NOT_FOUND`.
  - Tanpa `props` → seluruh entri kunci dihapus; dengan `props` (array string tak kosong) → hanya properti itu. Entri kosong dan `overrides` kosong dibuang.
  - Kunci yatim boleh di-reset (pembersihan LC-32). Tanpa perubahan → tanpa invers.
  - Invers = `update(I, {overrides: peta lama})`.
- **`setComponent(id, component | null)`:**
  - Target node anak tersimpan non-instance. Board/instance → `SCHEMA_INVALID`.
  - `component` divalidasi `ComponentDef`. Setiap `binds[].nodeId` harus master atau turunannya. Setiap `slots[].nodeId` harus frame turunan master (bukan akar). Selain itu `SCHEMA_INVALID`.
  - `null` melepas status master; instancenya di-detach dalam commit yang sama. Nilai sama → tanpa invers.
  - Invers = `setComponent(id, lama | null)` + invers detach.
- **`detach(id)` → ID baru | null:**
  - Instance tersimpan diganti salinan beku hasil ekspansinya di posisi yang sama, sehingga tampilannya identik. Semua node turunan master (termasuk instance bersarang, jadi rata) mendapat ID baru. Isi slot milik instance itu tetap node tersimpan dengan ID-nya.
  - Ref token tetap ref. Akar memakai `name/position/x/y/grid*` instance.
  - Akar yang disembunyikan prop boolean instance sendiri → instance dihapus dan hasilnya `null`.
  - Target bukan instance → `SCHEMA_INVALID`.
  - Bila instance berada di dalam master N, kunci override instance lain yang melewati `I` (`…/I/x`) dipetakan ke ID baru. `binds`/`slots` master yang menunjuk `I` juga dipetakan ke akar baru.
  - Invers = `remove(baru)`, `insert(parent lama, instance asli, index)`, lalu `update` pemulih `overrides`/`component` yang dipetakan.
- **Master hilang = detach:** `remove` (master di subtree yang dihapus), `replace` tanpa `component`, `update {component:null}`, dan `setComponent(null)` men-detach semua instance master itu di luar subtree yang dihapus, urut dokumen, sebelum mutasi. Semuanya dalam satu op dan satu rev, dengan invers berurutan.
- **Slot:**
  - Parent `I/<F>` (tepat dua segmen, `F` = `nodeId` slot di master `I`) pada `add`/`move`/`insert` menulis ke `I.slots[nama]`. Daftar dibuat bila belum ada.
  - Alamat dua segmen yang bukan slot → `SCHEMA_INVALID`. Board ke slot → `SCHEMA_INVALID`.
  - Node yang dipindah tidak boleh `I` sendiri atau leluhurnya.
  - Node terakhir keluar dari slot → kunci slot dihapus (kembali ke isi default master).
  - Untuk isi slot yang namanya sudah tidak ada di master (yatim), invers `remove`/`move` memakai `update(I, {slots: lama})`.
- **Pohon core:**
  - `locate` dan `indexNodes` masuk ke isi slot. `Location.slot = {instance, name, address?}`, dan `parent` = frame slot master bila ada.
  - `subtree` ikut isi slot, sehingga `duplicate` memberi ID baru ke isi slot dan `insert` mengecek bentrok ID di sana.
  - `duplicate` master memetakan `binds`/`slots` ke ID salinan.
  - `move`/`remove`/`replace`/`duplicate`/`detach`/`setComponent` dengan alamat komposit → `SCHEMA_INVALID` dengan hint (isi instance hanya bisa di-update/reset).
- **Ekspansi longgar (deferred k2):**
  - Nilai bind dan override yang membuat node efektif melanggar skema dangkal tipe node diabaikan dan dilaporkan sebagai `InstanceIssue` (`bind`/`override`, `detail` menyebut properti). Properti yang sah di patch yang sama tetap berlaku. Atribusi gagal → seluruh patch kunci itu diabaikan.
  - Ref token salah tipe dan token tak dikenal tetap ditolak seperti sekarang.
- **Helper schema baru** (ekspansi tetap di schema, AD-10): `expandInstanceAt(doc, instanceId)` → node ter-ekspansi | null | undefined, dan `expandedNodeAt(doc, address)` → `{node, parentId, names}` | undefined.
- **API `execute`:**
  - Fungsi op baru `setComponent(id, component?)` (tanpa argumen: `{props:[], slots:[]}` bila belum master, selain itu tanpa efek), `resetOverride(address, props?)`, dan `detach(id)`.
  - `update` menerima alamat komposit. `add`/`move` menerima alamat slot.
  - `get` menerima alamat komposit: NodeView node efektif, `parentId` alamat parent, `path` = path tersimpan `I` + nama di dalam ekspansi.
  - `find`/`children` mengikutkan isi slot (`parentId` = ID instance) dan tetap mengembalikan node tersimpan.
  - Bagian referensi "Komponen" di `api.md`, dan `EXECUTE_DESCRIPTION` menyebut tiga fungsi baru.
- **`DocOp`** tambah `{op:'setComponent', id, component}`, `{op:'resetOverride', id, props?}`, dan `{op:'detach', id, ref?}` (ref → ID baru di `refs`).
- AD-4: route/tool lama, input lama, kode error, dan bentuk respons tetap (hanya bertambah).

**Never:**
- Menaikkan `schemaVersion` atau mengubah skema dokumen.
- Memanggil `expandInstances` di luar `@lakar/schema`.
- UI viewer (story 4/5).
- Swap komponen, komponen lintas file, atau op props/slot definisi selain lewat `setComponent`.
- Mengubah `/execute`, check, atau route lain selain pendaftaran ops yang sudah ada.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Buat master | `setComponent(F)` pada frame F | `F.component = {props:[], slots:[]}`; invers `setComponent(F, null)` | board/instance → SCHEMA_INVALID |
| Definisi tidak sah | slot ke node non-frame / bind ke node di luar master | ditolak | SCHEMA_INVALID |
| Sisip instance | `add(b, {type:'instance', name, componentId:F})` | instance tersimpan, tanpa isi terurai | componentId tak ada → SCHEMA_INVALID saat commit |
| Override teks | `update('I/T', {content:'X'})` | `I.overrides.T.content = 'X'`; `get('I/T').content === 'X'`; invers `resetOverride('I/T', ['content'])` | `I/Zzz` tak ada → NOT_FOUND |
| Override akar | `update(I, {fills:[…], name:'Kartu A'})` | `name` ke instance, `fills` ke `overrides[F]` | `fills` tidak sah → SCHEMA_INVALID |
| Override tidak sah | `update('I/T', {size:-1})` / `{children:[]}` / `{component:…}` | ditolak | SCHEMA_INVALID |
| Ubah master | `update(T, {content:'Baru', color:'#111111'})` dengan override content | instance: content override tetap, color baru | - |
| Master membuat override basi | `replace(T, {type:'rect', …})`, override `{T:{content:'X'}}` | commit sukses; LC-32 `override` (content tidak sah); render tanpa content | - |
| Reset | `resetOverride('I/T')` | entri `T` hilang; invers memulihkan | bukan instance → SCHEMA_INVALID |
| Slot | `add('I/B', text)`, lalu `move(S, b)` | `I.slots.body = [S]`, lalu kunci `body` hilang | `I/T` bukan slot → SCHEMA_INVALID |
| Detach | `detach(I)` | frame biasa ID baru, override/props diterapkan, isi slot ID tetap; invers mengembalikan I | bukan instance → SCHEMA_INVALID |
| Hapus master | `remove(F)` dengan instance I1, I2 | satu rev: I1/I2 menjadi node biasa, F hilang; invers mengembalikan F, I1, I2 (ID sama) | - |
| Detach di dalam master | master N memuat instance J dari M; X instance N override `J/T`; `remove(M)` | J jadi node biasa di N; kunci X dipetakan ke ID baru; teks override X tetap | - |
| Komposit ke op lain | `remove('I/T')` | ditolak | SCHEMA_INVALID + hint |
| Route ops | `[{op:'setComponent'…}, {op:'add', ref:'i'…}, {op:'update', id:'@i/T'…}]` | satu commit; invers mengembalikan dokumen | kunci asing → SCHEMA_INVALID |

</intent-contract>

## Code Map

- `packages/schema/src/nodes.ts` -- shape node, skema ter-ekspansi. Tambah `EXPANDED_NODE_SHALLOW` (skema dangkal per tipe) dan `INSTANCE_KEYS`.
- `packages/schema/src/components.ts` -- `expandInstances`. Refactor ke pabrik ekspansi, tambah validasi longgar override/bind, `expandInstanceAt`, dan `expandedNodeAt`.
- `packages/schema/src/ops.ts` -- `DocOp` (+3 varian).
- `packages/core/src/tree.ts` -- `locate`/`indexNodes`/`subtree` dengan isi slot, dan `Location.slot`.
- `packages/core/src/components.ts` (baru) -- logika murni komponen: resolusi alamat slot/komposit, pembentukan node detach dan peta ID, pemetaan ulang kunci override/bind, serta pencarian instance per master.
- `packages/core/src/transaction.ts` -- op baru, perluasan `update/add/move/insert/remove/replace/duplicate`, dan invers.
- `packages/core/src/ops.ts` -- `OP_KEYS`/`switch` (+3 op, `@ref` di segmen pertama alamat).
- `packages/exec/src/api.ts` -- fungsi API baru, `get` komposit, `walk` isi slot, dan referensi "Komponen".
- `packages/mcp/src/server.ts` -- `EXECUTE_DESCRIPTION`.
- `packages/skills/skills/api.md` (dibuat ulang), `selection.md` -- skill.
- Tes:
  - `packages/schema/src/components.test.ts`;
  - `packages/core/src/components-ops.test.ts` (baru);
  - `packages/exec/src/index.test.ts`;
  - `packages/daemon/src/ops.test.ts`.

## Tasks & Acceptance

**Execution:**
- `packages/schema/src/nodes.ts` -- ekspor `EXPANDED_NODE_SHALLOW` dan `INSTANCE_KEYS`.
- `packages/schema/src/components.ts` -- validasi longgar dengan atribusi kunci, `expandInstanceAt`, `expandedNodeAt`. Ganti tes k2 "override tidak sah → SCHEMA_INVALID" menjadi "diabaikan + dilaporkan", dan tambah tes bind tidak sah dan master berganti tipe.
- `packages/schema/src/ops.ts` -- varian `setComponent`, `resetOverride`, `detach`.
- `packages/core/src/tree.ts`, `components.ts`, `transaction.ts`, `ops.ts`, `index.ts` -- op dan invers sesuai Boundaries.
- `packages/core/src/components-ops.test.ts` -- seluruh matriks, termasuk round trip invers (undo lalu redo, dokumen sama) untuk setiap op komponen, hapus master dengan instance bersarang, slot yatim, `duplicate` master/instance bersarang slot.
- `packages/exec/src/api.ts` -- API dan referensi. `packages/exec/src/index.test.ts` -- daftar API, alur agen (master → instance → override → ubah master → hapus master), `get` komposit, dan `find` isi slot.
- `packages/daemon/src/ops.test.ts` -- route ops komponen satu commit, invers lewat route, dan execute MCP-style.
- `packages/mcp/src/server.ts` -- deskripsi. `packages/skills/skills/api.md` -- `node scripts/gen-skill-api.mjs`. `packages/skills/skills/selection.md` -- satu butir alamat komposit.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- tandai deferred k2 (override/bind tidak sah) selesai.

**Acceptance Criteria:**
- Given daemon dan dokumen kosong, when agen lewat `execute` membuat frame master dengan teks, `setComponent`, menyisipkan dua instance, lalu `update('<I>/<T>', {content})`, then commit sukses dan `get('<I>/<T>').content` = override, sedangkan instance lain memakai teks master.
- Given dokumen itu, when fill/teks master diubah lewat `execute`, then `resolveDocument` menunjukkan kedua instance mendapat nilai master baru, kecuali properti yang di-override.
- Given master dengan instance, when `remove(master)` lewat `execute` atau route ops, then terjadi tepat satu rev baru, tidak ada instance yang merujuk master, dan node hasil detach tampil sama (properti efektif sama dengan sebelum hapus).
- Given setiap op komponen lewat route ops, when `inverse` respons dikirim, then `pages/tokens/tokenModes` sama dengan sebelum op, dan `inverse` respons undo mengembalikan keadaan sesudah op.
- Given override teks lalu master text diganti rect, when commit, then sukses dan check melaporkan LC-32 untuk instance itu (gerbang 0).

## Spec Change Log

## Review Triage Log

### 2026-11-22 - Review pass
- verdicts: 30 findings - high 0, medium 1, low 22, false 7, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) `update(I, {componentId, …nodeProps})` menyimpan override di kunci master lama.
    - Nyata: `prepareOverride` memakai `inst.componentId` sebelum bagian instance diterapkan.
    - Ditolak: menukar master sambil meng-override root dalam satu patch tidak dilakukan viewer maupun alur agen biasa, dan perbaikannya menambah cabang penolakan. Kasus `overrides` + properti node aman, karena invers `revertPatch` memulihkan peta utuh.
  - `[false]` `[reject]` (blind) `withRollback` tidak memotong `createdIds`, sehingga `created` memuat node yang dibatalkan. `commit` hanya melaporkan ID yang masih ada di `indexNodes(w)` (`if (hit) created.push`). Invers op gagal juga tidak terdaftar, karena `op()` hanya mendorong `inv` sesudah fn sukses.
  - `[false]` `[reject]` (blind) klaim "suntingan master tidak pernah ditolak" terlalu kuat (gridColumn sesudah layout berubah). `GridPlacement` dan semua refine node bersifat per node; tidak ada refine skema yang bergantung pada parent ("selain itu diabaikan render", nodes.ts). Validasi akhir hanya bisa gagal pada hal yang sama dengan skema dangkal.
  - `[low]` `[reject]` (blind) `update`/`replace` dengan `component` melewati validasi `setComponent`, dan slot yang dihapus tidak membersihkan isi slot instance.
    - Nyata, tetapi hasilnya tetap sah skema dan dilaporkan LC-32 (bind/slot basi). Ini jalur mentah yang longgar menurut Design Notes.
    - Ditolak: menyatukan validasi menambah cabang ke dua op lama; viewer (story 5) memakai `setComponent`.
  - `[low]` `[patch]` (blind) master bisa dibuat atau dipindah ke dalam master/slot dan baru ditolak saat commit.
    - Patch: `setComponent` kini menolak node di dalam master, node yang memuat master, dan node di isi slot, di op itu sendiri (`transaction.ts`). Tes baru di `components-ops.test.ts`.
    - `move`/`add` master ke slot dibiarkan ditangkap `componentIssues` saat commit, karena jarang terjadi.
  - `[low]` `[reject]` (blind) `detach` ber-`ref` yang hasilnya `null` membuat ref tidak terdaftar, dengan hint yang menyesatkan. Hanya terjadi pada instance yang akarnya disembunyikan prop sendiri lalu dirujuk ulang di permintaan yang sama, yang jarang. Perbaikannya menambah keadaan ref baru.
  - `[low]` `[patch]` (blind) regex alamat komposit diduplikasi. Patch: `isComposite` di `core/components.ts` kini `includes('/') && NODE_ADDRESS_PATTERN.test(v)`.
  - `[false]` `[reject]` (blind) pesan error op lama berubah, melanggar pembekuan bench.
    - AD-4 mencabut pembekuan: "Pesan dan hint error boleh diperbaiki". Kode tetap `SCHEMA_INVALID` untuk input komposit ke op lama.
    - `get` alamat komposit tidak pernah sah sebelumnya, jadi tidak ada input lama yang berubah kode. Input yang tidak cocok pola tetap `SCHEMA_INVALID`.
  - `[low]` `[patch]` (blind) doc `children` dan `get` tidak menyebut isi slot dan `childIds` instance. Patch: doc `children` (instance → isi slot) dan `get` (instance tanpa `childIds`) diperbarui; `api.md` dibuat ulang.
  - `[low]` `[reject]` (blind) spec tidak sinkron (status, log kosong, `index.ts` di Tasks, bentuk `expandedNodeAt`). Perbaikannya mengedit spec build ini; status dan log memang diisi di langkah ini.
  - `[low]` `[patch]` (blind) tes acceptance belum memverifikasi detach "tampil sama" dan `remove` master lewat route.
    - Patch: tes daemon baru untuk `remove` master lewat route ops: satu rev, node hasil detach punya bentuk efektif sama dengan instance sebelumnya, dan inverse mengembalikan dokumen.
    - Override bersarang `I/J/x` dan insert ke slot sudah dites di core (`components-ops.test.ts`: instance di dalam master lain, dan round trip remove isi slot).
  - `[low]` `[reject]` (blind) biaya ekspansi O(n·dokumen) saat menghapus master dengan banyak instance. Dokumen lokal satu pengguna (ratusan instance, ribuan node) tetap dalam orde milidetik. Cache per salinan kerja menambah keadaan yang harus diinvalidasi setiap mutasi.
  - `[low]` `[intent_gap]` (blind) duplikat subtree yang memuat master beserta instancenya: rujukan instance salinan belum diputuskan. Diputuskan: salinan instance tetap merujuk master asal (Design Notes, "Keputusan review k3"); tidak ada perubahan kode.
  - `[low]` `[reject]` (blind) `setComponent` belum menolak slot bersarang, frame ganda di dua slot, atau bind bertipe tidak cocok. Hasilnya diabaikan dan dilaporkan LC-32 tanpa kerusakan data. Definisi seperti itu jarang dibuat (panel props story 5 akan membatasinya), dan penolakannya menambah beberapa cabang validasi.
  - `[medium]` `[patch]` (edge) `duplicate(instanceBerslot, patch)` membawa isi slot asal ber-ID lama ke salinan, sehingga commit gagal karena ID ganda. Patch: salinan memakai `slots` hasil salinan ber-ID baru, kecuali patch membawa `slots` sendiri (`transaction.ts`). Tes round trip baru.
  - `[low]` `[reject]` (edge) `update(I, {fills})` pada instance yang akarnya tersembunyi memberi `NOT_FOUND`. Instance tersembunyi tidak tampil di canvas, jadi tidak bisa dipilih di viewer. Agen bisa mengubah prop-nya dulu. Perbaikan butuh jalur validasi kedua.
  - `[low]` `[reject]` (edge) ganti `componentId` bersama override akar. Satu akar dengan baris blind pertama; alasan yang sama.
  - `[low]` `[reject]` (edge) instance J tersembunyi di dalam master N yang dihapus lewat hapus master membuat kunci override dan bind luar menjadi yatim (LC-32). Kombinasinya langka, hasilnya dilaporkan tanpa kerusakan, dan perbaikannya menambah cabang hapus-kunci.
  - `[low]` `[reject]` (edge) masalah struktural lain di tengah transaksi membuat op komposit gagal (`komponen tidak valid`). Hanya terjadi bila snippet sengaja membuat dokumen tidak sah sementara; error-nya jelas dan tanpa korupsi. Membatasi cakupan validasi menambah kompleksitas.
  - `[low]` `[patch]` (edge) `setComponent` pada node di dalam master, memuat master, atau di isi slot lolos op lalu ditolak saat commit. Satu akar dengan baris blind master/slot; patch yang sama.
  - `[low]` `[reject]` (edge) slot frame bersarang di slot frame lain. Satu akar dengan baris blind validasi definisi; alasan yang sama.
  - `[low]` `[reject]` (edge, claim) ref `detach` yang hasilnya `null` tidak terdaftar. Satu akar dengan baris blind ref detach; alasan yang sama.
  - `[low]` `[patch]` (vgap) kanonikalisasi ikon lewat alamat komposit tidak dites. Patch: tes exec baru (alias `home` → `house` + `version` di override dan node efektif; nama asing → `ICON_UNKNOWN`).
  - `[low]` `[patch]` (vgap) `setComponent(k)` tanpa argumen pada master berdefinisi tidak dites. Patch: tes exec baru (props, slots, dan nilai bind tetap).
  - `[low]` `[patch]` (intent) verify "lewat MCP execute" hanya dites lewat HTTP `/execute`. Patch: tes baru di `packages/mcp/src/selection-flow.test.ts` (lakard asli + server MCP): master, dua instance, override, ubah master, dan hapus master dalam satu rev. Lulus lokal dengan Chromium Lakar.
  - `[false]` `[reject]` (intent) "sisipkan instance" dan "isi slot" bukan op kind baru.
    - AD-2 meminta kemampuan tulis berupa op core. `add` dengan node `instance` dan parent slot `I/F` adalah op core yang diekspos di `execute` dan route ops.
    - AD-12 sendiri merumuskan kemampuan komposit sebagai perluasan op yang ada.
  - `[false]` `[reject]` (intent) semantik ekspansi story 2 berubah. Prompt story ini meminta penanganan deferred k2 ("repair or downgrade as AD-12 says"); deferred itu sendiri menunjuk story 3.
  - `[false]` `[reject]` (intent) detach juga terjadi pada `replace` tanpa `component` dan `update {component:null}`. Tanpa itu, instance merujuk node yang bukan master dan commit ditolak `componentIssues`. Master yang hilang lewat jalur mana pun memang "hapus master" menurut AD-12.
  - `[false]` `[reject]` (intent) `update(instanceId, nodeProps)` menjadi override akar. Input itu dulu selalu `SCHEMA_INVALID` (skema instance strict), jadi tidak ada perilaku lama yang berubah. Jalur ini dibutuhkan panel Design viewer (story 4), dan `resetOverride(instanceId)` membalikkannya.
  - `[low]` `[intent_gap]` (intent) detach instance tersembunyi menghapusnya dan mengembalikan `null`. Diputuskan tetap begitu (Design Notes, "Keputusan review k3"): skema tidak punya `visible`, dan undo memulihkan instance.

## Design Notes

- **Bukan story UI.** Desain Pencil (bagian 08 Components) tidak dibaca karena tidak ada layar baru. Bentuk alamat slot `I/<frameSlot>` dipilih agar seleksi beralamat komposit di viewer (story 4) bisa langsung menjadi parent drop.
- **Longgar di ekspansi, ketat di jalur edit.** Nilai override/bind yang tidak lagi sah diabaikan dan dilaporkan (AD-12, LC-32). Dengan begitu, suntingan master tidak pernah ditolak karena override lama. Jalur edit komposit (`update`) tetap memvalidasi node efektif dengan `NodeInput`, sehingga agen mendapat `SCHEMA_INVALID` langsung. `update(I, {overrides: …})` mentah tetap longgar (data tetap sah skema; laporannya LC-32).
- **Detach rata.** AD-12 meminta "node biasa ber-id baru", jadi instance bersarang ikut menjadi node biasa. Isi slot instance tetap node tersimpan (ID sama) karena itu milik pengguna, bukan salinan master. Pilihan ini menjaga referensi agen.
- **Instance tersembunyi:** tidak ada properti `visible` di skema. Detach instance yang akarnya disembunyikan prop sendiri menghapusnya (tampilan efektif = tidak ada). Invers memulihkannya.
- **Invers reset = peta `overrides` lama utuh.** Ini selalu bisa diterapkan (juga untuk kunci yatim/basi), dengan risiko menimpa override lain di instance yang sama yang diubah di antaranya. Invers update komposit granular per properti. Bila nilai lama sudah tidak sah, undo gagal dan dibuang (AD-8).
- **Biaya:** setiap op komposit/detach mengekspansi satu instance (`expandInstanceAt`), bukan seluruh dokumen. Validasi struktural (`componentIssues`) tetap menelusuri seluruh dokumen per panggilan, dan itu cukup untuk dokumen lokal.
- **Atomik:** op yang men-detach beberapa instance memotret salinan kerja dulu (`withRollback`). Gagal di tengah → salinan dipulihkan, sehingga snippet yang menangkap error tidak melihat jejak (kontrak `Transaction`).
- **Celah story 2 yang ikut ditutup:**
  - `subtree` mengikutkan isi slot, sehingga `duplicate` instance berisi slot tidak lagi menghasilkan ID ganda;
  - `duplicate` master memetakan `binds`/`slots` ke salinan, sehingga salinan menjadi master baru yang sah.
- **`@ref/…`** di `applyOps`: segmen pertama alamat komposit boleh ref lokal, sehingga viewer bisa menyisipkan instance lalu meng-override isinya dalam satu permintaan. Hint "ref tidak dikenal" kini menyebut `detach`.
- **Keputusan review k3 (intent_gap, delegasi "terima jadi"):**
  - **Duplikat subtree yang memuat master beserta instancenya:** salinan instance tetap merujuk master asal, bukan master salinan. `duplicate` = salinan dengan ID baru tanpa menulis ulang rujukan. Master asal tetap sumber kebenaran (AD-12), dan memindah rujukan diam-diam akan mengubah tampilan salinan bila master salinan kemudian diubah terpisah. Override salinan tetap valid karena kunci relatif ke master yang sama.
  - **Detach instance tersembunyi** (akar disembunyikan prop boolean sendiri): instance dihapus dan hasilnya `null`, seperti di atas. Skema tidak punya `visible`, jadi "node biasa dengan props diterapkan" = tidak ada node. Undo memulihkannya.
- **`setComponent` di dalam master/slot** ditolak di op (bukan baru saat commit), sehingga snippet bisa menangkapnya dan route ops memberi prefiks `ops[i]`.
- **`get(alamat)`:** `path` = path tersimpan sampai parent instance + nama di dalam ekspansi. `get(instanceId)` tetap node tersimpan tanpa `childIds` (instance bukan kontainer tersimpan).

## Verification

**Commands** (Windows: awali dengan `set "PATH=C:\Users\Fatmuh\AppData\Local\nvm\v26.5.0;%PATH%" &&`; pnpm = `npx -y pnpm@12.21.0`):
- `npx -y pnpm@12.21.0 build` -- expected: sukses
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: 0 error
- `npx -y pnpm@12.21.0 exec vitest run packages/schema packages/core packages/exec packages/daemon/src/ops.test.ts tests/execute-description.test.ts tests/skills.test.ts tests/resolve-document.test.ts tests/dependency-direction.test.ts tests/doc-corpus.test.ts` -- expected: lulus kecuali baseline Windows
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`

## Auto Run Result

- **Ringkasan:**
  - Op komponen di core (AD-2, AD-12): `setComponent`, `resetOverride`, `detach`.
  - Perluasan op lama:
    - `update` ke alamat komposit, dan properti node pada instance, menjadi override instance terluar;
    - `add`/`move`/`insert` ke `I/<frameSlot>` mengisi slot;
    - master yang hilang (`remove`/`replace`/`component:null`/`setComponent(null)`) men-detach instancenya di commit yang sama, dengan kunci override dan bind luar dipetakan ulang.
  - Setiap op punya invers yang dites bolak-balik (AD-8).
  - Diekspos di `DocOp`/`applyOps` (route ops, termasuk `@ref/…`) dan `execute`. `get` menerima alamat komposit; `find`/`children` melihat isi slot.
  - Deferred k2 selesai: nilai bind/override yang tidak lagi sah diabaikan dan dilaporkan LC-32.
- **File:**
  - `packages/schema/src/{nodes,components,ops}.ts`:
    - `EXPANDED_NODE_SHALLOW`, `INSTANCE_KEYS`;
    - ekspansi longgar, `expandInstanceAt`, `expandedNodeAt`;
    - tiga varian `DocOp`.
  - `packages/core/src/components.ts` (baru): alamat slot, node detach, pemetaan ulang kunci.
  - `packages/core/src/{tree,transaction,ops}.ts`: `locate`/`indexNodes`/`subtree` dengan isi slot, op dan invers, dan `applyOps`.
  - `packages/exec/src/api.ts`: tiga fungsi API baru, `get` komposit, `walk` isi slot, referensi "Komponen".
  - `packages/mcp/src/server.ts`: `EXECUTE_DESCRIPTION`.
  - Skill: `packages/skills/skills/api.md` (dibuat ulang), `selection.md`.
  - Dokumen: `packages/check/README.md` (LC-32), `deferred-work.md` (k2 resolved).
  - Tes:
    - `packages/core/src/components-ops.test.ts` (baru, 23 tes);
    - `packages/schema/src/components.test.ts`;
    - `packages/exec/src/index.test.ts`;
    - `packages/daemon/src/ops.test.ts`;
    - `packages/mcp/src/selection-flow.test.ts`.
- **Review:** 30 temuan (medium 1, low 22, false 7).
  - Patch: 10 baris (8 entri), dengan verdict entri medium 1 dan low 7.
    - Medium: `duplicate` instance berslot dengan patch tidak lagi membawa ID isi slot asal.
    - Low:
      - `setComponent` menolak node di dalam master, node yang memuat master, dan node di isi slot, di op;
      - `isComposite` memakai `NODE_ADDRESS_PATTERN`;
      - doc `children`/`get` untuk instance;
      - tes route hapus master (tampilan sama + inverse);
      - tes ikon komposit;
      - tes `setComponent` tanpa argumen;
      - tes alur MCP execute (lakard asli).
  - intent_gap: 2, diputuskan dan dicatat di Design Notes: salinan instance tetap merujuk master asal, dan detach instance tersembunyi menghapusnya.
  - Defer: tidak ada.
  - Ditolak: 18 baris (11 low + 7 false), alasan per baris di Review Triage Log. Di antaranya: ganti `componentId` bersama override, validasi `component` di jalur update/replace mentah, ref `detach` null, biaya ekspansi O(n·dokumen), validasi definisi lanjutan, root instance tersembunyi, kunci yatim dari J tersembunyi, dan masalah struktural di tengah transaksi.
- **Follow-up review:** `false`. Pass pertama mem-patch 1 entri medium dan 7 low, tanpa high.
- **Verifikasi:**
  - `pnpm build` OK; `tsc -p tsconfig.test.json` 0 error; `api.md` dibuat ulang.
  - Suite core (179), exec (71), daemon ops (11), dan selection-flow MCP dengan Chromium asli (3) lulus.
  - `pnpm test` penuh: 53 gagal, semuanya di baseline Windows (0 kegagalan baru; 1852 lulus). Snapshot bench yang berubah CRLF saja dikembalikan.
- **Risiko sisa:**
  - Undo `resetOverride` memulihkan peta `overrides` utuh, sehingga bisa menimpa override lain yang diubah di antaranya.
  - Definisi `component` lewat `update`/`replace` mentah tidak divalidasi seketat `setComponent`; hasilnya dilaporkan LC-32.
  - Ekspansi per op O(dokumen).
  - `move`/`add` master ke slot baru ditolak saat commit.
