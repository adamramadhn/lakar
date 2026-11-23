---
title: 'Anotasi readOnlyHint dan destructiveHint di semua tool MCP'
type: feature
ticket: '2'
created: '2026-11-23'
status: built
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

## Review Triage Log

### 2026-11-23 — Review pass

- verdicts: 8 findings — high 0, medium 0, low 6, false 2, maybe-false 0
- findings:
  - `[low]` `[patch]` Komentar kepala `annotations.ts` melebih-lebihkan jaminan typecheck (`registerTool` tetap menerima `string`; yang bertipe hanya argumen `toolAnnotations`) — komentar diperbaiki: typecheck menolak nama di luar tabel, tes `tools/list` menolak tool tanpa baris tabel atau tanpa anotasi.
  - `[low]` `[patch]` `toHaveLength(19)` di tes pertama mengulang cek kesetaraan himpunan tabel–daftar tool — baris dihapus (jumlah 19 tetap dikunci di `index.test.ts` stdio).
  - `[low]` `[patch]` Perbandingan anotasi lewat `JSON.stringify` peka urutan kunci — diganti `isDeepStrictEqual` dari `node:util`.
  - `[false]` `[reject]` Monkeypatch `McpServer.prototype.registerTool` mungkin tidak berefek bila method bukan di prototype — tes lulus dengan `bare` berisi 19 tool tanpa anotasi, jadi method memang di prototype; bila tidak, asersi gagal keras, bukan diam.
  - `[low]` `[patch]` `listTools` di tes tidak menutup `McpServer` — ditambah `await server.close()`.
  - `[low]` `[reject]` `fix_check` destruktif statis walau `dryRun: true` hanya membaca — keterbatasan anotasi statis yang disengaja dan dicatat di plan; akibatnya hanya harness meminta izin untuk dry-run (aman); memecah tool butuh tool/input baru, lebih dari koreksi langsung.
  - `[low]` `[patch]` Asimetri undo (`write`) vs redo (`destructive`) kurang dijelaskan di komentar tabel — komentar `undo` dan `redo` diperjelas (undo hanya menghapus node tambahan sesi ini; redo mengulang execute yang bisa menimpa node pengguna).
  - `[false]` `[reject]` Ekspor `ToolAnnotations`, field `annotations` di `registerTool`, dan build/tes belum terverifikasi — tipe SDK 2.4.0 diperiksa (`index.d.mts` mengekspor `ToolAnnotations`; config `registerTool` punya `annotations?: ToolAnnotations`); `pnpm build` dan `vitest run packages/mcp/` lulus.

## Auto Run Result

- Ringkasan: 19 tool MCP Lakar kini membawa `annotations` (`readOnlyHint`, dan `destructiveHint` untuk tool tulis) yang diturunkan dari satu tabel `TOOL_EFFECTS`; 12 baca, 4 tulis tidak merusak, 3 destruktif.
- Berkas:
  - `packages/mcp/src/annotations.ts` — tabel efek + `toolAnnotations`.
  - `packages/mcp/src/server.ts`, `packages/mcp/src/fix-check.ts` — `annotations: toolAnnotations(...)` di setiap registrasi.
  - `packages/mcp/src/index.ts` — ekspor tabel dan helper.
  - `packages/mcp/src/annotations.test.ts` — tes anotasi `tools/list`.
- Review (quick): 5 patch low (komentar kepala, cek panjang redundan, perbandingan deep-equal, tutup server, komentar undo/redo), 0 ditunda, 3 ditolak (2 false: prototype dan ekspor SDK terverifikasi; 1 low: `fix_check` dryRun adalah keterbatasan anotasi statis yang disengaja).
- Follow-up review: false (tidak ada patch high/medium; patched: high 0, medium 0, low 5).
- Verifikasi: `pnpm build` lulus; `tsc -p tsconfig.test.json` lulus; `vitest run packages/mcp/` 49/49 lulus; `tools/list` sesudah perubahan tanpa `annotations` identik (`isDeepStrictEqual`) dengan `tools/list` baseline `01390e5`. `pnpm test` penuh di Windows: 74 gagal, tidak ada di `packages/mcp`; `tests/code-export.test.ts` (timeout beban) lulus saat dijalankan sendiri; `judge-c7`/`judge.test` sama dengan baseline bila `LAKAR_C7_ALLOW_MISSING_SOURCES` diset tanpa spasi (cmd `set X=1 &&` menambah spasi); sisanya kelas Windows yang dikenal (foto, render timing, release.sh, path `\`). CI Linux acuan.
- Risiko sisa: klasifikasi adalah petunjuk (hint); bila tool lama berubah efek, tabel harus ikut diubah — tes hanya menjamin konsistensi tabel–registrasi, bukan kebenaran semantik efek.
