// Skema v2 (story 22): fill efek `conic`, `noise` (grain ber-seed), `mesh` (medan warna titik kendali).
import { describe, expect, it } from 'vitest';
import { Fill, LakarDocument, NodeInput, SCHEMA_VERSION, jsonSchemas, resolveTokens, zodToLakarError, type LakarDocument as Doc } from './index.js';

const stops = [
  { offset: 0, color: '#22C55E' },
  { offset: 1, color: '#0EA5E9' },
];
const rect = (fills: unknown[]) => ({ type: 'rect', name: 'Efek', width: 200, height: 120, fills });
const codeOf = (input: unknown) => {
  const r = NodeInput.safeParse(input);
  expect(r.success).toBe(false);
  return zodToLakarError(r.error!, 'add');
};
const mesh6 = ['#0B1020', '#123B2A', '#0B1020', '#22C55E', '#0EA5E9', '#0B1020'];

describe('skema v2: fill efek', () => {
  it('SCHEMA_VERSION 16 (v2 dimigrasi lewat @lakar/core)', () => {
    expect(SCHEMA_VERSION).toBe(16);
  });

  it.each([
    ['conic minimal', { type: 'conic', stops }],
    ['conic lengkap', { type: 'conic', angle: 90, center: [0.5, 0.5], stops }],
    ['noise minimal', { type: 'noise', opacity: 0.08 }],
    ['noise lengkap', { type: 'noise', opacity: 0.1, size: 2, seed: 7, blend: 'soft-light', mono: false }],
    ['mesh 3×2', { type: 'mesh', columns: 3, rows: 2, colors: mesh6 }],
    ['mesh 2×2 + points', { type: 'mesh', columns: 2, rows: 2, colors: mesh6.slice(0, 4), points: [[0, 0], [1, 0.1], [0.1, 1], [0.9, 0.8]] }],
    ['mesh 5×5', { type: 'mesh', columns: 5, rows: 5, colors: Array.from({ length: 25 }, () => '#101010') }],
    ['mesh warna token', { type: 'mesh', columns: 2, rows: 2, colors: [{ $token: 'colors.acc' }, '#000000', '#000000', '#000000'] }],
  ])('lolos: %s', (_l, fill) => {
    expect(Fill.safeParse(fill).success, JSON.stringify(Fill.safeParse(fill).error?.issues)).toBe(true);
    expect(NodeInput.safeParse(rect([fill])).success).toBe(true);
  });

  it.each([
    ['conic 1 stop', { type: 'conic', stops: stops.slice(0, 1) }],
    ['conic center di luar 0..1', { type: 'conic', center: [1.5, 0], stops }],
    ['conic kunci asing', { type: 'conic', stops, radius: 1 }],
    ['noise opacity > 1', { type: 'noise', opacity: 1.2 }],
    ['noise opacity < 0', { type: 'noise', opacity: -0.1 }],
    ['noise tanpa opacity', { type: 'noise' }],
    ['noise size 0.2', { type: 'noise', opacity: 0.1, size: 0.2 }],
    ['noise size 9', { type: 'noise', opacity: 0.1, size: 9 }],
    ['noise seed pecahan', { type: 'noise', opacity: 0.1, seed: 1.5 }],
    ['noise seed 10000', { type: 'noise', opacity: 0.1, seed: 10000 }],
    ['noise blend asing', { type: 'noise', opacity: 0.1, blend: 'difference' }],
    ['mesh colors ≠ columns×rows', { type: 'mesh', columns: 3, rows: 2, colors: mesh6.slice(0, 5) }],
    ['mesh points ≠ columns×rows', { type: 'mesh', columns: 2, rows: 2, colors: mesh6.slice(0, 4), points: [[0, 0], [1, 1], [0.5, 0.5]] }],
    ['mesh columns 1', { type: 'mesh', columns: 1, rows: 4, colors: mesh6.slice(0, 4) }],
    ['mesh rows 6', { type: 'mesh', columns: 2, rows: 6, colors: [...mesh6, ...mesh6] }],
    ['mesh point di luar 0..1', { type: 'mesh', columns: 2, rows: 2, colors: mesh6.slice(0, 4), points: [[0, 0], [1, 2], [0, 1], [1, 1]] }],
    ['mesh warna non-hex', { type: 'mesh', columns: 2, rows: 2, colors: ['red', '#000000', '#000000', '#000000'] }],
  ])('ditolak SCHEMA_INVALID: %s', (_l, fill) => {
    expect(codeOf(rect([fill])).code).toBe('SCHEMA_INVALID');
  });

  it('pesan mesh menyebut jumlah yang diharapkan', () => {
    const e = codeOf(rect([{ type: 'mesh', columns: 3, rows: 2, colors: mesh6.slice(0, 4) }]));
    expect(e.message).toContain('6 warna');
  });

  it('token di colors mesh di-resolve seperti stops; token tak ada → error yang sama', () => {
    const doc: Doc = LakarDocument.parse({
      schemaVersion: SCHEMA_VERSION,
      id: 'Dddddddd',
      rev: 0,
      tokens: { 'colors.acc': { type: 'color', value: '#22C55E' } },
      pages: [
        {
          id: 'Pppppppp',
          name: 'P',
          children: [
            {
              type: 'board',
              id: 'Bbbbbbbb',
              name: 'B',
              x: 0,
              y: 0,
              width: 200,
              height: 200,
              screen: 'mobile',
              fills: [
                { type: 'mesh', columns: 2, rows: 2, colors: [{ $token: 'colors.acc' }, '#000000', '#000000', '#000000'] },
                { type: 'conic', stops: [{ offset: 0, color: { $token: 'colors.acc' } }, { offset: 1, color: '#000000' }] },
              ],
              children: [],
            },
          ],
        },
      ],
    });
    const fills = resolveTokens(doc).pages[0]!.children[0]!.fills!;
    expect(fills[0]).toMatchObject({ type: 'mesh', colors: ['#22C55E', '#000000', '#000000', '#000000'] });
    expect(fills[1]).toMatchObject({ type: 'conic', stops: [{ color: '#22C55E' }, { color: '#000000' }] });
    const bad = (fill: unknown) => {
      const d = structuredClone(doc) as unknown as { tokens: Record<string, string>; pages: { children: { fills: unknown[] }[] }[] };
      d.tokens = {};
      d.pages[0]!.children[0]!.fills = [fill];
      try {
        resolveTokens(d as unknown as Doc);
      } catch (e) {
        return (e as { code: string }).code;
      }
      return 'ok';
    };
    const viaMesh = bad({ type: 'mesh', columns: 2, rows: 2, colors: [{ $token: 'colors.acc' }, '#000000', '#000000', '#000000'] });
    const viaStops = bad({ type: 'linear', angle: 0, stops: [{ offset: 0, color: { $token: 'colors.acc' } }, { offset: 1, color: '#000000' }] });
    expect(viaMesh).not.toBe('ok');
    expect(viaMesh).toBe(viaStops);
  });

  it('jsonSchemas memuat ketiga fill baru', () => {
    const s = JSON.stringify(jsonSchemas().node);
    for (const t of ['conic', 'noise', 'mesh']) expect(s).toContain(`"${t}"`);
  });
});
