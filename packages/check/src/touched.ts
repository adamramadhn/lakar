// Board dan node yang berubah antara dua dokumen ter-resolve (bahan check dan bounds execute). Murni.
import type { ResolvedBoardNode as BoardNode, ResolvedChildNode as ChildNode, ResolvedDocument } from '@lakar/schema';

const boardsOf = (doc: ResolvedDocument): BoardNode[] => doc.pages.flatMap((p) => p.children);

/**
 * Board tersentuh: ada di `after` tetapi tidak di `before`, atau JSON-nya (sudah ter-resolve, jadi
 * perubahan token ikut terdeteksi) berbeda. Urutan dokumen `after`.
 */
export function touchedBoards(before: ResolvedDocument, after: ResolvedDocument): string[] {
  const old = new Map(boardsOf(before).map((b) => [b.id, JSON.stringify(b)]));
  return boardsOf(after)
    .filter((b) => old.get(b.id) !== JSON.stringify(b))
    .map((b) => b.id);
}

type Info = { props: string; parent: string; index: number };

function index(boards: readonly BoardNode[]): Map<string, Info> {
  const out = new Map<string, Info>();
  const walk = (parentId: string, children: readonly ChildNode[]) => {
    children.forEach((c, i) => {
      const { children: _c, ...props } = c as ChildNode & { children?: unknown };
      out.set(c.id, { props: JSON.stringify(props), parent: parentId, index: i });
      if (c.type === 'frame') walk(c.id, c.children);
    });
  };
  for (const b of boards) walk(b.id, b.children);
  return out;
}

/**
 * Node anak di board `boardIds` (dokumen `after`) yang baru, atau yang properti, parent, atau indeksnya
 * berubah. Urutan dokumen.
 */
export function changedNodeIds(before: ResolvedDocument, after: ResolvedDocument, boardIds: readonly string[]): string[] {
  const want = new Set(boardIds);
  const old = index(boardsOf(before));
  const now = index(boardsOf(after).filter((b) => want.has(b.id)));
  const out: string[] = [];
  for (const [id, info] of now) {
    const prev = old.get(id);
    if (!prev || prev.props !== info.props || prev.parent !== info.parent || prev.index !== info.index) out.push(id);
  }
  return out;
}
