// Bahan endpoint baca (story 12): cari node di dokumen, daftar board, dan pohon `inspect` dengan bounds.
import type { BoardMeasure } from '@lakar/ports';

/** Node minimal yang dipakai di sini (struktural: berlaku untuk dokumen tersimpan maupun ter-resolve). */
type AnyTree = { id: string; name: string; children?: readonly AnyTree[] };
type DocLike<B extends AnyTree> = { pages: readonly { id: string; name: string; children: readonly B[] }[] };

/** Batas JSON `node` inspect; lebih besar → depth diturunkan sampai muat (`truncated: true`). */
export const INSPECT_MAX_BYTES = 32 * 1024;
export const INSPECT_DEPTH_DEFAULT = 2;
export const INSPECT_DEPTH_MAX = 6;
/** Prefiks nama board yang masih dikerjakan. */
export const WIP_PREFIX = '[WIP] ';

export type Located<B extends AnyTree> = { board: B; node: AnyTree; pageName: string };

/** Node `id` (board atau keturunannya) beserta board pemiliknya. */
export function locateNode<B extends AnyTree>(doc: DocLike<B>, id: string): Located<B> | undefined {
  const walk = (n: AnyTree): AnyTree | undefined => {
    if (n.id === id) return n;
    for (const c of n.children ?? []) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return undefined;
  };
  for (const p of doc.pages) {
    for (const b of p.children) {
      const node = walk(b);
      if (node) return { board: b, node, pageName: p.name };
    }
  }
  return undefined;
}

export type BoundsTuple = [number, number, number, number];

/** Bounds bulat relatif board dari hasil ukur: board = [0,0,w,h]. */
export function boundsMap(boardId: string, m: BoardMeasure): Map<string, BoundsTuple> {
  const out = new Map<string, BoundsTuple>([[boardId, [0, 0, Math.round(m.width), Math.round(m.height)]]]);
  for (const n of m.nodes) if (!out.has(n.id)) out.set(n.id, [Math.round(n.x), Math.round(n.y), Math.round(n.width), Math.round(n.height)]);
  return out;
}

/** Properti tersimpan (token apa adanya) + bounds + anak bersarang sampai `depth` (lebih dalam → childCount). */
export function inspectTree(node: AnyTree, bounds: ReadonlyMap<string, BoundsTuple>, depth: number): Record<string, unknown> {
  const { children, ...props } = node;
  const out: Record<string, unknown> = { ...props };
  const b = bounds.get(node.id);
  if (b) out.bounds = b;
  if (Array.isArray(children)) {
    if (depth > 0) out.children = children.map((c) => inspectTree(c, bounds, depth - 1));
    else out.childCount = children.length;
  }
  return out;
}

/** Pohon inspect yang muat `maxBytes` (depth diturunkan bila perlu). */
export function inspectFit(
  node: AnyTree,
  bounds: ReadonlyMap<string, BoundsTuple>,
  depth: number,
  maxBytes = INSPECT_MAX_BYTES,
): { node: Record<string, unknown>; depth: number; truncated: boolean } {
  for (let d = depth; d >= 0; d--) {
    const tree = inspectTree(node, bounds, d);
    if (d === 0 || Buffer.byteLength(JSON.stringify(tree)) <= maxBytes) return { node: tree, depth: d, truncated: d < depth };
  }
  /* c8 ignore next */
  throw new Error('tidak terjangkau');
}
