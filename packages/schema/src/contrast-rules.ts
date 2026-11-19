// Ambang kontras LC-04 bersama untuk check dan deskripsi MCP. Tanpa IO.
// Sumber = DESIGN.md "Ambang kontras (WCAG 2.2 AA)" dan baris LC-04 Lampiran A; kesesuaiannya dijaga
// `tests/contrast-rules.test.ts`. Aturan check mengimpor angka dari sini, tidak menyalinnya.

/** Rasio kontras minimum WCAG 2 per jenis elemen. */
export const CONTRAST_MIN = {
  /** Teks biasa. */
  text: 4.5,
  /** Teks besar (`isLargeText`). */
  large: 3,
  /** Batas kontrol (`CONTROL_PREFIXES`) dan ikon tanpa label teks. */
  nonText: 3,
  /** Layer bernama tepat `Placeholder`, berapa pun ukurannya. */
  placeholder: 4.5,
} as const;

/** Teks besar: ≥ `size` px, atau ≥ `boldSize` px dengan berat ≥ `boldWeight` (WCAG 18pt / 14pt tebal). */
export const LARGE_TEXT = { size: 24, boldSize: 18.66, boldWeight: 700 } as const;

/** Berat default teks bila tidak diisi. */
export const DEFAULT_TEXT_WEIGHT = 400;

/** Scrim: fill solid dengan alpha warna × opacity jalur ≥ nilai ini, di antara foto/gradien/efek dan teks. */
export const SCRIM_MIN_ALPHA = 0.5;

/** Kontrol yang batasnya harus ≥ `CONTRAST_MIN.nonText` terhadap latar. */
export const CONTROL_PREFIXES = ['Input /', 'Radio /', 'Checkbox /'] as const;

/** Nama layer placeholder (selalu `CONTRAST_MIN.placeholder`). */
export const PLACEHOLDER_LAYER = 'Placeholder';

/** Teks besar menurut `LARGE_TEXT`. */
export const isLargeText = (t: { size: number; weight?: number | undefined }): boolean =>
  t.size >= LARGE_TEXT.size || (t.size >= LARGE_TEXT.boldSize && (t.weight ?? DEFAULT_TEXT_WEIGHT) >= LARGE_TEXT.boldWeight);

/** Minimum kontras untuk satu teks (placeholder → 4.5 berapa pun ukurannya). */
export const textContrastMin = (t: { name: string; size: number; weight?: number | undefined }): number =>
  t.name === PLACEHOLDER_LAYER ? CONTRAST_MIN.placeholder : isLargeText(t) ? CONTRAST_MIN.large : CONTRAST_MIN.text;
