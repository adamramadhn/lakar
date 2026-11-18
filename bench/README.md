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

## Putaran resmi

ID angka polos (`--round 1`, …) adalah putaran resmi; `uji-<k>` adalah putaran uji dan tidak memakai cek di bawah.
Sebelum run apa pun, putaran resmi di-abort bila `officialFreezeProblems` menemukan masalah: `git status --porcelain`
kode produk + harness (`packages tools scripts bench/src bench/protocol bench/mcp bench/package.json package.json
pnpm-lock.yaml .mcp.json`) tidak kosong; protocolHash, model, Claude Code, atau pen.dev desktop ≠
`bench/baseline-pendev.json`; `fonts.missing` tidak kosong atau pool belum siap; atau, sesudah restart lakard yang
wajib (juga saat arsip kosong), `startedAt` lakard tidak lebih baru dari file `packages/*/dist` terbaru. `--dry-run`
hanya mencetak hasil cek dan rencana restart. Kode di-commit sebelum putaran agar SHA beku memuat produk dan harness.
Laporan memuat keputusan G0 sementara (`decideG0`), evaluasi arah bila belum lolos, dan bagian "Konfirmasi Adam" yang
hanya diisi Adam. Strip Lakar disalin ke `bench/round-<n>/<prompt>-lakar.png` (tracked, eksklusif); strip dan `.pen`
pen.dev tetap lokal di `bench/runs/rounds/<n>/` (EULA, tidak di-commit).

## Tes

```bash
/opt/node-26/bin/pnpm build
/opt/node-26/bin/pnpm exec vitest run bench
```

Semua tes repo: `/opt/node-26/bin/pnpm test` (dari root).
