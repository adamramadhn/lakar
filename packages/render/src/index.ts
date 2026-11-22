/// <reference lib="dom" />
// Render murni: dokumen (sudah di-resolve) → DOM (AD-5, AD-6).
// HANYA `import type` dari luar paket dan impor relatif `./x.js`: dist/*.js dimuat apa adanya sebagai
// module di halaman Chromium (dan nanti browser B), tanpa bundler, tanpa API Node.
// Dokumen yang diterima sudah di-resolve token-nya oleh daemon lewat pipa `resolveDocument` (AD-10), jadi tipe `Resolved*`.
import type { IconGlyph, ResolvedBoardNode as BoardNode, ResolvedDocument as LakarDocument } from '@lakar/schema';
import { codePointLabel, fontKey, fontRequests, loadFaces, missingFaces, uncoveredGlyphs, type FontFaceSource, type FontRequest } from './fonts.js';
import { assetIds, decodeAssets, decodeDataUrls, inlineDataUrls } from './assets.js';
import { mountBoardNode } from './layout.js';
import { glyphMap, iconKey, iconRefs } from './icon.js';
import { DEFAULT_ASSET_BASE } from './paint.js';
import { measureBoard, type BoardMeasure } from './measure.js';

export const PACKAGE = '@lakar/render';
export { NODE_ATTR } from './layout.js';
export {
  DEFAULT_FONT,
  fontRequests,
  parseUnicodeRange,
  uncoveredGlyphs,
  type FontFaceSource,
  type FontRequest,
  type FontStyle,
  type UncoveredGlyph,
} from './fonts.js';
export { assetIds } from './assets.js';
export { DEFAULT_ICON_COLOR, DEFAULT_ICON_STROKE_WIDTH, iconKey, iconRefs, type IconRef } from './icon.js';
export { DEFAULT_ASSET_BASE, DROP_SHADOW_BLUR_FACTOR } from './paint.js';
export { ellipseShape, pathShape, shapeFillLayerDecls, strokeSvgSpec, svgPaint, type Shape, type ViewBox } from './shape.js';
export { iconSvgSpec } from './icon.js';
export { vectorToSvg, type SvgDropped, type SvgExport } from './svg.js';
export { IDENTITY, PathDataError, arcToCubics, flattenArcs, isIdentity, multiply, parsePath, pathBounds, serializePath, transformPath, type Matrix, type PathSeg } from './path-data.js';
// Pemetaan CSS tunggal (AD-5): dipakai render, Copy as viewer, dan codegen.
export {
  BOARD_DEFAULT_BACKGROUND,
  boardDecls,
  boxPaintDecls,
  boxShadowWithStrokeCss,
  childLayoutDecls,
  codeBackgroundDecls,
  DEFAULT_TEXT_COLOR,
  dropShadowFilterList,
  effectDecls,
  effectiveSizing,
  fillLayerCss,
  fillsBlendModeCss,
  frameDecls,
  frameLayout,
  strokeOverlayDecls,
  textDecls,
  textWrapMode,
  strokeBeforeFill,
  vectorSvgAttrs,
  type SvgAttr,
  type VectorLike,
  type VectorSvgAttrs,
  tokenValueCss,
  type ChildLike,
  type EffectsLike,
  type FillLike,
  type FrameLike,
  type ParentLayout,
  type SizingLike,
  type StrokeLike,
  type SvgSpec,
  type TextLike,
  ALIGN,
  backgroundCss,
  boxShadowsCss,
  colorCss,
  cssVarName,
  fontFamilyCss,
  fontWeightCss,
  gradientLayerCss,
  gridLineCss,
  gridTemplateCss,
  gridTrackCss,
  isTokenRef,
  JUSTIFY,
  lengthCss,
  letterSpacingCss,
  lineHeightCss,
  paddingCss,
  percentCss,
  radiusCss,
  shadowCss,
  stopsCss,
  strokeBorderDecls,
  textShadowCss,
  textShadowItemCss,
  tokenVar,
  type CssDecl,
  type PaintLike,
  type ShadowLike,
  type StopLike,
  type TokenRef,
} from './css.js';
// Impor CSS variables (epic token-tema story 2): kebalikan cssVarName, dipakai execute (lewat daemon) dan viewer.
export { CSS_IMPORT_MODE_NAME, CSS_IMPORT_TOKEN_NAME, parseCssColor, parseCssVariables } from './css-vars.js';
export { measureBoard, type BoardMeasure, type NodeBounds, type TextMeasure } from './measure.js';

/** Argumen Chromium bersama daemon dan harness tes (stabilitas golden). */
export const CHROMIUM_ARGS: readonly string[] = ['--font-render-hinting=none', '--force-color-profile=srgb', '--disable-lcd-text'];

/** Hasil `renderBoard`, serializable lintas `page.evaluate` (bukan exception). */
export type RenderResult =
  | { ok: true; measure: BoardMeasure }
  | { ok: false; code: 'FONT_MISSING'; missing: FontRequest[]; message: string }
  | { ok: false; code: 'NOT_FOUND'; assets: string[]; message: string }
  | { ok: false; code: 'ICON_UNKNOWN'; icons: string[]; message: string };

export function findBoard(doc: LakarDocument, boardId: string): BoardNode | undefined {
  for (const p of doc.pages) for (const b of p.children) if (b.id === boardId) return b;
  return undefined;
}

/**
 * Ganti isi `root` dengan DOM board `boardId` (tanpa memuat font). Mengembalikan elemen board.
 * `icons` = data glyph (JSON); ikon tanpa glyph → elemen kosong berukuran size.
 */
export function mountBoard(
  doc: LakarDocument,
  boardId: string,
  root: HTMLElement,
  opts: { assetBase?: string; icons?: readonly IconGlyph[] } = {},
): HTMLElement {
  const board = findBoard(doc, boardId);
  if (!board) throw new Error(`board ${boardId} tidak ada`);
  return mountBoardNode(board, root, { assetBase: opts.assetBase ?? DEFAULT_ASSET_BASE, icons: glyphMap(opts.icons) });
}

const describe = (r: FontRequest) => `${r.family} ${r.weight} ${r.style}`;
const fontMissing = (missing: FontRequest[], why: string): RenderResult => ({
  ok: false,
  code: 'FONT_MISSING',
  missing,
  message: `${why}: ${missing.map(describe).join(', ')}`,
});

const nextFrame = (w: Window) => new Promise<void>((r) => w.requestAnimationFrame(() => r()));

/**
 * Render + ukur board. Alur: cek glyph setiap node icon (`opts.icons`, tidak lengkap → ICON_UNKNOWN)
 * → cek face untuk setiap varian teks → cek cakupan glyph (`unicode-range`, kecuali `allowGlyphs`)
 * → muat face → muat + decode aset gambar (gagal → NOT_FOUND) → mount → decode bitmap efek (data URL; gagal diabaikan) →
 * `fonts.ready` + 2 rAF → verifikasi ulang status `loaded` → ukur.
 * Board tidak ada → exception (bukan FONT_MISSING).
 */
export async function renderBoard(
  doc: LakarDocument,
  boardId: string,
  root: HTMLElement,
  opts: {
    fonts: readonly FontFaceSource[];
    assetBase?: string | undefined;
    icons?: readonly IconGlyph[] | undefined;
    /** Code point yang boleh di luar cakupan font (langkah 1b). Hanya untuk ukur check; PNG tidak memakainya. */
    allowGlyphs?: readonly number[] | undefined;
  },
): Promise<RenderResult> {
  const board = findBoard(doc, boardId);
  if (!board) throw new Error(`board ${boardId} tidak ada`);
  const icons = glyphMap(opts.icons);
  const absentIcons = iconRefs(board)
    .map((r) => iconKey(r.lib, r.icon))
    .filter((k) => !icons.has(k));
  if (absentIcons.length) {
    return { ok: false, code: 'ICON_UNKNOWN', icons: absentIcons, message: `glyph ikon tidak diberikan: ${absentIcons.join(', ')}` };
  }
  const d = root.ownerDocument;
  const requests = fontRequests(board);
  const absent = missingFaces(requests, opts.fonts);
  if (absent.length) return fontMissing(absent, 'font tidak diberikan');
  // 1b. Karakter di luar unicode-range face akan dirender Chromium dengan font sistem → tolak.
  const uncovered = uncoveredGlyphs(board, opts.fonts, opts.allowGlyphs ?? []);
  if (uncovered.length) {
    const missing = [...new Map(uncovered.map((u) => [fontKey(u.request), u.request])).values()];
    const chars = uncovered.map((u) => `${JSON.stringify(u.char)} ${codePointLabel(u.codePoint)} di teks ${u.nodeId} (${describe(u.request)})`);
    return { ok: false, code: 'FONT_MISSING', missing, message: `karakter tidak tercakup font: ${chars.join(', ')}` };
  }
  const { failed, byRequest } = await loadFaces(d, opts.fonts);
  if (failed.length) return fontMissing(failed, 'font gagal dimuat');
  const assetBase = opts.assetBase ?? DEFAULT_ASSET_BASE;
  // `images` dipegang sampai pengukuran selesai (gambar ter-decode tidak dibuang sebelum dilukis).
  const { failed: absentAssets, images } = await decodeAssets(d, assetIds(board), assetBase);
  if (absentAssets.length) {
    return { ok: false, code: 'NOT_FOUND', assets: absentAssets, message: `aset gambar tidak bisa dimuat: ${absentAssets.join(', ')}` };
  }
  const el = mountBoardNode(board, root, { assetBase, icons });
  // Bitmap efek (mesh PNG, ubin noise SVG) di-decode sebelum 2 rAF dan ukur; dipegang sampai ukur selesai.
  const effectImages = await decodeDataUrls(d, inlineDataUrls(el));
  await d.fonts.ready;
  const w = d.defaultView!;
  await nextFrame(w);
  await nextFrame(w);
  const notLoaded = requests.filter((r) => (byRequest.get(fontKey(r)) ?? []).some((f) => f.status !== 'loaded' || !d.fonts.has(f)));
  if (notLoaded.length) return fontMissing(notLoaded, 'font tidak berstatus loaded');
  const measure = measureBoard(el);
  images.length = 0;
  effectImages.length = 0;
  return { ok: true, measure };
}
