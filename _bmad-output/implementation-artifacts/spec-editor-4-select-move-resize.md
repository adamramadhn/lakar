---
title: 'Seleksi, geser, dan ubah ukuran di canvas (epic editor-canvas story 4)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: 'dd4894f84ce10e17280f4fedffa6a0f894a95baa'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Wiring gestur useCanvasEdit (pointer → satu onCommit per gestur, Escape tanpa request, reorder noop, pratinjau tertahan) dan alur integrasi viewer + daemon (rev per gestur, undo round trip) belum punya tes otomatis; hanya smoke Playwright manual.
    evidence: |-
      Pre-verified (verification gap): pencarian useCanvasEdit|canvasEdit|onCommit di file tes kosong; vitest tanpa environment DOM. gesture.ts, liveGeometry.ts, undoHistory.ts kini dites murni. Usul: ekstrak mesin state gestur murni atau tambah e2e Playwright /app/ (bersama deferred story 3).
    location: >-
      packages/viewer/src/canvasEdit.tsx useCanvasEdit; packages/viewer/src/Viewer.tsx commitOps/stepHistory
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Canvas viewer sudah merender board sebagai DOM hidup (story 3), tetapi klik hanya memilih board, seleksi satu node berasal dari `POST /inspect`, dan tidak ada gestur edit. Editor canvas butuh seleksi node langsung di canvas, geser, urutkan ulang, dan ubah ukuran dengan satu commit per gestur (AD-7) serta undo lewat op invers (AD-8).

**Approach:** Modul murni `gesture.ts` memegang matematika gestur (hit-test pohon kotak, pilih target per scope, marquee, resize, indeks reorder, op hasil gestur). `Canvas` mengukur kotak node dari shadow root (`[data-lakar-id]`) board live, menggambar overlay seleksi/hover/marquee/drag sesuai desain bagian 05, menampilkan pratinjau lokal selama gestur, dan memanggil `onCommit(ops)` sekali di akhir. `Viewer` memegang seleksi banyak node, mengirim ops lewat `api.applyOps`, dan tumpukan undo/redo per jendela dari `inverse` respons.

## Boundaries & Constraints

**Always:**
- Satu gestur (geser, reorder, resize) = paling banyak satu `POST /viewer/docs/:slug/ops`; gestur tanpa perubahan (delta bulat 0, indeks sama) tidak mengirim apa pun.
- Selama gestur hanya pratinjau lokal (gaya DOM sementara / overlay); Escape membatalkan gestur dan memulihkan pratinjau tanpa request.
- Koordinat gestur dikonversi dari layar ke koordinat board/halaman dengan kamera (`(client − kiri kanvas − cam.x)/z`), sehingga benar di semua zoom/pan; nilai di-commit dibulatkan ke integer.
- Undo/redo (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y, tombol toolbar) mengirim `inverse` respons sebelumnya sebagai commit baru; hanya commit gestur jendela ini yang masuk tumpukan. Invers gagal → entri dibuang + toast, tanpa undo sebagian.
- Seleksi canvas dan Layers satu state (Viewer): klik baris Layers memilih satu node, Shift-klik baris menambah/mengurangi; semua node terpilih tersorot di keduanya.
- Sentuh (pointer `touch`): perilaku sama seperti sebelumnya (pan satu jari, pinch, tap memilih board); tanpa gestur edit, marquee, atau hover.
- Pratinjau versi (History), offline, atau tool selain Select: tidak ada gestur edit (seleksi klik tetap boleh kecuali tool sisip/Hand).
- Warna overlay dari token yang ada (`--accent`); teks UI Inggris.

**Never:**
- Tidak mengubah route/respons daemon, core, schema, atau tool MCP; tidak memakai `execute`/codegen untuk gestur.
- Tidak menyentuh undo hapus berbasis restore (Delete + toast Undo) — story 6.
- Tidak menambah gestur rotasi, snapping/guide, duplikasi Alt-drag, atau pindah node absolute ke parent lain.
- Tidak membuka `EventSource` baru; viewer tidak mengimpor core/exec/icons.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Klik pertama | tanpa seleksi, klik teks dalam kartu dalam Row di board | terpilih anak langsung board di jalur hit (Row) | — |
| Klik dalam scope | Row terpilih → klik kartu lain di Row; kartu A terpilih → klik kartu B | terpilih kartu (saudara/anak scope seleksi) | — |
| Klik dalam / dobel | Ctrl/⌘-klik, atau dobel-klik node terpilih | Ctrl/⌘: node terdalam; dobel: anak node terpilih di bawah kursor | — |
| Shift-klik | A terpilih, Shift-klik B, lalu Shift-klik A | [A,B] lalu [B] | — |
| Klik kosong | klik di luar board | seleksi kosong | — |
| Marquee | drag dari area kosong / latar board yang belum terpilih | kotak `#3B82F61A` + garis accent; node yang beririsan (turun ke kontainer yang memuat penuh marquee) terpilih; Shift = tambah | marquee < 3px = klik |
| Geser absolute | node `position:absolute` / anak frame `none` / board, drag Δ layar (dx,dy) zoom z | pratinjau ikut kursor; lepas → 1 op `update {x,y}` (board: `x,y` board) per node, 1 rev | gagal → pratinjau dipulihkan + toast |
| Reorder flow | satu anak flow di-drag di parent row/column | asli redup 0.35, slot putus-putus, pratinjau mengikuti kursor, bar drop + outline target + hint "Move to position N in <Parent>"; lepas → `move {id,parentId,index}` | indeks sama → tanpa request |
| Pindah ke frame lain | kursor di atas kontainer flow lain (board / frame row/column) bukan turunan node | target = kontainer itu, `move` ke parentId baru | kontainer `none`/bukan kontainer → tidak pindah parent |
| Resize | handle (8 arah) node tunggal atau multi | pratinjau ukuran + badge `W × H`; lepas → `update {width,height}` (+`x,y` bila absolute/board berubah); icon → `size`; multi → kotak tiap anggota diskalakan terhadap bounding box | ukuran min 1 |
| Escape | saat gestur | gestur batal, pratinjau pulih, tanpa request | — |
| Undo / Redo | Ctrl+Z sesudah gestur; Ctrl+Shift+Z | dokumen kembali / maju, masing-masing 1 rev | NOT_FOUND → entri dibuang, toast "Couldn't undo: …" |
| Multi-select | 3 node terpilih | outline 1px tiap anggota + kotak bounding 1.5px dengan 8 handle + badge "3 selected · W × H" | — |
| Sentuh | tap / drag satu jari | tap memilih board, drag = pan (seperti sekarang) | — |

</intent-contract>

## Code Map

- `packages/viewer/src/Canvas.tsx` -- pointer handler kanvas, overlay `.selection`, `BoardLive` (mount async), toolbar; tempat gestur dan overlay baru.
- `packages/viewer/src/Viewer.tsx` -- state `selectedId`, `select`, LayerTree, `highlight` (dari `/inspect`), `loadDoc`, toast; tempat seleksi banyak, `commitOps`, tumpukan undo.
- `packages/viewer/src/liveBoard.ts` -- `mountLive` (shadow root `.root` → elemen board `[data-lakar-id]`).
- `packages/render/src/layout.ts` -- aturan flow/absolute: board = kolom, frame `layout` default `none` (semua anak absolute), anak `position:'absolute'`.
- `packages/core/src/transaction.ts` -- `move` (index = posisi akhir sesudah dilepas), `update` (`implicitAbsolute` untuk anak frame `none`).
- `packages/viewer/src/api.ts` -- `applyOps(slug, ops, description)` → `OpsResult.inverse`.
- `packages/viewer/src/sheet.ts` -- `pointerIntent`, `CLICK_SLOP`.
- `packages/viewer/src/icons.tsx` -- ikon UI (perlu `redo2`, `arrowLeftRight`, `arrowUpDown`).
- `packages/viewer/src/app.css` -- `.selection`, `.handle`, `.size-badge`.
- `packages/viewer/src/canvasEdit.tsx` -- baru saat implementasi: hook `useCanvasEdit` (state gestur, pratinjau, overlay) agar Canvas.tsx tidak membengkak.

## Tasks & Acceptance

**Execution:**
- [x] `packages/viewer/src/gesture.ts` -- baru, murni (tanpa DOM): tipe `GeoNode` (id, type, box koordinat halaman, absolute, x/y tersimpan, layout anak, children), `hitPath`, `pickTarget` (scope/deep/enter), `toggleSelection`, `marqueeSelect`, `unionBox`, `resizeBox` (8 handle, min 1), `scaleBox`, `reorderTarget` (indeks akhir + posisi 1-based + bar + noop), `dropContainer`, `moveOps`/`resizeOp`, `reorderHint`, `sizeBadge` -- logika gestur bisa dites.
- [x] `packages/viewer/src/gesture.test.ts` -- baru: tes semua fungsi di atas mengikuti baris matriks.
- [x] `packages/viewer/src/liveGeometry.ts` -- baru (DOM): `measureBoard(host, board)` membangun pohon `GeoNode` dari `getBoundingClientRect` elemen `[data-lakar-id]` di shadow root dibagi skala, `liveElement(host,id)` -- jembatan DOM ↔ gesture.ts.
- [x] `packages/viewer/src/canvasEdit.tsx` -- baru: `useCanvasEdit` (hit-test + pickTarget, marquee, geser/reorder/resize dengan pratinjau gaya sementara dan klon drag, Escape, pratinjau tertahan sampai mount ulang, overlay desain bagian 05) dan `SelectionBox` -- logika gestur ber-DOM terpisah dari Canvas.
- [x] `packages/viewer/src/Canvas.tsx` -- prop `selection: string[]`, `onSelectIds(ids)`, `onCommit(ops, description)`, `canUndo/canRedo/onUndo/onRedo`; `BoardLive` melapor mount (`onMounted`); geometri di-cache per board per mount; gestur mouse (klik/Shift/Ctrl/dobel, marquee, geser, reorder, resize, Escape); overlay hover, seleksi tunggal/multi + 8 handle + badge, marquee, ghost slot, outline target, bar drop, hint, pratinjau drag; tombol Undo/Redo di toolbar -- desain bagian 05.
- [x] `packages/viewer/src/Viewer.tsx` -- `selection: string[]` (primer = terakhir untuk Inspect/viewState); LayerTree menyorot semua + Shift-klik; `commitOps` (applyOps → push invers, kosongkan redo, `loadDoc`), `undo`/`redo` dengan pembuangan entri gagal + toast; shortcut Ctrl/⌘+Z/Shift+Z/Y (bukan saat mengetik/dialog) -- AD-8.
- [x] `packages/viewer/src/icons.tsx` -- tambah `redo2`, `arrowLeftRight`, `arrowUpDown` (lucide).
- [x] `packages/viewer/src/app.css` -- gaya overlay baru (hover, seleksi 1.5px, 8 handle, member outline, marquee, ghost slot, target, bar drop, hint, pratinjau drag) -- desain bagian 05.

**Acceptance Criteria:**
- Given dokumen dengan board live di viewer, when pengguna mengklik node, Shift-klik node lain, atau menarik marquee, then seleksi canvas tampil sesuai desain (outline + handle + badge) dan baris Layers yang sama tersorot, di zoom 25%–400% dan sesudah pan.
- Given node absolute terpilih di rev r, when pengguna menggeser lalu melepas, then dokumen menjadi r+1 dengan satu entri riwayat `lakar-viewer` dan posisi baru; Ctrl+Z menghasilkan r+2 dengan posisi semula; Ctrl+Shift+Z r+3 dengan posisi baru.
- Given anak flow dalam Row, when pengguna menariknya ke posisi lain, then hint "Move to position N in Row" tampil selama drag dan sesudah lepas urutan berubah dengan satu rev.
- Given node terpilih, when pengguna menarik handle lalu Escape sebelum melepas, then ukuran kembali dan tidak ada request ops.
- Given perangkat sentuh, when pengguna tap/drag di kanvas, then perilaku sama dengan sebelum story ini.

## Spec Change Log

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 41 findings — high 0, medium 14, low 15, false 12, maybe-false 0
- findings:
  - `[false]` `[reject]` (blind) Gestur edit tanpa pointer capture, pointerup di luar kanvas membuat gestur macet — Canvas.onPointerDown memanggil `e.currentTarget.setPointerCapture(e.pointerId)` sebelum `edit.onPointerDown`, jadi pointerup tetap sampai ke section.
  - `[low]` `[patch]` (blind) Reorder memulihkan pratinjau sebelum commit sehingga node lompat balik — Reorder kini lewat `commit()`: asli tetap redup sampai board di-mount ulang, gagal → dipulihkan (canvasEdit.tsx onPointerUp).
  - `[medium]` `[patch]` (blind) Pratinjau tertahan bisa macet selamanya — `Held.mounts` kini hanya board dari node yang punya op, dan board yang sudah tidak ada di halaman dianggap selesai (efek bergantung `boards`).
  - `[medium]` `[patch]` (blind) Undo/Redo toolbar tidak dijaga terhadap klik beruntun/permintaan berjalan — `stepHistory` kini keluar bila `editing.current > 0` (berlaku untuk toolbar dan keyboard).
  - `[low]` `[reject]` (blind) Undo bisa jalan di tengah gestur — undo memuat ulang dokumen, board di-mount ulang, dan efek mount membatalkan gestur yang berjalan (pratinjau dipulihkan); jarang dan aman, guard tambahan menambah cabang.
  - `[medium]` `[patch]` (blind) Gagal sementara menghapus entri undo — `settleStep` (undoHistory.ts) mengembalikan entri untuk error non-ApiError/5xx; hanya penolakan 4xx (invers basi) yang membuang entri (AD-8).
  - `[low]` `[patch]` (blind) Tumpukan undo tidak dikosongkan sesudah Restore/edit eksternal — Restore sukses kini mengosongkan tumpukan; edit agen tetap dialamati per ID di rev terbaru sesuai AD-7/AD-8; batas ukuran tumpukan tidak diperlukan (entri kecil, per jendela).
  - `[false]` `[reject]` (blind) Klon drag tampil tanpa gaya — render memakai gaya inline (layout.ts), CSS shadow board hanya reset host; screenshot smoke menampilkan klon berwarna.
  - `[low]` `[reject]` (blind) hitPath tidak menjangkau bagian node yang keluar dari parent — nyata untuk konten overflow, tetapi mengubah turunan hit-test ke semua anak menambah aturan clip per frame; node tetap bisa dipilih di bagian dalam parent atau lewat Layers.
  - `[low]` `[reject]` (blind) Cache geometri basi sesudah perubahan layout pasca-mount — face ditunggu sebelum mount dan deps parsial memicu mount ulang; sisa kasus (face > 3 dtk) jarang, perbaikan butuh ResizeObserver/ukur ulang.
  - `[low]` `[patch]` (blind) Warna marquee hard-coded — `.edit-marquee` kini `color-mix(in srgb, var(--accent) 10%, transparent)`.
  - `[medium]` `[patch]` (blind) Celah tes besar terhadap AC — ditambah `undoHistory.test.ts` dan `liveGeometry.test.ts` (lihat baris verification gap); wiring hook ditunda (baris defer).
  - `[low]` `[patch]` (blind) Resize multi mempratinjau x/y node flow yang tidak di-commit — `committedBox` (gesture.ts) dipakai pratinjau, kotak tertahan, dan op: flow tetap di posisinya.
  - `[false]` `[reject]` (blind) LayerTree multi-select hanya mouse dan melewati `select` — baris yang di-toggle selalu di halaman aktif (efek pindah halaman `select` tidak relevan), `selectedId` masih dipakai untuk scroll baris, dan seleksi banyak via keyboard tidak diminta intent.
  - `[false]` `[reject]` (blind) Nudge keyboard tidak ada dan item non-goal tidak dicatat di deferred-work — intent tidak meminta nudge; daftar Never adalah batas cakupan, bukan temuan tertunda.
  - `[low]` `[reject]` (blind) Spec tidak lengkap (Code Map, log kosong, baseline lokal, judul Redo tanpa Ctrl+Y) — perbaikan mengedit spec build ini (ditolak aturan); log kosong wajar sebelum review; judul tooltip kosmetik.
  - `[medium]` `[patch]` (edge) Held berisi board yang tidak pernah di-mount ulang — sama dengan baris held di atas (ID dari op saja).
  - `[medium]` `[patch]` (edge) Anggota multi tanpa op menahan held — sama (ID difilter op).
  - `[medium]` `[patch]` (edge) Board di held dihapus sebelum mount ulang — board yang tidak ada di `boards` dianggap selesai.
  - `[low]` `[reject]` (edge) canEdit berubah false di tengah gestur — pointer di-capture sehingga History/pratinjau tidak bisa dibuka saat drag; offline → request gagal dan pratinjau dipulihkan; Space di tengah drag tidak berbahaya.
  - `[low]` `[patch]` (edge) Pointer lain ditelan saat gestur mouse aktif — onPointerMove/onPointerUp kini mengembalikan false untuk pointer bukan milik gestur.
  - `[low]` `[patch]` (edge) Reorder berkedip ke slot lama — sama dengan baris reorder blind (commit tertahan).
  - `[false]` `[reject]` (edge) Anak frame none tanpa position mendapat x/y → SCHEMA_INVALID — `implicitAbsolute` di core transaction.ts menambahkan position:'absolute' untuk anak frame none; smoke geser berhasil.
  - `[low]` `[patch]` (edge) Pratinjau icon non-persegi berbeda dari `size` — `committedBox` membuat kotak icon persegi.
  - `[low]` `[patch]` (edge) Node flow di-resize dari handle w/n: kotak tertahan bergeser — `committedBox` menjangkar x/y node flow.
  - `[false]` `[reject]` (edge) Slug berganti saat applyOps berjalan → invers masuk tumpukan dokumen baru — App.tsx:185 me-mount Viewer dengan `key={route.slug}`, jadi state dan ref tumpukan baru per slug.
  - `[medium]` `[patch]` (edge) Klik Undo/Redo beruntun berpacu — guard `editing.current` di `stepHistory`.
  - `[low]` `[reject]` (edge) ID non-primer basi tetap di seleksi — overlay dan Layers melewati ID yang tidak ada; tidak ada aksi yang memakainya selain toggle; dampak kosmetik.
  - `[false]` `[reject]` (edge) Redo hanya dikosongkan bila invers tidak kosong — gestur hanya mengirim op yang mengubah (moveOps/resizeOp/noop reorder dilewati), jadi commit sukses selalu punya invers.
  - `[medium]` `[patch]` (vgap) Tumpukan undo/redo Viewer tanpa tes — transisi dipindah ke `undoHistory.ts` murni (recordCommit/takeStep/settleStep) dengan `undoHistory.test.ts`; Viewer memakainya.
  - `[medium]` `[patch]` (vgap) Klasifikasi absolute/flow dan x/y `measureBoard` tanpa tes — `liveGeometry.test.ts` dengan shadow root palsu (frame none, absolute di row, flow, skala, node tanpa elemen).
  - `[medium]` `[defer]` (vgap) Wiring gestur→ops di `useCanvasEdit` tidak teruji — butuh lingkungan DOM/e2e; dicatat di frontmatter `deferred` dan deferred-work.md.
  - `[false]` `[reject]` (vgap) `mountsOf` kosong melepas held seketika — anggota berasal dari `index` geometri sehingga `boardOf` selalu menemukan board; ops kosong keluar sebelum held dibuat.
  - `[medium]` `[patch]` (vgap) Delete dengan seleksi banyak mengosongkan seluruh seleksi — kini hanya node terhapus yang keluar dari seleksi; Delete banyak node sekaligus menjadi bagian story 6 (keputusan: tetap primer).
  - `[medium]` `[patch]` (vgap) Toolbar Undo/Redo tanpa guard — sama dengan guard `editing.current`.
  - `[low]` `[patch]` (vgap) `toggleSelect` menduplikasi `toggleSelection` — Viewer kini memakai `toggleSelection` dari gesture.ts.
  - `[false]` `[reject]` (intent) Div-1 cakupan undo tumpang tindih story 6 — brief story dari orkestrator meminta eksplisit tumpukan undo per jendela minimal dengan Ctrl+Z/Ctrl+Shift+Z di story ini; undo hapus tetap untuk story 6.
  - `[false]` `[reject]` (intent) Div-2 reparent — teks story: "mengurutkan ulang anak flow (move ke index baru, termasuk pindah ke frame lain bila jelas)".
  - `[false]` `[reject]` (intent) Div-3 klik tidak memilih node terdalam — klik memilih node (anak scope) sesuai konvensi alat desain yang dicatat di Design Notes; terdalam lewat Ctrl/⌘ atau dobel-klik.
  - `[medium]` `[defer]` (intent) Div-4 Verify tanpa tes integrasi — satu akar dengan baris defer wiring hook; smoke Playwright dijalankan dan dicatat di Auto Run Result.
  - `[false]` `[reject]` (intent) Div-5 tanpa bukti kesesuaian desain — nilai overlay diambil dari node .pen bagian 05 lewat MCP pencil (ThF3U Selection, Vix1u/xNTJS Size Badge, tCPAH Marquee, ERo7m Ghost Slot, yyhag Drop Target, QMMmk Drop Indicator, fh5d3 Drop Hint, CW3iw Drag Preview); lompat balik reorder ditangani baris patch.

## Design Notes

- **Pilih target (Figma-ish).** Jalur hit = board → … → node terdalam yang memuat titik (anak terakhir yang memuat = paling atas). Tanpa modifier: node terdalam di jalur yang parent-nya = parent salah satu node terpilih (scope saudara); bila tidak ada → anak langsung board (atau board bila hanya board). Ctrl/⌘ = terdalam; dobel-klik = anak di jalur yang parent-nya node terpilih. Alasan: drag kartu dalam Row (desain Drag reorder) butuh kartu terpilih, bukan teks di dalamnya.
- **Mulai drag.** Pointer turun pada node terpilih → geser seleksi. Pada node belum terpilih → pilih (Shift: tambah) lalu geser bila bergerak. Pada latar board yang belum terpilih atau area kosong → marquee. Board terpilih digeser dari latarnya.
- **Marquee.** Kontainer awal = board (atau halaman untuk area kosong). Anak kontainer yang memuat penuh marquee dan punya anak → turun ke dalamnya; selain itu anak yang beririsan dipilih. Sesuai desain Marquee (headline + subheadline di dalam frame hero).
- **Geser vs reorder.** Board dan node absolute (`position:'absolute'` atau parent frame `none`) → `update {x,y}` (Δ/zoom, dibulatkan). Anak flow (parent board/frame row|column, bukan absolute) → reorder hanya bila seleksi tunggal; di seleksi multi node flow tidak ikut digeser. Pindah parent hanya ke kontainer flow terdalam di bawah kursor (bukan turunan node) — "bila jelas"; anak absolute tidak pindah parent.
- **Indeks reorder.** Saudara sesudah node dilepas (urutan dokumen); bar sebelum saudara flow pertama yang titik tengahnya (sumbu parent) melewati kursor; indeks = posisinya di daftar itu, atau sesudah saudara flow terakhir. Hint posisi N = urutan flow 1-based.
- **Resize.** Handle mengubah sisi yang ditarik; `x,y` ikut di-commit hanya untuk node absolute/board. Node flow hanya `width/height` angka (fixed). Icon tidak punya width/height → `size = max(w,h)`. Multi: tiap anggota dipetakan dari bounding box lama ke baru.
- **Pratinjau.** Node live: gaya sementara (`left/top`, `width/height`, `translate`) pada elemen di shadow root dipulihkan saat batal/gagal; board: offset di state React. Sesudah commit pratinjau dibiarkan sampai board di-mount ulang dari rev baru (tanpa lompat balik). Reorder tidak me-reflow DOM; hanya overlay (asli redup, klon pratinjau 0.92 + bayangan).
- **Geometri lokal.** Seleksi/hover di mode live diukur dari DOM (bukan `/inspect`); jalur PNG (pratinjau versi) tetap memakai `highlight` lama.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 exec vitest run packages/viewer tests/dependency-direction.test.ts` -- expected: lulus.
- `npx -y pnpm@12.21.0 test` -- expected: tanpa kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`.

**Manual checks (if no CLI):**
- Smoke Playwright (msedge) pada daemon lokal: klik/Shift/marquee memilih, geser node absolute dan reorder anak Row menghasilkan satu rev per gestur (`GET /viewer/docs/:slug/history`), Ctrl+Z memulihkan, Escape membatalkan, seleksi benar sesudah zoom.

## Auto Run Result

**Ringkasan:** Canvas live mendapat seleksi node lewat hit-test geometri DOM (scope/Shift/Ctrl/dobel-klik, marquee), geser node absolute/board, reorder anak flow (termasuk pindah ke kontainer flow lain), resize 8 handle (tunggal dan multi), pratinjau lokal + Escape, satu `POST /viewer/docs/:slug/ops` per gestur, dan undo/redo per jendela dari op invers (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y, tombol toolbar). Layers berbagi seleksi banyak.

**File:**
- `packages/viewer/src/gesture.ts` (+ test) — matematika gestur murni: hit path, pickTarget, marquee, resize/scale, committedBox, reorder, op.
- `packages/viewer/src/liveGeometry.ts` (+ test) — pohon GeoNode dari elemen `[data-lakar-id]` shadow root.
- `packages/viewer/src/canvasEdit.tsx` — hook `useCanvasEdit` (state gestur, pratinjau, held, overlay) dan `SelectionBox`.
- `packages/viewer/src/undoHistory.ts` (+ test) — transisi tumpukan undo/redo murni.
- `packages/viewer/src/Canvas.tsx` — wiring hook, override kotak board, Undo/Redo toolbar, Escape batal gestur.
- `packages/viewer/src/Viewer.tsx` — seleksi `string[]`, Shift-klik Layers, `commitOps`, undo/redo, shortcut.
- `packages/viewer/src/app.css`, `packages/viewer/src/icons.tsx` — overlay desain bagian 05; ikon redo2/arrowLeftRight/arrowUpDown.

**Review:** 41 temuan (medium 14, low 15, false 12). Patch: held dikunci ke board ber-op + board terhapus (medium), guard Undo/Redo beruntun (medium), entri undo dipertahankan saat gagal sementara (medium), tes undoHistory + liveGeometry (medium), Delete multi-seleksi tidak mengosongkan seleksi (medium), reorder ditahan sampai mount ulang (low), committedBox untuk pratinjau resize flow/icon (low), pointer asing diteruskan (low), tumpukan dikosongkan saat Restore (low), warna marquee dari token (low), toggleSelection bersama (low). Defer: wiring useCanvasEdit / tes integrasi (medium, 2 baris). Ditolak: lihat Review Triage Log (alasan per baris: pointer capture sudah ada, klon bergaya inline, implicitAbsolute core, Viewer di-key per slug, brief meminta undo minimal, reparent ada di teks story, nilai desain dari .pen, low jarang dengan perbaikan bercabang, perbaikan yang mengedit spec).

**Follow-up review:** `true` — pass pertama mem-patch 5 entri medium (0 high). Risiko yang belum terverifikasi: perubahan mesin state `canvasEdit.tsx` sesudah review (held per board ber-op, reorder lewat commit tertahan, pointer asing → Canvas) hanya diverifikasi typecheck + tes helper murni, tanpa smoke browser ulang.

**Verifikasi:** `pnpm build` sukses; `vitest run packages/viewer tests/dependency-direction.test.ts` 289 lulus; `pnpm test` 52 gagal, semuanya ada di baseline Windows (0 baru; tsc test bersih); snapshot bench CRLF dikembalikan. Smoke Playwright msedge (sebelum patch review) pada daemon lokal: klik/badge/8 handle, geser 1 rev, Ctrl+Z/Ctrl+Shift+Z masing-masing 1 rev dengan posisi benar, Escape saat resize 0 request, resize 1 rev, klik pertama → Row, dobel-klik → kartu, Shift-klik → "2 selected · 320 × 100", reorder hint "Move to position 3 in Row" 1 rev, marquee, klik sesudah zoom.

**Smoke ulang sesudah patch review (2026-11-22):** Playwright msedge pada daemon lokal (data dir sementara), kode terpatch, 17/17 cek lulus tanpa page error:
- Seleksi: klik Abs → badge `80 × 60` + 8 handle; klik pertama → Row; dobel-klik → CardA; Shift-klik → `2 selected · 320 × 100` + 2 outline anggota; Shift-klik ulang → [CardA]; marquee di latar board → [Abs]; klik sesudah zoom 2× → Abs `120 × 80`.
- Geser Abs: 1 rev (650,330); Ctrl+Z → 600,300; Ctrl+Shift+Z → 650,330. Dua klik cepat Undo di toolbar → tepat satu undo (guard); Redo toolbar → 650.
- Resize: badge `120 × 80` saat drag, Escape → 0 rev dan ukuran 80; resize sungguhan → 1 rev 120×80.
- Reorder CardA ke akhir: hint "Move to position 3 in Row"; tepat sesudah lepas DOM masih urutan lama dengan CardA opacity 0.35 (pratinjau tertahan); sesudah mount ulang urutan B,C,A tanpa opacity, klon drag hilang, 1 rev.
- Delete dengan [CardA, CardB] (primer CardB): CardB terhapus, CardA tetap terpilih.

Follow-up review diubah ke `false`: risiko yang disebut di atas (mesin state sesudah patch tanpa smoke ulang) sudah diverifikasi.

**Risiko sisa:** wiring hook tanpa tes otomatis (deferred); hit-test tidak menjangkau overflow di luar parent; cache geometri tidak mengukur ulang perubahan layout pasca-mount; Delete multi-seleksi hanya menghapus primer (story 6).
