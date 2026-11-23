// Skema v4 (epic editor-canvas story 7, AD-13): layout grid, track bertipe, gap per sumbu, penempatan anak.
import { describe, expect, it } from 'vitest';
import { GRID_TRACKS_MAX, GridPlacement, GridTrack, LakarDocument, LakarError, NodeInput, SCHEMA_VERSION, resolveTokens, tokenSlot, type LakarDocument as Doc } from './index.js';

const docOf = (frame: Record<string, unknown>, children: unknown[] = [], tokens?: Record<string, unknown>) => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'Dddddddd',
  rev: 0,
  ...(tokens ? { tokens } : {}),
  pages: [
    {
      id: 'Pppppppp',
      name: 'P',
      children: [{ type: 'board', id: 'Bbbbbbbb', name: 'B', x: 0, y: 0, width: 400, height: 300, screen: 'app', children: [{ type: 'frame', id: 'Ffffffff', name: 'Grid', ...frame, children }] }],
    },
  ],
});
const parse = (raw: unknown): Doc => LakarDocument.parse(raw);
const ok = (raw: unknown) => LakarDocument.safeParse(raw).success;

describe('skema v4: grid', () => {
  it('SCHEMA_VERSION 9 (v4 + komponen + vektor + tag + hug board + wrap)', () => {
    expect(SCHEMA_VERSION).toBe(9);
  });

  it('frame grid dengan semua jenis track, rows, gap sumbu, dan anak berpenempatan valid', () => {
    const raw = docOf(
      { layout: 'grid', gridTemplateColumns: [80, { fr: 1 }, 'auto', { minmax: ['auto', { fr: 2 }] }, { minmax: [120, 'auto'] }], gridTemplateRows: [40, 'auto'], columnGap: 10, rowGap: 0, align: 'center', justify: 'space-between' },
      [
        { type: 'rect', id: 'Rrrrrrr1', name: 'A', gridColumn: { span: 2 } },
        { type: 'text', id: 'Tttttttt', name: 'T', content: 'x', size: 12, gridColumn: { start: 1, end: -1 }, gridRow: { start: 2 } },
        { type: 'icon', id: 'Iiiiiiii', name: 'I', lib: 'lucide', icon: 'star', size: 16, gridRow: { start: 2, span: 2 } },
        { type: 'rect', id: 'Rrrrrrr2', name: 'E', gridColumn: { end: 3 } },
      ],
    );
    expect(parse(raw).pages[0]!.children[0]!.children[0]).toMatchObject({ layout: 'grid', columnGap: 10 });
  });

  it.each([
    ['fr 0', { fr: 0 }],
    ['px negatif', -4],
    ['string CSS', '1fr'],
    ['minmax min fr', { minmax: [{ fr: 1 }, 10] }],
    ['minmax satu elemen', { minmax: [10] }],
    ['kunci asing', { fr: 1, px: 2 }],
  ])('track tidak valid: %s', (_l, t) => {
    expect(GridTrack.safeParse(t).success).toBe(false);
    expect(ok(docOf({ layout: 'grid', gridTemplateColumns: [t] }))).toBe(false);
  });

  it('template kosong atau lebih dari GRID_TRACKS_MAX ditolak', () => {
    expect(ok(docOf({ layout: 'grid', gridTemplateColumns: [] }))).toBe(false);
    expect(ok(docOf({ layout: 'grid', gridTemplateColumns: Array.from({ length: GRID_TRACKS_MAX + 1 }, () => ({ fr: 1 })) }))).toBe(false);
    expect(ok(docOf({ layout: 'grid', gridTemplateColumns: Array.from({ length: GRID_TRACKS_MAX }, () => ({ fr: 1 })) }))).toBe(true);
  });

  it.each([
    ['kosong', {}],
    ['garis 0', { start: 0 }],
    ['end + span', { span: 2, end: 4 }],
    ['span 0', { span: 0 }],
    ['pecahan', { start: 1.5 }],
    ['kunci asing', { start: 1, area: 'a' }],
  ])('penempatan tidak valid: %s', (_l, p) => {
    expect(GridPlacement.safeParse(p).success).toBe(false);
    expect(ok(docOf({ layout: 'grid' }, [{ type: 'rect', id: 'Rrrrrrr1', name: 'A', gridColumn: p }]))).toBe(false);
  });

  it('gap sumbu negatif ditolak (CSS column-gap/row-gap ≥ 0)', () => {
    expect(ok(docOf({ layout: 'grid', columnGap: -1 }))).toBe(false);
    expect(ok(docOf({ layout: 'grid', rowGap: -1 }))).toBe(false);
  });

  it('input node add menerima grid (NodeInput)', () => {
    expect(NodeInput.safeParse({ type: 'frame', name: 'G', layout: 'grid', gridTemplateColumns: [{ fr: 1 }], gridColumn: { span: 2 } }).success).toBe(true);
  });

  it('dokumen v3 tanpa grid tetap valid apa adanya (selain versi)', () => {
    expect(ok(docOf({ layout: 'row', gap: -4, padding: [8, 16] }))).toBe(true);
  });
});

describe('skema v4: tabel slot columnGap/rowGap', () => {
  it('slot panjang dengan tipe utama spacing', () => {
    for (const k of ['columnGap', 'rowGap']) expect(tokenSlot('frame', [k])).toMatchObject({ slot: k, primary: 'spacing', accepts: ['radius', 'spacing', 'container', 'breakpoint'] });
  });

  it('token spacing di gap sumbu di-resolve', () => {
    const raw = docOf({ layout: 'grid', columnGap: { $token: 'space.4' }, rowGap: { $token: 'space.4' } }, [], { 'space.4': { type: 'spacing', value: 16 } });
    expect(resolveTokens(parse(raw)).pages[0]!.children[0]!.children[0]).toMatchObject({ columnGap: 16, rowGap: 16 });
  });

  it('token color di rowGap → SCHEMA_INVALID menyebut path dan token', () => {
    const raw = docOf({ layout: 'grid', rowGap: { $token: 'colors.a' } }, [], { 'colors.a': { type: 'color', value: '#111111' } });
    let e: unknown;
    try {
      resolveTokens(parse(raw));
    } catch (x) {
      e = x;
    }
    expect(e).toBeInstanceOf(LakarError);
    expect((e as LakarError).code).toBe('SCHEMA_INVALID');
    expect((e as LakarError).message).toMatch(/rowGap/);
    expect((e as LakarError).message).toMatch(/colors\.a/);
  });
});
