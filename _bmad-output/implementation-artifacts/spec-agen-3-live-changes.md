---
title: 'Perubahan agen tampil live tanpa menimpa edit manual (epic agen-di-canvas story 3)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: 'eafea51d375c701acd5ebd277daf1ae13072abf7'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Wiring useCanvasEdit (rebase gestur saat mount ulang, pelepasan/penerapan ulang pratinjau tertahan per rev) tidak dieksekusi tes otomatis; hanya helper murni dan smoke msedge.
    evidence: |-
      Repo belum punya harness tes komponen/DOM untuk viewer (semua tes viewer modul murni). Regresi seperti onMounted tanpa rev atau rebase kembali ke cancel lolos semua tes. Usul: harness komponen atau skrip playwright di scripts/ yang menggeser node selama execute agen.
    location: >-
      packages/viewer/src/canvasEdit.tsx (efek mounts/held, rebase, commit)
    severity: medium
  - summary: >-
      Efek pembersihan seleksi di Viewer.tsx (latestIndex/prevLatest/pruneSelection) tidak dites di tingkat komponen.
    evidence: |-
      Hanya pruneSelection murni yang dites; tanpa harness komponen viewer (pra-ada). Diverifikasi smoke msedge (seleksi node yang dihapus agen hilang dari GET selection).
    location: >-
      packages/viewer/src/Viewer.tsx (efek latestIndex)
    severity: low
  - summary: >-
      Gerbang render (shareBadge, commit row baris 0, changedBy saat pratinjau) tidak punya tes render.
    evidence: |-
      Helper turunannya dites (shareBadgeText, commitRow, agentPresence); komponen viewer tidak punya harness tes (pra-ada).
    location: >-
      packages/viewer/src/Viewer.tsx, ActivityPanel.tsx, Canvas.tsx
    severity: low
  - summary: >-
      Pratinjau tertahan sesudah commit yang tidak mengubah isi board (tanpa mount ulang) bertahan sampai mount berikutnya.
    evidence: |-
      Perilaku pra-ada sejak editor story 4 (dulu menunggu hitungan mount berubah); gaya sementara bernilai sama dengan hasil commit. Usul: lepas juga saat dokumen ber-rev ≥ commit termuat dan tanda tangan board tidak berubah.
    location: >-
      packages/viewer/src/canvasEdit.tsx (heldStatus)
    severity: low
---

<intent-contract>

## Intent

**Problem:** Commit agen sudah memuat ulang canvas, tetapi gestur lokal yang sedang berjalan dibatalkan begitu board-nya di-mount ulang, seleksi bisa menunjuk node yang sudah dihapus agen, undo yang gagal hanya memberi pesan generik, dan state desain bagian 06 (badge seleksi dibagikan, tag "Just changed" di board, baris commit agen di Activity, toast "Undo skipped") belum ada di viewer.

**Approach:** Logika murni baru di `packages/viewer/src/liveChanges.ts` (rebase gestur ke geometri baru, pelepasan pratinjau tertahan per rev, pembersihan seleksi, target undo yang hilang, teks toast, baris commit, konteks seleksi dibaca) dipakai `canvasEdit.tsx`, `Viewer.tsx`, `Canvas.tsx`, dan `ActivityPanel.tsx`; daemon hanya menambah field opsional pada call `get_selection` di stream Activity.

## Boundaries & Constraints

**Always:**
- Gestur geser/resize/reorder yang sedang berjalan saat board-nya di-mount ulang (commit agen) tetap berjalan: node dicari ulang per id di geometri baru, pratinjau diterapkan ulang ke DOM baru, dan op dihitung dari nilai tersimpan terbaru + delta pointer saat dilepas. Satu permintaan route ops per gestur, tanpa `baseRev` (AD-7).
- Node gestur yang dihapus agen keluar dari gestur; semua node gestur hilang → gestur batal diam-diam (tanpa request, tanpa toast). Node reorder yang kini absolute → gestur batal.
- Edit teks inline yang board-nya di-mount ulang (commit agen) tidak dibuang: teks yang sudah diketik di-commit sebagai satu `update {content}` di atas rev terbaru, lalu mode edit selesai.
- Pratinjau sesudah commit ditahan sampai setiap board tersentuh di-mount dari dokumen ber-rev ≥ rev commit itu (atau board hilang); mount ulang dari rev lebih lama (commit agen yang tiba duluan) menerapkan ulang pratinjau. Commit gagal → pratinjau dipulihkan.
- Seleksi dibersihkan hanya dari id yang ada di dokumen terkini sebelumnya dan hilang di dokumen terkini berikutnya (node baru yang dipilih sebelum dokumennya termuat tidak terbuang). Tidak berlaku saat pratinjau versi.
- Undo/redo yang ditolak daemon (4xx) membuang entri (tanpa undo sebagian, AD-8) dan menampilkan toast desain "Undo skipped"/"Redo skipped" (Toast r69qO): ikon undo di kotak agen-soft, judul, deskripsi, aksi "View in History" (buka tab History) dan "Dismiss", tombol tutup; tampil 6 dtk, naik 8px 200ms. Offline/5xx tetap memakai toast lama dan entri dikembalikan.
- Deskripsi toast: `{Agen} deleted “{nama}” after your edit, so this step can’t be undone.`; tanpa agen → `“{nama}” was deleted after your edit, …`; tanpa nama → `This step can’t be undone because a newer change replaced what it targets.` (redo: `redone`). Nama dari id op entri (`id`, `parentId`; id yang dibuat entri itu sendiri dilewati) yang tidak ada di dokumen terkini, atau (dokumen belum termuat ulang) yang disebut utuh di pesan error, dicari di nama yang pernah terlihat jendela ini; agen = harness dengan execute sukses terbaru pada dokumen ini yang selesai sesudah edit itu dicatat (tanpa itu → kalimat tanpa pelaku).
- Sorotan agen (motion card c8ILCm): outline node berubah solid lalu pudar 1.5 dtk ease-out; node baru fade + naik 8px 180ms dengan stagger 40ms lalu pudar; label board tersentuh berganti tag "Just changed · {Agen}" (Change Highlight Tag u43MYm) selama 1.5 dtk; node baru pertama mendapat tag "Added · {nama}" (ikon plus). Reduced motion: tampil 1.5 dtk tanpa fade/rise. Sorotan tidak mengubah seleksi maupun kamera.
- Badge Selection Share (w6sUHr): "Shared" di header Layers dan "Selection shared with agents · {nama primer}" (+ `+N` bila >1) di kiri atas canvas, hanya bila seleksi tidak kosong, bukan pratinjau, daemon online, dan ada sesi agen Live pada dokumen ini.
- Activity: call terbaru sebuah sesi yang berupa execute sukses ber-rev tampil sebagai Agent Commit Row (b53rG): judul call, `execute`, meta `rev N · K nodes changed`, tombol crosshair (Locate) yang memilih node utama/board call itu dan menggeser kamera ke board-nya bila belum terlihat; slide-in 180ms. Execute dengan temuan check (status warning) tetap Tool Call Row biasa. Sesi dengan `get_selection` selesai pada dokumen ini menampilkan baris konteks "{Agen} read your selection {waktu}:" + nama node primer.
- Teks UI Inggris; komentar/spec Indonesia; dark dan light lewat token yang ada.

**Never:**
- Tidak mengubah route, tool MCP, bentuk respons, atau pesan error lama (AD-4); daemon hanya menambah field opsional `slug`/`target`/`nodes` pada call `get_selection` di stream.
- Tidak menolak atau menunda commit berdasarkan rev; tidak ada undo sebagian; tidak memakai restore rev untuk undo.
- Viewer tidak membuka EventSource sendiri dan tidak mengimpor core/exec/icons. Tidak menyentuh `design/lakar-ui.pen`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Agen commit saat geser | drag node A (Δ 40,0); agen mengubah warna B di board sama | pratinjau A tetap; lepas → `update A {x: x_tersimpan_baru+40}`; warna B tetap | — |
| Agen memindah node yang digeser | agen set A.x 100 → 300 saat drag Δ 40 | commit `x: 340` (nilai terbaru + Δ) | — |
| Agen menghapus node gestur | drag A+B, agen hapus A | gestur lanjut dengan B saja | semua hilang → batal tanpa request |
| Resize saat agen commit | resize A, board di-mount ulang | `from` dari kotak baru, `to` = from + Δ pointer | anggota hilang semua → batal |
| Reorder saat agen commit | reorder A, board di-mount ulang | target dihitung ulang di geometri baru | A hilang / jadi absolute → batal |
| Commit tertahan, agen duluan | commit rev 8 dikirim; mount dari rev 7 tiba | pratinjau diterapkan ulang; dilepas saat mount rev ≥ 8 | commit gagal → dipulihkan |
| Agen commit saat edit teks | mengetik "World" di teks T; agen mengubah node lain di board sama | `update T {content:'World'}` ter-commit; perubahan agen tetap | tanpa perubahan teks → tanpa request |
| Seleksi node dihapus agen | seleksi [A,B], agen hapus A | seleksi [B] (dilaporkan ulang ke daemon) | — |
| Node baru belum termuat | seleksi [N] sebelum dokumen ber-N tiba | N tetap terpilih | — |
| Undo target dihapus agen | undo "Move Headline", agen sudah hapus Headline | 409/404 → entri dibuang, toast "Undo skipped" + "Claude Code deleted “Headline” …" | offline/5xx → toast lama, entri kembali |
| Badge seleksi | seleksi [Headline], sesi Claude Code Live | "Shared" di Layers + "Selection shared with agents · Headline" | tanpa sesi Live / kosong / pratinjau / offline → tidak tampil |
| Commit row | call terbaru sesi = execute done rev 42, 3 node | Agent Commit Row "rev 42 · 3 nodes changed"; Locate memilih node utama | execute gagal → baris lama (rolled back) |
| get_selection dibaca | call get_selection selesai, alamat [Headline] | baris konteks "Claude Code read your selection 2s ago: Headline" | node tidak dikenal → tanpa nama |

</intent-contract>

## Code Map

- `packages/viewer/src/canvasEdit.tsx` -- `useCanvasEdit`: gestur, `mounts`, efek mount ulang (dulu membatalkan gestur), `commit`/`Held`, edit teks (`onCommit` boolean).
- `packages/viewer/src/gesture.ts` -- `GeoNode`, `moveOps`, `resizeBox`, `unionBox`, `reorderTarget`.
- `packages/viewer/src/Canvas.tsx` -- `BoardLive` (`onMounted`), label board, `AgentLayer`, slot overlay, prop `onCommit`.
- `packages/viewer/src/Viewer.tsx` -- `applyEdit`/`commitOps`, `stepHistory` (toast undo), seleksi, `views`/`presence`, header Layers, overlay canvas.
- `packages/viewer/src/presence.ts` -- `AgentPresence` (changed, primary, createdBoards), jendela sorotan.
- `packages/viewer/src/ActivityPanel.tsx`, `packages/viewer/src/activity.ts` -- `ToolCallRow`, `SessionCard`, `callTitle`, `harnessLabel`, `shortAgo`.
- `packages/viewer/src/AddLayer.tsx` -- `Toast` lama (dipakai untuk kegagalan lain).
- `packages/viewer/src/icons.tsx`, `packages/viewer/src/app.css` -- ikon (perlu radio, sparkles, gitCommit), gaya agen/toast.
- `packages/daemon/src/events.ts` -- `finish()` ringkasan call per tool (tambah `get_selection`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/viewer/src/liveChanges.ts` -- baru, murni: `rebaseNodes`, `rebaseResize`, `rebaseReorderNode`, `heldStatus`, `pruneSelection`, `missingTargets`, `undoSkippedText`, `lastAgentLabel`, `commitRow`, `selectionRead`, `shareBadgeText` -- satu tempat aturan matriks yang bisa dites.
- [x] `packages/viewer/src/liveChanges.test.ts` -- baru: setiap baris matriks untuk helper di atas.
- [x] `packages/viewer/src/canvasEdit.tsx` -- mount ulang di tengah gestur → rebase (bukan batal); `onMounted` menerima rev; `Held` membawa rev commit + fungsi terapkan ulang; `onCommit` mengembalikan rev atau undefined.
- [x] `packages/viewer/src/Canvas.tsx` -- `BoardLive` mengirim `live.doc.rev`; prop `onCommit` bertipe rev; tag "Just changed · Agen" menggantikan label board tersentuh; tag "Added · nama" pada node baru pertama; prop `shareBadge`.
- [x] `packages/viewer/src/presence.ts`, `packages/viewer/src/presence.test.ts` -- `changedBoards` (board tersentuh execute sorotan) dan `addedTag`; tes.
- [x] `packages/viewer/src/Viewer.tsx` -- commit gestur mengembalikan rev; pembersihan seleksi; nama terlihat; toast Undo skipped; badge Shared di header Layers dan canvas; Locate dari Activity.
- [x] `packages/viewer/src/ActivityPanel.tsx` -- Agent Commit Row + baris konteks seleksi dibaca.
- [x] `packages/viewer/src/UndoSkippedToast.tsx` -- baru: komponen toast desain r69qO.
- [x] `packages/viewer/src/icons.tsx`, `packages/viewer/src/app.css` -- ikon radio, sparkles, gitCommit; gaya badge, tag, commit row, konteks, toast, motion 1.5 dtk + reduced motion.
- [x] `packages/daemon/src/events.ts`, `packages/daemon/src/selection.test.ts` -- `get_selection` selesai: `slug` = `data.slug`, `target` = alamat primer (terakhir), `nodes` = jumlah alamat; tes.

**Acceptance Criteria:**
- Given viewer membuka dokumen dan agen menjalankan execute, when commit tiba, then board terdampak di-mount ulang tanpa reload, outline node berubah dan tag "Just changed · {Agen}" di label board tampil 1.5 dtk, dan baris Agent Commit Row muncul di Activity.
- Given pengguna sedang menggeser node, when agen meng-commit perubahan lain di board yang sama, then pratinjau tetap tampil, dan sesudah dilepas dokumen memuat posisi baru node dan perubahan agen sekaligus.
- Given pengguna menggeser node lalu agen menghapus node itu, when pengguna menekan Ctrl+Z, then toast "Undo skipped" tampil, tidak ada perubahan dokumen, dan entri undo itu hilang dari tumpukan.
- Given seleksi berisi node yang dihapus agen, when dokumen termuat ulang, then node itu keluar dari seleksi dan `get_selection` tidak lagi memuatnya.

## Spec Change Log

### 2026-11-22 — Review pass 1 (intent_gap diputuskan atas delegasi "terima jadi")
- Pemicu: intent DV-5 (edit teks inline dibuang saat agen commit, bertentangan dengan "edit manual tidak hilang"), blind/edge B5/E8 (toast menuduh agen yang commit-nya sebelum edit pengguna), blind B10/B11 (commit row menyembunyikan warning; Locate tidak menggeser kamera).
- Diubah (di dalam `<intent-contract>`, keputusan delegasi): Never "edit teks inline tetap dibatalkan" diganti Always "teks yang diketik di-commit di atas rev terbaru" + baris matriks; pelaku toast = execute yang selesai sesudah edit dicatat, nama juga dari pesan error (kata utuh) dan id buatan entri dilewati; commit row hanya status done; Locate menggeser kamera.
- Keadaan buruk yang dihindari: ketikan pengguna hilang saat agen menulis; toast menyalahkan agen untuk penghapusan oleh jendela lain; peringatan check tersembunyi di Activity.
- KEEP: rebase gestur (nilai terbaru + Δ), heldStatus per rev, pruneSelection, undoSkipped toast desain r69qO, tag board 1.5 dtk, badge hanya dengan agen Live.

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 46 findings — high 0, medium 12, low 26, false 8, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) baris konteks memakai alamat komposit sebagai id — `ActivityPanel.tsx` kini mencoba `nameOf(target)` lalu segmen terakhir alamat.
  - `[false]` `[reject]` (blind) `selectionRead` mengabaikan warning dan slug — `get_selection` tidak pernah berstatus warning (`finish()` hanya memberi warning bila ada `summary`); `sessionsForSlug` sudah menyaring call per `c.slug` yang kini diisi daemon dari `data.slug`.
  - `[medium]` `[patch]` (blind) 4xx selain NOT_FOUND/target hilang memakai toast lama — keputusan dipindah ke `undoSkippedFor` (liveChanges.ts): setiap penolakan non-transient → "Undo skipped"; tes 404/409/transient.
  - `[low]` `[reject]` (blind) nama dari teks error rapuh — field error terstruktur menambah permukaan API untuk kasus fallback (dokumen belum termuat ulang); risiko substring ditangani pencocokan kata utuh (baris edge).
  - `[medium]` `[intent_gap]` (blind) pelaku toast hanya tebakan — Diputuskan: hanya execute agen yang selesai sesudah edit dicatat (`UndoEntry.at`, `lastAgentLabel(views, since)`); tanpa itu kalimat tanpa pelaku. Diterapkan + tes.
  - `[low]` `[patch]` (blind) toast tidak di-key, fokus keyboard, role, tumpuk — `UndoSkippedToast` di-key `toast.key` (animasi/timer/hover ulang); sisanya kosmetik dan ditolak (role alert sesuai desain toast peringatan lain di viewer).
  - `[low]` `[reject]` (blind) held lama tertimpa tanpa restore `extra` — gaya `extra` ada di DOM yang segera diganti mount rev commit pertama; hanya bertahan bila commit pertama gagal sesudah reapply dan gestur kedua sudah di-commit (sangat jarang); perbaikan butuh pelacakan per kunci.
  - `[low]` `[defer]` (blind) held bisa tertahan selamanya — pra-ada sejak editor story 4 (ops tanpa perubahan visual tidak me-mount ulang); dicatat di deferred.
  - `[false]` `[reject]` (blind) pemangkasan tidak memindah `selectedId` — `selectedId = selection[selection.length - 1]` diturunkan dari `selection`, jadi ikut berubah.
  - `[low]` `[patch]` (blind) commit row menyembunyikan warning — `commitRow` hanya untuk status `done`; execute warning tetap Tool Call Row (tes). Klaim offline salah: hanya call running yang terdampak offline.
  - `[low]` `[patch]` (blind) Locate hanya memilih — `locate` di Viewer memilih lalu `setFocus` board (kamera bergeser bila belum terlihat, pindah halaman); nonaktif saat pratinjau.
  - `[false]` `[reject]` (blind) dependensi efek useCanvasEdit — repo tanpa lint exhaustive-deps; closure efek dibuat tiap render dan `index` hanya berubah bersama `mounts`/`boards`; `rebase` hanya jalan bila hitungan mount gestur berbeda, jadi tidak berulang pada perubahan `held`.
  - `[medium]` `[defer]` (blind) tes wiring kurang — bagian keputusan undo ditambal lewat `undoSkippedFor` + tes (baris vgap); wiring hook/komponen menunggu harness (deferred, sama dengan baris vgap 1/3/4). `finish()` get_selection dites lewat integrasi `selection.test.ts`.
  - `[low]` `[reject]` (blind) proses BMAD di spec — perbaikannya mengedit spec build ini (bagian triage/status ditulis pada tahap ini).
  - `[low]` `[patch]` (blind) baris kosong nyasar dan blok CSS rusak — baris kosong di `.history-entry.previewing` dihapus; blok `@media (max-width: 767.98px) … .viewer .history-rail` ditutup (`}}`), aturan mobile Dashboard sesudahnya kini berlaku (smoke msedge 390px: `.section-label` mb 20px, `.folder-grid` gap 10px; History rail 13px).
  - `[false]` `[reject]` (blind) warna harness selain codex — `harnessColor` hanya mengembalikan `'agent' | 'codex'`.
  - `[false]` `[reject]` (blind) label board tersembunyi dari AT — opacity tidak menyembunyikan dari pohon aksesibilitas; label tetap di DOM dengan teks nama; selisih -20/-18 menyelaraskan tepi bawah tag 16px dengan label 14px.
  - `[low]` `[reject]` (edge) commit lama gagal sesudah held diganti — sama dengan baris held tertimpa (blind).
  - `[low]` `[reject]` (edge) held sebelumnya hilang tanpa restore — sama dengan baris held tertimpa (blind).
  - `[low]` `[reject]` (edge) parent reorder berubah jadi grid di tengah drag — butuh agen mengubah layout parent tepat selama drag; perbaikan menambah guard.
  - `[low]` `[reject]` (edge) node yang digeser dipindah ke dalam node lain yang juga digeser — sangat jarang; perbaikan menambah langkah topMost pada rebase.
  - `[low]` `[patch]` (edge) overlay marquee memakai kandidat basi — `marqueeCandidates(g)` dipakai overlay dan saat lepas.
  - `[low]` `[patch]` (edge) id buatan entri dianggap target hilang — `missingTargets` melewati `node.id` (dan anaknya) pada add/insert/replace; tes invers ungroup.
  - `[low]` `[patch]` (edge) substring id di pesan error — pencocokan kata utuh di `undoSkippedFor`; tes.
  - `[medium]` `[intent_gap]` (edge) agen dituduh untuk penghapusan oleh jendela lain — sama dengan baris pelaku (blind); diputuskan dan diterapkan.
  - `[low]` `[patch]` (edge) alamat komposit tanpa nama — sama dengan baris konteks (blind).
  - `[low]` `[patch]` (edge) execute yang hanya menghapus tidak memberi tag board — `changedKey` juga dari board tersentuh (`exec.boards`); tes presence.
  - `[low]` `[patch]` (edge) toast tidak di-key — sama dengan baris toast (blind).
  - `[low]` `[patch]` (edge) `.agent-badge` mati — aturan CSS dihapus (field `primary` tetap: dipakai tes dan urutan sorotan).
  - `[low]` `[patch]` (edge) pemangkasan berjalan saat pratinjau — efek keluar lebih awal saat `previewDoc` (pembanding tidak digeser, node yang dihapus selama pratinjau dibuang sesudahnya).
  - `[medium]` `[patch]` (edge) 4xx lain toast lama — sama dengan baris 4xx (blind).
  - `[low]` `[patch]` (edge) Locate bisa memilih board — `commitRow` mendahulukan node bukan board (created, lalu bounds non-board, lalu board); tes.
  - `[medium]` `[defer]` (vgap) rebase/held di useCanvasEdit tanpa tes — tanpa harness komponen (pra-ada); smoke msedge pasca-patch lulus (drag tersimpan x=250 + perubahan agen); deferred.
  - `[medium]` `[patch]` (vgap) keputusan Undo skipped inline tanpa tes — diekstrak ke `undoSkippedFor` + 3 tes (404 target hilang, 409 nama dari pesan, transient).
  - `[low]` `[defer]` (vgap) efek pemangkasan seleksi tanpa tes — deferred (harness); smoke msedge lulus.
  - `[low]` `[defer]` (vgap) gerbang render tanpa tes — deferred (harness); helper dites.
  - `[low]` `[reject]` (vgap) Read selection kini menampilkan "N nodes" — informatif dan sejalan dengan `list_boards`; bukan cacat.
  - `[medium]` `[patch]` (vgap) 409 dengan target masih ada → toast lama — sama dengan baris 4xx (blind).
  - `[medium]` `[defer]` (intent) DV-1 V1 tanpa tes di permukaan viewer — sama akar dengan baris vgap 1 (tanpa harness); smoke msedge lulus.
  - `[medium]` `[defer]` (intent) DV-2 V2 tanpa tes integrasi — sama dengan baris vgap 1.
  - `[medium]` `[patch]` (intent) DV-3 V3 percabangan undo tanpa tes — sama dengan baris vgap 2 (`undoSkippedFor`); atomisitas route ops sudah dites di tes ops daemon.
  - `[false]` `[reject]` (intent) DV-4 R-A vs R-B — verify meminta drag tersimpan *dan* perubahan agen tetap ada; R-B menimpa perubahan agen pada properti yang sama, jadi hanya R-A (nilai terbaru + Δ) yang memenuhi intent.
  - `[medium]` `[intent_gap]` (intent) DV-5 edit teks inline dibuang saat remount — Diputuskan (AD-7 + epic "edit manual tidak hilang"): teks yang diketik di-commit di atas rev terbaru saat board di-mount ulang; isi dicatat tiap input karena elemen lama sudah terlepas. Scrub panel sudah aman (pratinjau hanya di kolom, React state). Smoke msedge: "World" tersimpan + perubahan agen tetap.
  - `[low]` `[intent_gap]` (intent) DV-6 badge digerbang agen Live dan posisi berbeda dari mock — Diputuskan: gerbang agen Live tetap (desain RIpNN menampilkan state ini bersama sesi Live); posisi kini mengikuti desain (kiri 16, atas 66), smoke memverifikasi.
  - `[false]` `[reject]` (intent) DV-7 desain tidak dibaca — desain bagian 06 dibaca lewat MCP pencil saat Fase A (komponen w6sUHr, u43MYm, b53rG, r69qO, motion c8ILCm); nilai motion 1.5 dtk dan 180ms berasal dari kartu itu.
  - `[false]` `[reject]` (intent) DV-8 permukaan daemon tambahan — baris konteks "read your selection" adalah bagian state desain RIpNN (bagian badge seleksi dibagikan yang diminta intent); field call bersifat aditif (AD-4).

## Design Notes

- **Rebase, bukan batal.** Geometri baru diukur saat render sesudah `mounts` berubah; efek yang sama memulihkan saver lama (elemen lama sudah terlepas), membuat saver baru, dan menerapkan ulang pratinjau. Board yang digeser memakai kotak override dari state, jadi cukup x/y baru dari geometri.
- **Rev mount.** `heldStatus` membandingkan rev dokumen yang di-mount per board dengan rev respons commit; mount ulang lebih awal dari rev itu = `reapply`. Ops tanpa perubahan visual tetap menunggu mount berikutnya (perilaku lama).
- **Badge seleksi (keputusan, "terima jadi").** Seleksi selalu dikirim ke daemon (story 2); badge hanya tampil bila ada agen Live pada dokumen ini, supaya tidak menjadi hiasan tetap. Posisi canvas mengikuti desain RGOYW: kiri 16, atas 66 (review pass 1; sebelumnya top 16).
- **Tag node baru.** Di dalam sudut kiri atas outline (desain p1pgjP), hanya node baru pertama, agar tidak ramai pada execute besar. Node berubah (bukan baru) hanya outline; tag board menggantikan badge "Just changed" lama di node.
- **Agen di toast undo.** Daemon tidak menyimpan pelaku per node; harness dengan execute sukses terbaru pada dokumen ini yang selesai sesudah edit dicatat (`UndoEntry.at`) adalah tebakan terdekat. Tanpa itu → kalimat tanpa pelaku.
- **Edit teks saat agen menulis (review pass 1).** Elemen contentEditable diganti mount ulang, jadi isi terakhir dicatat tiap `input`; saat mount ulang teks itu di-commit (bukan dibuang) dan mode edit selesai. Melanjutkan edit di elemen baru ditunda karena butuh memindahkan caret/seleksi.
- **Blok CSS rusak ditutup (review pass 1).** `app.css` HEAD punya blok tak tertutup (`@media (max-width: 767.98px) { … .viewer .history-rail { padding-top: 13px;` tanpa `}}`), sehingga aturan sesudahnya ter-nest dan tidak berlaku. Blok kini ditutup; aturan mobile Dashboard (`.main .section-label` mb 20px, `.folder-grid` gap 10px) mulai berlaku, diverifikasi smoke msedge 390px.
- **Commit row.** Hanya call terbaru sesi (status terakhir "agen meng-commit"); begitu call lain tiba, baris kembali ke Tool Call Row biasa (desain iVbC4: commit row di atas, execute lama sebagai baris biasa).

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 exec vitest run packages/viewer/src packages/daemon/src/events.test.ts packages/daemon/src/selection.test.ts` -- expected: hijau.
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan di luar baseline Windows `%TEMP%\lakar-fail-base.txt`.

**Manual checks (if no CLI):**
- Smoke msedge (playwright-core) terhadap daemon lokal dengan data dir sementara: sesi agen execute → board ter-update tanpa reload + tag; drag ditahan saat agen commit lalu dilepas → kedua perubahan ada; undo sesudah agen menghapus target → toast "Undo skipped"; seleksi node yang dihapus agen dibersihkan.

## Auto Run Result

**Ringkasan.** Commit agen tampil live di canvas: board terdampak di-mount ulang, outline node berubah memudar 1.5 dtk, label board berganti tag "Just changed · {Agen}", node baru pertama diberi tag "Added · {nama}". Gestur geser/resize/reorder yang sedang berjalan tidak batal saat agen menulis: gestur di-rebase ke geometri baru dan di-commit dari nilai terbaru + Δ (AD-7); pratinjau tertahan dilepas per rev commit. Teks inline yang sedang diketik di-commit, tidak dibuang. Seleksi yang menunjuk node terhapus dibersihkan (dan ikut ke `get_selection`). Undo/redo yang ditolak daemon membuang entri dan menampilkan toast desain "Undo skipped" (AD-8). Badge "Selection shared with agents"/"Shared", Agent Commit Row dengan Locate, dan baris "read your selection" mengikuti desain bagian 06. Daemon hanya menambah field opsional pada call `get_selection`.

**File berubah.**
- `packages/viewer/src/liveChanges.ts` (baru), `liveChanges.test.ts` (baru) -- helper murni: rebase gestur, `heldStatus`, `pruneSelection`, `missingTargets`, `undoSkippedFor`/`undoSkippedText`, `lastAgentLabel`, `commitRow`, `selectionRead`, `shareBadgeText`.
- `packages/viewer/src/canvasEdit.tsx` -- rebase gestur saat mount ulang, `Held` per rev + penerapan ulang, kandidat marquee terkini, edit teks di-commit saat mount ulang.
- `packages/viewer/src/Canvas.tsx` -- rev mount, tag board/node, badge canvas, `onCommit` bertipe rev.
- `packages/viewer/src/Viewer.tsx` -- `commitGesture`, pembersihan seleksi (bukan saat pratinjau), nama terlihat, toast Undo skipped, badge Shared, Locate (pilih + Focus).
- `packages/viewer/src/UndoSkippedToast.tsx` (baru) -- toast desain r69qO.
- `packages/viewer/src/ActivityPanel.tsx` -- Agent Commit Row, baris konteks seleksi dibaca.
- `packages/viewer/src/presence.ts`, `presence.test.ts` -- `changedBoards`, `added`, sorotan untuk execute yang hanya menghapus.
- `packages/viewer/src/undoHistory.ts` -- `UndoEntry.at` opsional (waktu edit dicatat).
- `packages/viewer/src/icons.tsx`, `app.css` -- ikon radio/sparkles/gitCommit; gaya badge, tag, commit row, konteks, toast, motion; blok mobile History yang tak tertutup kini ditutup; `.agent-badge` mati dihapus.
- `packages/daemon/src/events.ts`, `selection.test.ts` -- call `get_selection` membawa `slug`, `target` (alamat primer), `nodes`.

**Temuan review (46).**
- Patch: 4xx → Undo skipped untuk semua penolakan permanen (medium; 3 baris), keputusan undo diekstrak + dites (medium; 2 baris), nama alamat komposit (2), commit row tanpa warning, Locate menggeser kamera, toast di-key (2), blok CSS + baris kosong, marquee kandidat terkini, id buatan entri, kata utuh di pesan error, tag board untuk execute hapus-saja, `.agent-badge` dihapus, pemangkasan tidak saat pratinjau, Locate memilih node bukan board.
- intent_gap diputuskan dan diterapkan: pelaku toast hanya execute sesudah edit (2 baris), edit teks inline di-commit saat remount, badge tetap digerbang agen Live dengan posisi desain (atas 66).
- Deferred: wiring useCanvasEdit tanpa tes (blind/vgap/intent DV-1/DV-2), efek pemangkasan seleksi tanpa tes, gerbang render tanpa tes, held bertahan untuk commit tanpa mount ulang (pra-ada).
- Rejected (low): field error terstruktur, held lama tertimpa (3 baris), parent jadi grid di tengah drag, reparent ke node yang ikut digeser, proses BMAD spec (edit spec), "N nodes" di Read selection.
- False (8): selectionRead warning/slug, selectedId, dependensi efek, warna harness, aksesibilitas label, R-A vs R-B, desain tidak dibaca, permukaan daemon tambahan.

**Rekomendasi review lanjutan.** Patched per verdict entri: high 0, medium 2 (4xx → Undo skipped; keputusan undo diekstrak), low 14. Dua entri medium memicu `true` karena perilaku UI pasca-patch belum terverifikasi; smoke msedge diulang pada kode yang sudah dipatch dan lulus, jadi `followup_review_recommended: false`.

**Verifikasi.**
- `pnpm build` sukses; `tsc -p tsconfig.test.json` bersih.
- Vitest terarah (viewer, events, selection): 385/385 hijau.
- `pnpm test` penuh: 52 gagal, semua di baseline Windows (tidak ada kegagalan baru); snapshot bench yang hanya berubah CRLF dikembalikan.
- Smoke msedge desktop (1440): tag board pada execute biasa dan hapus-saja; commit row; badge di (16, 66); drag selama commit agen → x=250 dan warna agen tetap; ketik "World" saat agen commit → tersimpan dan perubahan agen tetap; undo sesudah agen hapus → "Claude Code deleted “Title” …".
- Smoke msedge mobile (390, isMobile): Files dengan folder → `.section-label` margin 20px, `.folder-grid` gap 10px (1440: 24px/16px tidak berubah); History sheet → `.history-rail` padding-top 13px; tampilan Recents/Files/History normal.

**Risiko tersisa.**
- Wiring hook/komponen tanpa tes otomatis (deferred); bergantung pada smoke.
- Pelaku toast tetap tebakan (agen terakhir sesudah edit), bukan pelaku per node.
- Aturan mobile Dashboard yang dulu tidak berlaku kini aktif (diverifikasi, tetapi tampilan mobile lain di bawah blok itu belum ditinjau desain).
