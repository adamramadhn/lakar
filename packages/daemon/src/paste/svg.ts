// Importer paste SVG (AD-14, AD-15): SVG → NodeInput Lakar (node `path`, atau `frame` berisi path). Murni dan
// deterministik; dipakai route viewer dan route sesi (tool MCP `paste`) lewat `paste.ts`.
// - Atribut presentasi (atribut, `style`, warisan `<svg>`/`<g>`) → properti bertipe atau allowlist `svg`.
// - Transform dipanggang ke `d` (arc → kubik); tanpa transform `d` disalin byte-identik.
// - Panjang stroke dalam px kotak render (stroke Lakar non-scaling): × skala viewBox→kotak × √|det transform|.
// - Yang tidak terpetakan dibuang dan dilaporkan (`dropped`); dokumen tidak pernah menyimpan SVG mentah (AD-1).
import { FILL_RULES, STROKE_DASH_MAX, STROKE_LINECAPS, STROKE_LINEJOINS, STROKE_MITERLIMIT_MAX, SVG_ATTR_PATTERNS } from '@lakar/schema';
import { IDENTITY, isIdentity, multiply, parsePath, pathBounds, serializePath, transformPath, type Matrix, type PathSeg } from '@lakar/render';
import { parseColor } from './colors.js';
import { XmlError, parseXml, type XmlElement } from './xml.js';

export type PasteDropKind = 'element' | 'attribute' | 'value';
/** Bagian SVG yang tidak diimpor: elemen (`<mask>`), atribut tanpa padanan (`filter`), atau nilai tak didukung. */
export type PasteDropped = { kind: PasteDropKind; name: string; count: number };

/** Atribut SVG yang dipetakan ke properti Lakar (urutan laporan tetap). */
export const KEPT_ATTRS = [
  'fill-rule',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'fill-opacity',
  'stroke-opacity',
  'paint-order',
  'shape-rendering',
  'opacity',
  'transform',
] as const;
export type KeptAttr = (typeof KEPT_ATTRS)[number];

export type ImportedNode = { type: 'frame' | 'path'; name: string; children?: ImportedNode[] } & Record<string, unknown>;
export type SvgImport = { node: ImportedNode; paths: number; kept: KeptAttr[]; dropped: PasteDropped[]; width: number; height: number };

/** SVG tidak bisa diimpor (bukan SVG, rusak, atau tanpa bentuk). */
export class SvgImportError extends Error {}

/** Panjang nama layer maksimum. */
export const PASTE_NAME_MAX = 120;

/** Properti presentasi yang diwariskan (dari `<svg>`, `<g>`, `<a>`). */
const INHERITED = new Set([
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'paint-order',
  'shape-rendering',
  'color',
  'visibility',
]);
/** Properti presentasi tidak diwariskan yang ditangani importer. */
const LOCAL = new Set(['opacity', 'transform', 'display', 'vector-effect']);

/** Atribut geometri per elemen (dikonsumsi tanpa laporan). */
const GEOMETRY: Record<string, readonly string[]> = {
  svg: ['width', 'height', 'viewBox', 'preserveAspectRatio', 'x', 'y'],
  g: [],
  a: ['href', 'target'],
  path: ['d'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
};
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const CONTAINERS = new Set(['g', 'a']);
/** Elemen non-visual yang dilewati tanpa laporan. */
const SILENT_ELEMENTS = new Set(['title', 'desc', 'metadata']);
/** Atribut yang diabaikan tanpa laporan (identitas, namespace, aksesibilitas). */
const SILENT_ATTRS = new Set(['id', 'class', 'style', 'xmlns', 'version', 'baseProfile', 'role', 'focusable', 'tabindex', 'lang']);

const NUM = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const fmt = (n: number) => {
  const v = +n.toFixed(4);
  return Object.is(v, -0) ? 0 : v;
};

/** Panjang SVG: angka atau `px`; satuan lain/persen → undefined. */
function length(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().replace(/px$/i, '');
  const n = parseFloat(s);
  return NUM.test(s) && Number.isFinite(n) ? n : undefined;
}

/** Opacity: angka atau persen, dijepit 0..1. */
function opacity(v: string): number | undefined {
  const s = v.trim();
  const pct = s.endsWith('%');
  const body = pct ? s.slice(0, -1) : s;
  if (!NUM.test(body) || !Number.isFinite(parseFloat(body))) return undefined;
  const n = parseFloat(body) / (pct ? 100 : 1);
  return Math.min(1, Math.max(0, n));
}

const numbers = (s: string): number[] | undefined => {
  const parts = s.trim().split(/[\s,]+/).filter(Boolean);
  if (!parts.every((p) => NUM.test(p))) return undefined;
  const out = parts.map(parseFloat);
  return out.every(Number.isFinite) ? out : undefined;
};

/** Urai atribut `transform`; rusak → undefined. */
export function parseTransform(v: string): Matrix | undefined {
  let m: Matrix = IDENTITY;
  const re = /\s*,?\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gy;
  let pos = 0;
  const src = v.trim();
  while (pos < src.length) {
    re.lastIndex = pos;
    const hit = re.exec(src);
    if (!hit) return undefined;
    pos = re.lastIndex;
    const a = numbers(hit[2]!);
    if (!a) return undefined;
    let t: Matrix;
    switch (hit[1]) {
      case 'matrix':
        if (a.length !== 6) return undefined;
        t = [a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!];
        break;
      case 'translate':
        if (a.length < 1 || a.length > 2) return undefined;
        t = [1, 0, 0, 1, a[0]!, a[1] ?? 0];
        break;
      case 'scale':
        if (a.length < 1 || a.length > 2) return undefined;
        t = [a[0]!, 0, 0, a[1] ?? a[0]!, 0, 0];
        break;
      case 'rotate': {
        if (a.length !== 1 && a.length !== 3) return undefined;
        const r = (a[0]! * Math.PI) / 180;
        const c = Math.cos(r);
        const s = Math.sin(r);
        const rot: Matrix = [c, s, -s, c, 0, 0];
        if (a.length === 3) {
          const [cx, cy] = [a[1]!, a[2]!];
          t = multiply(multiply([1, 0, 0, 1, cx, cy], rot), [1, 0, 0, 1, -cx, -cy]);
        } else t = rot;
        break;
      }
      case 'skewX':
        if (a.length !== 1) return undefined;
        t = [1, 0, Math.tan((a[0]! * Math.PI) / 180), 1, 0, 0];
        break;
      default:
        if (a.length !== 1) return undefined;
        t = [1, Math.tan((a[0]! * Math.PI) / 180), 0, 1, 0, 0];
    }
    m = multiply(m, t);
  }
  return m;
}

/** Deklarasi `style="a: b; c: d"` → pasangan (nama huruf kecil, nilai tanpa `!important`). */
function styleDecls(v: string): [string, string][] {
  const out: [string, string][] = [];
  for (const part of v.split(';')) {
    const i = part.indexOf(':');
    if (i === -1) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const val = part
      .slice(i + 1)
      .replace(/!\s*important\s*$/i, '')
      .trim();
    if (k && val) out.push([k, val]);
  }
  return out;
}

/** Nama lokal elemen (`svg:path` → `path`); prefiks lain → undefined (namespace editor). */
function localName(el: XmlElement): string | undefined {
  const i = el.name.indexOf(':');
  if (i === -1) return el.name;
  return el.name.slice(0, i) === 'svg' ? el.name.slice(i + 1) : undefined;
}

/** Teks langsung elemen (tanpa rekursi: kedalaman tak terbatas tidak boleh menghabiskan stack). */
const textOf = (el: XmlElement): string =>
  el.children
    .map((c) => ('text' in c ? c.text : ''))
    .join('')
    .trim();

/**
 * Nama layer dari elemen: path = `inkscape:label`, `id`, lalu `<title>` anak; akar (`root`) = `<title>` dulu
 * (judul dokumen), lalu `id`.
 */
function ownName(el: XmlElement, root = false): string | undefined {
  const t = el.children.find((c): c is XmlElement => 'name' in c && localName(c) === 'title');
  const title = t ? textOf(t) || undefined : undefined;
  const n = root ? (title ?? el.attrs.get('id')) : (el.attrs.get('inkscape:label') ?? el.attrs.get('id') ?? title);
  const s = n?.trim();
  return s ? s.slice(0, PASTE_NAME_MAX) : undefined;
}

/** Kedalaman elemen maksimum (penelusuran rekursif; SVG nyata jauh di bawah ini). */
export const SVG_DEPTH_MAX = 256;

/** Gaya terhitung: nilai, asal (`own` = ditulis pada elemen itu sendiri), dan elemen sumber (`src`, untuk laporan). */
type Computed = Map<string, { value: string; own: boolean; src: number }>;

type Shape = { name: string | undefined; segs: PathSeg[]; d: string; ctm: Matrix; style: Computed; local: Map<string, string>; opacity: number; src: number };

class Report {
  readonly dropped: PasteDropped[] = [];
  readonly kept = new Set<KeptAttr>();
  readonly #seen = new Set<string>();
  /** Nomor urut elemen (sumber nilai warisan). */
  seq = 0;
  drop(kind: PasteDropKind, name: string) {
    const hit = this.dropped.find((d) => d.kind === kind && d.name === name);
    if (hit) hit.count++;
    else this.dropped.push({ kind, name, count: 1 });
  }
  /** Laporkan sekali per elemen sumber: nilai warisan `<g fill="url(#g)">` dihitung satu, bukan per path anak. */
  dropFrom(kind: PasteDropKind, name: string, src: number) {
    const key = `${kind}\u0000${name}\u0000${src}`;
    if (this.#seen.has(key)) return;
    this.#seen.add(key);
    this.drop(kind, name);
  }
}

/** Atribut + deklarasi `style` elemen, dibagi ke gaya warisan/lokal; sisanya dilaporkan. */
function readPresentation(el: XmlElement, name: string, report: Report): { inherited: Map<string, string>; local: Map<string, string> } {
  const inherited = new Map<string, string>();
  const local = new Map<string, string>();
  const geometry = new Set(GEOMETRY[name] ?? []);
  const take = (k: string, v: string, fromStyle: boolean) => {
    if (INHERITED.has(k)) inherited.set(k, v.trim());
    else if (LOCAL.has(k)) local.set(k, v.trim());
    else if (!fromStyle && (geometry.has(k) || SILENT_ATTRS.has(k) || k.includes(':') || k.startsWith('data-') || k.startsWith('aria-'))) return;
    else report.drop('attribute', k);
  };
  for (const [k, v] of el.attrs) if (k !== 'style') take(k, v, false);
  // `style` menimpa atribut presentasi (spesifisitas CSS).
  const style = el.attrs.get('style');
  if (style) for (const [k, v] of styleDecls(style)) take(k, v, true);
  return { inherited, local };
}

type Walk = { report: Report; shapes: Shape[] };

/** Bentuk dasar → `d`; geometri tak sah → undefined (tidak digambar), satuan tak didukung dilaporkan. */
function shapeD(el: XmlElement, name: string, report: Report): string | undefined {
  if (name === 'path') return el.attrs.get('d');
  const n = (k: string, dflt?: number): number | undefined => {
    const raw = el.attrs.get(k);
    if (raw === undefined) return dflt;
    const v = length(raw);
    if (v === undefined) report.drop('value', k);
    return v;
  };
  const p = (v: number) => String(fmt(v));
  switch (name) {
    case 'rect': {
      const x = n('x', 0);
      const y = n('y', 0);
      const w = n('width');
      const h = n('height');
      if (x === undefined || y === undefined || !(w! > 0) || !(h! > 0)) return undefined;
      const rxRaw = el.attrs.has('rx') ? n('rx') : undefined;
      const ryRaw = el.attrs.has('ry') ? n('ry') : undefined;
      let rx = rxRaw ?? ryRaw ?? 0;
      let ry = ryRaw ?? rxRaw ?? 0;
      rx = Math.min(Math.max(0, rx), w! / 2);
      ry = Math.min(Math.max(0, ry), h! / 2);
      if (rx === 0 || ry === 0) return `M${p(x)} ${p(y)}H${p(x + w!)}V${p(y + h!)}H${p(x)}Z`;
      const arc = (ex: number, ey: number) => `A${p(rx)} ${p(ry)} 0 0 1 ${p(ex)} ${p(ey)}`;
      return (
        `M${p(x + rx)} ${p(y)}H${p(x + w! - rx)}${arc(x + w!, y + ry)}V${p(y + h! - ry)}${arc(x + w! - rx, y + h!)}` +
        `H${p(x + rx)}${arc(x, y + h! - ry)}V${p(y + ry)}${arc(x + rx, y)}Z`
      );
    }
    case 'circle':
    case 'ellipse': {
      const cx = n('cx', 0);
      const cy = n('cy', 0);
      const rx = name === 'circle' ? n('r') : n('rx');
      const ry = name === 'circle' ? rx : n('ry');
      if (cx === undefined || cy === undefined || !(rx! > 0) || !(ry! > 0)) return undefined;
      const arc = (ex: number) => `A${p(rx!)} ${p(ry!)} 0 1 0 ${p(ex)} ${p(cy)}`;
      return `M${p(cx - rx!)} ${p(cy)}${arc(cx + rx!)}${arc(cx - rx!)}Z`;
    }
    case 'line': {
      const [x1, y1, x2, y2] = [n('x1', 0), n('y1', 0), n('x2', 0), n('y2', 0)];
      if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return undefined;
      return `M${p(x1)} ${p(y1)}L${p(x2)} ${p(y2)}`;
    }
    default: {
      const pts = numbers(el.attrs.get('points') ?? '');
      if (!pts) {
        report.drop('value', 'points');
        return undefined;
      }
      if (pts.length < 2) return undefined;
      // Jumlah ganjil: koordinat terakhir tidak dipakai (seperti browser) dan dilaporkan.
      if (pts.length % 2) report.drop('value', 'points');
      const pairs: string[] = [];
      for (let i = 0; i + 1 < pts.length; i += 2) pairs.push(`${p(pts[i]!)} ${p(pts[i + 1]!)}`);
      return `M${pairs.join('L')}${name === 'polygon' ? 'Z' : ''}`;
    }
  }
}

/** Telusuri pohon: gaya warisan, transform, opacity; bentuk dikumpulkan, sisanya dilaporkan. */
function walk(el: XmlElement, name: string, parent: Computed, ctm: Matrix, op: number, w: Walk, depth = 0): void {
  if (depth > SVG_DEPTH_MAX) throw new SvgImportError(`SVG terlalu dalam: lebih dari ${SVG_DEPTH_MAX} tingkat elemen bersarang`);
  const src = ++w.report.seq;
  const { inherited, local } = readPresentation(el, name, w.report);
  if (local.get('display') === 'none') return;
  const style: Computed = new Map([...parent].map(([k, v]) => [k, { ...v, own: false }]));
  for (const [k, v] of inherited) {
    if (v === 'inherit') {
      const p = parent.get(k);
      if (p) style.set(k, { value: p.value, own: true, src: p.src });
      else style.delete(k);
    } else style.set(k, { value: v, own: true, src });
  }
  let m = ctm;
  const tr = local.get('transform');
  if (tr !== undefined) {
    const t = parseTransform(tr);
    if (!t) w.report.drop('value', 'transform');
    else m = multiply(ctm, t);
  }
  let o = op;
  const oa = local.get('opacity');
  if (oa !== undefined) {
    const v = opacity(oa);
    if (v === undefined) w.report.drop('value', 'opacity');
    else {
      o *= v;
      if (v < 1) w.report.kept.add('opacity');
    }
  }
  if (SHAPES.has(name)) {
    if (style.get('visibility')?.value === 'hidden' || style.get('visibility')?.value === 'collapse') return;
    const d = shapeD(el, name, w.report);
    if (d === undefined) return;
    let segs: PathSeg[];
    try {
      segs = parsePath(d);
    } catch {
      w.report.drop('value', 'd');
      return;
    }
    w.shapes.push({ name: ownName(el), segs, d: name === 'path' ? d.trim() : d, ctm: m, style, local, opacity: o, src });
    return;
  }
  for (const c of el.children) {
    if (!('name' in c)) continue;
    const ln = localName(c);
    if (ln === undefined || SILENT_ELEMENTS.has(ln)) continue;
    if (CONTAINERS.has(ln) || SHAPES.has(ln)) walk(c, ln, style, m, o, w, depth + 1);
    else if (ln === 'defs') {
      // Isi defs hanya berguna lewat rujukan (gradien, mask, filter) yang tidak diimpor: dilaporkan per elemen.
      for (const d of c.children) {
        if (!('name' in d)) continue;
        const dn = localName(d);
        if (dn !== undefined && !SILENT_ELEMENTS.has(dn)) w.report.drop('element', `<${dn}>`);
      }
    } else w.report.drop('element', `<${ln}>`);
  }
}

type Paint = { kind: 'none' } | { kind: 'color'; color: string };

/** Nilai paint (`fill`/`stroke`) → warna hex atau none; tak didukung → dilaporkan sebagai none. */
function paint(v: string, color: string, drop: () => void): Paint {
  const s = v.trim();
  if (s === 'none') return { kind: 'none' };
  if (/^currentcolor$/i.test(s)) return { kind: 'color', color };
  if (/^url\(/i.test(s)) {
    // url(#gradien) [fallback]: rujukan tidak diimpor; warna fallback (termasuk currentColor) dipakai bila ada.
    drop();
    const fb = s.replace(/^url\([^)]*\)\s*/i, '');
    if (/^currentcolor$/i.test(fb)) return { kind: 'color', color };
    const c = fb ? parseColor(fb) : undefined;
    return c ? { kind: 'color', color: c } : { kind: 'none' };
  }
  const c = parseColor(s);
  if (!c) {
    drop();
    return { kind: 'none' };
  }
  return { kind: 'color', color: c };
}

/** Node path dari satu bentuk. `box` = kotak path di frame, `k` = skala px per unit user viewBox. */
function pathNode(s: Shape, index: number, vb: readonly [number, number, number, number], box: { x: number; y: number; w: number; h: number }, k: number, report: Report): ImportedNode {
  const get = (key: string) => s.style.get(key);
  /** Nilai tak didukung: dilaporkan sekali per elemen yang menulisnya (warisan `<g>` tidak dihitung per path). */
  const dropV = (key: string) => report.dropFrom('value', key, get(key)?.src ?? s.src);
  const colorRaw = get('color')?.value;
  const color = (colorRaw && parseColor(colorRaw)) || '#000000';
  if (colorRaw && !parseColor(colorRaw) && !/^currentcolor$/i.test(colorRaw)) dropV('color');
  const fill = paint(get('fill')?.value ?? 'black', color, () => dropV('fill'));
  const strokeP = get('stroke') ? paint(get('stroke')!.value, color, () => dropV('stroke')) : ({ kind: 'none' } as Paint);
  const ve = s.local.get('vector-effect');
  if (ve !== undefined && ve !== 'none' && ve !== 'non-scaling-stroke') dropV('vector-effect');
  const transformed = !isIdentity(s.ctm);
  if (transformed) report.kept.add('transform');
  const det = Math.sqrt(Math.abs(s.ctm[0] * s.ctm[3] - s.ctm[1] * s.ctm[2]));
  const nonScaling = s.local.get('vector-effect') === 'non-scaling-stroke';
  const kStroke = nonScaling ? 1 : k * det;

  let strokeWidth = 1;
  const swRaw = get('stroke-width')?.value;
  if (swRaw !== undefined) {
    const v = length(swRaw);
    if (v === undefined || v < 0) dropV('stroke-width');
    else strokeWidth = v;
  }
  const hasFill = fill.kind === 'color';
  const hasStroke = strokeP.kind === 'color' && strokeWidth > 0;

  const node: ImportedNode = {
    type: 'path',
    name: s.name ?? `Path ${index + 1}`,
    d: transformed ? serializePath(transformPath(s.segs, s.ctm)) : s.d,
    viewBox: [...vb],
    width: fmt(box.w),
    height: fmt(box.h),
  };
  if (box.x !== 0 || box.y !== 0) Object.assign(node, { position: 'absolute', x: fmt(box.x), y: fmt(box.y) });
  if (hasFill) node.fills = [{ type: 'solid', color: (fill as { color: string }).color }];
  if (hasStroke) node.stroke = { color: (strokeP as { color: string }).color, width: fmt(strokeWidth * kStroke), align: 'center' };
  const svg: Record<string, string> = {};
  /** Atribut fill-*: disalin bila ada fill atau ditulis pada elemen sendiri; stroke-* sama dengan stroke. */
  const relevant = (key: string, has: boolean) => {
    const v = get(key);
    return v && (has || v.own) ? v.value : undefined;
  };
  const enumProp = <T extends string>(key: KeptAttr, list: readonly T[], prop: string, has: boolean) => {
    const v = relevant(key, has);
    if (v === undefined) return;
    if ((list as readonly string[]).includes(v)) {
      node[prop] = v;
      report.kept.add(key);
    } else dropV(key);
  };
  enumProp('fill-rule', FILL_RULES, 'fillRule', hasFill);
  enumProp('stroke-linecap', STROKE_LINECAPS, 'strokeLinecap', hasStroke);
  enumProp('stroke-linejoin', STROKE_LINEJOINS, 'strokeLinejoin', hasStroke);
  const miter = relevant('stroke-miterlimit', hasStroke);
  if (miter !== undefined) {
    const v = NUM.test(miter.trim()) ? parseFloat(miter) : NaN;
    if (v >= 1 && v <= STROKE_MITERLIMIT_MAX) {
      node.strokeMiterlimit = v;
      report.kept.add('stroke-miterlimit');
    } else dropV('stroke-miterlimit');
  }
  const dash = relevant('stroke-dasharray', hasStroke);
  if (dash !== undefined && dash !== 'none') {
    const parts = dash.split(/[\s,]+/).filter(Boolean);
    const vals = parts.map(length);
    if (vals.length >= 1 && vals.length <= STROKE_DASH_MAX && vals.every((v) => v !== undefined && v >= 0)) {
      node.strokeDasharray = vals.map((v) => fmt(v! * kStroke));
      report.kept.add('stroke-dasharray');
    } else dropV('stroke-dasharray');
  }
  const offset = relevant('stroke-dashoffset', hasStroke);
  if (offset !== undefined) {
    const v = length(offset);
    if (v === undefined) dropV('stroke-dashoffset');
    else {
      svg['stroke-dashoffset'] = String(fmt(v * kStroke));
      report.kept.add('stroke-dashoffset');
    }
  }
  for (const [key, has] of [
    ['fill-opacity', hasFill],
    ['stroke-opacity', hasStroke],
  ] as const) {
    const v = relevant(key, has);
    if (v === undefined) continue;
    const n = opacity(v);
    if (n === undefined) dropV(key);
    else {
      svg[key] = String(fmt(n));
      report.kept.add(key);
    }
  }
  for (const key of ['paint-order', 'shape-rendering'] as const) {
    const v = get(key)?.value.replace(/\s+/g, ' ');
    if (v === undefined) continue;
    if (SVG_ATTR_PATTERNS[key].test(v)) {
      svg[key] = v;
      report.kept.add(key);
    } else dropV(key);
  }
  if (Object.keys(svg).length) node.svg = svg;
  if (s.opacity < 1) node.opacity = fmt(s.opacity);
  return node;
}

/**
 * Impor SVG → node Lakar + laporan. Bukan SVG, rusak, atau tanpa bentuk → SvgImportError. `name` = nama layer
 * akar (mis. nama file); default `<title>` akar, `id` akar, lalu `SVG`.
 */
export function importSvg(content: string, opts: { name?: string } = {}): SvgImport {
  let root: XmlElement;
  try {
    root = parseXml(content.replace(/^\uFEFF/, ''));
  } catch (e) {
    if (e instanceof XmlError) throw new SvgImportError(`SVG tidak bisa diurai: ${e.message}`);
    throw e;
  }
  if (localName(root) !== 'svg') throw new SvgImportError(`akar harus <svg>, bukan <${root.name}>`);
  const report = new Report();
  const w: Walk = { report, shapes: [] };
  walk(root, 'svg', new Map(), IDENTITY, 1, w);
  if (w.shapes.length === 0) throw new SvgImportError('SVG tidak berisi bentuk yang bisa diimpor (path, rect, circle, ellipse, line, polyline, polygon)');

  // viewBox dan ukuran: viewBox akar, width/height akar, atau kotak titik kendali semua bentuk.
  const vbNums = root.attrs.has('viewBox') ? numbers(root.attrs.get('viewBox')!) : undefined;
  if (root.attrs.has('viewBox') && !(vbNums?.length === 4 && vbNums[2]! > 0 && vbNums[3]! > 0)) report.drop('value', 'viewBox');
  let vb: [number, number, number, number] | undefined = vbNums?.length === 4 && vbNums[2]! > 0 && vbNums[3]! > 0 ? [vbNums[0]!, vbNums[1]!, vbNums[2]!, vbNums[3]!] : undefined;
  const wAttr = length(root.attrs.get('width'));
  const hAttr = length(root.attrs.get('height'));
  const width = wAttr !== undefined && wAttr > 0 ? wAttr : undefined;
  const height = hAttr !== undefined && hAttr > 0 ? hAttr : undefined;
  // Satuan tak didukung (%, em, mm, …) atau ≤ 0: ukuran diambil dari viewBox/kotak bentuk, dan dilaporkan.
  if (root.attrs.has('width') && width === undefined) report.drop('value', 'width');
  if (root.attrs.has('height') && height === undefined) report.drop('value', 'height');
  if (!vb) {
    if (width !== undefined && height !== undefined) vb = [0, 0, width, height];
    else {
      let b: [number, number, number, number] | undefined;
      for (const s of w.shapes) {
        const sb = pathBounds(isIdentity(s.ctm) ? s.segs : transformPath(s.segs, s.ctm));
        if (!sb) continue;
        b = b ? [Math.min(b[0], sb[0]), Math.min(b[1], sb[1]), Math.max(b[0] + b[2], sb[0] + sb[2]), Math.max(b[1] + b[3], sb[1] + sb[3])] : [sb[0], sb[1], sb[0] + sb[2], sb[1] + sb[3]];
      }
      const [x0, y0, x1, y1] = b ?? [0, 0, 1, 1];
      // Tanpa viewBox satuan user = px dari 0,0: bila salah satu ukuran diketahui, sumbu lain sampai tepi bentuk.
      if (width !== undefined || height !== undefined) vb = [0, 0, width ?? Math.max(1, fmt(x1)), height ?? Math.max(1, fmt(y1))];
      else vb = [fmt(x0), fmt(y0), Math.max(1, fmt(x1 - x0)), Math.max(1, fmt(y1 - y0))];
    }
  }
  const W = width ?? (height !== undefined ? (height * vb[2]) / vb[3] : vb[2]);
  const H = height ?? (width !== undefined ? (width * vb[3]) / vb[2] : vb[3]);

  // preserveAspectRatio: none = regang; selain itu meet + perataan (slice dilaporkan, diperlakukan meet).
  const par = (root.attrs.get('preserveAspectRatio') ?? 'xMidYMid meet').trim().split(/\s+/);
  let box = { x: 0, y: 0, w: W, h: H };
  let k: number;
  if (par[0] === 'none') k = Math.sqrt((W / vb[2]) * (H / vb[3]));
  else {
    const align = /^x(Min|Mid|Max)Y(Min|Mid|Max)$/.exec(par[0] ?? '');
    if (!align || (par[1] !== undefined && par[1] !== 'meet')) report.drop('value', 'preserveAspectRatio');
    k = Math.min(W / vb[2], H / vb[3]);
    const bw = vb[2] * k;
    const bh = vb[3] * k;
    const f = (a: string | undefined) => (a === 'Min' ? 0 : a === 'Max' ? 1 : 0.5);
    box = { x: (W - bw) * f(align?.[1]), y: (H - bh) * f(align?.[2]), w: bw, h: bh };
    // Kotak sebanding (selisih pembulatan saja) → path mengisi seluruh SVG; selain itu kotak meet apa adanya
    // (xMin/yMin di 0,0 tetap lebih kecil dari SVG).
    if (Math.abs(bw - W) < 1e-6 && Math.abs(bh - H) < 1e-6) box = { x: 0, y: 0, w: W, h: H };
  }

  const children = w.shapes.map((s, i) => pathNode(s, i, vb!, box, k, report));
  const rootTitle = ownName(root, true);
  const explicit = opts.name?.trim().slice(0, PASTE_NAME_MAX) || undefined;
  const rootName = explicit ?? rootTitle ?? 'SVG';
  let node: ImportedNode;
  if (children.length === 1 && box.x === 0 && box.y === 0 && box.w === W && box.h === H) {
    node = children[0]!;
    if (explicit || !w.shapes[0]!.name) node.name = rootName;
  } else {
    node = { type: 'frame', name: rootName, width: fmt(W), height: fmt(H), children };
  }
  return { node, paths: children.length, kept: KEPT_ATTRS.filter((a) => report.kept.has(a)), dropped: report.dropped, width: fmt(W), height: fmt(H) };
}
