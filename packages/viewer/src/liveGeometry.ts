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
 * Ukuran node `id` di board live `boardId` dalam koordinat desain (panel Design story 5: W/H hug/fill dan Fixed dari
 * ukuran terukur). Host `[data-live-board]` berukuran natural dan diskalakan `transform`, jadi skala = lebar layar host
 * ÷ `offsetWidth`. ID node/board alfanumerik (skema), sehingga aman dipakai langsung di selektor atribut.
 */
export function measureLiveSize(root: ParentNode, boardId: string, id: string): { w: number; h: number } | undefined {
  const host = root.querySelector<HTMLElement>(`[data-live-board="${boardId}"]`);
  const el = host?.shadowRoot?.querySelector(`[${NODE_ATTR}="${id}"]`);
  if (!host || !el) return undefined;
  const round = (n: number) => Math.round(n * 100) / 100;
  // Elemen HTML: ukuran layout tanpa transform (rotasi node dan skala kamera tidak menggelembungkan kotak).
  const box = el as Partial<HTMLElement>;
  if (typeof box.offsetWidth === 'number' && typeof box.offsetHeight === 'number') return { w: round(box.offsetWidth), h: round(box.offsetHeight) };
  // Elemen SVG (tanpa offsetWidth): kotak layar dibagi skala host.
  const hr = host.getBoundingClientRect();
  const k = host.offsetWidth > 0 && hr.width > 0 ? hr.width / host.offsetWidth : 1;
  const r = el.getBoundingClientRect();
  return { w: round(r.width / k), h: round(r.height / k) };
}

/**
 * Geometri halaman (editor-canvas story 6): board terukur apa adanya, board yang belum ter-mount menjadi stub tanpa
 * anak dengan kotak dari dokumen, supaya aksi board (urutan z, align, pilih semua) tetap tahu posisinya.
 */
export function pageGeometry(boards: readonly { id: string; name: string; x: number; y: number; width: number; height: number }[], measured: (id: string) => GeoNode | undefined): GeoNode[] {
  return boards.map(
    (b) => measured(b.id) ?? { id: b.id, type: 'board', name: b.name, box: { x: b.x, y: b.y, w: b.width, h: b.height }, parentId: undefined, absolute: true, x: b.x, y: b.y, layout: 'column', children: [] },
  );
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
  const child = (n: ChildNode, parentId: string, parentLayout: 'row' | 'column' | 'grid' | 'none'): GeoNode | undefined => {
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
