/// <reference lib="dom" />
// Render node icon (AD-9, AD-6): SVG dari data glyph yang diberikan pemanggil (daemon me-resolve dari
// katalog @lakar/icons). Render tidak mengimpor pustaka ikon; elemen dibuat dengan createElementNS dari
// daftar `[tag, attrs]`, tidak lewat innerHTML.
//
// Semantik gambar:
// - lucide (`kind: 'stroke'`): stroke = `color` (default #000000), stroke-width = `strokeWidth` dalam unit grid
//   24 (default 2), linecap/linejoin round, fill none; `filled: true` → bentuk diisi `color`. Atribut glyph
//   `fill="currentColor"` → `color`.
// - simple-icons (`kind: 'fill'`): fill = `color` (default warna brand); `strokeWidth`/`filled` diabaikan.
// - Kotak node = size×size; viewBox glyph dipetakan penuh; overflow terlihat (stroke tepi tidak terpotong).
import type { IconGlyph, ResolvedBoardNode as BoardNode, ResolvedChildNode as ChildNode, ResolvedIconNode as IconNode } from '@lakar/schema';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Default stroke lucide (sama dengan `strokeWidth` default lucide). */
export const DEFAULT_ICON_STROKE_WIDTH = 2;
/** Default warna ikon lucide (sama dengan teks). */
export const DEFAULT_ICON_COLOR = '#000000';

/** Elemen glyph yang boleh dibuat (bentuk SVG dasar saja). */
const TAGS = new Set(['path', 'circle', 'rect', 'line', 'ellipse', 'polyline', 'polygon', 'g']);
/** Atribut glyph yang boleh disalin (geometri + paint); handler `on*`/href tidak pernah disalin. */
const ATTR = /^(?:d|cx|cy|r|rx|ry|x|y|x1|x2|y1|y2|width|height|points|fill|stroke|stroke-width|fill-rule|clip-rule|transform|opacity)$/;

/** Kunci ikon `lib/icon` (sama dengan `iconKey` @lakar/schema; render tidak boleh impor runtime). */
export const iconKey = (lib: string, icon: string): string => `${lib}/${icon}`;

export type IconRef = { lib: string; icon: string };

/** Daftar unik `{lib, icon}` node icon di board (urut kemunculan), setara `fontRequests`. */
export function iconRefs(board: BoardNode): IconRef[] {
  const out = new Map<string, IconRef>();
  const walk = (nodes: readonly ChildNode[]) => {
    for (const n of nodes) {
      if (n.type === 'icon') {
        const k = iconKey(n.lib, n.icon);
        if (!out.has(k)) out.set(k, { lib: n.lib, icon: n.icon });
      } else if (n.type === 'frame') walk(n.children);
    }
  };
  walk(board.children);
  return [...out.values()];
}

/** Peta glyph berdasarkan `iconKey`. */
export function glyphMap(glyphs: readonly IconGlyph[] | undefined): Map<string, IconGlyph> {
  return new Map((glyphs ?? []).map((g) => [iconKey(g.lib, g.icon), g]));
}

/** Div berukuran (diatur layout) berisi SVG glyph; glyph tidak ada → div kosong. */
export function renderIconElement(d: Document, n: IconNode, glyph: IconGlyph | undefined, nodeAttr: string): HTMLElement {
  const el = d.createElement('div');
  el.setAttribute(nodeAttr, n.id);
  if (!glyph) return el;
  const svg = d.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', glyph.viewBox.join(' '));
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.overflow = 'visible';
  svg.style.display = 'block';
  let color: string;
  if (glyph.kind === 'stroke') {
    color = n.color ?? DEFAULT_ICON_COLOR;
    svg.setAttribute('fill', n.filled ? color : 'none');
    svg.setAttribute('stroke', color);
    svg.setAttribute('stroke-width', String(n.strokeWidth ?? DEFAULT_ICON_STROKE_WIDTH));
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  } else {
    color = n.color ?? glyph.brandColor ?? DEFAULT_ICON_COLOR;
    svg.setAttribute('fill', color);
  }
  for (const [tag, attrs] of glyph.nodes) {
    if (!TAGS.has(tag)) continue;
    const child = d.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (!ATTR.test(k)) continue;
      child.setAttribute(k, v === 'currentColor' ? color : v);
    }
    svg.appendChild(child);
  }
  el.appendChild(svg);
  return el;
}
