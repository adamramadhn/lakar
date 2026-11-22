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

import type { CssDecl, SvgSpec } from './css.js';
import { buildSvg, svgPaint } from './shape.js';

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

/**
 * Spesifikasi `<svg>` glyph ikon (render dan codegen, AD-5): kotak penuh, viewBox glyph, overflow terlihat. Warna
 * ref token → `currentColor` + `color: var(--…)` di style svg (lihat `svgPaint`).
 */
export function iconSvgSpec(
  n: { readonly color?: unknown; readonly filled?: unknown; readonly strokeWidth?: unknown },
  glyph: IconGlyph,
): SvgSpec {
  const style: CssDecl[] = [
    ['overflow', 'visible'],
    ['display', 'block'],
  ];
  const attrs: [string, string][] = [
    ['viewBox', glyph.viewBox.join(' ')],
    ['width', '100%'],
    ['height', '100%'],
    ['aria-hidden', 'true'],
  ];
  let color: string;
  if (glyph.kind === 'stroke') {
    color = svgPaint(n.color ?? DEFAULT_ICON_COLOR, style);
    const sw = typeof n.strokeWidth === 'number' ? n.strokeWidth : DEFAULT_ICON_STROKE_WIDTH;
    attrs.push(['fill', n.filled === true ? color : 'none'], ['stroke', color], ['stroke-width', String(sw)], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']);
  } else {
    color = svgPaint(n.color ?? glyph.brandColor ?? DEFAULT_ICON_COLOR, style);
    attrs.push(['fill', color]);
  }
  const children: SvgSpec[] = [];
  for (const [tag, a] of glyph.nodes) {
    if (!TAGS.has(tag)) continue;
    const ca: [string, string][] = [];
    for (const [k, v] of Object.entries(a)) if (ATTR.test(k)) ca.push([k, v === 'currentColor' ? color : v]);
    children.push({ tag, attrs: ca, style: [], children: [] });
  }
  return { tag: 'svg', attrs, style, children };
}

/** Div berukuran (diatur layout) berisi SVG glyph; glyph tidak ada → div kosong. */
export function renderIconElement(d: Document, n: IconNode, glyph: IconGlyph | undefined, nodeAttr: string): HTMLElement {
  const el = d.createElement('div');
  el.setAttribute(nodeAttr, n.id);
  if (glyph) el.appendChild(buildSvg(d, iconSvgSpec(n, glyph)));
  return el;
}

