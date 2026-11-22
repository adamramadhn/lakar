// Serializer ekspor SVG (AD-14): node `path` atau frame berisi path → dokumen SVG mandiri. Murni (tanpa DOM, tanpa
// IO), deterministik; dipakai importer/ekspor ulang (story 3) dan edit titik (story 5). Atribut vektor dipetakan oleh
// `vectorSvgAttrs` (css.ts) yang sama dengan render. Yang tidak punya padanan SVG dilaporkan di `dropped`.
// Panjang stroke Lakar dalam px (stroke non-scaling): dibagi skala bila skala seragam (ikon 1:1 kembali ke angka
// sumbernya), bila tidak seragam tetap px + `vector-effect="non-scaling-stroke"`.
import type { ResolvedChildNode, ResolvedFrameNode, ResolvedPathNode } from '@lakar/schema';
import { effectiveSizing, frameLayout, vectorSvgAttrs, type SvgAttr } from './css.js';

export type SvgDropped = { nodeId: string; prop: string };
export type SvgExport = { svg: string; dropped: SvgDropped[] };

type Box = { x: number; y: number; w: number; h: number };
type Ctx = { dropped: SvgDropped[]; defs: string[]; seq: number };

const SVG_NS = 'http://www.w3.org/2000/svg';
const num = (n: number) => String(+n.toFixed(6));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attrs = (list: readonly SvgAttr[]) => list.map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
const drop = (ctx: Ctx, nodeId: string, prop: string) => ctx.dropped.push({ nodeId, prop });

/** Efek tanpa padanan SVG di ekspor ini. */
const EFFECTS = ['rotation', 'blur', 'backdropBlur', 'shadows', 'blend'] as const;
/** Properti visual frame yang tidak diekspor (frame = `<g>`). */
const FRAME_PAINT = ['fills', 'stroke', 'radius', 'clip', 'scrollY'] as const;

/** Hex `#RRGGBB[AA]` → warna 6 digit + alpha 0..1; selain hex → undefined. */
function hexParts(c: unknown): { rgb: string; alpha: number } | undefined {
  if (typeof c !== 'string') return undefined;
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);
  if (!m) return undefined;
  return { rgb: `#${m[1]!.toUpperCase()}`, alpha: m[2] ? parseInt(m[2], 16) / 255 : 1 };
}

/** Nilai opacity atribut (`0.5` | `50%`) → angka. */
const opacityValue = (v: string) => (v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v));

/** Atribut paint (`fill`/`stroke`) + opacity: alpha warna dikalikan dengan opacity `svg` bila ada. */
function paintAttrs(kind: 'fill' | 'stroke', color: { rgb: string; alpha: number }, svgOpacity: string | undefined): SvgAttr[] {
  const out: SvgAttr[] = [[kind, color.rgb]];
  if (color.alpha < 1) out.push([`${kind}-opacity`, num(+(color.alpha * (svgOpacity === undefined ? 1 : opacityValue(svgOpacity))).toFixed(4))]);
  else if (svgOpacity !== undefined) out.push([`${kind}-opacity`, svgOpacity]);
  return out;
}

/** Ukuran kotak node path (px): angka, hug/kosong → viewBox, fill → sisa parent. */
function pathSize(n: ResolvedPathNode, parent: { w: number; h: number } | undefined, x: number, y: number): { w: number; h: number } {
  const z = effectiveSizing(n as never) as { width?: unknown; height?: unknown };
  const w = isNum(z.width) ? z.width : z.width === 'fill' && parent ? Math.max(0, parent.w - x) : n.viewBox[2];
  const h = isNum(z.height) ? z.height : z.height === 'fill' && parent ? Math.max(0, parent.h - y) : n.viewBox[3];
  return { w, h };
}

/** Posisi anak di frame: x/y bila absolute atau parent `none`; anak flow → 0,0 dan dilaporkan. */
function childPos(ctx: Ctx, parent: ResolvedFrameNode, c: ResolvedChildNode): { x: number; y: number } {
  const p = c as { position?: unknown; x?: unknown; y?: unknown };
  if (frameLayout(parent) !== 'none' && p.position !== 'absolute') {
    drop(ctx, c.id, 'layout');
    return { x: 0, y: 0 };
  }
  return { x: isNum(p.x) ? p.x : 0, y: isNum(p.y) ? p.y : 0 };
}

/** Ukuran frame: angka, fill → sisa parent, selain itu gabungan kotak anak. */
function frameSize(f: ResolvedFrameNode, parent: { w: number; h: number } | undefined, x: number, y: number): { w: number; h: number } {
  const dim = (v: unknown, axis: 'w' | 'h', at: number): number | undefined =>
    isNum(v) ? v : v === 'fill' && parent ? Math.max(0, parent[axis] - at) : undefined;
  let w = dim(f.width, 'w', x);
  let h = dim(f.height, 'h', y);
  if (w === undefined || h === undefined) {
    const probe: Ctx = { dropped: [], defs: [], seq: 0 };
    let mw = 0;
    let mh = 0;
    for (const c of f.children) {
      const pos = childPos(probe, f, c);
      const s = c.type === 'path' ? pathSize(c, undefined, 0, 0) : c.type === 'frame' ? frameSize(c, undefined, 0, 0) : { w: 0, h: 0 };
      mw = Math.max(mw, pos.x + s.w);
      mh = Math.max(mh, pos.y + s.h);
    }
    w ??= mw;
    h ??= mh;
  }
  return { w, h };
}

/**
 * Elemen `<path>` satu node path. `k` = skala px per unit user path (`[kx, ky]`). Fill non-solid, efek, dan `sides`
 * dilaporkan. Stroke inside → clipPath bentuk; outside → elemen stroke terpisah ber-mask (fill tidak ikut termask).
 */
function pathElements(ctx: Ctx, n: ResolvedPathNode, k: [number, number]): string {
  // Kotak berukuran 0 tidak tergambar (render juga tidak); skala 0 tidak boleh membagi panjang stroke.
  if (!(k[0] > 0) || !(k[1] > 0)) return '';
  const v = vectorSvgAttrs(n);
  const svg = (n.svg ?? {}) as Record<string, string | undefined>;
  const uniform = Math.abs(k[0] - k[1]) <= 1e-9 * Math.max(k[0], k[1]);
  const len = (px: number) => (uniform ? px / k[0] : px);
  for (const e of EFFECTS) if ((n as Record<string, unknown>)[e] !== undefined) drop(ctx, n.id, e);

  // Fill solid (fills[0] paling bawah); selain solid dilaporkan.
  const solids: { rgb: string; alpha: number }[] = [];
  (n.fills ?? []).forEach((f, i) => {
    const c = f.type === 'solid' ? hexParts(f.color) : undefined;
    if (c) solids.push(c);
    else drop(ctx, n.id, `fills[${i}]`);
  });
  const typed: SvgAttr[] = n.fillRule !== undefined ? [['fill-rule', v.rule]] : [];
  const fillAttrs = (c: { rgb: string; alpha: number } | undefined): SvgAttr[] => (c ? paintAttrs('fill', c, svg['fill-opacity']) : [['fill', 'none']]);

  // Atribut stroke bertipe dari pemetaan tunggal `vectorSvgAttrs` (AD-5): join hanya bila diisi (bawaan SVG = miter),
  // panjang px → unit user bila skala seragam. Opacity ikut paint, shape-rendering ikut `rest`. Dikeluarkan juga
  // tanpa stroke supaya tidak hilang (AD-14).
  const strokeTyped: SvgAttr[] = [];
  for (const [key, val] of v.stroke) {
    if ((key === 'stroke-linejoin' && n.strokeLinejoin === undefined) || key === 'stroke-opacity' || key === 'shape-rendering') continue;
    if (key === 'stroke-dasharray') strokeTyped.push([key, val.split(' ').map((x) => num(len(parseFloat(x)))).join(' ')]);
    else if (key === 'stroke-dashoffset') strokeTyped.push([key, uniform ? num(len(parseFloat(val))) : val]);
    else strokeTyped.push([key, val]);
  }

  // Stroke.
  let stroke: SvgAttr[] | undefined;
  let align: 'inside' | 'center' | 'outside' = 'center';
  const s = n.stroke;
  if (s) {
    const color = hexParts(s.color);
    if (s.sides !== undefined) drop(ctx, n.id, 'stroke.sides');
    if (!color || !isNum(s.width)) drop(ctx, n.id, 'stroke');
    else if (s.width > 0) {
      align = s.align;
      const w = align === 'center' ? s.width : 2 * s.width;
      stroke = [...paintAttrs('stroke', color, svg['stroke-opacity']), ['stroke-width', num(len(w))], ...strokeTyped];
      if (!uniform) stroke.push(['vector-effect', 'non-scaling-stroke']);
    }
  }
  // Atribut svg lain (paint-order, shape-rendering) apa adanya; opacity/dashoffset sudah ditulis di atas.
  const rest: SvgAttr[] = stroke ? [] : [...strokeTyped];
  for (const [key, val] of Object.entries(svg)) {
    if (val === undefined || key === 'fill-opacity' || key === 'stroke-opacity' || key === 'stroke-dashoffset') continue;
    rest.push([key, val]);
  }
  // fill-opacity/stroke-opacity tanpa paint tetap dikeluarkan supaya tidak hilang.
  if (svg['fill-opacity'] !== undefined && solids.length === 0) rest.push(['fill-opacity', svg['fill-opacity']]);
  if (svg['stroke-opacity'] !== undefined && !stroke) rest.push(['stroke-opacity', svg['stroke-opacity']]);
  const d: SvgAttr = ['d', n.d];

  const out: string[] = [];
  const top = solids.at(-1);
  // Fill bawah tambahan (lebih dari satu fill solid).
  for (const c of solids.slice(0, -1)) out.push(`<path${attrs([d, ...fillAttrs(c), ...typed, ...rest])}/>`);
  if (!stroke || align === 'center') {
    out.push(`<path${attrs([d, ...fillAttrs(top), ...typed, ...(stroke ?? []), ...rest])}/>`);
  } else if (align === 'inside') {
    const id = `lakar-clip-${++ctx.seq}`;
    ctx.defs.push(`<clipPath id="${id}"><path${attrs([d, ['clip-rule', v.rule]])}/></clipPath>`);
    out.push(`<path${attrs([d, ...fillAttrs(top), ...typed, ...stroke, ...rest, ['clip-path', `url(#${id})`]])}/>`);
  } else {
    const id = `lakar-mask-${++ctx.seq}`;
    const [x, y, w, h] = n.viewBox;
    const big = Math.max(w, h) * 1000;
    const box: SvgAttr[] = [
      ['x', num(x - big)],
      ['y', num(y - big)],
      ['width', num(w + 2 * big)],
      ['height', num(h + 2 * big)],
    ];
    ctx.defs.push(`<mask id="${id}"${attrs([['maskUnits', 'userSpaceOnUse'], ...box])}><rect${attrs([...box, ['fill', '#fff']])}/><path${attrs([d, ['fill', '#000'], ['fill-rule', v.rule]])}/></mask>`);
    // Tanpa fill solid tidak ada elemen fill; `rest` cukup di elemen stroke.
    const fillEl = top ? `<path${attrs([d, ...fillAttrs(top), ...typed, ...rest])}/>` : '';
    const strokeEl = `<path${attrs([d, ['fill', 'none'], ...stroke, ...rest, ['mask', `url(#${id})`]])}/>`;
    out.push(...(v.strokeUnder ? [strokeEl, fillEl] : [fillEl, strokeEl]).filter(Boolean));
  }
  // Opacity node berlaku untuk seluruh node (seperti render): satu `<g>` membungkus semua elemennya.
  const body = out.join('');
  return isNum(n.opacity) && out.length ? `<g${attrs([['opacity', num(n.opacity)]])}>${body}</g>` : body;
}

/** Transformasi viewBox path → kotak `b` di ruang user parent. */
const vbMatrix = (vb: readonly number[], b: Box) => {
  const a = b.w / vb[2]!;
  const dd = b.h / vb[3]!;
  return `matrix(${num(a)} 0 0 ${num(dd)} ${num(b.x - vb[0]! * a)} ${num(b.y - vb[1]! * dd)})`;
};

/** Isi frame (ruang user = px frame). */
function frameChildren(ctx: Ctx, f: ResolvedFrameNode, size: { w: number; h: number }): string {
  let out = '';
  for (const c of f.children) {
    const pos = childPos(ctx, f, c);
    if (c.type === 'path') {
      const s = pathSize(c, size, pos.x, pos.y);
      out += `<g transform="${vbMatrix(c.viewBox, { ...pos, ...s })}">${pathElements(ctx, c, [s.w / c.viewBox[2], s.h / c.viewBox[3]])}</g>`;
    } else if (c.type === 'frame') {
      out += frameGroup(ctx, c, frameSize(c, size, pos.x, pos.y), pos);
    } else drop(ctx, c.id, 'type');
  }
  return out;
}

function frameDrops(ctx: Ctx, f: ResolvedFrameNode) {
  for (const k of [...FRAME_PAINT, ...EFFECTS]) if ((f as Record<string, unknown>)[k] !== undefined) drop(ctx, f.id, k);
}

function frameGroup(ctx: Ctx, f: ResolvedFrameNode, size: { w: number; h: number }, pos: { x: number; y: number }): string {
  frameDrops(ctx, f);
  const list: SvgAttr[] = [];
  if (pos.x !== 0 || pos.y !== 0) list.push(['transform', `translate(${num(pos.x)} ${num(pos.y)})`]);
  if (isNum(f.opacity)) list.push(['opacity', num(f.opacity)]);
  return `<g${attrs(list)}>${frameChildren(ctx, f, size)}</g>`;
}

/** viewBox bersama: semua anak path absolute/none di 0,0, viewBox sama, dan kotaknya = kotak frame. */
function sharedViewBox(f: ResolvedFrameNode, size: { w: number; h: number }): readonly number[] | undefined {
  if (!f.children.length || (frameLayout(f) !== 'none' && f.children.some((c) => (c as { position?: unknown }).position !== 'absolute'))) return undefined;
  let vb: readonly number[] | undefined;
  for (const c of f.children) {
    if (c.type !== 'path') return undefined;
    const x = isNum(c.x) ? c.x : 0;
    const y = isNum(c.y) ? c.y : 0;
    const s = pathSize(c, size, x, y);
    if (x !== 0 || y !== 0 || s.w !== size.w || s.h !== size.h) return undefined;
    if (vb && vb.some((v, i) => v !== c.viewBox[i])) return undefined;
    vb = c.viewBox;
  }
  return vb;
}

function svgDocument(ctx: Ctx, size: { w: number; h: number }, vb: readonly number[], body: string, extra: SvgAttr[] = []): string {
  const uniform = Math.abs(size.w / vb[2]! - size.h / vb[3]!) <= 1e-9 * Math.max(size.w / vb[2]!, size.h / vb[3]!);
  const head: SvgAttr[] = [
    ['xmlns', SVG_NS],
    ['width', num(size.w)],
    ['height', num(size.h)],
    ['viewBox', vb.map(num).join(' ')],
  ];
  if (!uniform) head.push(['preserveAspectRatio', 'none']);
  const defs = ctx.defs.length ? `<defs>${ctx.defs.join('')}</defs>` : '';
  return `<svg${attrs([...head, ...extra])}>${defs}${body}</svg>`;
}

/**
 * Node path atau frame berisi path → SVG mandiri (AD-14). Path tunggal memakai viewBox-nya; frame ikon (semua path
 * viewBox sama, menutupi frame) memakai viewBox itu dengan `<path>` polos; frame lain memakai `0 0 W H` dan matriks
 * per path. Node harus sudah ter-resolve (`resolveDocument`); ref token dilaporkan.
 */
export function vectorToSvg(node: ResolvedPathNode | ResolvedFrameNode): SvgExport {
  const ctx: Ctx = { dropped: [], defs: [], seq: 0 };
  if (node.type === 'path') {
    const s = pathSize(node, undefined, 0, 0);
    const body = pathElements(ctx, node, [s.w / node.viewBox[2], s.h / node.viewBox[3]]);
    return { svg: svgDocument(ctx, s, node.viewBox, body), dropped: ctx.dropped };
  }
  const size = frameSize(node, undefined, 0, 0);
  frameDrops(ctx, node);
  const opacity: SvgAttr[] = isNum(node.opacity) ? [['opacity', num(node.opacity)]] : [];
  const vb = sharedViewBox(node, size);
  if (vb) {
    const body = node.children.map((c) => pathElements(ctx, c as ResolvedPathNode, [size.w / vb[2]!, size.h / vb[3]!])).join('');
    return { svg: svgDocument(ctx, size, vb, body, opacity), dropped: ctx.dropped };
  }
  const body = frameChildren(ctx, node, size);
  return { svg: svgDocument(ctx, size, [0, 0, size.w || 1, size.h || 1], body, opacity), dropped: ctx.dropped };
}
