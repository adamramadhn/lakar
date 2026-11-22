---
title: 'Komponen dan instance di codegen (epic kode story 3)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: '046c64d92d2f387be1a7960a7b00421f209fb507'
review_loop_iteration: 1
followup_review_recommended: true
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `@lakar/codegen` (story 2) meng-inline setiap instance lewat `expandInstances`, sehingga master diekspor sebagai salinan statis. AD-16 meminta master menjadi komponen React (props bertipe, slot sebagai `ReactNode`) dan instance menjadi pemakaian komponen beserta props, override, dan isi slot (AD-12). Mengubah master harus mengubah komponen tanpa mengubah pemanggilan instance.

**Approach:**
- Setiap master yang dipakai di subpohon ekspor menjadi file `components/<Name>.tsx` (+ `.module.css` untuk target CSS).
- Isi komponen diturunkan dari ekspansi instance sintetis master lewat `expandInstances` (AD-10) pada dokumen salinan. Setiap prop boolean/enum dijelajahi per opsi, sehingga elemen yang dipengaruhi prop menjadi varian (kelas/teks/SVG/kehadiran per nilai prop). Prop text yang terikat `content` menjadi `{prop}`, dan slot menjadi `{slot ?? default}`.
- Setiap instance (dan master yang berdiri di canvas) dicek: hasil komponen untuk props-nya, ditambah selisih deklarasi akar dan isi slot, harus sama persis dengan pohon ter-ekspansi aslinya. Bila sama, instance ditulis sebagai `<Name …/>`. Bila tidak, instance di-inline seperti story 2 dan muncul warning.

## Boundaries & Constraints

**Always:**
- **API:** opsi baru `generateCode(doc, { …, components?: boolean })`, default `true`. `false` = keluaran story 2 persis (semua di-inline), sesuai toggle desain 09 "Components as separate files". Fungsi baru `iconRefs(doc, opts)` → `{lib, icon}[]` unik terurut: semua ikon yang diminta ekspor, termasuk varian enum, untuk pemanggil story 5.
- **Berkas** (urutan tetap):
  1. `<Main>.tsx` (+ `<Main>.module.css`);
  2. per komponen, urut ditemukan pre-order: `components/<Comp>.tsx` (+ `components/<Comp>.module.css`);
  3. `tokens.css` (+ `theme.css` untuk Tailwind).
  - Impor: `./components/<Comp>` dari main, `./<Comp>` antar komponen.
  - Nama komponen = PascalCase nama master, unik terhadap main dan komponen lain (sufiks angka).
  - `nodeId` = master → main adalah komponen itu sendiri (berkas `<Comp>.tsx` di akar, tanpa `data-theme`).
- **Komponen:**
  - `export type <Comp>Props = { <prop>?: string | boolean | 'a' | 'b'; <slot>?: ReactNode; className?: string; style?: CSSProperties }`.
  - `export function <Comp>({ prop = default, …, slot, className, style }: <Comp>Props)`.
  - Akar = master sebagai anak flow kolom tanpa posisi (seperti akar node story 2), dengan `className` dan `style` pemanggil digabung (pemanggil menang).
  - Prop text dengan semua bind `(text, content)` (atau `name`) yang menjadi sumber terakhir `content` → `{prop}`. Prop text lain tidak diekspor (warning `prop-unsupported`).
  - Prop boolean/enum:
    - Elemen yang deklarasi, `::after`, teks, SVG, atau kehadirannya berubah menurut prop menjadi varian.
    - Varian ditulis sebagai ternary atau lookup objek. Kelas per varian di modul CSS, string kelas di Tailwind, dan `cond && <el/>` untuk kehadiran.
    - Kombinasi per elemen dibatasi 64. Bila lewat batas, komponen tidak diekspor (warning `component-too-complex`) dan instancenya di-inline.
  - Instance bersarang di master → pemakaian komponen bila lolos cek pemakaian dan turunannya tidak berubah menurut prop luar (kehadiran dan kelas akarnya boleh bervariasi). Selain itu di-inline.
- **Pemakaian:**
  - Props = nilai instance yang sah dan berbeda dari default. Nilai prop text dibaca dari teks node terikat di pohon asli (override `content` pada node terikat jadi prop).
  - Slot ditulis (`slot={<…/>}`, fragment bila ≠ 1 anak atau bersyarat) bila anak frame slot asli ≠ default komponen. Ini mencakup isi slot tersimpan dan override pada isi default slot.
  - Selisih deklarasi akar (penempatan terhadap parent, override akar) → kelas pemakai.
    - Selisih dihitung per keluarga shorthand: `gap`, `flex` (grow/shrink/basis), `flex-flow` (direction/wrap), `background*`, `margin*`, `padding*`, `overflow*`, `border-radius*`, `border*`, `grid-template*`, `mask*`, `font*`. Satu keluarga yang berbeda ditulis utuh dari pohon asli. Properti komponen yang tidak ada di pohon asli ditulis `unset`.
    - Keluarga yang juga ditulis komponen diberi `!important` (CSS) atau sufiks `!` (Tailwind).
    - Nilai yang butuh inline (aturan story 2) ditulis ke `style`.
  - Gagal cek → inline (turunan instance bersarang tetap dicoba sebagai pemakaian), dengan warning `instance-inlined`. Gagal cek terjadi bila elemen non-akar, `::after`, atribut, tag, atau jumlah anak berbeda.
  - Akar ekspor berupa instance yang butuh `data-theme` → di-inline.
- **Kesetaraan:** pohon efektif ekspor (komponen dievaluasi dengan props, kelas pemakai di-cascade, slot disisipkan) sama dengan pohon inline story 2 per elemen, kecuali nama kelas dan id. Deklarasi dibandingkan per keluarga.
- **Warning:**
  - Warning ikut elemen yang benar-benar ditulis, dedup per `code+nodeId+message`.
  - Id node di dalam komponen = id relatif master (id tersimpan, atau komposit untuk isi instance bersarang).
- Murni dan deterministik (id instance sintetis `Cg` + 6 digit base36 yang tidak dipakai dokumen). Deps tetap `schema` + `render`. Ekspansi hanya lewat `expandInstances`.

**Never:**
- Mengubah skema, render, viewer, daemon, MCP, atau Copy as. Menambah tag semantik (deferred story 2).
- Prop/kelas override per elemen dalam (`classNames`), helper runtime, atau dependensi baru (mis. tailwind-merge).
- Menyalin aturan ekspansi (props/override/slot) di codegen. Semua lewat `expandInstances`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Master + instance default | Card di canvas + instance tanpa props di parent kolom | `components/Card.tsx`; main `<Card />` (tanpa className bila selisih kosong) | - |
| Prop text | instance `title:'Promo'` | `<Card title="Promo" />`; komponen `{title}` | - |
| Override content node terikat | override `TxtCard1.content='X'` | `<Card title="X" />` | - |
| Boolean visible | `showBadge:false` | `<Card showBadge={false} />`; komponen `{showBadge && <Badge … />}` | - |
| Enum ke ikon | `tone:'check'` | SVG bersyarat per opsi (`{tone === "check" && (<svg …/>)}`); `iconRefs` memuat star dan check | glyph hilang → `icon-glyph-missing` |
| Slot | `slots.body=[text]` | `body={<div …>…</div>}`; komponen `{body ?? (<default/>)}` | - |
| Override di isi default slot | override `TxtCard2.color` | slot ditulis dengan isi default ber-override | - |
| Override akar | override `MstCard1.fills` | kelas pemakai `background-color: #FEF3C7 !important` | - |
| Row parent | instance lebar 280 di row | kelas pemakai `flex: 0 0 280px !important` | - |
| Absolute | instance absolute x/y | kelas pemakai `position: absolute !important; left; top; …` | - |
| Override tak terekspresi | override `InsBadg0/TxtBadg1.content` | instance di-inline; Badge di dalamnya tetap `<Badge label="Hemat" />` | warning `instance-inlined` |
| components:false | dokumen apa pun | identik byte dengan story 2 | - |
| Ubah master | padding/fill master diubah | berkas komponen berubah; `<Main>.tsx` (dan modul main) tidak | - |

</intent-contract>

## Code Map

- `packages/codegen/src/tree.ts` -- pohon elemen flat; ditambah penanda akar instance/master, warning per elemen, dan pembangun subpohon dengan konteks parent.
- `packages/codegen/src/emit.ts` -- penulis TSX/modul CSS/Tailwind lama (tetap untuk `components:false`).
- `packages/codegen/src/index.ts` -- `generateCode`; percabangan `components`.
- `packages/codegen/src/names.ts` -- `NameAllocator`, `pascalName`.
- `packages/codegen/src/tailwind.ts` -- `declToTailwind`, `needsInlineStyle`.
- `packages/schema/src/components.ts` -- `expandInstances` (satu-satunya pintu ekspansi).
- `tests/codegen.test.ts`, `tests/fixtures/codegen/` -- golden korpus, oracle css.ts, typecheck.

## Tasks & Acceptance

**Execution:**
- `packages/codegen/src/tree.ts` -- tambah `instance` marker dan `warnings` per `CodeElement`; ekspor `nodeElement(ctx, node, parent, scrollY, negGap)` dan `makeCtx`. `buildTree` tetap mengisi array warning (kompatibel).
- `packages/codegen/src/jsx.ts` (baru) -- model JSX antara (elemen, teks/prop, slot, pemakaian, kondisi, varian ber-driver); evaluator ke pohon flat (`evalRoot`); penulis TSX + modul CSS / kelas Tailwind per berkas.
- `packages/codegen/src/components.ts` (baru) -- dokumen sintetis + `expandInstances`, model komponen (state per node per kombinasi, driver minimal), cek pemakaian (props, slot, selisih akar per keluarga), keputusan inline.
- `packages/codegen/src/index.ts` -- opsi `components`, susunan berkas, `iconRefs`, ekspor API baru.
- `packages/codegen/src/components.test.ts` (baru) -- unit tes matriks di atas.
- `tests/codegen.test.ts` -- glyph lewat `iconRefs`; oracle per properti lama dijalankan dengan `components:false`; tes baru kesetaraan pohon efektif = pohon inline untuk semua board korpus dan fixture komponen; fixture `tests/fixtures/codegen/komponen.lakar.json` + golden; tes "ubah master"; typecheck semua berkas (termasuk `components/`).
- `tests/fixtures/codegen/*.components.txt` (baru) -- golden dengan komponen untuk dokumen yang memuat instance (v5 + fixture); dokumen lain diuji identik byte dengan `components:false`; golden story 2 `<label>.<target>.txt` tidak berubah (dijalankan dengan `components:false`).
- `packages/codegen/README.md` -- komponen, opsi, batas.

**Acceptance Criteria:**
- Given fixture dengan master, instance ber-override, dan slot, when `generateCode` dijalankan untuk kedua target, then ada satu berkas `components/<Comp>.tsx` per master yang dipakai dan `<Main>.tsx` mengimpornya serta memakai `<Comp …/>` dengan props, kelas override, dan isi slot.
- Given fixture yang master-nya diubah (padding dan fill), when diekspor ulang, then berkas komponen berubah sedangkan `<Main>.tsx` dan `<Main>.module.css` identik byte.
- Given semua board korpus dan fixture, when pohon efektif ekspor dievaluasi, then sama dengan pohon inline (`components:false`) per elemen.
- Given semua berkas TSX hasil ekspor (kedua target, termasuk `components/`), when di-typecheck `tsc` strict, then 0 error.
- Given `components:false`, when korpus diekspor, then keluaran sama dengan golden story 2.

## Spec Change Log

### 2026-11-22 - Loop 1 (review c3)
- **Pemicu:** edge E1, E2, dan E15 (bad_spec). Driver per node hanya dideteksi dari flip satu prop dari default, ditambah kombinasi penuh driver yang sudah terdeteksi. Akibatnya ada dua celah:
  - node yang hanya hadir bila dua prop non-default (parent dibuka A, anak dibuka B) tidak pernah masuk template;
  - prop yang efeknya hanya terlihat saat prop lain non-default (warna node yang tersembunyi secara default) tidak menjadi driver.
- **Diamandemen (di luar intent-contract):** Design Notes "Penemuan driver (titik tetap)".
  - Seed driver per node dari bind langsung.
  - Driver parent diwariskan.
  - Loop titik tetap: untuk setiap node, setiap kombinasi drivernya, dan setiap prop lain, prop itu menjadi driver bila flip-nya mengubah state node. State mencakup daftar anak node.
  - Dokumen sintetis berisi master saja.
- **Keadaan buruk yang dihindari:** berkas komponen yang salah untuk kombinasi prop yang tidak dipakai dokumen. Pemakaian di dokumen tetap benar karena dicek, tetapi konsumen API komponen mendapat node yang hilang atau varian yang salah.
- **KEEP:**
  - model JSX + evaluator yang sama untuk cek dan penulisan;
  - akar komponen = anak flow kolom;
  - selisih akar per keluarga dengan `!important` hanya bila bentrok;
  - override isi default slot → slot;
  - `components:false` identik byte dengan story 2;
  - golden korpus dan fixture tetap;
  - tes kesetaraan pohon efektif = inline.

## Review Triage Log

### 2026-11-22 - Review pass
- verdicts: 37 findings - high 0, medium 11, low 21, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) Nama prop/slot yang sah menurut skema (`default`, `class`, `className`, `style`, `styles`, `key`, `ref`, …) merusak TSX.
    - Fix: `RESERVED_NAMES` di `components.ts`. Prop/slot bernama itu tidak diekspor dan diberi warning `prop-unsupported`. Instance yang nilainya berbeda dari default dicek seperti biasa (selisih akar → kelas, selain itu inline).
    - Tes: `style` enum.
  - `[low]` `[patch]` (blind) Kunci gabungan `lookupExpr` (`a|b` dan `"true"`) bisa bentrok. Fix: lookup bersarang per driver (ternary/objek), tanpa kunci gabungan. Tes `a|b`.
  - `[medium]` `[patch]` (blind) `component()` menelan semua galat sebagai `component-too-complex`. Fix: hanya `LakarError` (galat schema/batas ekspansi) yang menjadi fallback; galat lain dilempar.
  - `[medium]` `[patch]` (blind) Setiap ekspansi sintetis mengekspansi seluruh dokumen, dan anggaran node tidak menghitung dokumen. Fix: dokumen sintetis hanya berisi semua master + instance sintetis dalam satu board.
  - `[false]` `[reject]` (blind) `family` kurang `line-height`/`inset` dan shorthand lain. `css.ts` tidak pernah menulis `font`, `place-*`, `transition`, `outline`, `list-style`, atau `text-decoration`, dan longhand `grid-row-*`. `inset` hanya ada di `::after`, yang dibandingkan utuh, bukan lewat selisih akar. Jadi kaskade yang salah tidak terjadi.
  - `[false]` `[reject]` (blind) `normAttr` menyembunyikan beda atribut.
    - Atribut node elemen hanya `data-theme`. Nilai atribut SVG berasal dari spec render (`d`, `viewBox`, warna, id/url), dan hanya id/url yang berakhiran `-stroke`.
    - Beda geometri tetap terlihat di `d`/atribut lain. Id adalah referensi internal svg yang sama.
  - `[low]` `[reject]` (blind) Risiko id stroke bersama tidak dilacak, dan bagian log spec kosong. Perbaikannya administrasi spec build ini. Log diisi pass ini, dan risikonya dicatat di Auto Run Result.
  - `[low]` `[patch]` (blind) Matriks dan tes kurang kasus tepi.
    - master hilang / siklus: ditolak `componentIssues` sebelum codegen, jadi tidak terjangkau;
    - instance di isi slot: sudah di fixture (`InsTmb02`);
    - ditambahkan tes nama master kembar (`Button`/`Button2`) dan instance bersarang yang di-inline di dalam komponen.
  - `[low]` `[patch]` (blind) Template `className` akar Tailwind belum dites untuk escape. Backslash di akhir tidak mungkin (kelas arbitrer selalu berakhir `]`). Digabung dengan baris vgap `needsInlineStyle` (tes backtick/`$`).
  - `[low]` `[reject]` (blind) `exportModel` membangun pohon inline, dan `iconRefs` mengembalikan superset. Ikon pada pohon instance pemakaian adalah subset ikon template komponen. Teks warning token yang duplikat dan `assetBase` yang diabaikan tidak berdampak pada keluaran. Perbaikannya refactor tanpa harm bernama.
  - `[low]` `[reject]` (blind) `condExpr` tidak diminimalkan. `project()` sudah membuang driver yang tidak relevan. Sisa ekspresi DNF hanya kosmetik, dan minimisasi menambah logika.
  - `[low]` `[reject]` (blind) API publik bertambah tanpa dokumentasi. Ekspor helper murni dipakai tes kesetaraan. Belum ada pemanggil luar (story 5), dan entry `./testing` menambah permukaan.
  - `[false]` `[reject]` (blind) Default `components:true` mengubah keluaran pemanggil lama. Belum ada pemanggil di luar codegen/tes; viewer dan daemon baru memakai codegen di story 5. Desain 09 juga menyalakan "Components as separate files" secara default.
  - `[false]` `[reject]` (blind) `mergeOrder` rapuh untuk urutan anak yang berbeda per varian. Bind tidak bisa mengubah urutan anak (hanya `visible` yang menghapus), jadi daftar anak semua varian adalah subsekuens urutan tersimpan yang sama.
  - `[medium]` `[bad_spec]` (edge) Node yang hanya hadir bila dua prop non-default hilang dari komponen. Amandemen: Design Notes "Penemuan driver (titik tetap)", diturunkan ulang di `components.ts` (seed bind + warisan parent + loop flip per kombinasi, state termasuk daftar anak). Tes `Panel` open+extra.
  - `[medium]` `[bad_spec]` (edge) Prop yang efeknya hanya terlihat saat prop lain non-default tidak menjadi driver. Amandemen sama. Tes `tone` warna saat `open`, diuji untuk kombinasi yang tidak dipakai dokumen.
  - `[medium]` `[patch]` (edge) Galat ditelan, sama dengan baris blind `component()`. Fix: rethrow non-`LakarError`.
  - `[medium]` `[patch]` (edge) Dokumen mendekati `EXPANSION_NODES_MAX` + instance sintetis, sama dengan baris blind ekspansi. Fix: dokumen sintetis master-saja.
  - `[medium]` `[patch]` (edge) Biaya ekspansi berlipat dengan besar dokumen, sama dengan baris blind ekspansi. Fix sama.
  - `[low]` `[patch]` (edge) Build master utama gagal sesudah komponen bersarang memakai nama yang sama, sehingga identifier ganda. Fix: `name = names.take(name)` di `exportModel`.
  - `[low]` `[patch]` (edge) Master bernama `CSSProperties`/`ReactNode` bentrok dengan impor tipe. Fix: kedua nama dicadangkan di `NameAllocator` sebelum alokasi.
  - `[medium]` `[patch]` (edge) Nama prop cadangan, sama dengan baris blind nama prop. Fix sama.
  - `[low]` `[patch]` (edge) Opsi enum `__proto__` mengganti prototipe objek lookup. Fix: `propKey` menulis `["__proto__"]` (kunci terhitung). Tes.
  - `[low]` `[patch]` (edge) Kunci `|` bentrok, sama dengan baris blind lookup. Fix lookup bersarang.
  - `[low]` `[reject]` (edge) Id SVG stroke bersama antar-pemakaian/varian.
    - Pemakaian komponen yang sama punya geometri identik, sehingga `url(#…)` ke salinan pertama menghasilkan piksel sama (keputusan story 2).
    - Varian yang mengubah geometri stroke jarang ditemui dan tidak ada di korpus.
    - Fix (`useId` per pemakaian) menambah hook runtime.
  - `[low]` `[patch]` (edge) Instance bersarang di master yang di-inline tidak diberi warning. Fix: `templateEl` menambah `instance-inlined` (atau warning komponen gagal) pada elemen inline. Tes `InsB0001`.
  - `[false]` `[reject]` (edge) Nilai `::after` berisi backtick/`${` merusak template akar. Nilai overlay stroke hanya panjang, hex, atau `var(--token)` (nama token `[a-z0-9.-]`), jadi tidak bisa memuat backtick atau `$`.
  - `[low]` `[patch]` (edge) Slot yang `nodeId`-nya bukan frame tetap diketik sebagai prop tetapi tidak pernah dirender. Fix: `comp.slots` hanya berisi slot frame dengan nama aman.
  - `[medium]` `[bad_spec]` (edge, klaim) Approach "setiap prop dijelajahi per opsi" tidak menangkap varian interaksi. Akar sama dengan dua baris bad_spec di atas, amandemen sama.
  - `[low]` `[reject]` (edge, klaim) Tes "ubah master" membuang `InsKrt06`. Instance yang di-inline (override tak terekspresi, diizinkan ticket) memang menyalin isi master, jadi tidak punya "pemanggilan". Sifat verify berlaku untuk pemanggilan komponen dan dites demikian. Keputusan intent dicatat di baris intent D2.
  - `[low]` `[reject]` (edge, klaim) Spec menyebut `evalRoot`, padahal API-nya `evalComponent`/`evalNodes`. Perbaikannya mengedit teks spec build ini, dan nama yang benar tercatat di Auto Run Result.
  - `[medium]` `[patch]` (vgap) `needsInlineStyle` backtick/`$` belum dites, dan oracle korpus memakai regex lama. Fix:
    - `tests/codegen.test.ts` memakai `needsInlineStyle` (diekspor dari index);
    - tes `Cash$Sans`/``Tick`Sans`` untuk `components:false` dan `true` di `codegen.test.ts`;
    - tes akar komponen Tailwind di `components.test.ts`.
  - `[low]` `[patch]` (vgap) `iconRefs` dengan `components:false` belum dites. Fix: tes v5, yaitu `iconRefs` inline dipakai `generateCode(components:false)` tanpa `icon-glyph-missing`, plus fixture `FrmBrs01`.
  - `[low]` `[intent_gap]` (intent D1) Override dinyatakan lewat kelas pemakai dan slot, bukan prop bertipe.
    - Keputusan ("terima jadi"): pertahankan. AD-16 berbunyi "pemakaian … beserta props dan override-nya", dan `className` adalah prop React.
    - Desain 09 ("Card instances keep their overrides as props") memakai props dan isi slot.
    - Override yang tidak bisa dinyatakan tetap inline sesuai ticket.
  - `[low]` `[intent_gap]` (intent D2) Verify "ubah master tanpa ubah pemanggilan" berlaku umum atau representatif?
    - Keputusan: sifat ini berlaku untuk setiap pemanggilan komponen. Props, kelas selisih penempatan, dan isi slot tersimpan tidak bergantung isi master.
    - Pengecualian sah:
      - instance inline (ticket mengizinkan);
      - override di isi default slot, yang isinya memang dibawa sebagai slot;
      - selisih akar yang berubah karena sizing/keluarga master berubah.
    - Ketiganya dicatat sebagai batas di Auto Run Result.
  - `[low]` `[intent_gap]` (intent D3) Fallback `component-too-complex` menyalin master statis.
    - Keputusan: pertahankan dengan warning. Batas 64 kombinasi per elemen menjaga keluaran tetap terbatas.
    - Ticket mengizinkan ekspansi, dan AD-16 Prevents ditaati untuk semua komponen di bawah batas.
  - `[low]` `[intent_gap]` (intent D4) Prop text yang mengikat selain `content` tidak diekspor.
    - Keputusan: pertahankan. String bebas ke properti bertipe (warna, ikon, family) tidak punya pemetaan runtime yang setara tanpa menyalin css.ts ke kode keluaran (dilarang AD-5).
    - Warning `prop-unsupported` + cek pemakaian menjamin piksel.

## Design Notes

- **Penemuan driver (titik tetap).** Driver sebuah node adalah prop boolean/enum yang mengubah state node itu. State = deklarasi, `::after`, bagian internal, kehadiran, dan daftar anak. Langkahnya:
  1. Seed driver dari bind langsung ke node.
  2. Driver parent diwariskan ke anak.
  3. Untuk setiap node, setiap kombinasi drivernya, dan setiap prop lain, prop itu menjadi driver bila flip-nya mengubah state node.
  4. Ulangi langkah 2-3 sampai tidak ada perubahan. Node baru dari ekspansi baru ikut diproses.
  - Ekspansi memakai dokumen sintetis yang berisi semua master + instance sintetis saja.
  - Hanya `LakarError` (galat schema) yang membuat komponen jatuh ke inline.
- **Nama cadangan.** Prop/slot bernama kata kunci/cadangan JS atau `className`/`style`/`styles`/`key`/`ref` tidak diekspor (`prop-unsupported`). `CSSProperties` dan `ReactNode` tidak dipakai sebagai nama komponen.
- **Lookup varian bersarang.** Lookup ditulis per driver: ternary untuk boolean, objek untuk enum (`__proto__` sebagai kunci terhitung). Tidak ada kunci gabungan.

- **Akar komponen = anak flow kolom.** Dengan begitu pemakaian di parent kolom dengan sizing sama tidak butuh kelas apa pun. Selisih di konteks lain (row, absolute, scroll) ditulis di pemakai dan menang lewat `!important` hanya pada keluarga yang bentrok. Ini deterministik untuk kedua target tanpa bergantung urutan stylesheet atau sortir Tailwind.
- **Verifikasi, bukan asumsi.** Cek pemakaian membandingkan hasil evaluasi model komponen dengan pohon ter-ekspansi asli. Override apa pun yang tidak bisa dinyatakan otomatis jatuh ke inline (ticket: "ekspansi hanya bila override tidak bisa dinyatakan sebagai prop").
- **Override di isi default slot → slot.** Override seperti ini dinyatakan sebagai isi slot eksplisit, karena hasil pikselnya sama dan slot memang prop `ReactNode`.
- **Id SVG stroke di komponen** = `<komponen>-<idRelatif>-stroke`; semua pemakaian berbagi id yang sama (geometri identik, sama dengan keputusan story 2). Varian prop yang mengubah geometri stroke bentuk akan berbagi id juga (risiko sisa, belum ada di korpus).
- **Komponen tanpa `data-theme`.** Komponen mengikuti tema pemakai lewat CSS variables.
- Contoh pemakaian:

```tsx
<Card title="Promo minggu ini" className={styles.cardPromo} />
<Card showBadge={false} tone="check" body={<div className={styles.isiSlot}>Tiga tugas selesai hari ini</div>} />
```

## Verification

**Commands** (Windows: awali `set "PATH=C:\Users\Fatmuh\AppData\Local\nvm\v26.5.0;%PATH%" &&`; pnpm = `npx -y pnpm@12.21.0`):
- `npx -y pnpm@12.21.0 build` -- expected: sukses
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: 0 error
- `npx -y pnpm@12.21.0 exec vitest run packages/codegen tests/codegen.test.ts tests/dependency-direction.test.ts tests/resolve-document.test.ts` -- expected: lulus
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`

## Auto Run Result

- **Ringkasan:**
  - `@lakar/codegen` kini mengekspor setiap master yang dipakai sebagai `components/<Nama>.tsx` (+ `.module.css`):
    - props bertipe text/boolean/enum;
    - slot `ReactNode` (`{slot ?? default}`);
    - varian prop berupa lookup bersarang/kondisi;
    - akar sebagai anak flow kolom yang menggabung `className`/`style` pemanggil.
  - Instance (dan master di canvas) menjadi `<Nama …/>` dengan:
    - props yang berbeda dari default; override `content` pada node terikat menjadi prop;
    - isi slot (termasuk override di isi default slot);
    - kelas selisih akar per keluarga shorthand (`!important`/`!` hanya bila komponen menulis keluarga itu).
  - Isi komponen diturunkan dari `expandInstances` pada dokumen sintetis berisi master saja, dengan penemuan driver titik tetap.
  - Pemakaian yang tidak setara dengan pohon ter-ekspansi di-inline dengan warning `instance-inlined`.
  - `components:false` menghasilkan keluaran story 2 secara identik byte.
  - Fungsi baru `iconRefs` mendaftar ikon yang dibutuhkan, termasuk varian enum.
  - Evaluator publik bernama `evalComponent`/`evalNodes`, bukan `evalRoot` seperti tertulis di Tasks.
- **File:**
  - `packages/codegen/src/components.ts` (baru): komponen dari ekspansi sintetis, driver titik tetap, cek pemakaian, dan fallback inline.
  - `packages/codegen/src/jsx.ts` (baru): model JSX, evaluator ke pohon flat, keluarga shorthand/selisih akar, dan penulis TSX + modul CSS/Tailwind.
  - `packages/codegen/src/tree.ts`: penanda instance/master, warning per elemen, `nodeElement`/`makeCtx`/`storedIndex`.
  - `packages/codegen/src/index.ts`: opsi `components`, `exportModel`, susunan berkas `components/`, `iconRefs`, dan nama `CSSProperties`/`ReactNode` dicadangkan.
  - `packages/codegen/src/emit.ts`: helper diekspor untuk penulis baru.
  - `packages/codegen/src/tailwind.ts`: backtick/`$` dikirim ke `style`.
  - `packages/codegen/README.md`: dokumentasi komponen dan batas.
  - `packages/codegen/src/components.test.ts` (baru) dan `codegen.test.ts`: tes unit.
  - `tests/codegen.test.ts`: golden dengan komponen, kesetaraan pohon efektif = inline untuk setiap board/master/instance, fixture komponen, "ubah master", `iconRefs`, dan typecheck semua berkas.
  - `tests/fixtures/codegen/komponen.lakar.json` + `*.components.txt` (v5 dan fixture): fixture dan golden.
- **Review (37 temuan):**
  - **Patch**, 11 entri:
    - nama prop/slot cadangan;
    - lookup bersarang + kunci `__proto__`;
    - hanya `LakarError` yang menjadi fallback;
    - dokumen sintetis master-saja;
    - nama main unik sesudah build gagal;
    - nama tipe React dicadangkan;
    - warning untuk instance bersarang yang di-inline;
    - slot non-frame tidak diekspor;
    - tes `needsInlineStyle` + oracle memakai fungsi aslinya;
    - tes `iconRefs` `components:false`;
    - tes nama master kembar.
  - **bad_spec (loop 1):** penemuan driver titik tetap (E1/E2/E15). Amandemen ada di Design Notes dan Spec Change Log.
  - **intent_gap D1–D4**, diputuskan ("terima jadi"):
    - kelas pemakai/slot sebagai saluran override;
    - V2 berlaku untuk pemanggilan komponen;
    - fallback `component-too-complex`;
    - `prop-unsupported` untuk prop text non-content.
  - **Ditolak** (alasan per baris di Review Triage Log):
    - keluarga shorthand tambahan (tidak dipancarkan css.ts);
    - `normAttr`;
    - administrasi spec;
    - superset `iconRefs`/duplikasi;
    - minimisasi `condExpr`;
    - API publik;
    - default `components:true`;
    - `mergeOrder`;
    - id SVG stroke bersama;
    - backtick di `::after`;
    - klaim tes "ubah master";
    - nama `evalRoot`.
  - **Ditunda:** tidak ada.
- **Follow-up review:** `true`. Pass pertama mem-patch 4 entri medium: nama cadangan, galat ditelan, dokumen sintetis, dan tes `needsInlineStyle`. Ada juga satu loop bad_spec. Risiko yang belum terverifikasi: penemuan driver titik tetap dan dokumen sintetis master-saja baru diuji pada korpus, fixture, dan tes unit. Komponen nyata dengan banyak prop enum/boolean yang saling berinteraksi belum diuji, padahal biaya ekspansi dan batas 64 kombinasi bisa membuatnya jatuh ke inline. Tidak ada perilaku UI untuk di-smoke.
- **Verifikasi:**
  - `pnpm build` OK.
  - `tsc -p tsconfig.test.json` 0 error.
  - vitest codegen + `tests/codegen.test.ts` 121 lulus. Dependency-direction dan resolve-document juga lulus.
  - `pnpm test` penuh: 53 gagal / 2035 lulus. Ke-56 baris FAIL semuanya ada di baseline Windows `%TEMP%\lakar-fail-base.txt`, jadi tidak ada kegagalan baru.
  - Snapshot bench yang hanya berubah CRLF dikembalikan.
- **Risiko sisa:**
  - Id SVG stroke dipakai bersama oleh setiap pemakaian dan varian. Varian yang mengubah geometri stroke akan merujuk mask milik salinan pertama.
  - Ada tiga jalur di mana mengubah master tetap mengubah berkas utama:
    - instance inline;
    - override di isi default slot (isinya dibawa sebagai slot);
    - selisih akar yang bergantung pada sizing master.
  - Kelas Tailwind (`!`, `String.raw`, lookup) belum dikompilasi Tailwind; diuji di story 4.
  - Story 5 harus memakai `iconRefs` untuk glyph.
