# @lakar/daemon (lakard)

Daemon HTTP Lakar di 127.0.0.1: pemilik tunggal dokumen, sesi, eksekusi snippet, render + check, export.
Dijalankan sebagai systemd user service `lakard` (`tools/lakard/install-service.sh`).

- **AD terkait:** AD-1 (daemon pemilik state), AD-8 (check sebelum commit), AD-10 (font lokal), AD-11 (route +
  bentuk respons), AD-14 (hanya loopback), AD-17 (sesi), AD-18 (pool render hangat).
- **Arah dependensi:** `daemon → core, exec, render, check, icons, skills` (+ schema, ports).

## Ekspor utama

- `startDaemon`, `buildServer`, `loadConfig` (`~/.config/lakar/config.toml` + env `LAKAR_*`).
- `RenderPool`, `ChromiumRenderer`, `FontRegistry`, `DocStore`, `inspectFit`, `locateNode`.

## Batasan

- Status HTTP, bentuk `{ok, data|error}`, pesan dan hint error dilihat agen lewat mcp: ubah hanya dengan sengaja.
- Data di `~/.local/share/lakar` (docs, history, exports, assets). Setelah build: `systemctl --user restart lakard`.
- Tes Chromium butuh `bash scripts/install-browser.sh`; tes memakai port acak dan dataDir sementara.

## Tes

```bash
/opt/node-26/bin/pnpm build
/opt/node-26/bin/pnpm exec vitest run packages/daemon
```

Semua tes repo: `/opt/node-26/bin/pnpm test` (dari root).
