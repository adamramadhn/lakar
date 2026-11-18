# @lakar/icons

Katalog ikon kanonik: lucide-static (ikon UI) dan simple-icons (logo brand), versi dipin persis. Nama kanonik
+ alias, pencarian deterministik, saran untuk ICON_UNKNOWN, dan data glyph untuk render.

- **AD terkait:** AD-9.
- **Arah dependensi:** `icons → schema`. Mengimplementasikan `IconCatalogPort` secara struktural.

## Ekspor utama

- `IconCatalog` (`load`, `search`, `canonical`, `glyph`, `versions`).
- `SEARCH_DEFAULT_LIMIT`/`SEARCH_MAX_LIMIT` (alias `ICON_SEARCH_*` dari schema), `SUGGESTION_COUNT`, `editDistance`.

## Batasan

- Membaca data paket ikon dari `node_modules` (IO baca saja).
- Batas pencarian sama di tiga tempat (tool `icon_search`, `iconSearch` snippet, katalog): satu nilai di schema.

## Tes

```bash
/opt/node-26/bin/pnpm build
/opt/node-26/bin/pnpm exec vitest run packages/icons
```

Semua tes repo: `/opt/node-26/bin/pnpm test` (dari root).
