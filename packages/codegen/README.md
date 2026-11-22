# @lakar/codegen

Generator kode murni (AD-16): dokumen tersimpan → komponen React dengan modul CSS atau kelas Tailwind v4, plus `tokens.css` (CSS variables per mode) dan `theme.css` (tema Tailwind).

- **AD terkait:** AD-5 (deklarasi CSS dari `@lakar/render` `css.ts`), AD-10 (dokumen tersimpan; `expandInstances` bila perlu), AD-11 (token → `var(--…)`), AD-16, AD-17 (deps hanya `schema` + `render`, tanpa IO).
- **API:** `generateCode(doc, { nodeId, target })`, `tokensCss(doc)`, `tailwindThemeCss(doc)`, `declToTailwind(prop, value)`.
- **Batas sekarang:** instance di-inline (komponen React = story 3); fill mesh dilewati dengan warning; ikon butuh glyph dari pemanggil (`icons`, ikon sesudah ekspansi instance).
- **Sumber daya yang harus disediakan proyek tujuan:** berkas gambar (URL `assetBase` + sha256, default `/assets/`) dan font (`font-family` ditulis tanpa `@font-face`/fallback, sama dengan canvas). Penyalinan aset dan font milik dialog ekspor (story 5).
