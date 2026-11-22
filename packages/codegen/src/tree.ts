// Pohon elemen kode dari dokumen tersimpan (AD-10, AD-16). Semua deklarasi CSS berasal dari pemetaan tunggal
// `@lakar/render` css.ts (AD-5) dengan urutan render: milik node → paint → tata letak terhadap parent → efek.
// Instance di-inline lewat `expandInstances` (komponen React = epic kode story 3). Murni.
import {
  BOARD_DEFAULT_BACKGROUND,
  boardDecls,
  boxPaintDecls,
  childLayoutDecls,
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
  textDecls,
  type CssDecl,
  type ParentLayout,
  type Shape,
  type SvgSpec,
} from '@lakar/render';
import {
  expandInstances,
  LakarError,
  type ExpandedBoardNode,
  type ExpandedChildNode,
  type IconGlyph,
  type LakarDocument,
} from '@lakar/schema';
import { camelName, pascalName, words } from './names.js';

/** Peringatan ekspor (bukan error). Pesan dalam bahasa Inggris (tampil di UI/agen); `nodeId` tidak ada untuk peringatan tingkat dokumen (token). */
export type CodegenWarning = { code: 'mesh-fill' | 'icon-glyph-missing' | 'token-var-collision'; nodeId?: string; message: string };

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

export type CodeTree = { name: string; root: CodeElement; board: ExpandedBoardNode; node: ExpandedBoardNode | ExpandedChildNode };

/**
 * Deklarasi duplikat: yang terakhir menang dan tetap di posisinya (sama dengan menerapkan berurutan ke DOM). Kelas
 * Tailwind tidak punya urutan kaskade per elemen, jadi setiap properti hanya boleh sekali.
 */
export function mergeDecls(decls: readonly CssDecl[]): CssDecl[] {
  const last = new Map<string, number>();
  decls.forEach(([p], i) => last.set(p, i));
  return decls.filter(([p], i) => last.get(p) === i);
}

type Ctx = { idPrefix: string; assetBase: string | undefined; glyphs: Map<string, IconGlyph>; warnings: CodegenWarning[] };

const el = (tag: string, name: string, nodeId: string, decls: CssDecl[], children: CodeNode[] = []): CodeElement => ({
  kind: 'element',
  tag,
  name,
  nodeId,
  decls,
  attrs: [],
  children,
});

/** Cari node tersimpan/ter-ekspansi `id` beserta board yang memuatnya. */
function locate(doc: { pages: readonly { children: readonly ExpandedBoardNode[] }[] }, id: string): { board: ExpandedBoardNode; node: ExpandedBoardNode | ExpandedChildNode } | undefined {
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

/** Bangun pohon kode untuk board atau node `opts.nodeId`. Node tidak ada → `NOT_FOUND`. */
export function buildTree(doc: LakarDocument, opts: TreeOptions, warnings: CodegenWarning[]): CodeTree {
  const expanded = expandInstances(doc);
  const hit = locate(expanded, opts.nodeId);
  if (!hit) throw new LakarError('NOT_FOUND', `node ${opts.nodeId} tidak ada`, { hint: 'nodeId harus id board atau node anak di dokumen ini' });
  const name = pascalName(opts.componentName ?? hit.node.name);
  const ctx: Ctx = { idPrefix: words(name).join('-'), assetBase: opts.assetBase, glyphs: new Map((opts.icons ?? []).map((g) => [iconKey(g.lib, g.icon), g])), warnings };
  let root: CodeElement;
  if (hit.node.type === 'board') {
    const b = hit.node;
    const bg = background(ctx, b.id, b.fills);
    root = el('div', camelName(b.name, 'board'), b.id, [...boardDecls(b), ...(bg.length ? bg : ([['background-color', BOARD_DEFAULT_BACKGROUND]] as CssDecl[]))]);
    root.children = children(ctx, b.children, 'column', 0, undefined);
  } else {
    // Akar node anak: anak flow kolom (seperti anak langsung board); posisi absolute akar diabaikan.
    const { position: _p, x: _x, y: _y, ...rest } = hit.node as ExpandedChildNode & { position?: unknown; x?: unknown; y?: unknown };
    root = child(ctx, rest as ExpandedChildNode, 'column', 0, undefined);
  }
  root.decls = mergeDecls(root.decls);
  const modes = doc.tokenModes;
  const mode = hit.board.themeMode;
  if (modes?.length && mode && mode !== modes[0]) root.attrs.push(['data-theme', mode]);
  return { name, root, board: hit.board, node: hit.node };
}

function children(ctx: Ctx, nodes: readonly ExpandedChildNode[], layout: ParentLayout, scrollY: number, gap: unknown): CodeNode[] {
  let flowIndex = 0;
  return nodes.map((c) => {
    // Gap negatif (angka) → margin anak flow ke-2 dst. (sama dengan render layout.ts).
    let negativeGap: number | undefined;
    if (typeof gap === 'number' && gap < 0 && (layout === 'row' || layout === 'column') && c.position !== 'absolute') {
      if (flowIndex > 0) negativeGap = gap;
      flowIndex++;
    }
    return child(ctx, c, layout, scrollY, negativeGap);
  });
}

function background(ctx: Ctx, nodeId: string, fills: unknown): CssDecl[] {
  const { decls, skipped } = codeBackgroundDecls(fills, ctx.assetBase ?? DEFAULT_ASSET_BASE);
  if (skipped) ctx.warnings.push({ code: 'mesh-fill', nodeId, message: `Mesh fill has no CSS equivalent and was skipped (${skipped} layer${skipped > 1 ? 's' : ''}).` });
  return decls;
}

/** Box (frame/rect/ellipse penuh): latar, radius, box-shadow, overlay stroke dalam sebagai `::after`. */
function paintBox(ctx: Ctx, e: CodeElement, n: { id: string; fills?: unknown; stroke?: unknown; shadows?: unknown }, radius: string | undefined): void {
  e.decls.push(...background(ctx, n.id, n.fills), ...boxPaintDecls(n as Parameters<typeof boxPaintDecls>[0], radius));
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
function shapeChildren(ctx: Ctx, e: CodeElement, n: ExpandedChildNode & { fills?: unknown; stroke?: unknown }, shape: Shape): void {
  const bg = background(ctx, n.id, n.fills);
  if (bg.length) e.children.push(el('div', `${e.name}Fill`, n.id, [...shapeFillLayerDecls(shape), ...bg]));
  if (n.stroke) {
    const spec = strokeSvgSpec(shape, n.stroke as Parameters<typeof strokeSvgSpec>[1], `${ctx.idPrefix}-${n.id.replace(/[^A-Za-z0-9]/g, '-')}-stroke`);
    if (spec) e.children.push(svgElement(spec, `${e.name}Stroke`, n.id, false));
  }
}

function child(ctx: Ctx, n: ExpandedChildNode, parent: ParentLayout, scrollY: number, negativeGap: number | undefined): CodeElement {
  const e = el('div', camelName(n.name, n.type), n.id, []);
  let filters: string[] = [];
  switch (n.type) {
    case 'frame': {
      e.decls.push(...frameDecls(n));
      paintBox(ctx, e, n, radiusCss(n.radius));
      e.children = children(ctx, n.children, frameLayout(n), n.scrollY ?? 0, n.gap);
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
      const glyph = ctx.glyphs.get(iconKey(n.lib, n.icon));
      if (glyph) e.children.push(svgElement(iconSvgSpec(n, glyph), `${e.name}Svg`, n.id, false));
      else ctx.warnings.push({ code: 'icon-glyph-missing', nodeId: n.id, message: `Icon ${n.lib}/${n.icon} has no glyph data; exported as an empty box.` });
      filters = dropShadowFilterList(n.shadows);
      break;
    }
  }
  e.decls.push(...childLayoutDecls(n, parent, { negativeGap }), ...effectDecls(n, scrollY, filters));
  e.decls = mergeDecls(e.decls);
  return e;
}
