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
