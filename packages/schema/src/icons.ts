// Tipe data ikon bersama (AD-9): katalog (`@lakar/icons`), exec, daemon, dan render memakainya.
// Tanpa IO. Render menerima glyph sebagai data JSON (lewat opsi render), bukan impor pustaka ikon.

/** Pustaka ikon v1. Lucide = ikon UI; Simple Icons = khusus logo brand. */
export const ICON_LIBS = ['lucide', 'simple-icons'] as const;
export type IconLib = (typeof ICON_LIBS)[number];

/** Pencarian ikon (`icon_search`, `iconSearch`, katalog): jumlah hasil default dan maksimum. */
export const ICON_SEARCH_DEFAULT_LIMIT = 10;
export const ICON_SEARCH_MAX_LIMIT = 50;

/** Nama ikon kanonik: huruf kecil/angka, `-` dan `_` (beberapa slug simple-icons memakai `_`). */
export const ICON_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** Satu elemen SVG glyph: `[tag, atribut]`, mis. `['path', {d: 'M3 10…'}]`. */
export type IconGlyphNode = readonly [tag: string, attrs: Readonly<Record<string, string>>];

/**
 * Data gambar satu ikon (serializable). `kind: 'stroke'` (lucide) digambar dengan stroke `color`;
 * `kind: 'fill'` (simple-icons) diisi `color` (default `brandColor`).
 */
export type IconGlyph = {
  lib: IconLib;
  icon: string;
  viewBox: readonly [number, number, number, number];
  kind: 'stroke' | 'fill';
  nodes: readonly IconGlyphNode[];
  /** Warna brand `#RRGGBB` (simple-icons). */
  brandColor?: string;
};

/** Satu hasil `iconSearch`. `aliasOf` ada bila yang cocok adalah alias (nilai = nama kanonik). */
export type IconMatch = {
  lib: IconLib;
  icon: string;
  tags?: string[];
  title?: string;
  aliasOf?: string;
};

/** Kunci ikon `"lib/icon"` (peta glyph render, daftar ref). */
export const iconKey = (lib: string, icon: string): string => `${lib}/${icon}`;
