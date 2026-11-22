// Importer paste SVG (epic paste-vektor story 3, AD-14/AD-15): pemetaan atribut, transform, warisan, laporan, dan
// round trip korpus ikon-vektor (impor → layer identik dengan fixture v6 → `vectorToSvg` memuat ulang atribut sumber).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyOps, parseDocument, transact } from '@lakar/core';
import { parsePath, serializePath, transformPath, vectorToSvg } from '@lakar/render';
import { findBoard, resolveDocument, type LakarDocument, type ResolvedFrameNode, type ResolvedPathNode } from '@lakar/schema';
import { locateNode } from '../inspect.js';
import { pasteOps } from '../paste.js';
import { parseColor } from './colors.js';
import { SVG_DEPTH_MAX, SvgImportError, importSvg, parseTransform, type ImportedNode } from './svg.js';
import { parseXml, type XmlElement } from './xml.js';

const fixture = (p: string) => readFileSync(new URL(`../../../../tests/fixtures/${p}`, import.meta.url), 'utf8');
const ICONS = { lonceng: 'BrdBel01', cincin: 'BrdCin01', zigzag: 'BrdZig01' } as const;
// Fixture v6 dibawa ke versi terkini (migrasi identitas) supaya bisa di-commit.
const corpus = (): LakarDocument => parseDocument(JSON.parse(fixture('docs/v6/ikon-vektor.lakar.json')));

/** Buang id/nama (rekursif) untuk perbandingan struktur. */
function shape(n: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, name: _name, children, ...rest } = n;
  return children ? { ...rest, children: (children as Record<string, unknown>[]).map(shape) } : rest;
}

const TRACKED = [
  'fill',
  'fill-rule',
  'fill-opacity',
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
] as const;
const FILL_ONLY = new Set(['fill-rule', 'fill-opacity']);
const INHERIT = new Set<string>(TRACKED);

/** Atribut efektif tiap `<path>` (warisan svg/g); atribut warisan yang tidak berefek (stroke-* tanpa stroke) dibuang. */
function effectivePaths(svg: string): { d: string; attrs: Map<string, string> }[] {
  const out: { d: string; attrs: Map<string, string> }[] = [];
  const walkEl = (el: XmlElement, parent: Map<string, { v: string; own: boolean }>) => {
    const cur = new Map([...parent].map(([k, v]) => [k, { v: v.v, own: false }]));
    for (const [k, v] of el.attrs) if (INHERIT.has(k)) cur.set(k, { v, own: true });
    if (el.name === 'path') {
      const stroke = cur.get('stroke')?.v;
      const hasStroke = stroke !== undefined && stroke !== 'none';
      const hasFill = (cur.get('fill')?.v ?? 'black') !== 'none';
      const attrs = new Map<string, string>();
      for (const [k, { v, own }] of cur) {
        if (k.startsWith('stroke-') && !hasStroke && !own) continue;
        if (FILL_ONLY.has(k) && !hasFill && !own) continue;
        attrs.set(k, v);
      }
      out.push({ d: el.attrs.get('d')!, attrs });
      return;
    }
    if (['clipPath', 'mask', 'defs'].includes(el.name)) return;
    for (const c of el.children) if ('name' in c) walkEl(c, cur);
  };
  walkEl(parseXml(svg), new Map());
  return out;
}

const sameValue = (k: string, a: string, b: string) => {
  if (k === 'fill' || k === 'stroke') return a === 'none' || b === 'none' ? a === b : parseColor(a) === parseColor(b);
  const na = a.split(/[\s,]+/).map(Number);
  const nb = b.split(/[\s,]+/).map(Number);
  if (na.every(Number.isFinite) && nb.every(Number.isFinite)) return na.length === nb.length && na.every((x, i) => Math.abs(x - nb[i]!) < 1e-6);
  return a === b;
};

/** Paste `node` ke board `boardId` korpus lewat op core (jalur commit route) → node tersimpan ter-resolve. */
function commit(doc: LakarDocument, boardId: string, node: ImportedNode) {
  const board = findBoard(doc, boardId)!;
  return transact(doc, { sessionId: 'test', description: 'Paste SVG' }, (tx) => applyOps(tx, pasteOps(node, board as never, { x: 0, y: 0 }))).then((c) => {
    const id = c.value.refs.paste!;
    return { doc: c.doc, id, resolved: locateNode(resolveDocument(c.doc), id)!.node };
  });
}

describe('importSvg: korpus ikon-vektor', () => {
  for (const [file, boardId] of Object.entries(ICONS)) {
    it(`${file}.svg → layer identik dengan fixture v6, ekspor ulang tanpa kehilangan atribut`, async () => {
      const source = fixture(`svg/ikon-vektor/${file}.svg`);
      const r = importSvg(source);
      const frame = (findBoard(corpus(), boardId) as unknown as { children: Record<string, unknown>[] }).children[0]!;
      expect(r.node.type).toBe('frame');
      expect(shape(r.node)).toEqual(shape(frame));
      expect(r.dropped).toEqual([]);

      const { resolved } = await commit(corpus(), boardId, r.node);
      const out = vectorToSvg(resolved as ResolvedFrameNode);
      const src = effectivePaths(source);
      const exp = effectivePaths(out.svg);
      expect(exp.map((p) => p.d)).toEqual(src.map((p) => p.d));
      src.forEach((p, i) => {
        for (const k of TRACKED) {
          const want = p.attrs.get(k);
          if (want === undefined) continue;
          // Bawaan SVG: tanpa atribut stroke = none.
          const got = exp[i]!.attrs.get(k) ?? (k === 'stroke' ? 'none' : undefined);
          expect({ path: i, attr: k, ok: got !== undefined && sameValue(k, want, got), got, want }).toMatchObject({ ok: true });
        }
      });
    });
  }

  it('ikon dengan transform: d dipanggang, atribut lain utuh saat diekspor ulang', async () => {
    const source = fixture('svg/ikon-vektor/zigzag.svg');
    const rotated = source.replace(/(<svg[^>]*>)/, '$1<g transform="rotate(90 12 12)">').replace('</svg>', '</g></svg>');
    const r = importSvg(rotated);
    expect(r.kept).toContain('transform');
    const { resolved } = await commit(corpus(), 'BrdZig01', r.node);
    const exp = effectivePaths(vectorToSvg(resolved as ResolvedFrameNode).svg);
    const src = effectivePaths(source);
    src.forEach((p, i) => {
      // Garis horizontal sumber menjadi vertikal sesudah rotasi 90° di sekitar (12,12).
      expect(exp[i]!.d).toBe(serializePath(transformPath(parsePath(p.d), parseTransform('rotate(90 12 12)')!)));
      for (const k of TRACKED) {
        const want = p.attrs.get(k);
        if (want === undefined) continue;
        const got = exp[i]!.attrs.get(k);
        expect({ path: i, attr: k, ok: got !== undefined && sameValue(k, want, got), got, want }).toMatchObject({ ok: true });
      }
    });
  });

  it('kept melaporkan atribut bertipe yang dipetakan', () => {
    expect(importSvg(fixture('svg/ikon-vektor/zigzag.svg')).kept).toEqual(['stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'shape-rendering']);
    expect(importSvg(fixture('svg/ikon-vektor/cincin.svg')).kept).toEqual(['fill-rule', 'fill-opacity', 'stroke-opacity', 'paint-order']);
  });
});

describe('importSvg: pemetaan', () => {
  it('satu path → node path dengan fill hitam bawaan; d disalin apa adanya', () => {
    const r = importSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d=" M0 0h24v24z"/></svg>', { name: 'Logo' });
    expect(r.paths).toBe(1);
    expect(r.node).toEqual({ type: 'path', name: 'Logo', d: 'M0 0h24v24z', viewBox: [0, 0, 24, 24], width: 24, height: 24, fills: [{ type: 'solid', color: '#000000' }] });
  });

  it('nama path dari id/inkscape:label/<title>; frame dari <title> akar', () => {
    const r = importSvg(
      '<svg viewBox="0 0 10 10"><title>Rocket</title><path id="body" d="M0 0L1 1"/><path inkscape:label="Fin" d="M0 0L1 1"/><path d="M0 0L1 1"><title>Flame</title></path><path d="M0 0L1 1"/></svg>',
    );
    expect(r.node.name).toBe('Rocket');
    expect(r.node.children!.map((c) => c.name)).toEqual(['body', 'Fin', 'Flame', 'Path 4']);
  });

  it('bentuk dasar → d setara', () => {
    const r = importSvg(
      '<svg viewBox="0 0 100 100" fill="none" stroke="#000">' +
        '<rect x="1" y="2" width="10" height="20"/><rect x="0" y="0" width="10" height="10" rx="2"/>' +
        '<circle cx="5" cy="5" r="5"/><ellipse cx="5" cy="5" rx="4" ry="2"/>' +
        '<line x1="0" y1="0" x2="10" y2="10"/><polyline points="0,0 10,0 10,10"/><polygon points="0 0 10 0 10 10"/>' +
        '<rect width="0" height="5"/></svg>',
    );
    expect(r.node.children!.map((c) => c.d)).toEqual([
      'M1 2H11V22H1Z',
      'M2 0H8A2 2 0 0 1 10 2V8A2 2 0 0 1 8 10H2A2 2 0 0 1 0 8V2A2 2 0 0 1 2 0Z',
      'M0 5A5 5 0 1 0 10 5A5 5 0 1 0 0 5Z',
      'M1 5A4 2 0 1 0 9 5A4 2 0 1 0 1 5Z',
      'M0 0L10 10',
      'M0 0L10 0L10 10',
      'M0 0L10 0L10 10Z',
    ]);
    expect(r.kept).toEqual([]);
  });

  it('transform bertumpuk dipanggang ke d; stroke dikalikan skala', () => {
    const r = importSvg('<svg width="48" height="48" viewBox="0 0 24 24"><g transform="translate(2 2) scale(2)"><path d="M0 0L5 0" stroke="red" stroke-width="1" fill="none"/></g></svg>');
    expect(r.node).toMatchObject({ type: 'path', d: 'M2 2L12 2', stroke: { color: '#FF0000', width: 4, align: 'center' } });
    expect(r.node.fills).toBeUndefined();
    expect(r.kept).toEqual(['transform']);
  });

  it('rotate(a cx cy) pada arc → kubik terotasi', () => {
    const r = importSvg('<svg viewBox="0 0 24 24"><path transform="rotate(90 12 12)" d="M2 12A10 10 0 0 1 22 12"/></svg>');
    const d = r.node.d as string;
    expect(d.startsWith('M12 2C')).toBe(true);
    expect(d).not.toContain('A');
    expect(d.endsWith('12 22')).toBe(true);
  });

  it('style menimpa atribut; currentColor dari color; inherit', () => {
    const r = importSvg('<svg viewBox="0 0 10 10" color="#123456"><g stroke="blue" style="stroke: #f00; stroke-width: 2 !important" fill="currentColor"><path d="M0 0L1 1" stroke="inherit"/></g></svg>');
    expect(r.node).toMatchObject({ fills: [{ type: 'solid', color: '#123456' }], stroke: { color: '#FF0000', width: 2 } });
  });

  it('warna rgb()/hsl()/nama/hex pendek dan alpha', () => {
    const r = importSvg(
      '<svg viewBox="0 0 1 1"><path d="M0 0" fill="rgb(255 0 0 / 50%)"/><path d="M0 0" fill="hsl(120, 100%, 50%)"/><path d="M0 0" fill="rebeccapurple"/><path d="M0 0" fill="#abc8"/></svg>',
    );
    expect(r.node.children!.map((c) => (c.fills as { color: string }[])[0]!.color)).toEqual(['#FF000080', '#00FF00', '#663399', '#AABBCC88']);
  });

  it('opacity elemen × leluhur; fill-opacity/stroke-opacity dinormalkan', () => {
    const r = importSvg('<svg viewBox="0 0 1 1"><g opacity="0.5"><path d="M0 0" opacity="50%" fill-opacity="40%" stroke="#000" stroke-opacity="1.5"/></g></svg>');
    expect(r.node).toMatchObject({ opacity: 0.25, svg: { 'fill-opacity': '0.4', 'stroke-opacity': '1' } });
    expect(r.kept).toEqual(['fill-opacity', 'stroke-opacity', 'opacity']);
  });

  it('vector-effect non-scaling-stroke → lebar px apa adanya', () => {
    const r = importSvg('<svg width="96" height="96" viewBox="0 0 24 24"><path d="M0 0L1 1" stroke="#000" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>');
    expect((r.node.stroke as { width: number }).width).toBe(2);
  });

  it('tanpa viewBox dan ukuran → kotak titik kendali', () => {
    const r = importSvg('<svg><path d="M10 20L30 60"/></svg>');
    expect(r.node).toMatchObject({ viewBox: [10, 20, 20, 40], width: 20, height: 40 });
  });

  it('preserveAspectRatio meet pada kotak tak sebanding → frame dengan path ter-offset', () => {
    const r = importSvg('<svg width="100" height="50" viewBox="0 0 10 10"><path d="M0 0L10 10" stroke="#000"/></svg>');
    expect(r.node.type).toBe('frame');
    expect(r.node.children![0]).toMatchObject({ position: 'absolute', x: 25, y: 0, width: 50, height: 50, stroke: { width: 5 } });
    const n = importSvg('<svg width="100" height="50" viewBox="0 0 10 10" preserveAspectRatio="none"><path d="M0 0L10 10"/></svg>');
    expect(n.node).toMatchObject({ type: 'path', width: 100, height: 50 });
  });

  it('display none / visibility hidden dilewati tanpa laporan; metadata dan namespace editor diabaikan', () => {
    const r = importSvg(
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><!-- c --><svg xmlns:inkscape="i" xmlns:sodipodi="s" viewBox="0 0 1 1" version="1.1" data-x="1" aria-label="a"><metadata>m</metadata><sodipodi:namedview/>' +
        '<path d="M0 0" display="none"/><g visibility="hidden"><path d="M0 0"/></g><path d="M0 0" class="k" inkscape:connector="1"/></svg>',
    );
    expect(r.paths).toBe(1);
    expect(r.dropped).toEqual([]);
  });

  it('yang tidak terpetakan dibuang dan dilaporkan dengan jumlah', () => {
    const r = importSvg(
      '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"/><mask id="m"/></defs><mask id="m2"/>' +
        '<path d="M0 0L1 1" filter="url(#f)" fill="url(#g)" stroke="#000" stroke-linejoin="arcs" style="mix-blend-mode: multiply"/>' +
        '<path d="M0 0L1 1" filter="blur(2)" mask="url(#m)"/><text>Hi</text><use href="#x"/><image href="a.png"/><style>.a{}</style><script>alert(1)</script>' +
        '<path d="M0 0L1 1" stroke="#000" stroke-dasharray="10%" stroke-miterlimit="0.5"/><path d="M0 0 Q"/><path d="M0 0L1 1" onclick="x()"/></svg>',
    );
    expect(r.dropped).toEqual([
      { kind: 'element', name: '<linearGradient>', count: 1 },
      { kind: 'element', name: '<mask>', count: 2 },
      { kind: 'attribute', name: 'filter', count: 2 },
      { kind: 'attribute', name: 'mix-blend-mode', count: 1 },
      { kind: 'attribute', name: 'mask', count: 1 },
      { kind: 'element', name: '<text>', count: 1 },
      { kind: 'element', name: '<use>', count: 1 },
      { kind: 'element', name: '<image>', count: 1 },
      { kind: 'element', name: '<style>', count: 1 },
      { kind: 'element', name: '<script>', count: 1 },
      { kind: 'value', name: 'd', count: 1 },
      { kind: 'attribute', name: 'onclick', count: 1 },
      { kind: 'value', name: 'fill', count: 1 },
      { kind: 'value', name: 'stroke-linejoin', count: 1 },
      { kind: 'value', name: 'stroke-miterlimit', count: 1 },
      { kind: 'value', name: 'stroke-dasharray', count: 1 },
    ]);
    expect(r.paths).toBe(4);
    expect(r.node.children![0]!.fills).toBeUndefined();
  });

  it('preserveAspectRatio: perataan xMin/xMax; slice dan nilai rusak dilaporkan sekali', () => {
    const at = (par: string) => importSvg(`<svg width="100" height="50" viewBox="0 0 10 10" preserveAspectRatio="${par}"><path d="M0 0L10 10"/></svg>`);
    expect(at('xMinYMin meet').node).toMatchObject({ type: 'frame', width: 100, height: 50 });
    expect(at('xMinYMin meet').node.children![0]).toMatchObject({ width: 50, height: 50 });
    expect(at('xMinYMin meet').node.children![0]!.x).toBeUndefined();
    expect(at('xMaxYMax meet').node.children![0]).toMatchObject({ x: 50, y: 0 });
    expect(at('xMidYMid slice').dropped).toEqual([{ kind: 'value', name: 'preserveAspectRatio', count: 1 }]);
    expect(at('foo').dropped).toEqual([{ kind: 'value', name: 'preserveAspectRatio', count: 1 }]);
    expect(at('xMinYMin meet').dropped).toEqual([]);
  });

  it('nilai warisan tak didukung dilaporkan sekali per elemen sumber, bukan per path', () => {
    const r = importSvg('<svg viewBox="0 0 1 1"><g fill="url(#g)" stroke-linejoin="arcs" stroke="#000"><path d="M0 0L1 1"/><path d="M0 0L1 1"/><path d="M0 0L1 1"/></g><path d="M0 0L1 1" fill="url(#h)"/></svg>');
    expect(r.dropped).toEqual([
      { kind: 'value', name: 'fill', count: 2 },
      { kind: 'value', name: 'stroke-linejoin', count: 1 },
    ]);
  });

  it('nama: <title> akar mendahului id akar; name eksplisit menamai path tunggal', () => {
    expect(importSvg('<svg id="Layer_1" viewBox="0 0 1 1"><title>Rocket</title><path d="M0 0"/><path d="M0 0"/></svg>').node.name).toBe('Rocket');
    expect(importSvg('<svg id="Layer_1" viewBox="0 0 1 1"><path d="M0 0"/><path d="M0 0"/></svg>').node.name).toBe('Layer_1');
    expect(importSvg('<svg viewBox="0 0 1 1"><path id="path1" d="M0 0"/></svg>', { name: 'logo' }).node.name).toBe('logo');
    expect(importSvg('<svg viewBox="0 0 1 1"><path id="path1" d="M0 0"/></svg>').node.name).toBe('path1');
  });

  it('tanpa viewBox dengan satu ukuran: satuan user = px dari 0,0; ukuran satuan lain dilaporkan', () => {
    const r = importSvg('<svg width="100"><path d="M10 10L20 40"/></svg>');
    expect(r.node).toMatchObject({ viewBox: [0, 0, 100, 40], width: 100, height: 40 });
    const pct = importSvg('<svg width="100%" height="2em" viewBox="0 0 24 24"><path d="M0 0L1 1"/></svg>');
    expect(pct.node).toMatchObject({ width: 24, height: 24 });
    expect(pct.dropped).toEqual([
      { kind: 'value', name: 'width', count: 1 },
      { kind: 'value', name: 'height', count: 1 },
    ]);
  });

  it('kasus tepi: points ganjil, fallback currentColor, alpha ≈ 1, angka tak hingga, vector-effect lain', () => {
    const r = importSvg(
      '<svg viewBox="0 0 10 10" color="#123456"><polyline points="0 0 5 5 9" stroke="#000"/><path d="M0 0L1 1" fill="url(#g) currentColor"/>' +
        '<path d="M0 0L1 1" fill="rgba(255,0,0,0.999)"/><path d="M0 0L1e999 1"/><rect width="1e999" height="1"/><path d="M0 0L1 1" vector-effect="non-rotation"/></svg>',
    );
    expect(r.node.children!.map((c) => (c.fills as { color: string }[] | undefined)?.[0]?.color)).toEqual(['#000000', '#123456', '#FF0000', '#000000']);
    expect(r.node.children![0]!.d).toBe('M0 0L5 5');
    expect(r.dropped).toEqual([
      { kind: 'value', name: 'points', count: 1 },
      { kind: 'value', name: 'd', count: 1 },
      { kind: 'value', name: 'width', count: 1 },
      { kind: 'value', name: 'fill', count: 1 },
      { kind: 'value', name: 'vector-effect', count: 1 },
    ]);
  });

  it('<a> sebagai grup, akar ber-prefiks svg:, <svg> bersarang dibuang', () => {
    const r = importSvg('<svg:svg xmlns:svg="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><svg:a href="#x"><svg:path d="M0 0L1 1"/></svg:a><svg:svg><svg:path d="M0 0"/></svg:svg><svg:path d="M0 0L1 1"/></svg:svg>');
    expect(r.paths).toBe(2);
    expect(r.dropped).toEqual([{ kind: 'element', name: '<svg>', count: 1 }]);
  });

  it(`bersarang lebih dari ${SVG_DEPTH_MAX} tingkat → SvgImportError (bukan stack overflow)`, () => {
    const deep = `<svg>${'<g>'.repeat(100_000)}<path d="M0 0L1 1"/>${'</g>'.repeat(100_000)}</svg>`;
    expect(() => importSvg(deep)).toThrow(SvgImportError);
    const ok = `<svg>${'<g>'.repeat(SVG_DEPTH_MAX - 1)}<path d="M0 0L1 1"/>${'</g>'.repeat(SVG_DEPTH_MAX - 1)}</svg>`;
    expect(importSvg(ok).paths).toBe(1);
  });

  it('bukan SVG, rusak, atau tanpa bentuk → SvgImportError', () => {
    for (const bad of ['hello', '<svg><path d="M0 0"></svg>', '<svg></svg>', '<html><svg/></html>', '<svg><g><text>x</text></g></svg>', '<svg/><svg/>']) {
      expect(() => importSvg(bad), bad).toThrow(SvgImportError);
    }
  });

  it('parseTransform: daftar fungsi, koma, dan error', () => {
    expect(parseTransform('translate(10,20) scale(2)')).toEqual([2, 0, 0, 2, 10, 20]);
    expect(parseTransform('matrix(1 0 0 1 5 6)')).toEqual([1, 0, 0, 1, 5, 6]);
    expect(parseTransform('skewX(45)')![2]).toBeCloseTo(1);
    expect(parseTransform('translate(1 2 3)')).toBeUndefined();
    expect(parseTransform('wobble(1)')).toBeUndefined();
  });

  it('hasil lolos skema saat di-commit (path ter-resolve bisa diekspor)', async () => {
    const r = importSvg('<svg viewBox="0 0 24 24"><path d="M0 0h24v24z" fill="#fff" stroke="#000" stroke-dasharray="2,1"/></svg>');
    const { resolved } = await commit(corpus(), 'BrdBel01', r.node);
    expect(vectorToSvg(resolved as ResolvedPathNode).svg).toContain('stroke-dasharray="2 1"');
  });
});
