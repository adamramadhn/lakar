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

/** Nilai token hasil impor CSS variables (bentuk JSON `TokenDef` @lakar/schema; ports tidak bergantung pada schema). */
export type CssTokenValue = string | number;

/** Satu variabel CSS yang menjadi token bertipe. `cssVarName(token) === variable` selalu berlaku (AD-11). */
export type CssVariableEntry = {
  /** Nama variabel sumber, mis. `--colors-bg`. */
  variable: string;
  /** Nama token, mis. `colors.bg`. */
  token: string;
  /** Tipe token (salah satu `TOKEN_TYPES`). */
  type: string;
  value: CssTokenValue;
  /** Nilai per mode yang berbeda dari `value`. */
  modes?: Record<string, CssTokenValue>;
  /** `update` = token bernama sama sudah ada di dokumen (definisinya diganti; ref tetap). */
  status: 'new' | 'update';
};

/** Alasan variabel/selektor dilewati (kode stabil; `detail` = kalimat Inggris pendek untuk UI). */
export type CssVariableSkipReason = 'invalid-name' | 'invalid-mode' | 'unsupported-selector' | 'unsupported-value' | 'mixed-values';

export type CssVariableSkip = { source: string; reason: CssVariableSkipReason; detail: string };

/** Hasil parse CSS variables: token bertipe, rencana `tokenModes` (null = tidak berubah), dan yang dilewati. */
export type CssVariablesImport = { entries: CssVariableEntry[]; tokenModes: string[] | null; skipped: CssVariableSkip[] };

/** Keadaan dokumen yang dipakai parser: token yang ada dan `tokenModes`. */
export type CssVariablesParseOptions = {
  /** Token dokumen: tipe menentukan nama/tipe ulang; `value`/`modes` dipakai untuk menggabung token bertipe sama. */
  tokens?: Readonly<Record<string, { readonly type: string; readonly value?: CssTokenValue; readonly modes?: Readonly<Record<string, CssTokenValue>> }>>;
  modes?: readonly string[];
};

/**
 * Parser CSS variables murni (epic token-tema story 2). Adaptor: `parseCssVariables` @lakar/render (di sebelah
 * `cssVarName`, AD-5/AD-11), disuntikkan daemon ke `execute` karena exec tidak bergantung pada render (AD-17).
 */
export interface CssVariablesPort {
  parse(css: string, opts?: CssVariablesParseOptions): CssVariablesImport;
}

// ---------------------------------------------------------------------------
// Token W3C DTCG (epic adopsi-open-pencil story 9)
// ---------------------------------------------------------------------------

/** Nilai token hasil impor DTCG, sudah dalam bentuk Lakar (`string|number`, mis. `"#RRGGBB"` atau `16`). */
export type DtcgTokenValue = string | number;

/** Satu token DTCG yang menjadi token bertipe Lakar. Nama token = path grup digabung `.`. */
export type DtcgEntry = {
  /** Path DTCG (sama dengan `token`). */
  path: string;
  /** Nama token, mis. `colors.accent`. */
  token: string;
  /** Tipe token (salah satu `TOKEN_TYPES`). */
  type: string;
  value: DtcgTokenValue;
  /** Nilai per mode yang berbeda dari `value` (dari `$extensions.mode`). */
  modes?: Record<string, DtcgTokenValue>;
  /** Target alias mentah `{a.b}` bila `$value` adalah referensi token (kolom Alias di UI). */
  alias?: string;
  /** `update` = token bernama sama sudah ada di dokumen (definisinya diganti; ref tetap). */
  status: 'new' | 'update';
};

/** Alasan token dilewati (kode stabil; `detail` = kalimat Inggris pendek untuk UI). */
export type DtcgSkipReason = 'invalid-name' | 'invalid-mode' | 'unsupported-type' | 'unsupported-value' | 'unknown-alias';

export type DtcgSkip = { source: string; reason: DtcgSkipReason; detail: string };

/** Hasil parse JSON DTCG: token bertipe, rencana `tokenModes` (null = tidak berubah), dan yang dilewati. */
export type DtcgImport = { entries: DtcgEntry[]; tokenModes: string[] | null; skipped: DtcgSkip[] };

/** Keadaan dokumen yang dipakai parser: token yang ada (status `update`) dan `tokenModes`. */
export type DtcgParseOptions = {
  tokens?: Readonly<Record<string, { readonly type: string; readonly value?: DtcgTokenValue; readonly modes?: Readonly<Record<string, DtcgTokenValue>> }>>;
  modes?: readonly string[];
};

/**
 * Parser JSON W3C DTCG murni. Adaptor: `parseDtcgTokens` @lakar/codegen (di sebelah `dtcgTokensJson`, ekspor/impor
 * memakai modul yang sama), disuntikkan daemon ke `execute` seperti `CssVariablesPort`. Input rusak (bukan JSON
 * objek) → `LakarError` `SCHEMA_INVALID`.
 */
export interface DtcgPort {
  parse(input: unknown, opts?: DtcgParseOptions): DtcgImport;
}
