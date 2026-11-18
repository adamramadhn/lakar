/// <reference lib="dom" />
// Pengukuran DOM hasil render (AD-5): satu-satunya sumber bounds dan baris teks.
import { NODE_ATTR } from './layout.js';

export type NodeBounds = { id: string; x: number; y: number; width: number; height: number };
export type TextMeasure = { id: string; lines: number; lineHeight: number };
/** Bounds relatif border-box board (float, px CSS). */
export type BoardMeasure = { width: number; height: number; nodes: NodeBounds[]; texts: TextMeasure[] };

const half = (v: number) => Math.round(v * 2) / 2;

/** Ukur board yang sudah di-mount (panggil setelah `fonts.ready` + 2 rAF). */
export function measureBoard(el: HTMLElement): BoardMeasure {
  const origin = el.getBoundingClientRect();
  const nodes: NodeBounds[] = [];
  const texts: TextMeasure[] = [];
  for (const n of el.querySelectorAll<HTMLElement>(`[${NODE_ATTR}]`)) {
    const id = n.getAttribute(NODE_ATTR)!;
    const r = n.getBoundingClientRect();
    nodes.push({ id, x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height });
    if (n.dataset.lakarText !== undefined) texts.push({ id, ...measureLines(n, r.height) });
  }
  return { width: origin.width, height: origin.height, nodes, texts };
}

/** Baris = jumlah `top` berbeda (dibulatkan 0,5px) dari `Range.getClientRects()` node teks. */
function measureLines(el: HTMLElement, height: number): { lines: number; lineHeight: number } {
  const tops = new Set<number>();
  const range = el.ownerDocument.createRange();
  for (const child of el.childNodes) {
    if (child.nodeType !== 3 /* TEXT_NODE */) continue;
    range.selectNodeContents(child);
    for (const r of range.getClientRects()) tops.add(half(r.top));
  }
  range.detach();
  const lines = tops.size;
  const css = parseFloat(el.ownerDocument.defaultView!.getComputedStyle(el).lineHeight);
  const lineHeight = Number.isFinite(css) ? css : lines > 0 ? height / lines : 0;
  return { lines, lineHeight };
}
