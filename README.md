# Lakar

Alat desain berbasis AI — kanvas desain yang dikendalikan agen AI lewat MCP, dengan dokumen
JSON bertipe (`.lakar.json`) yang bisa dirender, diedit, dan dibagikan.

- **Agen** mendesain lewat server MCP `lakar` → daemon `lakard` (loopback `127.0.0.1:7466`).
- **Viewer** web (`/app/`) untuk melihat dan mengedit hasilnya langsung.
- **Desktop** app Tauri dengan `lakard` sebagai sidecar.
- **Cloud** (share links, akun, multiplayer rooms) ada di repo privat
  [`lakar-cloud`](https://github.com/fatmuh/lakar-cloud) — self-host tetap bisa jalan
  sendiri lewat `docker compose`, gratis selamanya.

## Mulai

```sh
pnpm install
pnpm build      # wajib sebelum tes atau daemon
pnpm lakard     # daemon + viewer di http://127.0.0.1:7466/app/
pnpm test       # typecheck + vitest
```

Prasyarat: Node ≥ 26, pnpm 12.21.0. Rilis stabil bertag `v*`; build harian ada di
rilis `nightly` (dari branch `dev`).

## Struktur

| Path | Isi |
|---|---|
| `packages/schema` | Skema dokumen + migrasi (`schemaVersion`) |
| `packages/core` | Store dokumen, ops, render ops |
| `packages/daemon` | `lakard` — daemon HTTP + render playwright |
| `packages/mcp` | Server MCP stdio untuk agen |
| `packages/viewer` | Viewer/editor web (Vite + React) |
| `apps/desktop` | Aplikasi desktop Tauri |

Detail aturan kerja dan batasan ada di [AGENTS.md](AGENTS.md); status kerja terkini di
[HANDOVER.md](HANDOVER.md).

## Lisensi

[MIT](LICENSE). Layanan cloud (`lakar-cloud`) adalah repo terpisah dengan lisensi
berbeda — kode inti di sini bebas dipakai untuk apa pun, termasuk self-host penuh.
