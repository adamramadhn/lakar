// Pipeline check G0 di daemon (AD-8): per board → glyphScan (allowGlyphs) → RenderPort.measure → checkBoard.
import { checkBoard, glyphScan, sortFindings } from '@lakar/check';
import type { BoardMeasure, RenderPort } from '@lakar/ports';
import { findBoard, summarizeFindings, type Finding, type FindingSummary, type ResolvedDocument } from '@lakar/schema';
import { notFound } from './errors.js';

export type BoardCheck = { id: string; name: string; summary: FindingSummary };
export type CheckRun = { boards: BoardCheck[]; findings: Finding[]; measures: Map<string, BoardMeasure> };

/**
 * Render + check board `boardIds`; board diukur paralel di pool render (AD-18). Error render (FONT_MISSING,
 * NOT_FOUND, ICON_UNKNOWN, RENDER_FAILED) dilempar apa adanya: yang pertama menurut urutan board.
 * Temuan: error lalu warning, lalu urutan dokumen (urutan hasil = urutan `boardIds`, bukan urutan selesai).
 */
export async function runCheck(
  render: RenderPort<ResolvedDocument>,
  resolved: ResolvedDocument,
  boardIds: readonly string[],
  /** Tinggi terukur board `height:'hug'` lain (tabrakan LC-12); ukuran run ini menimpanya. */
  heights: ReadonlyMap<string, number> = new Map(),
): Promise<CheckRun> {
  const boards: BoardCheck[] = [];
  const findings: Finding[] = [];
  const measures = new Map<string, BoardMeasure>();
  const targets = boardIds.map((id) => {
    const board = findBoard(resolved, id);
    if (!board) throw notFound(`board ${id} tidak ada`, 'pakai ID board dari created[] execute');
    return { id, board, allowGlyphs: glyphScan(board).allowGlyphs };
  });
  const settled = await Promise.allSettled(targets.map((t) => render.measure(resolved, t.id, { allowGlyphs: t.allowGlyphs })));
  for (const r of settled) if (r.status === 'rejected') throw r.reason;
  targets.forEach(({ id }, i) => measures.set(id, (settled[i] as PromiseFulfilledResult<BoardMeasure>).value));
  const known = new Map(heights);
  for (const [id, m] of measures) known.set(id, m.height);
  targets.forEach(({ id, board }) => {
    const measure = measures.get(id)!;
    const list = checkBoard({ doc: resolved, boardId: id, measure, heights: known });
    boards.push({ id, name: board.name, summary: summarizeFindings(list) });
    findings.push(...list);
  });
  // Urutan dokumen antarboard terjaga (hasil disusun menurut boardIds); sort stabil hanya memisah level.
  return { boards, findings: sortFindings(findings), measures };
}
