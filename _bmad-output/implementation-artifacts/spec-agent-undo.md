---
title: 'Undo/redo agen lewat MCP, hanya langkah sendiri'
type: feature
ticket: ''
created: '2026-11-23'
status: built
baseline_revision: 'c79cad9'
route: quick
risk: medium
review: quick
lenses_ran: [self]
review_loop_iteration: 0
epic: 'loop verifikasi agen'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/research-open-pencil-features-for-lakar/research-open-pencil-features-for-lakar.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-agent-identity-history.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-app-3-history-restore.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-editor-2-ops-route.md'
---

## Intent

**Problem:** Agen tidak bisa membatalkan langkahnya sendiri. Bila execute salah arah, agen harus menulis execute perbaikan yang menebak keadaan sebelumnya. Riset open-pencil (rekomendasi #2, digest `mcp-r1-1` butir 23) menunjukkan pola yang lebih aman: `undo`/`redo` hanya untuk langkah agen, dan menolak bila langkah terbaru dibuat pengguna di editor ("never work around that"). Bug mereka #883 juga perlu dihindari: edit yang masuk saat edit AI masih menunggu ikut masuk ke langkah undo AI itu.

**Approach:** Tool MCP baru `undo {steps?}` dan `redo {steps?}` → route baru `POST /viewer/undo` dan `POST /viewer/redo` (header sesi). Daemon menyimpan tumpukan per sesi per dokumen (kunci id dokumen) di memori. Isinya op invers yang sudah dikembalikan core untuk setiap commit (AD-8, `CommitResult.inverse`), dicatat saat execute atau paste sesi itu meng-commit. Undo menjalankan op invers teratas sebagai transaksi core baru di bawah kunci dokumen: satu langkah menjadi satu rev dengan label riwayat "Undo: <description>". Invers dari commit undo masuk ke tumpukan redo, dan sebaliknya. Gerbang basi cukup satu: `doc.rev` harus sama dengan `head`, yaitu rev terakhir yang ditulis sesi ini. Kalau ada rev lain sesudahnya (pengguna, agen lain, restore), permintaan ditolak `CONFLICT` dengan petunjuk untuk memperbaiki maju lewat execute.

## Boundaries & Constraints

**Always:**
- Semua tulis lewat transaksi core (`transact` + `applyOps`), lalu `store.commit` (riwayat + snapshot) dan `docs.set`. Tidak ada restore snapshot dan tidak ada tulis file langsung.
- Satu langkah undo = satu commit execute/paste sesi itu. Commit pengguna tidak pernah masuk tumpukan agen, sebab tumpukan diisi dari `inverse` transaksi sesi itu sendiri dan edit lain selalu menjadi commit terpisah. Ini menutup bug #883.
- Penolakan bila `doc.rev !== head`, diperiksa di dalam `docLocks.run(slug)`. Edit pengguna yang antre lebih dulu membuat undo ditolak. Edit yang antre sesudahnya diterapkan di atas hasil undo. Tidak ada edit yang tertelan.
- AD-4: route baru di bawah `/viewer/*`. Route, tool, dan respons lama tidak berubah. Respons execute/paste tidak bertambah field. Kode error memakai yang sudah ada (`CONFLICT` 409, `NOT_FOUND` 404, `NO_ACTIVE_DOC`, `SCHEMA_INVALID`).
- Entri riwayat undo/redo membawa `client`/`agent` sesi (`authorOf`), jadi History menampilkan "Undo: …" atas nama harness itu.
- Viewer tetap memakai satu stream `/viewer/events`. Call `undo`/`redo` dipancarkan hook `TOOL_ROUTES` seperti execute, dan viewer memuat ulang lewat `revChange` yang sudah ada.
- Bukan perubahan skema dokumen (tumpukan hanya di memori), jadi `schemaVersion` tetap.

**Never:**
- Membatalkan atau mengulang langkah pengguna atau sesi lain, termasuk "undo sebagian" di sekitar edit pengguna.
- Undo lewat restore rev (AD-8: restore hanya aksi History eksplisit).
- Menyimpan tumpukan ke disk atau memulihkannya untuk sesi baru sesudah restart. Kepemilikan langkah tidak bisa dibuktikan tanpa sesi asal.
- Mengubah tumpukan undo viewer atau route ops viewer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Undo langkah terakhir | Sesi A execute r2, r3; `undo {}` | Rev r4 = isi r2, riwayat "Undo: <label r3>", `undone:[{description, rev:4}]`, `available:{undo:1, redo:1}`; Activity "Undo: …"; viewer memuat ulang | — |
| Redo | Sesudah undo, tanpa rev lain | Rev r5 = isi r3, "Redo: …" | — |
| `steps: N` | N ≤ tersedia | N commit berurutan (N rev), di bawah satu kunci | N > tersedia → `NOT_FOUND` "hanya K langkah", tanpa perubahan; N < 1, N > 50, field asing → `SCHEMA_INVALID` |
| Edit pengguna sesudah langkah agen | A execute r2, pengguna ops r3 | Undo/redo ditolak, dokumen tetap | `CONFLICT`: "pengguna (aplikasi Lakar) mengedit … (rev 3, "Edited in app")", hint perbaiki maju lewat execute |
| Pengguna meng-undo edit-nya sendiri | r3 pengguna, lalu undo viewer r4 | Agen tetap ditolak (rev pengguna) | `CONFLICT` |
| Restore History | Pengguna restore → rev baru | Ditolak | `CONFLICT` |
| Dua agen | A r2, B r3 | Undo A ditolak, menyebut "agen lain (codex-mcp-client)". Undo B jalan (r4). Undo A tetap ditolak (r4 milik B) | `CONFLICT` |
| Rantai putus | A r2, pengguna r3, A r4 | Undo A hanya membatalkan r4. Langkah r2 dibuang saat r4 dicatat (`baseRev ≠ head`), jadi edit pengguna r3 tidak ikut terbatalkan | Undo kedua → `NOT_FOUND` |
| Redo sesudah edit baru | Undo, lalu execute baru sesi yang sama | Redo dikosongkan | `NOT_FOUND`, hint "execute/paste baru mengosongkan redo" |
| Redo sesudah edit pengguna | Undo, lalu pengguna ops | — | `CONFLICT` |
| Lintas dokumen | A execute di `one`, open_doc `other`, undo | Tidak ada langkah di `other` | `NOT_FOUND` "… di dokumen other". open_doc `one` lagi → undo jalan |
| Rename dokumen | Slug berganti, id dokumen sama | Tumpukan tetap (kunci id dokumen); sesi ikut dialihkan `retarget` | — |
| Daemon restart | Sesi lama hilang; MCP membuat sesi baru | Tidak ada langkah | `NOT_FOUND`, hint "sejak daemon berjalan … perbaiki maju" |
| Paste agen | `/viewer/paste` sesi | Satu langkah ("Undo: Paste SVG") | — |
| Snippet baca-saja / commit tanpa efek | `entry === null` / invers kosong | Bukan langkah; commit tanpa efek tetap memajukan `head` | — |
| Tanpa sesi / tanpa dokumen aktif | — | — | 401 / `NO_ACTIVE_DOC` |
| Viewer saat undo agen | Jendela punya entri undo sendiri (paste r2), agen execute r3 lalu undo r4 | Viewer memuat ulang r4 (node agen hilang). Ctrl+Z jendela tetap mengirim invers paste pengguna | Bila invers pengguna basi, toast "Undo skipped" lama (AD-8) |

## Code Map

- `packages/daemon/src/agent-undo.ts` -- baru: `AgentSteps` (WeakMap sesi → id dokumen → `{head, undo, redo}`), `record(...)`, `registerAgentUndoRoutes` (`POST /viewer/undo|redo`), `laterAuthor` untuk pesan penolakan, `AGENT_UNDO_MAX = 50`.
- `packages/daemon/src/server.ts` -- `agentSteps` dibuat sekali. Execute mencatat langkah sesudah `store.commit`, di dalam kunci. Paste menerima `agentSteps`. Route didaftarkan.
- `packages/daemon/src/paste.ts` -- `Actor.session?` + `agentSteps?`: paste sesi agen dicatat di dalam kunci.
- `packages/daemon/src/events.ts` -- `TOOL_ROUTES` `/viewer/undo` → `undo`, `/viewer/redo` → `redo`. `finish` mengisi `description` ("Undo: …" / "Undo N steps") dan `boards`.
- `packages/mcp/src/server.ts` -- satu blok registrasi `undo`/`redo` (`{steps?}`) + satu kalimat di `SERVER_INSTRUCTIONS`.
- `packages/viewer/src/activity.ts` -- `callTitle` untuk `undo`/`redo`. `packages/viewer/src/harnesses.ts` -- `MCP_TOOLS` + `undo`, `redo`.
- `_bmad-output/.../architecture-model-dokumen.md` -- amandemen AD-8 (agen boleh undo langkah sendiri).
- Tes: `packages/daemon/src/agent-undo.test.ts`, `packages/mcp/src/undo.test.ts`, `packages/mcp/src/index.test.ts` (daftar tool), `packages/viewer/src/Viewer.agentUndo.dom.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] Daemon: `AgentSteps` + route undo/redo + pencatatan di execute dan paste agen + event Activity.
- [x] MCP: tool `undo`/`redo` + kalimat instructions.
- [x] Viewer: judul baris Activity, `MCP_TOOLS`. Perilaku reload tidak berubah (revChange).
- [x] Tes daemon (semua baris matriks kecuali rename), MCP, dan DOM viewer.
- [x] Smoke test daemon lokal (msedge): execute → undo → redo → op pengguna → undo ditolak.

**Acceptance Criteria:**
- Given agen meng-execute langkah yang salah dan belum ada edit lain, when agen memanggil `undo`, then dokumen kembali ke isi sebelum langkah itu sebagai rev baru "Undo: …", dan aplikasi menampilkannya live serta di History.
- Given pengguna mengedit sesudah langkah agen, when agen memanggil `undo` atau `redo`, then permintaan ditolak `CONFLICT` dengan hint untuk memeriksa lalu memperbaiki maju lewat execute, dan dokumen tidak berubah.
- Given dua agen di dokumen yang sama, when agen A memanggil undo sesudah agen B meng-commit, then A ditolak. Langkah B tidak pernah dibatalkan A.

## Design Notes

**Keputusan (tanpa checkpoint, atas arahan "decide sensibly"):**
- **Op invers (opsi b), bukan restore rev (opsi a).** Keduanya setara bila syarat "tidak ada rev lain" dipenuhi. Op invers dipilih karena:
  - mematuhi "semua tulis lewat op core" dan AD-8 ("restore hanya untuk History");
  - tidak bergantung pada retensi snapshot (200 rev / 200 MB) atau snapshot r0 (dokumen baru dari `open_doc` ditulis tanpa snapshot);
  - invers core sudah mencakup seluruh dokumen (`pages`, `tokens`, `tokenModes`; komponen ada di `pages`), setara cakupan PR open-pencil #1059;
  - ID node tetap sama sesudah undo/redo, sehingga entri undo viewer tetap valid.
- **Gerbang basi berbasis rev, bukan per node.** Undo ditolak bila ada rev lain apa pun sesudah langkah sesi, walaupun rev itu menyentuh node lain. Aturan ini sederhana, mudah dijelaskan ke agen, dan sejalan dengan open-pencil. Cek per node dicatat sebagai item tunda.
- **Rantai bersambung.** `record` membuang langkah lama bila `baseRev ≠ head`, pola yang sama dengan `CheckLedger`. Karena itu tumpukan selalu berupa rangkaian rev milik sesi ini tanpa sela, dan `doc.rev === head` cukup sebagai bukti untuk N langkah sekaligus.
- **Satu rev per langkah, juga untuk `steps > 1`.** Granularitas redo tetap per langkah, dan History menampilkan setiap pembatalan.
- **Tumpukan per sesi, kunci id dokumen.** Sesi daemon = satu instance server MCP = satu agen. WeakMap mengikuti umur objek sesi. Id dokumen tahan rename. Duplikat dan dokumen yang dibuat ulang mendapat id baru, jadi tidak tercampur.
- **Tanpa render/check** pada commit undo/redo, seperti route ops viewer. Isi yang dipulihkan adalah isi yang sudah pernah lolos commit. Ikon board tersentuh tetap dicek katalog. Ledger check dan tinggi hug mulai baru karena rev berikutnya tidak bersambung.
- **Event.** Lewat hook `TOOL_ROUTES` (call `undo`/`redo` ber-rev), tidak lewat `activity.change`, karena execute agen juga hanya memancarkan call. Viewer memuat ulang semua board karena `revChange` hanya memakai `boards` untuk execute/paste. Undo jarang dipakai, jadi muat ulang penuh dapat diterima.
- **Koherensi viewer.** Tumpukan viewer hanya berisi invers commit jendela itu dan tidak dikosongkan oleh rev luar (AD-8). Undo agen hanya berjalan bila tidak ada commit pengguna sesudah langkah agen. Karena itu undo agen mengembalikan dokumen ke keadaan tempat entri undo pengguna dibuat, dengan ID node sama, sehingga Ctrl+Z pengguna tetap berlaku. Bila invers pengguna tetap basi (mis. agen sebelumnya menghapus target), toast "Undo skipped" yang lama berlaku.
- **Footprint file bersama** (dua spec paralel di epic yang sama): `packages/mcp/src/server.ts` hanya satu blok registrasi + satu kalimat instructions. Komentar kepala "15 tool" sengaja tidak diubah. Skill tidak diubah, karena deskripsi tool dan instructions sudah cukup.

## Review Triage Log

**Self-review (diff):**

| # | Temuan | Verdict | Rute | Bukti |
|---|---|---|---|---|
| 1 | `boards` respons undo kosong bila langkah yang dibatalkan menambah board (board sudah tidak ada sesudah undo) | low | terima | `touchedBoards(before, after)` hanya board yang ada di `after`. Viewer memuat ulang penuh untuk undo, jadi tidak berdampak. Tes disesuaikan |
| 2 | Pencatatan langkah di luar kunci dokumen bisa membuat `head` salah urut | medium | patch (sebelum tes) | `record` dipanggil di dalam `docLocks.run` di execute dan `commitPaste` |
| 3 | AD-8 menyatakan "agen tidak memakai tumpukan undo" | medium | patch | Amandemen AD-8 ditambahkan di spine. Aturan lain AD-8 (invers, tanpa undo sebagian, restore hanya History) tetap |
| 4 | Memori: invers execute besar bisa memuat snapshot subtree, hingga 50 langkah per sesi per dokumen | low | defer | Lihat deferred-work |

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 test` -- expected: hijau kecuali kegagalan khas Windows (AGENTS.md). CI Linux adalah acuan.
- Smoke: `LAKAR_BROWSER_CHANNEL=msedge LAKAR_PORT=<port> LAKAR_DATA_DIR=<tmp> node packages/daemon/dist/main.js`, lalu `/sessions` → `/docs/open` → `/execute` → `/viewer/undo` → `/viewer/redo` → `/viewer/docs/:slug/ops` → `/viewer/undo` (409 CONFLICT).

**Hasil (Windows, 2026-11-23):**
- `build` sukses.
- `test`: typecheck bersih. Tes baru hijau: daemon 8, MCP 3, DOM viewer 1, serta daftar tool MCP. Sisa kegagalan hanya yang khas Windows (foto, SIGTERM/SIGKILL, CRLF skill/api.md, pool.test, render Chromium, bench, sumber C7). Snapshot bench yang ditulis ulang dikembalikan.
- Smoke (dokumen baru dari `open_doc {slug}`, r0 tanpa snapshot):
  - execute r1, undo r2 (board hilang), redo r3 (board kembali, id sama);
  - op pengguna r4;
  - undo → 409 `CONFLICT` "pengguna (aplikasi Lakar) mengedit … (rev 4, "Edited in app")";
  - History: `Undo: …` dan `Redo: …` atas nama `claude-code`.
