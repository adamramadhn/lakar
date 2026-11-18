// Kontrak antarmuka saja (hexagonal). `ports` tidak bergantung pada paket lain,
// jadi tipe dokumen diberikan sebagai parameter generik oleh pemakai.
export const PACKAGE = '@lakar/ports';

/** Render dokumen (sudah di-resolve) → PNG board. Adaptor: Chromium headless di daemon. */
export interface RenderPort<Doc = unknown> {
  /** PNG skala 1 (CSS px) dari board `boardId`. Gagal → LakarError `RENDER_FAILED` (retryable). */
  screenshot(doc: Doc, boardId: string): Promise<Uint8Array>;
}

/** Satu hasil pencarian ikon (struktural; sama dengan `IconMatch` @lakar/schema). */
export type IconCatalogMatch<Lib extends string = string> = {
  lib: Lib;
  icon: string;
  tags?: string[];
  title?: string;
  /** Ada bila `icon` adalah alias: nama kanonik ikon itu. */
  aliasOf?: string;
};

/**
 * Katalog ikon (AD-9). Adaptor: `IconCatalog` di `@lakar/icons` (lucide-static + simple-icons terpasang).
 * Exec memakainya untuk kanonikalisasi node icon dan `iconSearch`; daemon untuk glyph render.
 */
export interface IconCatalogPort<Lib extends string = string, Glyph = unknown> {
  /** Versi pustaka terpasang per lib, mis. `{lucide: '1.74.0', 'simple-icons': '16.38.0'}`. */
  readonly versions: Readonly<Record<Lib, string>>;
  /** Nama kanonik (alias dikonversi) + versi. Tidak dikenal → LakarError `ICON_UNKNOWN` (3 saran). */
  canonical(lib: Lib, icon: string): { icon: string; version: string };
  /** Cari ikon (urut skor). Query/opsi tidak valid → LakarError `SCHEMA_INVALID`. */
  search(query: string, opts?: { lib?: Lib; limit?: number }): IconCatalogMatch<Lib>[];
  /** Data gambar ikon, atau undefined bila tidak dikenal. */
  glyph(lib: Lib, icon: string): Glyph | undefined;
}
