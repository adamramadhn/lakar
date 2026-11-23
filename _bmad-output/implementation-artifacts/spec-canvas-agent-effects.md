---
title: 'Efek canvas saat agen bekerja'
type: feature
ticket: ''
created: '2026-11-23'
status: built
baseline_revision: '32c93848cccc2f10580ef4facdb3dd5b364f9b76'
route: full
route_source: pinned
risk: low
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/research-agent-canvas-references.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-app-5-agent-presence.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Saat agen bekerja, canvas hanya menampilkan outline putus-putus dan kursor satu warna per harness. Node baru muncul tiba-tiba, board yang sedang dikerjakan tidak diberi label, dua sesi Claude Code berwarna sama, dan nama agen selalu "MCP agent" karena daemon hanya tahu klien `lakar-mcp`.

**Approach:** Efek gaya Paper/pen.dev (riset bagian 2, "Arah untuk Lakar" 1–5) dibangun di atas kehadiran agen yang sudah ada (`presence.ts`). Identitas agen ditambahkan sebagai field opsional `agent` pada sesi dan call (AD-4, aditif), diambil dari `clientInfo` MCP. Warna per sesi agen dipilih deterministik dari palet kecil. Desain dibuat dulu di `design/lakar-ui.pen` section 04 (baris "Agents at work · canvas effects" + tabel Motion spec).

## Boundaries & Constraints

**Always:**
- AD-4: route, tool, dan field lama tetap. `agent` hanya field baru opsional di `ActivitySession`/`ActivityCall`. Daemon menerimanya lewat header `x-lakar-agent` saat `POST /sessions` (header tidak dikenal diabaikan daemon lama, jadi `SessionBody` `.strict()` tidak berubah).
- Viewer: satu stream `/viewer/events` lewat `activityHub`; tanpa dependensi ke core/exec/icons.
- Hanya `opacity`, `transform`/`translate`, dan `filter` yang dianimasikan. Animasi node baru memakai Web Animations API pada elemen di shadow root board (tanpa menyuntik CSS, tanpa mengubah dokumen). Maks 12 elemen per execute, hanya node teratas (anak dari node yang juga baru tidak dianimasikan sendiri).
- Fade-in hanya untuk node yang dibuat execute agen yang selesai sesudah canvas dibuka (−1 dtk toleransi). Tidak saat dokumen dibuka, reconnect, atau edit pengguna (sesi viewer tidak masuk Activity).
- `prefers-reduced-motion`: tanpa fade/blur/rise, tanpa sapuan scan, kursor muncul/hilang tanpa skala dan melompat.
- Spec dan komentar berbahasa Indonesia; teks UI berbahasa Inggris.

**Never:**
- Menebak model LLM. MCP `clientInfo` hanya memberi nama + versi harness; pil kursor menampilkan nama harness ("Claude Code", "Codex", "Gemini CLI", atau nama mentah).
- Mengubah skema dokumen, route lama, atau perilaku outline "Just changed" yang sudah ada.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Identitas agen | Claude Code memanggil tool pertama | Sesi baru dengan header `x-lakar-agent: claude-code`; event `session` dan `call` membawa `agent:'claude-code'`; label "Claude Code" | Header kosong/tidak valid → tanpa `agent`, label lama |
| Klien lama | `POST /sessions` tanpa header | Respons dan event sama seperti dulu | — |
| Dua sesi Claude Code | Dua sesi Live di dokumen yang sama | Sesi lebih tua oranye (`agent`), sesi kedua warna bebas berikutnya | Palet habis → warna pilihan harness |
| Board dikerjakan | Execute berjalan, lokasi terakhir di board B | Label "✦ Generating · {nama B}" warna agen menggantikan label board; border solid 2px + sapuan scan | Tanpa lokasi (execute pertama) → tanpa label |
| Node baru | Execute selesai membuat `[card, card/title]`, board di-mount ulang rev ≥ rev execute | `card` fade-in 500ms cubic-bezier(.16,1,.3,1), blur 4px→0, naik 10px; `card/title` ikut induknya; stagger 60ms | Id tidak ada di DOM → dilewati |
| Dokumen dibuka | Hello berisi execute 3 dtk lalu | Tidak ada fade-in (selesai sebelum canvas dibuka) | — |
| Kursor muncul/hilang | Sesi menjadi Live / tidak Live | Reveal scale 0.5→1 + opacity 180ms; exit kebalikannya, elemen dilepas sesudah 180ms | Reduced motion → langsung |
| Activity | Call baru tiba saat panel terbuka | Baris masuk `terminal-chunk-in` 600ms | Baris yang sudah ada saat panel dibuka tidak dianimasikan |

</frozen-after-approval>

## Code Map

- `packages/mcp/src/client.ts` -- `DaemonClient` (constructor :35, `#request` :39, `#session` :87). Tambah opsi `agent: () => {name, version?} | undefined`, dikirim sebagai header `x-lakar-agent` (nama saja) hanya pada `POST /sessions`.
- `packages/mcp/src/server.ts:346` -- `createLakarMcpServer`: `server.server.getClientVersion()` sebagai sumber `agent`.
- `packages/daemon/src/sessions.ts:94` -- `create(client, agent?)`; `Session.agent?`.
- `packages/daemon/src/server.ts:352` -- route `/sessions`: baca header lewat `agentOf()` (events.ts).
- `packages/daemon/src/events.ts` -- `agentOf(headers)` (ASCII tampak, ≤ 64), `ActivitySession.agent`, `ActivityCall.agent` (preHandler), `sessionSnapshot`.
- `packages/viewer/src/activity.ts` -- salin field `agent`; `whoOf(x)` = `agent ?? client`; reducer menyalin `agent` dari call ke sesi; `harnessLabel` mengenal gemini/cursor.
- Pemakai `harnessLabel/harnessColor(session.client)` → `whoOf(...)`: `ActivityPanel.tsx`, `presence.ts`, `liveChanges.ts:120`, `live.ts`, `Viewer.tsx:571`.
- `packages/viewer/src/presence.ts` -- `color` jadi `AgentColor` dari `assignAgentColors` (sesi Live saja); `fadePlans(views)` = rencana fade dari execute terbaru per sesi (created tanpa filter indeks, karena dokumen belum dimuat ulang saat event tiba).
- Baru `packages/viewer/src/agentEffects.ts` (+ test) -- murni: `AGENT_COLORS`, `assignAgentColors`, `topmost`, `staggerDelay`, `FadeQueue` (offer/take per board+rev, sekali per kunci), `withExiting` (kursor keluar), `generatingBoards`, `freshRows`.
- Baru `packages/viewer/src/agentFx.ts` -- DOM: `animateFadeIn(host, ids, reduced)` via `element.animate` (opacity → nilai komputasi, `translate`, `filter` hanya bila elemen tanpa filter).
- `packages/viewer/src/Canvas.tsx` -- `AgentLayer` (:167): label Generating, border working solid + scan, kursor reveal/exit, glide 180ms easeOutCubic (:105 `GLIDE_MS`); `BoardLive.onMounted` dibungkus untuk `FadeQueue.take`; label board (:856) disembunyikan saat Generating.
- `packages/viewer/src/ActivityPanel.tsx` -- kelas `chunk-in` untuk callId yang belum ada saat panel mount.
- `packages/viewer/src/app.css` + `tokens.css` -- token `--agent-violet/-emerald/-pink`; kelas warna; `.agent-generating`, scan, `@keyframes agent-cursor-in/out`, `terminal-chunk-in`; blok reduced-motion.

## Tasks & Acceptance

**Execution:**
- [x] `design/lakar-ui.pen` -- frame section 04 (lewat MCP Pencil) -- C6 desain dulu.
- [x] `packages/mcp/src/client.ts`, `server.ts`, `packages/daemon/src/{events,sessions,server}.ts` + tes -- field `agent`.
- [x] `packages/viewer/src/{activity,agentEffects,agentFx,presence,live,liveChanges}.ts`, `agentEffects.test.ts` -- logika murni + DOM helper (tes presence per agen ikut di `agentEffects.test.ts`).
- [x] `packages/viewer/src/{Canvas,ActivityPanel,Viewer}.tsx`, `app.css`, `tokens.css` -- efek.

**Acceptance Criteria:**
- Given Claude Code dan Codex bekerja di dokumen yang terbuka, when keduanya menjalankan execute, then masing-masing punya kursor dengan pil nama dan warna berbeda, dan board yang dikerjakan berlabel "✦ Generating · nama".
- Given agen membuat node baru, when board di-mount ulang, then node itu muncul dengan fade + blur + naik bertahap; membuka dokumen yang sama tidak memutar efek itu.
- Given `prefers-reduced-motion: reduce`, when efek di atas terjadi, then tidak ada fade, blur, scan, atau skala.

## Implementation Notes

- **Penyimpangan workflow:** implementasi dikerjakan langsung oleh agen yang menjalankan `bmad-build` (bukan subagen baru), karena konteks investigasi sudah lengkap; checkpoint 1 dilewati atas permintaan Fatmuh ("proceed directly with all specs").
- Header hanya membawa nama harness; versi `clientInfo` tidak dikirim (belum ada pemakai). `agentHeader()` (mcp) membuang karakter non-ASCII dan memangkas ke 64; `agentOf()` (daemon) memvalidasi ulang.
- Rencana fade dipisah dari `agentPresence` menjadi `fadePlans(views)`: presence butuh lokasi di indeks dokumen, padahal event execute tiba sebelum dokumen termuat ulang (execute pertama sesi tidak punya lokasi).
- `FadeQueue` menyimpan `since` = saat Canvas dibuat (per halaman); execute yang selesai > 1 dtk sebelumnya tidak diputar. Rencana diputar saat `BoardLive` memanggil `onMounted` dari rev ≥ rev execute, sekali per board per execute; DOM (`agentFx.ts`) memilih id yang ada di board itu dan node teratasnya.
- Saat board dikerjakan, outline working kini solid tanpa denyut (menggantikan denyut putus-putus app-5); idle tetap putus-putus 0.45. Sapuan scan = pita gradien dengan garis 1px di ujung, `translateX` 3 dtk linear.
- `AgentLayer` kini dirender juga saat presence kosong supaya kursor terakhir bisa beranimasi keluar.
- Tanda Layers memakai warna sesi (`layer-row.violet` dst.). Panel Activity, badge Live Dashboard, dan Settings → Connections tetap memakai warna harness (`harnessColor`), dengan nama harness dari `agent`. History dan kolom Last agent Dashboard masih membaca `client` dari riwayat daemon (tanpa `agent`), jadi tetap "MCP agent" (ditunda).
- Sesudah review: warna hanya dibagi antar-sesi Live, tabrakan memakai warna tambahan dulu (sesi Claude kedua violet, bukan biru Codex); `FadeQueue.take` mengembalikan kelompok per execute; `prime()` + `fadeEpoch` (Viewer menaikkannya setiap stream tersambung) membuat snapshot `hello` tidak memutar fade; baris Activity baru dihitung di tingkat panel (kartu sesi baru ikut beranimasi).
- Baris Activity `chunk-in` hanya untuk callId yang belum ada saat kartu sesi terbuka (kartu tertutup menyegarkan daftar yang dianggap lama).
- Tes: `packages/viewer/src/agentEffects.test.ts` (warna, topmost, stagger, FadeQueue, fadePlans, presence dua agen, withExiting), `packages/daemon/src/agent-identity.test.ts`, `packages/mcp/src/agent-header.test.ts`.

## Plan Change Log

## Review Triage Log

**Pass 1 (quick):** medium 3, low 3, ditolak 1 (edit plan), defer 1.

| # | Temuan | Verdict | Rute | Bukti |
|---|---|---|---|---|
| 1 | Warna dibagi ke semua sesi dokumen termasuk yang idle; sesi Claude kedua tampak biru Codex | medium | patch | `presence.ts` memakai `views` tanpa saring `live`; `assignAgentColors` memilih `codex` sebagai warna bebas pertama. Diperbaiki: saring Live, tabrakan → `EXTRA` dulu; tes baru |
| 2 | History dan kolom Last agent Dashboard tetap "MCP agent"; Implementation Notes mengklaim sebaliknya | medium | defer (+ catatan dibetulkan) | `HistoryPanel.tsx:93`, `listColumns.ts:11` membaca `client` dari riwayat daemon yang tidak menyimpan `agent`; perbaikan butuh field baru di entri riwayat daemon |
| 3 | Kartu sesi baru tidak menganimasikan baris pertamanya | low | patch | `seen` diambil saat kartu mount; kini himpunan call lama dipegang panel (diisi selama belum tersambung) |
| 4 | Fade bisa diputar sesudah reconnect (execute selesai saat stream putus) | medium | patch | `FadeQueue.since` = mount Canvas; `hello` membawa kunci baru. Kini `fadeEpoch` + `prime()` |
| 5 | Batas 12 berlaku per mount board, bukan per execute | low | patch | `take` menggabung id semua rencana; kini kelompok per execute, `animateFadeIn` per kelompok |
| 6 | Doc comment `harnessLabel` terlepas | low | patch | komentar lama berada di atas `whoOf` |
| 7 | Spec: checkbox, `presence.test.ts`, Code Map `fade?` tidak sinkron | low | ditolak (perbaikan = edit plan) | dibetulkan saat menandai `built` |

## Design Notes

**Desain Pencil (C6).** Section 04 `TA3p7` mendapat baris `GRlb7` "Agents at work · canvas effects" dengan empat frame: Generating (`rsqhq`), Two agents (`yJjIC`), New nodes fade in keyframes 0/120/260/500ms (`Bixy3`), Activity row enters (`ecjW1`). Tabel Motion spec (`WHm4A`) diperbarui: glide kursor 400ms → 180ms `cubic-bezier(.33,1,.68,1)` (mengikuti open-pencil), plus baris Cursor reveal/exit, Generating label, Board scan, Agent new nodes, Activity row. Variabel warna baru: `agent-violet #8B5CF6`, `agent-emerald #10B981`, `agent-pink #EC4899`.

**Keputusan (tanpa checkpoint; Fatmuh meminta semua spec dijalankan langsung):**
- Identitas lewat header, bukan field body `/sessions`: `SessionBody` `.strict()` akan menolak field baru di daemon lama dengan BAD_INPUT sebelum pesan VERSION_MISMATCH yang jelas.
- Warna per sesi, bukan per harness saja: harness tetap memberi warna pilihan (Claude → oranye, Codex → biru), tabrakan digeser ke warna bebas berikutnya dalam urutan `createdAt`. Panel Activity/Dashboard tetap memakai dua warna harness lama (ditunda).
- Fade-in memakai `translate` (properti individual) supaya tidak menimpa `transform` rotasi node; opacity dianimasikan ke nilai komputasi elemen.
- Durasi fade 500ms, rise 10px, blur 4px, stagger 60ms (rentang riset 300–650ms, 4–14px).

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 test` -- expected: hijau kecuali kegagalan khas Windows (AGENTS.md); CI Linux acuan.
