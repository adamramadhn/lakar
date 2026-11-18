# @lakar/exec

Sandbox snippet `execute`: QuickJS build release sinkron, tanpa fs/jaringan/import, dengan batas waktu dan
memori, plus permukaan API snippet (`add`, `update`, `find`, `place`, `iconSearch`, `keep`, …).

- **AD terkait:** AD-7 (snippet, batas, `editId`), AD-12 (`api.md` dihasilkan dari tabel `API`), AD-4
  (op berjalan di transaksi core).
- **Arah dependensi:** `exec → core, ports` (schema diimpor langsung; diizinkan lewat closure transitif `tests/dependency-direction.ts`).

## Ekspor utama

- `runSnippet`, `DEFAULT_TIMEOUT_MS`, `DEFAULT_MEMORY_BYTES`, `MAX_OPS`.
- `API`, `API_GLOBALS`, `API_REFERENCE`, `SNIPPET_GLOBALS`, `renderApiMarkdown`.

## Batasan

- `packages/skills/skills/api.md` dihasilkan dari sini: setelah mengubah tabel API jalankan
  `/opt/node-26/bin/pnpm build && /opt/node-26/bin/node scripts/gen-skill-api.mjs`; tes `tests/skills.test.ts`
  gagal bila api.md basi.
- Deskripsi tool MCP `execute` harus menyebut setiap fungsi API (`tests/execute-description.test.ts`).

## Tes

```bash
/opt/node-26/bin/pnpm build
/opt/node-26/bin/pnpm exec vitest run packages/exec
```

Semua tes repo: `/opt/node-26/bin/pnpm test` (dari root).
