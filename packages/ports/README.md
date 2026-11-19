# @lakar/ports

Kontrak antarmuka (hexagonal) antara inti dan adaptor: hanya tipe, tanpa implementasi.

- **AD terkait:** AD-6 (`RenderPort`: ukur + screenshot board ter-resolve), AD-8 (`BoardMeasure` untuk check),
  AD-9 (`IconCatalogPort`), AD-18 (`RenderStatus` pool render).
- **Arah dependensi:** tidak bergantung pada paket `@lakar/*` lain. Tipe dokumen diberikan sebagai parameter
  generik oleh pemakai.

## Ekspor utama

- `RenderPort<Doc>`, `MeasureOptions` (`allowGlyphs`), `ScreenshotOptions`, `RenderStatus`.
- `BoardMeasure`, `NodeBounds`, `TextMeasure`.
- `IconCatalogPort<Lib, Glyph>`, `IconCatalogMatch`.

## Batasan

- Paket IO_FORBIDDEN: tanpa API Node.
- Hanya kontrak; perubahan di sini menyentuh semua adaptor (daemon, render, icons).

## Tes

```bash
/opt/node-26/bin/pnpm build
/opt/node-26/bin/pnpm exec vitest run packages/ports
```

Semua tes repo: `/opt/node-26/bin/pnpm test` (dari root).
