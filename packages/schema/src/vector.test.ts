// Skema v6 (epic paste-vektor story 2, AD-14): atribut presentasi SVG bertipe dan allowlist `svg` pada node path.
import { describe, expect, it } from 'vitest';
import { LakarDocument, NodeInput, OVERRIDABLE_PROPS, SCHEMA_VERSION, SVG_ATTR_PATTERNS, SVG_PRESENTATION_ATTRS, zodToLakarError } from './index.js';

const path = (extra: Record<string, unknown> = {}) => ({ type: 'path', name: 'P', d: 'M0 0 L10 10', viewBox: [0, 0, 10, 10], ...extra });
const docOf = (node: Record<string, unknown>) => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'Dddddddd',
  rev: 0,
  pages: [{ id: 'Pppppppp', name: 'P', children: [{ type: 'board', id: 'Bbbbbbbb', name: 'B', x: 0, y: 0, width: 100, height: 100, screen: 'app', children: [{ id: 'Nnnnnnnn', ...node }] }] }],
});
const ok = (node: Record<string, unknown>) => LakarDocument.safeParse(docOf(node)).success;
const message = (node: Record<string, unknown>) => {
  const r = NodeInput.safeParse(node);
  if (r.success) return 'ok';
  const e = zodToLakarError(r.error, 'add');
  return `${e.code}: ${e.message}`;
};

describe('skema v6: vektor (AD-14)', () => {
  it('SCHEMA_VERSION 11 (v6 + tag + hug board + wrap + komentar)', () => {
    expect(SCHEMA_VERSION).toBe(11);
  });

  it('path dengan semua atribut bertipe dan allowlist svg valid (dokumen dan NodeInput)', () => {
    const full = path({
      fillRule: 'evenodd',
      strokeLinecap: 'round',
      strokeLinejoin: 'bevel',
      strokeDasharray: [4, 2, 0.5],
      strokeMiterlimit: 8,
      svg: { 'fill-opacity': '0.25', 'stroke-opacity': '50%', 'stroke-dashoffset': '-1.5', 'shape-rendering': 'geometricPrecision', 'paint-order': 'stroke fill' },
    });
    expect(ok(full)).toBe(true);
    expect(NodeInput.safeParse(full).success).toBe(true);
  });

  it('allowlist berurutan abjad dan setiap atribut punya pola nilai', () => {
    expect(SVG_PRESENTATION_ATTRS).toEqual(['fill-opacity', 'paint-order', 'shape-rendering', 'stroke-dashoffset', 'stroke-opacity']);
    expect(Object.keys(SVG_ATTR_PATTERNS).sort()).toEqual([...SVG_PRESENTATION_ATTRS]);
  });

  it.each([
    ['fill-opacity', ['0', '1', '0.5', '.5', '1.0', '40%', '100%', '12.5%'], ['1.5', '-0.1', '101%', 'url(#a)', '', '0.5 ', '1.', '0.']],
    ['stroke-opacity', ['0.75'], ['2', 'half']],
    ['stroke-dashoffset', ['0', '-2', '1.5', '3px', '.5'], ['1em', 'calc(1px)', '1 2', '1.']],
    ['shape-rendering', ['auto', 'crispEdges', 'geometricPrecision', 'optimizeSpeed'], ['crisp', 'inherit']],
    ['paint-order', ['normal', 'stroke', 'stroke fill', 'markers stroke fill', 'fill stroke'], ['stroke stroke', 'fill fill stroke', 'normal stroke', 'outline', '']],
  ] as const)('svg %s: nilai sah dan tak sah', (attr, good, bad) => {
    for (const v of good) expect(ok(path({ svg: { [attr]: v } })), `${attr}=${v}`).toBe(true);
    for (const v of bad) expect(ok(path({ svg: { [attr]: v } })), `${attr}=${v}`).toBe(false);
  });

  it('atribut svg di luar allowlist ditolak SCHEMA_INVALID yang menyebut allowlist', () => {
    for (const attr of ['transform', 'onload', 'fill', 'stroke-width', 'style']) {
      const m = message(path({ svg: { [attr]: '1' } }));
      expect(m, attr).toContain('SCHEMA_INVALID');
      expect(m, attr).toContain('allowlist');
      expect(m, attr).toContain(attr);
    }
  });

  it.each([
    ['fillRule', 'inherit'],
    ['strokeLinecap', 'arrow'],
    ['strokeLinejoin', 'miter-clip'],
    ['strokeDasharray', []],
    ['strokeDasharray', [-1]],
    ['strokeDasharray', Array.from({ length: 17 }, () => 1)],
    ['strokeDasharray', '4 2'],
    ['strokeMiterlimit', 0.5],
    ['strokeMiterlimit', 101],
    ['strokeLinecap', { $token: 'x.y' }],
    ['svg', 'stroke-opacity:1'],
  ])('%s = %j ditolak', (key, value) => {
    expect(ok(path({ [key]: value }))).toBe(false);
  });

  it('properti vektor hanya untuk path (tipe lain strict)', () => {
    expect(ok({ type: 'rect', name: 'R', fillRule: 'evenodd' })).toBe(false);
    expect(ok({ type: 'ellipse', name: 'E', svg: { 'fill-opacity': '0.5' } })).toBe(false);
  });

  it('properti vektor bisa di-override instance', () => {
    for (const k of ['fillRule', 'strokeLinecap', 'strokeLinejoin', 'strokeDasharray', 'strokeMiterlimit', 'svg']) expect(OVERRIDABLE_PROPS).toContain(k);
  });
});
