---
title: 'Viewer responsif: tablet, mobile, dan sentuh'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: '729baa0386ac93f11968f8cb0970150fef973e2b'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Viewer hanya punya tata letak desktop tiga kolom; di bawah 900px panel Layers hilang dan panel kanan ditumpuk kaku, kanvas tidak bisa di-pinch/pan dengan dua jari. Desain `design/lakar-ui.pen` bagian 03 sudah menggambar "Viewer — Tablet — …" (1024×768) dan "Viewer — Mobile — …" (375×812), gelap dan terang, termasuk History/Waiting/Offline/Error.

**Approach:** Breakpoint CSS + perubahan komponen minimal: tablet (≤1100px) = kanvas + panel kanan 300px, Layers jadi laci di atas kanvas lewat tombol "Layers"; mobile (<768px) = top bar viewer, kanvas penuh, bottom sheet berisi tab Activity/Inspect/Checks/History (`BottomSheet.tsx`). Kanvas mendukung pinch-zoom, pan dua jari (dan satu jari), tap untuk memilih/menyisip. Dashboard hanya diperbaiki di tempat yang tidak cocok dengan layar tablet/mobile bagian 01–02.

## Boundaries & Constraints

**Always:** Desktop (>1100px) identik piksel dengan sekarang (aturan baru di dalam media query, elemen baru `display:none` di desktop). Logika Viewer.tsx tidak diubah selain state tata letak (laci Layers, state sheet) dan pembungkus — sesi lain menambah panel Pages di panel kiri, jadi laci membungkus `aside.layers-panel` utuh. Teks UI bahasa Inggris, komentar/spec bahasa Indonesia. Tool sisip batch 4 tetap jalan dengan tap. Tema gelap & terang memakai token yang ada.

**Never:** Route daemon / tool MCP baru atau berubah. Library gesture baru. Duplikasi isi panel (satu `ActivityPanel`/`HistoryPanel` dirender sekali; bottom sheet = `aside.side-panel` yang sama dengan gaya mobile). Mengubah TitleBar atau perilaku tab.

**Keputusan (dibuat sesi ini, desain tidak menggambar):**
- Mobile: tombol "Layers" yang sama dengan tablet (kiri atas kanvas) dan ketuk nama file di top bar membuka laci Layers/Pages.
- Mobile: toolbar kanvas tetap (Select, Hand, tool sisip, Fit), zoom −/+/persen disembunyikan (pinch), toolbar duduk di atas sheet.
- Mobile: TitleBar aplikasi disembunyikan di Viewer hanya di browser (tanpa kontrol jendela); di aplikasi desktop tetap tampil.
- Sheet tiga state: collapsed (grabber + tab, 54px), half (min(356px, 50%)), full (tinggi viewer − 8px). Tab History hanya tampil di strip sheet saat aktif; tombol History di top bar membukanya (half).
- Satu jari di kanvas (sentuh, tool Select/Hand) = pan; tap tanpa gerak (≤8px) = pilih/sisip.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pinch | dua jari menjauh/mendekat | zoom di titik tengah kedua jari, pan ikut gerak titik tengah | jari kedua dilepas → lanjut pan satu jari tanpa lompat |
| Tap pilih | satu jari tap board | board/node terpilih seperti klik | gerak >8px → bukan tap |
| Tap sisip | tool Rectangle aktif, tap board | `onInsert` dengan koordinat board, tool kembali Select | tap di luar board → diabaikan |
| Drag sheet | tarik grabber ke atas/bawah | tinggi mengikuti jari, lepas → snap ke state terdekat | pointercancel → kembali ke state semula |
| Pratinjau versi mobile | History → entri | banner membungkus di lebar 375 tanpa overflow | — |

</frozen-after-approval>

## Code Map

- `packages/viewer/src/Viewer.tsx` -- render utama (baris ~511–602): `.viewer` grid berisi `aside.layers-panel`, `<Canvas>`, `aside.side-panel` (tab `TABS`). Tambah top bar mobile, tombol Layers + scrim, bungkus panel kanan dengan `BottomSheet`. Jangan ubah handler/efek.
- `packages/viewer/src/Canvas.tsx` -- pointer handler (`onPointerDown/Move/Up/Cancel`, ~406–452) satu pointer; `drag` ref; `zoomAt`; `.view-controls`. Tambah peta pointer aktif untuk pinch/pan dua jari; ambang tap sentuh 8px.
- `packages/viewer/src/BottomSheet.tsx` (baru) -- `aside.side-panel` + grabber; state terkontrol `collapsed|half|full`, drag pointer di grabber/strip tab.
- `packages/viewer/src/app.css` -- `.viewer` (~920), responsif lama (~1847: aturan 1100px & 900px diganti), `.view-controls` (~1203), `.checks-pill` (~1259), `.export` (~1312), `.version-banner`, `.titlebar` (~47, tinggi 44).
- `packages/viewer/src/icons.tsx` -- tambah `chevronLeft`; `layers`, `history` sudah ada.
- `packages/viewer/src/Dashboard.tsx` -- hanya perbaikan responsif yang terlihat beda dari layar `Tablet — …`/`Mobile — …` (bagian 01–02).
- Desain: `kx1PL` Tablet, `Amkzd` Mobile, `XaX5b` Mobile History, plus Waiting/Offline/Error (`TWH8M`, `oQK70`, `zlmga`, `YJbf8`, `X2zG2d`, `kw3MH`); versi terang di baris `JecA1`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/viewer/src/BottomSheet.tsx` -- komponen sheet terkontrol + drag snap + ringkasan check mini -- panel tab mobile.
- [x] `packages/viewer/src/Viewer.tsx` -- state `layersOpen`, `sheet`; top bar mobile (back `#/`, nama file + halaman, History); tombol Layers + scrim; `BottomSheet` membungkus panel kanan; tab History dari top bar -- tata letak.
- [x] `packages/viewer/src/Canvas.tsx` -- pinch/pan multi-pointer, pan satu jari sentuh, ambang tap 8px -- sentuh.
- [x] `packages/viewer/src/app.css` -- media query tablet (≤1100px) & mobile (<768px), laci, sheet, toolbar/pill/banner mobile, sembunyikan TitleBar mobile di browser -- tata letak.
- [x] `packages/viewer/src/icons.tsx` -- `chevronLeft`.
- [x] `packages/viewer/src/Dashboard.tsx`/`app.css` -- perbaikan responsif Dashboard yang ditemukan saat cek langsung.
- [x] `packages/viewer/src/sheet.test.ts` -- uji fungsi murni snap sheet (`snapSheet`) dan geometri pinch (`pinchCamera`).

**Acceptance Criteria:**
- Given lebar 1440, when Viewer dibuka, then tampilannya sama dengan sebelum perubahan.
- Given 1024×768, when Viewer dibuka, then kanvas + panel kanan 300px, tombol "Layers" kiri atas membuka/menutup laci Layers/Pages, Export kanan atas.
- Given 375×812, when Viewer dibuka, then top bar viewer, kanvas, sheet half dengan tab dan hitungan check; tap tab saat collapsed → half; tombol History → tab History.
- Given state Waiting/Offline/Error/History di 1024 dan 375, gelap & terang, then tidak ada overflow horizontal dan sesuai layar desain.

## Implementation Notes

- Fungsi murni `sheetHeights`/`snapSheet`/`pinchCamera` di `sheet.ts` (diuji `sheet.test.ts`). `BottomSheet` merender strip tab + `aside.side-panel` yang sama; tinggi tampil ditulis ke `--sheet-h` di `.viewer` (toolbar kanvas, toast, dan pesan Waiting duduk di atasnya).
- Tombol "Layers" dan scrim adalah saudara `<Canvas>` di grid (`grid-area: canvas`), jadi Canvas tidak berubah untuknya. TitleBar disembunyikan di mobile lewat CSS `:has()` (tanpa `.mac` / `.window-controls` = browser), TitleBar.tsx tidak disentuh.
- Top bar viewer hanya di mobile (spec); desain tablet juga menggambar top bar, tidak diterapkan.
- Dashboard (dicek ulang sesudah review): tablet 768 sudah cocok (grid 2 kolom, tombol New file berteks). Mobile <768px disamakan dengan desain "Mobile — List/Grid": tombol New file jadi ikon "+" 34×34 (label `.btn-label` disembunyikan, `aria-label` tetap), list tanpa header, baris 74px dengan thumbnail 104×58, judul + subjudul "Edited …" (`.list-sub`, tersembunyi di desktop).
- Cek langsung (browser pane, lakard lokal): 1440 kolom 260/860/320 dan elemen baru `display:none`; 1024×768 laci Layers + Escape; 375×812 top bar, sheet half/full (top 64px, di bawah top bar), tap grabber, tab History, pinch 3×, tap pilih, banner pratinjau terbungkus, Waiting; gelap & terang; tanpa overflow horizontal.
- `packages/viewer/package.json`: skrip `test` (vitest dari root, filter `packages/viewer/`) supaya perintah verifikasi spec jalan. `pnpm -r typecheck` tidak ada skripnya di repo; diganti `tsc -b` + `tsc -p packages/viewer/tsconfig.json` + `tsc -p tsconfig.test.json`.

## Spec Change Log

## Review Triage Log

Putaran 1 (blind-hunter, edge-case-hunter, verification-gap):

| # | Temuan | Verdict | Bukti / rute |
|---|--------|---------|--------------|
| 1 | Escape menutup laci sekaligus menghapus seleksi (listener Canvas jalan juga) | medium | Kedua listener di `window` fase bubble tanpa stopPropagation → patch: listener laci fase capture + stopPropagation, hanya ≤1100px |
| 2 | `layersOpen` bertahan setelah resize ke desktop, Escape tetap dicegat | low | Nyata bila #1 diperbaiki tanpa gerbang media → patch: tutup saat query berhenti cocok |
| 3 | Sheet `full` menutup top bar mobile (Back/History tak terjangkau) | medium | `calc(100% - 8px)` diukur dari `.viewer` yang memuat top bar 56px → patch: ukur di bawah top bar (CSS & JS) |
| 4 | Drag satu jari tak menyimpan pointerId; 3 jari → dua jari menggerakkan satu pan | low | `onPointerMove` memakai pointer mana pun → patch: simpan id, abaikan pointer lain |
| 5 | pointercancel satu jari pinch membuat jari lain mati | low | `onPointerCancel` membersihkan pinch tanpa handoff → patch: pakai handoff `releaseTouch` |
| 6 | Entri `touches` basi bila capture hilang tanpa up/cancel | maybe-false | Browser mengirim pointercancel/up pada pointer yang di-capture; perlu perangkat nyata untuk membuktikan sebaliknya → ditolak (akan `low`) |
| 7 | Handoff pinch memakai `camRef` yang bisa basi satu frame | low | `camRef` hanya diperbarui saat render → patch: set `camRef.current` sebelum `setCam` |
| 8 | `pinchCamera` jarak akhir 0 → z=0 dengan clamp identitas | low | Canvas selalu memberi `clampZoom`, tapi perbaikan langsung → patch |
| 9 | Drag mouse di sheet basi bila dilepas di luar sebelum slop | low | Tanpa capture sebelum slop, pointerup bisa terlewat → patch: reset bila `buttons === 0` |
| 10 | `suppressClick` macet menelan Enter/Space berikutnya | low | Flag hanya direset saat pointerdown → patch: abaikan klik `detail === 0` |
| 11 | Grabber tidak bisa di-tap; sheet hanya bisa diubah dengan drag | low | `onPointerUp` keluar bila `!moved` → patch: tap grabber collapsed↔half |
| 12 | Logika tap/pan sentuh dan aturan `openTab` tidak teruji | medium | Hanya helper murni yang diuji → patch: `pointerIntent`, `sheetForTab`, `grabberTap` di `sheet.ts` + tes |
| 13 | Tinggi sheet terdefinisi ganda (CSS vs `sheet.ts`) | low | Bisa melenceng saat desain diubah → patch: komentar rujukan silang |
| 14 | Tombol Layers mengambang tetap tampil di mobile | false | Keputusan di blok beku: mobile memakai tombol Layers yang sama dengan tablet |
| 15 | Laci tanpa focus trap / tidak menutup saat pilih layer | low | Nyata tapi perbaikan menambah kompleksitas, jarang mengganggu → ditolak |
| 16 | ARIA tab (tabpanel, `.sheet-checks` di dalam tablist) | low | `tablist` tanpa tabpanel sudah ada sebelumnya; tombol counts kosmetik → ditolak |
| 17 | Gaya ekstensi import tidak seragam | false | Pola sama dipakai tes lain di paket (`./x.ts` di tes, `.js` di sumber) |
| 18 | Task Dashboard dicentang tanpa perubahan | low | Benar → patch: centang dilepas, cek Dashboard dilakukan langsung |
| 19 | 768–900px kini selalu dengan kolom kanan 300px | false | Desain tablet (1024) menggambar panel kanan 300px; lebar 768–900 tidak digambar khusus |
| 20 | Drag sheet & klik suppression hanya dicek manual (tanpa DOM test env) | low | Repo tidak punya jsdom; bagian murninya sudah diekstrak (#12) → sisa diverifikasi manual di browser |

## Verification

**Commands:**
- `pnpm -r typecheck` -- expected: lulus
- `pnpm --filter @lakar/viewer test` -- expected: lulus termasuk `sheet.test.ts`
- `pnpm --filter @lakar/viewer build` -- expected: lulus

**Manual checks (if no CLI):**
- Browser pane 1440, 1024×768, 375×812 (emulasi mobile/tablet), gelap & terang, bandingkan dengan layar desain.
