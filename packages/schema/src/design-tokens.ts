// Token desain bersama (angka spacing, skala tipe, ukuran komponen) untuk check. Tanpa IO.
// Sumber = frontmatter DESIGN.md (Lakar Output Standard) dan prelude skill `core.md` (`TY`, baris "Jarak:");
// kesesuaiannya dijaga `tests/design-tokens.test.ts`. Aturan check mengimpor angka dari sini, tidak menyalinnya.

/** Token spacing DESIGN.md (`spacing`, tanpa `page-margin-*`/`content-max`) → px. 2 dan 6 hanya di komponen kecil. */
export const SPACING = {
  '0-25': 2,
  '0-5': 4,
  '0-75': 6,
  '1': 8,
  '1-5': 12,
  '2': 16,
  '2-5': 20,
  '3': 24,
  '4': 32,
  '5': 40,
  '6': 48,
  '8': 64,
  '10': 80,
  '12': 96,
  '16': 128,
} as const satisfies Record<string, number>;

/** Himpunan nilai spacing sah (gap/padding): 0 ∪ nilai `SPACING`. */
export const SPACING_VALUES: ReadonlySet<number> = new Set([0, ...Object.values(SPACING)]);

export type TypeToken = { size: number; lineHeight: number; weight: number; letterSpacing: number };

/** Skala tipe DESIGN.md (`typography`, tanpa `kpi`): px; `letterSpacing` dalam em. */
export const TYPE_SCALE = {
  'display-xl': { size: 64, lineHeight: 72, weight: 700, letterSpacing: -0.02 },
  'display-lg': { size: 48, lineHeight: 56, weight: 700, letterSpacing: -0.02 },
  h1: { size: 40, lineHeight: 48, weight: 700, letterSpacing: -0.015 },
  h2: { size: 32, lineHeight: 40, weight: 700, letterSpacing: -0.01 },
  'mobile-title-lg': { size: 28, lineHeight: 36, weight: 700, letterSpacing: -0.01 },
  h3: { size: 24, lineHeight: 32, weight: 600, letterSpacing: 0 },
  'mobile-title': { size: 22, lineHeight: 28, weight: 700, letterSpacing: 0 },
  h4: { size: 20, lineHeight: 28, weight: 600, letterSpacing: 0 },
  'body-lg': { size: 18, lineHeight: 28, weight: 400, letterSpacing: 0 },
  body: { size: 16, lineHeight: 24, weight: 400, letterSpacing: 0 },
  'body-sm': { size: 14, lineHeight: 20, weight: 400, letterSpacing: 0 },
  label: { size: 14, lineHeight: 20, weight: 600, letterSpacing: 0 },
  caption: { size: 12, lineHeight: 16, weight: 500, letterSpacing: 0 },
  'tab-label': { size: 12, lineHeight: 16, weight: 600, letterSpacing: 0 },
  overline: { size: 12, lineHeight: 16, weight: 600, letterSpacing: 0.08 },
  data: { size: 14, lineHeight: 20, weight: 500, letterSpacing: 0 },
} as const satisfies Record<string, TypeToken>;

/** Ukuran `KPI / Nilai` (DESIGN.md `typography.kpi`); line-height = size × `KPI_LINE_HEIGHT_RATIO`. */
export const KPI_SIZES: readonly number[] = [28, 32, 40];
export const KPI_LINE_HEIGHT_RATIO = 1.2;
/** Ukuran tambahan `Display / …` (hero besar); line-height tidak dinilai. */
export const DISPLAY_SIZES: readonly number[] = [72, 80];

/**
 * Ukuran komponen di luar himpunan spacing: 44 (icon-button, stepper, table-row compact) dan 56 (table-row,
 * tombol bilah bawah mobile).
 */
export const COMPONENT_SIZES: readonly number[] = [44, 56];
/** Inset home indicator (padding bawah bilah bawah / tab bar mobile). */
export const HOME_INDICATOR_INSET = 34;
/** Target sentuh minimum (px) di board mobile. */
export const TOUCH_MIN = 44;
/** Ukuran minimum teks paragraf per `screen`. */
export const PARAGRAPH_MIN = { landing: 16, mobile: 16, app: 14 } as const;
/** Ukuran minimum paragraf di dalam kartu ber-cat (deskripsi kartu = body-sm, DESIGN.md §Landing kartu fitur). */
export const PARAGRAPH_MIN_IN_CARD = 14;
