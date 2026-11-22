/// <reference lib="dom" />
// Geometri bentuk non-box (Design Notes story 8): busur ellipse dan path. Bentuk diisi lewat lapisan
// fill ber-`mask-image` SVG dan diberi stroke lewat overlay `<svg>` internal (keduanya tanpa data-lakar-id).
import type { ResolvedEllipseNode as EllipseNode, ResolvedPathNode as PathNode, ResolvedStroke as Stroke } from '@lakar/schema';
import { isTokenRef, tokenVar, vectorSvgAttrs, type CssDecl, type StrokeLike, type SvgAttr, type SvgSpec, type VectorLike } from './css.js';

export type ViewBox = readonly [number, number, number, number];
/**
 * Bentuk di ruang `viewBox`, dipetakan non-uniform ke box node. Atribut vektor path (AD-14, `vectorSvgAttrs`):
 * `fillAttrs` di path mask fill, `strokeAttrs` di path stroke (tanpa isi = `stroke-linejoin="miter"`), dan
 * `strokeUnder` = overlay stroke di bawah lapisan fill (`paint-order`).
 */
export type Shape = {
  viewBox: ViewBox;
  d: string;
  rule: 'nonzero' | 'evenodd';
  fillAttrs?: SvgAttr[];
  strokeAttrs?: SvgAttr[];
  strokeUnder?: boolean;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const UNIT: ViewBox = [0, 0, 1, 1];

const num = (n: number) => String(+n.toFixed(6));

/**
 * Ellipse: `'box'` bila tanpa busur (sweep tidak diisi atau |sweep| ≥ 360, dan inner 0) → box CSS
 * `border-radius:50%`; `'empty'` bila sweep 0; selain itu bentuk path di ruang unit.
 */
export function ellipseShape(n: Pick<EllipseNode, 'startDeg' | 'sweepDeg' | 'inner'>): Shape | 'box' | 'empty' {
  const inner = n.inner ?? 0;
  const sweep = n.sweepDeg;
  const full = sweep === undefined || Math.abs(sweep) >= 360;
  if (full && inner === 0) return 'box';
  if (sweep === 0) return 'empty';
  const R = 0.5;
  const r = 0.5 * inner;
  // θ dari jam 12, searah jarum jam: (0.5 + R·sinθ, 0.5 − R·cosθ).
  const pt = (rad: number, deg: number) => {
    const t = (deg * Math.PI) / 180;
    return `${num(0.5 + rad * Math.sin(t))} ${num(0.5 - rad * Math.cos(t))}`;
  };
  if (full) {
    // Annulus penuh: dua lingkaran, evenodd.
    const circle = (rad: number) => `M ${pt(rad, 0)} A ${num(rad)} ${num(rad)} 0 1 1 ${pt(rad, 180)} A ${num(rad)} ${num(rad)} 0 1 1 ${pt(rad, 360)} Z`;
    return { viewBox: UNIT, d: `${circle(R)} ${circle(r)}`, rule: 'evenodd' };
  }
  const a0 = n.startDeg ?? 0;
  const a1 = a0 + sweep;
  const large = Math.abs(sweep) > 180 ? 1 : 0;
  const sf = sweep > 0 ? 1 : 0;
  let d = `M ${pt(R, a0)} A ${num(R)} ${num(R)} 0 ${large} ${sf} ${pt(R, a1)}`;
  d += r > 0 ? ` L ${pt(r, a1)} A ${num(r)} ${num(r)} 0 ${large} ${1 - sf} ${pt(r, a0)} Z` : ' L 0.5 0.5 Z';
  return { viewBox: UNIT, d, rule: 'evenodd' };
}

/** Bentuk node path: `d` + viewBox + atribut vektor bertipe dan `svg` (AD-14). */
export function pathShape(n: Pick<PathNode, 'd' | 'viewBox'> & VectorLike): Shape {
  const v = vectorSvgAttrs(n);
  const shape: Shape = { viewBox: n.viewBox, d: n.d, rule: v.rule, strokeAttrs: v.stroke };
  if (v.fill.length) shape.fillAttrs = v.fill;
  if (v.strokeUnder) shape.strokeUnder = true;
  return shape;
}

const xmlAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** `mask-image` data URL: bentuk hitam opak, `preserveAspectRatio='none'`. */
function maskImage(shape: Shape): string {
  const svg =
    `<svg xmlns="${SVG_NS}" viewBox="${shape.viewBox.map(num).join(' ')}" preserveAspectRatio="none">` +
    `<path d="${xmlAttr(shape.d)}" fill="#000" fill-rule="${shape.rule}"${(shape.fillAttrs ?? []).map(([k, v]) => ` ${k}="${xmlAttr(v)}"`).join('')}/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Deklarasi lapisan fill bentuk (AD-5; render dan codegen): absolute inset 0 + mask bentuk. Latar dipasang pemanggil. */
export function shapeFillLayerDecls(shape: Shape): CssDecl[] {
  return [
    ['position', 'absolute'],
    ['inset', '0'],
    ['pointer-events', 'none'],
    ['mask-image', maskImage(shape)],
    ['mask-size', '100% 100%'],
    ['mask-repeat', 'no-repeat'],
    ['mask-position', '0 0'],
    ['mask-mode', 'alpha'],
  ];
}

/** Lapisan fill internal bentuk: mask bentuk; background fills dipasang pemanggil (`applyFills`). */
export function fillLayer(d: Document, shape: Shape): HTMLElement {
  const el = d.createElement('div');
  for (const [k, v] of shapeFillLayerDecls(shape)) el.style.setProperty(k, v);
  return el;
}

/**
 * Atribut paint SVG (`stroke`/`fill`): hex → atribut; ref token → `currentColor` + `color: var(--…)` di style elemen
 * (var() tidak sah sebagai atribut presentasi). Mengembalikan nilai atribut.
 */
export function svgPaint(color: unknown, style: CssDecl[]): string {
  if (isTokenRef(color)) {
    style.push(['color', tokenVar(color)]);
    return 'currentColor';
  }
  return typeof color === 'string' ? color : 'none';
}

/**
 * Spesifikasi overlay stroke `<svg>` bentuk (render dan codegen): path sama, `vector-effect:non-scaling-stroke`.
 * center = w; inside = 2w + clipPath bentuk; outside = 2w + mask (rect putih besar, bentuk hitam). `sides` diabaikan.
 * `id` = id clipPath/mask (pemanggil menjamin unik). Lebar 0 → undefined. Lebar token → `stroke-width` di style path.
 */
export function strokeSvgSpec(shape: Shape, s: StrokeLike, id: string): SvgSpec | undefined {
  const numeric = typeof s.width === 'number';
  if (numeric ? !((s.width as number) > 0) : !isTokenRef(s.width)) return undefined;
  const svgStyle: CssDecl[] = [
    ['position', 'absolute'],
    ['left', '0'],
    ['top', '0'],
    ['width', '100%'],
    ['height', '100%'],
    ['overflow', 'visible'],
    ['pointer-events', 'none'],
  ];
  const pathStyle: CssDecl[] = [];
  const stroke = svgPaint(s.color, svgStyle);
  const pathAttrs: [string, string][] = [
    ['d', shape.d],
    ['fill', 'none'],
    ['stroke', stroke],
  ];
  if (numeric) pathAttrs.push(['stroke-width', num(s.align === 'center' ? (s.width as number) : 2 * (s.width as number))]);
  else {
    const v = tokenVar(s.width as { $token: string });
    pathStyle.push(['stroke-width', s.align === 'center' ? v : `calc(2 * ${v})`]);
  }
  pathAttrs.push(['vector-effect', 'non-scaling-stroke'], ...(shape.strokeAttrs ?? [['stroke-linejoin', 'miter'] as SvgAttr]));
  const children: SvgSpec[] = [];
  if (s.align !== 'center') {
    if (s.align === 'inside') {
      pathAttrs.push(['clip-path', `url(#${id})`]);
      children.push({
        tag: 'defs',
        attrs: [],
        style: [],
        children: [{ tag: 'clipPath', attrs: [['id', id]], style: [], children: [{ tag: 'path', attrs: [['d', shape.d], ['clip-rule', shape.rule]], style: [], children: [] }] }],
      });
    } else {
      const [x, y, w, h] = shape.viewBox;
      const big = Math.max(w, h) * 1000;
      const box: [string, string][] = [
        ['x', num(x - big)],
        ['y', num(y - big)],
        ['width', num(w + 2 * big)],
        ['height', num(h + 2 * big)],
      ];
      pathAttrs.push(['mask', `url(#${id})`]);
      children.push({
        tag: 'defs',
        attrs: [],
        style: [],
        children: [
          {
            tag: 'mask',
            attrs: [['id', id], ['maskUnits', 'userSpaceOnUse'], ...box],
            style: [],
            children: [
              { tag: 'rect', attrs: [...box, ['fill', '#fff']], style: [], children: [] },
              { tag: 'path', attrs: [['d', shape.d], ['fill', '#000'], ['fill-rule', shape.rule]], style: [], children: [] },
            ],
          },
        ],
      });
    }
  }
  children.push({ tag: 'path', attrs: pathAttrs, style: pathStyle, children: [] });
  return {
    tag: 'svg',
    attrs: [
      ['viewBox', shape.viewBox.map(num).join(' ')],
      ['preserveAspectRatio', 'none'],
      ['aria-hidden', 'true'],
    ],
    style: svgStyle,
    children,
  };
}

/** Bangun elemen SVG dari spesifikasi (createElementNS, tanpa innerHTML). */
export function buildSvg(d: Document, spec: SvgSpec): SVGElement {
  const el = d.createElementNS(SVG_NS, spec.tag);
  for (const [k, v] of spec.attrs) el.setAttribute(k, v);
  for (const [k, v] of spec.style) el.style.setProperty(k, v);
  for (const c of spec.children) el.appendChild(buildSvg(d, c));
  return el;
}

let clipSeq = 0;

/** Overlay stroke `<svg>` internal bentuk (lihat `strokeSvgSpec`); id clip/mask unik per halaman. */
export function strokeSvg(d: Document, shape: Shape, s: Stroke): SVGElement | undefined {
  if (s.width <= 0) return undefined;
  const spec = strokeSvgSpec(shape, s, `lakar-stroke-${++clipSeq}`);
  return spec ? buildSvg(d, spec) : undefined;
}

