/// <reference lib="dom" />
// Geometri board live (editor-canvas story 4): kotak tiap node diukur dari elemen `[data-lakar-id]` di shadow root
// board (liveBoard.ts) lalu dipetakan ke pohon `GeoNode` (gesture.ts) dalam koordinat halaman. Struktur pohon,
// x/y tersimpan, dan aturan flow/absolute diambil dari board dokumen ter-resolve (sama dengan render layout.ts).
import { NODE_ATTR } from '@lakar/render';
import type { BoardNode, ChildNode } from '@lakar/schema';
import type { GeoNode } from './gesture.js';

/** Elemen node `id` di shadow root board live `host`. */
export function liveElement(host: HTMLElement, id: string): HTMLElement | undefined {
  return host.shadowRoot?.querySelector<HTMLElement>(`[${NODE_ATTR}="${CSS.escape(id)}"]`) ?? undefined;
}

/**
 * Pohon geometri board `board` (posisi halaman `at`) dari DOM live di `host`. Skala = lebar layar elemen board /
 * lebar board. Node tanpa elemen (belum di-mount) dilewati bersama turunannya. Board belum di-mount → undefined.
 */
export function measureBoard(host: HTMLElement, board: BoardNode, at: { x: number; y: number }): GeoNode | undefined {
  const els = new Map<string, Element>();
  for (const el of host.shadowRoot?.querySelectorAll(`[${NODE_ATTR}]`) ?? []) {
    const id = el.getAttribute(NODE_ATTR);
    if (id && !els.has(id)) els.set(id, el);
  }
  const boardEl = els.get(board.id);
  if (!boardEl) return undefined;
  const br = boardEl.getBoundingClientRect();
  const k = board.width > 0 && br.width > 0 ? br.width / board.width : 1;
  const boxOf = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: at.x + (r.left - br.left) / k, y: at.y + (r.top - br.top) / k, w: r.width / k, h: r.height / k };
  };
  const child = (n: ChildNode, parentId: string, parentLayout: 'row' | 'column' | 'none'): GeoNode | undefined => {
    const el = els.get(n.id);
    if (!el) return undefined;
    const absolute = parentLayout === 'none' || n.position === 'absolute';
    const layout = n.type === 'frame' ? (n.layout ?? 'none') : undefined;
    const g: GeoNode = {
      id: n.id,
      type: n.type,
      name: n.name,
      box: boxOf(el),
      parentId,
      absolute,
      x: absolute ? (n.x ?? 0) : 0,
      y: absolute ? (n.y ?? 0) : 0,
      layout,
      children: [],
    };
    if (n.type === 'frame') for (const c of n.children) {
      const cg = child(c, n.id, layout ?? 'none');
      if (cg) g.children.push(cg);
    }
    return g;
  };
  const root: GeoNode = {
    id: board.id,
    type: 'board',
    name: board.name,
    box: { x: at.x, y: at.y, w: board.width, h: board.height },
    parentId: undefined,
    absolute: true,
    x: board.x,
    y: board.y,
    layout: 'column',
    children: [],
  };
  for (const c of board.children) {
    const cg = child(c, board.id, 'column');
    if (cg) root.children.push(cg);
  }
  return root;
}
