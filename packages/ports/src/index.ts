// Kontrak antarmuka saja (hexagonal). `ports` tidak bergantung pada paket lain,
// jadi tipe dokumen diberikan sebagai parameter generik oleh pemakai.
export const PACKAGE = '@lakar/ports';

/** Bounds satu node hasil render, relatif border-box board (float, px CSS). */
export type NodeBounds = { id: string; x: number; y: number; width: number; height: number };
/** Kotak relatif border-box board (px CSS). */
export type InkRect = { x: number; y: number; width: number; height: number };
/**
 * Baris teks terukur. `ink` = gabungan kotak glyph (Range) dari karakter non-spasi pertama sampai terakhir, relatif
 * board; vertikal per baris = kotak baris (line-height). Bisa melewati bounds elemen (mis. teks `pre` di kolom sempit).
 * Teks kosong/hanya spasi: tanpa `ink`.
 */
export type TextMeasure = { id: string; lines: number; lineHeight: number; ink?: InkRect };
/** Hasil ukur board (AD-5): ukuran board + bounds setiap node anak (urutan DOM = urutan dokumen). */
export type BoardMeasure = { width: number; height: number; nodes: NodeBounds[]; texts: TextMeasure[] };

/** Opsi ukur: `allowGlyphs` = code point yang boleh di luar cakupan font (hanya untuk geometri, AD-8). */
export type MeasureOptions = { allowGlyphs?: readonly number[] };

/**
 * Opsi screenshot: `nodeId` = potret elemen node itu saja (di dalam board `boardId`);
 * `scale` = rasio piksel perangkat (2 = render asli DPR 2, bukan upscale). Default skala 1, seluruh board.
 */
export type ScreenshotOptions = { nodeId?: string; scale?: 1 | 2 };

/** Statistik pool render (AD-18) untuk `status`. `ready` = halaman hidup siap disewa. */
export type RenderStatus = {
  size: number;
  ready: number;
  idle: number;
  busy: number;
  waiting: number;
  recreated: number;
  peakBusy: number;
  browserVersion?: string;
  lastError?: string;
};

/** Render dokumen (sudah di-resolve) → PNG / ukuran board. Adaptor: Chromium headless di daemon. */
export interface RenderPort<Doc = unknown> {
  /** PNG (skala 1 = CSS px) dari board `boardId` atau node `opts.nodeId`. Gagal → LakarError `RENDER_FAILED` (retryable). */
  screenshot(doc: Doc, boardId: string, opts?: ScreenshotOptions): Promise<Uint8Array>;
  /**
   * Render + ukur board `boardId` (bahan check). Error sama dengan `screenshot`
   * (FONT_MISSING / NOT_FOUND / ICON_UNKNOWN / RENDER_FAILED).
   */
  measure(doc: Doc, boardId: string, opts?: MeasureOptions): Promise<BoardMeasure>;
  /** Statistik pool (opsional; adaptor tanpa pool / tiruan tes boleh tidak punya). */
  status?(): RenderStatus;
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

/** Foto stok yang sudah diimpor ke store aset (AD-10): dipakai fungsi snippet `photo(ref)`. */
export type PhotoInfo = {
  /** sha256 aset di store (dipakai di fill `{type:'image', assetId, fit}`). */
  assetId: string;
  width: number;
  height: number;
  /** Baris kredit siap pakai. */
  credit: string;
  license: string;
  creator: string;
  sourcePageUrl: string;
};

/**
 * Pustaka foto terimpor (sinkron; AD-7). Adaptor: `PhotoService` daemon, yang mengimpor ref literal snippet
 * sebelum snippet berjalan. Ref belum diimpor → undefined.
 */
export interface PhotoLibraryPort {
  resolve(ref: string): PhotoInfo | undefined;
}
