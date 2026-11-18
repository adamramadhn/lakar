/// <reference lib="dom" />
// Pemetaan 1:1 dokumen → DOM/CSS flexbox (AD-5). Aturan sizing/gap/posisi/teks ditulis sekali di sini.
// Render TIDAK memakai CSS `border` (padding-box = border-box untuk x/y absolute); stroke story 8
// wajib memakai outline/box-shadow/pseudo.
import type {
  ResolvedBoardNode as BoardNode,
  ResolvedChildNode as ChildNode,
  ResolvedFrameNode as FrameNode,
  ResolvedTextNode as TextNode,
} from '@lakar/schema';
import { cssFamily, textFont } from './fonts.js';

/** Atribut penanda node di DOM; daemon memakainya untuk screenshot elemen board. */
export const NODE_ATTR = 'data-lakar-id';

const ALIGN: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
const JUSTIFY: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', 'space-between': 'space-between' };

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

/** Konteks parent: arah flow (`none` = semua anak absolute). */
type Parent = { layout: 'row' | 'column' | 'none' };

const px = (n: number) => `${n}px`;

/** Mount board ke `root` (ganti isinya). Board: kolom flex dari kiri atas, ukuran fixed, selalu clip. */
export function mountBoardNode(board: BoardNode, root: HTMLElement): HTMLElement {
  const d = root.ownerDocument;
  const el = d.createElement('div');
  el.setAttribute(NODE_ATTR, board.id);
  Object.assign(el.style, {
    position: 'relative',
    boxSizing: 'border-box',
    width: px(board.width),
    height: px(board.height),
    overflow: 'hidden', // board selalu clip (AD-15)
    background: boardBackground(board),
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  } satisfies Partial<CSSStyleDeclaration>);
  appendChildren(d, el, board.children, { layout: 'column' }, undefined);
  root.replaceChildren(el);
  return el;
}

/** Fill solid pertama board → background (default putih). Fill lain dirender di story 8. */
function boardBackground(board: BoardNode): string {
  const solid = board.fills?.find((f) => f.type === 'solid');
  return solid?.type === 'solid' ? solid.color : '#FFFFFF';
}

function appendChildren(d: Document, el: HTMLElement, children: readonly ChildNode[], parent: Parent, gap: number | undefined): void {
  let flowIndex = 0;
  for (const c of children) {
    const child = renderChild(d, c, parent);
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

function renderChild(d: Document, n: ChildNode, parent: Parent): HTMLElement {
  let el: HTMLElement;
  switch (n.type) {
    case 'frame':
      el = renderFrame(d, n);
      break;
    case 'text':
      el = renderText(d, n);
      break;
    default:
      el = renderPlaceholder(d, n);
  }
  const s = el.style;
  s.boxSizing = 'border-box';
  s.margin = '0';
  const sizing = sizingOf(n);
  if (parent.layout === 'none' || n.position === 'absolute') applyAbsolute(s, n, sizing);
  else applyFlowSizing(s, sizing, parent.layout);
  applyMinMax(s, sizing);
  return el;
}

/** Sizing efektif node (icon: `size` × `size`). */
function sizingOf(n: ChildNode): Sized {
  if (n.type === 'icon') return { width: n.size, height: n.size };
  // Teks `wrap`: lebar mengikuti sizing, tinggi selalu hug.
  if (n.type === 'text' && textWrap(n) === 'wrap') return { ...n, height: 'hug' };
  return n;
}

/** `wrap` default: `auto` bila width tidak diisi/hug, `wrap` bila width angka/fill. */
export function textWrap(n: TextNode): 'auto' | 'wrap' | 'fixed' {
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

/** padding angka | [v,h] | [t,r,b,l] → CSS shorthand dengan urutan yang sama. */
function paddingCss(p: number | readonly number[]): string {
  return typeof p === 'number' ? px(p) : p.map(px).join(' ');
}

function renderFrame(d: Document, n: FrameNode): HTMLElement {
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
  if (n.padding !== undefined) s.padding = paddingCss(n.padding);
  if (n.clip) s.overflow = 'hidden';
  appendChildren(d, el, n.children, { layout }, n.gap);
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
  if (n.lineHeight !== undefined) s.lineHeight = px(n.lineHeight);
  if (n.letterSpacing !== undefined) s.letterSpacing = `${n.letterSpacing}em`;
  if (n.align) s.textAlign = n.align;
  if (n.numeric === 'tabular') s.fontVariantNumeric = 'tabular-nums';
  s.color = n.color ?? '#000000';
  const wrap = textWrap(n);
  if (wrap === 'auto') {
    s.whiteSpace = 'pre';
  } else {
    s.whiteSpace = 'pre-wrap';
    s.overflowWrap = 'break-word';
  }
  // `fixed`: width/height angka dari sizing; overflow tidak dipotong (LC-01b di story 11).
  if (wrap === 'fixed') s.overflow = 'visible';
  el.textContent = n.content;
  return el;
}

/**
 * [sementara: story 8/10] rect/ellipse/path/icon belum dirender visualnya: kotak kosong ber-data-lakar-id
 * dengan sizing-nya (icon: `size`), supaya layout dan pengukuran DOM sudah menghitungnya.
 */
function renderPlaceholder(d: Document, n: Exclude<ChildNode, FrameNode | TextNode>): HTMLElement {
  const el = d.createElement('div');
  el.setAttribute(NODE_ATTR, n.id);
  return el;
}
