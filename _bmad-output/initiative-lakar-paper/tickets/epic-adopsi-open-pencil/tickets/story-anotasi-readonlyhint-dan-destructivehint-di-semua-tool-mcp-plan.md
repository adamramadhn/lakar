---
title: 'Anotasi readOnlyHint dan destructiveHint di semua tool MCP'
type: feature
ticket: '2'
created: '2026-11-23'
status: in-review
baseline_revision: '01390e5ca062fc1b6f6020cd6fcdeb84bc80037e'
route: oneshot
route_source: auto
risk: low
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** 19 tool server MCP Lakar (`packages/mcp`) tidak membawa `annotations` di `tools/list`, jadi harness (Claude Code, Codex, klien ACP) menganggap semuanya bisa menulis dan merusak (default spesifikasi MCP: `readOnlyHint` false, `destructiveHint` true). Agen tidak bisa dijalankan dengan izin baca otomatis.

**Approach:** Satu tabel efek `TOOL_EFFECTS` (nama tool → `read` | `write` | `destructive`) di `packages/mcp/src/annotations.ts` beserta `toolAnnotations(name)` yang menurunkan `ToolAnnotations` SDK (`@modelcontextprotocol/server` 2.4.0, field `annotations` di `registerTool`): `read` → `{readOnlyHint: true}`; `write` → `{readOnlyHint: false, destructiveHint: false}`; `destructive` → `{readOnlyHint: false, destructiveHint: true}`. Setiap `registerTool` (termasuk `fix-check.ts` dan loop undo/redo) memakai `annotations: toolAnnotations('<nama>')`; nama bertipe `keyof typeof TOOL_EFFECTS`, jadi tool baru tanpa baris tabel gagal di typecheck. Tes `tools/list` memeriksa setiap tool punya anotasi sama dengan tabel dan himpunan nama tool sama dengan kunci tabel, jadi tool baru tanpa anotasi atau tanpa efek membuat tes gagal. Nama, deskripsi, input, dan output tool lama tidak berubah (C5, AD-4: hanya field baru).

</intent-contract>

## Implementation Notes

Rute oneshot: perkiraan ±100 baris (satu modul tabel kecil, satu baris `annotations` per registrasi, satu tes), mekanis, tanpa perubahan perilaku tool.

Keputusan (didelegasikan Fatmuh; dicatat di sini):

- Kriteria `destructive` mengikuti tiket: bisa menghapus atau menimpa isi pengguna (node yang dibuat pengguna/agen lain), bukan "tak bisa dipulihkan" (semua tulis punya riwayat rev).
- Tabel efek:
  - `read`: `status`, `read_skill`, `list_boards`, `list_documents`, `inspect`, `screenshot`, `layout_check`, `get_selection`, `icon_search`, `photo_search` (hanya mencari ke penyedia, tidak mengimpor), `export_code` (mengembalikan isi berkas di respons, tidak menulis disk), `visual_diff` (render snapshot, tidak menulis).
  - `write` (tidak merusak): `open_doc` (mengganti dokumen aktif sesi atau membuat dokumen baru), `paste` (hanya menambah node), `export` (menulis PNG di `<dataDir>/exports/`, bukan isi desain), `undo` (hanya membalik langkah sesi ini; ada rev lain sesudahnya → CONFLICT, jadi tidak pernah menghapus edit pengguna).
  - `destructive`: `execute` (JS bebas: bisa menghapus/mengubah node mana pun), `redo` (mengulang langkah execute yang mungkin menghapus/menimpa), `fix_check` (menimpa properti node yang ada; anotasi statis, jadi `dryRun` tidak mengubahnya).
- `idempotentHint`, `openWorldHint`, dan `title` sengaja tidak diisi: di luar lingkup tiket (R2 hanya `readOnlyHint`/`destructiveHint`); klaim yang salah lebih buruk daripada default.

## Plan Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm build` -- expected: sukses (typecheck `packages/mcp` termasuk tipe `ToolAnnotations` dan nama tool bertipe)
- `pnpm exec vitest run packages/mcp/` -- expected: semua tes `packages/mcp` lulus, termasuk tes anotasi `tools/list` baru
- `pnpm test` dengan `LAKAR_C7_ALLOW_MISSING_SOURCES=1` -- expected: tidak ada kegagalan baru dibanding baseline Windows `origin/main`

## Implementation Notes

Berkas yang disentuh:

- `packages/mcp/src/annotations.ts` (baru): `TOOL_EFFECTS`, tipe `ToolEffect`/`ToolName`, `toolAnnotations(name)`.
- `packages/mcp/src/server.ts`: `annotations: toolAnnotations('<nama>')` di 16 registrasi + loop undo/redo (`toolAnnotations(dir)`).
- `packages/mcp/src/fix-check.ts`: anotasi `fix_check`.
- `packages/mcp/src/index.ts`: ekspor `TOOL_EFFECTS`, `toolAnnotations`, `ToolEffect`, `ToolName`.
- `packages/mcp/src/annotations.test.ts` (baru): 5 tes (tabel = daftar tool, pemetaan terkunci, tool baru tanpa efek terdeteksi, registrasi tanpa anotasi terdeteksi + daftar tool tanpa anotasi identik dengan pembanding, salinan baru).

Catatan:

- `ToolAnnotations` diekspor `@modelcontextprotocol/server` 2.4.0 (`title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`); `registerTool` menerima `annotations`.
- Bukti kompatibilitas: `tools/list` dari `dist` baseline (`01390e5`) disimpan lalu dibandingkan dengan `tools/list` sesudah perubahan tanpa `annotations` → `isDeepStrictEqual` true (nama, deskripsi, inputSchema, execution sama).
- Kejutan: `cmd` menafsirkan `>` di `node -e` sebagai redirect; tes diperbaiki lewat tool edit.
