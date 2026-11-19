# @lakar/mcp

Server MCP stdio `lakar` (10 tool v1: status, read_skill, open_doc, list_boards, execute, inspect,
layout_check, screenshot, export, icon_search) yang meneruskan ke lakard lewat HTTP. Stateless: semua state di
daemon, di balik sessionId.

- **AD terkait:** AD-1, AD-11 (tool dan pemetaan error), AD-17 (sesi malas, ulang sekali saat 401).
- **Arah dependensi:** `mcp → schema` saja (tidak mengimpor daemon).

## Ekspor utama

- `createLakarMcpServer`, `DaemonClient`, deskripsi tool (`EXECUTE_DESCRIPTION`, …), `SERVER_INSTRUCTIONS`.
- Entry `dist/main.js` (`LAKAR_URL`, default `DEFAULT_LAKARD_URL`), didaftarkan di `.mcp.json` root.

## Batasan

- Nama, deskripsi, inputSchema, dan instructions tool beku untuk putaran bench; dibandingkan lewat dump
  `listTools` sebelum/sesudah perubahan.
- Teks deskripsi hanya bahasa aturan produk (C7).

## Tes

```bash
/opt/node-26/bin/pnpm build
/opt/node-26/bin/pnpm exec vitest run packages/mcp
```

Semua tes repo: `/opt/node-26/bin/pnpm test` (dari root).
