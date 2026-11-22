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
