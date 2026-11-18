// Penelusuran pohon board (urutan dokumen) untuk aturan check. Murni.
import type { ResolvedBoardNode as BoardNode, ResolvedChildNode as ChildNode, ResolvedFrameNode as FrameNode } from '@lakar/schema';
import type { BoardMeasure, NodeBounds } from '@lakar/ports';

export type Container = BoardNode | FrameNode;
export type Rect = { x: number; y: number; width: number; height: number };

/** Toleransi pembulatan (px). */
export const TOLERANCE = 0.5;

export const area = (r: Rect): number => Math.max(0, r.width) * Math.max(0, r.height);
export const bottom = (r: Rect): number => r.y + r.height;
export const right = (r: Rect): number => r.x + r.width;

/** Anak flow (bukan absolute) dari parent: board selalu kolom; frame `layout` default `none`. */
export function isFlowChild(parent: Container, child: ChildNode): boolean {
  const layout = parent.type === 'board' ? 'column' : (parent.layout ?? 'none');
  return layout !== 'none' && child.position !== 'absolute';
}

export const named = (n: { name: string }, prefix: string): boolean => n.name.startsWith(prefix);

/** Konteks satu board: bounds per id dan urutan dokumen. */
export type BoardContext = {
  board: BoardNode;
  measure: BoardMeasure;
  boardRect: Rect;
  bounds: ReadonlyMap<string, NodeBounds>;
  /** id → indeks urutan dokumen (board = 0). */
  order: ReadonlyMap<string, number>;
  /** Semua node anak, urutan dokumen. */
  nodes: readonly ChildNode[];
  parentOf: ReadonlyMap<string, Container>;
};

export function boardContext(board: BoardNode, measure: BoardMeasure): BoardContext {
  const order = new Map<string, number>([[board.id, 0]]);
  const nodes: ChildNode[] = [];
  const parentOf = new Map<string, Container>();
  const walk = (parent: Container) => {
    for (const c of parent.children) {
      order.set(c.id, order.size);
      nodes.push(c);
      parentOf.set(c.id, parent);
      if (c.type === 'frame') walk(c);
    }
  };
  walk(board);
  return {
    board,
    measure,
    boardRect: { x: 0, y: 0, width: measure.width, height: measure.height },
    bounds: new Map(measure.nodes.map((n) => [n.id, n])),
    order,
    nodes,
    parentOf,
  };
}

/** Semua keturunan `n` (tanpa `n`). */
export function descendants(n: ChildNode): ChildNode[] {
  if (n.type !== 'frame') return [];
  const out: ChildNode[] = [];
  for (const c of n.children) out.push(c, ...descendants(c));
  return out;
}

/** Angka ringkas untuk teks temuan (maks 1 desimal). */
export const num = (v: number): string => String(Math.round(v * 10) / 10);

/** Kutip konten teks, dipotong 40 karakter. */
export function quote(s: string): string {
  const chars = [...s];
  return JSON.stringify(chars.length > 40 ? `${chars.slice(0, 40).join('')}…` : s);
}
