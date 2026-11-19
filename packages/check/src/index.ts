// Check G0 (AD-8): aturan murni atas dokumen ter-resolve + hasil ukur render (BoardMeasure).
// Arah spine: check → schema, ports saja.
import type { BoardMeasure } from '@lakar/ports';
import { findBoard, type Finding, type ResolvedBoardNode as BoardNode, type ResolvedDocument } from '@lakar/schema';
import { codePoints, graphemes, isEmojiGrapheme, leadingIconGlyph, onlyIconGlyphs } from './glyphs.js';
import { capWarnings, lc01a, lc01b, lc02a, lc02b, lc04, lc05, lc11, lc12, lc18, lc20, lc23, lc24, lc25, lc26, lc27, lc28, lc29, lc30, lc31 } from './rules.js';
import { boardContext } from './tree.js';

export const PACKAGE = '@lakar/check';

export { codePoints, emojiIn, graphemes, isEmojiGrapheme, leadingIconGlyph, LC01B_GLYPHS, onlyIconGlyphs } from './glyphs.js';
export {
  BOTTOM_BAR_CLEARANCE,
  BOTTOM_BAR_MAX_GAP,
  bottomZone,
  capWarnings,
  CONTRAST_MIN,
  CONTRAST_MIN_LARGE,
  contrastRatio,
  isLargeText,
  lc01a,
  lc01b,
  lc02a,
  lc02b,
  lc04,
  lc05,
  lc11,
  lc12,
  lc18,
  lc20,
  lc23,
  lc24,
  lc25,
  lc26,
  lc27,
  lc28,
  lc29,
  lc30,
  lc31,
  FIT_SLACK_MAX,
  MAX_WARNINGS_PER_RULE,
  MIN_TEXT_SIZE,
  ORPHAN_MIN_BODY,
  paddingOf,
  parseHex,
  RANGE_HYPHEN,
  SCREEN_SIZES,
  type BottomZone,
} from './rules.js';
export { changedNodeIds, touchedBoards } from './touched.js';
export { TOLERANCE, visibleRect } from './tree.js';

const EMPTY_MEASURE: BoardMeasure = { width: 0, height: 0, nodes: [], texts: [] };

/**
 * Temuan glyph (LC-01a/b) tanpa render + code point yang harus di-allow saat ukur (agar board tetap
 * terukur dan agen menerima temuan LC, bukan FONT_MISSING).
 */
export function glyphScan(board: BoardNode): { findings: Finding[]; allowGlyphs: number[] } {
  const ctx = boardContext(board, EMPTY_MEASURE);
  // Code point grapheme temuan di-allow; code point yang juga muncul di grapheme bukan temuan (di teks mana pun
  // di board ini) TIDAK di-allow, agar glyph tak tercakup di luar temuan tetap FONT_MISSING (mis. "❤️ Favorit"
  // + "Suka ❤", atau VS16 pada "©️").
  const allow = new Set<number>();
  const deny = new Set<number>();
  for (const n of ctx.nodes) {
    if (n.type !== 'text') continue;
    const gs = graphemes(n.content);
    const lead = leadingIconGlyph(n.content);
    const leadIdx = lead ? gs.findIndex((g) => g.trim() !== '') : -1;
    const only = lead !== undefined && onlyIconGlyphs(n.content);
    gs.forEach((g, i) => {
      const isFinding = isEmojiGrapheme(g) || (lead !== undefined && g.trim() !== '' && (i === leadIdx || only));
      for (const cp of codePoints(g)) (isFinding ? allow : deny).add(cp);
    });
  }
  for (const cp of deny) allow.delete(cp);
  return { findings: [...lc01a(ctx), ...lc01b(ctx)], allowGlyphs: [...allow].sort((a, b) => a - b) };
}

const RULE_ORDER = ['LC-01a', 'LC-01b', 'LC-02a', 'LC-02b', 'LC-04', 'LC-05', 'LC-11', 'LC-12', 'LC-18', 'LC-20', 'LC-23', 'LC-24', 'LC-25', 'LC-26', 'LC-27', 'LC-28', 'LC-29', 'LC-30', 'LC-31'];

/**
 * Urutan stabil: error lalu warning, lalu urutan dokumen (`order` id → indeks) dan urutan aturan.
 * Tanpa `order`: hanya level dipisah, urutan masukan dipertahankan.
 */
export function sortFindings(findings: readonly Finding[], order?: ReadonlyMap<string, number>): Finding[] {
  return findings
    .map((f, i) => ({ f, i }))
    .sort(
      (a, b) =>
        (a.f.level === 'error' ? 0 : 1) - (b.f.level === 'error' ? 0 : 1) ||
        (order ? (order.get(a.f.nodeId) ?? 0) - (order.get(b.f.nodeId) ?? 0) || RULE_ORDER.indexOf(a.f.rule) - RULE_ORDER.indexOf(b.f.rule) : 0) ||
        a.i - b.i,
    )
    .map((x) => x.f);
}

/** Semua aturan G0 untuk satu board (urutan stabil). Board tidak ada → []. */
export function checkBoard({ doc, boardId, measure }: { doc: ResolvedDocument; boardId: string; measure: BoardMeasure }): Finding[] {
  const board = findBoard(doc, boardId);
  if (!board) return [];
  const ctx = boardContext(board, measure);
  const clipped = lc02a(ctx);
  const cut = new Set(clipped.map((f) => f.nodeId));
  const all = [
    ...lc01a(ctx),
    ...lc01b(ctx),
    ...clipped,
    // Teks yang elemennya sudah terpotong clip (LC-02a) tidak dilaporkan lagi sebagai luapan ink.
    ...lc02b(ctx).filter((f) => !cut.has(f.nodeId)),
    ...lc04(ctx),
    ...lc05(ctx),
    ...lc11(ctx),
    ...lc12(ctx, doc),
    ...lc18(ctx),
    ...lc20(ctx),
    ...lc23(ctx),
    ...lc24(ctx),
    ...lc25(ctx),
    ...lc26(ctx),
    ...lc27(ctx),
    ...lc28(ctx),
    ...lc29(ctx),
    ...lc30(ctx),
    // Mockup yang elemennya sudah terpotong clip (LC-02a) tidak dilaporkan lagi.
    ...lc31(ctx, cut),
  ];
  return capWarnings(sortFindings(all, ctx.order));
}

/** `[x, y, w, h]` dibulatkan, relatif board. */
export type BoundsTuple = [number, number, number, number];

/**
 * Bounds untuk `ids` (board → `[0,0,w,h]`, node → bounds terukur), maks `cap` entri; id tanpa ukuran
 * dilewati. `truncated` = jumlah entri yang tidak muat.
 */
export function boundsOf(
  measures: ReadonlyMap<string, BoardMeasure>,
  ids: readonly string[],
  cap = 60,
): { bounds: Record<string, BoundsTuple>; truncated: number } {
  const nodes = new Map<string, BoundsTuple>();
  for (const [id, m] of measures) {
    nodes.set(id, [0, 0, Math.round(m.width), Math.round(m.height)]);
    for (const n of m.nodes) if (!nodes.has(n.id)) nodes.set(n.id, [Math.round(n.x), Math.round(n.y), Math.round(n.width), Math.round(n.height)]);
  }
  const bounds: Record<string, BoundsTuple> = {};
  let count = 0;
  let truncated = 0;
  for (const id of new Set(ids)) {
    const b = nodes.get(id);
    if (!b) continue;
    if (count < cap) {
      bounds[id] = b;
      count++;
    } else truncated++;
  }
  return { bounds, truncated };
}
