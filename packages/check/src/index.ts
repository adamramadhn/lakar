// Check G0 (AD-8): aturan murni atas dokumen ter-resolve + hasil ukur render (BoardMeasure).
// Arah spine: check → schema, ports saja.
import type { BoardMeasure } from '@lakar/ports';
import { findBoard, type Finding, type ResolvedBoardNode as BoardNode, type ResolvedDocument } from '@lakar/schema';
import { codePoints, graphemes, isEmojiGrapheme, leadingIconGlyph, onlyIconGlyphs } from './glyphs.js';
import { capWarnings, lc01a, lc01b, lc02a, lc02b, lc02c, lc03, lc04, lc05, lc06, lc07, lc08, lc09, lc10, lc11, lc12, lc13, lc14, lc15, lc16, lc17, lc18, lc19, lc20, lc21, lc22, lc23, lc24, lc25, lc26, lc27, lc28, lc29, lc30, lc31, lc32, lc33 } from './rules.js';
import { boardContext, withoutSkeletons } from './tree.js';

export const PACKAGE = '@lakar/check';

export { codePoints, emojiIn, graphemes, isEmojiGrapheme, leadingIconGlyph, LC01B_GLYPHS, onlyIconGlyphs } from './glyphs.js';
export {
  BOTTOM_BAR_CLEARANCE,
  BOX_CLEARANCE_MAX,
  BOX_OVERFLOW_MIN,
  BOTTOM_BAR_MAX_GAP,
  boardHeightOf,
  bottomZone,
  CONVENTIONS,
  DEFAULT_LAYER_NAME,
  DRAWN_ICON_MAX,
  EFFECT_AREA_RATIO,
  EFFECT_BLUR_MIN,
  MAX_RADII,
  capWarnings,
  contrastRatio,
  lc01a,
  lc01b,
  lc02a,
  lc02b,
  lc02c,
  lc03,
  lc04,
  lc05,
  lc06,
  lc07,
  lc08,
  lc09,
  lc10,
  lc11,
  lc12,
  lc13,
  lc14,
  lc15,
  lc16,
  lc17,
  lc18,
  lc19,
  lc20,
  lc21,
  lc22,
  lc23,
  lc24,
  lc25,
  lc26,
  lc27,
  lc28,
  lc29,
  lc30,
  lc31,
  lc32,
  lc33,
  skeletonIds,
  FIT_SLACK_MAX,
  LANDING_SLACK_MAX,
  LINE_HEIGHT_TOL,
  MAX_FONT_FAMILIES,
  MOBILE_MAX_WIDTH,
  PARAGRAPH_MIN_WORDS,
  TEXT_BOX_OVERFLOW_MIN,
  LIST_TOP_MIN,
  MAX_WARNINGS_PER_RULE,
  MIN_TEXT_SIZE,
  ORPHAN_MIN_BODY,
  paddingOf,
  parseHex,
  punctuated,
  RANGE_HYPHEN,
  SCREEN_SIZES,
  SECTION_MIN_NODES,
  SECTION_SIMILARITY_MIN,
  type BottomZone,
} from './rules.js';
export { CONTRAST_MIN, isLargeText, LARGE_TEXT } from '@lakar/schema';
export { changedNodeIds, touchedBoards } from './touched.js';
export {
  AUTOFIX,
  findingKey,
  mapPadding,
  nearestOf,
  planFixes,
  resolvedIndex,
  scaleLineHeight,
  staleFixes,
  type FixKind,
  type FixSkipReason,
  type PlanOptions,
  type PlannedFix,
  type SkippedFix,
} from './fixes.js';
export { TOLERANCE, visibleRect, withoutSkeletons } from './tree.js';

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

const RULE_ORDER = ['LC-01a', 'LC-01b', 'LC-02a', 'LC-02b', 'LC-02c', 'LC-03', 'LC-04', 'LC-05', 'LC-06', 'LC-07', 'LC-08', 'LC-09', 'LC-10', 'LC-11', 'LC-12', 'LC-13', 'LC-14', 'LC-15', 'LC-16', 'LC-17', 'LC-18', 'LC-19', 'LC-20', 'LC-21', 'LC-22', 'LC-23', 'LC-24', 'LC-25', 'LC-26', 'LC-27', 'LC-28', 'LC-29', 'LC-30', 'LC-31', 'LC-32', 'LC-33'];

const LEVEL_ORDER = { error: 0, warning: 1, info: 2 } as const;

/**
 * Urutan stabil: error, warning, lalu info; lalu urutan dokumen (`order` id → indeks) dan urutan aturan.
 * Tanpa `order`: hanya level dipisah, urutan masukan dipertahankan.
 */
export function sortFindings(findings: readonly Finding[], order?: ReadonlyMap<string, number>): Finding[] {
  return findings
    .map((f, i) => ({ f, i }))
    .sort(
      (a, b) =>
        LEVEL_ORDER[a.f.level] - LEVEL_ORDER[b.f.level] ||
        (order ? (order.get(a.f.nodeId) ?? 0) - (order.get(b.f.nodeId) ?? 0) || RULE_ORDER.indexOf(a.f.rule) - RULE_ORDER.indexOf(b.f.rule) : 0) ||
        a.i - b.i,
    )
    .map((x) => x.f);
}

/** Semua aturan yang berjalan untuk satu board (urutan stabil). Board tidak ada → []. */
export function checkBoard({
  doc,
  boardId,
  measure,
  heights,
  cap = true,
}: {
  doc: ResolvedDocument;
  boardId: string;
  measure: BoardMeasure;
  /** Tinggi terukur board `height:'hug'` lain di dokumen (tabrakan LC-12); tanpa entri = 0. Board ini = `measure`. */
  heights?: ReadonlyMap<string, number> | undefined;
  /** false = tanpa batas 3 warning/info per aturan (fix_check menerapkan semua fix; spec-check-autofix). */
  cap?: boolean | undefined;
}): Finding[] {
  const board = findBoard(doc, boardId);
  if (!board) return [];
  // Placeholder skeleton tidak dinilai aturan mana pun selain LC-33 (spec-skeleton-live-build).
  const full = boardContext(board, measure);
  const pruned = withoutSkeletons(board);
  const ctx = pruned === board ? full : boardContext(pruned, measure);
  const clipped = lc02a(ctx);
  const cut = new Set(clipped.map((f) => f.nodeId));
  // Teks yang sudah error LC-02a/LC-02b tidak dilaporkan lagi sebagai warning LC-03.
  const inkOver = lc02b(ctx).filter((f) => !cut.has(f.nodeId));
  const textCut = new Set([...cut, ...inkOver.map((f) => f.nodeId)]);
  const all = [
    ...lc01a(ctx),
    ...lc01b(ctx),
    ...clipped,
    // Teks yang elemennya sudah terpotong clip (LC-02a) tidak dilaporkan lagi sebagai luapan ink.
    ...inkOver,
    // Non-teks yang sudah terpotong clip (LC-02a) juga tidak dilaporkan lagi.
    ...lc02c(ctx, cut),
    ...lc03(ctx, textCut),
    ...lc04(ctx),
    ...lc05(ctx),
    ...lc06(ctx),
    ...lc07(ctx),
    ...lc08(ctx),
    ...lc09(ctx),
    ...lc10(ctx),
    ...lc11(ctx),
    // Ukuran/tinggi pas board menghitung placeholder: ruang yang dipesan skeleton bukan ruang kosong.
    ...lc12(full, doc, heights),
    ...lc13(ctx),
    ...lc14(ctx),
    ...lc15(ctx),
    ...lc16(ctx),
    ...lc17(ctx),
    ...lc18(ctx),
    ...lc19(ctx),
    ...lc20(ctx),
    ...lc21(ctx),
    ...lc22(ctx),
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
    ...lc32(doc, boardId),
    ...lc33(full),
  ];
  const sorted = sortFindings(all, ctx.order);
  return cap ? capWarnings(sorted) : sorted;
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
