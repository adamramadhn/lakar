---
title: 'Copy as PNG'
type: feature
ticket: '7'
created: '2026-11-23'
status: built
baseline_revision: '9ece3808caa82247ce5e81b7071771405b68379c'
route: full
route_source: auto
risk: low
review: quick
review_source: pinned
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context: ['{project-root}/design/README.md']
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Tiket 8.7 epic `epic-adopsi-open-pencil`: item "Copy as PNG" di context menu layer (desain Section 11, layar `gj8lD`/`BD9N7`) belum ada. Node terpilih harus bisa disalin sebagai PNG 2x ke clipboard, di aplikasi desktop maupun browser.

**Approach:** Route `POST /viewer/docs/:slug/export` mendapat field opsional `nodeId` (kompatibel: `{boardId, scale}` lama tidak berubah). Viewer menambah aksi `copy-png` (item tepat di bawah Duplicate, shortcut Ctrl+Shift+C) yang mengekspor PNG 2x node terpilih lewat `api.exportPng` lalu menulisnya ke `navigator.clipboard` sebagai `ClipboardItem` `image/png`; hasilnya memakai Toast yang ada ("Copied as PNG" / "Couldn't copy as PNG" + Try again).

## Boundaries & Constraints

**Always:**
- Kompatibilitas route (AGENTS.md, AD-4): input lama `{boardId, scale}` tetap valid dan berperilaku sama; respons tetap lampiran `image/png`; kode error dan status lama tidak berubah. `nodeId` hanya field opsional baru.
- Item baru tepat di bawah "Duplicate" dengan shortcut Ctrl+Shift+C (desain). Teks UI bahasa Inggris; komentar kode bahasa Indonesia.
- `nodeId` harus node di dalam `boardId`; node yang tidak ditemukan atau berada di board lain → 404 `NOT_FOUND` dengan hint, seperti `boardId` salah.
- Item menu hanya aktif untuk satu node tersimpan (bukan alamat komposit `a/b` isi instance): `locateNode` di daemon hanya me-resolve id tersimpan.
- `pnpm test` tanpa kegagalan baru (baseline Windows: 49–55 kegagalan yang diketahui; `LAKAR_C7_ALLOW_MISSING_SOURCES=1`).

**Never:**
- Tidak mengubah bentuk respons, pesan error, atau perilaku input lama route ekspor; tidak ada route atau tool MCP baru.
- Tidak ada PNG multi-layer/union untuk seleksi jamak, tidak ada render di sisi viewer, dan node komposit tidak disalin lewat cara lain.
- Tidak ada perubahan skema dokumen, op `core`, atau konfigurasi desktop (termasuk plugin clipboard Tauri): clipboard memakai API web `navigator.clipboard.write` + `ClipboardItem`, sama seperti `writeText` yang sudah jalan di desktop.
- Tidak ada dependensi baru.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Satu node terpilih, klik item | `editMenu.ids = [nodeId]` | POST `/viewer/docs/:slug/export` `{boardId, scale: 2, nodeId}` → `clipboard.write` blob PNG → toast "Copied as PNG" | — |
| Node = board | `editMenu.ids = [boardId]` | Body tanpa `nodeId` (perilaku lama), PNG board 2x | — |
| Shortcut Ctrl+Shift+C | satu node terpilih | Sama dengan klik item | — |
| Seleksi > 1 atau kosong | menu dibuka / shortcut | Item nonaktif; shortcut diam | — |
| Node komposit (`a/b`) | seleksi isi instance | Item nonaktif | — |
| Ekspor atau clipboard gagal | 404/500/offline/`write` ditolak | Toast error "Couldn't copy as PNG: \<detail\>" + Try again (mengulang langkah yang sama) | detail dari `errorText` |
| `nodeId` di board lain | `{boardId: A, nodeId: milik B}` | 404 `NOT_FOUND` | seperti `boardId` salah |
| Pratinjau versi / offline | `editable` false | Item nonaktif seperti aksi edit lain | — |

</intent-contract>

## Code Map

- `packages/daemon/src/export.ts` — `ExportBody` (`.strict()`) + `nodeId` opsional; handler me-resolve node lewat `locateNode` (impor dari `./inspect.js`), pola route `/export` di `server.ts:719-747` (`render.screenshot(doc, board.id, { scale, nodeId })`); nama file unduhan dari node bila `nodeId` dipakai (`exportFileName`).
- `packages/daemon/src/inspect.ts:18` — `locateNode`: hanya id tersimpan; alamat komposit tidak ditemukan.
- `packages/daemon/src/files.test.ts` — describe `POST /viewer/docs/:slug/export` (~baris 282): render tiruan `sizedRender` mencatat `opts`; tambah kasus `nodeId`.
- `packages/viewer/src/api.ts:565` — `exportPng(slug, boardId, scale)` + argumen opsional `nodeId` → body `{boardId, scale, nodeId?}`.
- `packages/viewer/src/editActions.ts` — `EditAction`/`EDIT_ACTIONS` + `'copy-png'`; `actionState` mengaktifkannya untuk tepat satu anggota `topMost` non-komposit; `planAction` case → `undefined` (bukan op); `shortcutAction`: mod+Shift+`c` (di cabang `mod && !altKey`, sebelum `if (e.shiftKey) return undefined`).
- `packages/viewer/src/EditMenu.tsx` — `ACTION_META['copy-png']` `{ label: 'Copy as PNG', icon: 'image', shortcut: mod('C', true) }`; entri `MAIN` persis sesudah `{ action: 'duplicate', separator: true }`.
- `packages/viewer/src/Viewer.tsx` — `copyPng(ids)` baru (board = leluhur akar `topMost` lewat `indexGeo`; `api.exportPng(slug, board.id, 2, nodeId?)`; `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])`; toast sukses/gagal+Try again lewat `setToastState`, komponen `Toast` AddLayer.tsx:116); `runAction` mencegat `'copy-png'` sebelum `planAction`; impor `topMost` dari `./editActions`.
- `packages/viewer/src/test/dom.tsx` — `FakeDaemon.fetch`: handler yang mengembalikan `Response` diteruskan apa adanya (byte PNG asli, bukan pembungkus JSON).
- `packages/viewer/src/Viewer.copyPng.dom.test.tsx` — baru; tes DOM di bawah.
- `packages/viewer/src/api.test.ts:399` — kasus `nodeId` ikut di body.
- Desain: `design/README.md` Section 11 butir "Copy as PNG" (~baris 134) dan tabel layar (baris 114).

## Tasks & Acceptance

**Execution:**
- [x] `packages/daemon/src/export.ts` — field `nodeId` opsional + resolusi `locateNode` + render `nodeId` + nama file node -- satu-satunya perubahan daemon.
- [x] `packages/daemon/src/files.test.ts` — kasus `nodeId` di describe export (render dipanggil dengan `nodeId`, node di board lain/tidak ada → 404) -- bukti kompatibilitas + jalur baru.
- [x] `packages/viewer/src/api.ts` + `packages/viewer/src/api.test.ts` — argumen `nodeId?` diteruskan ke body -- kontrak klien.
- [x] `packages/viewer/src/editActions.ts` — `copy-png` di union, `EDIT_ACTIONS`, `actionState`, `planAction`, `shortcutAction` -- satu aksi baru.
- [x] `packages/viewer/src/EditMenu.tsx` — meta + entri menu di bawah Duplicate -- posisi sesuai desain.
- [x] `packages/viewer/src/Viewer.tsx` — `copyPng` + pencegat `runAction` + toast -- wiring aksi ke ekspor + clipboard.
- [x] `packages/viewer/src/test/dom.tsx` — teruskan `Response` dari handler -- supaya route PNG bisa dipalsukan.
- [x] `packages/viewer/src/Viewer.copyPng.dom.test.tsx` — tes DOM seluruh skenario matriks -- verifikasi tiket.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — satu entri: PNG multi-layer (union seleksi jamak) ditunda -- keterbatasan yang disengaja.

**Acceptance Criteria:**
- Given satu layer terpilih, when pengguna membuka context menu (klik kanan baris Layers atau canvas), then item "Copy as PNG" tampil aktif tepat di bawah "Duplicate" dan menampilkan shortcut Ctrl+Shift+C.
- Given item itu dipilih, when ekspor sukses, then daemon menerima `{boardId, scale: 2, nodeId}` dan `navigator.clipboard.write` dipanggil dengan `ClipboardItem` bertipe `image/png`, lalu toast "Copied as PNG" tampil.
- Given ekspor atau penulisan clipboard gagal, when item dipilih, then toast error "Couldn't copy as PNG" tampil dengan aksi "Try again" yang mengulang langkah yang sama.
- Given seleksi jamak atau node komposit, when menu dibuka, then "Copy as PNG" nonaktif.
- Given permintaan lama `{boardId, scale}` tanpa `nodeId`, when route dipanggil, then perilaku identik dengan sebelumnya (PNG board, nama file dari board).
- Given `nodeId` yang bukan milik `boardId`, when route dipanggil, then 404 `NOT_FOUND`.

## Implementation Notes

Implementasi sesuai Code Map tanpa penyimpangan:
- Daemon: `ExportBody` `.strict()` + `nodeId` opsional; `locateNode` dijalankan pada dokumen **tersimpan** (`stored`) sementara `findBoard` pada dokumen terselesaikan (`doc`) — alamat komposit `a/b` tidak pernah resolve → 404 `NOT_FOUND`; `nodeId === boardId` merender board utuh seperti tanpa `nodeId` (dites).
- Viewer: aksi `copy-png` dicegat `runAction` sebelum `planAction` (guard `editableRef`/`editing` tetap berjalan lebih dulu); `copyPng` berjalan ke leluhur akar `topMost` untuk menemukan board, memanggil `api.exportPng(slug, board.id, 2, nodeId?)`, lalu `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])`; toast memakai `setToastState` + komponen `Toast` yang ada.
- `test/dom.tsx`: handler daemon palsu boleh mengembalikan `Response` apa adanya agar byte PNG tidak dibungkus JSON.

## Plan Change Log

## Review Triage Log

### 2026-11-23 — Review pass
- verdicts: 7 findings — high 0, medium 0, low 1, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` copyPng menjalankan ekspor + clipboard.write di luar semafor `editing.current` — ekspor dan tulis clipboard read-only dan idempoten (PNG node yang sama); semafor hanya menyeriapkan op tulis dokumen, dan invoke ganda menulis PNG yang valid ke clipboard. Guard tambahan menambah state untuk hasil yang tidak bisa dibedakan pengguna.
  - `[false]` `[reject]` Try again memanggil `run` langsung, melewati guard `editableRef`/`editing.current` — route ekspor read-only dan tetap sah saat pratinjau/offline (retry gagal menampilkan toast error yang sama); guard ada untuk menyeriapkan tulis dokumen, bukan baca.
  - `[false]` `[reject]` tes DOM dituduh bisa balapan dengan commit `sceneRef` — `edit.scene` adalah `() => geo` yang dihitung ulang setiap render (canvasEdit.tsx:800; `geometry()` :159-177 dengan cache berkunci `mounts`); `fireEvent`/`findByRole` mem-flush React lewat act, jadi geometri segar saat menu dirender. 8/8 lulus di dua run independen.
  - `[false]` `[reject]` `nodeId === boardId` diterima sebagai render board penuh + komposit `a/b` 404 tanpa dibedakan — ini kontrak yang disengaja: files.test.ts menegaskan `nodeId: boardId` → render `{scale}` + nama file board; keputusan komposit→404 tercatat di Design Notes.
  - `[false]` `[reject]` frontmatter `deferred: []` vs entri deferred-work.md — field `deferred` adalah register triage review (diisi step-04 untuk temuan ber-route defer), bukan register batas desain; dan perbaikannya akan mengedit plan run ini.
  - `[false]` `[reject]` `calls.at(-1)` order-coupled / cakupan nodeId hanya di `opts` — `.at(-1)` membaca request yang baru dibuat tes itu sendiri (inject di-await berurutan); `toEqual({opts:{scale:2,nodeId}})` gagal bila daemon mengabaikan nodeId; pola sama dengan tes lain di file.
  - `[false]` `[reject]` tes pratinjau tidak menekan Ctrl+Shift+C — listener keydown tidak terpasang saat `!editable` (Viewer.tsx:1191), jadi shortcut tidak mungkin ter-dispatch; AC item nonaktif di pratinjau sudah dites.

## Design Notes

Keputusan (delegasi Fatmuh "terima jadi", 2026-11-23):
- `nodeId` berada di dalam `boardId` (bukan mandiri): menjaga kontrak lama "boardId = target render" dan membuat pemakaian yang salah eksplisit (404), bukan diam-diam diabaikan.
- Satu node saja: `render.screenshot` menerima satu `nodeId`; union seleksi jamak butuh kemampuan render baru (dicatat di `deferred-work.md`).
- Node komposit dinonaktifkan: `locateNode` tidak me-resolve alamat `a/b` dan tidak ada jalan render lain.
- Shortcut mengikuti desain walau Ctrl+Shift+C bentrok dengan inspect devtools browser; item menu tetap bekerja.
- Toast gagal membawa detail `errorText(e)` setelah judul desain, mengikuti pola "Couldn't …: \<detail\>" pada toast undo.
- Di webview/browser tanpa `ClipboardItem`, konstruktor melempar → toast gagal yang sama (fitur menurun anggun, tidak diam).

## Verification

**Commands:**
- `pnpm build` -- typecheck + build viewer hijau.
- `pnpm test` dengan `LAKAR_C7_ALLOW_MISSING_SOURCES=1` -- tanpa kegagalan baru vs `origin/main` (baseline Windows 49–55 kegagalan yang diketahui).
- `pnpm vitest run packages/viewer/src/Viewer.copyPng.dom.test.tsx packages/viewer/src/api.test.ts packages/daemon/src/files.test.ts` -- tes baru dan tes yang disentuh hijau.

**Manual checks (if no CLI):**
- `LAKAR_BROWSER_CHANNEL=msedge pnpm lakard`, buka `http://127.0.0.1:7466/app/`, pilih node, context menu → Copy as PNG → paste di aplikasi lain: gambar 2x muncul.

## Auto Run Result

- Ringkasan: item `Copy as PNG` (Ctrl+Shift+C, tepat di bawah Duplicate) menyalin satu node terpilih sebagai PNG 2x ke clipboard lewat field opsional `nodeId` pada `POST /viewer/docs/:slug/export` — berlaku di browser dan desktop (webview memakai `navigator.clipboard` + `ClipboardItem`). Body lama `{boardId, scale}` tidak berubah perilaku.
- File yang diubah:
  - `packages/daemon/src/export.ts` — `nodeId` opsional di `ExportBody` (.strict); resolve lewat `locateNode` pada dokumen tersimpan; 404 NOT_FOUND untuk node lintas-board/tidak ada; nama file dari node.
  - `packages/daemon/src/files.test.ts` — kasus `nodeId`: render menerima `{scale, nodeId}`, nama file node, `nodeId === boardId` ekuivalen, 404 untuk board lain/tidak ada.
  - `packages/viewer/src/api.ts` — `exportPng` param opsional `nodeId` diteruskan ke body.
  - `packages/viewer/src/api.test.ts` — body dengan dan tanpa `nodeId`.
  - `packages/viewer/src/editActions.ts` — `copy-png` di union/EDIT_ACTIONS/actionState/planAction/shortcutAction.
  - `packages/viewer/src/editActions.test.ts` — aturan enable + pemetaan Ctrl/⌘+Shift+C.
  - `packages/viewer/src/EditMenu.tsx` — meta + entri MAIN tepat di bawah Duplicate.
  - `packages/viewer/src/Viewer.tsx` — `copyPng` (board leluhur, ekspor 2x, `navigator.clipboard.write` `ClipboardItem` image/png) + pencegat di `runAction` + toast `Copied as PNG` / `Couldn't copy as PNG: <detail>` + Try again.
  - `packages/viewer/src/test/dom.tsx` — handler boleh mengembalikan `Response` mentah (byte PNG).
  - `packages/viewer/src/Viewer.copyPng.dom.test.tsx` — baru; 8 tes DOM seluruh skenario matriks.
  - `_bmad-output/implementation-artifacts/deferred-work.md` — satu entri: PNG multi-layer/union seleksi jamak ditunda.
  - `_bmad-output/initiative-lakar-paper/tickets/epic-adopsi-open-pencil/tickets/story-copy-as-png-plan.md` — plan run ini.
- Temuan review (lensa quick, 7 temuan): 0 patch, 0 defer, 0 intent_gap/bad_plan. 6 `false` (dibantah: retry read-only valid di pratinjau; geometri segar saat render; `nodeId===boardId` kontrak yang dites; field `deferred` adalah register triage; `calls.at(-1)` mencakup asersi nodeId; listener keydown tidak terpasang saat `!editable`) dan 1 `low` ditolak (balapan invoke ganda menghasilkan tulisan PNG idempoten; perbaikan menambah state guard untuk hasil yang tak terlihat pengguna). Rincian di `## Review Triage Log`.
- Rekomendasi follow-up review: `false` (0 entri patch).
- Verifikasi: `pnpm build` hijau (tsc -b + build viewer; warning Vite font/chunk yang sudah ada); `pnpm vitest run` pada 4 file tersentuh 102/102 lulus; `pnpm test` penuh dengan `LAKAR_C7_ALLOW_MISSING_SOURCES=1` — 2858 lulus, 62 gagal, 23 skip; seluruh kegagalan pada kategori baseline Windows yang diketahui (key foto Unsplash/Pexels/Wikimedia, SIGTERM/SIGKILL, hash/CRLF bench, env render Chromium, URL ESM `d:`, timeout beban) dan tidak ada di file yang disentuh — tanpa kegagalan baru. Snapshot CRLF yang ditulis ulang vitest sudah dikembalikan.
- Risiko sisa: verifikasi tempel manual di browser/aplikasi lain (paste nyata) belum dilakukan — tingkat tes DOM mengonfirmasi `navigator.clipboard.write` + `ClipboardItem` `image/png`; Ctrl+Shift+C bentrok dengan devtools browser (keputusan desain, item menu tetap bekerja).
