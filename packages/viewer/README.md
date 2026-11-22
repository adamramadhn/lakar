# @lakar/viewer

Viewer baca-saja Lakar (Viewer B slice 1): Dashboard (Recents) dan Viewer (Layers, canvas PNG per board,
Inspect, Checks). Vite + React + TS, disajikan `lakard` di `http://127.0.0.1:<port>/app/` (hanya loopback, AD-14).

- **Visual:** `design/lakar-ui.pen` bagian 01–03; token di `src/tokens.css`, dark/light ikut `prefers-color-scheme`.
- **Data:** `GET /viewer/docs`, `GET /viewer/docs/:slug`, lalu sesi sendiri (`POST /sessions`, `client: 'lakar-viewer'`)
  untuk `/docs/open` (hanya slug dari daftar), `/screenshot`, `/inspect`, `/layout-check`. Tidak ada aksi tulis.
- **Arah dependensi:** `viewer → schema` (tipe dan `G0_RULES`).
- Activity, History, cursor agen, dan Export belum ada di slice ini.

## Build dan dev

```bash
pnpm build                          # root: tsc -b lalu build viewer ke packages/viewer/dist
pnpm --filter @lakar/viewer dev     # Vite dev server, proxy ke lakard (LAKARD_URL, default 127.0.0.1:7466)
```
