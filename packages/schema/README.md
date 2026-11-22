# @lakar/schema

Satu sumber kebenaran untuk bentuk data Lakar: skema dokumen v3 (zod, tipe TS diturunkan dari sini),
token, kontrak error, temuan check, dan konstanta yang dipakai lebih dari satu paket. Tanpa IO.

- **AD terkait:** AD-2 (skema + JSON Schema hasil zod), AD-11 (bentuk `{ok, data|error}`, enum `ErrorCode`),
  AD-15/AD-16 (token, `resolveTokens`), AD-10 spine model-dokumen (`resolveDocument`), AD-17 (`SESSION_HEADER`), AD-9 (tipe ikon, batas pencarian).
- **Arah dependensi:** tidak bergantung pada paket `@lakar/*` lain; semua paket lain boleh memakainya.

## Ekspor utama

- Dokumen: `LakarDocument`, `NodeInput`, `BoardNode`, `SCHEMA_VERSION`, `ID_PATTERN`, `SLUG_PATTERN`,
  `ASSET_ID_PATTERN`, `findBoard`, `zodToLakarError`, `jsonSchemas()`.
- Error: `ErrorCode`, `LakarError`, `ApiResult`, `errorMessage`.
- Resolusi (AD-10): `resolveDocument` adalah satu-satunya pintu dokumen tersimpan → ter-resolve; render, check, daemon,
  dan core wajib memakainya (dijaga `tests/resolve-document.test.ts`).
- Token: `resolveTokens` (tahap resolusi token, tetap diekspor untuk codegen), tipe `Resolved*`.
- Temuan: `Finding`, `summarizeFindings`, `findingLine`, `G0_RULES`.
- Glyph/emoji (LC-01a/LC-01b): `isEmojiGrapheme`, `graphemes`, `codePoints`, `cpLabel`, `LC01B_GLYPHS`.
- Versi dan koneksi: `LAKAR_VERSION`, `VERSION_HINT`, `SESSION_HEADER`, `DEFAULT_LAKARD_PORT`, `DEFAULT_LAKARD_URL`.
- Ikon: `ICON_LIBS`, `ICON_NAME_PATTERN`, `ICON_SEARCH_DEFAULT_LIMIT`, `ICON_SEARCH_MAX_LIMIT`.

## Batasan

- Paket IO_FORBIDDEN (`tests/dependency-direction.ts`): tanpa API Node dan pustaka IO.
- Enum `ErrorCode` dan bentuk respons AD-11 beku; perubahan enum adalah keputusan arsitektur, bukan refactor.
- `render` tidak mengimpor nilai dari sini (hanya `import type`), jadi `findBoard` dan label code point (`codePointLabel`) punya
  salinan di render.

## Tes

```bash
/opt/node-26/bin/pnpm build
/opt/node-26/bin/pnpm exec vitest run packages/schema
```

Semua tes repo: `/opt/node-26/bin/pnpm test` (dari root).
