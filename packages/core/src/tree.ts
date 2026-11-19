// Navigasi pohon dokumen (halaman → board → node). Tanpa IO.
import type { AnyNode, BoardNode, FrameNode, LakarDocument as Doc, Page } from '@lakar/schema';

export type Container = BoardNode | FrameNode;

/** Lokasi node: wadah langsung (`siblings` = array anak halaman/board/frame), indeks, leluhur. */
export type Location = {
  node: AnyNode;
  page: Page;
  /** `null` = node adalah board (anak halaman). */
  parent: Container | null;
  siblings: AnyNode[];
  index: number;
  /** Leluhur dari board sampai parent langsung (tanpa node itu sendiri). */
  ancestors: Container[];
};

export const isContainer = (n: AnyNode): n is Container => n.type === 'board' || n.type === 'frame';

export function locate(doc: Doc, id: string): Location | undefined {
  const walk = (page: Page, parent: Container, ancestors: Container[]): Location | undefined => {
    const chain = [...ancestors, parent];
    for (let i = 0; i < parent.children.length; i++) {
      const n = parent.children[i]!;
      if (n.id === id) return { node: n, page, parent, siblings: parent.children, index: i, ancestors: chain };
      if (n.type === 'frame') {
        const hit = walk(page, n, chain);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  for (const page of doc.pages) {
    for (let i = 0; i < page.children.length; i++) {
      const b = page.children[i]!;
      if (b.id === id) return { node: b, page, parent: null, siblings: page.children, index: i, ancestors: [] };
      const hit = walk(page, b, []);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** Peta ID → {node, path nama dari board ke node} untuk seluruh dokumen. */
export function indexNodes(doc: Doc): Map<string, { node: AnyNode; path: string[] }> {
  const out = new Map<string, { node: AnyNode; path: string[] }>();
  const walk = (n: AnyNode, prefix: string[]) => {
    const path = [...prefix, n.name];
    out.set(n.id, { node: n, path });
    if ('children' in n) for (const c of n.children) walk(c, path);
  };
  for (const p of doc.pages) for (const b of p.children) walk(b, []);
  return out;
}

/** Semua node dalam subtree (pre-order, termasuk akar). */
export function subtree(n: AnyNode): AnyNode[] {
  const out: AnyNode[] = [n];
  if ('children' in n) for (const c of n.children) out.push(...subtree(c));
  return out;
}
