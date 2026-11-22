---
title: 'Panel Theme: kelola token dan mode tema (epic token-tema story 3)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: 'cbbaa25cf1eb4e57c0d8d7195362bfb10d4643be'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Antrean commit panel Theme (`useCommitQueue`) dan wiring ThemePanel tidak dites otomatis.
    evidence: |-
      Viewer belum punya harness komponen/DOM (pra-ada). Op builder dites murni (themeModel.test.ts) dan lewat core (tests/theme-ops.test.ts); antrean hanya diverifikasi smoke msedge. Usul: pindahkan logika antrean ke modul murni dan uji dengan fake timer.
    location: >-
      packages/viewer/src/ThemePanel.tsx useCommitQueue
    severity: medium
  - summary: >-
      Dialog impor CSS variables dan Copy tokens as CSS di panel Theme belum ada (keputusan intent_gap: milik epic kode story 5).
    evidence: |-
      Deskripsi ticket story 3 menyebut impor dari dialog, tetapi desain dialog impor dan Copy tokens as CSS ada di bagian 09 Code (wvCMu/ngHGS, w6iQk/SpvBC), ticket epic kode story 5 memuat keduanya di panel Theme, dan catatan ticket story 2 menyebut epic kode memakai parser itu untuk dialog impor. Dicatat di deferred-work.md.
    location: >-
      packages/viewer/src/ThemePanel.tsx theme-header
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Token bertipe dan mode tema (skema v3, story 2) hanya bisa dikelola agen lewat `execute`. Pengguna tidak bisa melihat, mengubah, menambah, mengganti nama, atau menghapus token, menambah atau mengganti nama mode, atau memilih mode tema per board dari viewer.

**Approach:**
- Tombol **Theme** di sebelah Export membuka panel melayang **Theme** (desain 07 Theme & tokens: gXCqM/Ci5XZ, njMhO/IDR9G; komponen Token Type Item vQKzD).
- Isi panel: daftar jenis token di kiri dan tabel token jenis aktif di kanan, dengan satu kolom per mode.
- Panel Design mendapat grup **Theme mode** untuk board (tuEOt/mjY37).
- Setiap aksi menjadi satu permintaan `POST /viewer/docs/:slug/ops` lewat `commitOps` Viewer. Akibatnya setiap aksi tercatat di History dan masuk tumpukan undo jendela (AD-7, AD-8).
- Op yang dipakai: `setTokens`, `setTokenModes`, `renameToken`, dan `update {themeMode}`. Semua pembangun op ada di modul murni `themeModel.ts` yang dites.

## Boundaries & Constraints

**Always:**
- **Satu aksi = satu permintaan ops = satu rev.** Aksi tanpa perubahan tidak mengirim request. Edit nilai ditulis sebagai `setTokens({nama: definisi bertipe lengkap})`.
- **Antrean edit.** Edit berikutnya dibangun dari dokumen terbaru sesudah rev edit sebelumnya tampil, dengan pola antrean yang sama dengan panel Design. Tujuannya agar dua edit cepat pada token yang sama tidak saling menimpa.
- **Validasi nilai per tipe** memakai `isTokenValueOf` dari `@lakar/schema`:
  - warna = hex (`parseHex`, huruf besar);
  - radius, spacing, container, breakpoint, fontSize = angka ≥ 0;
  - lineHeight = angka > 0;
  - letterSpacing = angka berapa pun (pecahan em);
  - fontWeight = 100–900 kelipatan 100;
  - fontFamily = teks tak kosong (di-trim).
  - Nilai tidak sah → kolom kembali ke nilai lama, tanpa request.
- **Sel mode:**
  - Kolom mode pertama (default) = `value`.
  - Kolom mode lain = `modes[m]`. Bila kosong, tampil "= <Default>" redup, dan klik membuka input berisi nilai default.
  - Mengosongkan sel mode non-default menghapus `modes[m]` (`modes` kosong → dihapus).
  - Mengosongkan sel default tidak sah.
- **Nama dan mode:**
  - Nama token baru dan rename wajib cocok `TokenName` (≤ 64) dan belum dipakai. Bila gagal, input tetap terbuka dengan pesan Inggris, tanpa request.
  - Input nama mode dinormalisasi ke `MODE_NAME_PATTERN` (huruf kecil, spasi → `-`, karakter lain dibuang). Hasil kosong atau ganda = error.
  - Label mode = nama dengan `-` → spasi dan huruf pertama kapital (`high-contrast` → "High contrast").
- **Hapus token** dalam satu commit: `update` per node pemakai lalu `setTokens({nama: null})`.
  - Setiap ref `{$token: nama}` di node itu diganti nilai token pada mode efektif board pemiliknya (`themeMode` ?? mode pertama; nilai = `modes[mode]` ?? `value`). Ini detach (AD-11).
  - Penghapusan didahului popover konfirmasi yang menyebut jumlah layer pemakai.
- **Tambah mode:**
  - Dokumen bermode: `setTokenModes([...modes, baru])`.
  - Dokumen tanpa `tokenModes`: `setTokenModes(['light', baru])`, atau `['light']` bila nama baru `light`.
- **Ganti nama mode** dalam satu commit:
  - `setTokenModes` (posisi tetap);
  - satu `setTokens` berisi setiap token yang punya `modes[lama]`, dengan kunci diganti;
  - `update {themeMode: baru}` untuk setiap board ber-`themeMode` lama.
- **Theme mode board.**
  - Grup tampil bila semua node terpilih adalah board dan dokumen punya `tokenModes`. Nilai tampil = `themeMode` ?? mode pertama; nilai berbeda antar board tidak menyorot segmen mana pun.
  - Memilih mode pertama menulis `themeMode: null`, mode lain menulis namanya.
  - Kontrol: segmented bila ≤ 3 mode, select bila lebih.
- **Baca-saja dan pratinjau.** Pengguna tidak bisa mengedit saat daemon offline. Saat pratinjau versi, tombol Theme disembunyikan (seperti Export) dan panel ditutup.
- **Konvensi.** Teks UI Inggris, komentar Indonesia, warna dari token CSS viewer.
- **Event dan input di panel.** Panel bertanda `canvas-overlay-ui`: pointer di dalamnya bukan gestur kanvas, dan wheel di dalam panel men-scroll panel, bukan kamera. Escape menutup panel, kecuali sedang mengetik di input (Escape membatalkan input).

**Never:**
- Mengubah skema, core, daemon, route, atau tool MCP. Story ini hanya viewer.
- Dialog impor CSS variables dan "Copy tokens as CSS". Keduanya milik epic kode story 5 (desain 09 wvCMu/w6iQk), lihat Design Notes.
- Pemilih token atau Detach di field Design (story 4).
- Hapus mode, ubah urutan mode, atau ganti mode default.
- Viewer mengimpor core/exec/icons, memakai `execute`, atau membuka `EventSource` baru.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ubah nilai default | `colors.bg` color `#FFFFFF` modes `{dark:'#0F0F0F'}`, ketik `#fafafa` di kolom Light | `[setTokens {colors.bg:{type:'color',value:'#FAFAFA',modes:{dark:'#0F0F0F'}}}]`, History "Change token colors.bg" | `zz` → batal |
| Ubah nilai mode | sel Dark `spacing.4` (tanpa modes) ketik `20` | `modes:{dark:20}` | `-1` → batal |
| Kosongkan mode | sel Dark berisi `20`, kosongkan | `modes` dihapus dari definisi | sel default dikosongkan → batal |
| Sama | ketik nilai yang sama | tanpa request | — |
| Token baru | jenis Font size, "New token", nama `font.size.huge` | `setTokens {font.size.huge:{type:'fontSize',value:16}}`, nama awal `font.size.new` (unik `-2`…) | `Bad Name` / nama ada → pesan, tanpa request |
| Rename | `colors.bg` → `colors.canvas` | `[renameToken colors.bg→colors.canvas]` | nama sama → tanpa request; tidak sah/ada → pesan |
| Hapus | `radius.md` (12) dipakai 2 node: `radius` dan `fills[0].stops`… | `update` 2 node (`radius:12`, ref diganti literal) + `setTokens {radius.md:null}`; popover "2 layers use this token…" | — |
| Hapus bermode | board `themeMode:'dark'` memakai `colors.bg` | literal = `#0F0F0F` | — |
| Tambah mode | `tokenModes ['light','dark']`, ketik `High contrast` | `setTokenModes ['light','dark','high-contrast']` | kosong/ganda → pesan |
| Mode pertama | dokumen tanpa mode, ketik `dark` | `setTokenModes ['light','dark']` | — |
| Rename mode | `dark` → `night`; 3 token punya `modes.dark`; 1 board `themeMode:'dark'` | satu request: `setTokenModes ['light','night']`, `setTokens` 3 token (kunci `night`), `update` board `{themeMode:'night'}` | nama ada → pesan |
| Board mode | pilih Dark / Light (pertama) | `update {themeMode:'dark'}` / `{themeMode:null}` | — |
| Filter | jenis Color, filter `brand` | hanya token jenis aktif yang namanya memuat `brand` | — |
| Kelompok | `colors.bg`, `colors.brand.primary` | grup `colors`, `colors.brand` (urut kemunculan) | — |
| Undo | sesudah aksi apa pun, Ctrl+Z | invers route mengembalikan token/mode/board | invers gagal → toast Undo skipped (yang ada) |

</intent-contract>

## Code Map

- `packages/viewer/src/Viewer.tsx` -- `commitOps` (ops → History + undo + reload), `current`/`latestDoc`, `designTargets`, render `Canvas` (`overlay`) dan `DesignPanel`, `editable`, `preview`.
- `packages/viewer/src/Canvas.tsx` -- `ExportButton` di kanan atas (sekitar baris 862), `overlay`, listener wheel (sekitar baris 530) dan pointerdown yang melewati `.canvas-overlay-ui`.
- `packages/viewer/src/DesignPanel.tsx` -- `Group`, `Segmented`, `SelectField`, `Swatch`, `InlineInput`, antrean `ctx.run`; tempat grup Theme mode.
- `packages/viewer/src/designModel.ts` -- `DesignTarget`, `opsFor`, `setProp`, `readField`.
- `packages/viewer/src/designValues.ts` -- `parseHex`, `parseNumber`, `formatNumber`, `splitHex`, `sameValue`.
- `packages/viewer/src/icons.tsx` -- ikon Lucide inline (tambah palette, sun, moon, contrast, dll.).
- `packages/viewer/src/app.css`, `tokens.css` -- gaya `.export`, `.btn`, `.dp-*`, variabel warna.
- `packages/schema/src/nodes.ts` -- `TokenName`, `TOKEN_TYPES`, `MODE_NAME_PATTERN`, `isTokenValueOf`, `TokenDef`.
- `packages/schema/src/tokens.ts` -- `findTokenUses` (path + propPath per ref).

## Tasks & Acceptance

**Execution:**
- `packages/viewer/src/themeModel.ts` -- baru, murni:
  - `TYPE_META` (label, ikon, prefiks nama, nilai awal, parse/format per tipe);
  - `typeCounts`, `tokenGroups(tokens, type, filter)`, `countLabel`, `modeLabel`, `modeSlug`, `cellOf`;
  - pembangun op `setCellOps`, `newTokenName`, `addTokenOps`, `renameTokenOps`, `tokenUsage`, `deleteTokenOps`, `addModeOps`, `renameModeOps`, `readThemeMode`, `themeModeOps`.
  - Pembangun mengembalikan `{ops, label}`, `{error}`, atau ops kosong.
- `packages/viewer/src/themeModel.test.ts` -- baru: semua baris matriks + detach di tuple/stop/teks + mode efektif board.
- `packages/viewer/src/ThemePanel.tsx` -- baru: `ThemeButton` dan `ThemePanel` (header, daftar jenis, toolbar filter + New token, header mode dengan rename/add, baris grup yang bisa dilipat, sel nilai, aksi hapus + popover, footer), antrean commit.
- `packages/viewer/src/DesignPanel.tsx` -- prop `tokenModes`; grup `ThemeModeGroup` untuk board.
- `packages/viewer/src/Canvas.tsx` -- prop `actions` dirender sebelum Export di wadah `.canvas-actions`; wheel di dalam `.theme-panel` tidak menggeser kamera.
- `packages/viewer/src/Viewer.tsx` -- state panel Theme (tutup saat pratinjau), `actions={<ThemeButton/>}`, `ThemePanel` di `overlay`, `tokenModes` ke DesignPanel.
- `packages/viewer/src/icons.tsx`, `packages/viewer/src/app.css` -- ikon baru dan gaya `.theme-*`, `.canvas-actions`.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- catat item yang ditunda (lihat Design Notes).

**Acceptance Criteria:**
- Given dokumen dengan token `colors.accent` dipakai dua node di board live, when nilai Light diubah di panel Theme, then satu rev baru, kedua node berubah warna di canvas, dan History bertambah satu entri.
- Given board terpilih dan dokumen bermode `light,dark`, when segmen Dark dipilih di grup Theme mode, then node ber-token di board itu memakai nilai dark di canvas.
- Given token dipakai node, when token dihapus lewat popover konfirmasi, then node memegang nilai literal mode aktif dan token hilang dari panel.
- Given aksi apa pun di panel Theme atau grup Theme mode, when Ctrl+Z, then dokumen kembali seperti sebelum aksi.
- Given pratinjau versi atau daemon offline, when panel dilihat, then tidak ada kontrol edit yang aktif (offline) atau tombol Theme tidak tampil (pratinjau).

## Spec Change Log

### 2026-11-22 — Review t3 (keputusan intent_gap, delegasi "terima jadi")
- Pemicu: intent (deskripsi ticket story 3 menyebut "impor CSS variables dari dialog", diff tidak memuatnya).
- Keputusan: impor CSS variables dan Copy tokens as CSS tetap milik epic kode story 5. Dasarnya: desain keduanya ada di bagian 09 Code, ticket epic kode story 5 memuat "Copy tokens as CSS di panel Theme; impor CSS variables memakai parser epic token", dan catatan ticket story 2 menyebut epic kode memakai parser untuk dialog impor. `<intent-contract>` tidak diubah; keputusan sudah tercermin di Never/Design Notes, dicatat di `deferred` dan deferred-work.md.
- Keadaan buruk yang dihindari: dua implementasi dialog impor (story ini tanpa desain bagian 09, lalu epic kode).
- KEEP: semua aksi lewat route ops; pembangun op murni di themeModel.ts.

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 34 findings — high 0, medium 8, low 21, false 5, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) menutup panel membuang edit yang mengantre — hanya bila edit kedua di-commit dalam jendela tunggu rev edit pertama lalu panel ditutup; jarang, perbaikan (flush saat unmount tanpa rev) menambah cabang dan risiko data basi.
  - `[low]` `[reject]` (blind) commit gagal mengosongkan antrean tanpa pesan panel; `ok:false` terlambat diabaikan — Viewer `applyEdit` sudah menampilkan toast error; pola sama dengan panel Design; kasus timeout 3 dtk lalu gagal jarang.
  - `[medium]` `[patch]` (blind) Escape capture global menelan Escape di seluruh aplikasi — benar (mis. edit teks inline di canvas); handler kini hanya bila fokus di dalam panel atau di body. Smoke: Escape dengan fokus di luar panel tidak menutup panel, di dalam menutup.
  - `[low]` `[patch]` (blind) panel tersembunyi di lebar mobile tetap menelan Escape — handler kini berhenti bila `offsetParent === null` (panel tersembunyi).
  - `[low]` `[patch]` (blind) error bersama basi dan garis merah di input lain — `startEdit` membuang error saat editor dibuka. Smoke: error hilang saat rename dibuka, tanpa `.invalid`.
  - `[low]` `[patch]` (blind) input sel nilai tanpa `invalid` — sel nilai kini kembali ke nilai lama saat tidak sah (baris edge terakhir), jadi tidak ada input terbuka yang perlu garis merah; pesan di footer.
  - `[low]` `[patch]` (blind) sel warisan membuka input kosong, bukan berisi nilai default — `initial` = nilai default terformat. Smoke: input berisi `16`. Swatch untuk sel warisan tidak ditambah (desain menampilkan "= Light").
  - `[low]` `[patch]` (blind) popover hapus: fokus awal di tombol destruktif — `autoFocus` dipindah ke Cancel (smoke: Enter = batal, token tetap). Bagian kembalinya fokus dan batas 176px ditolak (kosmetik, butuh state tambahan).
  - `[low]` `[reject]` (blind) aksesibilitas `role="dialog"` (aria-modal, fokus masuk/kembali, usage hanya hover) — panel non-modal seperti popover Export; usage on-hover mengikuti desain; perbaikan menambah manajemen fokus.
  - `[low]` `[patch]` (blind) Ctrl/⌘+wheel di atas panel men-zoom halaman — kini `preventDefault` untuk ctrl/meta lalu keluar. Smoke: `defaultPrevented` true.
  - `[medium]` `[patch]` (blind) popover Export tertutup panel Theme (z 6 > 5) — benar pada lebar desktop standar; `.canvas-actions` z-index 7. Smoke: `elementFromPoint` di popover = popover.
  - `[false]` `[reject]` (blind) union `ThemeIcon` tidak terikat `IconName` — `<Icon name={TYPE_META[t].icon}>` di ThemePanel.tsx gagal typecheck bila nama tidak ada di `IconName`; union sudah dicek di titik pakai.
  - `[low]` `[patch]` (blind) celah tes themeModel — tes `modeIcon`, `setCellOps` tanpa mode, trim nama ditambah; tes antrean digabung ke defer vgap.
  - `[low]` `[reject]` (blind) pembukuan spec (triage, change log, Code Map `.theme-panel`, nomor baris) — perbaikannya mengedit spec; log diisi di fase ini.
  - `[low]` `[reject]` (blind) filter hanya mencocokkan nama — desain "Filter color tokens" di atas kolom Name; pencarian nilai adalah fitur baru.
  - `[low]` `[reject]` (edge) rev agen tiba sebelum rev commit sendiri → edit berikutnya dibangun dari dokumen tanpa edit pertama — jarang (agen menulis token yang sama di jendela ~ratusan ms); risiko sama dengan antrean panel Design (residual); perbaikan mengubah kontrak `commitOps` (mengembalikan rev).
  - `[low]` `[reject]` (edge) job gagal dibangun saat flush (token dihapus di antaranya) dibuang tanpa pesan — jarang; token yang hilang terlihat di panel.
  - `[low]` `[reject]` (edge) edit mengantre hilang saat panel ditutup — sama dengan baris blind pertama.
  - `[false]` `[reject]` (edge) `onCommit` reject → unhandled — `commitOps` Viewer memakai `applyEdit` yang menangkap error dan selalu resolve (`r !== undefined`).
  - `[low]` `[patch]` (edge) error basi sesudah blur — grup baris blind error basi (`startEdit`).
  - `[medium]` `[patch]` (edge) Escape global menelan Escape UI lain — grup baris blind Escape.
  - `[low]` `[patch]` (edge) panel tersembunyi mobile tetap menangkap Escape — grup baris blind mobile.
  - `[low]` `[patch]` (edge) ctrl+wheel zoom halaman — grup baris blind wheel.
  - `[low]` `[reject]` (edge) popover lepas dari baris saat baris di-scroll / panel sangat pendek — jarang; popover tetap di dalam panel dan bisa dibatalkan; perbaikan menambah listener scroll.
  - `[false]` `[reject]` (edge) `themeMode` board tidak ada di `tokenModes` — `tokenModeIssues` menolak dokumen seperti itu saat commit dan resolve; viewer tidak pernah menerimanya.
  - `[false]` `[reject]` (edge) ID node sama di dua path — ID dokumen unik (IdAllocator, `insert` menolak bentrok, CONFLICT); instance belum ada (epic komponen).
  - `[low]` `[patch]` (edge) sel warisan tidak berisi nilai default — grup baris blind sel warisan.
  - `[low]` `[patch]` (edge) Enter nilai tidak sah membiarkan input terbuka, spec: kembali ke nilai lama — sel nilai kini menutup input (nilai lama tampil) dan error di footer, tanpa request. Smoke: `-5` + Enter → input tertutup, rev tetap.
  - `[medium]` `[patch]` (vgap) batch rename mode dan hapus token tidak pernah diterapkan lewat core — `tests/theme-ops.test.ts` baru: setCell, kosongkan mode, hapus (tuple, stop, teks, mode efektif board), rename token, tambah/rename mode (token + board), themeMode board; masing-masing commit satu rev, `resolveDocument` sesuai, invers mengembalikan dokumen persis.
  - `[medium]` `[defer]` (vgap) antrean commit dan wiring ThemePanel tanpa tes otomatis — harness komponen belum ada (pra-ada); frontmatter `deferred` + deferred-work.md.
  - `[false]` `[reject]` (vgap) `renameModeOps` hanya board tingkat atas — `themeMode` hanya ada di skema board, dan board selalu anak halaman.
  - `[medium]` `[intent_gap]` (intent) impor CSS variables dari dialog tidak ada — diputuskan (delegasi "terima jadi"): milik epic kode story 5 sesuai desain bagian 09 dan ticket epic kode; Spec Change Log + `deferred`.
  - `[medium]` `[patch]` (intent) verify canvas live/satu rev hanya dites di op builder — grup baris vgap pertama (tes core + `resolveDocument` per board) + smoke msedge computed style.
  - `[medium]` `[patch]` (intent) "setiap aksi bisa di-undo" tidak dites — grup baris vgap pertama (invers tiap aksi diterapkan ulang = dokumen awal).

## Design Notes

- **Impor CSS variables dan Copy tokens as CSS ditunda ke epic kode story 5.** Desain keduanya ada di bagian 09 Code (wvCMu/ngHGS, w6iQk/SpvBC). Ticket epic kode story 5 memuat "Copy tokens as CSS di panel Theme; impor CSS variables memakai parser epic token", dan catatan ticket story 2 menyebut epic kode memakai parser itu untuk dialog impor. Tombol header itu tidak ditampilkan dulu agar tidak ada kontrol mati. Dicatat di deferred-work.
- **Penempatan.** Panel 828×720 di kiri atas canvas (16, 58), dibatasi ukuran canvas, latar `--modal`, radius 12, bayangan. Tombol Theme (ikon palette) di kiri Export, berlatar `--surface-hover` saat panel terbuka. Pada lebar mobile, Theme disembunyikan seperti Export.
- **Nilai di sel.** Warna: swatch (color picker native, alpha dipertahankan) + hex yang bisa diklik untuk diketik. Jenis lain: Value Box mono. Sel mode tanpa nilai: "= Light". Baris tipe non-warna punya ikon jenis 12px di kolom nama (desain font size).
- **Rename token.** Klik nama → Rename Input (garis `--accent`). Enter/blur commit, Escape batal. Hover baris menampilkan jumlah pemakai ("N layers") dan tombol hapus.
- **Token baru.** "New token" (toolbar) dan "New <type> token" (footer) membuka baris draf di akhir tabel. Draf berisi Rename Input dengan nama `<prefiks>.new` dan nilai awal per tipe: `#D9D9D9`, radius 4, spacing 8, container 1200, breakpoint 768, `Inter`, 400, 16, 24, 0. Enter membuat token dalam satu commit. Prefiks diambil dari grup token pertama jenis itu, atau dari default: `colors`, `radius`, `spacing`, `container`, `breakpoint`, `font.family`, `font.weight`, `font.size`, `font.line-height`, `font.letter-spacing`.
- **Mode.** Klik label mode → input rename. `+` membuka input "New mode". Badge "Default" di mode pertama. Dokumen tanpa mode menampilkan satu kolom "Value" dan `+`.
- **Hint footer.** "Empty mode cells use the default mode value." hanya tampil bila ada ≥ 2 mode.
- **Label History:**
  - "Change token X", "Add token X", "Rename token X to Y", "Delete token X";
  - "Add mode M", "Rename mode A to B";
  - "Change theme mode" (+ " on N layers").
- **Grup** = nama tanpa segmen terakhir. Token satu segmen masuk tanpa header grup. Chevron melipat grup sebagai status UI.
- **Teks popover hapus:** "Delete X?" + "N layer(s) use this token. They keep their current value as a plain color/number/value (detached). You can undo this." Tanpa pemakai: "No layers use this token. You can undo this."
- **Antrean commit** ditulis ulang di ThemePanel. DesignPanel tidak di-refactor demi risiko regresi.
- **Ditunda:** hapus/urut mode dan ganti default; wiring ThemePanel tanpa tes komponen (smoke msedge saja, sama dengan DesignPanel).

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 exec vitest run packages/viewer tests/dependency-direction.test.ts tests/theme-ops.test.ts` -- expected: lolos.
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru di luar baseline Windows.

**Manual checks (if no CLI):**
- Smoke playwright-core msedge terhadap daemon lokal (data sementara):
  - buka Theme, ubah warna (rev +1, computed style live berubah);
  - tambah token, rename, hapus token terpakai (node literal);
  - tambah mode dan rename mode;
  - grup Theme mode board → Dark (computed style berubah);
  - Ctrl+Z tiap aksi.

## Auto Run Result

**Ringkasan.** Tombol Theme di kiri Export membuka panel melayang Theme (desain 07):
- jenis token beserta jumlahnya;
- tabel token per grup dengan satu kolom per mode (sel warisan "= Light"), filter, dan token baru (draf nama `<prefiks>.new`);
- ganti nama token, hapus dengan popover konfirmasi yang men-detach pemakai ke nilai mode efektif board-nya;
- tambah dan ganti nama mode (normalisasi `High contrast` → `high-contrast`).

Panel Design mendapat grup Theme mode untuk board (segmented ≤ 3 mode, select bila lebih; mode pertama = hapus `themeMode`). Setiap aksi = satu permintaan route ops (`setTokens`/`setTokenModes`/`renameToken`/`update`), sehingga tercatat di History dan bisa di-undo. Impor CSS variables dan Copy tokens as CSS diputuskan milik epic kode story 5.

**File.**
- `packages/viewer/src/themeModel.ts` (+ `themeModel.test.ts`) — model murni: meta tipe, grup, sel, validasi nilai/nama/mode, pembangun op, jumlah pemakaian.
- `packages/viewer/src/ThemePanel.tsx` — `ThemeButton`, `ThemePanel`, antrean commit, `CellInput`, swatch, popover hapus.
- `packages/viewer/src/DesignPanel.tsx` — `ThemeModeGroup` + prop `tokenModes`.
- `packages/viewer/src/Canvas.tsx` — slot `actions` di kiri Export; wheel di `.canvas-scroll-ui` men-scroll panel (ctrl/⌘ tetap dicegah).
- `packages/viewer/src/Viewer.tsx` — state panel (ditutup saat pratinjau), wiring.
- `packages/viewer/src/icons.tsx`, `app.css` — 13 ikon Lucide, gaya `.theme-*`, `.canvas-actions`.
- `tests/theme-ops.test.ts` — op panel lewat core sungguhan: satu rev, `resolveDocument` per board, invers = dokumen awal.
- `_bmad-output/implementation-artifacts/deferred-work.md` — 3 entri.

**Review.** 34 temuan: high 0, medium 8, low 21, false 5.
- **Patch** (per entri, verdict entri):
  - medium 3: Escape dibatasi ke fokus panel/body; z-index Export di atas panel; tes core `tests/theme-ops.test.ts` (sekaligus menutup dua divergensi intent).
  - low 7: panel tersembunyi tidak menelan Escape; error dibuang saat editor dibuka; sel warisan berisi nilai default; Enter tidak sah mengembalikan nilai lama; fokus awal popover di Cancel; ctrl+wheel dicegah; tes tambahan themeModel.
- **intent_gap 1** diputuskan: impor/Copy CSS → epic kode story 5.
- **Defer 1**: antrean/wiring tanpa tes komponen.
- **Ditolak**, dengan alasan di Review Triage Log: edit mengantre saat panel ditutup (2), pesan commit gagal, a11y dialog, ThemeIcon, pembukuan spec, filter nilai, rev agen mendahului, job gagal saat flush, popover saat scroll, `onCommit` reject, themeMode tak dikenal, ID ganda, board bersarang.

**Rekomendasi follow-up review: false.** Patch medium yang menyangkut perilaku UI (Escape, z-index Export) dan semua patch UI low diverifikasi ulang lewat smoke msedge pada kode yang sudah di-patch (lihat di bawah). Patch medium tes core diverifikasi oleh tes itu sendiri. Tidak ada risiko UI yang belum terverifikasi. Jumlah patch per verdict entri: high 0, medium 3, low 7.

**Verifikasi.**
- `pnpm build`, `tsc -p tsconfig.test.json`, `tsc -p packages/viewer/tsconfig.json` sukses.
- vitest viewer + dependency-direction + theme-ops: 27 file / 406 tes lolos.
- `pnpm test` penuh: 53 gagal, semuanya ada di baseline Windows; tidak ada kegagalan baru. Snapshot bench yang berubah CRLF dikembalikan.
- Smoke msedge Fase A (daemon lokal, data sementara):
  - ubah warna → rev +1 dan background live berubah;
  - tambah token, rename, tambah mode, rename mode `dark` → `night` (modes token ikut);
  - hapus token terpakai → literal + teks popover benar;
  - Ctrl+Z mengembalikan;
  - board Night → warna live berubah, undo kembali.
- Smoke ulang sesudah patch: Escape di dalam panel menutup; Escape di input hanya membatalkan input; Escape dengan fokus di luar panel tidak menutup; sel warisan berisi `16`; `-5` + Enter → input tertutup, error di footer, rev tetap; error hilang saat editor lain dibuka; fokus popover di Cancel dan Enter membatalkan; popover Export di atas panel; ctrl+wheel `defaultPrevented`; tanpa error halaman.
- Daemon dan data sementara dibersihkan.

**Risiko sisa.**
- Antrean commit panel tanpa tes komponen (deferred).
- Rev agen yang tiba sebelum rev commit sendiri bisa membuat edit cepat berikutnya dibangun dari dokumen tanpa edit pertama (jarang; sama dengan panel Design).
- Hapus/urut mode dan ganti default belum ada (deferred-work).
- CI Linux belum dijalankan.
