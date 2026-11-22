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
- source_spec: `_bmad-output/implementation-artifacts/spec-app-12-splash-theme.md`
  summary: Belum terverifikasi di build release bahwa tema native jendela (Light/Dark dari Settings) diteruskan ke `prefers-color-scheme` layar mulai, terutama di Linux (WebKitGTK mengikuti preferensi gelap GTK).
  evidence: maybe-false. Windows dan macOS didukung lewat jalur Tauri yang terdokumentasi (`window.theme()` saat membuat WebView2, NSAppearance). Bila Linux tidak ikut, tambahkan atribut `data-theme` di layar mulai dari nilai tema yang disuntikkan Rust.
