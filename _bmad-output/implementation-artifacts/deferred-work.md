# Deferred work

- source_spec: `_bmad-output/implementation-artifacts/spec-viewer-b-slice-1.md`
  summary: Daemon tidak memeriksa header Host/Origin, sehingga route loopback (termasuk `/viewer/*` dan `/app/*`) bisa dibaca lewat DNS rebinding.
  evidence: Berlaku untuk semua route lama (`/execute`, `/screenshot`) sejak sebelum slice ini; perlu keputusan arsitektur (AD-14) dan allowlist Host.
- source_spec: `_bmad-output/implementation-artifacts/spec-viewer-b-slice-1.md`
  summary: Test invalidasi cache ringkasan `GET /viewer/docs` saat file berubah di luar daemon.
  evidence: Cabang `hit.mtimeMs === mtimeMs` tidak diuji; hanya berdampak pada edit file di luar daemon (git checkout, restore).
- source_spec: `_bmad-output/implementation-artifacts/spec-viewer-b-slice-2.md`
  summary: Nama harness di Activity/History berasal dari `client` sesi, dan `packages/mcp` selalu mengirim `lakar-mcp`; kirim `clientInfo` MCP (mis. `claude-code`, `codex`) sebagai client agar label "Claude Code"/"Codex" muncul.
  evidence: Design Notes slice 2; `packages/mcp` dibekukan di slice ini (Never), viewer sudah memetakan pola `claude`/`codex`.
- source_spec: `_bmad-output/implementation-artifacts/spec-viewer-b-slice-2.md`
  summary: Cache screenshot `#latest` viewer dikunci `slug:boardId` tanpa id dokumen, jadi PNG rev lebih tinggi dipakai ulang bila rev dokumen turun (file dipulihkan atau slug dibuat ulang).
  evidence: `api.ts` `latest.rev >= seenRev`; hanya terjadi bila dokumen diubah di luar daemon. Perbaikan: sertakan doc id di kunci atau kosongkan saat muat penuh.
- source_spec: `_bmad-output/implementation-artifacts/spec-viewer-b-slice-2.md`
  summary: Hook `onResponse` (penutup call yang tidak lewat `onSend`) belum diuji.
  evidence: Semua test event lewat `onSend`; perlu test dengan abort socket nyata.
- source_spec: `_bmad-output/implementation-artifacts/spec-viewer-b-slice-2.md`
  summary: Wiring live Viewer (touched → reload parsial/penuh, Follow agent pindah halaman dan geser kamera) belum punya test otomatis.
  evidence: Repo belum punya harness test komponen React; langkah murah: ekstrak keputusan reload dan `boardVisible`/`focusCamera` ke helper murni lalu uji.
- source_spec: `_bmad-output/implementation-artifacts/spec-viewer-b-slice-2.md`
  summary: `GET /viewer/docs/:slug/history` mengembalikan seluruh riwayat tanpa limit dan diambil ulang tiap rev saat tab History terbuka.
  evidence: Terasa pada dokumen dengan ribuan revisi; tambahkan `limit`/`before`.
- source_spec: `_bmad-output/implementation-artifacts/spec-desktop-release-1.md`
  summary: `RenderPool.close()` menunggu peluncuran browser yang sedang berjalan, sehingga shutdown (SIGTERM atau stdin ditutup) saat pool masih hangat bisa melewati batas 5 s dan keluar paksa dengan kode 1.
  evidence: smoke test sidecar di release.yml (Linux, macOS x64, Windows) keluar 1 saat stdin ditutup ketika pool 0/2; perilaku pool sudah ada sebelum perubahan ini. Chrome ikut berhenti karena pipe Playwright tertutup, jadi dampaknya hanya kode keluar dan jeda 5 s.

- source_spec: `_bmad-output/implementation-artifacts/spec-app-1-file-management.md`
  summary: Operasi file dan edit dari viewer (new/rename/duplicate/archive/delete, insert/delete layer) tidak memancarkan event activity, jadi jendela viewer lain (mis. tab browser di samping aplikasi desktop) tidak ikut memuat ulang; hanya Restore yang memancarkan event.
  evidence: `events.ts` melewati sesi `lakar-viewer`; `api.onDocsChanged` hanya listener dalam proses. Viewer yang membuka slug yang di-rename/arsip/hapus di tempat lain jatuh ke 404 tanpa pengalihan.
- source_spec: `_bmad-output/implementation-artifacts/spec-app-2-export-copy.md`
  summary: Handler unduhan Tauri (`on_download`, konfigurasi jendela `create:false`) hanya diuji lewat helper murninya; perlu smoke test manual di Windows, macOS, dan Linux bahwa Export PNG mendarat di Downloads tanpa menimpa file.
  evidence: `cargo test` hanya mencakup `unique_path`/`download_name`; tidak ada webview di CI.
- source_spec: `_bmad-output/implementation-artifacts/spec-app-1-file-management.md`
  summary: Kartu dan baris Dashboard memakai `div role=button` yang berisi tombol "…" (kontrol interaktif bersarang), dan pintasan F2/Del/Ctrl+D tidak punya `aria-keyshortcuts`/tooltip.
  evidence: temuan Blind Hunter pada review batch 1–4.
- source_spec: `_bmad-output/implementation-artifacts/spec-app-3-history-restore.md`
  summary: Snapshot 200 rev per dokumen tanpa batas byte, dan cache viewer `#revShots`/`#revDocs` tidak me-revoke blob URL atau memangkas isi saat menelusuri riwayat panjang.
  evidence: temuan Blind Hunter pada review batch 1–4.
- source_spec: `_bmad-output/implementation-artifacts/spec-app-1-file-management.md`
  summary: Delete dokumen yang hanya ada di memori (file dihapus dari luar) tidak punya tes; rename/archive pada kasus yang sama mengembalikan 404 sementara delete berhasil.
  evidence: hanya terjangkau setelah data dir diubah dari luar aplikasi.

- source_spec: `_bmad-output/implementation-artifacts/spec-app-5-agent-presence.md`
  summary: Batasi `bounds` di event aktivitas (atau buang dari event lama saat snapshot hello) supaya snapshot tidak membengkak.
  evidence: maybe-false, bila benar medium — tiap execute selesai membawa ≤ 60 tuple, ring 100 event; ukur ukuran `hello` nyata pada dokumen besar untuk memastikan.
- source_spec: `_bmad-output/implementation-artifacts/spec-app-5-agent-presence.md`
  summary: Test komponen untuk `AgentLayer`/`AgentCursor`/`useGlide` dan tanda baris `LayerTree` (posisi, sembunyi saat pratinjau, reduced motion).
  evidence: viewer belum punya setup test DOM; regresi posisi kursor/outline atau guard `!preview` saat ini tidak tertangkap test mana pun.
- source_spec: `_bmad-output/implementation-artifacts/spec-app-7-titlebar-tabs.md`
  summary: Belum terverifikasi bahwa halaman viewer remote (http://127.0.0.1:<port>/app/) mendapat `window.__TAURI__` + IPC lewat capability `viewer-window`; bila tidak, jendela tanpa dekorasi (Windows/Linux) tidak punya tombol jendela maupun drag region (keluar/tampil hanya lewat tray).
  evidence: maybe-false, dampak tinggi bila benar. Diselesaikan dengan menjalankan build release di Windows/Linux: tombol minimize/maximize/close tampil dan bekerja, drag + dobel-klik spacer jalan.
- source_spec: `_bmad-output/implementation-artifacts/spec-app-7-titlebar-tabs.md`
  summary: Resize jendela tanpa dekorasi di Linux (tepi jendela) belum terverifikasi; tidak ada `start_resize_dragging`.
  evidence: maybe-false; tao biasanya menangani resize jendela undecorated, perlu dicek di build release Linux.
- source_spec: `_bmad-output/implementation-artifacts/spec-app-8-pages.md`
  summary: Pelacakan halaman aktif per ID di Viewer.tsx (`pendingPage`, `pageWaiting`, efek sinkron) tidak punya test otomatis.
  evidence: Repo belum punya harness test komponen React (`*.test.tsx`); hanya `resolvePageIndex` yang teruji. Bisa diselesaikan dengan menarik state machine ke reducer murni.
- source_spec: `_bmad-output/implementation-artifacts/spec-app-8-pages.md`
  summary: Agen hanya bisa menambah board ke halaman pertama (`add(null)`, `children(null)`, `place`); halaman lain yang dibuat pengguna tidak terjangkau agen.
  evidence: Disengaja agar `/execute` dan tool MCP tidak berubah untuk bench; butuh keputusan desain API agen (mis. `pages()` + `add(pageId)` terdokumentasi).
- source_spec: `_bmad-output/implementation-artifacts/spec-app-10-folders.md`
  summary: `/docs/open` agen yang membuat dokumen baru pada slug dengan keanggotaan folder basi (file lama dihapus dari luar aplikasi) memunculkan dokumen itu di folder lama.
  evidence: maybe-false, medium bila terjadi; route agen dibekukan untuk bench. Diselesaikan dengan membersihkan keanggotaan di cabang `created` `/docs/open` (server.ts) atau pemangkasan aman saat daemon mulai.
- source_spec: `_bmad-output/implementation-artifacts/spec-app-10-folders.md`
  summary: Alur UI folder (seret ke folder, Move to…, New file di halaman folder) hanya diverifikasi manual; viewer belum punya tes komponen.
  evidence: setelan tes komponen (jsdom/testing-library) belum ada di repo; kontrak klien api.ts sudah dites.
- source_spec: `_bmad-output/implementation-artifacts/spec-app-11-list-columns.md`
  summary: Hasil check untuk kolom Checks hanya disimpan di memori daemon (`CheckLedger`), jadi setelah restart semua dokumen tampil "—" sampai agen menjalankan execute/layout_check lagi; file baru dari aplikasi juga "—" karena New file tidak menjalankan check.
  evidence: Disengaja agar daftar tidak pernah merender/menjalankan check. Opsi: simpan ringkasan per board di `<dataDir>/checks.json` (kunci id dokumen + rev) atau jalankan check board kosong saat New file.
- source_spec: `_bmad-output/implementation-artifacts/spec-app-11-list-columns.md`
  summary: Halaman Archive (List view) menampilkan "—" untuk Created/Last agent/Checks karena `GET /viewer/archive` tidak membaca riwayat arsip.
  evidence: `readHistory` hanya membaca path aktif; tambahkan varian arsip lalu pakai `historyMeta` di `files.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-app-11-list-columns.md`
  summary: Edit manual tampil sebagai "You" (avatar Y), bukan nama pengguna seperti "Muhammad F." di desain; Edited/Created memakai format `relativeTime` ("1 h ago") yang sama dengan Grid, bukan "1 hour ago".
  evidence: Aplikasi tidak punya nama pengguna (profil tertulis "Lakar"); mengubah `relativeTime` menyentuh kartu Grid, History, dan Activity (di luar cakupan).
- source_spec: `_bmad-output/implementation-artifacts/spec-app-12-splash-theme.md`
  summary: Belum terverifikasi di build release bahwa tema native jendela (Light/Dark dari Settings) diteruskan ke `prefers-color-scheme` layar mulai, terutama di Linux (WebKitGTK mengikuti preferensi gelap GTK).
  evidence: maybe-false. Windows dan macOS didukung lewat jalur Tauri yang terdokumentasi (`window.theme()` saat membuat WebView2, NSAppearance). Bila Linux tidak ikut, tambahkan atribut `data-theme` di layar mulai dari nilai tema yang disuntikkan Rust.
- source_spec: `_bmad-output/implementation-artifacts/spec-model-dokumen-2-token-bertipe-v3.md`
  summary: Agen tidak punya API baca untuk `tokens` dan `tokenModes` dokumen, jadi tidak bisa melihat definisi token atau daftar mode sebelum memanggil `setTokenModes`.
  evidence: `get`/`find` di API `execute` hanya mengembalikan node. Celah sudah ada sejak token v2. Usul: fungsi baca kepala dokumen di epic token (aditif, AD-4).
  resolved: 2026-11-22 di `spec-token-2-read-api.md` (epic token-tema story 2). `execute` mendapat `getTokens()` yang mengembalikan `{tokens, modes}`.
- source_spec: `_bmad-output/implementation-artifacts/spec-editor-2-ops-route.md`
  summary: Op core `insert` (sisip ulang subtree dengan ID asli, dipakai invers `remove`) belum diekspos di sandbox `execute`, padahal AD-2 meminta kemampuan tulis baru diekspos di `execute` dan route ops.
  evidence: Agen tidak memakai tumpukan undo (AD-8), jadi belum ada kebutuhan. Mengekspos berarti menambah entri `api.ts`/`api.md` exec dan tes ukuran skill (aditif, AD-4).
- source_spec: `_bmad-output/implementation-artifacts/spec-editor-3-live-canvas.md`
  summary: Siklus mount board live (`mountLive`, `ensureFaces`, efek `BoardLive` di Canvas.tsx, tanpa `/screenshot`, remount hanya board berubah) hanya diverifikasi lewat smoke Playwright manual; belum ada tes otomatis di permukaan canvas.
  evidence: Tes viewer berjalan di Node tanpa DOM. Usul: tes halaman Chromium untuk `mountLive` seperti `packages/render/test/text.test.ts`, atau e2e Playwright `/app/` (cek `[data-lakar-id]` di shadow root, remount sesudah ops, tanpa POST /screenshot).
- source_spec: `_bmad-output/implementation-artifacts/spec-editor-3-live-canvas.md`
  summary: Bundle viewer naik 397 kB → 523 kB (gzip 161 kB) karena `resolveDocument` menarik zod lewat `tokens.ts` @lakar/schema.
  evidence: Diukur dari `vite build`. Usul: entry schema tanpa zod (resolve + tipe) atau pisahkan validasi zod dari logika resolve token.
- source_spec: `_bmad-output/implementation-artifacts/spec-editor-4-select-move-resize.md`
  summary: Wiring gestur `useCanvasEdit` (pointer → satu `onCommit` per gestur, Escape tanpa request, reorder noop, pratinjau tertahan) dan alur integrasi viewer + daemon (rev per gestur, undo round trip) belum punya tes otomatis; hanya smoke Playwright manual.
  evidence: Vitest tanpa environment DOM; helper murni (`gesture.ts`, `liveGeometry.ts`, `undoHistory.ts`) sudah dites. Usul: ekstrak mesin state gestur murni atau e2e Playwright `/app/` (bersama deferred story 3).
- source_spec: `_bmad-output/implementation-artifacts/spec-editor-5-design-panel.md`
  summary: Ikon mata (visibilitas) pada baris fill dan shadow di desain bagian 05 tidak ditampilkan karena skema v3 tidak punya `visible` pada Fill/Shadow.
  evidence: AD-1 melarang properti tanpa padanan render; menambah `visible` butuh kenaikan schemaVersion (AD-3), pemetaan render/codegen, dan korpus. Usul: gabungkan dengan story skema berikutnya (mis. story 7 grid v4).
- source_spec: `_bmad-output/implementation-artifacts/spec-editor-5-design-panel.md`
  summary: Scrub nilai di panel Design hanya mempratinjau angka di kolom; canvas live baru berubah sesudah commit saat lepas.
  evidence: AD-7 hanya mewajibkan pratinjau lokal; pratinjau canvas butuh pemetaan properti → gaya DOM sementara per node (css.ts). Usul: pakai deklarasi `@lakar/render` css.ts pada elemen live selama scrub.
- source_spec: `_bmad-output/implementation-artifacts/spec-editor-5-design-panel.md`
  summary: Wiring komponen `DesignPanel` (Field Enter/blur/Escape/scrub, color picker `change`, drag urutan fill) belum punya tes otomatis; logika patch/parse dites murni dan alur dicek dengan smoke Playwright msedge.
  evidence: Vitest viewer tanpa environment DOM. Usul: e2e Playwright `/app/` bersama deferred story 3 dan 4.
- source_spec: `_bmad-output/implementation-artifacts/spec-editor-6-editing-actions.md`
  summary: Wiring edit teks inline (`startTextEdit`/`finishText` di canvasEdit.tsx: Enter/blur commit satu op, Escape tanpa request, remount membatalkan) dan dispatch menu konteks/EditMenu belum punya tes otomatis; hanya smoke Playwright msedge.
  evidence: Vitest viewer tanpa environment DOM/contentEditable; bagian deterministik (`textEditPlan`, `normalizeEditedText`, `shortcutAction`, `nudgeNodes`, `pageGeometry`) dites murni. Usul: e2e Playwright `/app/` bersama deferred story 3-5.
- source_spec: `_bmad-output/implementation-artifacts/spec-editor-6-editing-actions.md`
  summary: Sisip layer dari tool kanvas / menu + Layers masih lewat `execute` + codegen sehingga tidak masuk tumpukan undo per jendela; Ctrl+Z sesudah sisip membatalkan edit ops sebelumnya.
  evidence: Sudah ada sebelum story 6 (aplikasi 4); AD-8 meminta undo untuk commit jendela. Usul: pindahkan sisip ke route ops (`add` + `ref`) agar invers tercatat.
- source_spec: `_bmad-output/implementation-artifacts/spec-editor-7-grid-layout.md`
  summary: Panel Design belum punya kontrol penempatan anak grid (`gridColumn`/`gridRow`: span, start/end); hanya lewat agen (`execute`).
  evidence: Desain 05 Editor (Xxi0M) hanya memuat Columns/Rows/Column gap/Row gap/Padding/Align. Usul: baris Placement di grup Position & size untuk anak parent grid setelah desainnya ada.
- source_spec: `_bmad-output/implementation-artifacts/spec-editor-7-grid-layout.md`
  summary: Drag reorder di canvas tidak mengenal kontainer grid: anak grid tidak bisa diurutkan ulang dengan drag di dalam grid (dropContainer hanya row/column).
  evidence: Urutan sel grid mengikuti urutan anak; perlu indeks drop 2D dari kotak sel (gesture.ts reorderTarget). Usul: story editor lanjutan.
- source_spec: `_bmad-output/implementation-artifacts/spec-editor-7-grid-layout.md`
  summary: Panel grid tidak menyunting jenis track (px/fr/auto/minmax) per kolom; jumlah kolom/baris saja, track baru `{fr:1}`/`auto`.
  evidence: Desain tidak memuat editor track. Usul: popover track per kolom bila desain menambahkannya.
- source_spec: `_bmad-output/implementation-artifacts/spec-agen-3-live-changes.md`
  summary: Wiring `useCanvasEdit` (rebase gestur saat board di-mount ulang oleh agen, pelepasan/penerapan ulang pratinjau tertahan per rev) tidak dieksekusi tes otomatis.
  evidence: Viewer belum punya harness tes komponen/DOM; hanya helper murni (`liveChanges.test.ts`) dan smoke msedge. Usul: harness komponen atau skrip playwright di `scripts/` yang menggeser node selama execute agen.
- source_spec: `_bmad-output/implementation-artifacts/spec-agen-3-live-changes.md`
  summary: Efek pembersihan seleksi di `Viewer.tsx` (latestIndex/prevLatest) tidak dites di tingkat komponen.
  evidence: Hanya `pruneSelection` murni yang dites; tanpa harness komponen (pra-ada).
- source_spec: `_bmad-output/implementation-artifacts/spec-agen-3-live-changes.md`
  summary: Gerbang render baru (badge Shared, commit row baris 0, tag board saat pratinjau) tidak punya tes render.
  evidence: Helper turunannya dites; komponen viewer tanpa harness (pra-ada). Usul: pindahkan gerbang badge ke helper murni bila perlu dipin.
- source_spec: `_bmad-output/implementation-artifacts/spec-agen-3-live-changes.md`
  summary: Pratinjau tertahan sesudah commit yang tidak mengubah isi board (tanpa mount ulang) bertahan sampai mount berikutnya.
  evidence: Pra-ada sejak editor story 4; gaya sementara bernilai sama dengan hasil commit. Usul: lepas juga saat dokumen ber-rev ≥ commit termuat dan tanda tangan board tidak berubah.
- source_spec: `_bmad-output/implementation-artifacts/spec-agen-4-variant-flow.md`
  summary: Cek konsistensi `literal` di skill `selection` hanya membandingkan dengan node sejawat bertoken, bukan dengan nilai token dokumen.
  evidence: Sandbox execute belum bisa membaca nilai token (API baca token = epic token-tema story 2), jadi literal yang nilainya sama dengan token tanpa sejawat bertoken tidak terlapor. Usul: sesudah API baca token ada, bandingkan nilai literal dengan nilai token (mode aktif) di contoh skill dan tes selection-flow.
  resolved: 2026-11-22 di `spec-token-2-read-api.md` (epic token-tema story 2). Contoh `literal` di skill `selection` kini juga membandingkan literal dengan nilai token dokumen (`getTokens()`, mode efektif board, tipe sesuai slot).
- source_spec: `_bmad-output/implementation-artifacts/spec-token-2-read-api.md`
  summary: Dua token berbeda nama tetapi sama variabel CSS (mis. `a.b` dan `a-b`) bisa ada berdampingan dan bertabrakan saat ekspor/impor.
  evidence: `cssVarName` tidak injektif; `setTokens` sudah bisa membuat pasangan seperti itu sebelum story ini, `renameToken` juga tidak menolaknya, dan impor memilih token pertama. Usul: tolak saat commit (CONFLICT) atau tangani di codegen (epic kode).
- source_spec: `_bmad-output/implementation-artifacts/spec-token-3-theme-panel.md`
  summary: Tombol "Import CSS variables" dan "Copy tokens as CSS" di header panel Theme belum ada.
  evidence: Desain dialog impor dan Copy tokens as CSS ada di bagian 09 Code (wvCMu/ngHGS, w6iQk/SpvBC) dan ticket epic kode story 5 memuatnya ("Copy tokens as CSS di panel Theme; impor CSS variables memakai parser epic token"). Usul: epic kode story 5 menambah kedua tombol di `.theme-header` ThemePanel.tsx (parser `parseCssVariables` @lakar/render + setTokenModes/setTokens lewat route ops).
- source_spec: `_bmad-output/implementation-artifacts/spec-token-3-theme-panel.md`
  summary: Panel Theme tidak bisa menghapus mode, mengubah urutan mode, atau mengganti mode default.
  evidence: Ticket story 3 hanya meminta tambah dan ubah nama mode; desain 07 tidak memuat aksi itu. Usul: menu konteks di header mode (Delete mode / Make default) dengan op setTokenModes + setTokens yang membuang/menggeser `modes` dan update themeMode board.
- source_spec: `_bmad-output/implementation-artifacts/spec-token-3-theme-panel.md`
  summary: Wiring komponen ThemePanel (antrean commit, input sel, popover hapus) tanpa tes otomatis.
  evidence: Viewer belum punya harness tes komponen/DOM (pra-ada); pembangun op dites murni di `themeModel.test.ts` dan alur diverifikasi smoke msedge.
- source_spec: `_bmad-output/implementation-artifacts/spec-token-4-token-picker.md`
  summary: Warna shadow tidak punya Token Picker (slot `shadows.color` ada di tabel slot).
  evidence: Ticket story 4 tidak menyebut efek; baris shadow berupa teks sintaks `drop x y blur` tanpa kotak warna terpisah. Usul: tombol token di swatch shadow dengan `TokenSpec` `['shadows', i, 'color']` (editShadow).
- source_spec: `_bmad-output/implementation-artifacts/spec-token-4-token-picker.md`
  summary: Wiring komponen Token Picker/Token Field (posisi popover, keyboard, status open) tanpa tes otomatis.
  evidence: Viewer belum punya harness tes komponen/DOM (pra-ada); logika saring/pasang/detach/buat dites murni (`tokenPicker.test.ts`) dan lewat core (`tests/token-picker-ops.test.ts`), UI diverifikasi smoke msedge.
- source_spec: `_bmad-output/implementation-artifacts/spec-token-4-token-picker.md`
  summary: Verify ticket story 4 (picker tersaring, canvas berubah sesudah ubah token, Detach) dan jalur DesignPanel → route ops hanya dites di tingkat model/core; UI dan canvas live hanya smoke msedge.
  evidence: Review t4 (intent). Harness komponen/E2E viewer belum ada (pra-ada). Usul: skrip playwright di `scripts/` atau harness DOM yang membuka picker, memasang token, dan membaca gaya computed canvas.
- source_spec: `_bmad-output/implementation-artifacts/spec-komponen-2-schema.md`
  summary: Override atau bind yang menjadi tidak sah karena master disunting menolak commit (SCHEMA_INVALID), bukan diabaikan dan dilaporkan.
  evidence: Review k2 (blind, edge). expandInstances memvalidasi pohon ter-ekspansi dengan skema strict dan commit core memanggil resolveDocument. Keputusan story 2: tetap tolak (AD-1/AD-7); op komponen story 3 menambah reset/buang override yang tidak berlaku atau menjadikannya laporan LC-32.
  resolved: 2026-11-22 di `spec-komponen-3-ops.md` (epic komponen story 3). `expandInstances` kini mengabaikan nilai bind/override yang membuat node efektif tidak sah dan melaporkannya sebagai LC-32, jadi suntingan master tidak pernah ditolak karena override lama. Jalur edit komposit (`update`) tetap memvalidasi node efektif, dan `resetOverride` bisa membersihkan kunci basi.
- source_spec: `_bmad-output/implementation-artifacts/spec-komponen-2-schema.md`
  summary: Canvas viewer dengan instance (mount isi terurai, seleksi alamat komposit, ikon/label Layers instance) belum dites otomatis.
  evidence: Review k2 (intent). Canvas memakai resolveDocument sehingga instance termount; harness DOM/E2E viewer belum ada (pra-ada). Layers memakai ikon cadangan untuk tipe instance; penanda mengikuti desain di story 4.
- source_spec: `_bmad-output/implementation-artifacts/spec-komponen-5-props-slots.md`
  summary: Penanda temuan Checks pada node di dalam isi slot instance tidak tampil karena POST /inspect (route lama) membalas 404 untuk node itu.
  evidence: Review k5 (vgap). Efek penanda temuan di Viewer.tsx memanggil api.inspect untuk setiap node temuan dan menelan error; locateNode di route /inspect hanya menelusuri children (pra-ada sejak isi slot story 3). Usul: kotak penanda dari geometri canvas live (sceneBounds) untuk node inSlotContent, seperti highlight seleksi.
- source_spec: `_bmad-output/implementation-artifacts/spec-kode-2-codegen.md`
  summary: Codegen menulis semua elemen sebagai `div` karena skema v5 belum punya `tag` semantik (AD-1); allowlist tag HTML untuk ekspor belum ada.
  evidence: AD-1 mengizinkan `tag` opsional dari allowlist, tetapi menambah kunci butuh kenaikan schemaVersion (AD-3), pemetaan render/codegen, korpus, dan UI. Usul: story skema berikutnya menambah `tag` (mis. `section|header|nav|main|footer|h1..h6|p|button|a|ul|li`) dan codegen memakainya sebagai nama elemen.
  resolved: 2026-11-23 di `spec-vektor-4-html-import.md` (epic paste-vektor story 4). Skema v7 menambah `tag` (allowlist `HTML_TAGS`) pada frame dan text; codegen menulisnya sebagai nama elemen dengan reset UA (`tagResetDecls`). Kontrol `tag` di panel Design belum ada.
- source_spec: `_bmad-output/implementation-artifacts/spec-kode-4-pixel-parity.md`
  summary: Penemuan driver komponen (probe satu-flip + pewarisan driver kehadiran) belum terbukti lengkap untuk state anak yang hanya berubah oleh kombinasi dua prop gaya parent sekaligus (unverified, medium bila benar).
  evidence: Review c4 (edge, vgap). Tidak ada dokumen konkret yang memicunya; state anak bergantung pada parent hanya lewat layout/gap negatif/scrollY, yang biasanya berubah oleh satu flip. Pemakaian di dokumen tetap benar karena dicek terhadap ekspansi (fallback inline). Penentu: fuzz master acak (≤ 64 kombinasi) yang membandingkan `evalComponent` dengan `expandInstances` untuk semua kombinasi.
- source_spec: `_bmad-output/implementation-artifacts/spec-kode-4-pixel-parity.md`
  summary: Fill `mesh` tidak diekspor codegen (dilewati dengan warning `mesh-fill`), sehingga board ber-mesh di canvas berbeda dari kode; uji paritas membuang mesh dari acuan.
  evidence: Review c4 (intent). Keterbatasan sejak story 2 (README codegen). Usul: ekspor mesh sebagai lapisan gambar data URL (PNG mesh yang sama dengan render) atau `background-image` beraset, lalu hapus `withoutMeshFills` dari tes paritas.
- source_spec: `_bmad-output/implementation-artifacts/spec-kode-5-export-ui.md`
  summary: Impor `tokens.css` ke dokumen yang belum punya token itu tidak selalu mengembalikan nama dan tipe token yang sama (nama bertanda `-` di segmen, mis. `font.line-hero` → `font.line.hero`; px tanpa petunjuk nama, mis. lineHeight → fontSize).
  evidence: `cssVarName` tidak injektif (titik dan `-` sama-sama menjadi `-`), dan CSS variables tidak membawa tipe. Impor ulang ke dokumen asal (atau dokumen yang punya token bernama sama) identik (tests/code-export.test.ts); ke dokumen kosong, mode, variabel, dan nilai per mode sama, dan `tokens.css` hasil ekspor ulang identik byte. Usul: komentar petunjuk `/* lakar: name type */` per variabel di `tokens.css` yang dibaca `parseCssVariables` (mengubah golden codegen).
- source_spec: `_bmad-output/implementation-artifacts/spec-kode-5-export-ui.md`
  summary: Dialog Import CSS variables menampilkan pemetaan selektor → mode sebagai label baca-saja, bukan Select seperti desain wvCMu.
  evidence: Pemetaan mode ditentukan parser spec-token-2 secara deterministik (root = mode default, `[data-theme=x]` = mode x); remap butuh aturan gabung baru di `parseCssVariables` (opsi `modeMap`). Usul: opsi `modeMap` di parser + Select per selektor.
- source_spec: `_bmad-output/implementation-artifacts/spec-kode-5-export-ui.md`
  summary: Wiring komponen dialog Export code, popover Copy tokens, dan dialog Import CSS variables tanpa tes otomatis.
  evidence: Viewer belum punya harness tes komponen/DOM (pra-ada). Logika murni dites (`codeExport.test.ts`, `cssImport.test.ts`, `zip.test.ts`, `tests/code-export.test.ts`); UI diverifikasi smoke msedge.
  partial: 2026-11-23 di `spec-viewer-dom-harness.md`. Dialog Export code dites di `CodeExportDialog.dom.test.tsx` (target, TypeScript, Copy file, Download .zip, Esc). Sisa: popover Copy tokens dan dialog Import CSS variables.
- source_spec: `_bmad-output/implementation-artifacts/spec-kode-5-export-ui.md`
  summary: Instance yang override-nya tidak bisa dinyatakan sebagai prop diekspor sebagai salinan inline (statis) master, bertentangan dengan AD-16 "master bukan salinan statis".
  evidence: Review c5 (intent). Fallback inline story 3 (warning `instance-inlined`); di fixture landing InsLDxB2 (override fill + stroke inside pada akar) di-inline sehingga ubah padding master juga mengubah berkas utama (tests/code-export.test.ts). Usul: override akar seperti stroke `::after` sebagai kelas pemakai, atau props className/style per elemen dalam.
- source_spec: `_bmad-output/implementation-artifacts/spec-vektor-4-html-import.md`
  summary: Wiring viewer paste HTML (Ctrl+V text/html → body `kind:'html'`, report langsung terbuka, Pasted Tag) tanpa tes otomatis.
  evidence: Review v4 (vgap). Hanya `clipboardPaste` dan teks report yang dites murni; `Viewer.tsx` `pasteContent`, `PasteToast`, dan `pastedTag` diverifikasi smoke msedge (pola sama dengan wiring SVG story 3; viewer belum punya harness DOM). Usul: helper murni `pasteBody(pick, parentId)` di `paste.ts` dengan kasus di `paste.test.ts`.
  resolved: 2026-11-23 di `spec-viewer-dom-harness.md`. `Viewer.paste.dom.test.tsx` menguji Ctrl+V HTML (body `kind:'html'` + parent frame terpilih, Paste Report langsung terbuka, node baru terpilih, Pasted Tag), SVG (toast Undo/Details), tanpa seleksi, dan teks biasa.
- source_spec: `_bmad-output/implementation-artifacts/spec-vektor-5-pen-tool.md`
  summary: Wiring Pen tool dan mode edit titik di canvas (routing pointer, keyboard capture, pratinjau DOM, seleksi path baru, grup Point panel Design) tanpa tes otomatis; satu rev per gestur dan Ctrl+Z lewat tumpukan undo jendela hanya diverifikasi smoke msedge.
  evidence: Review v5 (vgap, blind, intent). Viewer belum punya harness tes komponen/DOM (pra-ada, sama dengan story 3–4 dan kode-5). Keputusan op (update/remove/no-op), `pathEditable`, dan koordinat panel sudah murni dan dites (`pathEdit.test.ts`); kontrak route dites `tests/vector-edit.test.ts`. Usul: harness jsdom/RTL untuk `usePathTools` (Esc mempertahankan seleksi, Delete tidak menghapus node, Enter < 2 titik tanpa request, pratinjau dipulihkan saat commit gagal) dan `Canvas` (tap Pen tidak ke `onInsert`, seleksi node baru).
  partial: 2026-11-23 di `spec-viewer-dom-harness.md`. `Canvas.dom.test.tsx` menguji Esc (seleksi tetap), Delete (titik terakhir, bukan node), Enter < 2 titik tanpa request, Enter 2 titik = satu commit `add` path, dan tap Pen tidak ke `onInsert`. Sisa: mode edit titik (pratinjau dipulihkan saat commit gagal, grup Point panel Design), seleksi path baru di Viewer, satu rev per gestur dan Ctrl+Z.
- source_plan: none
  summary: Tinggi board landing mengikuti isi: aturan cek baru untuk ruang kosong di bawah isi board, dan skill `landing` mengambil tinggi akhir dari `bounds` execute alih-alih menebak angka.
  evidence: Dipisah dari `spec-agent-open-doc.md` (2026-11-23, pilihan Fatmuh: kerjakan sesudahnya). Landing `landing-kopi-lereng` menyisakan 24 px kosong di bawah footer (board 4074, isi 4050) karena tinggi board hanya angka tetap dan `landing.md` menyuruh `update(keep.board, {height:…})` dengan angka tebakan.
  resolved: 2026-11-23 di `spec-board-height-fit.md` (#22). LC-12 untuk landing + skill `landing` memakai `bounds`.
- source_plan: none
  summary: Skill desain dari Emil Kowalski untuk agen MCP Lakar: adaptasi `break-ui` (skill opsional review), ringkasan non-animasi `emil-design-eng` ke `ui`/`review`, dan `prototype` untuk alur varian; skill animasi (`animate`, `choreograph`, `review-animations`, `animation-performance`, `learn-taste`) dipasang sebagai skill pengembangan. Atribusi MIT wajib.
  evidence: Diminta Fatmuh 2026-11-23 (aiforui.dev/skills). Rincian dan kendala anggaran skill ada di `research-agent-canvas-references.md` bagian 3. Urutan kerja kedua, sesudah `spec-agent-open-doc.md`.
  resolved: 2026-11-23 di `spec-design-skills-emil.md` (#22).
- source_plan: none
  summary: Efek canvas saat agen bekerja: node baru fade-in (blur + translateY, stagger), label "Generating" dan border warna agen pada board, outline node yang sedang ditulis, cursor per agen dengan nama model, dan baris Activity ala `terminal-chunk-in`; opsional sapuan shimmer ala `g-scan` pen.dev.
  evidence: Diminta Fatmuh 2026-11-23 dengan acuan Paper, pen.dev, dan open-pencil. Angka dan easing ada di `research-agent-canvas-references.md` bagian 2. Wajib desain dulu di `lakar-ui.pen` section 04. Urutan kerja ketiga.
  resolved: 2026-11-23 di `spec-canvas-agent-effects.md` (#21).
- source_spec: `_bmad-output/implementation-artifacts/spec-canvas-agent-effects.md`
  summary: Panel History dan kolom "Last agent" di Dashboard masih menampilkan "MCP agent" karena entri history daemon hanya mencatat `client`, belum field `agent` yang baru.
  evidence: HistoryPanel.tsx:93 dan listColumns.ts:11 membaca `client`. Usul: field `agent` aditif pada entri history/log daemon.
  resolved: 2026-11-23 di `spec-agent-identity-history.md`. Entri riwayat mencatat `agent`; `/viewer/docs` → `lastAgent`, riwayat → `agent`.
- source_spec: `_bmad-output/implementation-artifacts/spec-canvas-agent-effects.md`
  summary: Panel Activity, badge Live, dan History masih memakai dua warna harness, sehingga warna canvas sesi Claude kedua (mis. violet) tidak sama dengan kartu Activity-nya.
  evidence: ActivityPanel.tsx dan live.ts memakai harnessColor; hanya presence canvas dan Layers yang memakai assignAgentColors.
  resolved: 2026-11-23 di `spec-agent-identity-history.md`. Activity, badge Live, dan Connections memakai `liveSessionColors`; History sengaja tetap warna harness.
- source_spec: `_bmad-output/implementation-artifacts/spec-canvas-agent-effects.md`
  summary: Execute pertama sebuah sesi belum mendapat label "Generating" dan lokasi rencana fade karena board tujuannya baru diketahui setelah panggilan selesai.
  evidence: agentPresence butuh lokasi panggilan sebelumnya (aturan spec-app-5: target execute yang sedang berjalan tidak ditebak).
  resolved: 2026-11-23 di `spec-progressive-live-build.md`. Execute pertama → label "✦ Generating · harness" tingkat dokumen (`pendingAgents`, tanpa menebak board); di antara execute, board `[WIP] ` sesi Live tetap berlabel Generating (`building`). Rencana fade tidak butuh lokasi (`fadePlans` sudah lepas dari presence).
- source_spec: `_bmad-output/implementation-artifacts/spec-canvas-agent-effects.md`
  summary: Efek canvas (fade-in, label Generating, exit cursor, entri baris Activity) tanpa tes DOM/komponen; hanya logika murni yang dites.
  evidence: Viewer belum punya harness tes DOM (pra-ada); agentFx.ts dan wiring Canvas/ActivityPanel hanya diperiksa lewat inspeksi dan build.
  resolved: 2026-11-23 di `spec-viewer-dom-harness.md`. `Canvas.dom.test.tsx` (fade-in sesudah buka, tidak saat buka/reconnect/reduced motion, label Generating, exit cursor), `ActivityPanel.dom.test.tsx` dan `Viewer.activity.dom.test.tsx` (entri baris). Tes menemukan bug entri baris Activity (panel kosong, snapshot reconnect), diperbaiki di spec yang sama.
- source_spec: `_bmad-output/implementation-artifacts/spec-board-height-fit.md`
  summary: Tinggi board landing yang benar-benar mengikuti isi (`height:'hug'` pada board) belum ada; tinggi board selalu angka dan board selalu memotong isi.
  evidence: Butuh perubahan skema (v8 + migrasi), renderer, resize viewer, dan codegen. Usul: `height:'hug'` hanya untuk `screen:'landing'`, diukur saat render. Sampai itu ada, LC-12 melaporkan tinggi pas.
  resolved: 2026-11-23 di `spec-board-hug-height.md`. Skema v8 (migrasi identitas) membolehkan `height:'hug'` pada semua board; render mengukur tingginya (`height:auto`), `bounds`/screenshot/export/`list_boards`/`measuredHeight`/`place` memakai ukuran itu, LC-12 tidak menilai tinggi pas board hug, viewer mengikuti tinggi terukur (seret handle bawah = fixed, panel Design Hug/Fixed), codegen menulis `height: auto`. Skill landing membuat board `height:'hug'` dan tidak lagi menaikkan tinggi per seksi.
- source_spec: `_bmad-output/implementation-artifacts/spec-board-height-fit.md`
  summary: LC-12 landing tidak menandai wrapper bertinggi angka tetap yang lebih tinggi dari isinya, karena tak bisa dibedakan dari seksi setinggi penuh (hero 900 pada board 900).
  evidence: Review spec-board-height-fit. Usul: konvensi nama `Halaman` untuk wrapper atau tinggi hug di atas.
- source_spec: `_bmad-output/implementation-artifacts/spec-viewer-collapsible-panels.md`
  summary: Saat sidebar dibuka lewat tombol, toolbar kanvas dan grup Theme/Export baru di-FLIP sesudah panel selesai slide masuk (240ms + 240ms), jadi tidak bergerak bersama panel.
  evidence: Kolom grid sengaja dibuka saat panel mendarat supaya kanvas di-resize sekali tanpa area kosong; perlu feel-check di perangkat sebelum memindahkan resize ke awal expand.
- source_spec: `_bmad-output/implementation-artifacts/spec-viewer-collapsible-panels.md`
  summary: Kompensasi kamera saat tepi kiri kanvas bergeser (lipat/buka sidebar kiri) belum punya tes otomatis.
  evidence: jsdom tidak punya layout dan `ResizeObserver` di-stub di harness DOM; perlu tes Playwright/smoke atau ekstrak ke helper murni.
- source_spec: `_bmad-output/implementation-artifacts/spec-progressive-live-build.md`
  summary: Prelude skill core (±1.500 karakter) diulang di setiap execute; landing per seksi kini 7–9 execute, jadi biaya token keluaran dan waktu tulis LLM naik.
  evidence: `keep` hanya menyimpan nilai, bukan fungsi. Usul: daemon menyimpan prelude terakhir per sesi (mis. `execute({code, prelude:'keep'})` aditif) atau helper prelude bawaan sandbox; butuh keputusan AD-4 dan tes contoh skill.
  resolved: 2026-11-23 di `spec-skeleton-live-build.md`. Helper prelude (C, FONT, R, TY, HEAD, fill, line, F, Row, T, I, Btn, Badge, Skel, Build) kini global bawaan sandbox exec (`packages/exec/src/helpers.ts`); palet arketipe dipulihkan dari `keep.C`/`keep.FONT`. Prelude yang dideklarasi ulang tetap sah (deklarasi leksikal snippet membayangi global). core.md hanya memuat referensi; contoh skill tidak lagi menulis prelude.
- source_spec: `_bmad-output/implementation-artifacts/spec-progressive-live-build.md`
  summary: Board mobile belum bisa dibangun per area karena LC-12 mobile memberi "tinggi pas" pada board `[WIP] ` yang isinya belum lengkap.
  evidence: `packages/check/src/rules.ts` cabang mobile tidak melewati `[WIP] ` (landing melewatinya). Usul: lewati sub-cek tinggi pas mobile untuk `[WIP] `, lalu pecah contoh `mobile.md` menjadi dua execute.
- source_spec: `_bmad-output/implementation-artifacts/spec-progressive-live-build.md`
  summary: Desain Pencil section 04 belum memuat reveal bertahap (cangkang + unit, 600ms/12px/60ms, total ≤ 1,5 dtk) dan chip "Generating" tingkat dokumen untuk execute pertama.
  evidence: C6 (desain dulu) dilewati karena chip memakai komponen label Generating yang sudah ada; angka gerak dicatat di Design Notes spec.
- source_spec: `_bmad-output/implementation-artifacts/spec-progressive-live-build.md`
  summary: Canvas tetap diam selama LLM menulis snippet satu seksi; progres execute belum bisa distream lebih awal.
  evidence: QuickJS < 2 dtk; jeda ada sebelum call tiba di daemon. Event `progress` per op dari sandbox tidak membantu jeda itu; butuh streaming argumen tool dari harness (belum didukung MCP). Lihat Design Notes "Ide ditunda".
- source_spec: `_bmad-output/implementation-artifacts/spec-board-hug-height.md`
  summary: Board `height:'hug'` tumbuh ke bawah, tetapi `place` dan LC-12 hanya mengenal tinggi terukur saat ini; board yang diletakkan tepat di bawah board hug bisa tertabrak saat board hug bertambah seksi.
  evidence: `place(w,'hug')` hanya menjaga tepi atas board baru. Usul: `place` tanpa `near` sudah menaruh board di baris atas (kanan), jadi risiko hanya `near` + "di bawahnya"; bila muncul, beri board hug jarak bawah tak terbatas di `place`.
- source_spec: `_bmad-output/implementation-artifacts/spec-board-hug-height.md`
  summary: Board hug tanpa anak flow bertinggi 0: screenshot board gagal ("tidak bisa dipotret") dan di canvas hanya labelnya yang terlihat.
  evidence: open-pencil menahan frame hug kosong pada ukuran terakhirnya (`heldHugAxes`); Lakar tidak menyimpan ukuran terakhir. Usul: tinggi minimum render untuk board hug kosong, atau simpan tinggi terakhir di catatan daemon.
- source_spec: `_bmad-output/implementation-artifacts/spec-board-hug-height.md`
  summary: Skill mobile tetap memakai `H` angka; board mobile hug belum dipandu karena zona bawah (`Overlay / Tab bar` y `H-98`) absolut terhadap tinggi angka.
  evidence: Hug untuk mobile butuh zona bawah yang menempel ke dasar (mis. `bottom` atau anak flow terakhir). Usul: spec terpisah setelah ada penempatan relatif dasar.
- source_spec: `_bmad-output/implementation-artifacts/spec-skeleton-live-build.md`
  summary: `list_boards`/`inspect` belum melaporkan placeholder skeleton yang tersisa (jumlah `[Skeleton] `); agen baru tahu lewat LC-33 sesudah melepas `[WIP] `.
  evidence: Placeholder hanya konvensi nama. Usul: field aditif `skeletons` per board di `/boards` (AD-4: respons hanya bertambah).
- source_spec: `_bmad-output/implementation-artifacts/spec-skeleton-live-build.md`
  summary: Skill mobile belum dipandu skeleton + satu blok per execute; board mobile tetap satu execute utuh.
  evidence: LC-12 mobile tidak melewati `[WIP] ` (butir progressive-live-build di atas) dan zona bawah absolut di `H-98`. Usul: selesaikan butir LC-12 mobile dulu, lalu `Skel` untuk Header/Kartu/Seksi.
- source_spec: `_bmad-output/implementation-artifacts/spec-skeleton-live-build.md`
  summary: api.md (dibangkitkan dari `api.ts`) belum memuat helper prelude bawaan; referensinya hanya di core.md dan deskripsi tool execute.
  evidence: `renderApiMarkdown` hanya membaca tabel `API` dan `API_GLOBALS` (`keep`, `console`; dites persis). Usul: bagian "Helper bawaan" dari `HELPER_GLOBALS` + regenerasi api.md.
- source_spec: `_bmad-output/implementation-artifacts/spec-skeleton-live-build.md`
  summary: Shimmer skeleton dan Follow berirama belum diperiksa rasa di aplikasi desktop dengan agen nyata (20+ execute kecil); angka 2,4 dtk / 1,2 dtk / 40% dipilih dari riset dan tes DOM.
  evidence: jsdom tanpa layout/animasi nyata; perlu feel-check di perangkat atau rekaman Playwright.
- source_spec: `_bmad-output/implementation-artifacts/spec-skeleton-live-build.md`
  summary: Label placeholder di canvas memakai font sistem/Inter tetap 13px di koordinat board (ikut zoom), tidak diskalakan terbalik seperti label board.
  evidence: Gaya ada di shadow root board yang ditransformasi kamera. Usul: label lewat lapisan overlay canvas bila terlalu kecil saat zoom jauh.- source_spec: `_bmad-output/implementation-artifacts/spec-installer-locked-node.md`
  summary: Installer MSI belum menghentikan `lakar-node.exe` dari direktori instalasi sebelum menyalin file. Hook hanya ada di NSIS.
  evidence: Template WiX Tauri hanya mendukung fragment dan ref. Custom action bisa dimasukkan lewat `componentGroupRefs` ke fragment berisi `CustomAction` + `InstallExecuteSequence`, tetapi MSI terpasang perMachine (Program Files) dan tidak bisa diuji lokal tanpa toolchain WiX. Windows Installer tidak gagal keras: UI menampilkan dialog FilesInUse/Restart Manager ("close applications automatically"), sedangkan mode senyap mengganti file setelah reboot. Usul: fragment `CustomAction` deferred (Impersonate="no") yang menjalankan `stop-lakar.ps1` sebelum `InstallFiles`, plus langkah msiexec di `smoke-installer.mjs`.
- source_spec: `_bmad-output/implementation-artifacts/spec-installer-locked-node.md`
  summary: Connections tidak memberi tahu pengguna Windows bahwa config MCP yang disalin sebelum v0.1.4 masih menunjuk `%LOCALAPPDATA%\Lakar\lakar-node.exe` dan akan terputus saat upgrade.
  evidence: Daemon tidak tahu config apa yang dipakai harness. Usul: catatan rilis v0.1.4 ("copy the MCP config again") atau catatan statis di Connections untuk desktop Windows.

- source_spec: `_bmad-output/implementation-artifacts/spec-check-autofix.md`
  summary: Tombol "Fix" per temuan (dan "Fix all safe") di tab Checks viewer belum ada.
  evidence: UI baru wajib didesain dulu di `design/lakar-ui.pen` lewat Pencil MCP; route `/viewer/fix-check` hanya untuk sesi MCP (dokumen aktif). Usul: route ber-slug `/viewer/docs/:slug/fix-check` (guard Origin) yang mengembalikan `inverse` untuk tumpukan undo viewer, data dari field `fix`/`suggestions` yang sudah ada di temuan.
- source_spec: `_bmad-output/implementation-artifacts/spec-check-autofix.md`
  summary: Fix aman "bulatkan geometri subpiksel" dan "ikat warna mentah yang sama dengan token ke token" (open-pencil `lint_fix`) belum ada karena check tidak punya aturan untuk keduanya.
  evidence: Menambah aturan mengubah output check (AD-4) dan baseline bench. Usul: aturan info baru (mis. LC-34 warna mentah = token, LC-35 geometri pecahan) dengan `fix` aman `{color:{$token}}` / angka bulat, di spec terpisah.
- source_spec: `_bmad-output/implementation-artifacts/spec-check-autofix.md`
  summary: Saran yang menumbuhkan isi (ukuran teks, target sentuh) pada board bertinggi angka yang sudah dipaskan memicu LC-02a; fix_check hanya melaporkannya di `newFindings`.
  evidence: Smoke: `suggestions:true` sesudah tinggi pas 245 → LC-02a 7 px. Usul: fix_check menjalankan putaran kedua LC-12 (tinggi pas naik bila isi melewati tepi bawah board landing non-hug), atau menyarankan `height:'hug'`.
- source_spec: `_bmad-output/implementation-artifacts/spec-check-autofix.md`
  summary: LC-32 (instance basi) belum punya saran `resetOverride`.
  evidence: `instanceIssues` melaporkan `key` override yatim; alamat op `resetOverride` untuk override yang node master-nya hilang perlu diverifikasi terhadap core. Usul: saran `{op:'resetOverride', id:'<instance>/<key>'}` + tes core.
- source_spec: `_bmad-output/implementation-artifacts/spec-check-autofix.md`
  summary: `layout_check`/`execute` tidak menandai baris temuan yang punya fix (output dibekukan AD-4); agen tahu lewat instruksi server dan skill review saja.
  evidence: Usul: satu baris ekor aditif "n temuan punya fix aman → fix_check" di output MCP bila > 0, dengan persetujuan perubahan output.
