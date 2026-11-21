---
title: 'Viewer B slice 2: Activity live dan History'
type: 'feature'
created: '2026-11-21'
status: 'in-progress'
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
- [ ] `packages/daemon/src/events.ts` (baru) -- `ActivityBus` (ring buffer 100, subscribe/unsubscribe) + `registerActivityHooks(app, {sessions, bus})` + route SSE `GET /viewer/events` -- sumber event tanpa menyentuh handler
- [ ] `packages/daemon/src/sessions.ts` -- `peek()` dan iterasi sesi untuk snapshot `hello` -- baca sesi tanpa mengubah `lastAt`
- [ ] `packages/daemon/src/viewer.ts` -- `GET /viewer/docs/:slug/history` (`opCount` dari opsSummary, `client` dari sesi yang masih dikenal) -- riwayat baca-saja
- [ ] `packages/daemon/src/server.ts` -- buat bus, daftarkan hook dan route -- integrasi
- [ ] `packages/daemon/src/events.test.ts` (baru) + kasus history di `viewer.test.ts` -- seluruh baris matrix daemon, dengan RenderPort palsu
- [ ] `packages/viewer/src/activity.ts` (baru) -- klien EventSource (reconnect, backoff) + reducer murni sesi/call per slug -- logika stream yang bisa dites
- [ ] `packages/viewer/src/activity.test.ts` (baru) -- reducer: running→done, warning/error, filter `lakar-viewer`, live/idle, deteksi rev baru
- [ ] `packages/viewer/src/ActivityPanel.tsx`, `HistoryPanel.tsx` (baru), `Viewer.tsx`, `Canvas.tsx`, `app.css`, `icons.tsx` -- UI sesuai desain; Follow agent memfokuskan kamera ke board berubah; garis tepi berdenyut + label agen pada board yang sedang dikerjakan

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

**Manual checks (if no CLI):**
- Jalankan `pnpm lakard`, buka `/app/`, jalankan execute lewat MCP: bandingkan tab Activity dan History dengan frame desain (dark dan light).

## Implementation Notes

## Spec Change Log

## Review Triage Log
