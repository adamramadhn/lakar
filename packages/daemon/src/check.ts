// Pipeline check G0 di daemon (AD-8): per board → glyphScan (allowGlyphs) → RenderPort.measure → checkBoard.
import { checkBoard, glyphScan, sortFindings } from '@lakar/check';
import type { BoardMeasure, RenderPort } from '@lakar/ports';
import { findBoard } from '@lakar/render';
import { LakarError, summarizeFindings, type Finding, type FindingSummary, type ResolvedDocument } from '@lakar/schema';

export type BoardCheck = { id: string; name: string; summary: FindingSummary };
export type CheckRun = { boards: BoardCheck[]; findings: Finding[]; measures: Map<string, BoardMeasure> };

/**
 * Render + check board `boardIds` secara berurutan (satu halaman Chromium). Error render (FONT_MISSING,
 * NOT_FOUND, ICON_UNKNOWN, RENDER_FAILED) dilempar apa adanya. Temuan: error lalu warning, lalu urutan dokumen.
 */
export async function runCheck(render: RenderPort<ResolvedDocument>, resolved: ResolvedDocument, boardIds: readonly string[]): Promise<CheckRun> {
  const boards: BoardCheck[] = [];
  const findings: Finding[] = [];
  const measures = new Map<string, BoardMeasure>();
  for (const id of boardIds) {
    const board = findBoard(resolved, id);
    if (!board) throw new LakarError('NOT_FOUND', `board ${id} tidak ada`, { hint: 'pakai ID board dari created[] execute' });
    const { allowGlyphs } = glyphScan(board);
    const measure = await render.measure(resolved, id, { allowGlyphs });
    measures.set(id, measure);
    const list = checkBoard({ doc: resolved, boardId: id, measure });
    boards.push({ id, name: board.name, summary: summarizeFindings(list) });
    findings.push(...list);
  }
  // Urutan dokumen antarboard sudah terjaga (board diproses urut); sort stabil hanya memisah level.
  return { boards, findings: sortFindings(findings), measures };
}
