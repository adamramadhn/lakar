# @lakar/check

Aturan gerbang G0 atas dokumen ter-resolve + hasil ukur render: LC-01a (emoji), LC-01b (glyph sebagai ikon),
LC-02a (terpotong clip), LC-05 (teks < 12px), LC-12 (ukuran board, warning: mobile lebar 390 dan tinggi ≥ 844, "tinggi pas" untuk board mobile panjang, pola dua board `Scroll /`+`scrollY` usang), LC-31 (mockup ber-cat berisi teks terpotong rata di tepi bawah seksi/board), LC-33 (warning: placeholder `[Skeleton] …` tersisa di board tanpa `[WIP] `; placeholder dan wadah yang isinya hanya placeholder tidak dinilai aturan lain, spec-skeleton-live-build), LC-32 (warning: override/prop/slot instance atau bind master yang merujuk node master yang sudah tidak ada atau nilainya tidak lagi sah untuk node master, dari `instanceIssues` hasil `resolveDocument`), LC-20 (tertutup zona bawah, termasuk bar mengambang dan kapsul ber-fill di dalam pembungkus absolut transparan: konten akhir, unit terpotong, judul seksi yatim, konten di celah di bawah bar dan di celah antar-bar).

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
