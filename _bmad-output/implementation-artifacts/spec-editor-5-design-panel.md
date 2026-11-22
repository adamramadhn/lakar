---
title: 'Panel Design yang bisa diedit (epic editor-canvas story 5)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: '7a8d96bc0c28e542228d1a6d8eba69a0c0917f1b'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: ['oversized']
deferred:
  - summary: Ikon visibilitas fill/shadow dari desain tidak ditampilkan (skema v3 tanpa `visible`).
    evidence: AD-1/AD-3; butuh kenaikan schemaVersion. Dicatat di deferred-work.md.
    location: packages/viewer/src/DesignPanel.tsx PaintRow
    severity: low
  - summary: Scrub hanya mempratinjau angka di kolom, bukan canvas.
    evidence: Pratinjau canvas butuh gaya DOM sementara per properti (css.ts). Dicatat di deferred-work.md.
    location: packages/viewer/src/DesignPanel.tsx Field
    severity: low
  - summary: Wiring komponen DesignPanel tanpa tes otomatis (hanya smoke Playwright msedge).
    evidence: Vitest viewer tanpa DOM; designValues/designModel/liveGeometry dites murni. Dicatat di deferred-work.md.
    location: packages/viewer/src/DesignPanel.tsx
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Tab Inspect hanya menampilkan properti (baca-saja dari `POST /inspect`), jadi pengguna tidak bisa mengubah ukuran, layout, fill, stroke, radius, efek, atau tipografi tanpa agen. Desain bagian 05 Editor (fdf6D/S7hYr, SuJOz/UHOWY, XlDGD/g6Mbir, XZif7/J02Cu) mengganti Inspect dengan panel Design yang bisa diedit.

**Approach:** Tab kanan menjadi Activity | Design | Checks | History. `DesignPanel` membaca node **tersimpan** dari dokumen viewer (ref `{$token}` utuh) beserta pasangan ter-resolve (`resolveDocument`, AD-10), lalu setiap edit yang di-commit (Enter/blur, lepas scrub, pilih segmen/select, tutup color picker) menjadi satu `POST /viewer/docs/:slug/ops` berisi op `update` untuk semua node terpilih lewat `commitOps` yang sudah ada (AD-7), sehingga tercatat di History dan masuk tumpukan undo (AD-8). Parsing/format nilai dan pembangun patch ada di modul murni yang dites.

## Boundaries & Constraints

**Always:**
- Satu edit yang di-commit = paling banyak satu permintaan ops; nilai yang tidak berubah (deep-equal per node) tidak menghasilkan op, dan bila tidak ada op sama sekali tidak ada request. Multi-select: semua node dalam satu permintaan.
- Hanya properti skema v3 yang ada (AD-1, AD-13): `width|height` number/`hug`/`fill`, `layout row|column|none`, `gap`, `padding`, `align`, `justify`, `fills` (solid/linear/radial ditulis; tipe lain ditampilkan dan dipertahankan), `stroke {color,width,align,sides}`, `radius` angka atau tuple 4 (TL, TR, BR, BL), `opacity`, `blend`, `blur`, `backdropBlur`, `shadows`, tipografi `family|weight|size|lineHeight|letterSpacing|align|color`. Menghapus properti opsional = `null` di patch.
- Kelompok tampil hanya bila berlaku untuk **semua** node terpilih (tabel di Design Notes); nilai berbeda antar node tampil "Mixed".
- Ref token tampil sebagai chip nama token dan tidak berubah selama pengguna tidak mengedit nilainya; mengedit nilai mengganti ref dengan literal (detach, AD-11).
- Selama scrub (drag label kolom angka) hanya pratinjau angka di kolom; commit sekali saat lepas; Escape membatalkan tanpa request.
- Pratinjau versi (History) atau offline: panel menampilkan nilai versi yang tampil, semua kontrol non-aktif.
- Teks UI Inggris; komentar/spec Indonesia; warna dari token CSS viewer (`--input`, `--accent`, `--accent-soft`, `--text-*`).
- Copy as (CSS/Tailwind/JSON) tetap tersedia lewat tombol menu kecil di header seleksi panel Design (`copyas.ts`, data `POST /inspect` seperti sebelumnya).

**Never:**
- Tidak mengubah skema (tanpa kenaikan versi), core, route/respons lama, atau tool MCP; satu-satunya tambahan daemon adalah route baca `GET /viewer/fonts`.
- Tidak menambah grid (story 7), align & distribute multi-select (story 6), pemilih token (epic token), visibilitas fill/shadow (butuh skema), atau pratinjau canvas selama scrub.
- Tidak memakai `execute`/codegen untuk edit panel; tidak membuka `EventSource` baru; viewer tidak mengimpor core/exec/icons.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Angka | W frame `298` → ketik `320` + Enter | `update {width:320}`, 1 rev, History "Change width" | teks tak valid (`abc`, negatif untuk ukuran) → kolom kembali ke nilai lama, tanpa request |
| Sizing | W Fixed → klik Hug; lalu Fixed | `{width:'hug'}`; Fixed → `{width:<ukuran terukur dibulatkan>}` | ukuran terukur tidak ada → nilai tersimpan/inspect, jika tetap tidak ada segmen Fixed tidak mengirim apa pun |
| Board | board terpilih | X/Y/W/H angka saja (segmen sizing tidak tampil), kelompok Fill saja | — |
| X/Y flow | anak flow di Row | X/Y non-aktif menampilkan posisi terukur | — |
| Auto layout | frame `layout` tidak ada → klik `+` / segmen row; header `−` | `{layout:'column'}` / `{layout:'row'}`; `−` → `{layout:null}` | segmen grid non-aktif ("Grid layout comes in a later update") |
| Padding | ketik `8 16` | `{padding:[8,16]}`; `8` → `8`; `1 2 3 4` → tuple 4 | 3 nilai / non-angka → batal |
| Fill hex | Paint row solid `FFFFFF` → `#1a1a1a` / `0f0` | `fills[i].color = '#1A1A1A'` / `'#00FF00'`, alpha dipertahankan | hex tak valid → batal |
| Fill opacity | `50%` pada solid `#112233` | color `#11223380` | — |
| Fill list | `+` / `−` / drag baris / jenis Linear/Radial | push solid `#D9D9D9` (lapisan atas), hapus indeks, pindah indeks, konversi jenis mempertahankan warna (solid→gradien: stop warna→warna transparan) | fills kosong sesudah hapus → `{fills:null}` |
| Gradien | sudut linear `90`, stop hex/posisi `%` | `angle`, `stops[k]` diperbarui | posisi di luar 0–100% → di-clamp |
| Stroke | `+` lalu W `2`, segmen Center, matikan Top | `stroke {color:'#000000',width:1,align:'inside'}` → width 2 → align center → `sides:[right,bottom,left]`; semua sisi aktif → `sides` dihapus | menonaktifkan sisi terakhir diabaikan |
| Radius | All `12`; toggle per sudut; TL `8` | `radius:12`; toggle hanya membuka baris TL/TR/BR/BL (tanpa request); `radius:[8,12,12,12]`; tuple sama semua → tetap tuple sampai All diedit | — |
| Efek | Opacity `50`, Blend Multiply, Blur `4`, Backdrop `12`, shadow `+`, edit `Inner 0 2 6 1` | `opacity:0.5`, `blend:'multiply'`, `blur:4`, `backdropBlur:12`, push `{type:'drop',x:0,y:4,blur:12,color:'#00000033'}`, shadow diganti `{type:'inner',x:0,y:2,blur:6,spread:1,…}` | opacity di-clamp 0–100% |
| Tipografi | Family Manrope, Weight Bold, Size 34, LH 40, LS -0.02, align Center, color | satu op per edit, `weight:700`, `align:'center'` | daftar family dari `GET /viewer/fonts`; family tersimpan yang tak terpasang tetap tampil sebagai opsi |
| Token | `gap:{$token:'space.4'}` | chip `space.4`; klik → input berisi nilai resolve; Enter tanpa ubah → tanpa request; ubah ke `20` → `{gap:20}` | — |
| Multi | 3 frame, W `169`/`169`/`200`; ketik `150` | W "Mixed" sebelum; satu request dengan 3 op `update` | node yang sudah bernilai sama tidak mendapat op |
| Scrub | drag label `Gap` +30px lalu lepas | kolom berubah selama drag, 1 request `{gap:old+30}` saat lepas | Escape saat drag → nilai lama, tanpa request |
| Gagal | daemon menolak (mis. node dihapus agen) | toast error dari `commitOps`, dokumen dimuat ulang | panel menampilkan nilai dokumen terbaru |

</intent-contract>

## Code Map

- `packages/viewer/src/Viewer.tsx` -- `TABS`, `tab === 'inspect'` → `InspectPanel`, `commitOps` (applyOps → recordCommit → loadDoc), `findNode`, `inspect` (POST /inspect), `editable`, `preview`.
- `packages/viewer/src/panels.tsx` -- `InspectPanel` (dihapus; Copy as dipindah), `ChecksPanel`, `Empty`.
- `packages/viewer/src/viewState.ts` (+ `.test.ts`) -- `PanelTab` berisi `'inspect'` → `'design'`.
- `packages/viewer/src/copyas.ts` -- Copy as dari node inspect (tetap).
- `packages/viewer/src/liveGeometry.ts` -- `liveElement`; tempat `measureLiveSize` (ukuran terukur node di board live).
- `packages/viewer/src/api.ts` -- `applyOps`, `renderDeps`; tempat `fonts()`.
- `packages/viewer/src/icons.tsx`, `packages/viewer/src/app.css` -- ikon dan gaya panel.
- `packages/schema/src/nodes.ts` -- bentuk properti (Fill, Stroke, Radius, Shadow, Padding, Dimension, text).
- `packages/render/src/css.ts` -- semantik: `lineHeight` px, `letterSpacing` pecahan em, `fills[0]` paling bawah.
- `packages/core/src/transaction.ts` -- `update`: merge dangkal, `null` menghapus, `implicitAbsolute` untuk anak frame `none`.
- `packages/daemon/src/render-deps.ts` (+ `.test.ts`) -- `registerRenderDepsRoutes` punya `FontRegistry`; tempat `GET /viewer/fonts`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/viewer/src/designValues.ts` -- baru, murni: `isTokenRef`, `parseNumber(text,{min,max,int})`, `formatNumber`, `parsePercent`/`formatPercent`, `parseHex` (3/6/8 digit, dengan/tanpa `#`, hasil huruf besar), `splitHex`/`joinHex` (hex 6 + alpha 0–1), `parsePadding`/`formatPadding`, `parseShadow`/`formatShadow` (`[drop|inner] x y blur [spread]`), `WEIGHT_NAMES`, `sameValue` (deep-equal) -- parsing/format bisa dites.
- [x] `packages/viewer/src/designModel.ts` -- baru, murni: tipe `DesignTarget {id,type,name,stored,resolved,parentLayout,measured?}`, `designGroups(targets)`, `readField(targets,get)` → `{mixed}|{value,resolved}`, `sizingMode`, `canEditXY`, dan pembangun op `opsFor(targets, patchFn)` (lewati patch tanpa perubahan) plus pembangun khusus: `setProp`, `setSizing`, `setLayout`, fills (`fillRows` urutan tampil atas→bawah, `addFill`, `removeFill`, `moveFill`, `setFillColor`, `setFillAlpha`, `setFillKind`, `setGradient`), stroke (`addStroke`, `removeStroke`, `setStroke`, `toggleSide`), radius (`setRadiusAll`, `setRadiusCorner`, `splitRadius`), shadows (`addShadow`, `removeShadow`, `setShadow`), `detachValue` -- logika patch bisa dites.
- [x] `packages/viewer/src/designValues.test.ts`, `packages/viewer/src/designModel.test.ts` -- baru: baris matriks (angka, padding, hex/alpha, shadow, sizing, layout, fill list, gradien, stroke sides, radius, efek, tipografi, token detach/pertahankan, multi + lewati node sama, board/flow X/Y, kelompok per tipe).
- [x] `packages/viewer/src/DesignPanel.tsx` -- baru: header seleksi (badge tipe, nama, path; "N layers" untuk multi) + menu Copy as; komponen `Field` (label, nilai, chip token, Enter/blur commit, Escape batal, scrub label), `Segmented`, `SelectField`, `PaintRow` (swatch → `<input type=color>` commit saat `change`, hex, opacity, `−`), `GroupHeader`; kelompok Position & size, Auto layout, Typography, Icon, Fill (+ editor gradien sebaris), Stroke, Radius, Effects sesuai desain; `onCommit(ops, description)`.
- [x] `packages/viewer/src/Viewer.tsx` -- tab `design` (label "Design") menggantikan `inspect`; bangun `DesignTarget[]` dari seleksi (dokumen tampil + `resolveDocument` + `measureLiveSize` + bounds inspect primer); muat daftar font sekali; render `DesignPanel` dengan `commitOps` dan `editable`; hapus "Parent layout".
- [x] `packages/viewer/src/panels.tsx` -- hapus `InspectPanel` dan helper yang tak terpakai; ekspor `Empty` untuk DesignPanel.
- [x] `packages/viewer/src/viewState.ts`, `packages/viewer/src/viewState.test.ts` -- `PanelTab` `'design'` menggantikan `'inspect'`.
- [x] `packages/viewer/src/liveGeometry.ts` (+ `liveGeometry.test.ts`) -- `measureLiveSize(root, id)`: cari host `.board-live` yang memuat elemen node, ukuran = rect elemen / skala board (rect board ÷ `offsetWidth`), dibulatkan 0.01.
- [x] `packages/viewer/src/api.ts` -- `fonts(): Promise<FontFamily[]>` (`GET /viewer/fonts`).
- [x] `packages/daemon/src/render-deps.ts`, `packages/daemon/src/render-deps.test.ts` -- `GET /viewer/fonts` → `{ok:true,data:{families:[{family,weights,styles}]}}` dari `FontRegistry`, urut nama.
- [x] `packages/daemon/src/fonts.ts` -- `entries()` daftar entri (family/weights/styles) untuk route.
- [x] `packages/viewer/src/icons.tsx` -- `squareDashed`, `arrowRight`, `textAlignStart|Center|End|Justify`, `panelTop|Right|Bottom|Left`, `scan`.
- [x] `packages/viewer/src/app.css` -- gaya `.dp-*` sesuai komponen Section 00 DESIGN PANEL (Field 28px `--input` radius 5, label 11px muted, nilai 12px; Segmented padding 2 radius 6, segmen aktif `--accent-soft`/`--accent`; Select dengan chevron; Paint Row swatch 16 radius 3, teks mono; grup padding 8/14, header 11px 600).

**Acceptance Criteria:**
- Given dokumen dengan frame terpilih di viewer, when pengguna mengubah satu nilai di setiap kelompok (Position & size, Auto layout, Fill, Stroke, Radius, Effects) dan tipografi pada teks, then canvas live menampilkan nilai baru sesudah setiap commit, History bertambah satu entri `lakar-viewer` per commit, dan Ctrl+Z mengembalikan nilai terakhir.
- Given tiga node terpilih dengan lebar berbeda, when pengguna mengetik lebar baru, then kolom W menampilkan "Mixed" sebelumnya dan satu rev mengubah ketiganya.
- Given node dengan ref token pada gap, when pengguna mengedit kolom lain, then ref tetap; when pengguna mengedit gap, then nilai literal menggantikan ref.
- Given pratinjau versi lama atau offline, when panel Design dibuka, then nilai tampil dan tidak ada kontrol yang bisa mengirim request.
- Given tab Design, when pengguna membuka menu Copy as, then CSS/Tailwind/JSON tersalin seperti sebelumnya.

## Spec Change Log

### 2026-11-22 — Loop 1 (temuan edge: edit cepat beruntun menimpa edit sebelumnya)
- **Pemicu:** patch fills/shadows/stroke berupa array/objek utuh dibangun dari dokumen tampil; edit kedua yang di-commit sebelum dokumen termuat ulang menimpa edit pertama (dan perubahan agen di antaranya) dengan data basi. Spec hanya menulis "satu edit = satu permintaan" tanpa urutan.
- **Diamandemen:** Design Notes "Antrean commit" (di luar intent-contract): `ctx.run` menerima pembangun op yang dievaluasi terhadap target terbaru; edit berikutnya menunggu rev dokumen berubah (batas 3 dtk), gagal → antrean dibuang.
- **Keadaan buruk yang dihindari:** lost update pada edit cepat (mis. opacity dua baris fill berturut-turut).
- **KEEP:** seluruh implementasi lain (modul murni, grup, komponen, route fonts, smoke) tetap; re-derivasi hanya menyentuh `Ctx.run`/call site DesignPanel dan prop `rev` dari Viewer.

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 47 findings — high 2, medium 12, low 27, false 6, maybe-false 0
- findings:
  - `[high]` `[patch]` (blind) Color picker Swatch berhenti bekerja sesudah perubahan pertama (`key={solid}` me-remount input, listener tidak dipasang ulang) — benar: deps efek `[pick !== undefined]`; diperbaiki deps `[pick !== undefined, solid]`; smoke: dua pick berturut-turut pada warna teks → 2 commit (#FF0000, #00FF00).
  - `[medium]` `[patch]` (blind) Scrub Padding tuple meruntuhkan tuple jadi satu angka — benar: `Number([8,16])`→NaN→0; scrub kini hanya dari nilai angka (tuple/teks tidak di-scrub); smoke: scrub padding tuple tanpa request.
  - `[medium]` `[patch]` (blind) Token di dalam tuple padding tidak bisa bolak-balik (`$space.2 4` ditolak parsePadding) — benar; `parsePadding` menerima `$nama` → `{$token}` + tes; smoke: `$space.2 24` → `[{$token:'space.2'},24]`.
  - `[low]` `[patch]` (blind) Edit hex menggeser byte alpha (0x81→0x82) lewat pembulatan — benar; `withHex` menyalin byte alpha apa adanya, `changeColor` di designValues + tes; smoke: `#11223381` → `#44556681`.
  - `[low]` `[patch]` (blind) Status UI grup (editor fill terbuka, toggle per sudut) bocor antar seleksi — benar; grup dibungkus `Fragment key` = ID seleksi.
  - `[low]` `[reject]` (blind) Spec menyimpang dari nama fungsi/tanda tangan di kode (measureLiveSize, nama builder, `Empty`, bounds) — perbedaan penamaan tanpa efek perilaku; perbaikannya mengedit spec build ini (ditolak aturan).
  - `[false]` `[reject]` (blind) Spec belum selesai (status in-progress, log kosong) — triage ini mengisi log dan menutup status `done`; warnings oversized sah untuk story lintas grup.
  - `[low]` `[reject]` (blind) `measureLiveSize` dibaca saat render bisa basi — nyata tetapi sembuh sendiri: refetch /inspect tiap rev di tab Design memicu render ulang sesudah mount; perbaikan butuh pengukuran efek/ResizeObserver (plumbing baru).
  - `[false]` `[reject]` (blind) `measureLiveSize` tanpa `CSS.escape` — ID node/board divalidasi skema `^[A-Za-z0-9]{8}$`, jadi selektor tidak bisa rusak; CSS.escape juga tidak ada di vitest Node.
  - `[low]` `[patch]` (blind) Gagal memuat font tidak pernah dicoba lagi — benar; efek fonts kini bergantung `attempt` (Retry/koneksi pulih/rev).
  - `[low]` `[reject]` (blind) /inspect diambil ulang tiap rev di tab Design; ekspresi kondisional di deps — keputusan terdokumentasi (Copy as dan posisi terukur mengikuti edit); ekspresi deps valid, repo tanpa lint hooks; biaya satu inspect per rev lokal.
  - `[low]` `[patch]` (blind) CSS Inspect lama tidak terpakai — benar (grep tsx kosong); `.inspect-section`, `.prop*`, `.clamp`, `.swatch`, `.copy-as*` dihapus dari app.css.
  - `[low]` `[reject]` (blind) Segmen sizing ditawarkan tanpa cek tipe/induk — skema menerima semua kombinasi (core tidak menolak); efek hilang hanya di kasus jarang; pembatasan butuh aturan tambahan.
  - `[medium]` `[patch]` (blind) Token warna teks/ikon/stroke/fill/stop tidak bisa di-detach dari kolom hex (chip statis) — benar; komponen `ColorValue`: chip token bisa diklik → input hex resolve, commit = detach (smoke: token fill → `#00000080`, alpha token dipertahankan).
  - `[low]` `[patch]` (blind) Editor gradien tidak bisa dibuka saat baca-saja — benar; swatch hanya non-aktif untuk tipe fill yang tak bisa diedit, kontrol di dalam editor tetap non-aktif.
  - `[low]` `[patch]` (blind) `nextColor` di DesignPanel tanpa tes — dipindah ke `designValues.changeColor` + tes (prev token/undefined, alpha, hex tak valid).
  - `[low]` `[reject]` (blind) Tes `/viewer/fonts` tipis — tes memeriksa status, isi, urutan; amplop `ok` tersirat dari `data`; header cache tidak berperilaku penting.
  - `[low]` `[patch]` (blind) X/Y anak flow multi-select selalu "Mixed" — benar; kini nilai kosong dengan placeholder `–` (tunggal: posisi terukur).
  - `[low]` `[reject]` (blind) Weight tidak disesuaikan saat family berganti — select menampilkan nilai tersimpan apa adanya; snapping menambah aturan; jarang (family terpasang punya 400/700).
  - `[high]` `[patch]` (edge) Listener Swatch hilang sesudah remount — sama dengan baris blind Swatch; deps diperbaiki + smoke dua pick.
  - `[medium]` `[bad_spec]` (edge) Edit kedua sebelum reload menimpa edit pertama (patch array dari data basi) — benar; amandemen Design Notes "Antrean commit" (Spec Change Log loop 1): `ctx.run(build)` + tunggu rev; smoke: opacity dua baris fill cepat → keduanya tersimpan (rev +2).
  - `[low]` `[patch]` (edge) Editor fill terbuka di fill lain sesudah hapus/urut atau pindah seleksi — benar; `open` direset saat hapus/urut, grup di-key per seleksi.
  - `[low]` `[patch]` (edge) Toggle per sudut bertahan lintas seleksi — sama dengan baris blind status grup (key per seleksi).
  - `[low]` `[reject]` (edge) Field ter-unmount di tengah scrub membocorkan listener keydown — pointer di-capture sehingga seleksi/tab tidak berubah lewat mouse; bila terjadi, Escape berikutnya memanggil `end(false)` yang melepas listener (sekali telan); perbaikan butuh cleanup ref.
  - `[medium]` `[patch]` (edge) Scrub W/H hug/fill mulai dari 0 — benar; `scrub.base` = ukuran terukur; smoke: scrub H hug +10px → 46 (36 terukur + 10).
  - `[medium]` `[patch]` (edge) Scrub padding tuple — sama dengan baris blind scrub padding.
  - `[medium]` `[patch]` (edge) Token di tuple padding ditolak parse — sama dengan baris blind padding token.
  - `[false]` `[reject]` (edge) Geometri shadow bertoken ditampilkan 0 — skema Shadow: x/y/blur/spread `Px`/`Size` tanpa `tok()`, hanya color yang bisa token (nodes.ts).
  - `[medium]` `[patch]` (edge) Warna solid fill bertoken tidak bisa diedit/detach — sama dengan baris blind token warna (`ColorValue`).
  - `[low]` `[patch]` (edge) toggleSide multi bersisi campuran membuat sisi makin berbeda — benar; sisi baru dihitung dari node primer lalu dipasang ke semua + tes.
  - `[low]` `[patch]` (edge) Font gagal tidak dicoba lagi — sama dengan baris blind font (`attempt`).
  - `[low]` `[reject]` (edge) Offset stop melewati stop tetangga — input eksplisit pengguna; CSS menangani stop tak urut; mengurutkan mengubah indeks di tengah edit.
  - `[low]` `[reject]` (edge) Properti Inspect lama (rotation, screen, Other) tidak tampil lagi — desain bagian 05 (C6) tidak memuatnya; Copy as JSON tetap memuat semua properti tersimpan.
  - `[low]` `[patch]` (edge) `formatValue`/`hexColor` tidak terpakai — benar (grep: hanya format.ts); dihapus.
  - `[low]` `[reject]` (edge) Spec: `Empty` diekspor — perbaikan mengedit spec (ditolak); markup kosong DesignPanel sengaja berteks berbeda.
  - `[low]` `[reject]` (edge) Spec: nama builder berbeda — mengedit spec (ditolak); tanpa efek perilaku.
  - `[low]` `[reject]` (edge) Spec: tanda tangan measureLiveSize — mengedit spec (ditolak); satu-satunya pemanggil (Viewer) benar.
  - `[medium]` `[patch]` (edge) Swatch fill bukan color picker; solid fill hanya lewat ketik hex — benar; editor fill solid kini punya baris swatch picker + hex (klik swatch baris membuka editor).
  - `[low]` `[reject]` (edge) Spec: daftar font "sekali" — dimuat sekali per kebutuhan dan dicoba lagi saat gagal (baris patch font); registry kosong hanya memicu fetch per perubahan `attempt`.
  - `[medium]` `[patch]` (vgap) Pemetaan `parentLayout` di Viewer tanpa tes — diekstrak ke `designModel.parentLayoutOf` (sejajar implicitAbsolute) + tes board/frame tanpa layout/none/row/column/board.
  - `[medium]` `[patch]` (vgap) Fake `measureLiveSize` menerima selektor apa pun — fake kini mencocokkan persis `[data-live-board="…"]` dan `[${NODE_ATTR}="…"]`.
  - `[low]` `[patch]` (vgap) Node berotasi: getBoundingClientRect menggelembungkan ukuran — benar; elemen HTML memakai offsetWidth/offsetHeight (tanpa transform), SVG tetap rect/skala + tes.
  - `[medium]` `[defer]` (intent) Verifikasi end-to-end hanya smoke manual — sudah tercatat di frontmatter `deferred` (item wiring DesignPanel) dan deferred-work.md; tidak ditambah duplikat.
  - `[false]` `[reject]` (intent) Parity desain: ikon mata, Fill/Stroke teks, grid non-aktif — spine AD-1 (properti harus ada di skema) dan ticket story 7 (grid) membatasi; keputusan dicatat di Design Notes dan deferred.
  - `[false]` `[reject]` (intent) Gradien conic tidak bisa diedit — brief story: "fill (solid dan gradien linear/radial)"; conic tampil dan dipertahankan.
  - `[low]` `[reject]` (intent) Isi Inspect lama hilang — sama dengan baris edge properti Inspect lama (desain sumber kebenaran; Copy as JSON).
  - `[false]` `[reject]` (intent) Route `/viewer/fonts` di luar intent — brief meminta "family from installed fonts list"; AGENTS/AD-4 mengizinkan route baru `/viewer/*` baca-saja.

## Design Notes

- **Kelompok per tipe (AD-1).** board: Position & size (angka), Fill. frame: Position & size, Auto layout, Fill, Stroke, Radius, Effects. rect: tanpa Auto layout. ellipse/path: Position & size, Fill, Stroke, Effects. text: Position & size, Typography (warna = Paint row tanpa `−`), Effects. icon: Position (X/Y), Icon (Size + Color), Effects. Desain teks menampilkan Fill/Stroke kosong, tetapi skema teks tidak punya `fills`/`stroke`, jadi tidak ditampilkan.
- **Sumber nilai.** Nilai dari node tersimpan dokumen yang tampil (bukan `/inspect`) agar ref token terlihat; nilai resolve dari `resolveDocument` dokumen yang sama (dipakai swatch dan detach). W/H non-angka (hug/fill) menampilkan ukuran terukur DOM live sebagai teks redup.
- **X/Y.** Bisa diedit untuk board, node `position:'absolute'`, dan anak frame `none` (core menambah `position` lewat `implicitAbsolute`); anak flow menampilkan posisi terukur primer (bounds inspect) non-aktif.
- **Urutan fill.** Baris atas = lapisan teratas = indeks terakhir `fills` (render: `fills[0]` paling bawah). `+` menambah di atas.
- **Visibilitas fill/shadow.** Skema tidak punya `visible`; ikon mata desain tidak ditampilkan (AD-1: tidak ada properti tanpa padanan render). Ditunda ke story skema.
- **Opacity Paint row.** = alpha warna hex (`#RRGGBBAA`), bukan properti terpisah. Gradien menampilkan "Linear gradient"/"Radial gradient" dan klik baris membuka editor sebaris: Segmented Solid|Linear|Radial, kolom Angle (linear), baris stop (hex + posisi %).
- **Tipe fill lain** (conic/noise/mesh/image) tampil sebagai baris baca-saja dengan `−` dan bisa diurutkan; tidak bisa diedit di sini.
- **Shadow row.** Teks "Drop 0 8 24" bisa diedit langsung dengan sintaks `[drop|inner] x y blur [spread]`; persen = alpha warna.
- **Semantik tipografi.** `lineHeight` px dan `letterSpacing` pecahan em (render css.ts) ditampilkan apa adanya; Weight select menampilkan nama (400 Regular …) dibatasi bobot family terpasang bila diketahui.
- **Token chip.** Tidak ada desain chip di .pen; chip = pill `--accent-soft`/`--accent` mono di dalam kolom. Klik chip mengubah kolom jadi input berisi nilai resolve; commit nilai yang sama dengan nilai resolve tidak mengirim apa pun (ref tetap); nilai lain = detach.
- **Warna.** Swatch membuka `<input type="color">`; event `change` (picker ditutup) = satu commit; alpha dipertahankan.
- **Scrub.** Drag horizontal pada label kolom angka: 1 unit/px (Shift ×10; opacity 1%/px; lineHeight 1/px; letterSpacing 0.01/px); pratinjau hanya di kolom (pratinjau canvas ditunda).
- **Deskripsi History.** "Change <prop>" (mis. "Change width", "Change fill", "Add stroke", "Remove shadow"); multi menambah " on N layers".
- **Commit hanya dari ketikan.** Kolom fokus tanpa ketikan tidak pernah commit saat blur, sehingga nilai yang berubah dari luar (agen, undo) selama fokus tidak ditimpa nilai lama. Kolom memakai `div` (bukan `label`) agar pointerdown scrub pada label tidak memfokuskan input.
- **Toggle per sudut** hanya status UI (otomatis aktif bila radius tersimpan berupa tuple); request baru terjadi saat salah satu sudut diedit.
- **Data `/inspect`.** Tetap dipakai untuk Copy as, posisi terukur anak flow, dan highlight; saat tab Design terbuka diambil ulang tiap rev (data lama tetap tampil sampai hasil baru tiba, tanpa kedip).
- **Fixed dari hug/fill** memakai `measureLiveSize` (DOM live, dibulatkan); node yang belum ter-mount tidak berubah.
- **Header auto layout.** `+` = `layout:'column'`, `−` = `layout:null` (gap/padding/align/justify dibiarkan); baris Gap/Padding/Align/Justify hanya tampil untuk row/column.
- **Align & distribute** di desain multi-select (g6Mbir) milik story 6; tidak ditampilkan di story ini.
- **Antrean commit (loop 1).** `ctx.run(build, label)` mengantre pembangun op; pembangun dievaluasi terhadap target terbaru, dan edit berikutnya baru dibangun sesudah rev dokumen berubah (batas 3 dtk bila reload gagal). Commit gagal membuang antrean. Patch array/objek utuh (fills, shadows, stroke) tidak lagi menimpa edit sebelumnya.
- **Token warna.** Chip token di Paint Row (fill, stop, stroke, teks, ikon) bisa diklik → input hex resolve; commit = detach. Editor fill solid punya swatch color picker.
- **Scrub** hanya dari nilai angka; nilai kosong memakai ukuran terukur (W/H hug/fill); tuple padding tidak di-scrub.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 exec vitest run packages/viewer packages/daemon/src/render-deps.test.ts tests/dependency-direction.test.ts` -- expected: lolos.
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru di luar baseline Windows.

**Manual checks (if no CLI):**
- Smoke playwright-core msedge terhadap daemon lokal: ubah hex fill, padding, radius, ukuran font lewat panel; rev naik satu per edit, canvas berubah, History bertambah.

## Auto Run Result

**Ringkasan.** Tab Inspect diganti panel Design (bagian 05 Editor): Position & size (Fixed/Hug/Fill), Auto layout, Typography, Icon, Fill (solid/linear/radial, tambah/hapus/urut), Stroke, Radius (All/per sudut), Effects (opacity, blend, blur, backdrop, shadow). Setiap edit = satu permintaan ops `update` untuk semua node terpilih (History + undo), ref token tampil sebagai chip dan dipertahankan sampai nilainya diedit, multi-select menampilkan Mixed. Copy as pindah ke menu di header seleksi.

**File.**
- `packages/viewer/src/designValues.ts` (+tes) — parse/format murni: angka, persen, hex/alpha (byte alpha dipertahankan), padding (termasuk `$token`), shadow, `changeColor`.
- `packages/viewer/src/designModel.ts` (+tes) — kelompok per tipe, nilai gabungan, pembangun op (sizing, layout, fill, gradien, stroke, radius, shadow), `parentLayoutOf`.
- `packages/viewer/src/DesignPanel.tsx` — komponen Field/Segmented/Select/Paint Row/ColorValue, grup, antrean commit, menu Copy as.
- `packages/viewer/src/Viewer.tsx` — tab Design, target panel, font (retry), refetch inspect per rev di tab Design, prop `rev`.
- `packages/viewer/src/panels.tsx`, `format.ts`, `app.css` — InspectPanel, helper, dan CSS lama dihapus; gaya `.dp-*`.
- `packages/viewer/src/liveGeometry.ts` (+tes) — `measureLiveSize` (offsetWidth untuk HTML, rect/skala untuk SVG).
- `packages/viewer/src/viewState.ts` (+tes), `api.ts`, `icons.tsx` — tab `design`, `fonts()`, ikon baru.
- `packages/daemon/src/render-deps.ts` (+tes), `fonts.ts` — `GET /viewer/fonts`, `FontRegistry.entries()`.

**Review.** 47 temuan (high 2, medium 12, low 27, false 6). Patch (per entri, verdict entri): high 1 (Swatch listener), medium 7 (scrub padding tuple, token padding, detach token warna, scrub W/H dari ukuran terukur, picker solid fill, `parentLayoutOf`+tes, selektor fake), low 10 (alpha byte, status grup per seleksi + reset editor, retry font, CSS/helper mati, editor gradien baca-saja, `changeColor`+tes, placeholder X/Y, toggleSide primer, ukuran node berotasi). bad_spec 1 (antrean commit, loop 1). Defer: verifikasi e2e (sudah tercatat). Ditolak dengan alasan di Review Triage Log: drift teks spec (4), spec belum selesai, measure saat render, CSS.escape, refetch inspect, segmen sizing, tes fonts, weight snapping, unmount saat scrub, urutan stop, isi Inspect lama (2), shadow bertoken, font "sekali", parity desain, conic, route fonts.

**Rekomendasi follow-up review: false.** Patch high (listener Swatch) dan perilaku UI patch medium diverifikasi ulang lewat smoke msedge pada kode yang sudah di-patch (lihat di bawah), sehingga tidak ada risiko UI yang belum diverifikasi.

**Verifikasi.**
- `pnpm build`, `tsc -p tsconfig.test.json`, `tsc -p packages/viewer/tsconfig.json` sukses; vitest viewer + render-deps + dependency-direction: 23 file / 326 tes lolos.
- `pnpm test` penuh: semua kegagalan ada di baseline Windows; tidak ada kegagalan baru. Snapshot bench CRLF dikembalikan.
- Smoke awal playwright-core msedge: fill hex, padding, radius, font size → masing-masing 1 rev + entri History, nilai sama tanpa request, Ctrl+Z, computed style live; chip token, scrub, stroke, gradien, shadow, opacity, blend, sizing, arah.
- Smoke ulang sesudah patch (daemon lokal port 7491, data sementara, dibersihkan): padding `$space.2 24` mempertahankan token; scrub padding tuple tanpa request; scrub H hug → 46 (36 terukur + 10); hex `#11223381` → `#44556681`; chip token fill → detach `#00000080`; dua edit opacity cepat → keduanya tersimpan (2 rev); color picker warna teks dua kali → `#FF0000` lalu `#00FF00`; tanpa error halaman.

**Risiko sisa.** Wiring komponen DesignPanel tanpa tes otomatis (deferred); scrub tanpa pratinjau canvas (deferred); visibilitas fill/shadow menunggu skema (deferred); antrean commit bisa membangun edit dari dokumen yang belum memuat commit sebelumnya bila rev agen tiba lebih dulu (jarang).
