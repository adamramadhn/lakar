---
title: "Tinggi board mengikuti isi: height:'hug' (skema v8)"
type: feature
ticket: ''
created: '2026-11-23'
status: built
baseline_revision: 'e6f8e8783995977db2a8635af804a8344435cff0'
route: full
route_source: pinned
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-board-height-fit.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-progressive-live-build.md'
  - '{project-root}/_bmad-output/implementation-artifacts/research-agent-canvas-references.md'
  - '{project-root}/tests/fixtures/docs/README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pengguna: tinggi board landing masih tidak cocok dengan isinya; ada ruang sisa atau kurang di bawah antar-komponen ("cek bagaimana open-pencil menanganinya"). Tinggi board selalu angka tetap. Skill menyuruh agen menebak atau menaikkan tinggi (PR #26: "tinggi board = `Halaman` di `bounds` terakhir + perkiraan seksi (lebihkan)"), board selalu memotong isi, dan LC-12 hanya memperingatkan sesudahnya (spec-board-height-fit). Jawaban open-pencil (research-agent-canvas-references §1): halaman panjang memakai Hug, tinggi tidak pernah ditebak.

**Approach:** `height:'hug'` pada board (skema v8, migrasi identitas): tinggi board = tinggi isi flow, diukur saat render (`height:auto`), tidak tersimpan di dokumen. Semua pembaca tinggi board memakai ukuran itu: `bounds` execute, screenshot/export, `list_boards`, `place`, `measuredHeight` di view board, LC-12 (tabrakan), viewer (bingkai, seleksi, handle, kamera, ekspor), codegen (`height: auto`). Skill landing membuat board `height:'hug'` dan tidak pernah mengisi atau menaikkan tingginya.

## Boundaries & Constraints

**Always:**
- AD-4: board bertinggi angka berperilaku persis seperti sebelumnya (render, check, export, `list_boards`, `place`). Input lama tetap valid; respons hanya bertambah field (`heightMode`, `measuredHeight`). Hint `get/find` hanya-baca diperbaiki, tesnya diperbarui.
- Model dokumen: perubahan skema menaikkan `schemaVersion` 7 → 8 dengan migrasi (identitas: board v7 tetap angka) dan fixture korpus `v8/` (README korpus). Semua tulis lewat op core (`update(board,{height:'hug'|n})`).
- Viewer tidak bergantung pada core/exec/icons; tinggi terukur dibaca dari DOM live atau PNG.
- Anggaran skill: `LOAD_LIMIT` 9600 dan batas per file tidak dinaikkan; kata baru dibayar pemangkasan.
- Teks spec/komentar Indonesia; teks UI dan PR Inggris.

**Never:**
- Menyimpan tinggi terukur ke dokumen (bukan op, bukan write-back seperti open-pencil `applyFrameSize`).
- Mengubah lebar board (`width` tetap angka) atau mengizinkan `height:'fill'` pada board.
- Menaikkan batas skill atau mengubah perilaku board fixed demi hug.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dokumen lama | v1–v7, board `height` angka | Migrasi ke v8, tinggi tetap angka, tampilan sama | — |
| Board hug | `add(null,{type:'board',…,height:'hug'})` | Render `height:auto`; `bounds[board]` = `[0,0,w,tinggi isi]` | — |
| Seksi baru | execute berikutnya menambah seksi | Board tumbuh; tanpa `update(height)` | — |
| Anak absolute | `Overlay /` di bawah isi | Tidak menambah tinggi (dipotong clip) | — |
| Anak `height:'fill'` | wadah `Halaman` fill di board hug | Diperlakukan hug (render + codegen), tidak runtuh ke 0 | — |
| Board hug kosong | tanpa anak flow | Tinggi 0 | Screenshot board gagal seperti node 0 px (ditunda) |
| LC-12 | board hug landing/mobile | Sub-cek "tinggi pas" dilewati; lebar, tinggi minimum, `expectedSize` dinilai dengan tinggi terukur | — |
| Tabrakan | board hug vs board lain | Tinggi terukur (`heights`); belum terukur = 0 | `expected` menyebut `place(w,'hug')` |
| `place` | `place(1440,'hug')` / `near` board hug | Board baru: hanya tepi atas dijaga; board hug ada: tinggi terukur render terakhir | `place(w,'fill')` → SCHEMA_INVALID |
| `get(board)` | board hug terukur | `height:'hug'` + `measuredHeight` (render terakhir sebelum snippet); belum terukur → tanpa field | `update(id,{measuredHeight})` → SCHEMA_INVALID |
| `list_boards` | board hug | `height` = terukur (angka) + `heightMode:'hug'` | Render gagal → `height` 0 |
| Screenshot/export | board hug | Viewport disamakan dengan tinggi terukur; PNG utuh; `width/height` respons = PNG | — |
| Viewer | board hug | Host live `height:auto`, tinggi dilaporkan (ResizeObserver) → bingkai, seleksi, handle, kamera, marker, Export popover | Belum terukur → 900 sementara |
| Seret handle | handle bawah / kanan | Bawah → `height` angka (jadi fixed); kanan saja → hanya `width` (tetap hug) | — |
| Panel Design | board terpilih | H: segmented Fixed/Hug; Fixed = tinggi terukur dibulatkan | — |
| Codegen | board hug | `height: auto` (Tailwind `h-[auto]`) | — |

</frozen-after-approval>

## Code Map

- `packages/schema/src/nodes.ts` -- `SCHEMA_VERSION = 8`, `BoardHeight`, `isHugBoard`; `boardShape.height`.
- `packages/core/src/migrate.ts` -- `MIGRATIONS[7]` identitas.
- `packages/render/src/css.ts` -- `boardDecls` (`height:auto`), `hugBoardChild` (fill → hug untuk anak langsung board hug).
- `packages/render/src/layout.ts` -- mount board hug (fill fills tanpa tinggi, anak lewat `hugBoardChild`).
- `packages/render/src/index.ts` -- `HUG_VIEWPORT_HEIGHT`, `boardViewport`.
- `packages/daemon/src/chromium.ts` -- viewport awal `boardViewport`, lalu = tinggi terukur untuk board hug.
- `packages/daemon/src/hug-heights.ts` -- `HugHeights` (catatan tinggi per dokumen+rev; `ensure` mengukur yang belum tercatat).
- `packages/daemon/src/server.ts` -- execute (`boardHeights` ke exec + check, catat ukuran), `/screenshot` dims, `/boards` (`height` terukur + `heightMode`), `/inspect`, `/layout-check`.
- `packages/daemon/src/export.ts` -- respons screenshot versi lama memakai ukuran PNG untuk board hug.
- `packages/daemon/src/check.ts` -- `runCheck(…, heights)`.
- `packages/check/src/rules.ts`, `index.ts` -- `boardHeightOf`, LC-12 (lewati tinggi pas untuk hug, tabrakan dengan tinggi terukur), `checkBoard({heights})`.
- `packages/exec/src/api.ts`, `index.ts` -- `ApiContext.boardHeights`, `place(w, h|'hug')`, `measuredHeight` di view, `VIEW_KEYS`.
- `packages/codegen/src/tree.ts` -- akar board memakai `hugBoardChild`.
- `packages/viewer/src/boardHeight.ts` -- `measuredBoards`, `withHeight`, `HUG_PENDING_HEIGHT`.
- `packages/viewer/src/Viewer.tsx`, `Canvas.tsx`, `liveGeometry.ts` -- state tinggi hug, laporan dari BoardLive (ResizeObserver) dan BoardImage (PNG), kotak board dari DOM.
- `packages/viewer/src/DesignPanel.tsx`, `designModel.ts` -- segmented Fixed/Hug untuk tinggi board.
- `packages/mcp/src/server.ts` -- `SERVER_INSTRUCTIONS`, deskripsi execute/list_boards/LC-12.
- `packages/skills/skills/landing.md`, `core.md`, `api.md` -- panduan agen; api.md dibangkitkan ulang.
- Tes: `packages/core/src/migrate.test.ts`, `tests/doc-corpus.test.ts` + `tests/fixtures/docs/v8/landing-hug.lakar.json`, `tests/fixtures/codegen/v8-landing-hug.*`, `packages/check/src/index.test.ts`, `packages/codegen/src/codegen.test.ts`, `packages/exec/src/index.test.ts`, `packages/daemon/src/hug-heights.test.ts`, `packages/daemon/src/index.test.ts`, `packages/render/test/layout.test.ts`, `packages/viewer/src/boardHeight.test.ts`, `designModel.test.ts`, `Canvas.dom.test.tsx`, `tests/skills.test.ts`, `packages/mcp/src/index.test.ts`, `bench/src/round/*`.

## Tasks & Acceptance

**Execution:**
- [x] Skema v8 + migrasi identitas + fixture korpus v8 + golden codegen v8.
- [x] Render: `height:auto`, anak fill = hug, viewport = tinggi terukur sebelum screenshot.
- [x] Daemon: `HugHeights`; execute/`list_boards`/screenshot/export/inspect/layout_check memakai tinggi terukur.
- [x] Exec: `place(w,'hug')`, `measuredHeight`, tabrakan dengan tinggi terukur.
- [x] Check: LC-12 melewati tinggi pas board hug; tabrakan dengan `heights`.
- [x] Viewer: tinggi terukur di semua geometri board; handle bawah → fixed; Design panel Hug/Fixed.
- [x] Codegen: `height: auto`.
- [x] Panduan: `landing.md`, `core.md`, `SERVER_INSTRUCTIONS`, deskripsi tool, api.md; langkah "naikkan ke perkiraan" PR #26 dihapus.
- [x] `deferred-work.md`: `resolved:` pada butir hug, butir baru di bawah.

**Acceptance Criteria:**
- Given landing `height:'hug'` dengan navbar + hero, when execute kedua menambah seksi, then `bounds[board]` = tinggi isi baru tanpa `update(height)` dan tanpa LC-12 tinggi pas.
- Given dokumen v7, when dibuka, then menjadi v8 dengan tinggi board angka yang sama.
- Given board hug di viewer, when isinya berubah, then bingkai/seleksi mengikuti tinggi terukur; seret handle bawah menulis `height` angka.
- Given contoh `landing.md`, when `skills-examples.test.ts` dijalankan, then 0 error/0 warning; muat landing ≤ 9600.

## Implementation Notes

- **Riset open-pencil** (`open-pencil/open-pencil` @ `6e70fe7945da637c1304b97d42a95f3812278f19`, dibaca sebagai data):
  - *Model:* hug adalah field frame bergaya Figma, `primaryAxisSizing`/`counterAxisSizing: 'FIXED'|'HUG'` (`packages/scene-graph/src/types.ts:520`, default FIXED `node-defaults.ts:131`). FILL disimpan di anak (`layoutGrow`, `layoutAlignSelf:'STRETCH'`). Frame akar tidak dibedakan: `layoutSizing()` melapor HUG untuk frame tanpa parent bila ber-auto-layout (`layout/sizing.ts:71-80`); menyalakan auto-layout menjadikan kedua sumbu HUG (`editor/layout-mode.ts:104-114`).
  - *Hitung:* mesin Taffy (WASM) lewat `computeBoxes` (`packages/core/src/layout.ts:74`); sumbu HUG tidak diberi `style.width/height` (`layout.ts:181-189`), jadi ukurannya dari isi. Hasilnya **ditulis balik** ke `width/height` node (`layout/apply.ts:170-204`); frame hug kosong ditahan pada ukurannya (`layout/axis-sizing.ts:47-69`). Hug tanpa auto-layout ditolak (`scene-graph/src/layout/sizing.ts:107`).
  - *Agen:* referensi authoring (skill `open-pencil/references/design-authoring.md:10`): "`w`/`h` accept pixels, `"hug"` (content-sized), or `"fill"` … Use Hug for notes, cards, and long pages instead of guessing heights. Fixed viewport sizes and artwork geometry are intentional exceptions." Ditambah peringatan siklus Hug/Fill (`:13`) dan lint "HUG but all children use grow — collapses to zero" (`tools/describe/layout-issues.ts:191-214`).
  - *Resize manual:* `draggedSizing()` (`packages/vue/src/shared/input/resize/sizing.ts:29-50`): sumbu yang diseret berhenti hug/fill dan menjadi FIXED; sumbu lain tetap. `resize()` API dan mengetik angka di field Hug juga hanya mengubah sumbu itu.
- **Keputusan: tinggi terukur tidak ditulis ke dokumen.** open-pencil menulis balik karena dokumennya adalah scene graph hasil layout. Lakar menjaga dokumen = niat penulis (semua tulis lewat op core, AD spine); menulis tinggi tiap render akan menambah revisi dan riwayat palsu. Ukuran tinggal di catatan daemon (`HugHeights`, per dokumen+rev, terbawa untuk board tak tersentuh) dan di state viewer.
- **Keputusan: `get(board).height` tetap `'hug'` + `measuredHeight`, bukan angka.** Brief meminta `get(board).height` mengembalikan nilai terukur. View adalah "properti tersimpan" (doc `get`); mengganti `height` dengan angka membuat salinan board (`add(null,{...get(b)})`) diam-diam menjadi fixed, dan board yang dibuat di snippet yang sama belum punya ukuran sehingga `height` campur string/angka. Angka terukur ada di field turunan hanya-baca `measuredHeight` (ditolak bila dikirim balik); `list_boards.height` dan `bounds` memang angka terukur.
- **Keputusan: hug boleh untuk semua `screen`.** Pembatasan ke landing tidak menyederhanakan apa pun (render/check generik) dan open-pencil tidak membatasi akar. Panduan hanya untuk landing: mobile memakai zona bawah absolut di `H-98` (ditunda), app = viewport tetap 1440×900.
- **Keputusan: anak flow `height:'fill'` di board hug = hug.** Kolom flex bertinggi auto memberi item `flex:1 1 0px` tinggi 0 (terbukti di tes render), jadi wadah `Halaman` fill akan runtuh. open-pencil memperingatkan siklus Hug/Fill; Lakar memilih semantik yang aman, di render dan codegen lewat satu fungsi (`hugBoardChild`) supaya paritas terjaga.
- **Keputusan: `place(w,'hug')` hanya menjaga tepi atas.** Tinggi board baru belum ada. Tanpa `near` board baru diletakkan di baris atas (kanan), jadi pertumbuhan ke bawah tidak menabrak; kasus `near` + bawah ditunda.
- **Execute mengukur board hug yang belum tercatat sebelum snippet** (`HugHeights.ensure`), hanya saat cache rev ini kosong (mis. sesudah edit viewer atau restart). Render gagal tidak menggagalkan execute: board itu dianggap belum terukur.
- **Viewer:** host live board hug tidak diberi `height`; `ResizeObserver` melapor `offsetHeight` ke `Viewer` (`withHeight`, peta sama bila tidak berubah). Jalur PNG (pratinjau versi) memakai tinggi PNG. Kotak akar geometri diukur dari DOM. `resizeOp` sudah hanya mengirim kunci yang berubah, jadi perilaku Figma/open-pencil (sumbu yang diseret jadi fixed) didapat tanpa kode baru.
- **Anggaran skill (CRLF Windows):** muat landing 9592 → 9513, `landing.md` 3083 → 3004 (prosa 1005 → 953), `core.md` tetap 2512; mobile 9277 dan webapp 9399 tidak berubah.

## Plan Change Log

- Brief: `get(board).height` = nilai terukur → `measuredHeight` (alasan di Implementation Notes).
- Ditambah sesudah tes render: `hugBoardChild` (anak fill runtuh ke 0 di board hug).

## Review Triage Log

**Pass 1 (quick, tinjau diri atas diff + smoke daemon lokal):** low 4 diperbaiki, defer 3.

| # | Temuan | Verdict | Rute | Bukti |
|---|---|---|---|---|
| 1 | Wadah `height:'fill'` di board hug runtuh ke 0 (tes render: 0 ≈ 30) | low | patch | `hugBoardChild` di render + codegen; tes render dan codegen |
| 2 | Keyword Tailwind `height:auto → h-auto` mengubah golden korpus lama (frame bertinggi auto) | low | patch | Dibatalkan; ekspor memakai `h-[auto]` yang sudah ada |
| 3 | Snapshot bench round dan `SCHEMA_VERSION` bench masih 7 | low | patch | Diperbarui ke 8 seperti bump v7 |
| 4 | Respons screenshot versi lama (`/viewer/docs/:slug/revs/:rev/screenshot`) memakai `board.height` | low | patch | Ukuran PNG untuk board hug |
| 5 | `place` + `near` di bawah board hug bisa tertabrak saat board hug tumbuh | low | defer | deferred-work |
| 6 | Board hug kosong bertinggi 0 (screenshot board gagal) | low | defer | deferred-work |
| 7 | Mobile hug belum dipandu (zona bawah absolut) | low | defer | deferred-work |

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- sukses.
- `npx -y pnpm@12.21.0 test` -- himpunan kegagalan sama dengan baseline `e6f8e87` di mesin Windows yang sama (izin key foto, SIGTERM/SIGKILL, CRLF judul skill, golden render/Chromium, sumber C7, hash prompt bench), dikurangi `api.md` yang kini lulus. CI Linux acuan.
- Smoke daemon lokal (`LAKAR_BROWSER_CHANNEL=msedge`): landing hug 2 seksi → `bounds` 592 lalu 1024, `measuredHeight` 592 di execute kedua, LC-12 kosong, `list_boards` `{height:1024, heightMode:'hug'}`, screenshot dan export 1440×1024 tanpa ruang sisa; viewer `/app/` bingkai board = 1024 (host live `offsetHeight` 1024).
