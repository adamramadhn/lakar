// Pohon elemen kode dari dokumen tersimpan (AD-10, AD-16). Semua deklarasi CSS berasal dari pemetaan tunggal
// `@lakar/render` css.ts (AD-5) dengan urutan render: milik node → paint → tata letak terhadap parent → efek.
// Pohon ini flat (instance sudah di-ekspansi lewat `expandInstances`); akar instance dan master ditandai supaya
// components.ts bisa menggantinya dengan pemakaian komponen React (story 3). Murni.
import {
  BOARD_DEFAULT_BACKGROUND,
  boardDecls,
  boxPaintDecls,
  childLayoutDecls,
  hugBoardChild,
  codeBackgroundDecls,
  DEFAULT_ASSET_BASE,
  DEFAULT_FONT,
  dropShadowFilterList,
  effectDecls,
  ellipseShape,
  fontFamilyCss,
  frameDecls,
  frameLayout,
  iconKey,
  iconSvgSpec,
  pathShape,
  radiusCss,
  shapeFillLayerDecls,
  strokeOverlayDecls,
  strokeSvgSpec,
  tagResetDecls,
  textDecls,
  type CssDecl,
  type ParentLayout,
  type Shape,
  type SvgSpec,
} from '@lakar/render';
import {
  expandInstances,
  LakarError,
  visitStored,
  type ExpandedBoardNode,
  type ExpandedChildNode,
  type ExpandedDocument,
  type IconGlyph,
  type LakarDocument,
} from '@lakar/schema';
import { camelName, pascalName, words } from './names.js';

/** Peringatan ekspor (bukan error). Pesan dalam bahasa Inggris (tampil di UI/agen); `nodeId` tidak ada untuk peringatan tingkat dokumen (token). */
export type CodegenWarning = {
  code: 'mesh-fill' | 'icon-glyph-missing' | 'token-var-collision' | 'instance-inlined' | 'prop-unsupported' | 'component-too-complex';
  nodeId?: string;
  message: string;
};

/** Penanda akar instance (`master:false`) atau master yang berdiri di canvas (`master:true`) pada pohon flat. */
export type InstanceMark = { componentId: string; storedId: string; master: boolean };

/** Elemen kode: `div` node, atau elemen SVG. `svgChild` = elemen di dalam `<svg>` (tanpa kelas; style inline). */
export type CodeElement = {
  kind: 'element';
  tag: string;
  /** Nama dasar kelas (camelCase, belum unik). */
  name: string;
  /** Id node (alamat komposit untuk isi instance). */
  nodeId: string;
  decls: CssDecl[];
  /** Deklarasi pseudo-elemen `::after` (overlay stroke dalam). */
  after?: CssDecl[] | undefined;
  attrs: [string, string][];
  svgChild?: boolean;
  children: CodeNode[];
  /** Peringatan milik node elemen ini (ikut dilaporkan hanya bila elemen ditulis). */
  warnings?: CodegenWarning[] | undefined;
  /** Akar instance/master (pohon flat hasil ekspansi). */
  instance?: InstanceMark | undefined;
};
export type CodeText = { kind: 'text'; text: string };
export type CodeNode = CodeElement | CodeText;

export type TreeOptions = {
  nodeId: string;
  icons?: readonly IconGlyph[] | undefined;
  assetBase?: string | undefined;
  /** Nama komponen; default PascalCase dari nama node. Juga prefiks id clipPath/mask SVG (`<nama>-<idNode>-stroke`: unik antar node dan antar komponen bernama beda). */
  componentName?: string | undefined;
};

export type CodeTree = {
  name: string;
  root: CodeElement;
  board: ExpandedBoardNode;
  node: ExpandedBoardNode | ExpandedChildNode;
  /** Dokumen ter-ekspansi yang dipakai pohon ini. */
  expanded: ExpandedDocument;
};

/**
 * Deklarasi duplikat: yang terakhir menang dan tetap di posisinya (sama dengan menerapkan berurutan ke DOM). Kelas
 * Tailwind tidak punya urutan kaskade per elemen, jadi setiap properti hanya boleh sekali.
 */
export function mergeDecls(decls: readonly CssDecl[]): CssDecl[] {
  const last = new Map<string, number>();
  decls.forEach(([p], i) => last.set(p, i));
  return decls.filter(([p], i) => last.get(p) === i);
}

/** Node tersimpan (mentah) per id: menentukan akar instance pada pohon flat. */
export type StoredIndex = ReadonlyMap<string, Readonly<Record<string, unknown>>>;

/** Indeks node tersimpan dokumen (anak frame, isi slot, master). */
export function storedIndex(doc: LakarDocument): StoredIndex {
  const out = new Map<string, Readonly<Record<string, unknown>>>();
  visitStored(doc, ({ node }) => {
    if (typeof node.id === 'string') out.set(node.id, node);
  });
  return out;
}

/** Konteks pembangun elemen. `requested` = semua ikon yang diminta (untuk `iconRefs`), termasuk yang tanpa glyph. */
export type TreeCtx = {
  idPrefix: string;
  assetBase: string | undefined;
  glyphs: Map<string, IconGlyph>;
  requested: Map<string, { lib: string; icon: string }>;
  stored: StoredIndex | undefined;
};

/** Konteks baru; `name` = nama komponen/berkas (prefiks id SVG). */
export function makeCtx(name: string, opts: { icons?: readonly IconGlyph[] | undefined; assetBase?: string | undefined }, stored: StoredIndex | undefined, requested?: TreeCtx['requested']): TreeCtx {
  return {
    idPrefix: words(name).join('-'),
    assetBase: opts.assetBase,
    glyphs: new Map((opts.icons ?? []).map((g) => [iconKey(g.lib, g.icon), g])),
    requested: requested ?? new Map(),
    stored,
  };
}

const el = (tag: string, name: string, nodeId: string, decls: CssDecl[], children: CodeNode[] = []): CodeElement => ({
  kind: 'element',
  tag,
  name,
  nodeId,
  decls,
  attrs: [],
  children,
});

const warn = (e: CodeElement, w: CodegenWarning) => {
  (e.warnings ??= []).push(w);
};

/** Cari node tersimpan/ter-ekspansi `id` beserta board yang memuatnya. */
export function locate(doc: { pages: readonly { children: readonly ExpandedBoardNode[] }[] }, id: string): { board: ExpandedBoardNode; node: ExpandedBoardNode | ExpandedChildNode } | undefined {
  const walk = (nodes: readonly ExpandedChildNode[]): ExpandedChildNode | undefined => {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.type === 'frame') {
        const hit = walk(n.children);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  for (const p of doc.pages) {
    for (const b of p.children) {
      if (b.id === id) return { board: b, node: b };
      const hit = walk(b.children);
      if (hit) return { board: b, node: hit };
    }
  }
  return undefined;
}

/** Peringatan elemen (pre-order, urutan pembangunan). */
export function collectWarnings(root: CodeElement, out: CodegenWarning[]): CodegenWarning[] {
  const walk = (e: CodeElement) => {
    if (e.warnings) out.push(...e.warnings);
    for (const c of e.children) if (c.kind === 'element') walk(c);
  };
  walk(root);
  return out;
}

/** Hapus posisi akar (`position`, `x`, `y`): akar node diperlakukan sebagai anak flow kolom. */
export function unpositioned(n: ExpandedChildNode): ExpandedChildNode {
  const { position: _p, x: _x, y: _y, ...rest } = n as ExpandedChildNode & { position?: unknown; x?: unknown; y?: unknown };
  return rest as ExpandedChildNode;
}

/** Bangun pohon kode untuk board atau node `opts.nodeId`. Node tidak ada → `NOT_FOUND`. */
export function buildTree(doc: LakarDocument, opts: TreeOptions, warnings: CodegenWarning[], requested?: TreeCtx['requested']): CodeTree {
  const expanded = expandInstances(doc);
  const hit = locate(expanded, opts.nodeId);
  if (!hit) throw new LakarError('NOT_FOUND', `node ${opts.nodeId} tidak ada`, { hint: 'nodeId harus id board atau node anak di dokumen ini' });
  const name = pascalName(opts.componentName ?? hit.node.name);
  const ctx = makeCtx(name, opts, storedIndex(doc), requested);
  let root: CodeElement;
  if (hit.node.type === 'board') {
    const b = hit.node;
    root = el('div', camelName(b.name, 'board'), b.id, []);
    const bg = background(ctx, root, b.fills);
    root.decls = [...boardDecls(b), ...(bg.length ? bg : ([['background-color', BOARD_DEFAULT_BACKGROUND]] as CssDecl[]))];
    root.children = childElements(ctx, b.children.map((c) => hugBoardChild(b, c)), 'column', 0, undefined);
  } else {
    // Akar node anak: anak flow kolom (seperti anak langsung board); posisi absolute akar diabaikan.
    root = nodeElement(ctx, unpositioned(hit.node), 'column', 0, undefined);
  }
  root.decls = mergeDecls(root.decls);
  const modes = doc.tokenModes;
  const mode = hit.board.themeMode;
  if (modes?.length && mode && mode !== modes[0]) root.attrs.push(['data-theme', mode]);
  collectWarnings(root, warnings);
  return { name, root, board: hit.board, node: hit.node, expanded };
}

/** Elemen anak-anak satu parent (gap negatif angka → margin anak flow ke-2 dst., sama dengan render layout.ts). */
export function childElements(ctx: TreeCtx, nodes: readonly ExpandedChildNode[], layout: ParentLayout, scrollY: number, gap: unknown): CodeElement[] {
  let flowIndex = 0;
  return nodes.map((c) => {
    let negativeGap: number | undefined;
    if (typeof gap === 'number' && gap < 0 && (layout === 'row' || layout === 'column') && c.position !== 'absolute') {
      if (flowIndex > 0) negativeGap = gap;
      flowIndex++;
    }
    return nodeElement(ctx, c, layout, scrollY, negativeGap);
  });
}

function background(ctx: TreeCtx, e: CodeElement, fills: unknown): CssDecl[] {
  const { decls, skipped } = codeBackgroundDecls(fills, ctx.assetBase ?? DEFAULT_ASSET_BASE);
  if (skipped) warn(e, { code: 'mesh-fill', nodeId: e.nodeId, message: `Mesh fill has no CSS equivalent and was skipped (${skipped} layer${skipped > 1 ? 's' : ''}).` });
  return decls;
}

/** Box (frame/rect/ellipse penuh): latar, radius, box-shadow, overlay stroke dalam sebagai `::after`. */
function paintBox(ctx: TreeCtx, e: CodeElement, n: { id: string; fills?: unknown; stroke?: unknown; shadows?: unknown }, radius: string | undefined): void {
  e.decls.push(...background(ctx, e, n.fills), ...boxPaintDecls(n as Parameters<typeof boxPaintDecls>[0], radius));
  const after = strokeOverlayDecls(n.stroke as Parameters<typeof strokeOverlayDecls>[0], radius);
  if (after) e.after = after;
}

function svgElement(spec: SvgSpec, name: string, nodeId: string, inner: boolean): CodeElement {
  const e = el(spec.tag, name, nodeId, [...spec.style], spec.children.map((c) => svgElement(c, name, nodeId, true)));
  e.attrs = spec.attrs.map(([k, v]) => [k, v]);
  if (inner) e.svgChild = true;
  return e;
}

/** Bentuk (path, ellipse busur): lapisan fill ber-mask + svg stroke. */
function shapeChildren(ctx: TreeCtx, e: CodeElement, n: ExpandedChildNode & { fills?: unknown; stroke?: unknown }, shape: Shape): void {
  const at = e.children.length;
  const bg = background(ctx, e, n.fills);
  if (bg.length) e.children.push(el('div', `${e.name}Fill`, n.id, [...shapeFillLayerDecls(shape), ...bg]));
  if (n.stroke) {
    const spec = strokeSvgSpec(shape, n.stroke as Parameters<typeof strokeSvgSpec>[1], `${ctx.idPrefix}-${n.id.replace(/[^A-Za-z0-9]/g, '-')}-stroke`);
    // `paint-order` stroke sebelum fill (AD-14): urutan anak sama dengan render.
    if (spec) e.children.splice(shape.strokeUnder ? at : e.children.length, 0, svgElement(spec, `${e.name}Stroke`, n.id, false));
  }
}

/** Penanda akar instance/master untuk node ter-ekspansi (segmen terakhir id = id tersimpan). */
function instanceMark(ctx: TreeCtx, n: ExpandedChildNode): InstanceMark | undefined {
  if (!ctx.stored) return undefined;
  const storedId = n.id.slice(n.id.lastIndexOf('/') + 1);
  const s = ctx.stored.get(storedId);
  if (!s) return undefined;
  if (s.type === 'instance' && typeof s.componentId === 'string') return { componentId: s.componentId, storedId, master: false };
  // Salinan master di dalam instance kehilangan `component`; hanya master tersimpan yang membawanya.
  if ((n as { component?: unknown }).component !== undefined && s.component !== undefined) return { componentId: storedId, storedId, master: true };
  return undefined;
}

/** Elemen satu node anak dalam konteks parent-nya (layout, scrollY, gap negatif). */
export function nodeElement(ctx: TreeCtx, n: ExpandedChildNode, parent: ParentLayout, scrollY: number, negativeGap: number | undefined): CodeElement {
  // Tag semantik (v7, AD-1) menjadi nama elemen; reset UA lebih dulu supaya deklarasi node menimpanya.
  // p/h1–h6 pada frame ditulis <div>: anak frame selalu elemen blok (<div>), yang tidak sah di dalam <p>/<hN>.
  const tag = (n.type === 'frame' || n.type === 'text') && typeof n.tag === 'string' && !(n.type === 'frame' && /^(p|h[1-6])$/.test(n.tag)) ? n.tag : undefined;
  const e = el(tag ?? 'div', camelName(n.name, n.type), n.id, tagResetDecls(tag));
  let filters: string[] = [];
  switch (n.type) {
    case 'frame': {
      e.decls.push(...frameDecls(n));
      paintBox(ctx, e, n, radiusCss(n.radius));
      e.children = childElements(ctx, n.children, frameLayout(n), n.scrollY ?? 0, n.gap);
      break;
    }
    case 'text':
      e.decls.push(...textDecls(n, fontFamilyCss(n.family ?? DEFAULT_FONT.family) ?? DEFAULT_FONT.family));
      e.children = [{ kind: 'text', text: n.content }];
      break;
    case 'rect':
      e.decls.push(['position', 'relative']);
      paintBox(ctx, e, n, radiusCss(n.radius));
      break;
    case 'ellipse': {
      const shape = ellipseShape(n);
      e.decls.push(['position', 'relative']);
      if (shape === 'box') paintBox(ctx, e, n, '50%');
      else if (shape !== 'empty') {
        shapeChildren(ctx, e, n, shape);
        filters = dropShadowFilterList(n.shadows);
      }
      break;
    }
    case 'path':
      e.decls.push(['position', 'relative']);
      shapeChildren(ctx, e, n, pathShape(n));
      filters = dropShadowFilterList(n.shadows);
      break;
    case 'icon': {
      const key = iconKey(n.lib, n.icon);
      if (!ctx.requested.has(key)) ctx.requested.set(key, { lib: n.lib, icon: n.icon });
      const glyph = ctx.glyphs.get(key);
      if (glyph) e.children.push(svgElement(iconSvgSpec(n, glyph), `${e.name}Svg`, n.id, false));
      else warn(e, { code: 'icon-glyph-missing', nodeId: n.id, message: `Icon ${n.lib}/${n.icon} has no glyph data; exported as an empty box.` });
      filters = dropShadowFilterList(n.shadows);
      break;
    }
  }
  e.decls.push(...childLayoutDecls(n, parent, { negativeGap }), ...effectDecls(n, scrollY, filters));
  e.decls = mergeDecls(e.decls);
  const mark = instanceMark(ctx, n);
  if (mark) e.instance = mark;
  return e;
}
