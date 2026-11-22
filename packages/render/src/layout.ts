/// <reference lib="dom" />
// Dokumen → DOM/CSS flexbox (AD-5). Aturan sizing/gap/posisi/teks/efek ditulis sekali sebagai deklarasi di css.ts
// (dipakai juga codegen); di sini hanya pembuatan elemen dan penerapan deklarasi dengan urutan tetap.
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
import { boardDecls, BOARD_DEFAULT_BACKGROUND, boxPaintDecls, childLayoutDecls, frameDecls, frameLayout, radiusCss, textDecls, type ParentLayout } from './css.js';
import { applyDecls, applyEffects, DEFAULT_ASSET_BASE, dropShadowFilters, applyFills, strokeOverlay } from './paint.js';
import { ellipseShape, fillLayer, pathShape, strokeSvg, type Shape } from './shape.js';
import { iconKey, renderIconElement } from './icon.js';

/** Atribut penanda node di DOM; daemon memakainya untuk screenshot elemen board. */
export const NODE_ATTR = 'data-lakar-id';

type Dim = number | 'hug' | 'fill' | undefined;

/** Konteks parent: arah flow (`none` = semua anak absolute) dan geser `scrollY` anak-anaknya. */
type Parent = { layout: ParentLayout; scrollY: number };

/** Konteks render: prefiks URL aset gambar dan glyph ikon (kunci `lib/icon`). */
export type RenderContext = { assetBase: string; icons: ReadonlyMap<string, IconGlyph> };
const DEFAULT_CTX: RenderContext = { assetBase: DEFAULT_ASSET_BASE, icons: new Map() };

/** Mount board ke `root` (ganti isinya). Board: kolom flex dari kiri atas, ukuran fixed, selalu clip. */
export function mountBoardNode(board: BoardNode, root: HTMLElement, ctx: RenderContext = DEFAULT_CTX): HTMLElement {
  const d = root.ownerDocument;
  const el = d.createElement('div');
  el.setAttribute(NODE_ATTR, board.id);
  applyDecls(el.style, boardDecls(board));
  if (!applyFills(el.style, board.fills, { assetBase: ctx.assetBase, doc: d, width: board.width, height: board.height })) el.style.background = BOARD_DEFAULT_BACKGROUND;
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
    // Gap negatif: CSS `gap` menolak nilai < 0 → margin pada anak flow ke-2 dst. (childLayoutDecls). Anak absolute
    // dilewati. Hanya flex row/column; grid mengabaikan gap negatif.
    let negativeGap: number | undefined;
    if (gap !== undefined && gap < 0 && (parent.layout === 'row' || parent.layout === 'column') && c.position !== 'absolute') {
      if (flowIndex > 0) negativeGap = gap;
      flowIndex++;
    }
    el.appendChild(renderChild(d, c, parent, ctx, negativeGap));
  }
}

function renderChild(d: Document, n: ChildNode, parent: Parent, ctx: RenderContext, negativeGap: number | undefined): HTMLElement {
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
  applyDecls(el.style, childLayoutDecls(n, parent.layout, { negativeGap }));
  // Efek bersama (termasuk text/icon) + geser scrollY parent di depan rotasi.
  applyEffects(el.style, n, parent.scrollY, filters);
  return el;
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
  applyFills(el.style, n.fills, fillContext(el.ownerDocument, n, ctx));
  applyDecls(el.style, boxPaintDecls(n, radius));
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
  applyDecls(el.style, frameDecls(n));
  const overlay = paintBox(el, n, radiusCss(n.radius), ctx);
  appendChildren(d, el, n.children, { layout: frameLayout(n), scrollY: n.scrollY ?? 0 }, n.gap, ctx);
  // Stroke dalam di atas anak (seperti Figma), tidak ikut scrollY.
  if (overlay) el.appendChild(overlay);
  return el;
}

function renderText(d: Document, n: TextNode): HTMLElement {
  const el = d.createElement('div');
  el.setAttribute(NODE_ATTR, n.id);
  el.dataset.lakarText = '';
  // Satu keluarga terdaftar, tanpa generic fallback (cssFamily); sisanya dari css.ts.
  applyDecls(el.style, textDecls(n, cssFamily(textFont(n).family)));
  el.textContent = n.content;
  return el;
}
