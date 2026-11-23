---
title: 'Snapping, smart guide, pengukur jarak, dan zoom di viewer'
type: feature
ticket: '5'
created: '2026-11-23'
status: in-progress
baseline_revision: '9ece3808caa82247ce5e81b7071771405b68379c'
route: full
route_source: auto
risk: medium
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
followup_review_recommended: false
context: ['{project-root}/design/README.md']
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Canvas viewer belum punya ergonomi editor dari desain section 11 (story 8.1, layar `fvbjN`, `GSpGv`, `pSUKZ`): node tidak menempel ke tepi/tengah saudara saat digeser atau di-resize, tidak ada pengukur jarak Alt+hover, dan indikator zoom bukan menu (belum ada Zoom to 100% dan Zoom to selection).

**Approach:** Tambah modul murni `packages/viewer/src/snap.ts` (matematika snap + ukur, tanpa DOM), integrasikan ke gestur move/resize di `canvasEdit.tsx` (guide + label jarak `danger`, badge posisi), overlay ukur Alt+hover, dan menu zoom di `.view-controls` `Canvas.tsx` dengan shortcut baru (Ctrl+=/−, Shift+0, Shift+2).

## Boundaries & Constraints

**Always:**
- Logika snap/ukur murni di `snap.ts` (seperti `gesture.ts`: tanpa DOM/IO, kotak koordinat halaman); dites di `snap.test.ts`.
- Overlay = div absolut di `edit.overlay`, `pointer-events:none`, garis 1px `var(--danger)`, label angka putih di atas `var(--danger)`.
- Op commit tidak berubah bentuk (`update`/`move` via `moveOps`/`resizeOp`); pembulatan tetap lewat `rnd` — snap hanya menyesuaikan `d`/`to` sebelum commit.
- Komentar kode Indonesia; teks UI Inggris. Hanya `packages/viewer`. Tanpa perubahan skema, route, atau EventSource baru.
- Shift+1 tetap Fit; `+`/`=`/`-` tanpa modifier tetap berfungsi seperti sekarang.

**Never:**
- Tidak mengubah protokol ops, daemon, MCP, atau route `/viewer/*`.
- Tidak ada snap untuk gestur reorder, marquee, text-edit, atau path-editing.
- Tidak memakai library baru; tidak bergantung pada `@lakar/core`/`exec`/`icons`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| SNAP_EDGE | Move: tepi union box node ≤ tol (6px layar ÷ `cam.z`) dari tepi kandidat | `d` disesuaikan agar tepi berhimpit; guide `v`/`h` di garis itu | Tanpa kandidat ≤ tol: `d` apa adanya, tanpa guide |
| SNAP_CENTER | Tepi/tengah moving ≤ tol dari tepi/tengah kandidat | Offset terkecil (|Δ| min) menang; titik moving yang dicek: start, mid, end | Seri → pasangan pertama dalam urutan evaluasi |
| SNAP_TARGETS | Kandidat move = saudara se-parent (bukan node yang digeser/turunannya) + kotak parent + kotak board; board → board lain | Hanya kandidat itu yang dipakai | Seleksi lintas parent: gabungan kandidat tiap node |
| SNAP_RESIZE | Resize: hanya tepi yang digerakkan handle (`n`→atas, `s`→bawah, `e`→kanan, `w`→kiri; pojok = dua sumbu) yang menempel | `to` disesuaikan di sumbu terkait | Tepi yang tidak digerakkan tidak ikut snap |
| MEASURE | Alt+hover: seleksi `a`, node hover `b` | Per sumbu: `value = |max(a.start,b.start) − min(a.end,b.end)|`, segmen dari `maxStart` ke `minEnd` di titik tengah proyeksi tegak lurus (irisan; tanpa irisan → titik tengah antar tepi berhadapan) | `value === 0` atau seleksi kosong → tidak ada overlay |
| GAP_LABEL | Move/resize: kandidat yang ikut snap dan disjoint di suatu sumbu | Label jarak hanya untuk sumbu disjoint (bukan overlap), sesuai desain "40" | Kandidat hanya overlap → tanpa label |
| ZOOM_SEL | Shift+2 / item menu dengan seleksi kosong | Item disabled; shortcut no-op | Kamera tidak berubah |

</intent-contract>

## Code Map

- `packages/viewer/src/gesture.ts` — `Box`, `GeoNode`, `Handle`, `unionBox`, `indexGeo`, `rnd` (inline; duplikat bila perlu di snap.ts), `sizeBadge` (tempat `posBadge`). Pure math sama.
- `packages/viewer/src/canvasEdit.tsx` — `useCanvasEdit` (85): gestur `move` (497-502, sesuaikan `d` + simpan hasil snap di state gestur), `resize` (506-511, sesuaikan `to`), commit move (537-541) / resize (553-568), `previewBoxes`/`boxOf` (397-400), overlay (718-786: tambah guide/label/measure), `scr` (719), `hover` (148, 475-481), `index`/`geo` (177-178), `SelectionBox` (887, `label` prop → badge posisi saat move), prop baru `measuring`.
- `packages/viewer/src/Canvas.tsx` — `cam`/`setCam` (534), `zoomAt` (750-757), `fit` (676-680), `center()` (964), keydown `down`/`up`/`blur` (784-844: tambah `altHeld` sebelum bail modifier 801, Ctrl+=/−, Shift+0/2), `.view-controls` (1146-1204: `zoom-level` span 1186 → tombol menu), `edit.scene`/`edit.nodeGeo` + `indexGeo` untuk bounds seleksi, `selection` prop (464).
- `packages/viewer/src/FileMenu.tsx` — `Menu`+`Item` (38-120) untuk menu zoom; tambah prop opsional `up?: boolean` (anchor `bottom` alih-alih `top`) supaya menu terbuka ke atas toolbar.
- `packages/viewer/src/agentEffects.ts` — `followCamera` (190) / pola `focusCamera` (Canvas 107-110) untuk kamera Zoom to selection.
- `packages/viewer/src/app.css` — `.zoom-level` (2530), `.edit-drop-bar` (2389-2421) / `.edit-drop-hint` (2422-2434) sebagai pola guide/label; `--danger` ada di `tokens.css`.
- `packages/viewer/src/Canvas.dom.test.tsx` — pola `baseProps`/`tap`/`viewport`/`mounted`; stub board `pageGeometry` (liveGeometry.ts:38-42) punya kotak nyata dan `absolute:true` → drag board (lewat `[data-board-label]`), hover, dan Alt bisa dites DOM.
- `packages/viewer/src/test/dom.tsx` + `test/fixtures.ts` — harness `renderUi`/`makeDoc`/`BOARDS`.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/viewer/src/snap.ts` — modul murni baru: `snapMove(moving, targets, tol) → {dx, dy, guides}`, `snapResize(to, handle, targets, tol) → {dx, dy, guides}` (dx/dy = penyesuaian; `Guide = {orientation:'v'|'h', at, from, to}` halaman, extent = union moving+kandidat yang cocok), `measure(a, b) → Measure[]` (`{axis:'x'|'y', from, to, at, value}`, per matrix MEASURE), `snapCandidates(moved: GeoNode[], index) → Box[]` per SNAP_TARGETS — fondasi teruji.
- [ ] `packages/viewer/src/snap.test.ts` — tes unit seluruh baris I/O matrix (pola `gesture.test.ts`) — bukti logika.
- [ ] `packages/viewer/src/canvasEdit.tsx` — prop `measuring`; snap di `move`/`resize`; overlay `.snap-guide` + `.snap-label` (gap) + badge posisi `x, y` saat move (`posBadge` di gesture.ts); overlay Alt+hover: `.edit-hover` tetap + `.snap-guide`/`.snap-label` ukur + pill `.measure-hint` "Measuring to {name} · Alt" — integrasi gestur.
- [ ] `packages/viewer/src/Canvas.tsx` + `FileMenu.tsx` — `altHeld` (keydown/up/blur sebelum bail 801; `preventDefault` Alt); `measuring` ke `useCanvasEdit`; `zoom-level` → tombol (`aria-haspopup="menu"`, chevron) membuka `Menu up` berisi Zoom in `Ctrl +`, Zoom out `Ctrl −`, separator, Zoom to 100% `Shift 0`, Zoom to fit `Shift 1`, Zoom to selection `Shift 2` (disabled tanpa seleksi); `zoomTo(1)` di tengah viewport; `zoomToSelection` = fit bounds seleksi (pad FIT_PAD, `clampZoom`, zoom >1 diizinkan); keyboard Ctrl/Cmd+= & − (sebelum bail, tanpa shift/alt), Shift+Digit0, Shift+Digit2 — UI zoom.
- [ ] `packages/viewer/src/app.css` — `.snap-guide` (1px `var(--danger)`), `.snap-label` (pill `var(--danger)`, teks putih, mono), `.measure-hint` (pola `.edit-drop-hint`), `.zoom-level` sebagai tombol (latar `surface-hover`, chevron) — visual desain.
- [ ] `packages/viewer/src/Canvas.snap.dom.test.tsx` — tes DOM: menu zoom terbuka & item menjalankan perintah; Shift+0 → z=1; Shift+2 → kamera ke seleksi; drag board B mendekati tepi A → `.snap-guide` tampil dan `onCommit` menerima `y` bulat hasil snap; Alt+hover board lain → `.snap-label` jarak — bukti permukaan.

**Acceptance Criteria:**
- Given dua board dengan selisih tepi ≤ 6px layar, when board digeser melintasi tepi itu, then tepi menempel (op `update` berisi nilai bulat posisi snap) dan garis `.snap-guide` `danger` tampil selama gestur.
- Given node terpilih, when Alt ditahan sambil hover node lain, then jarak horizontal dan vertikal digambar dengan `.snap-guide` + `.snap-label` dan hint `Measuring to <nama> · Alt`; seleksi tetap `accent`.
- Given canvas, when indikator zoom diklik, then menu berisi lima perintah desain dengan label shortcut; Zoom to selection disabled tanpa seleksi.
- Given seleksi satu board, when Shift+2 atau item menu dipilih, then kamera membingkai bounds seleksi dengan padding; when Shift+0, then `cam.z` = 1 dengan pusat viewport tetap.

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

Desain section 11 (`design/README.md`): guide/label `danger` supaya beda dari seleksi `accent` dan agen `agent`; badge di bawah seleksi menunjukkan posisi bulat yang akan di-commit (`664, 64`) saat move; Alt+hover memakai Hover Outline biasa pada target; indikator zoom menjadi tombol dengan chevron. Keputusan (delegasi): label jarak saat move hanya untuk kandidat yang ikut snap dan disjoint (desain menampilkan hanya "40", bukan ukuran overlap); `measure` pada sumbu overlap mengembalikan jarak antar tepi berhadapan (|maxStart−minEnd|, rumus sama dengan gap) dan entri `value === 0` dibuang; menu zoom membuka ke atas lewat prop `up` baru di `Menu` (opsional, kompatibel mundur).

## Verification

**Commands:**
- `pnpm test` (`set LAKAR_C7_ALLOW_MISSING_SOURCES=1`) — expected: `snap.test.ts` dan `Canvas.snap.dom.test.tsx` hijau; tidak ada kegagalan baru vs baseline Windows.
- `pnpm build` — expected: typecheck + build viewer sukses.

**Manual checks (if no CLI):**
- Geser node/board mendekati tepi saudara: menempel, guide `danger` tampil, badge menunjukkan posisi bulat; Alt+hover menampilkan jarak; menu zoom dan shortcut berfungsi.
