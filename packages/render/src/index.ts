/// <reference lib="dom" />
// Render murni: dokumen (sudah di-resolve) → DOM (AD-5, AD-6).
// HANYA `import type` dari luar paket dan impor relatif `./x.js`: dist/*.js dimuat apa adanya sebagai
// module di halaman Chromium (dan nanti browser B), tanpa bundler, tanpa API Node.
// Dokumen yang diterima sudah di-resolve token-nya oleh daemon (`resolveTokens`), jadi tipe `Resolved*`.
import type { ResolvedBoardNode as BoardNode, ResolvedDocument as LakarDocument } from '@lakar/schema';
import { codePointLabel, fontKey, fontRequests, loadFaces, missingFaces, uncoveredGlyphs, type FontFaceSource, type FontRequest } from './fonts.js';
import { mountBoardNode } from './layout.js';
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
export { measureBoard, type BoardMeasure, type NodeBounds, type TextMeasure } from './measure.js';

/** Argumen Chromium bersama daemon dan harness tes (stabilitas golden). */
export const CHROMIUM_ARGS: readonly string[] = ['--font-render-hinting=none', '--force-color-profile=srgb', '--disable-lcd-text'];

/** Hasil `renderBoard`, serializable lintas `page.evaluate` (bukan exception). */
export type RenderResult =
  | { ok: true; measure: BoardMeasure }
  | { ok: false; code: 'FONT_MISSING'; missing: FontRequest[]; message: string };

export function findBoard(doc: LakarDocument, boardId: string): BoardNode | undefined {
  for (const p of doc.pages) for (const b of p.children) if (b.id === boardId) return b;
  return undefined;
}

/** Ganti isi `root` dengan DOM board `boardId` (tanpa memuat font). Mengembalikan elemen board. */
export function mountBoard(doc: LakarDocument, boardId: string, root: HTMLElement): HTMLElement {
  const board = findBoard(doc, boardId);
  if (!board) throw new Error(`board ${boardId} tidak ada`);
  return mountBoardNode(board, root);
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
 * Render + ukur board. Alur: cek face untuk setiap varian teks → cek cakupan glyph (`unicode-range`)
 * → muat face → mount →
 * `fonts.ready` + 2 rAF → verifikasi ulang status `loaded` → ukur.
 * Board tidak ada → exception (bukan FONT_MISSING).
 */
export async function renderBoard(
  doc: LakarDocument,
  boardId: string,
  root: HTMLElement,
  opts: { fonts: readonly FontFaceSource[] },
): Promise<RenderResult> {
  const board = findBoard(doc, boardId);
  if (!board) throw new Error(`board ${boardId} tidak ada`);
  const d = root.ownerDocument;
  const requests = fontRequests(board);
  const absent = missingFaces(requests, opts.fonts);
  if (absent.length) return fontMissing(absent, 'font tidak diberikan');
  // 1b. Karakter di luar unicode-range face akan dirender Chromium dengan font sistem → tolak.
  const uncovered = uncoveredGlyphs(board, opts.fonts);
  if (uncovered.length) {
    const missing = [...new Map(uncovered.map((u) => [fontKey(u.request), u.request])).values()];
    const chars = uncovered.map((u) => `${JSON.stringify(u.char)} ${codePointLabel(u.codePoint)} di teks ${u.nodeId} (${describe(u.request)})`);
    return { ok: false, code: 'FONT_MISSING', missing, message: `karakter tidak tercakup font: ${chars.join(', ')}` };
  }
  const { failed, byRequest } = await loadFaces(d, opts.fonts);
  if (failed.length) return fontMissing(failed, 'font gagal dimuat');
  const el = mountBoardNode(board, root);
  await d.fonts.ready;
  const w = d.defaultView!;
  await nextFrame(w);
  await nextFrame(w);
  const notLoaded = requests.filter((r) => (byRequest.get(fontKey(r)) ?? []).some((f) => f.status !== 'loaded' || !d.fonts.has(f)));
  if (notLoaded.length) return fontMissing(notLoaded, 'font tidak berstatus loaded');
  return { ok: true, measure: measureBoard(el) };
}
