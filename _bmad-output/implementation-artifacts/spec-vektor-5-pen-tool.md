---
title: 'Pen tool dan edit titik path di canvas live (epic paste-vektor story 5)'
type: 'feature'
created: '2026-11-23'
status: 'done'
baseline_revision: 'eedc6ed1235e0d06f7ff2e42cb6fc3d45dffa3d5'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-vektor-3-svg-import.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-editor-4-select-move-resize.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Wiring Pen tool dan mode edit titik di canvas (routing pointer, keyboard capture, pratinjau DOM, seleksi path baru, grup Point) tanpa tes otomatis; satu rev per gestur dan Ctrl+Z lewat tumpukan undo jendela hanya diverifikasi smoke msedge.
    evidence: |-
      Review v5 (vgap, blind, intent). Viewer belum punya harness tes komponen/DOM (pra-ada, pola sama dengan story 3–4 dan kode-5). Keputusan op (update/remove/no-op), pathEditable, dan koordinat panel sudah murni dan dites di pathEdit.test.ts; kontrak route dites di tests/vector-edit.test.ts.
    location: >-
      packages/viewer/src/pathTools.tsx, packages/viewer/src/Canvas.tsx
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Ikon hasil paste (story 3–4) dan path lain hanya bisa digeser dan di-resize sebagai kotak. Pengguna belum bisa menggambar bentuk sendiri, dan belum bisa mengubah titik path (R7). Kontrol stroke vektor sudah ada di panel Design (story 2), tetapi grup Point dari desain J7AmQi/S8w37 belum dibangun.

**Approach:** Viewer mendapat dua mode di canvas live, mengikuti desain bagian 10 (DHXJM/Lwpld, J7AmQi/S8w37, komponen Vector Anchor JZqLc dan Bezier Handle NVyza).
- **Pen tool (P).** Klik menambah titik lurus, drag menarik handle bezier, dan klik titik pertama menutup path. Enter menyelesaikan path terbuka, Esc membatalkan.
- **Edit titik.** Dobel-klik path (atau Enter dengan satu path terpilih) masuk ke mode edit. Di mode ini pengguna bisa menggeser anchor dan handle, menambah titik dengan klik segmen, menghapus titik (Delete), mengganti tipe titik (Corner/Smooth/Mirrored), dan membuka path.

Modul murni `pathEdit.ts` mengurai `d` dengan `parsePath` (`@lakar/render`) menjadi model anchor, lalu menulisnya kembali dengan `serializePath` (AD-14). Selama gestur hanya ada pratinjau lokal. Satu gestur menghasilkan satu commit lewat route ops (AD-7) dan bisa di-undo dengan op invers (AD-8). Story ini juga menambah tes murah untuk jalur tutup paksa snapshot HTML yang macet (follow-up spec-vektor-4).

## Boundaries & Constraints

**Always:**
- **Format simpan (AD-14).** `d` tetap satu-satunya format geometri. Edit titik hanya menulis `d`. Pengecualiannya satu: bila titik keluar dari `viewBox`, `viewBox` diperluas ke gabungan kotak lama dan kotak titik baru. Dalam kasus itu `width`/`height` angka diskalakan, begitu juga `x`/`y` angka bila node absolute, supaya bentuk tidak bergeser di layar. Atribut lain (`svg`, `fillRule`, stroke, fills, efek) tidak pernah disentuh.
- **Model (`packages/viewer/src/pathEdit.ts`, murni).**
  - Subpath = `{pts, segs, closed}`. `segs[i]` menghubungkan `pts[i]` ke `pts[i+1]`; segmen terakhir path tertutup kembali ke `pts[0]`. Jenis segmen `L` atau `C`.
  - Normalisasi saat model dibuat: `Q` dinaikkan ke `C` secara eksak, dan `A` diubah ke kubik dengan `flattenArcs`. Pada path tertutup, titik akhir yang sama dengan titik awal (≤1e-6) digabung, dan bentuk tulisnya (`L p0 Z` atau `Z`) dicatat.
  - `serialize(model)` → `serializePath`.
  - Handle masuk/keluar = titik kendali kubik di sisi anchor itu. Handle yang berimpit dengan anchornya tidak tampil.
  - Tipe titik: kedua handle tampil, segaris dan berlawanan (≤1°) dengan panjang sama (≤1%) → `mirrored`; segaris saja → `smooth`; selain itu `corner`.
- **Operasi murni:**
  - `moveAnchors` (handle ikut);
  - `moveHandle` (mirrored mencerminkan handle lawan, smooth meluruskan arah lawan dengan panjang tetap; Alt = bebas);
  - `setPointType` (corner melipat handle ke anchor, dan kubik yang kedua handlenya terlipat kembali menjadi `L`; smooth/mirrored membuat handle searah `next − prev` sepanjang ⅓ jarak tetangga, dengan segmen `L` di sisi itu menjadi `C`);
  - `deletePoints` (segmen tetangga digabung; menjadi `C` bila salah satunya kubik);
  - `openAt` (membuang segmen keluar dari titik itu: path tertutup menjadi terbuka mulai dari titik berikutnya, path terbuka dipecah menjadi dua subpath; subpath dengan < 2 titik dibuang);
  - `insertPoint` (de Casteljau / lerp pada t);
  - `hitSegment` (sampel 24 per segmen, toleransi layar);
  - `editPatch` (patch `update` + perluasan viewBox);
  - `penNode` (NodeInput path dari titik pen).
- **Pen tool.**
  - Tombol Pen (ikon `pen-tool`, shortcut P) ada di toolbar sesudah Icon, aktif seperti tool sisip lain, dan nonaktif saat pratinjau atau offline.
  - Klik pertama harus di atas board, dan board itu menjadi parent. Titik disimpan dalam koordinat board.
  - Drag > `CLICK_SLOP` memberi handle keluar = posisi pointer dan handle masuk = cerminannya.
  - Klik pada titik pertama (≤ 6px layar, minimal 2 titik) menutup path dan commit. Enter dengan ≥ 2 titik commit path terbuka. Esc, ganti tool, atau Enter dengan < 2 titik membatalkan tanpa request.
  - Node: `{type:'path', name:'Path', position:'absolute', x, y, width, height, d, viewBox:[0,0,width,height], stroke:{color:'#111111', width:2, align:'center'}, strokeLinecap:'round', strokeLinejoin:'round'}`. `x`/`y` = floor kotak titik, `width`/`height` = ceil (min 1), dan `d` digeser ke origin node.
  - Satu op `add` = satu commit "Draw path". Sesudahnya path baru terpilih dan tool kembali ke Select.
- **Edit titik.**
  - Masuk lewat dobel-klik pada path atau Enter dengan satu path terpilih. Path berotasi tidak bisa diedit, dan ini dicatat di Design Notes.
  - Keluar lewat Esc atau Enter, klik di luar path/anchor/handle (klik itu diteruskan ke seleksi biasa), seleksi yang berganti, path yang hilang dari dokumen, atau tool lain.
  - Klik anchor = pilih (Shift = tambah/kurangi). Drag anchor = geser semua anchor terpilih. Drag handle = `moveHandle`. Klik segmen = sisip titik (terpilih).
  - Delete/Backspace menghapus titik terpilih. Bila semua titik hilang, op yang dikirim adalah `remove` node dan mode edit selesai. Panah menggeser titik terpilih 1px (Shift 10px) dalam satuan layar board.
  - Shortcut lain milik Viewer/Canvas (Delete node, nudge node, Enter teks, Escape kosongkan seleksi) tidak jalan selama mode edit, karena listener capture menghentikannya.
  - Setiap gestur atau aksi = satu op `update {d[, viewBox, width, height, x, y]}`. Label riwayat: "Edit path <nama>", "Add point to <nama>", "Delete point from <nama>", "Change point type", dan "Open path <nama>".
- **Pratinjau.** Selama drag, semua `<path>` di elemen live node mendapat `d` baru, dan `mask-image` lapisan fill dibangun ulang dengan `shapeFillLayerDecls(pathShape(...))`. Pratinjau dipulihkan bila commit gagal atau dibatalkan, dan dibiarkan sampai board di-mount ulang bila commit sukses. Overlay canvas menggambar outline path (accent 1px), garis handle, anchor 8×8 (putih/accent 1.5; terpilih = isi accent dengan garis putih), handle bulat 7px, ring tutup 14px `#3B82F633`, penanda tambah titik 18px accent dengan ikon plus, segmen pratinjau pen putus-putus 4/4, kursor pen + tip "Click to close path", serta banner Pen Hint dan Path Edit Banner sesuai teks desain.
- **Panel Design (J7AmQi).**
  - Path dalam mode edit: subjudul "Path · editing points · N of M selected".
  - Grup "Point" menggantikan Position & size: X/Y (px relatif kotak node; hanya untuk satu titik), segmented "Corner/Smooth/Mirrored" (untuk semua titik terpilih), serta tombol "Delete point" (ikon trash) dan "Open path" (ikon scissors; satu titik yang punya segmen keluar).
  - Grup Fill/Stroke/Effects tetap tampil.
- **Tes snapshot macet:** `snapshotHtml` dengan Browser palsu yang `evaluate`-nya tidak pernah selesai sebelum context ditutup. Dengan `timeoutMs` 50, promise ditolak dan `context.close` dipanggil.

**Never:**
- Tidak ada format path kedua, tidak ada perubahan skema, dan tidak ada route/op baru (op `add`/`update`/`remove` yang sudah ada).
- Tidak ada commit per frame. Viewer tidak bergantung pada core/exec/icons.
- Di luar cakupan: pen di dalam frame (parent selalu board), melanjutkan path terbuka yang sudah ada, marquee titik, snapping/Shift 45°, edit titik pada ellipse/rect/icon, dan sentuh (pen/edit hanya mouse/pen pointer).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pen lurus terbuka | Klik (10,10), (110,10), (110,60), Enter | `add` path x=10,y=10,w=100,h=50, `d` `M0 0L100 0L100 50` | — |
| Pen bezier tertutup | Klik A, drag di B, klik A | `d` berisi `C`, diakhiri `Z`; satu rev | — |
| Pen batal | Satu titik + Esc / Enter | Tidak ada request | — |
| Round trip | `d` korpus (M/L/H/V/C/S/Q/T/A/Z, relatif) | `serialize(model(d))` sama geometri dengan `d` (titik sampel ≤1e-3) | — |
| Geser anchor | Ikon lonceng, anchor digeser 1px | Satu `update {d}`; `vectorToSvg` sebelum/sesudah hanya beda atribut `d` | — |
| Titik keluar viewBox | Anchor digeser keluar | `viewBox` diperluas, `width`/`height` (dan `x`/`y` absolute) diskalakan | — |
| Hapus semua titik | Semua terpilih + Delete | Op `remove` node | — |
| Mirrored | Drag handle keluar | Handle masuk = cerminan | — |
| Corner | Titik kubik → Corner | Handle terlipat; kubik tanpa handle → `L` | — |
| Open path | Path tertutup, titik i | Path terbuka dari i+1 sampai i, tanpa `Z` | Titik akhir path terbuka → tombol nonaktif |
| Undo | Ctrl+Z sesudah edit | Op invers mengembalikan `d` lama | Node sudah dihapus agen → toast Undo skipped (perilaku lama) |
| Agen menulis selama mode edit | Rev baru | Model diturunkan ulang dari `d` terbaru, indeks seleksi di luar jangkauan dibuang | — |
| Snapshot macet | evaluate macet, `timeoutMs` 50 | Ditolak, `context.close()` terpanggil | — |

</intent-contract>

## Code Map

- `packages/render/src/path-data.ts` -- `parsePath`, `serializePath`, `flattenArcs`, `transformPath`, `pathBounds` (sudah ada); `shape.ts` `pathShape`, `shapeFillLayerDecls` untuk pratinjau.
- `packages/render/src/svg.ts` -- `vectorToSvg` untuk tes ekspor ulang.
- `packages/viewer/src/pathEdit.ts` (baru) -- model dan operasi murni + `pathEdit.test.ts`.
- `packages/viewer/src/pathTools.tsx` (baru) -- hook `usePathTools`: state pen dan mode edit, pointer, keyboard capture, pratinjau DOM, overlay, banner, info panel.
- `packages/viewer/src/canvasEdit.tsx` -- dobel-klik path → `onEnterPath`; ekspor `liveEl`.
- `packages/viewer/src/Canvas.tsx` -- tool `pen`, tombol toolbar, routing pointer, Enter path, prop `onCommitCreate`/`onPathEdit`.
- `packages/viewer/src/Viewer.tsx` -- `commitCreate` (pilih node baru), state `pathEdit` ke DesignPanel.
- `packages/viewer/src/DesignPanel.tsx` -- grup Point dan subjudul mode edit.
- `packages/viewer/src/icons.tsx`, `app.css` -- ikon `penTool`, `scissors`; gaya overlay dan banner.
- `packages/daemon/src/paste/html-page.test.ts` (baru) -- tes tutup paksa.
- `tests/vector-edit.test.ts` (baru) -- end-to-end Done-when: paste SVG → edit titik lewat ops → `vectorToSvg` hanya beda `d` → undo.

## Tasks & Acceptance

**Execution:**
- `packages/viewer/src/pathEdit.ts` + `pathEdit.test.ts` -- buat model, operasi, `editPatch`, `penNode`, dan uji matriks (round trip, operasi, viewBox, pen).
- `packages/viewer/src/pathTools.tsx` -- buat hook pen dan edit titik dengan overlay sesuai desain.
- `packages/viewer/src/canvasEdit.tsx`, `Canvas.tsx` -- sambungkan tool Pen, dobel-klik/Enter, pointer routing, dan keyboard.
- `packages/viewer/src/Viewer.tsx`, `DesignPanel.tsx` -- tambah commit create + seleksi, grup Point.
- `packages/viewer/src/icons.tsx`, `app.css` -- tambah ikon dan gaya.
- `packages/daemon/src/paste/html-page.test.ts` -- tambah tes tutup paksa.
- `tests/vector-edit.test.ts` -- tambah tes Done-when epic.

**Acceptance Criteria:**
- Given board di canvas live, when pengguna memilih Pen, mengklik tiga titik, lalu menekan Enter, then satu rev baru berisi path terbuka yang terpilih, dan Ctrl+Z menghapusnya.
- Given ikon SVG hasil paste, when pengguna dobel-klik path, menggeser satu anchor, lalu melepas, then satu rev `update {d}` terjadi, `vectorToSvg` frame ikon hanya berbeda pada `d` path itu, dan Undo mengembalikan `d` lama.
- Given mode edit titik dengan satu titik terpilih, when pengguna memilih "Mirrored", menekan "Delete point", atau "Open path" di panel Design, then masing-masing menjadi satu commit dan canvas menampilkan bentuk baru.
- Given mode edit titik, when pengguna menekan Delete atau panah, then hanya titik yang berubah (node tidak terhapus dan tidak tergeser), dan Esc keluar dari mode edit dengan seleksi tetap.

## Spec Change Log

## Review Triage Log

### 2026-11-23 — Review pass
- verdicts: 46 findings — high 0, medium 12, low 21, false 13, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) Model `held` menang atas undo: undo yang mengembalikan `d` = `held.from` memunculkan lagi model hasil edit — benar. Patch: efek melepas `held` begitu `node.d !== held.from` (smoke: overlay kembali ke anchor lama sesudah Ctrl+Z).
  - `[medium]` `[patch]` (blind) Delete/Backspace/panah bocor ke Viewer saat menggambar pen (node terpilih terhapus/tergeser) — benar. Patch: Delete/Backspace membuang titik pen terakhir (satu titik → batal), panah ditahan (smoke: frame terpilih tetap ada).
  - `[low]` `[patch]` (blind) Listener keyboard memakai closure `finishPen` basi — benar (deps hanya mode). Patch: `penKeys` ref per render.
  - `[low]` `[patch]` (blind) Pointer pen: `onPointerLeave` tidak dipasang, `pointercancel` tidak diteruskan — benar. Patch: Canvas memanggil `paths.pen.onPointerLeave`/`onPointerCancel`. Klaim tanpa pointer capture salah: `Canvas.onPointerDown` memanggil `setPointerCapture` untuk semua pointer.
  - `[low]` `[reject]` (blind) Commit "Draw path" gagal diam-diam dan titik hilang — tidak diam: `applyEdit` Viewer menampilkan toast galat. Menyimpan titik untuk dicoba ulang menambah state; kasus jarang (daemon menolak `add` path sah hanya bila board hilang).
  - `[medium]` `[patch]` (blind) Penjaga rotasi hanya node sendiri; path di frame/board berotasi masuk edit dengan pemetaan salah — benar. Patch: `pathEditable(node, ancestors)` di `pathEdit.ts` memeriksa leluhur; `findNode` mengembalikan rantai leluhur; dites.
  - `[false]` `[reject]` (blind) `viewMapping` mengandaikan `preserveAspectRatio="none"` tanpa bukti — `shape.ts` `maskImage` dan `strokeSvgSpec` menulis `preserveAspectRatio="none"` (peta non-uniform viewBox → kotak).
  - `[low]` `[reject]` (blind) Klik segmen langsung menyisip titik; dobel-klik menambah dua — desain J7AmQi "Click a segment to add a point". Klik kedua jatuh di anchor baru (hit anchor 6px didahulukan), jadi tidak ada titik kedua; menunda ke pointerup menambah state gestur.
  - `[false]` `[reject]` (blind) Masuk edit dari dobel-klik bisa langsung batal bila seleksi dinormalisasi — `selectIds` Viewer = `setSelection(ids)` apa adanya (alamat komposit sama dengan id geometri), dan `setEditing` dibatch di event yang sama; smoke dobel-klik masuk edit.
  - `[medium]` `[defer]` (blind) `pathTools.tsx` tanpa tes — satu akar dengan baris vgap wiring (tanpa harness DOM). Logika keputusan dipindah ke fungsi murni bertes (baris vgap op/pathEditable).
  - `[medium]` `[defer]` (blind) Wiring Canvas/DesignPanel tanpa tes — satu akar dengan baris vgap wiring.
  - `[false]` `[reject]` (blind) Spec tidak memenuhi proses (status in-progress, tanpa triage, deferred kosong) — status in-progress benar di tengah run, triage dan deferred diisi pass ini; daftar Never adalah batas cakupan, bukan temuan tertunda.
  - `[low]` `[reject]` (blind) Verifikasi bergantung pada baseline Windows lokal — perbaikannya mengedit spec build ini; baseline diwajibkan runner, CI Linux tetap acuan PR.
  - `[low]` `[patch]` (blind) Tooltip Pen nonaktif "lakard is offline" padahal kanvas belum live — benar. Patch: tooltip "Pen: available once the canvas has rendered" bila online.
  - `[low]` `[patch]` (blind) Asersi lemah di `tests/vector-edit.test.ts` — benar sebagian. Patch: gestur kedua memakai description dan tes memeriksa label riwayat "Edit path Path"/"Change point type". Pemilihan child indeks dan kasus viewBox diperluas tetap (urutan anak importer dikunci fixture v6; perluasan dites unit).
  - `[low]` `[reject]` (blind) Tes timeout `html-page.test.ts` longgar — tes gagal bila timer tutup paksa dihapus (evaluate macet → timeout vitest); jalur normal dilatih `paste-html.test.ts`. Mengetatkan batas waktu tidak mengubah apa yang dijaga.
  - `[false]` `[reject]` (blind) Warna hard-coded di `app.css` — desain JZqLc/NVyza/Path Drawn memakai literal `#FFFFFF`, `#3B82F633`, `#111111` (tema tidak mengubahnya); `max-width` banner tercatat di Design Notes.
  - `[medium]` `[patch]` (edge) `held` setelah undo — satu akar dengan baris blind `held`; patch yang sama.
  - `[low]` `[patch]` (edge) Rev agen/undo di tengah drag → commit dari basis lama menimpa — benar. Patch: `editUp` membatalkan (pratinjau dipulihkan) bila `serializeModel(base) !== serializeModel(current)`.
  - `[false]` `[reject]` (edge) Lepas pointer di luar kanvas → drag tetap hidup — `Canvas.onPointerDown` memasang pointer capture, jadi pointerup tetap diterima.
  - `[low]` `[patch]` (edge) `pointercancel` saat drag pen — satu akar dengan baris blind pointer pen; patch yang sama.
  - `[low]` `[patch]` (edge) Pratinjau pen tertinggal saat kursor keluar — satu akar dengan baris blind pointer pen; patch yang sama (smoke: 0 segmen pratinjau sesudah keluar).
  - `[low]` `[patch]` (edge) Kotak tampil 0 → Infinity — benar. Patch: `viewMapping` memakai skala 1 bila `box.w/h` 0; dites.
  - `[low]` `[patch]` (edge) Aksi tanpa efek pada `d` belum dinormalisasi membuat rev palsu — benar. Patch: `pathEditOps` membandingkan dengan model sebelum aksi (null = tanpa request); dites dengan arc.
  - `[low]` `[reject]` (edge) Hapus titik menyisakan subpath `M` tunggal → node dihapus — subpath tanpa segmen tidak tergambar; menghapus path tak terlihat wajar, guard tambahan untuk kasus langka.
  - `[low]` `[reject]` (edge) Open path pada subpath tertutup satu titik menghapus node — `d` degeneratif (`M0 0Z`) jarang; guard menambah cabang.
  - `[false]` `[reject]` (edge) Klik segmen di t≈0/1 menyisip anchor berimpit — hit anchor (6px) diuji sebelum hit segmen (5px), jadi klik dekat ujung memilih anchor.
  - `[low]` `[patch]` (edge) Klik ganda di titik pen terakhir menambah titik berimpit — benar. Patch: klik ≤3px dari titik terakhir diabaikan (smoke: dua klik sama menghasilkan satu titik).
  - `[false]` `[reject]` (edge) Ref duplikat menggeser dua kali — seleksi dibangun dengan toggle (`sameRef`) sehingga tidak pernah berisi duplikat.
  - `[low]` `[reject]` (edge) Subpath tertutup satu anchor: handle masuk/keluar objek sama — `d` degeneratif; perbaikan menambah cabang untuk kasus yang tidak dihasilkan editor.
  - `[low]` `[patch]` (edge) Tooltip Pen — satu akar dengan baris blind tooltip; patch yang sama.
  - `[low]` `[reject]` (edge) Mask pratinjau terpotong viewBox lama saat drag keluar — hanya pratinjau (stroke tetap terlihat), hasil commit benar; memperluas viewBox di pratinjau menambah logika DOM.
  - `[medium]` `[patch]` (edge) Klaim matriks "model diturunkan ulang" dilanggar `held` — satu akar dengan baris blind `held`; patch yang sama.
  - `[false]` `[reject]` (edge) Kombinasi Ctrl/Meta lolos saat edit — spec hanya menahan Delete/nudge/Enter/Escape; Ctrl+Z justru harus jalan (undo per jendela), dan ganti tool keluar dari mode edit lewat `canEdit`.
  - `[medium]` `[patch]` (vgap) Keputusan op hook (update/remove/no-op) tanpa tes — Patch: `pathEditOps` murni di `pathEdit.ts`, dipakai `commitModel`, dites (update, remove, no-op).
  - `[medium]` `[patch]` (vgap) `pathEditable` dan pemetaan X/Y panel tanpa tes — Patch: `pathEditable`, `panelXY`, `panelDelta` dipindah ke `pathEdit.ts` dan dites (rotasi, leluhur, d rusak, viewBox `[-2,0,26,24]` → 104×96).
  - `[medium]` `[defer]` (vgap) Wiring Pen/edit di Canvas, canvasEdit, DesignPanel, Viewer hanya smoke — viewer tanpa harness DOM (pra-ada); deferred-work.md.
  - `[medium]` `[defer]` (intent) Satu rev per gestur dibuktikan di route, bukan gestur canvas — satu akar dengan baris vgap wiring; smoke msedge membuktikan satu rev per gestur.
  - `[medium]` `[defer]` (intent) Undo dibuktikan dengan invers manual, bukan tumpukan jendela — satu akar dengan baris vgap wiring; smoke Ctrl+Z memulihkan `d`.
  - `[false]` `[reject]` (intent) Ekspor diperiksa di `vectorToSvg`, bukan ekspor pengguna — `vectorToSvg` adalah serializer ekspor SVG yang ditetapkan story 2 dan dirujuk verify story 3 ("diekspor ulang lewat serializer story 2").
  - `[low]` `[intent_gap]` (intent) "Hanya `d`" bersyarat (viewBox diperluas bila titik keluar) — diputuskan (delegasi, AD-14 + R7 "tanpa kehilangan atribut"): tidak ada atribut yang hilang atau berubah selama titik di dalam viewBox; perluasan geometri kotak hanya saat perlu agar fill tidak terpotong. Tanpa perubahan kode (Design Notes).
  - `[false]` `[reject]` (intent) Round trip diuji geometris — round trip teks parser/serializer `d` sudah dikunci `path-data.test.ts` (story 3); model editor dites geometri + idempoten, sesuai AD-14 (format tetap `d`).
  - `[false]` `[reject]` (intent) Kontrol stroke vektor tidak disentuh — dibangun di story 2 (Design Notes spec-vektor-2: "story 5 tinggal memakainya"), tersedia di grup Stroke mode edit (smoke).
  - `[low]` `[reject]` (intent) Kesesuaian desain tidak dites — C6 diverifikasi manual (MCP pencil + screenshot smoke), pola semua story UI.
  - `[false]` `[reject]` (intent) Done-when installer rilis tidak dicakup — butir tingkat epic; installer membundel viewer dari build yang sama tanpa langkah story ini.
  - `[false]` `[reject]` (intent) Tes tutup paksa snapshot di luar intent — diminta eksplisit oleh prompt story (follow-up spec-vektor-4).

## Design Notes

- **Arc dan kuadratik dinormalisasi ke kubik saat edit.** `A` sulit diedit sebagai handle, dan parameternya tidak tahan transform. Bentuknya setara (aproksimasi kubik standar), dan `d` hanya ditulis ulang bila pengguna benar-benar mengedit (seperti Figma saat impor). Arc besar bisa menjadi beberapa anchor.
- **Perluasan viewBox hanya bila perlu.** Selama titik tetap di dalam `viewBox`, hanya `d` yang berubah (Done-when epic). Bila titik keluar, fill akan terpotong mask kotak. Karena itu `viewBox` dan ukuran diperluas dengan skala yang sama, sehingga bentuk tetap di tempatnya. Pengecualian: anak flow tidak punya `x`/`y`, jadi bentuknya bergeser sesuai reflow. `width`/`height` non-angka (`fill`, token) tidak diubah.
- **Open path = buang segmen keluar dari titik terpilih.** Hasilnya langsung terlihat. Memecah titik menjadi dua titik berimpit tidak memberi umpan balik visual.
- **Koordinat X/Y titik** = px relatif kotak node (viewBox dipetakan ke ukuran tampil). Desain tidak menyebut acuannya.
- **Dobel-klik pada path mana pun** (termasuk path di dalam frame ikon yang belum terpilih) langsung masuk mode edit. Path berotasi dikecualikan, karena geometri live berupa kotak tanpa rotasi.
- **Pen hanya ke board:** sama dengan tool sisip (aplikasi 4). Node absolute dengan koordinat board.
- **Pratinjau tertahan sederhana:** sesudah commit, DOM pratinjau dibiarkan sampai board di-mount ulang (elemen diganti). Mount dari rev agen yang lebih lama bisa menampilkan bentuk lama sesaat.
- **Banner di kiri atas kanvas** (desain menaruh Pen Hint dan Path Edit Banner di kiri tombol Export). Pada kanvas sempit, teks bantuan dipotong dengan elipsis supaya tidak menimpa tombol Theme/Export.
- **Overlay seleksi biasa disembunyikan selama mode edit/pen.** Kotak seleksi, handle resize, hover, dan tag komponen tidak digambar (desain J7AmQi hanya menampilkan outline path dan anchor).
- **"Hanya `d`" (intent gap, diputuskan saat triage):** AD-14 + R7 ("tanpa kehilangan atribut") dibaca sebagai: tidak ada atribut presentasi, `svg`, stroke, atau fill yang hilang/berubah. Selama titik di dalam viewBox hanya `d` yang ditulis (Done-when). Perluasan viewBox/ukuran hanya saat titik keluar.
- **Keyboard pen (triage):** Delete/Backspace membuang titik pen terakhir (titik terakhir habis = batal), panah ditahan. Dengan begitu node yang masih terpilih tidak terhapus atau tergeser selama menggambar. Klik ≤3px dari titik terakhir tidak menambah titik berimpit.
- **Rotasi leluhur (triage):** path di dalam frame/board berotasi juga tidak bisa diedit titiknya (`pathEditable(node, ancestors)`).
- **Gestur basi (triage):** bila `d` berubah (agen/undo) di tengah drag titik, gestur dibatalkan saat dilepas, bukan menimpa perubahan itu. Aksi tanpa efek (mis. Corner pada titik corner) tidak mengirim request, juga untuk `d` sumber yang belum dinormalisasi.
- **Tanpa desain:** tip kursor pen hanya tampil di atas titik pertama ("Click to close path"). Kursor pen di canvas memakai `crosshair`.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 exec vitest run packages/viewer/src/pathEdit.test.ts packages/render/src/path-data.test.ts packages/daemon/src/paste/html-page.test.ts tests/vector-edit.test.ts packages/viewer tests/dependency-direction.test.ts` -- expected: hijau.
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: sukses.
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`.

**Manual checks:**
- Smoke msedge terhadap daemon lokal: Pen menggambar path tertutup (satu rev, terpilih), dobel-klik path, drag anchor (satu rev), Delete titik, Mirrored, Open path, Esc keluar, Undo.

## Auto Run Result

**Ringkasan:** viewer mendapat Pen tool (P) dan mode edit titik path di canvas live sesuai desain bagian 10 (DHXJM/Lwpld, J7AmQi/S8w37, JZqLc, NVyza).
- **Pen:** klik = titik lurus, drag = handle bezier, klik titik pertama = tutup, Enter = selesai, Esc = batal, Delete/Backspace = buang titik terakhir. Satu op `add` = satu rev "Draw path", lalu path baru terpilih.
- **Edit titik:** masuk lewat dobel-klik atau Enter. Di mode ini anchor dan handle bisa digeser (mirrored/smooth/Alt bebas), titik bisa ditambah dengan klik segmen dan dihapus dengan Delete, titik bisa digeser dengan panah, dan grup Point di panel Design menyediakan X/Y, Corner/Smooth/Mirrored, Delete point, dan Open path.
- **Penulisan `d` (AD-14):** `d` diurai dengan `parsePath` dan ditulis kembali dengan `serializePath`. Satu gestur/aksi = satu `update` lewat route ops (AD-7), dan undo memakai op invers per jendela (AD-8).
- **Tes tambahan:** tes tutup paksa snapshot HTML yang macet (follow-up spec-vektor-4).

**File berubah:**
- `packages/viewer/src/pathEdit.ts` (baru) + `pathEdit.test.ts` -- model titik murni, operasi, `editPatch`/`pathEditOps`, `pathEditable`, koordinat panel, `penNode`.
- `packages/viewer/src/pathTools.tsx` (baru) -- hook pen/edit: pointer, keyboard capture, pratinjau DOM, overlay, banner, data panel.
- `packages/viewer/src/Canvas.tsx` -- tool Pen, tombol, routing pointer, Enter path, prop `onCommitCreate`/`onPathEdit`.
- `packages/viewer/src/canvasEdit.tsx` -- dobel-klik path → edit, overlay seleksi disembunyikan, `nodeGeo`/`liveEl`.
- `packages/viewer/src/Viewer.tsx` -- `commitCreate` (seleksi node baru), state `pathEdit`.
- `packages/viewer/src/DesignPanel.tsx` -- grup Point dan subjudul mode edit.
- `packages/viewer/src/icons.tsx`, `app.css` -- ikon `penTool`/`scissors`, gaya overlay/banner/Point.
- `packages/daemon/src/paste/html-page.test.ts` (baru) -- tutup paksa saat `timeoutMs`.
- `tests/vector-edit.test.ts` (baru) -- Done-when epic: paste ikon → edit titik → `vectorToSvg` hanya beda `d` → undo; pen add → undo.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- defer wiring tanpa harness DOM.

**Review:** 46 temuan (high 0, medium 12, low 21, false 13, maybe-false 0).
- **Patch, medium (5 entri):**
  - `held` dilepas saat `d` berubah (undo tidak memunculkan model lama);
  - keyboard pen menahan Delete/panah;
  - rotasi leluhur;
  - `pathEditOps` murni dan bertes;
  - `pathEditable`/`panelXY`/`panelDelta` murni dan bertes.
- **Patch, low:**
  - closure keyboard pen lewat ref;
  - pointerleave/cancel pen;
  - tooltip Pen;
  - label riwayat di tes e2e;
  - gestur basi dibatalkan;
  - kotak 0 tanpa Infinity;
  - aksi tanpa efek tanpa request;
  - titik pen berimpit diabaikan.
- **Defer (1 entri, medium):** wiring canvas/panel tanpa tes otomatis (viewer tanpa harness DOM). Menggabungkan baris blind (2), vgap (1), dan intent (2).
- **Intent gap diputuskan (1):** "hanya `d`" dibaca sebagai tanpa kehilangan atribut; perluasan viewBox hanya bila titik keluar. Tanpa perubahan kode.
- **Reject dengan alasan di log:**
  - commit pen gagal (sudah ada toast);
  - sisip segmen saat pointerdown (sesuai desain);
  - baseline lokal;
  - tes timeout;
  - subpath `M` tunggal dan subpath tertutup satu titik;
  - mask pratinjau;
  - kesesuaian desain manual;
  - temuan false: preserveAspectRatio, normalisasi seleksi, proses spec, warna desain, pointer capture, t≈0/1, ref duplikat, Ctrl lolos, ekspor library, round trip, kontrol stroke, installer, tes snapshot.

**Follow-up:** `false`. Pass pertama mem-patch 5 entri medium (high 0, medium 5, low 8 entri patch), sehingga aturan menghasilkan `true` dengan risiko "perilaku UI pen/edit sesudah patch belum terverifikasi". Smoke msedge diulang pada kode yang sudah dipatch dan lulus, jadi diset `false`. Hasil smoke ulang:
- frame terpilih tidak terhapus oleh Delete saat menggambar;
- klik ganda di titik yang sama tidak menambah titik;
- pratinjau hilang saat kursor keluar kanvas;
- drag anchor = satu rev;
- Ctrl+Z memulihkan `d` dan overlay anchor;
- tanpa galat halaman.

**Verifikasi:**
- `pnpm build`: sukses.
- `tsc -p tsconfig.test.json` dan `tsc -p packages/viewer`: sukses.
- vitest `pathEdit` (33), `vector-edit` (2), `html-page` (1), viewer, `dependency-direction`, dan paste: hijau.
- `pnpm test`: kegagalan = baseline Windows (tidak ada yang baru). Snapshot bench yang hanya berubah CRLF dikembalikan.
- Smoke msedge (implementasi dan sesudah patch):
  - pen tertutup/terbuka;
  - dobel-klik/Enter masuk edit;
  - drag anchor, Corner/Mirrored, Delete titik, Open path, Esc, dan Ctrl+Z, masing-masing satu rev.

**Risiko sisa:**
- arc/kuadratik menjadi kubik saat diedit;
- anak flow bergeser saat viewBox diperluas;
- mask pratinjau terpotong viewBox lama selama drag;
- pratinjau tertahan bisa sesaat menampilkan bentuk lama saat mount dari rev agen;
- wiring UI hanya smoke;
- pen hanya ke board.
