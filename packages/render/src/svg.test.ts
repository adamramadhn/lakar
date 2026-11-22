// Atribut vektor (AD-14): pemetaan tunggal `vectorSvgAttrs`, pemasangannya di bentuk path/stroke, dan serializer
// ekspor `vectorToSvg`. Murni (tanpa Chromium); paritas piksel ada di test/corpus.test.ts.
import { describe, expect, it } from 'vitest';
import type { ResolvedFrameNode, ResolvedPathNode } from '@lakar/schema';
import { strokeBeforeFill, vectorSvgAttrs } from './css.js';
import { pathShape, shapeFillLayerDecls, strokeSvgSpec } from './shape.js';
import { vectorToSvg } from './svg.js';

const P = (extra: Record<string, unknown> = {}): ResolvedPathNode =>
  ({ type: 'path', id: 'Pppppppp', name: 'P', d: 'M2 2L22 22', viewBox: [0, 0, 24, 24], ...extra }) as ResolvedPathNode;
const FULL = {
  fillRule: 'evenodd',
  strokeLinecap: 'round',
  strokeLinejoin: 'bevel',
  strokeDasharray: [4, 2],
  strokeMiterlimit: 8,
  svg: { 'fill-opacity': '0.25', 'stroke-opacity': '0.5', 'stroke-dashoffset': '1', 'shape-rendering': 'crispEdges', 'paint-order': 'stroke' },
};
const strokePath = (n: ResolvedPathNode) => {
  const spec = strokeSvgSpec(pathShape(n), { color: '#000000', width: 2, align: 'center' }, 'x')!;
  return spec.children.at(-1)!.attrs;
};

describe('vectorSvgAttrs (css.ts, AD-5)', () => {
  it('tanpa properti vektor: nonzero, tanpa atribut fill, join miter saja', () => {
    expect(vectorSvgAttrs({})).toEqual({ rule: 'nonzero', fill: [], stroke: [['stroke-linejoin', 'miter']], strokeUnder: false });
  });

  it('semua properti bertipe dan svg dipetakan', () => {
    expect(vectorSvgAttrs(FULL)).toEqual({
      rule: 'evenodd',
      fill: [
        ['fill-opacity', '0.25'],
        ['shape-rendering', 'crispEdges'],
      ],
      stroke: [
        ['stroke-linejoin', 'bevel'],
        ['stroke-linecap', 'round'],
        ['stroke-miterlimit', '8'],
        ['stroke-dasharray', '4 2'],
        ['stroke-dashoffset', '1'],
        ['stroke-opacity', '0.5'],
        ['shape-rendering', 'crispEdges'],
      ],
      strokeUnder: true,
    });
  });

  it('nilai tak terpetakan dilewati', () => {
    expect(vectorSvgAttrs({ fillRule: 'x', strokeLinecap: 'arrow', strokeLinejoin: 7, strokeDasharray: ['a'], strokeMiterlimit: 'x', svg: 'stroke' })).toEqual(vectorSvgAttrs({}));
  });

  it.each([
    ['normal', false],
    ['fill', false],
    ['stroke', true],
    ['markers', false],
    ['markers stroke', true],
    ['fill stroke', false],
    [undefined, false],
  ])('paint-order %s → stroke di bawah fill: %s', (v, under) => {
    expect(strokeBeforeFill(v)).toBe(under);
  });
});

describe('bentuk path (shape.ts)', () => {
  it('path lama: mask dan stroke identik dengan v5', () => {
    const shape = pathShape(P());
    expect(shapeFillLayerDecls(shape).find(([k]) => k === 'mask-image')![1]).toContain(encodeURIComponent('fill="#000" fill-rule="nonzero"/>'));
    expect(strokePath(P())).toEqual([
      ['d', 'M2 2L22 22'],
      ['fill', 'none'],
      ['stroke', '#000000'],
      ['stroke-width', '2'],
      ['vector-effect', 'non-scaling-stroke'],
      ['stroke-linejoin', 'miter'],
    ]);
    expect(shape.strokeUnder).toBeUndefined();
  });

  it('atribut vektor di mask fill, path stroke, dan clip inside', () => {
    const n = P(FULL);
    const mask = decodeURIComponent(shapeFillLayerDecls(pathShape(n)).find(([k]) => k === 'mask-image')![1]);
    expect(mask).toContain('fill-rule="evenodd" fill-opacity="0.25" shape-rendering="crispEdges"/>');
    expect(strokePath(n)).toEqual(expect.arrayContaining([['stroke-linecap', 'round'], ['stroke-dasharray', '4 2'], ['stroke-opacity', '0.5']]));
    const inside = strokeSvgSpec(pathShape(n), { color: '#000000', width: 2, align: 'inside' }, 'c')!;
    expect(JSON.stringify(inside)).toContain('["clip-rule","evenodd"]');
    expect(pathShape(n).strokeUnder).toBe(true);
  });
});

describe('vectorToSvg (AD-14)', () => {
  it('path 1:1: semua atribut bertipe dan svg keluar, stroke-width dalam unit user', () => {
    const out = vectorToSvg(P({ width: 24, height: 24, fills: [{ type: 'solid', color: '#2563EB' }], stroke: { color: '#111827', width: 2, align: 'center' }, ...FULL }));
    expect(out.dropped).toEqual([]);
    expect(out.svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
        '<path d="M2 2L22 22" fill="#2563EB" fill-opacity="0.25" fill-rule="evenodd" stroke="#111827" stroke-opacity="0.5" stroke-width="2" ' +
        'stroke-linejoin="bevel" stroke-linecap="round" stroke-miterlimit="8" stroke-dasharray="4 2" stroke-dashoffset="1" ' +
        'shape-rendering="crispEdges" paint-order="stroke"/></svg>',
    );
  });

  it('path tanpa stroke tetap mengeluarkan atribut stroke bertipe dan svg (tidak hilang diam-diam)', () => {
    const out = vectorToSvg(P({ width: 48, height: 48, fills: [{ type: 'solid', color: '#000000' }], ...FULL }));
    expect(out.dropped).toEqual([]);
    for (const a of ['fill-rule="evenodd"', 'stroke-linejoin="bevel"', 'stroke-linecap="round"', 'stroke-miterlimit="8"', 'stroke-dasharray="2 1"', 'stroke-dashoffset="0.5"', 'stroke-opacity="0.5"', 'fill-opacity="0.25"', 'shape-rendering="crispEdges"', 'paint-order="stroke"']) {
      expect(out.svg, a).toContain(a);
    }
  });

  it('opacity node membungkus semua elemen node (fill bertumpuk ikut)', () => {
    const svg = vectorToSvg(P({ opacity: 0.5, fills: [{ type: 'solid', color: '#000000' }, { type: 'solid', color: '#FF0000' }], stroke: { color: '#000000', width: 1, align: 'center' } })).svg;
    expect(svg).toMatch(/<g opacity="0.5"><path d="M2 2L22 22" fill="#000000"\/><path d="M2 2L22 22" fill="#FF0000" stroke="#000000" stroke-width="1"\/><\/g>/);
  });

  it('path berukuran 0 tidak menghasilkan elemen (tanpa Infinity)', () => {
    const svg = vectorToSvg({ type: 'frame', id: 'Ffffffff', name: 'F', width: 24, height: 24, children: [P({ width: 0, height: 0, stroke: { color: '#000000', width: 2, align: 'center' } })] } as unknown as ResolvedFrameNode).svg;
    expect(svg).not.toContain('Infinity');
    expect(svg).not.toContain('<path');
  });

  it('skala seragam: panjang stroke px dibagi skala', () => {
    const out = vectorToSvg(P({ width: 96, height: 96, stroke: { color: '#000000', width: 8, align: 'center' }, strokeDasharray: [8, 4], svg: { 'stroke-dashoffset': '4' } }));
    expect(out.svg).toContain('stroke-width="2"');
    expect(out.svg).toContain('stroke-dasharray="2 1"');
    expect(out.svg).toContain('stroke-dashoffset="1"');
    expect(out.svg).not.toContain('vector-effect');
    expect(out.svg).toContain('fill="none"');
  });

  it('skala tak seragam: px + non-scaling-stroke, preserveAspectRatio none', () => {
    const out = vectorToSvg(P({ width: 48, height: 24, stroke: { color: '#000000', width: 2, align: 'center' } }));
    expect(out.svg).toContain('preserveAspectRatio="none"');
    expect(out.svg).toContain('stroke-width="2"');
    expect(out.svg).toContain('vector-effect="non-scaling-stroke"');
  });

  it('alpha warna menjadi fill-opacity/stroke-opacity (dikali opacity svg)', () => {
    const out = vectorToSvg(P({ fills: [{ type: 'solid', color: '#FF000080' }], stroke: { color: '#00000080', width: 1, align: 'center' }, svg: { 'fill-opacity': '0.5' } }));
    expect(out.svg).toContain('fill="#FF0000" fill-opacity="0.251"');
    expect(out.svg).toContain('stroke="#000000" stroke-opacity="0.502" stroke-width="1"');
  });

  it('stroke inside → clipPath; outside → mask dan elemen stroke terpisah', () => {
    const inside = vectorToSvg(P({ fills: [{ type: 'solid', color: '#FFFFFF' }], stroke: { color: '#000000', width: 2, align: 'inside' } })).svg;
    expect(inside).toContain('<defs><clipPath id="lakar-clip-1"><path d="M2 2L22 22" clip-rule="nonzero"/></clipPath></defs>');
    expect(inside).toContain('stroke-width="4"');
    expect(inside).toContain('clip-path="url(#lakar-clip-1)"');
    const outside = vectorToSvg(P({ fills: [{ type: 'solid', color: '#FFFFFF' }], stroke: { color: '#000000', width: 2, align: 'outside' } })).svg;
    expect(outside).toContain('<mask id="lakar-mask-1" maskUnits="userSpaceOnUse"');
    expect(outside).toMatch(/<path d="M2 2L22 22" fill="#FFFFFF"\/><path d="M2 2L22 22" fill="none" stroke="#000000" stroke-width="4" mask="url\(#lakar-mask-1\)"\/>/);
  });

  it('frame ikon (viewBox sama, menutupi frame) → satu svg berisi path polos', () => {
    const frame = {
      type: 'frame',
      id: 'Ffffffff',
      name: 'Icon',
      width: 24,
      height: 24,
      children: [P({ id: 'Paaaaaaa', width: 24, height: 24, stroke: { color: '#000000', width: 2, align: 'center' } }), P({ id: 'Pbbbbbbb', d: 'M2 22L22 2', width: 24, height: 24, fills: [{ type: 'solid', color: '#EF4444' }] })],
    } as unknown as ResolvedFrameNode;
    const out = vectorToSvg(frame);
    expect(out.dropped).toEqual([]);
    expect(out.svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
        '<path d="M2 2L22 22" fill="none" stroke="#000000" stroke-width="2"/><path d="M2 22L22 2" fill="#EF4444"/></svg>',
    );
  });

  it('frame umum: path diposisikan dengan matriks, frame bersarang dengan translate', () => {
    const frame = {
      type: 'frame',
      id: 'Ffffffff',
      name: 'F',
      width: 100,
      height: 50,
      children: [
        P({ id: 'Paaaaaaa', position: 'absolute', x: 10, y: 5, width: 48, height: 48, fills: [{ type: 'solid', color: '#000000' }] }),
        { type: 'frame', id: 'Fggggggg', name: 'G', position: 'absolute', x: 60, y: 0, width: 40, height: 40, children: [P({ id: 'Pbbbbbbb', width: 12, height: 12 })] },
      ],
    } as unknown as ResolvedFrameNode;
    const svg = vectorToSvg(frame).svg;
    expect(svg).toContain('viewBox="0 0 100 50"');
    expect(svg).toContain('<g transform="matrix(2 0 0 2 10 5)"><path d="M2 2L22 22" fill="#000000"/></g>');
    expect(svg).toContain('<g transform="translate(60 0)"><g transform="matrix(0.5 0 0 0.5 0 0)">');
  });

  it('yang tidak punya padanan dilaporkan di dropped', () => {
    const frame = {
      type: 'frame',
      id: 'Ffffffff',
      name: 'F',
      layout: 'row',
      width: 24,
      height: 24,
      fills: [{ type: 'solid', color: '#FFFFFF' }],
      children: [
        P({ id: 'Paaaaaaa', fills: [{ type: 'linear', angle: 90, stops: [] }], rotation: 4, shadows: [], stroke: { color: '#000000', width: 1, align: 'center', sides: ['top'] } }),
        { type: 'text', id: 'Tttttttt', name: 'T', content: 'x', size: 12 },
      ],
    } as unknown as ResolvedFrameNode;
    expect(vectorToSvg(frame).dropped).toEqual([
      { nodeId: 'Ffffffff', prop: 'fills' },
      { nodeId: 'Paaaaaaa', prop: 'layout' },
      { nodeId: 'Paaaaaaa', prop: 'rotation' },
      { nodeId: 'Paaaaaaa', prop: 'shadows' },
      { nodeId: 'Paaaaaaa', prop: 'fills[0]' },
      { nodeId: 'Paaaaaaa', prop: 'stroke.sides' },
      { nodeId: 'Tttttttt', prop: 'layout' },
      { nodeId: 'Tttttttt', prop: 'type' },
    ]);
  });

  it('escape atribut dan deterministik', () => {
    const n = P({ d: 'M0 0"<>&' });
    expect(vectorToSvg(n).svg).toContain('d="M0 0&quot;&lt;&gt;&amp;"');
    expect(vectorToSvg(n)).toEqual(vectorToSvg(n));
  });
});
