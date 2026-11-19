/// <reference lib="dom" />
// Pengukuran DOM hasil render (AD-5): satu-satunya sumber bounds dan baris teks.
import { NODE_ATTR } from './layout.js';

import type { BoardMeasure, NodeBounds, TextMeasure } from '@lakar/ports';

// Tipe hasil ukur didefinisikan di ports (dipakai bersama check dan daemon).
export type { BoardMeasure, NodeBounds, TextMeasure };

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
    if (n.dataset.lakarText !== undefined) texts.push({ id, ...measureLines(n, r.height, origin) });
  }
  return { width: origin.width, height: origin.height, nodes, texts };
}

/**
 * Baris = jumlah `top` berbeda (dibulatkan 0,5px) dari `Range.getClientRects()` node teks.
 * Ink = gabungan kotak Range setiap rangkaian karakter non-spasi (spasi di ujung/pembungkus tidak menambah lebar),
 * relatif board; vertikal tiap kotak dinormalkan ke kotak baris (pusat kotak glyph ± line-height/2).
 */
function measureLines(el: HTMLElement, height: number, origin: DOMRect): Omit<TextMeasure, 'id'> {
  const tops = new Set<number>();
  const range = el.ownerDocument.createRange();
  const css = parseFloat(el.ownerDocument.defaultView!.getComputedStyle(el).lineHeight);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const child of el.childNodes) {
    if (child.nodeType !== 3 /* TEXT_NODE */) continue;
    range.selectNodeContents(child);
    for (const r of range.getClientRects()) tops.add(half(r.top));
    const data = (child as Text).data;
    for (const m of data.matchAll(/\S+/gu)) {
      range.setStart(child, m.index);
      range.setEnd(child, m.index + m[0].length);
      for (const r of range.getClientRects()) {
        if (r.width <= 0 && r.height <= 0) continue;
        const cy = r.top + r.height / 2;
        const h = Number.isFinite(css) ? css : r.height;
        x0 = Math.min(x0, r.left);
        x1 = Math.max(x1, r.right);
        y0 = Math.min(y0, cy - h / 2);
        y1 = Math.max(y1, cy + h / 2);
      }
    }
  }
  range.detach();
  const lines = tops.size;
  const lineHeight = Number.isFinite(css) ? css : lines > 0 ? height / lines : 0;
  const out: Omit<TextMeasure, 'id'> = { lines, lineHeight };
  if (x1 > x0) out.ink = { x: x0 - origin.left, y: y0 - origin.top, width: x1 - x0, height: y1 - y0 };
  return out;
}
