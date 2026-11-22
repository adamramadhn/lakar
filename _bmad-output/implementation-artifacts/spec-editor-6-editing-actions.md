---
title: 'Teks inline, group, duplikat, hapus, z-order, align, shortcut, undo/redo (epic editor-canvas story 6)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: '70de7b70be55c4c7d0a4aad9d3b60b51d6bba3a3'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Wiring edit teks inline (startTextEdit/finishText: Enter/blur commit satu op, Escape tanpa request, remount membatalkan) dan dispatch menu konteks EditMenu belum punya tes otomatis; hanya smoke Playwright msedge.
    evidence: |-
      Pre-verified (verification gap): vitest viewer tanpa environment DOM/contentEditable; bagian deterministik (textEditPlan, normalizeEditedText, shortcutAction, nudgeNodes, pageGeometry) dites murni. Usul: e2e Playwright /app/ bersama deferred story 3-5.
    location: >-
      packages/viewer/src/canvasEdit.tsx startTextEdit/finishText; packages/viewer/src/EditMenu.tsx
    severity: medium
  - summary: >-
      Sisip layer (tool kanvas, menu + Layers) masih lewat execute + codegen sehingga tidak masuk tumpukan undo per jendela.
    evidence: |-
      Sudah ada sebelum story 6 (aplikasi 4, Viewer.tsx runEdit/insert); Ctrl+Z sesudah sisip membatalkan edit ops sebelumnya. Usul: pindahkan sisip ke route ops (add + ref) agar invers tercatat (AD-8).
    location: >-
      packages/viewer/src/Viewer.tsx runEdit / insert
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Canvas editor (story 3–5) bisa memilih, menggeser, resize, dan mengedit properti, tetapi belum ada edit teks langsung, group/ungroup, duplikat, hapus banyak node, urutan z, align/distribute, nudge, atau menu konteks. Hapus masih lewat `execute` + codegen dengan undo berbasis restore rev yang ikut membuang perubahan agen (dilarang AD-8).

**Approach:** Modul murni `editActions.ts` menerjemahkan aksi + seleksi + pohon geometri (`GeoNode`, gesture.ts) menjadi satu daftar `DocOp` (plan) per aksi. Viewer menjalankan plan lewat `api.applyOps` (satu permintaan = satu rev, AD-7), mencatat invers ke tumpukan undo per jendela (AD-8), dan memperbarui seleksi dari `refs`. Aksi tersedia lewat shortcut keyboard, menu konteks canvas dan Layers (desain QvMyG + S2WUHS), dan baris "Align & distribute" panel Design multi-seleksi (desain J8r8Gq). Edit teks inline memakai elemen teks live di shadow root sebagai `contenteditable` (desain UHOWY: kotak edit 1.5px accent, highlight `#3B82F655`, caret accent).

## Boundaries & Constraints

**Always:**
- Satu aksi = paling banyak satu `POST /viewer/docs/:slug/ops`; plan tanpa op tidak mengirim apa pun. Hapus banyak node = satu permintaan.
- Semua tulis lewat route ops dengan op yang sudah ada (`add`, `move`, `update`, `duplicate`, `remove`); tidak ada op core baru, tidak ada `execute`/codegen untuk aksi ini.
- Undo/redo = kirim `inverse` respons sebagai commit baru (sudah ada di `undoHistory.ts`); invers basi (4xx) → entri dibuang + toast, tanpa undo sebagian. Undo hapus memakai tumpukan yang sama (restore rev tidak dipakai lagi untuk undo).
- Shortcut tidak berlaku saat mengetik (input/textarea/select/contentEditable, termasuk elemen di shadow root lewat `composedPath()[0]`), saat dialog/menu terbuka, saat pratinjau versi, atau offline.
- Koordinat yang di-commit dibulatkan ke integer. Teks UI Inggris; komentar Indonesia.
- Menu dan panel memakai token CSS viewer dan kelas menu yang ada (`.menu`, `.menu-item`, `.menu-shortcut`, `.menu-separator`).

**Never:**
- Tidak mengubah core, schema, daemon, route/respons, atau tool MCP.
- Tidak menambah Bring to front/Send to back, align ke board tanpa seleksi, snapping, auto-layout wrap saat group, atau edit rich text.
- Tidak membuka `EventSource` baru; viewer tidak mengimpor core/exec/icons.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Edit teks | dobel-klik teks terpilih (atau Enter dengan satu teks terpilih) → ketik → Enter / klik di luar | teks jadi `contenteditable`, isi terseleksi, kotak edit accent; commit = 1 op `update {content}` 1 rev | Escape → isi asli dipulihkan, tanpa request; isi sama / kosong → tanpa request |
| Baris baru | Shift+Enter saat edit | `\n` disisipkan; commit menyimpan `\n` | — |
| Group absolut | 2 node absolut di frame `none`/board (`position:absolute`) | `add` frame `Group` (`layout:'none'`, W×H = bounding box, `position:'absolute'`, x/y di parent) + `move` tiap anggota ke frame + `update {position:'absolute', x, y}` relatif frame + `move` frame ke posisi z anggota teratas; seleksi = frame baru; 1 rev | anggota board → toast "Boards can't be grouped"; parent beda → "Select layers in the same parent to group" |
| Group flow | 2 anak flow di Row | frame `Group` jadi anak flow di indeks anggota pertama, ukuran tetap bounding box, anggota absolut di dalamnya | — |
| Ungroup | frame terpilih berisi anak | anak dipindah ke parent frame di indeks frame (urutan tetap), lalu `remove` frame; anak absolut / frame absolut / parent `none` → `update {position:'absolute', x, y}` relatif parent baru; anak flow dari frame flow di parent flow tetap flow; seleksi = anak | bukan frame → item nonaktif, shortcut diam |
| Duplikat | Ctrl+D pada node absolut / board / anak flow | `duplicate` (+`ref`): absolut x+10,y+10; board x+width+40; flow tanpa patch (tepat sesudah aslinya); seleksi = salinan | — |
| Hapus | Delete/Backspace dengan 3 node terpilih (termasuk anak dari node terpilih lain) | satu permintaan `remove` node teratas saja; toast "Deleted …" + Undo (= undo tumpukan bila entri itu masih teratas) | — |
| Z-order | Ctrl+] / Ctrl+[ | `move` satu langkah di antara saudara (anggota terpilih bersebelahan bergeser bersama; board di halaman: `parentId:null`) | sudah paling atas/bawah → tanpa request |
| Align | ≥2 node: left/center/right/top/middle/bottom; 1 node absolut: terhadap parent | `update {x}`/`{y}` node absolut (dan board) ke tepi/tengah bounding box seleksi; node flow tidak bergerak | tanpa node absolut → nonaktif |
| Distribute | ≥3 node absolut, horizontal/vertical | node terurut menurut posisi, ujung tetap, jarak antar node sama | <3 → nonaktif |
| Nudge | panah (Shift = 10px) pada node absolut/board | `update {x,y}`; tekan beruntun saat commit berjalan dijumlahkan dan dikirim sesudah dokumen mencapai rev commit sebelumnya | node flow → diabaikan |
| Pilih semua | Ctrl+A | kosong → semua board halaman; board terpilih → anak board; node → semua saudaranya | — |
| Escape | tanpa gestur/edit teks | seleksi kosong (sudah ada) | — |
| Undo antar agen | aksi pengguna, lalu agen `execute` mengubah node lain, lalu Ctrl+Z | hanya aksi pengguna dibatalkan; perubahan agen tetap | — |
| Menu konteks | klik kanan node di canvas / baris Layers | node belum terpilih → dipilih; menu desain QvMyG (Group, Ungroup, Duplicate, Delete, Bring forward, Send backward, Align ›, Distribute ›), item tak berlaku nonaktif | pratinjau/offline → semua item nonaktif |

</intent-contract>

## Code Map

- `packages/viewer/src/gesture.ts` -- `GeoNode`, `indexGeo`, `unionBox`, `moveOps`; dasar geometri aksi.
- `packages/viewer/src/canvasEdit.tsx` -- `useCanvasEdit`: cache geometri per board, hit-test, overlay seleksi; tempat edit teks inline, `scene()`, dan pemilihan target menu konteks.
- `packages/viewer/src/Canvas.tsx` -- keyboard kanvas (Escape, tool), pointer; tempat `onContextMenu`, Enter → edit teks, ekspos `scene` ke Viewer.
- `packages/viewer/src/Viewer.tsx` -- `commitOps`, `stepHistory`, Delete lama (`runEdit` + `removeNode` + `offerUndo` restore), LayerTree; tempat dispatcher aksi, shortcut, menu konteks, nudge.
- `packages/viewer/src/DesignPanel.tsx` -- panel Design; tempat grup "Align & distribute" multi-seleksi.
- `packages/viewer/src/FileMenu.tsx` -- komponen `Menu` (pola keyboard/posisi) untuk ditiru menu edit bersubmenu.
- `packages/viewer/src/undoHistory.ts` -- tumpukan undo; dipakai apa adanya.
- `packages/viewer/src/icons.tsx`, `packages/viewer/src/app.css` -- ikon lucide baru dan gaya kotak edit teks/submenu/tombol align.
- `packages/core/src/transaction.ts` -- semantik `add` (selalu di akhir), `move` (index = posisi akhir), `duplicate` (sesudah aslinya, patch digabung), `implicitAbsolute`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/viewer/src/editActions.ts` -- baru, murni: tipe `EditAction` (`group|ungroup|duplicate|delete|forward|backward|align-left|align-center|align-right|align-top|align-middle|align-bottom|distribute-h|distribute-v`), `EditPlan {ops, label, select?}`, `topMost`, `planAction(kind, scene, ids)` (plan, pesan error, atau undefined), `actionState(scene, ids)`, `nudgeOps`, `selectAllIds`, `textEditOps` -- logika aksi bisa dites tanpa DOM.
- [x] `packages/viewer/src/editActions.test.ts` -- baru: tiap baris matriks (group absolut/flow + indeks z, ungroup ke parent none/flow, duplikat per jenis, hapus node teratas, z-order bersebelahan + board, align/distribute + node flow diam, nudge, pilih semua, teks sama/kosong, label ≤200).
- [x] `tests/editor-actions.test.ts` -- baru: plan dari `editActions.ts` dijalankan lewat `applyOps` core sungguhan (impor relatif `packages/core/src`), lalu `inverse` → dokumen kembali persis; plus perubahan "agen" di antaranya tetap ada sesudah undo -- validasi op terhadap core tanpa daemon.
- [x] `packages/viewer/src/canvasEdit.tsx` -- `scene()` (geometri + stub board belum ter-mount), `contextTarget(e)` (pilih seperti klik), `startTextEdit(id)` + kotak edit overlay, batal saat board di-mount ulang, seleksi tidak menampilkan handle saat edit teks.
- [x] `packages/viewer/src/Canvas.tsx` -- prop `sceneRef`, `onContextMenu(x, y)`; Enter dengan satu teks terpilih → edit teks; pointer di dalam elemen contentEditable tidak memulai gestur.
- [x] `packages/viewer/src/EditMenu.tsx` -- baru: menu konteks desain QvMyG dengan submenu Align/Distribute (S2WUHS), keyboard (panah, Enter, Escape, ArrowRight/Left submenu), label shortcut per platform.
- [x] `packages/viewer/src/Viewer.tsx` -- `applyEdit` (applyOps → recordCommit → loadDoc, mengembalikan hasil), `runAction` (plan → satu permintaan → seleksi dari `refs`/ids, toast hapus + Undo), shortcut (Delete/Backspace, Ctrl+G, Ctrl+Shift+G, Ctrl+D, Ctrl+], Ctrl+[, panah/Shift, Ctrl+A, Alt+A/D/W/S/H/V, Alt+Shift+H/V), nudge berantai per rev, menu konteks canvas + Layers; hapus jalur Delete `runEdit`/`removeNode`/`offerUndo`.
- [x] `packages/viewer/src/DesignPanel.tsx` -- prop `align` → grup "Align & distribute" (8 tombol, desain J8r8Gq) saat multi-seleksi.
- [x] `packages/viewer/src/icons.tsx`, `packages/viewer/src/app.css` -- ikon `group`, `ungroup`, `bringForward`, `sendBackward`, 6 align, 2 distribute; gaya `.edit-text-box`, submenu, `.dp-align-row`.

**Acceptance Criteria:**
- Given dokumen rN dengan board live, when pengguna menjalankan setiap aksi (group, ungroup, duplicate, delete, bring forward, send backward, align, distribute, edit teks, nudge) lewat menu konteks dan lewat shortcut, then masing-masing menghasilkan tepat satu rev baru dengan satu entri riwayat `lakar-viewer`.
- Given aksi pengguna di rN lalu agen menulis node lain lewat `execute` (rN+1), when pengguna menekan Ctrl+Z, then rN+2 membatalkan aksi pengguna dan perubahan agen tetap ada; Ctrl+Shift+Z mengulang aksi.
- Given teks sedang diedit inline, when pengguna menekan Delete, Ctrl+A, atau panah, then perilaku teks bawaan berlaku dan tidak ada aksi canvas yang terkirim.
- Given pratinjau versi atau offline, when pengguna membuka menu konteks atau menekan shortcut aksi, then tidak ada permintaan tulis.

## Spec Change Log

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 45 findings — high 0, medium 17, low 24, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) Ungroup frame kosong menghapusnya diam-diam berlabel "Ungroup" — `planUngroup` dan `actionState.ungroup` kini mensyaratkan `children.length > 0`; tes "frame kosong tidak bisa di-ungroup" + smoke (item nonaktif, Ctrl+Shift+G tanpa rev).
  - `[low]` `[reject]` (blind) `planDistribute` memakai tepi jauh node mulai terakhir — nyata hanya bila node bertumpuk/bersarang dengan node lebih awal yang lebih lebar; perbaikan butuh memilih semantik baru (urut tengah/tepi maksimum), bukan koreksi langsung.
  - `[medium]` `[patch]` (blind) Ketersediaan Align di panel Design basi/awal kosong karena `sceneRef` hanya diisi saat Canvas render — `useCanvasEdit` kini mengembalikan `sceneKey` (berubah tiap mount board), Canvas memanggil `onSceneChange` dan Viewer render ulang; smoke: tombol Align aktif untuk multi-seleksi.
  - `[medium]` `[patch]` (blind) Δ nudge tersangkut sesudah commit gagal / terbawa ke seleksi lain — Δ dibuang saat `applyEdit` gagal dan saat seleksi berubah (`useEffect` pada `selection`).
  - `[low]` `[reject]` (blind) Tiap tekan/ulang panah satu rev + entri undo — tekan selama permintaan berjalan sudah digabung (smoke: 4 tekan → 2 rev); penggabungan entri undo lintas commit menambah mekanisme baru.
  - `[low]` `[patch]` (blind) Undo di toast hapus memberi pesan menyesatkan sesudah Ctrl+Z — pesan kini "it was already undone or newer edits were made".
  - `[low]` `[patch]` (blind) Menu konteks canvas saat pratinjau tidak muncul dan menu bawaan tertahan, tidak sesuai matriks — Canvas membuka menu dengan seleksi saat ini di jalur non-live (item nonaktif karena Viewer tidak editable); preventDefault hanya bila menu bisa dibuka.
  - `[medium]` `[patch]` (blind) Enter pada tombol/menu yang fokus memulai edit teks — cabang Enter Canvas mengabaikan target `button, a, [role="menuitem"]`; smoke "Enter pada tombol fokus: tidak edit teks".
  - `[low]` `[reject]` (blind) Teks yang diketik hilang tanpa umpan balik saat board di-mount ulang — sesuai Design Notes (batal tanpa request); jarang (agen menulis board yang sama selama mengetik) dan toast butuh plumbing callback baru.
  - `[low]` `[reject]` (blind) Bring forward/Send backward pada anak flow mengubah posisi layout — urutan z = urutan DOM, sama dengan perilaku Figma di auto layout; menonaktifkannya menambah cabang.
  - `[low]` `[reject]` (blind) Duplikat board bisa menimpa board lain — jarang dan perbaikan butuh pencarian ruang kosong.
  - `[low]` `[reject]` (blind) Nama di Tasks/Code Map spec berbeda dengan kode — perbaikannya mengedit spec build ini.
  - `[false]` `[reject]` (blind) Artefak BMAD belum lengkap (status in-progress, log kosong) — status dan log memang diisi pada langkah review ini; batasan yang diterima tercatat di Design Notes.
  - `[medium]` `[patch]` (blind) Jalur interaksi baru tanpa tes (peta tombol, nudge, frame kosong, group campuran) — diekstrak `shortcutAction`, `selectionAfter`, `nudgeNodes` (editActions.ts) dan `pageGeometry` (liveGeometry.ts) dengan tes; tes group campuran, frame kosong, pembulatan duplikat; bagian DOM ikut baris defer.
  - `[low]` `[patch]` (blind) `removeNode` codegen jadi kode mati — fungsi dan tesnya di `tests/viewer-codegen.test.ts` dihapus.
  - `[low]` `[reject]` (blind) Lebar submenu konstan 232 — sama dengan `min-width` `.menu` dan label terpanjang muat; pengukuran menambah logika.
  - `[low]` `[reject]` (blind) Label Del di macOS, `navigator.platform`, `aria-controls`, mouseenter tombol nonaktif — kosmetik/a11y minor; pola sama dengan `FileMenu`.
  - `[medium]` `[patch]` (edge) Enter dengan tombol fokus dibajak edit teks — sama dengan baris Enter blind.
  - `[medium]` `[patch]` (edge) Menu dengan semua item nonaktif tanpa fokus sehingga Escape tidak menutup — menu kini `tabIndex={-1}` dan menerima fokus bila tidak ada item aktif; smoke "Escape menutup menu".
  - `[low]` `[patch]` (edge) Undo toast saat tulisan lain berjalan menutup toast tanpa undo — `undoDelete` kini keluar tanpa menutup toast bila `editing.current > 0`.
  - `[medium]` `[patch]` (edge) Δ nudge diterapkan ke seleksi baru — sama dengan baris nudge blind.
  - `[medium]` `[patch]` (edge) Δ nudge basi sesudah commit gagal — sama dengan baris nudge blind.
  - `[low]` `[reject]` (edge) Node di board belum ter-mount tidak bisa di-nudge — board halaman aktif selalu di-mount; jendela sementara saat mount.
  - `[low]` `[patch]` (edge) Alt-tab saat edit teks meng-commit setengah ketikan — blur diabaikan bila `document.hasFocus()` false (fokus kembali ke teks saat jendela aktif).
  - `[low]` `[reject]` (edge) Dobel-klik teks di board belum live menelan gestur — hanya saat mount berjalan; jalur PNG tidak memakai hook ini.
  - `[medium]` `[patch]` (edge) Ungroup frame tanpa anak menghapusnya — sama dengan baris frame kosong blind.
  - `[low]` `[reject]` (edge) Z-order anak flow menukar posisi layout — sama dengan baris z-order blind.
  - `[low]` `[patch]` (edge) Klik kanan non-live mati — sama dengan baris menu pratinjau blind.
  - `[low]` `[patch]` (edge) `removeNode` kode mati — sama dengan baris `removeNode` blind.
  - `[low]` `[patch]` (edge) Menu pratinjau tidak sesuai spec — sama dengan baris menu pratinjau blind.
  - `[low]` `[patch]` (edge) Duplikat absolut tanpa pembulatan untuk x/y pecahan — patch duplikat kini `rnd(...)`; tes "duplikat membulatkan x/y pecahan".
  - `[medium]` `[patch]` (edge) Ungroup frame kosong melawan matriks "berisi anak" — sama dengan baris frame kosong blind.
  - `[medium]` `[patch]` (vgap) Peta shortcut → aksi dan seleksi sesudah plan tanpa tes — `shortcutAction` + `selectionAfter` murni dengan tes, Viewer memakainya.
  - `[medium]` `[patch]` (vgap) Sumber koordinat nudge dan gerbang rev tanpa tes — `nudgeNodes` murni dengan tes (x/y tersimpan, x kosong → 0, absen → geometri); gerbang rev diverifikasi smoke.
  - `[medium]` `[patch]` (vgap) Stub board belum ter-mount di geometri tanpa tes — `pageGeometry` di liveGeometry.ts dengan tes; `useCanvasEdit` memakainya.
  - `[medium]` `[defer]` (vgap) Wiring edit teks inline tanpa tes — butuh harness DOM/contentEditable; dicatat di frontmatter `deferred` dan deferred-work.md.
  - `[low]` `[patch]` (vgap) `removeNode` hanya dipertahankan tes — sama dengan baris `removeNode` blind.
  - `[medium]` `[patch]` (vgap) Ungroup frame kosong menghapusnya — sama dengan baris frame kosong blind.
  - `[low]` `[patch]` (vgap) preventDefault klik kanan sebelum cek live — sama dengan baris menu pratinjau blind.
  - `[false]` `[reject]` (intent D1) Verify hanya di permukaan planner — smoke Playwright msedge terhadap daemon nyata dijalankan (rev per aksi lewat `/viewer/docs/:slug/history`, undo sesudah agen `/execute`), dicatat di Auto Run Result.
  - `[false]` `[reject]` (intent D2) Edit teks tidak ada di menu konteks — menu desain QvMyG (C6) tidak memuatnya dan intent sendiri menyebut dobel-klik.
  - `[low]` `[reject]` (intent D3) Shortcut align Figma tidak ada di desain — keputusan tercatat di Design Notes; ditampilkan di tooltip tombol panel.
  - `[low]` `[patch]` (intent D4) Semantik invers basi tidak dites untuk aksi baru — tes core: agen menghapus anggota group → invers group NOT_FOUND tanpa commit (`tests/editor-actions.test.ts`).
  - `[medium]` `[defer]` (intent D5) Sisip layer belum lewat undo per jendela — sudah ada sebelum story ini (aplikasi 4); dicatat di `deferred` dan deferred-work.md.
  - `[false]` `[reject]` (intent D6) Semantik group (flow vs none) — tafsiran dipilih dan dicatat sesuai delegasi "terima jadi" (Design Notes), tes mengunci pilihan itu.

## Design Notes

- **Group = frame `layout:'none'`, anggota absolut** (keputusan, didelegasikan "terima jadi"). Tidak mempertahankan flow walau semua anggota anak flow satu parent: frame `none` menjaga posisi visual anggota persis dan konsisten dengan Group desain/Figma; membungkus dalam auto-layout adalah fitur lain. Bila ada anggota flow, frame sendiri menjadi anak flow di indeks anggota pertama (saudara flow di antara anggota yang tidak bersebelahan ikut bergeser — dicatat sebagai perilaku yang diterima). Bila semua anggota absolut, frame absolut di posisi z anggota teratas. Asal koordinat parent diambil dari anggota absolut (`box − x/y`), sehingga x/y anak = x/y lama − x/y frame (bulat persis).
- **Urutan op group:** `add(parent, frame, ref:'group')` → per anggota (urutan dokumen) `move(id, '@group')` + `update {position:'absolute', x, y}` → `move('@group', parent, k)`; `k` = jumlah saudara non-anggota sebelum jangkar. Invers core membalik urutan ini persis (frame kosong dihapus terakhir).
- **Ungroup:** frame diproses per parent dari indeks terbesar; anak di-`move` ke `i + k`, lalu `remove` frame. Asal koordinat parent baru: frame absolut → `frame.box − frame.x/y`; frame flow → kotak parent (border parent diabaikan, dicatat).
- **Teks kosong** saat commit dianggap batal (tidak menghapus node) agar edit tidak sengaja tidak menghilangkan layer. Board di-mount ulang saat edit (agen menulis) → edit dibatalkan tanpa request.
- **Pilih semua** (Ctrl+A) memakai scope seleksi primer, bukan seluruh dokumen.
- **Nudge** membaca x/y dari dokumen tersimpan (bukan geometri yang bisa basi sampai mount ulang) dan menahan tekan berikutnya sampai dokumen termuat pada rev commit sebelumnya; delta yang menumpuk dikirim sebagai satu permintaan.
- **Shortcut align** mengikuti Figma (Alt+A/D/W/S/H/V, Alt+Shift+H/V lewat `e.code`); menu tidak menampilkannya (desain S2WUHS menyembunyikan shortcut), tombol panel menampilkannya di tooltip.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses tanpa error tsc.
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: tanpa error.
- `npx -y pnpm@12.21.0 exec vitest run packages/viewer tests/editor-actions.test.ts tests/dependency-direction.test.ts` -- expected: semua lulus.
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru di luar `%TEMP%\lakar-fail-base.txt`.

**Manual checks (if no CLI):**
- Smoke Playwright msedge pada daemon lokal (data dir sementara): menu konteks canvas + Layers, group/ungroup, Ctrl+D, Delete multi + toast Undo, Ctrl+]/[, align/distribute panel, nudge, Ctrl+A, edit teks (Enter commit, Escape batal), masing-masing satu rev (`GET /viewer/docs/:slug/history`); agen menulis lewat `POST /execute` dengan sesi lain di antara aksi dan Ctrl+Z hanya membatalkan aksi pengguna.

## Auto Run Result

**Ringkasan:** Aksi edit canvas lengkap lewat route ops, satu permintaan = satu rev, undo/redo dari op invers per jendela (AD-7, AD-8): edit teks inline (dobel-klik/Enter, Enter/blur commit, Shift+Enter baris baru, Escape batal), group/ungroup (frame `none`), duplikat, hapus banyak node (menggantikan execute + undo restore rev), bring forward/send backward, align/distribute, nudge panah, Ctrl+A, Escape. Tersedia lewat shortcut, menu konteks canvas + Layers (desain QvMyG/S2WUHS), dan baris "Align & distribute" panel Design (J8r8Gq).

**File:**
- `packages/viewer/src/editActions.ts` (+ test) — plan op murni per aksi, `actionState`, `shortcutAction`, `selectionAfter`, `nudgeNodes`, `nudgeOps`, `selectAllIds`, `textEditPlan`.
- `tests/editor-actions.test.ts` — plan dijalankan lewat `applyOps` core; invers round trip, agen di antaranya, invers basi NOT_FOUND.
- `packages/viewer/src/EditMenu.tsx` — menu konteks + submenu Align/Distribute, metadata aksi/shortcut.
- `packages/viewer/src/canvasEdit.tsx` — edit teks inline + kotak edit, `contextSelect`, `scene`/`sceneKey`.
- `packages/viewer/src/liveGeometry.ts` (+ test) — `pageGeometry` (stub board belum ter-mount).
- `packages/viewer/src/Canvas.tsx` — `sceneRef`, `onSceneChange`, `onContextMenu`, Enter → edit teks, guard contentEditable.
- `packages/viewer/src/Viewer.tsx` — `applyEdit`/`runPlan`/`runAction`, shortcut, nudge berantai per rev, menu konteks canvas + Layers, toast hapus + Undo.
- `packages/viewer/src/DesignPanel.tsx`, `icons.tsx`, `app.css` — grup Align & distribute, ikon lucide, gaya kotak edit/submenu.
- `packages/viewer/src/codegen.ts`, `tests/viewer-codegen.test.ts` — `removeNode` (jalur hapus lama) dihapus.
- `_bmad-output/implementation-artifacts/deferred-work.md` — 2 item tunda.

**Review:** 45 temuan (high 0, medium 17, low 24, false 4). Patch: ungroup frame kosong (medium), ketersediaan Align basi (medium), Δ nudge tersangkut/terbawa (medium), Enter dibajak tombol fokus (medium), menu semua-nonaktif tanpa fokus (medium), tes jalur interaksi lewat helper murni `shortcutAction`/`selectionAfter`/`nudgeNodes`/`pageGeometry` (medium), pesan dan guard toast Undo, menu konteks pratinjau, alt-tab saat edit teks, pembulatan duplikat, `removeNode` mati, tes invers basi (low). Defer: wiring edit teks/EditMenu tanpa tes DOM (medium), sisip layer di luar tumpukan undo (medium, pra-ada). Reject: distribute node bertumpuk, banjir rev nudge saat tahan tombol, teks hilang saat remount, z-order anak flow, tumpang tindih duplikat board, drift nama spec (mengedit spec), lebar submenu, a11y/label platform, nudge/dobel-klik saat board belum ter-mount, shortcut align Figma (keputusan tercatat) — alasan per baris di Review Triage Log; false: artefak BMAD, permukaan verifikasi (smoke dijalankan), teks di menu, semantik group (keputusan delegasi).

**Follow-up review:** `false` — patch pass pertama: medium 6 entri, low 7 entri, high 0. Risiko UI yang belum terverifikasi sesudah patch (Enter/fokus, menu nonaktif, ketersediaan Align, frame kosong) dicek ulang dengan smoke msedge pada kode terpatch (18/18 lulus), sehingga tidak ada risiko spesifik tersisa untuk review lanjutan.

**Verifikasi:**
- `pnpm build` sukses; `tsc -p tsconfig.test.json` tanpa error; `vitest run packages/viewer tests/editor-actions.test.ts tests/viewer-codegen.test.ts tests/dependency-direction.test.ts` 358/358 lulus.
- `pnpm test` penuh: 53 gagal / 1538 lulus, semua nama gagal ada di `%TEMP%\lakar-fail-base.txt` (0 baru; selisih hitungan dari tes flaky baseline: foto/SIGKILL/latensi); snapshot bench CRLF dikembalikan.
- Smoke Playwright msedge sebelum review (daemon lokal, data dir sementara): 25/26 cek lulus (satu cek distribute tanpa rev karena fixture sudah berjarak sama) — group via menu konteks, undo/redo, ungroup posisi tetap, Ctrl+D +10, Delete 2 node satu rev + toast Undo, Ctrl+], undo sesudah agen `/execute` (urutan pulih, lebar agen 99 tetap), align top/distribute panel, Alt+S, nudge digabung, Ctrl+A "4 selected", Escape, edit teks Enter/Escape/Shift+Enter, Layers menu Duplicate, submenu Align left, tanpa page error.
- Smoke ulang sesudah patch review: 18/18 lulus — termasuk Ungroup nonaktif untuk frame kosong, Escape menutup menu, Ctrl+Shift+G frame kosong tanpa rev, tombol Align aktif untuk multi-seleksi, distribute satu rev, Enter pada tombol toolbar fokus tidak memulai edit teks, Enter di kanvas memulai edit dan Escape batal tanpa rev, undo sesudah agen.

**Risiko sisa:** wiring DOM edit teks/menu tanpa tes otomatis (deferred); sisip layer belum masuk tumpukan undo (deferred); koordinat ungroup dari frame flow mengabaikan border parent; urutan saudara group dibaca dari geometri terukur.
