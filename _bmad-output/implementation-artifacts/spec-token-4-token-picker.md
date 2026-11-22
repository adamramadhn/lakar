---
title: 'Pakai dan lepas token dari panel Design (epic token-tema story 4)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: '1359fa8354f37a1d579d6d25d52a7416067a4643'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Verify ticket (picker tersaring, canvas berubah, Detach) dan jalur route ops dari panel Design hanya dites di tingkat model/core; UI dan canvas hanya lewat smoke msedge.
    evidence: |-
      Viewer belum punya harness tes komponen/DOM atau E2E (pra-ada, sama dengan deferred story editor-5 dan token-3). Logika saring/pasang/detach/buat dites murni (tokenPicker.test.ts), op lewat applyOps + resolveDocument core sungguhan (tests/token-picker-ops.test.ts), route ops viewer dites di packages/daemon/src/ops.test.ts; wiring DesignPanel → TokenPicker → ctx.run dan render canvas hanya smoke msedge. Dicatat di deferred-work.md.
    location: >-
      packages/viewer/src/DesignPanel.tsx TokenPicker/TokenField
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Panel Design hanya menampilkan ref `{$token}` sebagai chip. Pengguna tidak bisa memasang token ke field, melepasnya secara eksplisit, atau membuat token dari nilai yang sedang dipakai. Akibatnya token dari panel Theme (story 3) belum bisa dipakai tanpa agen.

**Approach:**
- Setiap field panel Design yang punya slot token (AD-11) mendapat **Token Picker** (desain 07: u5v2n/XvZQy, komponen Token Field zjtyn default/hover/open, tuEOt/mjY37).
- Field ber-token tampil sebagai **Token Field**: swatch atau ikon jenis, pill nama token, nilai mode aktif, dan tombol Detach saat hover.
- Isi picker:
  - pencarian;
  - daftar token yang tipenya diterima slot (tabel `tokenSlot` @lakar/schema), dikelompokkan per grup, dengan nilai mode aktif board;
  - aksi "Detach token" dan "Create token from value".
- Setiap aksi = satu `POST /viewer/docs/:slug/ops` lewat antrean `ctx.run` panel Design, sehingga tercatat di History dan bisa di-undo (AD-7, AD-8).
- Logika saring, pasang, detach, dan buat token ada di modul murni `tokenPicker.ts` yang dites.

## Boundaries & Constraints

**Always:**
- **Saringan slot.** Penyaringan memakai `tokenSlot(nodeType, propPath)` dari `@lakar/schema`, satu-satunya tabel slot.
  - Multi-select: hanya tipe yang diterima slot di **semua** node terpilih.
  - Path tanpa slot tidak mendapat picker.
- **Pasang token** = menulis `{$token: nama}` ke path slot pada semua node terpilih, lewat pembangun op yang sama dengan edit literal field itu (`setProp`, `setRadiusAll`, `setRadiusCorner`, `setStroke`, `editFill`). Node yang sudah memakai token itu tidak mendapat op.
- **Detach** (tombol di Token Field dan baris picker) = setiap node yang memegang ref di slot itu mendapat literal `modes[mode]` ?? `value` token, dengan `mode` = `themeMode` board pemilik node ?? mode pertama (AD-11). Satu commit untuk semua node.
- **Create token from value:**
  - Input nama berisi `newTokenName(tokens, tipe)` (themeModel) dan divalidasi `tokenNameError`.
  - Tipe = `primary` slot. Nilai = nilai resolve field dan harus lolos `isTokenValueOf`.
  - Satu commit: `setTokens {nama: {type, value}}` lalu op pasang ref ke semua node terpilih.
  - Nilai campuran (Mixed) atau tidak sah → baris non-aktif.
- **Nilai di picker** diformat `TYPE_META[type].format` untuk mode efektif node primer. Hint meta: "<Jenis> tokens · values for <Mode>" (tanpa mode: tanpa bagian kedua).
- **Keyboard picker:**
  - Fokus awal di pencarian. ↑/↓ memindah baris aktif, Enter memasang token aktif.
  - Escape menutup picker tanpa diteruskan ke shortcut canvas. Klik di luar menutup.
- **Baca-saja.** Pratinjau versi atau offline: tombol token dan Detach non-aktif, picker tidak bisa dibuka.
- **Konvensi.** Teks UI Inggris, komentar Indonesia, warna dari token CSS viewer.

**Never:**
- Mengubah skema, core, daemon, route, atau tool MCP. Story ini hanya viewer.
- Viewer mengimpor core/exec/icons, memakai `execute`, atau membuka `EventSource` baru.
- Picker untuk slot yang tidak punya padanan tabel slot (opacity, blur, X/Y, angle) atau untuk shadow (lihat Design Notes).
- Token di ekspor kode (milik epic kode).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Saring warna | fill solid; token `colors.bg` (color), `radius.md` (radius), `space.4` (spacing) | picker hanya `colors.bg` | — |
| Saring panjang | Gap | `radius.md`, `space.4` (grup panjang), tanpa color | — |
| Saring teks | Size di teks / Size di ikon | hanya fontSize / hanya grup panjang | — |
| Multi tipe | teks + ikon (tanpa grup bersama) | grup Typography tidak tampil → tidak ada picker | — |
| Pasang | Gap literal `16`, pilih `space.4` | `update {gap:{$token:'space.4'}}`, History "Apply token space.4" | node sudah ber-ref sama → tanpa op/request |
| Pasang fill | fill[0] solid `#FFFFFF`, pilih `colors.bg` | `fills[0].color = {$token:'colors.bg'}`, fill lain tetap | — |
| Pasang sudut | radius `8`, sudut TR pilih `radius.md` | `radius:[8,{$token},8,8]` | — |
| Detach | board `themeMode:'dark'`, fill ref `colors.bg` (`#FFFFFF`, dark `#0F0F0F`) | `fills[0].color = '#0F0F0F'`, "Detach token colors.bg" | — |
| Detach multi | 2 node di board light/dark memakai `colors.bg` | satu request, literal per mode board masing-masing | — |
| Buat token | Radius All `12`, nama `radius.card` | `[setTokens {radius.card:{type:'radius',value:12}}, update {radius:{$token:'radius.card'}}]` | nama ada/tidak sah → pesan Inggris, tanpa request; nilai Mixed → baris non-aktif |
| Buat dari token | field ber-ref `space.4` (16), buat `space.card` | token baru bernilai 16 (mode aktif), field memakai `space.card` | — |
| Cari | query `sur` | hanya nama yang memuat `sur`; kosong → "No tokens match “sur”." | tanpa token sejenis → "No <jenis> tokens yet." |
| Ubah token | `colors.bg` dipakai 2 node, nilai diubah di panel Theme | kedua node berubah di canvas dalam satu rev | — |
| Undo | sesudah pasang/detach/buat, Ctrl+Z | dokumen kembali (token baru ikut terhapus) | invers gagal → toast Undo skipped (yang ada) |

</intent-contract>

## Code Map

- `packages/schema/src/tokens.ts` -- `tokenSlot`, `TokenSlot`, `LENGTH_TOKEN_TYPES` (tabel slot AD-11).
- `packages/schema/src/nodes.ts` -- `TOKEN_TYPES`, `isTokenValueOf`, slot `tok()` (fill/stop/stroke color, stroke width, radius, padding, gap, column/rowGap, width/height, min/max, typography, icon size/color).
- `packages/viewer/src/themeModel.ts` -- `TYPE_META` (label, ikon, format), `cellOf`, `groupOf`, `newTokenName`, `tokenNameError`, `modeLabel`.
- `packages/viewer/src/designModel.ts` -- `DesignTarget` (tambah `mode`), `opsFor`, `setProp`, `editFill`, `setStroke`, `setRadiusAll`, `setRadiusCorner`, `readField`.
- `packages/viewer/src/DesignPanel.tsx` -- `Field`, `SelectField`, `ColorValue`, `ColorRow`, `PaintRow`, `TokenChip`, grup-grup, `Ctx`/antrean `run`.
- `packages/viewer/src/Viewer.tsx` -- `designTargets` (tambah `mode` dari board), render `DesignPanel` (tambah `tokens`).
- `packages/viewer/src/icons.tsx`, `packages/viewer/src/app.css` -- ikon Lucide dan gaya `.dp-*`, `.menu-layer`.
- `tests/theme-ops.test.ts` -- pola tes op viewer lewat core sungguhan (applyOps + invers + resolveDocument).

## Tasks & Acceptance

**Execution:**
- `packages/viewer/src/tokenPicker.ts` -- baru, murni:
  - spesifikasi slot `TokenSpec` per field: `propSpec`, `fillColorSpec`, `stopColorSpec`, `strokeSpec`, `radiusSpec` (setter = pembangun op edit literal designModel);
  - `slotAccepts(targets, propPath)` → `{accepts, primary} | undefined` (irisan per tipe node);
  - `pickerGroups(tokens, accepts, query, mode, modes)` → grup + baris `{name, type, value, text}`;
  - `refAt(state)`, `anyRef(targets, read)`, `specState(targets, spec)`, `createValue(state, type)`;
  - `applyTokenOps(targets, spec, name)`, `detachOps(targets, spec, tokens, modes)`, `createTokenOps(tokens, name, type, state, targets, spec)` → `Built` (themeModel);
  - `pickerHint(accepts, mode, modes)`, `pickerEmpty(accepts, query)`, `tokenValueText(def, mode, modes)`.
- `packages/viewer/src/tokenPicker.test.ts` -- baru: semua baris matriks (saring per slot dan multi-select, pasang, detach per mode, buat token, cari, nilai tidak sah).
- `packages/viewer/src/designModel.ts` -- `DesignTarget.mode?: string` (mode efektif board pemilik).
- `packages/viewer/src/Viewer.tsx` -- isi `mode` per target dari board `info.boardId`; teruskan `tokens={d.tokens}` ke DesignPanel.
- `packages/viewer/src/DesignPanel.tsx`:
  - prop `tokens`; `Ctx` mendapat `tokens`, `modes`, `openPicker`;
  - spesifikasi slot per field (`TokenSpec {propPath, read, set, label}`);
  - komponen `TokenField` (Field/Select ber-token), tombol `TokenButton` pada field literal, `TokenPicker` (popover);
  - semua slot tersambung: W/H, Gap, Padding, Column/Row gap, Family, Weight, Size, Line height, Letter spacing, warna teks/ikon, Size ikon, warna fill solid dan stop, warna/W stroke, Radius All/sudut.
- `packages/viewer/src/icons.tsx` -- ikon `diamond`, `unlink`.
- `packages/viewer/src/app.css` -- gaya `.dp-tokenfield*`, `.dp-token-btn`, `.token-picker*`.
- `tests/token-picker-ops.test.ts` -- baru: op picker lewat core sungguhan. Isinya:
  - pasang token ke 2 node lalu `setTokens` mengubah keduanya di `resolveDocument`;
  - detach per mode board;
  - buat token + pasang dalam satu rev;
  - invers mengembalikan dokumen persis.

**Acceptance Criteria:**
- Given rect terpilih dengan fill literal dan dokumen bertoken color serta radius, when tombol token di baris Fill diklik, then picker hanya mendaftar token color dengan nilai mode aktif; when satu token dipilih, then satu rev baru, baris Fill menjadi Token Field berpill nama token, dan History bertambah "Apply token …".
- Given dua node memakai token yang sama lewat picker, when nilai token diubah di panel Theme, then kedua node berubah di canvas live dalam satu rev.
- Given field ber-token pada board ber-`themeMode` dark, when Detach diklik, then field memegang literal nilai dark dan pill hilang.
- Given field literal, when "Create token from value" dengan nama baru di-Enter, then token baru muncul di panel Theme dan field memakainya; Ctrl+Z mengembalikan field literal tanpa token baru.
- Given pratinjau versi atau offline, when panel Design dilihat, then tombol token dan Detach non-aktif.

## Spec Change Log

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 34 findings — high 0, medium 6, low 22, false 6, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) pembangun yang mengantre memakai `tokens`/`modes` salinan saat klik (detach literal basi, create melewati cek nama) — benar bila commit panel sebelumnya masih menunggu rev; `Ctx.latest()` membaca token/mode dokumen terbaru dari `live.current`, dipakai `runDetach` dan `create`. Smoke: create + pasang tetap jalan.
  - `[low]` `[reject]` (blind) kegagalan sesudah picker ditutup diam (build ulang error → `[]`) — hanya terjadi di jendela antrean yang sama dengan baris sebelumnya (kini memakai token terbaru); toast menambah plumbing error baru; jarang.
  - `[false]` `[reject]` (blind) Detach tidak berbuat apa-apa untuk ref yatim — core menolak commit dengan ref ke token yang tidak ada (`TOKEN_UNKNOWN`, `transaction.test.ts` "token terhapus masih dirujuk"), jadi dokumen tersimpan tidak pernah memuat ref yatim; pratinjau versi baca-saja.
  - `[low]` `[patch]` (blind) pengguna keyboard tidak bisa mengetik literal di field ber-token (hanya dobel-klik span) — nilai Token Field kini `role="button"` `tabIndex=0`, Enter/F2 membuka input (detach saat diketik). Smoke: fokus + Enter membuka input All.
  - `[low]` `[reject]` (blind) Font family/weight ber-token kehilangan pilihan literal langsung dari dropdown — mengikuti desain Token Field (zjtyn); Detach lalu pilih = dua klik; dua kontrol bertumpuk menambah cabang UI.
  - `[low]` `[patch]` (blind) semantik listbox picker (tanpa `aria-activedescendant`, opsi jadi tab stop, baris aktif keluar tampilan saat ↑/↓) — input pencarian `role="combobox"` + `aria-activedescendant` ke id opsi, opsi `tabIndex=-1`, baris aktif `scrollIntoView({block:'nearest'})`. Smoke: 25× ArrowDown pada 31 token, baris aktif terlihat dan id cocok.
  - `[low]` `[reject]` (blind) dialog tanpa focus trap / `aria-modal` — popover non-modal seperti panel Theme; scrim menutup klik luar; trap menambah manajemen fokus.
  - `[low]` `[reject]` (blind) posisi popover basi saat resize/scroll — scrim `.menu-layer` menutupi panel sehingga panel tidak bisa di-scroll selama picker terbuka; resize jendela saat picker terbuka jarang; listener baru menambah kompleksitas. Repo tanpa lint hooks (exhaustive-deps).
  - `[medium]` `[patch]` (blind) picker tetap terbuka saat field jangkarnya hilang (rev agen/undo) — benar; spec lama bisa menulis ke indeks fill yang bergeser atau `setStroke` membuat ulang stroke yang dihapus. DesignPanel menutup picker pada rev baru bila `anchor.isConnected` false. Smoke: agen menghapus fills saat picker terbuka → picker tertutup.
  - `[false]` `[reject]` (blind) kontrol Token Field mengabaikan `disabled` tingkat field (Stroke W `!has`) — Token Field hanya tampil bila nilai tidak Mixed; node tanpa stroke membuat `readField` stroke Mixed, jadi saat Token Field tampil `has` selalu true; field lain ber-token tidak punya `disabled` tambahan.
  - `[low]` `[reject]` (blind) multi-board menampilkan mode node pertama saja di nilai/hint — tampilan sejajar dengan nilai field (`readField` node pertama); Detach tetap benar per board; seleksi lintas board ber-mode beda jarang; label "mixed modes" menambah cabang.
  - `[low]` `[reject]` (blind) frontmatter/log spec tidak konsisten (deferred kosong, log kosong, Ctx) — perbaikannya mengedit spec build ini; triage ini mengisi log dan `deferred`.
  - `[low]` `[reject]` (blind) token Padding meratakan tuple per sisi, opacity fill ber-token tersembunyi — memasang satu token ke seluruh `padding` adalah aksi eksplisit pengguna dan bisa di-undo; opacity tersembunyi mengikuti desain Fill Token Field (dicatat di Design Notes); mengedit opacity sama dengan detach.
  - `[low]` `[patch]` (blind) celah tes (detach stop/stroke color, label jamak, tuple radius) — tes ditambah di `tokenPicker.test.ts` (detach stop/stroke, "Detach tokens", Radius All tuple seragam) dan `themeModel.test.ts` (`effectiveMode`). Ref yatim tidak bisa terjadi (baris false di atas); `primary` di luar irisan sudah ditangani `slotAccepts` (fallback `accepts[0]`).
  - `[low]` `[patch]` (edge) create membaca token basi lalu `setTokens` menimpa token bernama sama — grup baris blind pertama (`ctx.latest()`).
  - `[low]` `[patch]` (edge) detach menulis nilai token basi — grup baris blind pertama.
  - `[medium]` `[patch]` (edge) field ter-unmount saat picker terbuka → spec basi menulis ke slot salah — grup baris blind picker terbuka.
  - `[low]` `[patch]` (edge) fokus tidak kembali ke pemicu (autoFocus pencarian mendahului layout effect) — benar; pemicu direkam di `openPicker` (`document.activeElement`), saat ditutup fokus ke pemicu, atau ke kontrol di jangkar bila pemicu hilang. Smoke: sesudah Escape fokus di "Apply token to Fill".
  - `[low]` `[reject]` (edge) Escape dengan laci Layers terbuka (≤1100px) menutup laci dulu — hanya pada lebar laci + picker terbuka; Escape kedua menutup picker; perbaikan menambah listener capture global.
  - `[low]` `[reject]` (edge) resize jendela membuat picker salah posisi — grup baris blind posisi.
  - `[low]` `[patch]` (edge) indeks aktif melewati panjang daftar saat token berkurang → Enter tidak berbuat apa-apa — `at` kini dijepit (`active < rows.length`), satu ekspresi.
  - `[false]` `[reject]` (edge) Detach ref yatim tanpa efek — grup baris blind ref yatim (core menolak ref yatim).
  - `[low]` `[reject]` (edge) build ulang yang error dibuang diam — grup baris blind kegagalan diam.
  - `[false]` `[reject]` (edge) Column/Row gap membaca `axisGapOf` sehingga Detach menulis `columnGap` sementara `gap` tetap ref — itulah semantik kolom Column gap (nilai warisan `gap` tampil; edit literal kolom ini juga menulis `columnGap`, perilaku editor-5); Row gap tetap mewarisi `gap`, sesuai.
  - `[false]` `[reject]` (edge) `fillColorSpec` diterima untuk fill non-solid → pasang dilewati diam — baris Fill hanya dirender bila `fills` sama persis di semua node (`readField` tidak Mixed), dan tombol token hanya untuk fill solid; editor stop memakai `stopColorSpec`.
  - `[false]` `[reject]` (edge) `roundTrip` hanya membandingkan pages/tokens/tokenModes — op picker hanya menyentuh ketiganya; field lain (rev, waktu) memang berubah per commit.
  - `[medium]` `[patch]` (vgap) derivasi `mode` per target di Viewer tidak dites (tes membangun ulang sendiri) — `effectiveMode(board, tokenModes)` murni di themeModel.ts dipakai Viewer.tsx, `usersOf` (hapus token), dan helper `targets()` tes core; unit test dark/default/tanpa mode.
  - `[low]` `[patch]` (vgap) Radius All dari tuple 4 sudut ber-token sama: Detach tanpa efek, tanpa centang/Create — `radiusSpec()` membaca tuple seragam sebagai satu nilai (`radiusAll`, sama dengan kolom All). Tes + smoke: Detach → `radius: 12`, undo mengembalikan tuple.
  - `[low]` `[reject]` (vgap) komentar Viewer "terakhir = primer" vs picker memakai `targets[0]` — picker sengaja sejajar dengan nilai field (`readField` node pertama), sehingga nilai di field dan picker selalu sama; mengganti sumber membuat keduanya berbeda.
  - `[medium]` `[defer]` (intent) verify (a)–(c) di permukaan UI hanya dites di tingkat model/core — harness komponen/E2E viewer belum ada (pra-ada); frontmatter `deferred` + deferred-work.md.
  - `[medium]` `[defer]` (intent) "berubah di canvas" dicek di `resolveDocument`, bukan canvas live — grup baris intent pertama (canvas me-mount hasil `resolveDocument`, AD-6/AD-10; smoke membaca gaya computed canvas).
  - `[low]` `[defer]` (intent) route ops tidak dilalui tes — grup baris intent pertama; route dan bentuk op sudah dites di `packages/daemon/src/ops.test.ts`.
  - `[medium]` `[patch]` (intent) mode aktif board dites lewat implementasi ulang — grup baris vgap `effectiveMode`.
  - `[low]` `[reject]` (intent) cakupan field dan tambahan (shadow, padding per sisi, min/max; pencarian, keyboard, Create from value) — daftar field ticket dipenuhi (shadow tidak disebut dan dicatat di deferred-work; min/max tidak ada di panel Design pra-ada); pencarian ada di desain ISYSp dan "Create token from value" diminta prompt story serta desain footer picker.

## Design Notes

- **Pemicu picker di field literal.** Desain hanya memuat Token Field ber-token. Field literal mendapat tombol ikon `diamond` 22×22 di ujung kanan kotak (posisi sama dengan Detach di Token Field). Tombol tampil saat hover atau fokus, title "Apply token". Picker juga terbuka dari klik pill di Token Field.
- **Token Field** (zjtyn):
  - Isi: swatch 16 (warna) atau ikon jenis 13 (`TYPE_META` jenis token), pill `--accent-soft` (ikon diamond 10 `--accent`, nama mono 11), nilai mono 11 `--text-muted`, tombol Detach (unlink) saat hover.
  - Status hover = latar `--surface-hover`. Status open (picker terbuka) = garis `--accent`.
  - Label field diganti ikon jenis, mengikuti desain Gap/Radius. Label tetap ada sebagai `title`/aria.
  - Dobel-klik nilai membuka input berisi nilai resolve; mengetik nilai lain = detach (perilaku story editor-5 dipertahankan).
- **Paint Row ber-token.** Swatch, pill, dan hex tetap di kotak Paint Row; kolom opacity disembunyikan (desain Fill). Tombol `−` untuk hapus fill/stroke tetap di luar kotak supaya fill ber-token tetap bisa dihapus.
- **Popover** (ISYSp): lebar 300, `--modal`, radius 10, bayangan `0 16 40 #00000066`, di atas lapisan `.menu-layer`.
  - Posisi: kiri panel Design, jarak 12, sejajar atas field. Bila tidak muat (lebar mobile/bottom sheet), di bawah field dan dijepit ke viewport.
  - Search 28 `--input` dengan garis `--accent`, lalu meta ikon + hint.
  - List: header grup mono 10 600 muted; baris 30 radius 6 berisi swatch/ikon, nama mono 12, nilai mono 11, centang `--accent` untuk token yang terpasang. Baris terpasang `--accent-soft`, baris aktif atau hover `--surface-hover`. List di-scroll bila tinggi melebihi 320.
  - Footer: "Detach token" (unlink, hint "keeps <nilai>", hanya bila ada node ber-ref) dan "Create token from value" (plus). Baris Create berubah menjadi input nama (Enter buat, Escape batal), error tampil di bawahnya.
- **Urutan daftar** = urutan kemunculan token di dokumen, dikelompokkan `groupOf` (sama dengan panel Theme).
- **Tanpa picker** untuk warna shadow (tidak disebut ticket; baris shadow berupa teks sintaks), opacity/blur/X/Y/angle (bukan slot token), dan posisi stop. Field Padding hanya memasang ref ke seluruh `padding`; tuple berisi ref tetap diedit sebagai teks `$nama`.
- **Ditunda ke deferred-work.md:** picker warna shadow; wiring komponen picker tanpa tes otomatis (harness DOM belum ada).
- **Label History:** "Apply token X", "Detach token X", "Create token X" (+ " on N layers" lewat `describeEdit`).
- **Done-when epic** (end-to-end):
  - "mengubah satu token mengubah semua pemakainya" ditutup oleh story 3 (setCellOps) bersama picker ini, dan dites di `tests/token-picker-ops.test.ts` serta lewat smoke;
  - token di ekspor kode milik epic kode (Boundaries epic);
  - "ada di installer desktop rilis" bergantung pada rilis berikutnya (orkestrator).

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 exec vitest run packages/viewer tests/dependency-direction.test.ts tests/theme-ops.test.ts tests/token-picker-ops.test.ts` -- expected: lolos.
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru di luar baseline Windows.

**Manual checks (if no CLI):**
- Smoke playwright-core msedge terhadap daemon lokal (data sementara):
  - pilih rect, buka picker Fill (hanya token color), pasang (rev +1, computed style berubah);
  - ubah token di panel Theme (dua node berubah);
  - Detach di board dark (literal dark);
  - Create token from value di Radius;
  - Gap hanya menawarkan token panjang;
  - Ctrl+Z setiap aksi;
  - tanpa error halaman.

## Auto Run Result

**Ringkasan.** Field panel Design yang punya slot token sekarang punya Token Picker (desain 07 ISYSp, Token Field zjtyn).
- Field literal: tombol diamond "Apply token" muncul saat hover/fokus.
- Field ber-token: Token Field (swatch/ikon jenis, pill nama, nilai mode aktif, Detach).
- Isi picker: pencarian, token bertipe cocok slot (`tokenSlot` @lakar/schema; irisan multi-select) per grup dengan nilai mode efektif, "Detach token" ("keeps <nilai>"), "Create token from value" (input nama, validasi).
- Slot yang tersambung: W/H, Gap, Padding, Column/Row gap, Family, Weight, Size, Line height, Letter spacing, warna teks/ikon, Size ikon, fill solid, stop, warna/lebar stroke, Radius All/sudut.
- Setiap aksi = satu permintaan route ops lewat antrean panel Design (History + undo).
- Done-when epic "ubah satu token → semua pemakai berubah di canvas" terpenuhi ujung ke ujung (tes core + smoke). Token di ekspor kode milik epic kode; installer rilis menunggu rilis berikutnya.

**File.**
- `packages/viewer/src/tokenPicker.ts` (+ `tokenPicker.test.ts`) — model murni: `TokenSpec` per field, saringan slot, daftar/hint, pasang, detach per mode, buat token.
- `packages/viewer/src/DesignPanel.tsx` — `TokenButton`, `TokenParts`/`TokenField`, popover `TokenPicker`, `Ctx` (token, mode, picker, `latest`), sambungan semua slot.
- `packages/viewer/src/themeModel.ts` (+ tes) — `effectiveMode` (satu sumber mode efektif board).
- `packages/viewer/src/designModel.ts` — `DesignTarget.mode`.
- `packages/viewer/src/Viewer.tsx` — `mode` per target lewat `effectiveMode`, `tokens` ke DesignPanel.
- `packages/viewer/src/icons.tsx`, `app.css` — ikon `diamond`/`unlink`, gaya `.dp-tokenfield*`, `.dp-token-btn`, `.token-picker*`.
- `tests/token-picker-ops.test.ts` — op picker lewat core sungguhan: pasang lintas board lalu ubah token (semua pemakai, mode per board), detach per mode, buat + pasang, slot salah tipe ditolak, invers persis.
- `_bmad-output/implementation-artifacts/deferred-work.md` — 3 entri.

**Review.** 34 temuan: high 0, medium 6, low 22, false 6.
- **Patch** (per entri, verdict entri):
  - medium 2: picker ditutup bila field jangkarnya hilang sesudah rev; `effectiveMode` murni + tes, dipakai Viewer/hapus token/tes core.
  - low 7: token/mode terbaru untuk pembangun mengantre (`ctx.latest`); nilai Token Field bisa dicapai keyboard (Enter/F2); listbox `aria-activedescendant` + `scrollIntoView` + opsi bukan tab stop; fokus kembali ke pemicu; indeks aktif dijepit; Radius All membaca tuple seragam; tes tambahan.
- **Defer 1**: verify UI/canvas/route hanya di tingkat model/core (harness DOM/E2E belum ada).
- **Ditolak**, alasan di Review Triage Log: kegagalan diam (2), ref yatim (2, false), family/weight tanpa pilih literal langsung, focus trap, posisi saat resize (2), `disabled` tingkat field (false), mode multi-board, pembukuan spec, padding/opacity, Escape laci, Column gap (false), fill non-solid (false), roundTrip (false), komentar primer, cakupan field.

**Rekomendasi follow-up review: false.** Pass pertama mem-patch 2 entri medium, jadi aturannya memberi `true`. Risiko yang belum terverifikasi adalah perilaku UI (penutupan picker saat jangkar hilang). Risiko itu sudah diverifikasi ulang lewat smoke msedge pada kode yang sudah dipatch dan lulus, jadi rekomendasinya `false`. Patch medium kedua (`effectiveMode`) diverifikasi oleh unit test. Jumlah patch per verdict entri: high 0, medium 2, low 7.

**Verifikasi.**
- `pnpm build`, `tsc -p tsconfig.test.json`, `tsc -p packages/viewer/tsconfig.json` sukses.
- vitest viewer + dependency-direction + theme-ops + token-picker-ops: 29 file / 432 tes lolos.
- `pnpm test` penuh: 53 gagal, per file sama dengan baseline Windows; tidak ada kegagalan baru. Snapshot bench yang berubah CRLF dikembalikan.
- Smoke msedge Fase A (23/23):
  - Fill hanya token color dan Gap hanya token panjang;
  - pasang → canvas + History +1;
  - ubah token → dua pemakai berubah (light/dark);
  - Detach di board dark → literal dark;
  - Create from value + nama ganda ditolak;
  - Escape; undo.
- Smoke ulang sesudah patch (10/10):
  - baris aktif ter-scroll dan `aria-activedescendant` cocok;
  - fokus kembali ke "Apply token to Fill";
  - Radius tuple seragam tampil sebagai Token Field, Detach → 12, undo kembali;
  - Enter pada nilai membuka input;
  - picker tertutup saat agen menghapus fill;
  - create + pasang;
  - tanpa error halaman.
- Daemon dan data sementara dibersihkan.

**Risiko sisa.**
- UI picker tanpa tes komponen otomatis (deferred).
- Picker warna shadow belum ada (deferred-work).
- Escape saat laci Layers terbuka di lebar ≤1100px menutup laci dulu.
- CI Linux belum dijalankan.
