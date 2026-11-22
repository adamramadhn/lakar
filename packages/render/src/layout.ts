/// <reference lib="dom" />
// Pemetaan 1:1 dokumen → DOM/CSS flexbox (AD-5). Aturan sizing/gap/posisi/teks ditulis sekali di sini;
// nilai yang semantiknya dipakai bersama Copy as/codegen berasal dari css.ts.
// Elemen node TIDAK memakai CSS `border` (padding-box = border-box untuk x/y absolute); stroke memakai
// overlay internal + box-shadow (paint.ts) atau overlay SVG (shape.ts).
import type {
  IconGlyph,
  ResolvedBoardNode as BoardNode,
  ResolvedChildNode as ChildNode,
  ResolvedEllipseNode as EllipseNode,
  ResolvedFrameNode as FrameNode,
  ResolvedPathNode as PathNode,
  ResolvedRectNode as RectNode,
  ResolvedTextNode as TextNode,
} from '@lakar/schema';
import { cssFamily, textFont } from './fonts.js';
// Nilai bersama render/Copy as/codegen (radius, padding, teks, bayangan teks, align/justify) dari css.ts (AD-5).
import { ALIGN, JUSTIFY, letterSpacingCss, lineHeightCss, paddingCss, radiusCss, textShadowCss } from './css.js';
import { applyEffects, boxShadowCss, DEFAULT_ASSET_BASE, dropShadowFilters, applyFills, strokeOverlay } from './paint.js';
import { ellipseShape, fillLayer, pathShape, strokeSvg, type Shape } from './shape.js';
import { iconKey, renderIconElement } from './icon.js';

/** Atribut penanda node di DOM; daemon memakainya untuk screenshot elemen board. */
export const NODE_ATTR = 'data-lakar-id';

type Dim = number | 'hug' | 'fill' | undefined;
type Sized = {
  width?: Dim;
  height?: Dim;
  minWidth?: number | undefined;
  maxWidth?: number | undefined;
  minHeight?: number | undefined;
  maxHeight?: number | undefined;
};
type Positioned = { position?: 'absolute' | undefined; x?: number | undefined; y?: number | undefined };

/** Konteks parent: arah flow (`none` = semua anak absolute) dan geser `scrollY` anak-anaknya. */
type Parent = { layout: 'row' | 'column' | 'none'; scrollY: number };

/** Konteks render: prefiks URL aset gambar dan glyph ikon (kunci `lib/icon`). */
export type RenderContext = { assetBase: string; icons: ReadonlyMap<string, IconGlyph> };
const DEFAULT_CTX: RenderContext = { assetBase: DEFAULT_ASSET_BASE, icons: new Map() };

const px = (n: number) => `${n}px`;

/** Mount board ke `root` (ganti isinya). Board: kolom flex dari kiri atas, ukuran fixed, selalu clip. */
export function mountBoardNode(board: BoardNode, root: HTMLElement, ctx: RenderContext = DEFAULT_CTX): HTMLElement {
  const d = root.ownerDocument;
  const el = d.createElement('div');
  el.setAttribute(NODE_ATTR, board.id);
  Object.assign(el.style, {
    position: 'relative',
    boxSizing: 'border-box',
    width: px(board.width),
    height: px(board.height),
    overflow: 'hidden', // board selalu clip (AD-15)
    isolation: 'isolate', // blend anak dibatasi pada isi board
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  } satisfies Partial<CSSStyleDeclaration>);
  if (!applyFills(el.style, board.fills, { assetBase: ctx.assetBase, doc: d, width: board.width, height: board.height })) el.style.background = '#FFFFFF';
  appendChildren(d, el, board.children, { layout: 'column', scrollY: 0 }, undefined, ctx);
  root.replaceChildren(el);
  return el;
}

function appendChildren(
  d: Document,
  el: HTMLElement,
  children: readonly ChildNode[],
  parent: Parent,
  gap: number | undefined,
  ctx: RenderContext,
): void {
  let flowIndex = 0;
  for (const c of children) {
    const child = renderChild(d, c, parent, ctx);
    // Gap negatif: CSS `gap` menolak nilai < 0 → margin pada anak flow ke-2 dst. Anak absolute dilewati.
    if (gap !== undefined && gap < 0 && parent.layout !== 'none' && c.position !== 'absolute') {
      if (flowIndex > 0) {
        if (parent.layout === 'row') child.style.marginLeft = px(gap);
        else child.style.marginTop = px(gap);
      }
      flowIndex++;
    }
    el.appendChild(child);
  }
}

function renderChild(d: Document, n: ChildNode, parent: Parent, ctx: RenderContext): HTMLElement {
  let el: HTMLElement;
  /** Filter awal (drop-shadow bentuk mask) yang mendahului blur. */
  let filters: string[] = [];
  switch (n.type) {
    case 'frame':
      el = renderFrame(d, n, ctx);
      break;
    case 'text':
      el = renderText(d, n);
      break;
    case 'rect':
      el = renderBox(d, n, radiusCss(n.radius), ctx);
      break;
    case 'ellipse': {
      const shape = ellipseShape(n);
      if (shape === 'box') el = renderBox(d, n, '50%', ctx);
      else {
        el = renderShape(d, n, shape === 'empty' ? undefined : shape, ctx);
        if (shape !== 'empty') filters = dropShadowFilters(n.shadows);
      }
      break;
    }
    case 'path':
      el = renderShape(d, n, pathShape(n), ctx);
      filters = dropShadowFilters(n.shadows);
      break;
    case 'icon':
      el = renderIconElement(d, n, ctx.icons.get(iconKey(n.lib, n.icon)), NODE_ATTR);
      // Drop shadow mengikuti bentuk glyph (seperti path); inner/spread tidak didukung.
      filters = dropShadowFilters(n.shadows);
      break;
  }
  const s = el.style;
  s.boxSizing = 'border-box';
  s.margin = '0';
  const sizing = sizingOf(n);
  if (parent.layout === 'none' || n.position === 'absolute') applyAbsolute(s, n, sizing);
  else applyFlowSizing(s, sizing, parent.layout);
  applyMinMax(s, sizing);
  // Efek bersama (termasuk text/icon) + geser scrollY parent di depan rotasi.
  applyEffects(s, n, parent.scrollY, filters);
  return el;
}

/** Sizing efektif node (icon: `size` × `size`; path tanpa width/height atau hug: ukuran viewBox). */
function sizingOf(n: ChildNode): Sized {
  if (n.type === 'icon') return { width: n.size, height: n.size };
  if (n.type === 'path') {
    const [, , vw, vh] = n.viewBox;
    return { ...n, width: n.width === undefined || n.width === 'hug' ? vw : n.width, height: n.height === undefined || n.height === 'hug' ? vh : n.height };
  }
  // Teks `wrap`: lebar mengikuti sizing, tinggi selalu hug.
  if (n.type === 'text' && textWrap(n) === 'wrap') return { ...n, height: 'hug' };
  return n;
}

/** `wrap` default: `auto` bila width tidak diisi/hug, `wrap` bila width angka/fill. */
function textWrap(n: TextNode): 'auto' | 'wrap' | 'fixed' {
  return n.wrap ?? (typeof n.width === 'number' || n.width === 'fill' ? 'wrap' : 'auto');
}

/** Anak flow di parent flex. Sumbu utama = arah parent. */
function applyFlowSizing(s: CSSStyleDeclaration, z: Sized, layout: 'row' | 'column'): void {
  const mainKey = layout === 'row' ? 'width' : 'height';
  const crossKey = layout === 'row' ? 'height' : 'width';
  const main = z[mainKey];
  const cross = z[crossKey];
  if (typeof main === 'number') {
    s.flex = `0 0 ${px(main)}`;
    s[mainKey] = px(main);
  } else if (main === 'fill') {
    s.flex = '1 1 0px';
    s[layout === 'row' ? 'minWidth' : 'minHeight'] = '0';
  } else {
    s.flex = '0 0 auto';
  }
  if (typeof cross === 'number') s[crossKey] = px(cross);
  else if (cross === 'fill') {
    s.alignSelf = 'stretch';
    s[crossKey] = 'auto';
  } else if (cross === 'hug') s[crossKey] = 'fit-content';
  // tidak diisi → auto (ikut align parent)
}

/** Anak absolute (atau anak frame `none`): left/top relatif border-box parent, keluar dari flow. */
function applyAbsolute(s: CSSStyleDeclaration, n: Positioned & Sized, z: Sized): void {
  s.position = 'absolute';
  s.left = px(n.x ?? 0);
  s.top = px(n.y ?? 0);
  s.flex = '0 0 auto';
  for (const [key, end] of [
    ['width', 'right'],
    ['height', 'bottom'],
  ] as const) {
    const v = z[key];
    if (typeof v === 'number') s[key] = px(v);
    else if (v === 'fill') s[end] = '0';
    // hug/tidak diisi → ukuran konten sendiri, TIDAK diperas lebar containing block (bukan fit-content).
    else s[key] = 'max-content';
  }
}

/** min/max → CSS; menimpa `min-<dim>:0` milik fill. */
function applyMinMax(s: CSSStyleDeclaration, z: Sized): void {
  if (z.minWidth !== undefined) s.minWidth = px(z.minWidth);
  if (z.maxWidth !== undefined) s.maxWidth = px(z.maxWidth);
  if (z.minHeight !== undefined) s.minHeight = px(z.minHeight);
  if (z.maxHeight !== undefined) s.maxHeight = px(z.maxHeight);
}

/**
 * Paint box (frame/rect/ellipse penuh): fills → background berlapis, radius, box-shadow (stroke luar +
 * shadows). Mengembalikan overlay stroke dalam yang harus ditambahkan TERAKHIR (di atas anak).
 */
function paintBox(
  el: HTMLElement,
  n: Pick<RectNode, 'fills' | 'stroke' | 'shadows' | 'width' | 'height'>,
  radius: string | undefined,
  ctx: RenderContext,
): HTMLElement | undefined {
  const s = el.style;
  applyFills(s, n.fills, fillContext(el.ownerDocument, n, ctx));
  if (radius) s.borderRadius = radius;
  const shadow = boxShadowCss(n.stroke, n.shadows);
  if (shadow) s.boxShadow = shadow;
  return n.stroke ? strokeOverlay(el.ownerDocument, n.stroke, radius) : undefined;
}

/** Konteks fill node: ukuran kotak hanya bila tetap (angka); hug/fill → bitmap mesh default. */
function fillContext(d: Document, n: { width?: Dim; height?: Dim }, ctx: RenderContext) {
  return { assetBase: ctx.assetBase, doc: d, width: typeof n.width === 'number' ? n.width : undefined, height: typeof n.height === 'number' ? n.height : undefined };
}

/** rect dan ellipse tanpa busur: box CSS. */
function renderBox(d: Document, n: RectNode | EllipseNode, radius: string | undefined, ctx: RenderContext): HTMLElement {
  const el = d.createElement('div');
  el.setAttribute(NODE_ATTR, n.id);
  el.style.position = 'relative'; // acuan overlay stroke
  const overlay = paintBox(el, n, radius, ctx);
  if (overlay) el.appendChild(overlay);
  return el;
}

/** Ellipse busur dan path: lapisan fill ber-mask + overlay stroke SVG. `shape` undefined = tidak tergambar. */
function renderShape(d: Document, n: EllipseNode | PathNode, shape: Shape | undefined, ctx: RenderContext): HTMLElement {
  const el = d.createElement('div');
  el.setAttribute(NODE_ATTR, n.id);
  el.style.position = 'relative';
  if (!shape) return el;
  // Mesh pada bentuk ikut mask yang sama (lapisan fill ber-mask).
  const layer = fillLayer(d, shape);
  if (applyFills(layer.style, n.fills, fillContext(d, n, ctx))) el.appendChild(layer);
  const stroke = n.stroke ? strokeSvg(d, shape, n.stroke) : undefined;
  if (stroke) el.appendChild(stroke);
  return el;
}

function renderFrame(d: Document, n: FrameNode, ctx: RenderContext): HTMLElement {
  const el = d.createElement('div');
  el.setAttribute(NODE_ATTR, n.id);
  const s = el.style;
  s.position = 'relative'; // acuan anak absolute (border-box = padding-box: tanpa border)
  const layout = n.layout ?? 'none';
  if (layout === 'none') {
    s.display = 'block';
  } else {
    s.display = 'flex';
    s.flexDirection = layout;
    if (n.gap !== undefined && n.gap >= 0) s.gap = px(n.gap);
    if (n.align) s.alignItems = ALIGN[n.align]!;
    if (n.justify) s.justifyContent = JUSTIFY[n.justify]!;
  }
  if (n.padding !== undefined) s.padding = paddingCss(n.padding)!;
  if (n.clip) s.overflow = 'hidden';
  const overlay = paintBox(el, n, radiusCss(n.radius), ctx);
  appendChildren(d, el, n.children, { layout, scrollY: n.scrollY ?? 0 }, n.gap, ctx);
  // Stroke dalam di atas anak (seperti Figma), tidak ikut scrollY.
  if (overlay) el.appendChild(overlay);
  return el;
}

function renderText(d: Document, n: TextNode): HTMLElement {
  const el = d.createElement('div');
  el.setAttribute(NODE_ATTR, n.id);
  el.dataset.lakarText = '';
  const s = el.style;
  const f = textFont(n);
  s.fontFamily = cssFamily(f.family); // satu keluarga terdaftar, tanpa generic fallback
  s.fontWeight = String(f.weight);
  s.fontStyle = f.style;
  s.fontSize = px(n.size);
  if (n.lineHeight !== undefined) s.lineHeight = lineHeightCss(n.lineHeight)!;
  if (n.letterSpacing !== undefined) s.letterSpacing = letterSpacingCss(n.letterSpacing)!;
  if (n.align) s.textAlign = n.align;
  if (n.numeric === 'tabular') s.fontVariantNumeric = 'tabular-nums';
  s.color = n.color ?? '#000000';
  const shadow = textShadowCss(n.shadows);
  if (shadow) s.textShadow = shadow;
  const wrap = textWrap(n);
  if (wrap === 'auto') {
    s.whiteSpace = 'pre';
  } else {
    s.whiteSpace = 'pre-wrap';
    s.overflowWrap = 'break-word';
  }
  // `fixed`: width/height angka dari sizing; overflow tidak dipotong agar teks yang meluber tetap terlihat
  // (check LC-02b/LC-11 menilai luberan dari `measure.texts[].ink`, bukan dari bounds elemen).
  if (wrap === 'fixed') s.overflow = 'visible';
  el.textContent = n.content;
  return el;
}
