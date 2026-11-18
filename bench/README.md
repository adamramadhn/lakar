# @lakar/bench

Harness benchmark Lakar vs pen.dev: baseline pen.dev, putaran A/B (agen `claude -p` per alat), juri buta 3×,
dan laporan `bench/round-<id>.md|json`, `bench/score-<prompt>.md|json`.

- **AD terkait:** AD-13 (protokol beku, C7: teks juri tanpa nama alat/istilah internal).
- **Arah dependensi:** `bench → schema` saja (klien HTTP lakard sendiri, tanpa mengimpor mcp/daemon).

## Perintah

```bash
/opt/node-26/bin/node bench/dist/cli.js pendev-baseline [--dry-run]
/opt/node-26/bin/node bench/dist/cli.js round --round <uji-k|n> [--dry-run] [--resume]
```

## Batasan

- `bench/protocol/*` (hash protokol) dan `bench/mcp/pencil.json` beku; teks juri dan argv agen/juri dari
  `round --dry-run` tidak boleh berubah tanpa keputusan baru.
- Perilaku proses `claude` (spawn, argumen, env) dan perhitungan skor/emoji/metrik adalah bagian dari hasil;
  refactor tidak boleh mengubahnya.
- Artefak run di `bench/runs/` (gitignored). Fixture transkrip tes ada di `tests/support/stream.ts`.

## Tes

```bash
/opt/node-26/bin/pnpm build
/opt/node-26/bin/pnpm exec vitest run bench
```

Semua tes repo: `/opt/node-26/bin/pnpm test` (dari root).
