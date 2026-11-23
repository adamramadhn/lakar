---
title: 'Identitas agen di History dan warna sesi di Activity'
type: fix
ticket: ''
created: '2026-11-23'
status: built
baseline_revision: 'e6e7275'
route: quick
risk: low
review: quick
lenses_ran: [self]
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-canvas-agent-effects.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-app-11-list-columns.md'
---

## Intent

**Problem:** Dua item tunda dari `spec-canvas-agent-effects.md`. (1) Panel History, kolom "Last agent" Dashboard, dan keterangan header file tetap menampilkan "MCP agent", karena entri riwayat daemon hanya mencatat `client` (`lakar-mcp`), bukan `agent` (harness dari header `x-lakar-agent`). (2) Panel Activity, badge Live Dashboard, dan Settings → Connections memakai `harnessColor` (dua warna), sedangkan kursor canvas dan Layers memakai `assignAgentColors` per sesi Live. Sesi Claude Code kedua violet di canvas tetapi oranye di Activity.

**Approach:** (1) Field opsional `agent` di entri riwayat (`HistoryEntry`, `*.history.jsonl`) ditulis oleh execute dan paste agen. Daemon menambahkan `agent` di `GET /viewer/docs/:slug/history` dan `lastAgent` di `GET /viewer/docs` (AD-4, aditif). Viewer memakai `agent ?? client` untuk label. (2) Satu fungsi `liveSessionColors(views)` (warna sesi Live per dokumen) dipakai presence canvas, panel Activity, badge Live, dan Connections. Sesi tanpa warna Live memakai warna pilihan harness (`preferredColor`).

## Boundaries & Constraints

**Always:**
- AD-4: route dan field lama tetap. `agent` dan `lastAgent` hanya field opsional baru. Entri riwayat lama tanpa `agent` tetap terbaca (`isHistoryEntry` hanya memeriksa `rev`/`opsSummary`), dan respons untuk entri itu sama seperti dulu.
- `agent` dari disk divalidasi ulang dengan pola header (`isAgentName`: ASCII tampak, ≤ 64). Nilai rusak diabaikan, bukan error.
- Entri aplikasi (`lakar-viewer`) tidak pernah punya `agent`; label "You" tidak berubah.
- Viewer tetap satu stream `/viewer/events` (warna diturunkan dari `ActivityState` yang sama); tanpa dependensi baru ke core/exec/icons.
- Bukan perubahan skema dokumen: riwayat bukan bagian `LakarDocument`, jadi `schemaVersion` tidak naik.

**Never:**
- Menebak harness untuk entri lama yang sesinya sudah hilang (tetap "MCP agent").
- Memberi entri History warna sesi Live.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Execute agen ber-header | Sesi `x-lakar-agent: claude-code` execute | Entri jsonl `{client:'lakar-mcp', agent:'claude-code'}`; History "Claude Code"; Last agent "Claude Code"; header file "Updated … by Claude Code" | — |
| Klien tanpa header | Sesi tanpa `x-lakar-agent` | Entri tanpa `agent`; respons sama seperti dulu ("MCP agent") | — |
| Paste agen | `POST /viewer/paste` sesi ber-agent | Entri riwayat membawa `agent` | — |
| Restart daemon | Sesi hilang, riwayat di disk | `agent`/`lastAgent` tetap dari entri | Entri lama tanpa `agent` → tanpa field |
| `agent` rusak di disk | `agent: 42`, spasi di ujung, > 64 | Diabaikan (tanpa `agent`) | Tidak error |
| Entri lama, sesi masih hidup | Entri tanpa `agent`, sesi dikenal | `agent` dari sesi (sama dengan fallback `client`) | — |
| Dua sesi Claude Live di dokumen A | Sesi lebih tua + sesi baru | Canvas, kartu Activity, badge Live, Connections: oranye + violet | — |
| Sesi idle | Tidak Live | Activity: ikon idle; Connections: warna pilihan harness | — |
| History | Entri sesi mana pun | Warna harness (`harnessColor`: oranye/biru) | — |

## Code Map

- `packages/schema/src/nodes.ts` -- `HistoryEntry.agent?`.
- `packages/daemon/src/events.ts` -- `isAgentName` (pola header yang sama dengan `agentOf`).
- `packages/daemon/src/sessions.ts` -- `authorOf(session)` = `{client?, agent?}` untuk entri riwayat.
- `packages/daemon/src/server.ts` (commit execute), `paste.ts` (`Actor.agent`, commit paste) -- pakai `authorOf`.
- `packages/daemon/src/viewer.ts` -- `historyAgent(h, sessions)`; `ViewerHistoryEntry.agent?`; `ViewerDocSummary.lastAgent?` lewat `historyMeta`.
- `packages/viewer/src/api.ts` -- `HistoryEntry.agent?`, `DocSummary.lastAgent?`.
- `packages/viewer/src/HistoryPanel.tsx`, `listColumns.ts` (`lastAgentView(client, agent?)`), `Dashboard.tsx` (`LastAgent`), `history.ts` (`fileMeta`) -- label dari `agent ?? client`.
- `packages/viewer/src/agentEffects.ts` -- `liveSessionColors(views)`, `sessionColor(colors, session)`.
- `packages/viewer/src/presence.ts`, `ActivityPanel.tsx`, `live.ts` -- warna sesi dari `liveSessionColors`; `LiveDoc.color`/`AgentRow.color` jadi `AgentColor`.
- `packages/viewer/src/tokens.css`, `app.css` -- `--agent-{violet,emerald,pink}-soft`; kelas warna untuk `.harness-icon`, `.live-badge`, `.agent-commit`, `.conn-agent-icon`, `.conn-agent-status.live`.

## Tasks & Acceptance

**Execution:**
- [x] Daemon: `agent` di entri riwayat + `historyAgent`/`lastAgent` + tes `packages/daemon/src/history-agent.test.ts`.
- [x] Viewer: label History/Last agent/header file dari `agent`.
- [x] Viewer: `liveSessionColors` untuk Activity, badge Live, Connections + CSS; tes `packages/viewer/src/agentIdentity.test.ts`.

**Acceptance Criteria:**
- Given Claude Code (header `claude-code`) mengedit dokumen, when History atau List view Dashboard dibuka (juga sesudah restart lakard), then penulisnya "Claude Code", bukan "MCP agent".
- Given dua sesi Claude Code Live di dokumen yang sama, when canvas dan panel Activity terbuka, then sesi kedua violet di kursor, kartu Activity, dan badge Live.

## Design Notes

**Keputusan (tanpa checkpoint, atas arahan "decide sensibly"):**
- **History tetap warna harness.** Entri riwayat umumnya dari sesi yang sudah berakhir, dan warna sesi hanya dibagi antar-sesi Live di satu dokumen, jadi warnanya bisa berubah atau tidak berlaku lagi. Riwayat juga tidak menyimpan warna. Warna harness (`harnessColor`) stabil untuk entri lama maupun baru. Kolom Last agent Dashboard ikut aturan ini karena juga membaca riwayat.
- **Badge Live dan Connections ikut warna sesi per dokumen.** Warna dihitung dari `sessionsForSlug(state, slug)` untuk slug tempat sesi bekerja, jadi sama persis dengan kursor canvas dokumen itu. Dua sesi Claude di dokumen berbeda sama-sama oranye, seperti di canvas.
- **Sesi idle** memakai `preferredColor` (bukan `harnessColor`), sehingga harness tak dikenal (mis. `zed`) mendapat warna tambahan yang sama dengan di canvas, bukan oranye.
- **Fallback `agent` dari sesi hidup** meniru `historyClient`: entri yang ditulis sebelum perubahan ini oleh sesi yang masih hidup tetap mendapat nama harness sampai daemon restart.
- `client` tetap dicatat di samping `agent`, karena "Last agent" lama dan klien lama membaca `client`.

## Review Triage Log

**Self-review (diff):** tidak ada temuan yang perlu patch sesudah perbaikan fixture tes. Diperiksa: entri aplikasi tidak mendapat `agent` (`historyAgent` memeriksa `lakar-viewer` lebih dulu); `lastClient` dan `lastAgent` berasal dari entri terakhir yang sama; `.harness-icon:is(...)` didefinisikan sesudah `.harness-icon.agent` dengan spesifisitas sama; `live-badge.disconnected` tidak memakai kelas warna.

| # | Temuan | Verdict | Rute | Bukti |
|---|---|---|---|---|
| 1 | Fixture tes idle masih punya call `running`, jadi sesi tetap Live | low | patch | `isLive` true selama ada call running; fixture `finished()` tanpa call berjalan |

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 test` -- expected: hijau kecuali kegagalan khas Windows (AGENTS.md); CI Linux acuan.
