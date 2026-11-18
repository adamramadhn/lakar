/// <reference lib="dom" />
// Geometri bentuk non-box (Design Notes story 8): busur ellipse dan path. Bentuk diisi lewat lapisan
// fill ber-`mask-image` SVG dan diberi stroke lewat overlay `<svg>` internal (keduanya tanpa data-lakar-id).
import type { ResolvedEllipseNode as EllipseNode, ResolvedPathNode as PathNode, ResolvedStroke as Stroke } from '@lakar/schema';

export type ViewBox = readonly [number, number, number, number];
/** Bentuk di ruang `viewBox`, dipetakan non-uniform ke box node. */
export type Shape = { viewBox: ViewBox; d: string; rule: 'nonzero' | 'evenodd' };

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

export function pathShape(n: Pick<PathNode, 'd' | 'viewBox'>): Shape {
  return { viewBox: n.viewBox, d: n.d, rule: 'nonzero' };
}

const xmlAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** `mask-image` data URL: bentuk hitam opak, `preserveAspectRatio='none'`. */
export function maskImage(shape: Shape): string {
  const svg =
    `<svg xmlns="${SVG_NS}" viewBox="${shape.viewBox.map(num).join(' ')}" preserveAspectRatio="none">` +
    `<path d="${xmlAttr(shape.d)}" fill="#000" fill-rule="${shape.rule}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Lapisan fill internal bentuk: background fills + mask bentuk. */
export function fillLayer(d: Document, shape: Shape, background: string): HTMLElement {
  const el = d.createElement('div');
  const st = el.style;
  st.position = 'absolute';
  st.inset = '0';
  st.pointerEvents = 'none';
  st.background = background;
  const mask = maskImage(shape);
  for (const [k, v] of [
    ['mask-image', mask],
    ['mask-size', '100% 100%'],
    ['mask-repeat', 'no-repeat'],
    ['mask-position', '0 0'],
    ['mask-mode', 'alpha'],
  ] as const) {
    st.setProperty(k, v);
  }
  return el;
}

let clipSeq = 0;

/**
 * Overlay stroke `<svg>` internal: path sama, `vector-effect:non-scaling-stroke`.
 * center = w; inside = 2w + clipPath bentuk; outside = 2w + mask (rect putih besar, bentuk hitam).
 * `sides` diabaikan untuk bentuk ini.
 */
export function strokeSvg(d: Document, shape: Shape, s: Stroke): SVGSVGElement | undefined {
  if (s.width <= 0) return undefined;
  const svg = d.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', shape.viewBox.map(num).join(' '));
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const st = svg.style;
  st.position = 'absolute';
  st.left = '0';
  st.top = '0';
  st.width = '100%';
  st.height = '100%';
  st.overflow = 'visible';
  st.pointerEvents = 'none';
  const path = d.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', shape.d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', s.color);
  path.setAttribute('stroke-width', num(s.align === 'center' ? s.width : 2 * s.width));
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  path.setAttribute('stroke-linejoin', 'miter');
  if (s.align !== 'center') {
    const id = `lakar-stroke-${++clipSeq}`;
    const defs = d.createElementNS(SVG_NS, 'defs');
    const shapeEl = () => {
      const p = d.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', shape.d);
      return p;
    };
    if (s.align === 'inside') {
      const clip = d.createElementNS(SVG_NS, 'clipPath');
      clip.id = id;
      const p = shapeEl();
      p.setAttribute('clip-rule', shape.rule);
      clip.appendChild(p);
      defs.appendChild(clip);
      path.setAttribute('clip-path', `url(#${id})`);
    } else {
      const mask = d.createElementNS(SVG_NS, 'mask');
      mask.id = id;
      mask.setAttribute('maskUnits', 'userSpaceOnUse');
      const [x, y, w, h] = shape.viewBox;
      const big = Math.max(w, h) * 1000;
      const box = { x: num(x - big), y: num(y - big), width: num(w + 2 * big), height: num(h + 2 * big) };
      for (const [k, v] of Object.entries(box)) mask.setAttribute(k, v);
      const rect = d.createElementNS(SVG_NS, 'rect');
      for (const [k, v] of Object.entries(box)) rect.setAttribute(k, v);
      rect.setAttribute('fill', '#fff');
      const p = shapeEl();
      p.setAttribute('fill', '#000');
      p.setAttribute('fill-rule', shape.rule);
      mask.append(rect, p);
      defs.appendChild(mask);
      path.setAttribute('mask', `url(#${id})`);
    }
    svg.appendChild(defs);
  }
  svg.appendChild(path);
  return svg;
}
