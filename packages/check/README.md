# @lakar/check

Aturan gerbang G0 atas dokumen ter-resolve + hasil ukur render: LC-01a (emoji), LC-01b (glyph sebagai ikon),
LC-02a (terpotong clip), LC-05 (teks < 12px), LC-12 (ukuran board, warning), LC-20 (tertutup zona bawah, termasuk bar mengambang dan kapsul ber-fill di dalam pembungkus absolut transparan: konten akhir, unit terpotong, judul seksi yatim, konten di celah di bawah bar).

- **AD terkait:** AD-8 (render board tersentuh + check sebelum commit; temuan tidak menolak commit).
- **Arah dependensi:** `check → schema, ports`. Definisi emoji/glyph dari `@lakar/schema`.

## Ekspor utama

- `checkBoard`, `glyphScan` (temuan glyph tanpa render + `allowGlyphs`), `sortFindings`, `boundsOf`.
- Aturan satuan: `lc01a`, `lc01b`, `lc02a`, `lc05`, `lc12`, `lc20` (zona bawah: `bottomZone`); `touchedBoards`, `changedNodeIds`.

## Batasan

- Murni, tanpa IO.
- Teks temuan dan hint hanya memakai bahasa aturan produk (C7, `tests/check-c7.test.ts`).
- Teks temuan dilihat agen; ubah hanya dengan sengaja.

## Tes

```bash
/opt/node-26/bin/pnpm build
/opt/node-26/bin/pnpm exec vitest run packages/check
```

Semua tes repo: `/opt/node-26/bin/pnpm test` (dari root).
