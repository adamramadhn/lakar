# @lakar/codegen

Generator kode murni (AD-16): dokumen tersimpan → komponen React dengan modul CSS atau kelas Tailwind v4, plus `tokens.css` (CSS variables per mode) dan `theme.css` (tema Tailwind).

- **AD terkait:** AD-5 (deklarasi CSS dari `@lakar/render` `css.ts`), AD-10 (dokumen tersimpan; `expandInstances` bila perlu), AD-11 (token → `var(--…)`), AD-16, AD-17 (deps hanya `schema` + `render`, tanpa IO).
- **API:** `generateCode(doc, { nodeId, target, components? })`, `iconRefs(doc, { nodeId })`, `tokensCss(doc)`, `tailwindThemeCss(doc)`, `declToTailwind(prop, value)`.
- **Komponen (story 3, default `components: true`):** setiap master yang dipakai menjadi `components/<Nama>.tsx` (+ modul CSS) dengan props bertipe (text/boolean/enum) dan slot `ReactNode`; instance menjadi `<Nama …/>` dengan props, kelas selisih akar (`!important` hanya pada keluarga shorthand yang bentrok), dan isi slot. Isi komponen diturunkan dari `expandInstances` pada instance sintetis per kombinasi prop; pemakaian yang tidak setara dengan pohon ter-ekspansi di-inline dengan warning `instance-inlined`. `components: false` = keluaran story 2.
- **Batas sekarang:** fill mesh dilewati dengan warning; ikon butuh glyph dari pemanggil (`icons`; daftar lengkap termasuk varian enum dari `iconRefs`); prop text yang mengikat selain `content` tidak diekspor (`prop-unsupported`); komponen dengan > 64 kombinasi prop per elemen di-inline (`component-too-complex`).
- **Sumber daya yang harus disediakan proyek tujuan:** berkas gambar (URL `assetBase` + sha256, default `/assets/`) dan font (`font-family` ditulis tanpa `@font-face`/fallback, sama dengan canvas). Penyalinan aset dan font milik dialog ekspor (story 5).
