# @lakar/render

Render murni: dokumen ter-resolve → DOM board, lalu ukur (bounds node, baris teks) di halaman Chromium.

- **AD terkait:** AD-5 (layout flow/absolute), AD-6 (render tanpa API Node; batas render), AD-10 (font lokal).
- **Arah dependensi:** `render → schema, ports`, tetapi **hanya `import type`** dari luar paket:
  `dist/*.js` dimuat apa adanya sebagai module di halaman Chromium (dan nanti browser B), tanpa bundler.
  Karena itu `findBoard` dan label code point disimpan sebagai salinan di sini, bukan diimpor dari schema.

## Ekspor utama

- `renderBoard`, `mountBoard`, `findBoard`, `measureBoard`, `NODE_ATTR`, `CHROMIUM_ARGS`.
- Font: `fontRequests`, `uncoveredGlyphs`, `parseUnicodeRange`, `DEFAULT_FONT`.
- Ikon/aset: `iconRefs`, `iconKey`, `assetIds`, `DEFAULT_ASSET_BASE`.

## Batasan

- Paket IO_FORBIDDEN: tanpa API Node; lib DOM.
- Golden visual di `test/golden/` (perbarui dengan `LAKAR_UPDATE_GOLDEN=1`, periksa visual, commit).
- Tes Chromium butuh `bash scripts/install-browser.sh` (cache `~/.cache/lakar/ms-playwright`, C9).

## Tes

```bash
/opt/node-26/bin/pnpm build
/opt/node-26/bin/pnpm exec vitest run packages/render
```

Semua tes repo: `/opt/node-26/bin/pnpm test` (dari root).
