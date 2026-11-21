---
title: 'Viewer B slice 2: Activity live dan History'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: 'dd4e339dfd06f8df695e5952c7fb0694f7e66cd2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/design/README.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-viewer-b-slice-1.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Viewer slice 1 hanya menampilkan dokumen saat dimuat. Pengguna tidak melihat agen sedang memanggil tool apa, board mana yang berubah, atau riwayat revisi; tab Activity dan History masih "Segera hadir".

**Approach:** Tambahkan dua endpoint baca-saja baru di `lakard`: stream SSE `GET /viewer/events` (satu event per tool call: mulai dan selesai) dan `GET /viewer/docs/:slug/history`. Viewer mengisi tab Activity (sesi per klien, Tool Call Row, "Follow agent") dan History (timeline per hari) sesuai `design/lakar-ui.pen` bagian 03, serta memuat ulang dokumen dan PNG board saat rev berubah.

**Keputusan (dari sesi pemberi tugas):** urutan kerja spec → implementasi → review tiga reviewer → PR, tanpa jeda persetujuan manusia; Restore, Compare, dan pratinjau sebelum/sesudah di History tidak termasuk.

## Boundaries & Constraints

**Always:**
- Event dipancarkan dari hook fastify (`preHandler`/`onSend`) di luar handler; route lama, body respons, pesan error, dan tool MCP tidak berubah sedikit pun.
- Event hanya membawa id sesi publik (8 karakter pertama, seperti `/status`), tidak pernah id sesi penuh (id penuh = kredensial header `x-lakar-session`).
- Semua endpoint baru di bawah `/viewer/*`, baca-saja, bentuk respons AD-11 untuk JSON.
- Visual mengikuti frame `Viewer — Desktop — Activity/History — Dark/Light` dan komponen Tool Call Row; `prefers-reduced-motion` dihormati (kamera tidak bergeser animasi).
- Node 26, pnpm, TS strict; test lolos di CI Linux.

**Never:**
- Restore, Compare, sebelum/sesudah, atau aksi tulis apa pun.
- Mengubah `packages/mcp` (nama klien tetap `lakar-mcp`), `apps/desktop`, atau workflow rilis.
- Menampilkan sesi viewer sendiri (`client: 'lakar-viewer'`) di Activity.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sambung stream | `GET /viewer/events` | `text/event-stream`; event `hello` berisi `sessions[]` (id publik, client, activeSlug, createdAt, lastAt, executes) dan `recent[]` (≤100 event terakhir) | N/A |
| Tool call sukses | agen `POST /execute` | event `call` status `running` (callId, session, client, tool `execute`, slug, description), lalu `done` dengan durationMs, rev, created ids, boards tersentuh, jumlah node | N/A |
| Temuan check | execute/layout_check dengan error/warning | status `warning`, summary {error, warning} | N/A |
| Tool call gagal | respons `{ok:false}` | status `error`, code + message | N/A |
| Sesi tidak dikenal / body tidak valid sebelum handler | header salah | tidak ada event `running` tanpa pasangan | N/A |
| Sesi baru | `POST /sessions` sukses | event `session` (id publik, client) | N/A |
| Klien putus | koneksi SSE ditutup | listener dilepas, tidak ada kebocoran | heartbeat `: ping` tiap 15 dtk |
| Riwayat | `GET /viewer/docs/a/history` | `{entries:[{rev, description, opsSummary, opCount, at, session, client?}]}` urut rev turun | N/A |
| Riwayat slug salah | `../x` / slug tanpa dokumen | 400 `SCHEMA_INVALID` / 404 `NOT_FOUND` | AD-11 |
| Rev berubah di viewer | event `done` dengan slug dokumen terbuka dan rev > rev tampil | dokumen dan PNG board tersentuh dimuat ulang | stream putus → reconnect otomatis + muat ulang dokumen |

</frozen-after-approval>

## Code Map

- `packages/daemon/src/server.ts` -- `buildServer`; daftarkan hook event dan route baru di samping `registerViewerRoutes` (L~620). Route POST lama: `/docs/open` open_doc, `/execute`, `/screenshot`, `/boards` list_boards, `/inspect`, `/export`, `/skills/read` read_skill, `/layout-check` layout_check, `/icons/search` icon_search, `/photos/search` photo_search, `/sessions`.
- `packages/daemon/src/sessions.ts` -- `Sessions.require` mengubah `lastAt`; tambah `peek(header)` tanpa efek samping dan `byId`. `Session.client`, `activeSlug`, `executes`.
- `packages/daemon/src/store.ts` -- `readHistory(slug)` (baris rusak dilewati); `HistoryEntry` {rev, sessionId, description, opsSummary `kind×n, …`, at} di `packages/schema/src/nodes.ts:405`.
- `packages/daemon/src/viewer.ts` -- `peekDocument`, `invalidSlug`, `docNotFound`; tambah route history di sini.
- Respons execute: `data.rev`, `data.created[{id}]`, `data.check.boards` (board tersentuh), `data.check.summary`, `data.bounds` (kunci = id node berubah). layout_check: `data.summary`.
- `packages/viewer/src/api.ts` -- `request()`, `api.screenshot` cache per `slug@rev:boardId`; tambah `getHistory` dan modul stream baru.
- `packages/viewer/src/Viewer.tsx` -- `loadDoc(onlyIfChanged)`, tab Activity/History memakai `SoonPanel`; `Canvas.tsx` kamera `cam`/`fitCamera` (tambah fokus ke board).
- `packages/viewer/src/panels.tsx`, `app.css`, `tokens.css`, `icons.tsx` -- pola panel dan token (`--agent`, `--agent-soft`, `--codex`, dst.).

## Tasks & Acceptance

**Execution:**
- [x] `packages/daemon/src/events.ts` (baru) -- `ActivityBus` (ring buffer 100, subscribe/unsubscribe) + `registerActivityHooks(app, {sessions, bus})` + route SSE `GET /viewer/events` -- sumber event tanpa menyentuh handler
- [x] `packages/daemon/src/sessions.ts` -- `peek()` dan iterasi sesi untuk snapshot `hello` -- baca sesi tanpa mengubah `lastAt`
- [x] `packages/daemon/src/viewer.ts` -- `GET /viewer/docs/:slug/history` (`opCount` dari opsSummary, `client` dari sesi yang masih dikenal) -- riwayat baca-saja
- [x] `packages/daemon/src/server.ts` -- buat bus, daftarkan hook dan route -- integrasi
- [x] `packages/daemon/src/events.test.ts` (baru) + kasus history di `viewer.test.ts` -- seluruh baris matrix daemon, dengan RenderPort palsu
- [x] `packages/viewer/src/activity.ts` (baru) -- klien EventSource (reconnect, backoff) + reducer murni sesi/call per slug -- logika stream yang bisa dites
- [x] `packages/viewer/src/activity.test.ts` (baru) -- reducer: running→done, warning/error, filter `lakar-viewer`, live/idle, deteksi rev baru
- [x] `packages/viewer/src/ActivityPanel.tsx`, `HistoryPanel.tsx` (baru), `Viewer.tsx`, `Canvas.tsx`, `app.css`, `icons.tsx` -- UI sesuai desain; Follow agent memfokuskan kamera ke board berubah; garis tepi berdenyut + label agen pada board yang sedang dikerjakan

**Acceptance Criteria:**
- Given Viewer dokumen `a` terbuka dan agen menjalankan execute pada `a`, when execute selesai, then baris Tool Call berubah running → done/warning, dokumen dan PNG board tersentuh dimuat ulang tanpa refresh halaman.
- Given "Follow agent" aktif, when execute mengubah board di halaman lain atau di luar layar, then viewer pindah halaman dan kamera bergeser ke board itu.
- Given tab History, when dibuka, then entri dikelompokkan per hari (Today/Yesterday/tanggal) dengan rev, deskripsi, opsSummary, dan badge Current pada rev terbaru.
- Given suite penuh, when `pnpm build && pnpm test` di CI, then lolos tanpa mengubah test lama.

## Design Notes

- Nama harness: `POST /sessions` dari `packages/mcp` selalu `client: 'lakar-mcp'`, jadi viewer menampilkan label dari pola client (`claude` → Claude Code, `codex` → Codex, `lakar-mcp` → "MCP agent", lainnya apa adanya). Mengirim `clientInfo` MCP sebagai client dicatat di deferred-work.
- Live = ada call running atau call terakhir < 60 dtk; selain itu Idle "last call Xm ago". Disconnected tidak bisa diketahui daemon (sesi tidak pernah ditutup), jadi tidak dipakai.
- Panel "Agent sees your selection" tidak ditampilkan (butuh R10, di luar scope).

## Verification

**Commands:**
- `pnpm build` -- expected: tsc dan Vite build sukses
- `pnpm exec vitest run packages/daemon/src/events.test.ts packages/daemon/src/viewer.test.ts packages/viewer` -- expected: lolos
- `pnpm test --testTimeout=30000` (dengan `LAKAR_C7_ALLOW_MISSING_SOURCES=1`) -- expected: lolos di CI Linux

- Lingkungan Windows lokal: taruh Node 26 (fnm) di awal PATH; ~100 test lama gagal hanya di Windows (fsync EPERM, URL `d:`, CRLF), jadi nilai test baru dan yang terdampak saja; CI Linux sumber kebenaran.

**Manual checks (if no CLI):**
- Jalankan `pnpm lakard`, buka `/app/`, jalankan execute lewat MCP: bandingkan tab Activity dan History dengan frame desain (dark dan light).

## Implementation Notes

- 2026-11-21: Implementasi oleh subagen dari spec. Hook di `packages/daemon/src/events.ts` (`preHandler` membuat event `running` hanya bila sesi dikenal lewat `Sessions.peek`; `onSend` menutupnya dari body AD-11; `onResponse` menutup sisa sebagai error bila koneksi putus). Hook didaftarkan sebelum route di `buildServer` supaya berlaku untuk semua route tool. SSE memakai `reply.hijack()`; stream terbuka ditutup di hook `preClose` supaya `app.close()` tidak menggantung.
- Event `call` membawa `seq` (urutan bus) agar reducer viewer mengabaikan duplikat; field tambahan `target` (id node/board, nama skill, query) untuk judul baris (`Inspect Headline`, `Load webapp skill`). `summary` hanya `{error, warning}`.
- Sesi `lakar-viewer` disaring di daemon (tidak dipancarkan, tidak masuk `hello`) selain di reducer: tanpa itu screenshot/inspect/layout_check viewer membanjiri ring buffer 100.
- History: `session` = 8 karakter pertama `sessionId` (file riwayat menyimpan id penuh); `opCount` = jumlah `×n` di `opsSummary`. Route menolak slug tanpa file/salinan memori dengan 404 tanpa membuat apa pun.
- Viewer: `api.screenshot` mengingat PNG terbaru per board dengan rev render-nya; Canvas memberi tiap board `rev` terakhir ia tersentuh (`check.boards` dari event execute), jadi saat rev naik hanya board tersentuh yang dirender ulang. Reconnect / tab aktif lagi → muat ulang penuh. Tab default Viewer kini Activity (frame desain pertama). `SoonPanel` dihapus.
- Follow agent (default aktif, disimpan di localStorage): pindah halaman bila board di halaman lain, lalu geser kamera 500ms ease-out hanya bila board belum terlihat utuh; `prefers-reduced-motion` → kamera melompat. Garis tepi agen: board dari call terakhir tiap sesi Live; berdenyut (1.6s) saat ada call running, solid saat reduced motion.
- Verifikasi lokal Windows: `pnpm build` dan `tsc -p tsconfig.test.json` lolos; `activity.test.ts`, `api.test.ts`, `viewer.test.ts` lolos. Empat test `events.test.ts` yang menjalankan execute gagal di Windows hanya karena fsync EPERM di `DocStore.commit` (kegagalan lama yang sama dengan `index.test.ts`); dengan fsync di-shim sementara (dikembalikan) seluruh 15 test lolos. Cek manual dengan lakard (port 7499, fsync di-shim di dist, lalu dibangun ulang bersih): Activity running → done/warning, reload rev + PNG hanya board baru, Follow agent menggeser ke board jauh, History per hari dengan badge Current, light/dark, reconnect setelah daemon restart.

## Spec Change Log

## Review Triage Log

Review pass 1 (2026-11-21): blind hunter, edge case hunter, verification gap. Tidak ada intent_gap/bad_spec; patch dikirim ke subagen implementasi.

| # | Sumber | Temuan | Verdict | Bukti / route |
|---|---|---|---|---|
| 1 | blind | `onSend` mem-parse JSON setiap respons, termasuk PNG base64 `/screenshot`/`/export` | medium | `events.ts` onSend parse semua payload; PNG multi-MB di-decode ulang tiap screenshot agen. Patch: tanpa parse untuk screenshot/export |
| 2 | blind | Export tidak pernah dapat board (`data.boardId` tidak ada di respons `/export`) | low | `/export` mengembalikan `{path,id,...}`. Patch: hapus cabang mati |
| 3 | blind, edge | Board di luar `check.boards` (token, komponen, `boards: []`) tetap PNG lama | false | `touchedBoards` (`packages/check/src/touched.ts:10`) membandingkan JSON board ter-resolve, jadi perubahan token/visual apa pun ikut tersentuh; `boards: []` berarti tidak ada board yang berubah tampilan |
| 4 | blind, edge (claim) | Outline berdenyut di board call sebelumnya saat execute running | medium | `agents` memo memilih call terakhir yang punya board; call running belum punya board. Patch: tanpa outline selama call terbaru running tanpa board |
| 5 | blind, vg | Cache `#latest` dipakai ulang bila rev dokumen turun (restore, slug dibuat ulang) | low | Nyata hanya bila file diubah di luar daemon atau dihapus lalu dibuat ulang; perbaikan butuh doc id di kunci cache. Defer |
| 6 | blind | Tipe event disalin manual ke viewer | low | Drift mungkin, tapi tidak ada kerugian bernama sekarang; perbaikan menambah paket/kontrak. Ditolak |
| 7 | blind, vg | `#latest` reuse tanpa test | gap | `api.test.ts` hanya rev naik. Patch: test reuse dan bypass |
| 8 | blind, vg | `dayLabel`/`groupByDay` tanpa test | gap | Tidak ada import di test mana pun. Patch: test dengan `now` tetap |
| 9 | blind, vg | Hook `onResponse` tidak pernah dijalankan test | gap | Semua jalur lewat onSend. Defer (butuh abort socket nyata) |
| 10 | vg | Wiring Viewer (touched, reload penuh/parsial, Follow) tanpa test otomatis | gap | Repo belum punya harness test komponen React. Defer |
| 11 | blind | Test `app.close()` tanpa assertion; test "bus mati" tidak membandingkan | low | Benar dari isi test. Patch: assert stream berakhir; ganti nama test |
| 12 | blind | History tanpa limit/paging, diambil ulang tiap rev | low | ~200 B per entri; terasa hanya pada dokumen ribuan rev. Defer |
| 13 | blind, edge | SSE mengabaikan backpressure | low | Klien loopback, EventSource membaca terus; perbaikan menambah logika buffer. Ditolak |
| 14 | blind | `EXEC_ERROR` dan pesan Indonesia untuk koneksi putus | low | Pesan daemon memang berbahasa Indonesia; jarang terlihat. Ditolak |
| 15 | blind | Path lokal pengguna di Verification spec | low | Perbaikan mengedit spec. Ditolak sebagai temuan; baris dirapikan saat presentasi |
| 16 | blind | Judul "LIVE SESSIONS" selalu; jumlah call terpotong; tanpa EventSource; label bertumpuk | low | Judul sesuai desain; `executes` hanya menghitung execute; EventSource ada di semua browser target. Ditolak (tumpukan label → #19) |
| 17 | edge | History 500 bila baris tanpa `sessionId` string | low | `isHistoryEntry` (`store.ts:47`) hanya cek rev/opsSummary. Patch: lewati entri tidak lengkap |
| 18 | edge, edge (claim) | Muat penuh menghapus `touched` rev lebih baru; `getDoc` tumpang tindih meregresi rev | low | Balapan nyata tapi sempit; perbaikan satu guard. Patch |
| 19 | edge | Key outline agen duplikat untuk dua sesi berlabel sama | low | Dua `lakar-mcp` → label sama "MCP agent". Patch: id sesi di key |
| 20 | edge | Key grup hari History duplikat bila `at` tidak monoton | low | `groupByDay` hanya menggabung berurutan. Patch: key indeks |
| 21 | edge | Refetch History gagal tampil diam-diam | low | Data lama tetap benar sampai rev itu; banner offline global tetap muncul. Ditolak |
| 22 | edge | Koneksi half-open tanpa watchdog | low | Butuh timer tambahan; jarang di loopback. Ditolak |
| 23 | edge | `executes` lokal naik untuk SCHEMA_INVALID sebelum kode diketahui | low | Dikoreksi `hello` berikutnya; hanya angka kecil. Ditolak |

Verifikasi setelah patch (orkestrator): `pnpm build` dan `tsc -p tsconfig.test.json` lolos; `events.test.ts`, `viewer.test.ts`, dan `packages/viewer` 59/63 di Windows, sisa 4 test execute gagal hanya karena fsync EPERM dan 15/15 lolos dengan shim fsync sementara di luar repo. CI Linux menjadi penentu.
