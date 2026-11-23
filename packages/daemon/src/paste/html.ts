// Importer paste HTML (AD-15, AD-5, AD-13, epic paste-vektor story 4): snapshot halaman terisolasi (`html-page.ts`)
// → NodeInput Lakar. Murni dan deterministik (tanpa IO; byte gambar data URI dikembalikan sebagai aset tertunda).
// - Gaya: computed style → skema lewat tabel kebalikan `@lakar/render` (`css-reverse.ts`).
// - Struktur: flex/grid → auto layout bertipe; blok bertumpuk rata kiri → kolom; selain itu `layout:'none'` dengan
//   posisi tetap (tampilan persis, dilaporkan sebagai `layout`).
// - Teks → node `text`; `<img>` data raster → rect + fill image; SVG (inline / data URI) → importer SVG story 3.
// - Yang tidak terpetakan dibuang dan dilaporkan. HTML/CSS mentah tidak pernah masuk ke node (AD-1).
import { createHash } from 'node:crypto';
import {
  alignFromCss,
  blendFromCss,
  blurFromFilterCss,
  boxShadowsFromCss,
  cssColorHex,
  cssPx,
  fontWeightFromCss,
  gradientFromCss,
  gridPlacementFromCss,
  gridTemplateFromCss,
  gridTracksFromPx,
  isClearHex,
  justifyFromCss,
  letterSpacingFromCss,
  lineHeightFromCss,
  radiusFromCss,
  rotationFromTransformCss,
  splitTopLevel,
  textAlignFromCss,
  textShadowsFromCss,
} from '@lakar/render';
import { GRID_TRACKS_MAX, HTML_TAGS } from '@lakar/schema';
import { rasterType } from '../assets.js';
import type { HtmlSnapshot, SnapBox, SnapElement, SnapNode, SnapStyle, SnapText } from './html-page.js';
import { PASTE_NAME_MAX, SvgImportError, importSvg } from './svg.js';

/** Node hasil impor (NodeInput + `children`), di-commit sebagai op `add` berantai oleh `paste.ts`. */
export type ImportedNode = { type: string; name: string; children?: ImportedNode[] } & Record<string, unknown>;

export type HtmlDropKind = 'element' | 'attribute' | 'request' | 'property' | 'value' | 'font' | 'layout';
export type HtmlDropped = { kind: HtmlDropKind; name: string; count: number };
/** Laporan impor HTML (respons route paste `report`). */
export type HtmlReport = { kind: 'html'; layers: number; autoLayout: number; texts: number; images: number; vectors: number; dropped: HtmlDropped[] };
export type PendingAsset = { sha: string; bytes: Buffer };
/** `width`/`height` = kotak akar di halaman (untuk menengahkan akar hug di parent). */
export type HtmlImport = { node: ImportedNode; report: HtmlReport; assets: PendingAsset[]; width: number; height: number };
/** Famili terdaftar (registry font daemon). */
export type FontLookup = (family: string) => { family: string; weights: readonly number[]; styles: readonly string[] } | undefined;

/** HTML tidak bisa diimpor (tanpa elemen/teks terlihat). */
export class HtmlImportError extends Error {}

/** Famili default Lakar (render `DEFAULT_FONT`): tidak ditulis ke node. */
export const DEFAULT_FAMILY = 'Inter';
const MONO_FAMILY = 'JetBrains Mono';
const SANS_GENERIC = new Set(['sans-serif', 'system-ui', 'ui-sans-serif', '-apple-system', 'blinkmacsystemfont']);
const MONO_GENERIC = new Set(['monospace', 'ui-monospace']);
/** Elemen ganti yang tidak punya layer Lakar: menjadi rect berpaint kotaknya dan dilaporkan. */
const BOX_ONLY = new Set(['iframe', 'video', 'audio', 'canvas', 'object', 'embed', 'input', 'textarea', 'select', 'progress', 'meter']);
const TAGS = new Set<string>(HTML_TAGS);
/** Tag yang hanya boleh berisi teks (konten frasa); tidak pernah dipasang pada frame. */
const TEXT_ONLY_TAGS = /^(p|h[1-6])$/;
const TAG_NAMES: Record<string, string> = {
  nav: 'Nav',
  header: 'Header',
  footer: 'Footer',
  main: 'Main',
  section: 'Section',
  article: 'Article',
  aside: 'Aside',
  figure: 'Figure',
  figcaption: 'Caption',
  blockquote: 'Quote',
  ul: 'List',
  ol: 'List',
  li: 'List item',
  button: 'Button',
  a: 'Link',
  img: 'Image',
  svg: 'SVG',
  form: 'Form',
  p: 'Paragraph',
};
/** Panjang nama layer teks dari kontennya. */
const TEXT_NAME_MAX = 40;
const EPS = 0.5;

const r2 = (n: number) => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};

class Report {
  readonly dropped: HtmlDropped[] = [];
  drop(kind: HtmlDropKind, name: string, count = 1) {
    const hit = this.dropped.find((d) => d.kind === kind && d.name === name);
    if (hit) hit.count += count;
    else this.dropped.push({ kind, name, count });
  }
}

type Ctx = { report: Report; fonts: FontLookup; assets: Map<string, Buffer> };
type Layout = 'row' | 'column' | 'grid' | 'none';
/** Konteks parent untuk ukuran anak flow. */
type ParentCtx = { layout: Layout | 'root'; box: SnapBox; contentW: number; contentH: number; align: string; block: boolean };

const px = (s: SnapStyle, k: string) => cssPx(s[k]) ?? 0;
const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const borderW = (s: SnapStyle) => SIDES.map((d) => (/^(none|hidden)$/.test(s[`border-${d}-style`] ?? 'none') ? 0 : px(s, `border-${d}-width`)));
const padW = (s: SnapStyle) => SIDES.map((d) => px(s, `padding-${d}`));
/** Padding Lakar = padding + lebar border (stroke Lakar tidak memakan ruang layout). */
const insets = (s: SnapStyle) => {
  const b = borderW(s);
  return padW(s).map((p, i) => r2(p + b[i]!)) as [number, number, number, number];
};
function paddingValue(p: readonly number[]): number | [number, number] | [number, number, number, number] | undefined {
  const [t, r, b, l] = p as [number, number, number, number];
  if (t === 0 && r === 0 && b === 0 && l === 0) return undefined;
  if (t === r && r === b && b === l) return t;
  if (t === b && r === l) return [t, r];
  return [t, r, b, l];
}
/** Nilai tertulis berupa panjang (bukan auto/kata kunci intrinsik). */
const isLength = (v: string | undefined) => !!v && !/^(auto|none|initial|inherit|unset|revert|normal|fit-content|max-content|min-content|stretch)$/.test(v.trim());
const isFull = (v: string | undefined) => v?.trim() === '100%';

function humanize(s: string): string | undefined {
  const w = s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toLowerCase();
  return w ? (w[0]!.toUpperCase() + w.slice(1)).slice(0, PASTE_NAME_MAX) : undefined;
}
function nameOf(el: SnapElement): string {
  const raw = el.label?.trim() || el.id?.trim();
  if (raw) return raw.slice(0, PASTE_NAME_MAX);
  return (el.cls && humanize(el.cls)) || TAG_NAMES[el.tag] || (/^h[1-6]$/.test(el.tag) ? 'Heading' : 'Frame');
}
const textName = (content: string) => content.replace(/\s+/g, ' ').trim().slice(0, TEXT_NAME_MAX) || 'Text';

/** Efek bersama (opacity, blend, blur, backdrop, rotasi) + properti tanpa padanan yang dilaporkan. */
function effects(node: ImportedNode, el: SnapElement, ctx: Ctx): void {
  const s = el.style;
  const rep = ctx.report;
  const op = Number(s.opacity ?? '1');
  if (s.visibility === 'hidden' || s.visibility === 'collapse') node.opacity = 0;
  else if (Number.isFinite(op) && op < 1) node.opacity = r2(Math.max(0, op) * 100) / 100;
  const blend = s['mix-blend-mode'] ?? 'normal';
  if (blend !== 'normal') {
    if (blendFromCss(blend)) node.blend = blend;
    else rep.drop('value', 'mix-blend-mode');
  }
  const blur = blurFromFilterCss(s.filter ?? 'none');
  if (blur === undefined) rep.drop('property', 'filter');
  else if (blur > 0) node.blur = blur;
  const bb = blurFromFilterCss(s['backdrop-filter'] ?? 'none');
  if (bb === undefined) rep.drop('property', 'backdrop-filter');
  else if (bb > 0) node.backdropBlur = bb;
  const rot = rotationFromTransformCss(s.transform ?? 'none');
  if (rot === undefined) rep.drop('property', 'transform');
  else if (rot !== 0) node.rotation = rot;
  if ((s['outline-style'] ?? 'none') !== 'none') rep.drop('property', 'outline');
  if ((s['clip-path'] ?? 'none') !== 'none') rep.drop('property', 'clip-path');
  if ((s['mask-image'] ?? 'none') !== 'none') rep.drop('property', 'mask-image');
  if ((s.position ?? 'static') !== 'static' && (s['z-index'] ?? 'auto') !== 'auto') rep.drop('property', 'z-index');
  if (s.position === 'relative' && ['top', 'left', 'right', 'bottom'].some((k) => (cssPx(s[k]) ?? 0) !== 0)) rep.drop('value', 'position');
  for (const h of el.handlers ?? []) rep.drop('attribute', h);
  for (const p of el.pseudo ?? []) rep.drop('property', p);
}

/** Data URI → byte + MIME; bukan data URI/rusak → undefined. */
function decodeDataUri(src: string): { mime: string; bytes: Buffer } | undefined {
  const m = /^data:([^,]*?),(.*)$/s.exec(src.trim());
  if (!m) return undefined;
  const meta = m[1]!.split(';');
  const mime = (meta[0] || 'text/plain').toLowerCase();
  try {
    const bytes = meta.includes('base64') ? Buffer.from(m[2]!, 'base64') : Buffer.from(decodeURIComponent(m[2]!), 'utf8');
    return { mime, bytes };
  } catch {
    return undefined;
  }
}

/** Byte raster → assetId (sha256) tertunda; bukan raster → undefined. */
function rasterAsset(bytes: Buffer, ctx: Ctx): string | undefined {
  if (!rasterType(bytes)) return undefined;
  const sha = createHash('sha256').update(bytes).digest('hex');
  ctx.assets.set(sha, bytes);
  return sha;
}

/** `url("…")` dari satu lapisan background-image. */
const urlOf = (layer: string) => /^url\((['"]?)(.*)\1\)$/s.exec(layer.trim())?.[2];

/** Paint kotak (frame/rect): fills, stroke inside, radius, bayangan. */
function paint(node: ImportedNode, el: SnapElement, ctx: Ctx): void {
  const s = el.style;
  const rep = ctx.report;
  const box = { w: el.box[2], h: el.box[3] };
  const fills: Record<string, unknown>[] = [];
  const bg = cssColorHex(s['background-color'] ?? 'transparent');
  if (bg === undefined) rep.drop('value', 'background-color');
  else if (!isClearHex(bg)) fills.push({ type: 'solid', color: bg });
  const images = s['background-image'] ?? 'none';
  if (images !== 'none') {
    const layers = splitTopLevel(images, ',');
    const sizes = splitTopLevel(s['background-size'] ?? 'auto', ',');
    const repeats = splitTopLevel(s['background-repeat'] ?? 'repeat', ',');
    const own: Record<string, unknown>[] = [];
    layers.forEach((layer, i) => {
      const url = urlOf(layer);
      if (url !== undefined) {
        if (!url.startsWith('data:')) return; // permintaan jaringan dilaporkan dari log
        const data = decodeDataUri(url);
        const sha = data && rasterAsset(data.bytes, ctx);
        if (!sha) return rep.drop('value', 'background-image');
        const size = (sizes[i] ?? sizes[0] ?? 'auto').trim();
        const repeat = (repeats[i] ?? repeats[0] ?? 'repeat').trim();
        let fit: string | undefined;
        if (size === 'cover' || size === 'contain') fit = size;
        else if (size === '100% 100%') fit = 'fill';
        else if (/^auto( auto)?$/.test(size) && /^repeat( repeat)?$/.test(repeat)) fit = 'tile';
        if (!fit) {
          rep.drop('value', 'background-size');
          fit = 'cover';
        }
        own.push({ type: 'image', assetId: sha, fit });
        return;
      }
      const g = gradientFromCss(layer, box);
      if (g) own.push(g);
      else rep.drop('value', 'background-image');
    });
    // CSS: lapisan pertama paling atas; skema: fills[0] paling bawah (warna latar di bawah semua gambar).
    fills.push(...own.reverse());
  }
  if (fills.length) node.fills = fills;

  const bw = borderW(s);
  const active = SIDES.map((d, i) => ({ side: d, w: bw[i]!, color: cssColorHex(s[`border-${d}-color`] ?? '') })).filter((b) => b.w > 0);
  if (active.length) {
    const first = active[0]!;
    const same = active.filter((b) => b.w === first.w && b.color === first.color);
    if (same.length !== active.length) rep.drop('value', 'border');
    if (active.some((b) => !/^(solid)$/.test(s[`border-${b.side}-style`] ?? ''))) rep.drop('value', 'border-style');
    if (!first.color) rep.drop('value', 'border-color');
    else if (!isClearHex(first.color)) {
      node.stroke = { color: first.color, width: r2(first.w), align: 'inside', ...(same.length < 4 ? { sides: same.map((b) => b.side) } : {}) };
    }
  }
  const radius = radiusFromCss(
    ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'].map((k) => s[k] ?? '0px'),
    box,
  );
  if (radius.lossy) rep.drop('value', 'border-radius');
  if (radius.radius !== undefined) node.radius = radius.radius;
  const shadows = boxShadowsFromCss(s['box-shadow'] ?? 'none');
  if (shadows === undefined) rep.drop('value', 'box-shadow');
  else if (shadows.length) node.shadows = shadows;
}

/** Kotak yang terlihat sebagai frame (latar, border, padding, bayangan, clip). */
function hasBox(s: SnapStyle): boolean {
  const bg = cssColorHex(s['background-color'] ?? 'transparent');
  return (
    (bg !== undefined && !isClearHex(bg)) ||
    (s['background-image'] ?? 'none') !== 'none' ||
    (s['box-shadow'] ?? 'none') !== 'none' ||
    borderW(s).some((w) => w > 0) ||
    padW(s).some((p) => p > 0)
  );
}

/** Properti teks dari computed style elemen (teks anonim memakai gaya parent-nya). */
function textNode(content: string, s: SnapStyle, ctx: Ctx, mixed: readonly string[] = []): ImportedNode {
  const rep = ctx.report;
  // `font-size:0` (trik spasi inline-block) tidak sah di skema (Positive): pakai 16 dan laporkan.
  const fs = cssPx(s['font-size']);
  if (fs !== undefined && fs <= 0) rep.drop('value', 'font-size');
  const size = fs !== undefined && fs > 0 ? fs : 16;
  const node: ImportedNode = { type: 'text', name: textName(content), content, size: r2(size) };
  // Famili: pertama yang terdaftar atau generik sans/mono; famili tak terpasang diganti Inter dan dilaporkan.
  const list = splitTopLevel(s['font-family'] ?? DEFAULT_FAMILY, ',').map((f) => f.replace(/^(["'])(.*)\1$/, '$2').trim()).filter(Boolean);
  const known = (f: string): string | undefined => {
    const low = f.toLowerCase();
    if (SANS_GENERIC.has(low)) return DEFAULT_FAMILY;
    if (MONO_GENERIC.has(low)) return ctx.fonts(MONO_FAMILY) ? MONO_FAMILY : DEFAULT_FAMILY;
    return ctx.fonts(f)?.family;
  };
  let family: string | undefined;
  for (const f of list) {
    family = known(f);
    if (family) break;
  }
  // Famili pertama (pilihan penulis) tidak terpasang: diganti famili terdaftar berikutnya atau Inter, dilaporkan.
  if (list[0] && !known(list[0])) rep.drop('font', list[0]);
  family ??= DEFAULT_FAMILY;
  const entry = ctx.fonts(family);
  if (family !== DEFAULT_FAMILY) node.family = family;
  const w = fontWeightFromCss(s['font-weight'] ?? '400') ?? 400;
  const weights = entry?.weights.length ? entry.weights : [400];
  const weight = weights.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
  if (weight !== 400) node.weight = weight;
  if (/^(italic|oblique)/.test(s['font-style'] ?? 'normal')) {
    if (!entry || entry.styles.includes('italic')) node.style = 'italic';
    else rep.drop('font', `${family} italic`);
  }
  const lh = lineHeightFromCss(s['line-height'] ?? 'normal');
  if (lh !== undefined) node.lineHeight = lh;
  const ls = letterSpacingFromCss(s['letter-spacing'] ?? 'normal', size);
  if (ls !== undefined) node.letterSpacing = ls;
  const align = textAlignFromCss(s['text-align'] ?? 'start');
  if (align) node.align = align;
  const color = cssColorHex(s.color ?? 'rgb(0, 0, 0)');
  if (color === undefined) rep.drop('value', 'color');
  node.color = color ?? '#000000';
  const ts = textShadowsFromCss(s['text-shadow'] ?? 'none');
  if (ts === undefined) rep.drop('value', 'text-shadow');
  else if (ts.length) node.shadows = ts;
  if (/tabular-nums/.test(s['font-variant-numeric'] ?? '')) node.numeric = 'tabular';
  if ((s['text-decoration-line'] ?? 'none') !== 'none') rep.drop('property', 'text-decoration');
  if ((s['text-overflow'] ?? 'clip') !== 'clip') rep.drop('property', 'text-overflow');
  if (mixed.length) rep.drop('value', 'text styles');
  return node;
}

type Item = { snap: SnapNode; node: ImportedNode; text: boolean; lines: number; absolute: boolean };

/** Ukuran dan posisi anak di konteks parent-nya. */
function place(it: Item, pc: ParentCtx): void {
  const n = it.node;
  const b = it.snap.box;
  const el = it.snap.k === 'el' ? it.snap : undefined;
  const s = el?.style ?? {};
  const spec = el?.spec ?? {};
  // Lebar teks tetap diberi kelonggaran 0.02px (kotak snapshot dibulatkan 2 desimal) supaya baris tidak patah lebih awal.
  const fixedText = () => {
    n.width = r2(b[2] + 0.02);
    n.wrap = it.lines > 1 ? 'wrap' : 'auto';
  };
  if (it.absolute || pc.layout === 'none') {
    n.position = 'absolute';
    n.x = r2(b[0] - pc.box[0]);
    n.y = r2(b[1] - pc.box[1]);
    if (it.text) fixedText();
    else {
      n.width = r2(b[2]);
      n.height = r2(b[3]);
    }
    return;
  }
  // Gambar dan vektor: ukuran tampil tetap.
  if (n.type === 'rect' || n.type === 'path' || el?.tag === 'svg' || el?.tag === 'img') {
    n.width = r2(b[2]);
    n.height = r2(b[3]);
    return;
  }
  const stretchedW = Math.abs(b[2] - pc.contentW) < EPS && pc.align === 'stretch';
  const grow = Number(s['flex-grow'] ?? '0') > 0;
  const selfStart = (pc.layout === 'row' || pc.layout === 'column') && !pc.block && pc.align === 'stretch' && alignFromCss(s['align-self'] ?? 'auto') === 'start';
  if (it.text) {
    if (isLength(spec.width) && !isFull(spec.width)) return fixedText();
    if (selfStart && pc.layout === 'column') {
      if (it.lines > 1) fixedText();
      else n.width = 'hug';
      return;
    }
    if (pc.layout === 'grid') n.width = 'fill';
    else if (pc.layout === 'row') {
      if (grow) n.width = 'fill';
      else if (it.lines > 1) fixedText();
    } else if (pc.layout === 'column') {
      if (stretchedW) n.width = 'fill';
      else if (it.lines > 1) fixedText();
    } else if (it.lines > 1) fixedText();
    if (/^(nowrap|pre)$/.test(s['white-space'] ?? '') && n.width === 'fill') n.wrap = 'auto';
    return;
  }
  // Frame (dan elemen kotak lain).
  const lenOrFill = (v: string | undefined, used: number, fullIsFill: boolean): number | 'fill' | undefined => {
    if (!isLength(v)) return undefined;
    return fullIsFill && isFull(v) ? 'fill' : r2(used);
  };
  if (pc.layout === 'row' || pc.layout === 'column') {
    const mainKey = pc.layout === 'row' ? 'width' : 'height';
    const crossKey = pc.layout === 'row' ? 'height' : 'width';
    const used = (k: string) => (k === 'width' ? b[2] : b[3]);
    const basis = s['flex-basis'] ?? 'auto';
    if (grow) n[mainKey] = 'fill';
    else {
      const m = lenOrFill(spec[mainKey], used(mainKey), false) ?? (isLength(basis) && basis !== '0%' && basis !== '0px' ? r2(used(mainKey)) : undefined);
      if (m !== undefined) n[mainKey] = m;
    }
    // Blok turunan: lebar 100% sama dengan auto (meregang).
    const c = lenOrFill(spec[crossKey], used(crossKey), true);
    if (c !== undefined && !(pc.block && c === 'fill')) n[crossKey] = c;
    else if (selfStart) n[crossKey] = 'hug';
    if (pc.layout === 'column' && pc.block && n.width === 'fill') delete n.width;
  } else if (pc.layout === 'grid') {
    for (const [k, used] of [
      ['width', b[2]],
      ['height', b[3]],
    ] as const) {
      const v = lenOrFill(spec[k], used, true);
      if (v !== undefined) n[k] = v;
    }
  }
  // Frame berlayout `none`: anak absolute tidak memberi ukuran, jadi ukurannya tetap (kecuali yang meregang `fill`).
  if (n.fixedSize) {
    if (n.width !== 'fill' && !(pc.layout === 'column' && pc.block && n.width === undefined)) n.width = r2(b[2]);
    if (n.height !== 'fill') n.height = r2(b[3]);
  }
  if (n.type === 'frame') {
    for (const [k, prop] of [
      ['minWidth', 'min-width'],
      ['maxWidth', 'max-width'],
      ['minHeight', 'min-height'],
      ['maxHeight', 'max-height'],
    ] as const) {
      const v = cssPx(s[prop]);
      const dim = k.endsWith('Width') ? 'width' : 'height';
      if (v !== undefined && v > 0 && typeof n[dim] !== 'number') n[k] = r2(v);
    }
  }
}

type LayoutResult = { props: Record<string, unknown>; ctx: ParentCtx } | { fail: string };

const isElement = (n: SnapNode): n is SnapElement => n.k === 'el';
const hasMargin = (n: SnapNode) => isElement(n) && SIDES.some((d) => (cssPx(n.style[`margin-${d}`]) ?? 0) !== 0);
const isOutOfFlow = (n: SnapNode) => isElement(n) && /^(absolute|fixed)$/.test(n.style.position ?? '');

function contentBox(el: SnapElement): { x: number; y: number; w: number; h: number; pad: [number, number, number, number] } {
  const pad = insets(el.style);
  return { x: el.box[0] + pad[3], y: el.box[1] + pad[0], w: el.box[2] - pad[1] - pad[3], h: el.box[3] - pad[0] - pad[2], pad };
}

function flexLayout(el: SnapElement, flow: readonly SnapNode[]): LayoutResult {
  const s = el.style;
  const dir = s['flex-direction'] ?? 'row';
  if (dir !== 'row' && dir !== 'column') return { fail: 'flex-direction' };
  // `flex-wrap: wrap` → frame `wrap:true` (v9); `wrap-reverse` tetap di luar skema.
  const wrap = s['flex-wrap'] ?? 'nowrap';
  if (wrap !== 'nowrap' && wrap !== 'wrap') return { fail: 'flex-wrap' };
  // `align-content` mengatur distribusi antarbaris dan di luar skema — hanya bermakna saat wrap (nowrap: no-op CSS).
  if (wrap === 'wrap' && s['align-content'] !== undefined && !/^(normal|stretch)$/.test(s['align-content'])) return { fail: 'align-content' };
  const justify = justifyFromCss(s['justify-content'] ?? 'normal');
  if (!justify) return { fail: 'justify-content' };
  const align = alignFromCss(s['align-items'] ?? 'normal');
  if (!align) return { fail: 'align-items' };
  if (flow.some(hasMargin)) return { fail: 'margins' };
  for (const c of flow) {
    if (!isElement(c)) continue;
    const self = c.style['align-self'] ?? 'auto';
    if (self === 'auto' || self === 'normal') continue;
    const a = alignFromCss(self);
    // `align-self:start` di parent stretch = ukuran silang hug (fit-content di awal sumbu).
    if (a !== align && a !== 'stretch' && !(a === 'start' && align === 'stretch')) return { fail: 'align-self' };
  }
  const cb = contentBox(el);
  const gap = cssPx(dir === 'row' ? s['column-gap'] : s['row-gap']) ?? 0;
  // Gap sumbu silang (gap antarbaris saat wrap) → rowGap/columnGap sesuai arah.
  const crossGap = cssPx(dir === 'row' ? s['row-gap'] : s['column-gap']) ?? 0;
  const props: Record<string, unknown> = { layout: dir };
  if (wrap === 'wrap') props.wrap = true;
  if (gap > 0) props.gap = r2(gap);
  if (crossGap > 0) props[dir === 'row' ? 'rowGap' : 'columnGap'] = r2(crossGap);
  const pad = paddingValue(cb.pad);
  if (pad !== undefined) props.padding = pad;
  if (align !== 'stretch') props.align = align;
  if (justify !== 'start') props.justify = justify;
  return { props, ctx: { layout: dir, box: el.box, contentW: cb.w, contentH: cb.h, align, block: false } };
}

function gridLayout(el: SnapElement, flow: readonly SnapNode[], ctx: Ctx): LayoutResult {
  const s = el.style;
  if (!/^row/.test(s['grid-auto-flow'] ?? 'row') || /dense/.test(s['grid-auto-flow'] ?? '')) return { fail: 'grid-auto-flow' };
  if (flow.some(hasMargin)) return { fail: 'margins' };
  if (!/^(normal|stretch|legacy)$/.test(s['justify-items'] ?? 'normal')) return { fail: 'justify-items' };
  const align = alignFromCss(s['align-items'] ?? 'normal');
  if (!align) return { fail: 'align-items' };
  const justify = justifyFromCss(s['justify-content'] ?? 'normal');
  if (!justify) return { fail: 'justify-content' };
  const props: Record<string, unknown> = { layout: 'grid' };
  for (const [key, prop] of [
    ['gridTemplateColumns', 'grid-template-columns'],
    ['gridTemplateRows', 'grid-template-rows'],
  ] as const) {
    const written = el.spec[prop] ?? '';
    if (!isLength(written)) continue;
    const tracks = gridTemplateFromCss(written, GRID_TRACKS_MAX);
    if (tracks) props[key] = tracks;
    else {
      const used = gridTracksFromPx(s[prop] ?? '', GRID_TRACKS_MAX);
      if (!used) return { fail: prop };
      ctx.report.drop('value', prop);
      props[key] = used;
    }
  }
  for (const c of flow) {
    if (!isElement(c)) continue;
    if (!/^(auto|normal|stretch)$/.test(c.style['justify-self'] ?? 'auto')) return { fail: 'justify-self' };
    if (!/^(auto|normal)$/.test(c.style['align-self'] ?? 'auto') && alignFromCss(c.style['align-self'] ?? '') !== align) return { fail: 'align-self' };
    if (
      gridPlacementFromCss(c.style['grid-column-start'] ?? 'auto', c.style['grid-column-end'] ?? 'auto') === undefined ||
      gridPlacementFromCss(c.style['grid-row-start'] ?? 'auto', c.style['grid-row-end'] ?? 'auto') === undefined
    )
      return { fail: 'grid-area' };
  }
  const cg = cssPx(s['column-gap']) ?? 0;
  const rg = cssPx(s['row-gap']) ?? 0;
  if (cg > 0) props.columnGap = r2(cg);
  if (rg > 0) props.rowGap = r2(rg);
  const cb = contentBox(el);
  const pad = paddingValue(cb.pad);
  if (pad !== undefined) props.padding = pad;
  if (align !== 'stretch') props.align = align;
  if (justify !== 'start') props.justify = justify;
  return { props, ctx: { layout: 'grid', box: el.box, contentW: cb.w, contentH: cb.h, align, block: false } };
}

/** Blok: anak flow bertumpuk vertikal, rata kiri konten, jarak seragam → kolom dengan padding/gap dari kotak. */
function blockLayout(el: SnapElement, flow: readonly SnapNode[]): LayoutResult {
  const cb = contentBox(el);
  for (const c of flow) {
    if (!isElement(c)) continue;
    const d = c.style.display ?? 'block';
    if (/^inline/.test(d) || d === 'table-cell' || d === 'table-row') return { fail: 'inline content' };
  }
  let gap: number | undefined;
  for (let i = 0; i < flow.length; i++) {
    const b = flow[i]!.box;
    if (Math.abs(b[0] - cb.x) > EPS) return { fail: 'alignment' };
    if (b[0] + b[2] > cb.x + cb.w + EPS) return { fail: 'overflow' };
    if (i > 0) {
      const prev = flow[i - 1]!.box;
      const g = b[1] - (prev[1] + prev[3]);
      if (g < -EPS) return { fail: 'overlap' };
      if (gap === undefined) gap = g;
      else if (Math.abs(g - gap) > EPS) return { fail: 'uneven spacing' };
    }
  }
  const first = flow[0]!.box;
  const last = flow[flow.length - 1]!.box;
  const top = r2(first[1] - el.box[1]);
  const bottom = r2(el.box[1] + el.box[3] - (last[1] + last[3]));
  if (top < -EPS || bottom < -EPS) return { fail: 'overflow' };
  const props: Record<string, unknown> = { layout: 'column' };
  if (gap !== undefined && gap > EPS / 5) props.gap = r2(gap);
  const pad = paddingValue([Math.max(0, top), cb.pad[1], Math.max(0, bottom), cb.pad[3]]);
  if (pad !== undefined) props.padding = pad;
  return { props, ctx: { layout: 'column', box: el.box, contentW: cb.w, contentH: cb.h, align: 'stretch', block: true } };
}

/** Teks anonim sintetis untuk elemen teks berkotak (kotak = kotak konten elemen). */
function innerText(el: SnapElement): SnapText {
  const cb = contentBox(el);
  return { k: 'text', content: el.text!.content, box: [cb.x, cb.y, cb.w, cb.h], lines: el.text!.lines };
}

/** Node untuk satu snapshot elemen (tanpa ukuran/posisi; itu diatur `place` di konteks parent). */
function elementNode(el: SnapElement, ctx: Ctx): { node: ImportedNode; text: boolean; lines: number } | undefined {
  const rep = ctx.report;
  const tag = TAGS.has(el.tag) ? el.tag : undefined;
  if (el.tag === 'img') {
    const data = el.img?.src ? decodeDataUri(el.img.src) : undefined;
    if (data?.mime === 'image/svg+xml') {
      const svg = vectorNode(data.bytes.toString('utf8'), el, ctx);
      if (svg) return { node: svg, text: false, lines: 1 };
    }
    const node: ImportedNode = { type: 'rect', name: nameOf(el) };
    paint(node, el, ctx);
    const sha = data ? rasterAsset(data.bytes, ctx) : undefined;
    if (data && !sha) rep.drop('value', 'img src');
    if (sha) {
      const fitCss = el.style['object-fit'] ?? 'fill';
      const fit = fitCss === 'cover' || fitCss === 'contain' || fitCss === 'fill' ? fitCss : 'contain';
      if (fit !== fitCss) rep.drop('value', 'object-fit');
      node.fills = [...((node.fills as unknown[]) ?? []), { type: 'image', assetId: sha, fit }];
    }
    effects(node, el, ctx);
    return { node, text: false, lines: 1 };
  }
  if (el.tag === 'svg') {
    const svg = el.svg !== undefined ? vectorNode(el.svg, el, ctx) : undefined;
    if (svg) return { node: svg, text: false, lines: 1 };
    rep.drop('element', '<svg>');
    const node: ImportedNode = { type: 'rect', name: nameOf(el) };
    effects(node, el, ctx);
    return { node, text: false, lines: 1 };
  }
  if (BOX_ONLY.has(el.tag)) {
    rep.drop('element', `<${el.tag}>`);
    const node: ImportedNode = { type: 'rect', name: nameOf(el) };
    paint(node, el, ctx);
    effects(node, el, ctx);
    return { node, text: false, lines: 1 };
  }
  if (el.text && !hasBox(el.style) && (el.style['overflow-x'] ?? 'visible') === 'visible') {
    const node = textNode(el.text.content, el.style, ctx, el.text.mixed);
    if (tag) node.tag = tag;
    effects(node, el, ctx);
    return { node, text: true, lines: el.text.lines };
  }
  return { node: frameNode(el, ctx), text: false, lines: 1 };
}

/** SVG (inline atau data URI) → importer SVG story 3, nama dari elemen bila ada. */
function vectorNode(xml: string, el: SnapElement, ctx: Ctx): ImportedNode | undefined {
  const explicit = el.label?.trim() || el.id?.trim() || (el.cls && humanize(el.cls));
  let imported;
  try {
    imported = importSvg(xml, explicit ? { name: explicit } : {});
  } catch (e) {
    if (e instanceof SvgImportError) return undefined;
    throw e;
  }
  for (const d of imported.dropped) ctx.report.drop(d.kind, d.kind === 'element' ? d.name : `svg ${d.name}`, d.count);
  const node = imported.node as ImportedNode;
  node.width = r2(el.box[2]);
  node.height = r2(el.box[3]);
  effects(node, el, ctx);
  return node;
}

/** Frame dari elemen kontainer (atau elemen teks berkotak). */
function frameNode(el: SnapElement, ctx: Ctx): ImportedNode {
  const node: ImportedNode = { type: 'frame', name: nameOf(el) };
  // p/h1–h6 hanya untuk teks: anak frame diekspor sebagai <div>, yang tidak sah di dalam <p>/<hN>. Elemen teks berkotak
  // memberi tag itu ke teks di dalamnya.
  const textTag = TEXT_ONLY_TAGS.test(el.tag);
  if (TAGS.has(el.tag) && !textTag) node.tag = el.tag;
  paint(node, el, ctx);
  if ((el.style['overflow-x'] ?? 'visible') !== 'visible' || (el.style['overflow-y'] ?? 'visible') !== 'visible') node.clip = true;
  effects(node, el, ctx);
  const snaps: SnapNode[] = el.text ? [innerText(el)] : el.children;
  const items: Item[] = [];
  for (const c of snaps) {
    if (c.k === 'text') {
      const t = textNode(c.content, el.style, ctx);
      if (el.text && textTag) t.tag = el.tag;
      items.push({ snap: c, node: t, text: true, lines: c.lines, absolute: false });
      continue;
    }
    const made = elementNode(c, ctx);
    if (made) items.push({ snap: c, ...made, absolute: isOutOfFlow(c) });
  }
  const flow = items.filter((i) => !i.absolute).map((i) => i.snap);
  let result: LayoutResult;
  const display = el.style.display ?? 'block';
  if (!flow.length) result = { fail: '' };
  else if (/flex$/.test(display)) result = flexLayout(el, flow);
  else if (/grid$/.test(display)) result = gridLayout(el, flow, ctx);
  else result = blockLayout(el, flow);
  let pc: ParentCtx;
  if ('fail' in result) {
    if (result.fail) ctx.report.drop('layout', result.fail);
    pc = { layout: 'none', box: el.box, contentW: el.box[2], contentH: el.box[3], align: 'stretch', block: false };
    node.fixedSize = true;
  } else {
    Object.assign(node, result.props);
    pc = result.ctx;
  }
  for (const it of items) {
    if (pc.layout === 'grid' && isElement(it.snap)) {
      const col = gridPlacementFromCss(it.snap.style['grid-column-start'] ?? 'auto', it.snap.style['grid-column-end'] ?? 'auto');
      const row = gridPlacementFromCss(it.snap.style['grid-row-start'] ?? 'auto', it.snap.style['grid-row-end'] ?? 'auto');
      if (col && Object.keys(col).length) it.node.gridColumn = col;
      if (row && Object.keys(row).length) it.node.gridRow = row;
    }
    place(it, pc);
  }
  // Anak absolute dilukis di atas anak flow (urutan lukis CSS untuk elemen terposisi).
  node.children = [...items.filter((i) => !i.absolute), ...items.filter((i) => i.absolute)].map((i) => i.node);
  return node;
}

/** Jumlah node dan rincian laporan. */
function tally(node: ImportedNode, r: HtmlReport): void {
  r.layers++;
  if (node.type === 'text') r.texts++;
  if (node.type === 'path') r.vectors++;
  if (node.type === 'frame' && typeof node.layout === 'string' && node.layout !== 'none') r.autoLayout++;
  if (Array.isArray(node.fills) && node.fills.some((f) => (f as { type?: unknown }).type === 'image')) r.images++;
  for (const c of node.children ?? []) tally(c, r);
}

/** Hapus penanda internal (`fixedSize`) dan anak kosong. */
function finish(node: ImportedNode): void {
  delete node.fixedSize;
  if (node.type !== 'frame') delete node.children;
  for (const c of node.children ?? []) finish(c);
}

/** Nama laporan untuk snapshot terpotong (batas elemen/kedalaman); viewer memberinya alasan sendiri. */
export const TRUNCATED_NAME = 'elements beyond the import limit';

const REQUEST_LABELS: Record<string, string> = { image: 'external image', stylesheet: 'external stylesheet', font: 'external font' };

/**
 * Impor snapshot HTML → node akar Lakar + laporan + aset tertunda. Tanpa elemen/teks terlihat → HtmlImportError.
 * `name` = nama layer akar.
 */
export function importHtml(snap: HtmlSnapshot, opts: { name?: string; fonts: FontLookup }): HtmlImport {
  const ctx: Ctx = { report: new Report(), fonts: opts.fonts, assets: new Map() };
  if (snap.scripts > 0) ctx.report.drop('element', '<script>', snap.scripts);
  const body = snap.body;
  const kids = body.children;
  let rootSnap: SnapElement | undefined;
  /** Akar = body (frame "HTML" atau teks body): tinggi tertulis body (`height:100%`) bukan tinggi isi. */
  let bodyRoot = false;
  let made: { node: ImportedNode; text: boolean; lines: number } | undefined;
  if (body.text) {
    rootSnap = body;
    bodyRoot = true;
    made = { node: textNode(body.text.content, body.style, ctx, body.text.mixed), text: true, lines: body.text.lines };
  } else if (kids.length === 1 && isElement(kids[0]!)) {
    rootSnap = kids[0];
    made = elementNode(rootSnap, ctx);
  } else if (kids.length) {
    rootSnap = { ...body, tag: 'div', label: 'HTML' };
    bodyRoot = true;
    made = { node: frameNode(rootSnap, ctx), text: false, lines: 1 };
  }
  if (!rootSnap || !made) throw new HtmlImportError('HTML tidak berisi elemen atau teks yang terlihat');
  for (const r of snap.requests) ctx.report.drop('request', REQUEST_LABELS[r.type] ?? 'network request');
  if (snap.truncated) ctx.report.drop('element', TRUNCATED_NAME);
  const node = made.node;
  // Akar: lebar tetap; tinggi hanya bila tetap atau layout `none` (selain itu hug, mengikuti isinya).
  const b = rootSnap.box;
  if (made.text) {
    if (made.lines > 1) {
      node.width = r2(b[2] + 0.02);
      node.wrap = 'wrap';
    }
  } else {
    node.width = r2(b[2]);
    if (node.fixedSize || node.type !== 'frame' || (isLength(rootSnap.spec.height) && !bodyRoot)) node.height = r2(b[3]);
    else delete node.height;
    if (node.type === 'frame' && node.fixedSize === undefined && typeof node.height !== 'number' && rootSnap.style['min-height']) {
      const mh = cssPx(rootSnap.style['min-height']);
      if (mh) node.minHeight = r2(mh);
    }
  }
  delete node.position;
  delete node.x;
  delete node.y;
  const explicit = opts.name?.trim().slice(0, PASTE_NAME_MAX);
  if (explicit) node.name = explicit;
  finish(node);
  const report: HtmlReport = { kind: 'html', layers: 0, autoLayout: 0, texts: 0, images: 0, vectors: 0, dropped: ctx.report.dropped };
  tally(node, report);
  return { node, report, assets: [...ctx.assets].map(([sha, bytes]) => ({ sha, bytes })), width: r2(b[2]), height: r2(b[3]) };
}
