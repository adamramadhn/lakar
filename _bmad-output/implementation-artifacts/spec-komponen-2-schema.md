---
title: 'Skema komponen dan instance dengan tahap ekspansi di resolveDocument (epic komponen story 2)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: 'b804c2dd95f75c12563e8078eb5995b675695a10'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
  - '{project-root}/tests/fixtures/docs/README.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Override atau bind yang menjadi tidak sah karena master disunting (mis. node diganti tipe sehingga content tidak berlaku) menolak commit dengan SCHEMA_INVALID, bukan diabaikan dan dilaporkan.
    evidence: |-
      Review k2 (blind, edge). expandInstances memvalidasi seluruh pohon hasil ekspansi dengan skema strict; commit core memanggil resolveDocument (transaction.ts), jadi suntingan master yang membuat override instance tidak sah ditolak. Keputusan story ini: tetap tolak (AD-1 strict, AD-7 semua-atau-tidak, tanpa korupsi data); op komponen story 3 menambah perbaikan (reset/buang override yang tidak lagi berlaku) atau mengubahnya menjadi laporan LC-32.
    location: >-
      packages/schema/src/components.ts expandInstances (validasi hasil)
    severity: medium
  - summary: >-
      Canvas viewer dengan instance (mount isi terurai, seleksi alamat komposit, ikon/label Layers untuk instance) belum dites otomatis.
    evidence: |-
      Review k2 (intent, blind). Canvas memakai resolveDocument (Canvas.tsx) sehingga instance ikut termount, tetapi viewer belum punya harness DOM/E2E (pra-ada). Layers memakai ikon cadangan 'square' untuk tipe instance; penanda instance mengikuti desain di story 4.
    location: >-
      packages/viewer/src/Canvas.tsx, packages/viewer/src/icons.tsx NODE_ICON
    severity: low
---

<intent-contract>

## Intent

**Problem:** Dokumen belum mengenal komponen. Tanpa master dan instance di skema, tidak ada sistem desain yang bisa dipakai ulang, dan story op komponen (3), viewer (4), serta props/slot (5) tidak punya dasar. AD-10 sudah menyiapkan `resolveDocument` dengan tempat untuk tahap ekspansi instance; AD-12 menetapkan bentuknya.

**Approach:** Naikkan `SCHEMA_VERSION` ke 5 dengan `MIGRATIONS[4]` identitas.
- **Skema:** kunci `component {props, slots}` pada node anak non-instance (master) dan tipe node baru `instance {componentId, props?, overrides?, slots?}`.
- **Ekspansi:** `expandInstances` di `@lakar/schema` mengurai setiap instance menjadi salinan master dengan alamat komposit, menerapkan props, override, dan isi slot. Struktur yang rusak (siklus, master tak ada) ditolak. Referensi yang basi (override, prop, bind, slot yatim) diabaikan dan dilaporkan.
- **Pipa:** `resolveDocument` menjalankan ekspansi lalu token, jadi render, check, daemon, dan canvas langsung mendukung instance. `@lakar/check` mengubah laporan referensi basi menjadi temuan `LC-32` (warning).
- **Korpus:** fixture v5 berisi master, instance ber-override, instance bersarang, props, dan slot.

## Boundaries & Constraints

**Always:**
- **Master:** node anak bertipe frame/text/rect/ellipse/path/icon yang membawa `component`:
  - `component: { props: ComponentProp[], slots: ComponentSlot[] }` (keduanya wajib, boleh kosong; maks 64 props, 32 slots).
  - `ComponentProp`, dibedakan `type`:
    - `{name, type:'text', default: string, binds}`;
    - `{name, type:'boolean', default: boolean, binds}`;
    - `{name, type:'enum', options: string[1..32] unik tak kosong, default ∈ options, binds}`.
  - `binds: {nodeId: Id, prop: OverridableProp | 'visible'}[]` (maks 32). `nodeId` = master itu sendiri atau turunan tersimpannya.
  - `ComponentSlot: {name, nodeId: Id}`. `nodeId` menunjuk frame turunan master.
  - Nama prop dan slot: `^[a-z][A-Za-z0-9]{0,31}$` (aman jadi prop React, AD-16). Unik di antara gabungan props dan slots.
- **Instance:** `{type:'instance', id, name, position?, x?, y?, gridColumn?, gridRow?, componentId: Id, props?, overrides?, slots?}`:
  - `props?: Record<propName, string | boolean>`;
  - `overrides?: Record<kunci, Record<OverridableProp, unknown>>`. `kunci` = id node master (akar = `componentId`) atau path relatif ke dalam instance bersarang (`<idInstanceDalam>/<idMasterDalam>…`, pola `NODE_ADDRESS_PATTERN`). Nilai `null` menghapus properti master;
  - `slots?: Record<slotName, ChildNode[]>`. Node tersimpan dengan ID tersimpan sendiri.
- **`OVERRIDABLE_PROPS`:** semua kunci shape node anak kecuali `type`, `id`, `children`, dan `component`.
- **Validasi struktural (`componentIssues`, `SCHEMA_INVALID`):** dijalankan `LakarDocument` dan `expandInstances`. Isinya:
  - setiap `componentId` menunjuk master di dokumen yang sama;
  - tidak ada siklus. Graf: master → `componentId` setiap instance di subtree master, termasuk isi slot instance di dalamnya;
  - master tidak berada di dalam subtree master lain atau di isi slot;
  - ID tersimpan unik di seluruh dokumen, termasuk isi slot.
- **Ekspansi (`expandInstances(doc): ExpandedDocument`)** bersifat murni, tanpa mutasi, dan deterministik. Dokumen tanpa instance dikembalikan apa adanya. Untuk setiap instance:
  1. **Salin** subtree master. Akar mendapat id instance. Turunan mendapat `<alamatInstance>/<idTersimpan>`. Node yang berasal dari isi tersimpan di dalam salinan memakai prefiks pemiliknya, sehingga hasilnya `I/J/x` untuk instance bersarang. Salinan tidak membawa `component`.
  2. **Kunci posisi akar:** `name`, `position`, `x`, `y`, `gridColumn`, dan `gridRow` akar diambil dari instance, bukan dari master.
  3. **Props:** nilai instance yang sah atau, bila tidak ada, `default`. Nilai ditulis ke setiap bind. Bind `visible` bernilai `false` menghapus node terikat dari hasil.
  4. **Override:** merge dangkal per node. `null` menghapus properti.
  5. **Slot:** isi slot instance menggantikan anak frame slot. Isinya diekspansi dengan prefiks pemilik instance.
  6. **Validasi hasil:** seluruh pohon divalidasi dengan skema node ter-ekspansi (strict, id = alamat, tanpa `instance`). Gagal → `SCHEMA_INVALID` dengan konteks `instance tidak valid` dan alamat node.
- **Referensi basi:** diabaikan, lalu dicatat sebagai `InstanceIssue {boardId, instanceId, instanceName, kind, key, detail}`. `kind` ∈ `override | prop | slot | bind`. Contohnya override ke node master yang sudah hilang, prop tak dikenal atau salah tipe, slot tak dikenal, dan bind/slot master ke node yang hilang atau slot yang bukan frame.
  - Hanya instance di lokasi tersimpannya yang melapor. Salinan di dalam instance lain tidak melapor, supaya tidak ada duplikat.
  - Laporan dibaca lewat `instanceIssues(expandedOrResolved)`. `resolveDocument` meneruskannya ke hasilnya.
- **`resolveDocument`:** `assertTokensKnown` pada dokumen tersimpan (ref di override yatim tetap dicek), lalu `expandInstances`, lalu `resolveTokens`. `ResolvedDocument` = `Resolved<ExpandedDocument>` (tanpa `instance`).
- **`resolveTokens`** tetap menerima dokumen tersimpan (untuk codegen) maupun ter-ekspansi. Parse ulangnya menerima alamat komposit. Hasil dan error untuk dokumen tanpa instance tidak berubah.
- **Check:** aturan baru `LC-32` (warning, tanpa gerbang, `instance merujuk node master yang sudah tidak ada`). Satu temuan per `InstanceIssue` di board itu. `nodeId` = id instance.
- **Kompatibilitas (AD-3, AD-4):**
  - `MIGRATIONS[4]` hanya menaikkan versi; v1–v4 bermigrasi tanpa perubahan lain;
  - input node v4 tetap valid; route, tool, dan kode error lama tetap;
  - `NODE_TYPES` bertambah `instance` (`find` menerima `type:'instance'` dan mengembalikan node tersimpan);
  - `collectIds` di core ikut menelusuri isi slot, supaya ID baru tidak bertabrakan;
  - asersi versi 4 → 5 di tes lama.

**Never:**
- Op komponen di core/execute/route ops (jadikan master, sisip instance, update alamat komposit, reset, detach, hapus master yang men-detach). Itu milik story 3. Sampai saat itu, menghapus master yang masih punya instance ditolak `SCHEMA_INVALID` saat commit.
- `locate`/`indexNodes` di core masuk ke isi slot (story 3), UI viewer (story 4/5), dan codegen.
- Menyimpan isi instance yang terurai, atau menyimpan alamat komposit.
- Mengubah golden lama, arti kode error, atau default config.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Migrasi | dokumen v4 (`grid-galeri`) | `{...raw, schemaVersion:5}` | - |
| Tanpa instance | setiap fixture v1–v4 | `expandInstances(d) === d`; `resolveDocument` deep-equal hasil sebelumnya | - |
| Ekspansi dasar | master M (frame > text T), instance I `{componentId:M}` | node `I` (tipe frame, name dari I, tanpa `component`) dengan anak `I/T` | - |
| Ubah master | fill M diganti, I punya override `{T:{content:'X'}}` | fill `I` ikut berubah; `I/T.content` tetap `'X'` | - |
| Override akar / null | `{M:{fills:null}}` | `I` tanpa `fills` | - |
| Bersarang | M berisi instance J dari K (K > text U); I override `{'J/U':{content:'Y'}}` | node `I/J` dan `I/J/U` berisi `'Y'` | - |
| Props | text→`content` T, boolean→`visible` badge, enum→`icon` | nilai instance/default diterapkan; `false` → badge hilang | - |
| Slot | slot `body` di frame B; I `slots.body:[text S]` | anak `I/B` = `[S]` (id tersimpan S) | - |
| Siklus | M berisi instance M, atau M→N→M | ditolak | `SCHEMA_INVALID` menyebut siklus |
| Master hilang | instance `componentId` tak ada | ditolak | `SCHEMA_INVALID` |
| Master bersarang / ID ganda | master di dalam master; ID slot = ID lain | ditolak | `SCHEMA_INVALID` |
| Override yatim | key `Gone1234` | diabaikan; `instanceIssues` 1 entri `override`; check `LC-32` warning | - |
| Prop basi | prop tak dikenal / salah tipe / enum di luar options | default dipakai; issue `prop` | - |
| Override tak valid | `{T:{size:-1}}` | ditolak | `SCHEMA_INVALID` `instance tidak valid` + alamat `I/T` |
| Token salah slot via override | `{T:{color:{$token:'space.4'}}}` | ditolak | `SCHEMA_INVALID` token salah tipe |
| Kunci override terlarang | `{T:{children:[]}}` / `{T:{type:'rect'}}` | ditolak skema | `SCHEMA_INVALID` |

</intent-contract>

## Code Map

- `packages/schema/src/nodes.ts` -- `SCHEMA_VERSION`, `NODE_TYPES`, shape node. Tambah `ComponentDef`, instance, keluarga skema node (id tersimpan vs alamat, dengan/tanpa instance), dan tipe `Expanded*`.
- `packages/schema/src/component-issues.ts` (baru) -- `componentIssues`, `visitStored`, `hasInstances`/`hasComponents`. Tanpa impor nilai dari nodes.ts (nodes.ts mengimpornya untuk superRefine), jadi tidak ada siklus modul.
- `packages/schema/src/components.ts` (baru) -- `expandInstances`, `instanceIssues`/`attachInstanceIssues` (WeakMap), `InstanceIssue`, `EXPANSION_NODES_MAX`.
- `packages/schema/src/resolve.ts` -- pipa dua tahap.
- `packages/schema/src/tokens.ts` -- tipe `Resolved*` dari `Expanded*`, overload `resolveTokens`, dan parse ulang dengan skema alamat.
- `packages/schema/src/findings.ts` -- `LC-32`.
- `packages/check/src/index.ts`, `rules.ts`, `README.md` -- `RULE_ORDER`, dan temuan LC-32 dari `instanceIssues`.
- `packages/viewer/src/panels.tsx` -- label UI `LC-32`. Tipe node `instance` di viewer: diperlakukan sebagai leaf tersimpan.
- `packages/core/src/migrate.ts` -- `MIGRATIONS[4]`. `packages/core/src/ids.ts` -- `collectIds` menelusuri slot.
- `tests/fixtures/docs/v5/komponen-kartu.lakar.json`, `README.md`, `tests/doc-corpus.test.ts`, dan `packages/render/test/corpus.test.ts` (`resolveDocument` + cek `data-lakar-id` komposit) -- korpus.
- `tests/resolve-document.test.ts` -- penjaga AD-10 diperluas: kode produksi di luar schema juga tidak boleh memanggil `expandInstances`.
- `packages/render/test/visual.test.ts`, `bench/src/round/__snapshots__/round.test.ts.snap` -- `resolveDocument` (tipe) dan versi skema 5 di snapshot laporan.
- Tes versi lama:
  - `packages/schema/src/{index,v1,v2,v3,v4,findings}.test.ts`;
  - `packages/core/src/migrate.test.ts`;
  - `packages/daemon/src/store.test.ts`;
  - `bench/src/round/round.test.ts`.

## Tasks & Acceptance

**Execution:**
- `packages/schema/src/nodes.ts` -- skema komponen/instance, keluarga skema, `ExpandedDocument`, versi 5, superRefine `componentIssues`.
- `packages/schema/src/components.ts` + `index.ts` -- validasi struktural dan ekspansi.
- `packages/schema/src/resolve.ts`, `tokens.ts` -- pipa dan tipe.
- `packages/schema/src/findings.ts`, `packages/check/src/{index,rules}.ts`, `packages/viewer/src/panels.tsx` -- LC-32.
- `packages/core/src/migrate.ts`, `ids.ts` -- migrasi 4 → 5 dan ID slot.
- Perbaikan tipe di konsumen yang switch pada `node.type` (core, exec, viewer) bila `tsc` menuntut. Instance = leaf.
- `tests/fixtures/docs/v5/komponen-kartu.lakar.json` + README -- master dengan token, prop text/boolean/enum, slot; instance ber-override (akar dan anak), instance dengan slot dan prop, instance bersarang (alamat tiga segmen).
- Tes:
  - `packages/schema/src/components.test.ts` (baru) untuk seluruh matriks;
  - `packages/check/src/index.test.ts` untuk LC-32;
  - `packages/core/src/migrate.test.ts` untuk 4 → 5 dan `collectIds`;
  - `tests/doc-corpus.test.ts` untuk migrasi v1–v4 → v5 identitas, cakupan fixture v5, ubah master di fixture, dan `data-lakar-id` komposit lewat `mountBoard`/render korpus;
  - tes versi lama 4 → 5.

**Acceptance Criteria:**
- Given fixture korpus semua versi, when dimigrasi, divalidasi, `resolveDocument`, dan dirender per board di Chromium, then semuanya sukses (CI Linux).
- Given fixture v5, when fill master diubah lalu `resolveDocument`, then semua instance mendapat fill baru, sedangkan override teks di instance tetap.
- Given board fixture v5 dirender, when DOM diperiksa, then elemen isi instance membawa `data-lakar-id` berbentuk `<instanceId>/<masterNodeId>`, dan `<instanceId>/<J>/<U>` untuk instance bersarang.
- Given dokumen dengan override yatim, when check daemon berjalan pada board itu, then ada temuan `LC-32` warning untuk instance tersebut dan gerbang tetap 0.
- Given dokumen dengan siklus komponen, when `parseDocument` atau commit transaksi, then `SCHEMA_INVALID`.

## Spec Change Log

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 26 findings — high 0, medium 5, low 17, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) LC-32 palsu untuk override ke node instance bersarang yang disembunyikan `visible:false` atau terganti slot. Benar: ekspansi dalam memangkas sebelum indeks luar dibuat. Patch `components.ts`: alamat yang dibuang (prune/slot/akar tersembunyi) dicatat di `removed`, dan override/bind/slot ke alamat itu diam. Tes di `components.test.ts` ("bukan yatim").
  - `[medium]` `[intent_gap]` (blind) nilai override/bind tidak sah lolos commit lalu memecah resolve. Sebagian salah: commit core memanggil `resolveDocument` sehingga nilai tidak sah ditolak saat commit. Yang nyata: suntingan master yang membuat override lama tidak sah ditolak. Diputuskan tetap tolak (AD-1/AD-7, aman tanpa korupsi), perbaikan oleh op story 3; ditunda (deferred).
  - `[low]` `[reject]` (blind) masalah bind/slot level master dilaporkan per instance, dan hilang bila master tanpa instance. Tanpa instance tidak ada efek tampilan; duplikat dibatasi `capWarnings` 3 per aturan. Memindah pelaporan ke master menambah cabang baru.
  - `[low]` `[patch]` (blind) judul LC-32 dan label UI hanya menyebut override. Diganti: `findings.ts` "instance tidak lagi cocok dengan masternya (override, prop, slot, atau bind basi)"; `panels.tsx` "Instance no longer matches its master".
  - `[low]` `[patch]` (blind) laporan WeakMap hilang saat disalin; jalur daemon tanpa tes. Jalur daemon sekarang tidak menyalin (`check.ts` meneruskan objek yang sama), tetapi tesnya memang tidak ada. Ditambah `packages/daemon/src/check.test.ts` (`runCheck` dengan RenderPort tiruan → LC-32, gerbang 0).
  - `[low]` `[reject]` (blind) override/bind pada akar bisa menimpa `name/position/x/y/grid*`. Hanya bisa lewat override eksplisit ke `componentId` yang ditulis agen; alamat akar = id instance, jadi edit biasa mengenai instance. Penjaga baru menambah cabang.
  - `[false]` `[reject]` (blind) tool/route lama kini menerima `component` dan `instance`. AD-4 mencabut pembekuan dan hanya menjaga input lama tetap valid; semua input v4 tetap diterima, dan respons hanya bertambah. Update ke alamat komposit → NOT_FOUND (milik story 3).
  - `[low]` `[reject]` (blind) Code Map menjanjikan penanganan tipe viewer/core/exec yang tidak ada di diff. Task bersyarat "bila tsc menuntut"; `tsc -b` bersih, dan viewer memakai fallback (`NODE_ICON[...] ?? 'square'`). Penanda instance milik story 4; dicatat di deferred.
  - `[false]` `[reject]` (blind) celah proses: deferred kosong, triage tidak ada. Butir "Never" adalah story 3–5 di tickets.toml, bukan pekerjaan tertunda; triage log dan deferred diisi pada langkah ini.
  - `[low]` `[patch]` (blind) pola kunci override menduplikasi `NODE_ADDRESS_PATTERN`. `nodes.ts` `OverrideKey` kini memakai konstanta itu.
  - `[low]` `[patch]` (blind) penelusuran berulang dan anggaran node menghitung node tersimpan biasa. Anggaran: patch, hanya salinan di dalam instance yang dihitung. Penelusuran berulang: ditolak (dokumen lokal kecil; menggabung pass menambah kompleksitas).
  - `[low]` `[patch]` (blind) celah cakupan: isi slot berisi instance, prefiks pemilik di salinan master. Tes baru di `components.test.ts`. Override `null`, enum di luar options, dan determinisme/tanpa mutasi sudah dites di unit `components.test.ts`.
  - `[medium]` `[intent_gap]` (edge) bind bertipe tidak cocok (mis. prop text ke `size`) membuat seluruh dokumen gagal resolve. Satu akar dengan baris intent_gap blind; keputusan dan deferred yang sama.
  - `[medium]` `[intent_gap]` (edge) override tersimpan menjadi tidak sah setelah master disunting, sehingga commit ditolak. Satu akar; keputusan yang sama.
  - `[low]` `[patch]` (edge) akar instance disembunyikan prop sendiri tetapi tetap melapor, dengan nodeId yang tidak ada di board. Patch: laporan instance itu dibuang saat akarnya tersembunyi (`issues.length = mark`); dites.
  - `[medium]` `[patch]` (edge) override `J/U` ke instance bersarang yang tersembunyi menghasilkan LC-32 palsu. Satu akar dengan baris blind pertama; patch yang sama.
  - `[low]` `[patch]` (edge) penghitung anggaran juga menghitung node biasa. Satu akar dengan baris anggaran blind; patch yang sama.
  - `[medium]` `[intent_gap]` (edge, claim) hanya referensi node-hilang yang diabaikan; yang tidak cocok skema melempar. Satu akar dengan baris intent_gap blind; keputusan yang sama.
  - `[low]` `[patch]` (vgap) LC-32 per board tidak dites dengan dua board. Tes dua board ditambah di `check/src/index.test.ts` dan `components.test.ts`.
  - `[low]` `[patch]` (vgap) `resolveTokens` pada dokumen tersimpan berisi instance tidak pernah dijalankan. Tes murah ditambah di `components.test.ts`: instance utuh, ref di master dan override diganti.
  - `[low]` `[reject]` (vgap, other) `resolveTokens` jalur tersimpan tidak mengecek tipe token di override/slot. Hanya untuk konsumen codegen yang belum ada; `resolveDocument` mengeceknya pada pohon ter-ekspansi. Perbaikan butuh walker baru.
  - `[low]` `[patch]` (intent) finding LC-32 di jalur check daemon tanpa tes otomatis. Satu akar dengan baris WeakMap blind; `daemon/src/check.test.ts`.
  - `[low]` `[defer]` (intent) canvas viewer tidak diubah/dites dengan instance. Canvas sudah memakai `resolveDocument`; harness DOM viewer belum ada (pra-ada). Cast `Viewer.tsx:333` hanya dipakai untuk mencari nilai ter-resolve per id; id komposit tambahan tidak berbahaya. Ditunda.
  - `[false]` `[reject]` (intent) render korpus di CI Linux hanya berupa kode. CI memasang chromium-headless-shell (`ci.yml`), dan tes korpus juga berjalan lokal: 11/11 termasuk v5 dan `data-lakar-id` komposit.
  - `[low]` `[patch]` (intent) "mengubah master" hanya lewat mutasi objek. Tes baru lewat `beginTransaction().update` + commit di `tests/doc-corpus.test.ts`.
  - `[low]` `[patch]` (intent) siklus saat commit transaksi tidak dites. Tes baru: `add` instance master ke dalam dirinya → commit `SCHEMA_INVALID`, dokumen asli utuh.

## Design Notes

- **Bukan story UI.** Tidak ada perubahan tampilan selain label temuan LC-32 di panel check yang sudah ada, dengan teks Inggris mengikuti pola label lain. Desain Pencil tidak dibaca karena tidak ada layar baru.
- **Urutan tahap:** props, lalu override, lalu slot, lalu penghapusan node `visible:false`.
  - Override menang atas props karena override adalah edit langsung yang paling spesifik.
  - Slot diterapkan sesudah override, supaya override ke anak default slot tidak dianggap yatim.
  - Yatim = node master tidak ada di salinan, bukan "tersembunyi" atau "terganti slot".
- **Pembagian ketat vs longgar:**
  - Struktur yang tidak bisa diekspansi ditolak, yaitu siklus dan master tak ada. Penghapusan master akan men-detach di story 3.
  - Referensi yang wajar menjadi basi karena master disunting diabaikan dan dilaporkan, sesuai AD-12 untuk override.
- **Nilai override** bertipe `unknown` per properti yang diizinkan. Nilai divalidasi skema strict pada node hasil ekspansi, sehingga AD-1 tetap berlaku pada node efektif. Nilai override yatim tidak divalidasi selain ref token-nya.
- **Laporan basi** dibawa lewat WeakMap pada objek hasil, bukan field dokumen. Dengan begitu check tetap hanya menerima hasil `resolveDocument` (AD-10), dan skema dokumen tetap tertutup.
- **Bind `visible`** hanya untuk prop boolean. Pada prop text/enum, bind ini diabaikan dan dilaporkan (`bind`); tidak ditolak skema karena perlu tahu tipe prop dan bind bersamaan.
- **Master tidak menerapkan default props pada dirinya**: node master tampil apa adanya; default hanya berlaku pada instance. Ini menghindari master yang berbeda dari node tersimpannya di canvas.
- **`resolveTokens` parse ulang** memakai `LakarDocument` bila dokumen masih berisi instance (jalur codegen), selain itu `ExpandedLakarDocument`, sehingga pesan error dokumen tanpa instance tetap sama.
- **Batas ekspansi** `EXPANSION_NODES_MAX = 50000` node per dokumen mencegah ledakan instance bersarang; melewatinya → `SCHEMA_INVALID`.
- **Smoke daemon (msedge, data dir sementara):** dokumen v5 dibuka, `layout-check` mengembalikan LC-32 untuk override yatim dengan gerbang 0, `screenshot` merender master/instance/props/slot/override dengan benar, dan dokumen v4 ditulis balik sebagai v5.
- **Keputusan review (intent_gap, delegasi "terima jadi"):** override/bind yang tidak sah terhadap node efektif menolak commit/resolve, alih-alih diabaikan. Alasannya AD-1 (skema strict pada node efektif) dan AD-7 (semua-atau-tidak), dan tidak ada data yang rusak. AD-12 hanya mewajibkan "abaikan dan laporkan" untuk override yang node masternya hilang. Perbaikan otomatis milik op komponen story 3 (lihat deferred).
- **Node yang dibuang bukan yatim:** override/bind/slot ke alamat yang ada di salinan tetapi dibuang (`visible:false`, anak default slot, termasuk di instance bersarang) diam, tanpa laporan. Instance yang akarnya tersembunyi tidak melapor.
- **Contoh:**

```json
{ "type": "instance", "id": "InsCard1", "name": "Card / promo", "componentId": "MstCard1",
  "props": { "title": "Promo" },
  "overrides": { "MstCard1": { "fills": [{ "type": "solid", "color": "#FEF3C7" }] }, "InsBadg1/TxtBadg1": { "content": "Baru" } },
  "slots": { "body": [{ "type": "text", "id": "TxtSlot1", "name": "Isi", "content": "…", "size": 14 }] } }
```

## Verification

**Commands** (Windows: awali dengan `set "PATH=C:\Users\Fatmuh\AppData\Local\nvm\v26.5.0;%PATH%" &&`; pnpm = `npx -y pnpm@12.21.0`):
- `npx -y pnpm@12.21.0 build` -- expected: sukses
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: 0 error
- `npx -y pnpm@12.21.0 exec vitest run packages/schema packages/core packages/check packages/render tests/doc-corpus.test.ts tests/resolve-document.test.ts tests/dependency-direction.test.ts` -- expected: semua lulus, kecuali baseline Windows
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`

## Auto Run Result

- **Ringkasan:**
  - Skema v5 (AD-3, AD-12): master `component {props, slots}` dan tipe node `instance`, dengan migrasi 4 → 5 identitas.
  - `expandInstances` (alamat komposit, props, override, slot, `visible`) menjadi tahap 1 `resolveDocument` (AD-10).
  - Validasi struktural: siklus, master tak ada, master bersarang, ID ganda.
  - Referensi basi dilaporkan sebagai LC-32 (warning, tanpa gerbang).
  - Fixture korpus v5.
- **File:**
  - `packages/schema/src/{nodes,component-issues,components,resolve,tokens,findings,index}.ts`, `README.md` -- skema, ekspansi, pipa, aturan.
  - `packages/check/src/{index,rules}.ts`, `README.md` -- LC-32.
  - `packages/viewer/src/panels.tsx` -- label LC-32.
  - `packages/core/src/{migrate,ids}.ts` -- migrasi 4 → 5, `collectIds` menelusuri slot.
  - `tests/fixtures/docs/v5/komponen-kartu.lakar.json`, `tests/fixtures/docs/README.md` -- korpus.
  - Tes baru:
    - `packages/schema/src/components.test.ts`;
    - `packages/daemon/src/check.test.ts`.
  - Tes yang diperluas:
    - `tests/doc-corpus.test.ts`;
    - `tests/resolve-document.test.ts` (penjaga `expandInstances`);
    - `packages/check/src/index.test.ts`;
    - `packages/render/test/corpus.test.ts` (`data-lakar-id` komposit).
  - Tes versi lama 4 → 5:
    - `packages/schema/src/*.test.ts`, `packages/core/src/migrate.test.ts`, `packages/daemon/src/store.test.ts`;
    - `bench/src/round/round.test.ts` + snapshot;
    - `packages/render/test/visual.test.ts` (tipe).
- **Review:** 26 temuan.
  - Patch: 15 baris (12 entri).
    - Akar 1 (medium): override ke node bersarang yang dibuang tidak lagi yatim.
    - Lainnya (low): judul/label LC-32, pola kunci override, anggaran ekspansi hanya untuk salinan, laporan instance tersembunyi dibuang.
    - Tes baru (low): dua board, `resolveTokens` tersimpan, `runCheck` daemon, transaksi ubah master, siklus saat commit, slot berisi instance.
  - intent_gap: 4 baris, satu akar (medium). Diputuskan tetap tolak override/bind tidak sah, dan ditunda ke story 3.
  - defer: 1 baris (canvas viewer tanpa harness).
  - Ditolak: 6 baris (3 false + 1 false CI; 5 low). Alasan per baris ada di Review Triage Log.
- **Follow-up review:** `false`. Patch medium hanya satu entri, dan tidak ada high.
- **Verifikasi:**
  - `pnpm build` OK; `tsc -p tsconfig.test.json` 0 error.
  - Suite schema/core/check/korpus/penjaga/render korpus/bench round lulus.
  - `pnpm test` penuh: 53 gagal, semuanya ada di baseline Windows; 0 kegagalan baru (1808 lulus). Snapshot `bench/src/__snapshots__/report.test.ts.snap` yang berubah CRLF dikembalikan.
  - Smoke daemon msedge (Fase A) lulus: LC-32 gerbang 0, screenshot instance benar, v4 → v5 ditulis balik.
- **Risiko sisa:**
  - Suntingan master yang membuat override lama tidak sah menolak commit (sampai story 3).
  - Menghapus master yang masih punya instance ditolak (detach di story 3).
  - Laporan LC-32 bergantung pada identitas objek hasil `resolveDocument`.
  - `locate`/`indexNodes` core belum masuk isi slot (story 3).
