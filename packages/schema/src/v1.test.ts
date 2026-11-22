import { describe, expect, it } from 'vitest';
import {
  BoardNode,
  CATALOG_HINT,
  COLOR_HINT,
  LakarDocument,
  LakarError,
  NODE_TYPES,
  NodeInput,
  SCHEMA_VERSION,
  XY_HINT,
  findTokenRefs,
  jsonSchemas,
  resolveTokens,
  zodToLakarError,
  type LakarDocument as Doc,
} from './index.js';

const board = {
  type: 'board',
  name: 'Beranda',
  x: 0,
  y: 0,
  width: 1440,
  height: 900,
  screen: 'landing',
  expectedSize: { width: 1440, height: 900 },
  clip: true,
  fills: [{ type: 'solid', color: '#F7F5F0' }],
} as const;

const valid: Record<string, Record<string, unknown>> = {
  board,
  frame: {
    type: 'frame',
    name: 'Hero',
    layout: 'row',
    gap: -8,
    padding: [24, 32],
    align: 'stretch',
    justify: 'space-between',
    width: 'fill',
    height: 'hug',
    minWidth: 320,
    maxWidth: { $token: 'size.content' },
    clip: true,
    scrollY: 120,
    fills: [
      { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: { $token: 'colors.accent' } }] },
      { type: 'radial', center: [0.5, 0.25], radius: 0.8, stops: [{ offset: 0, color: '#FFFFFF00' }, { offset: 1, color: '#FFFFFF' }] },
      { type: 'image', assetId: 'a'.repeat(64), fit: 'cover' },
    ],
    stroke: { color: '#E5E5E5', width: 1, align: 'inside', sides: ['bottom'] },
    radius: [12, 12, 0, 0],
    shadows: [{ type: 'drop', x: 0, y: 4, blur: 12, spread: -2, color: '#0000001A' }],
    opacity: 0.9,
    blend: 'multiply',
    blur: 0,
    backdropBlur: 8,
    rotation: -2,
  },
  text: {
    type: 'text',
    name: 'Judul',
    content: 'Halo',
    family: 'Inter',
    weight: 600,
    style: 'italic',
    size: { $token: 'type.h1.size' },
    lineHeight: 40,
    letterSpacing: -0.02,
    align: 'center',
    wrap: 'fixed',
    numeric: 'tabular',
    color: { $token: 'colors.text-primary' },
    width: 400,
    opacity: 1,
    shadows: [{ x: 0, y: 1, blur: 2, color: '#00000033' }],
  },
  rect: { type: 'rect', name: 'Garis', width: 'fill', height: 1, fills: [{ type: 'solid', color: '#E5E5E5' }], radius: { $token: 'rounded.md' } },
  ellipse: { type: 'ellipse', name: 'Cincin', width: 48, height: 48, startDeg: 0, sweepDeg: -270, inner: 0.8, stroke: { color: '#111111', width: 2, align: 'center' } },
  path: { type: 'path', name: 'Gelombang', d: 'M0 0 L24 24', viewBox: [0, 0, 24, 24], width: 24, height: 24, fills: [{ type: 'solid', color: '#111111' }] },
  icon: { type: 'icon', name: 'Icon / lucide / arrow-right', icon: 'arrow-right', lib: 'lucide', version: '1.74.0', size: 20, color: '#111111', strokeWidth: 1.5, filled: false, position: 'absolute', x: 4, y: 4 },
};

const issueOf = (input: unknown) => {
  const r = NodeInput.safeParse(input);
  expect(r.success).toBe(false);
  return zodToLakarError(r.error!, 'add');
};

describe('katalog v1', () => {
  it('NODE_TYPES tertutup: 7 tipe', () => {
    expect([...NODE_TYPES]).toEqual(['board', 'frame', 'text', 'rect', 'ellipse', 'path', 'icon']);
  });

  it.each(Object.entries(valid))('contoh valid: %s', (_t, input) => {
    const r = NodeInput.safeParse(input);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it.each([
    ['rect', { type: 'rect', name: 'R', x: 4 }],
    ['ellipse', { type: 'ellipse', name: 'E', y: 4 }],
    ['path', { type: 'path', name: 'P', d: 'M0 0', viewBox: [0, 0, 1, 1], x: 1 }],
    ['icon', { type: 'icon', name: 'I', icon: 'x', lib: 'lucide', size: 16, x: 1 }],
    ['text', { type: 'text', name: 'T', content: 'a', size: 12, x: 1 }],
    ['frame', { type: 'frame', name: 'F', y: 1 }],
  ])('x/y pada %s flow → SCHEMA_INVALID + XY_HINT', (_t, input) => {
    const e = issueOf(input);
    expect(e).toBeInstanceOf(LakarError);
    expect(e.code).toBe('SCHEMA_INVALID');
    expect(e.hint).toBe(XY_HINT);
  });

  it('slug simple-icons ber-underscore lolos; huruf besar/awalan _ ditolak', () => {
    const icon = (name: string) => ({ type: 'icon', name: 'I', icon: name, lib: 'simple-icons', size: 16 });
    expect(NodeInput.safeParse(icon('hive_blockchain')).success).toBe(true);
    expect(NodeInput.safeParse(icon('_x')).success).toBe(false);
    expect(NodeInput.safeParse(icon('Github')).success).toBe(false);
  });

  it('x/y pada node absolute lolos (semua tipe anak)', () => {
    expect(NodeInput.safeParse({ type: 'ellipse', name: 'E', position: 'absolute', x: 4, y: 4 }).success).toBe(true);
    expect(NodeInput.safeParse({ type: 'rect', name: 'R', position: 'absolute', x: 4 }).success).toBe(true);
  });

  it('XY_HINT diprioritaskan di atas hint warna', () => {
    expect(issueOf({ type: 'rect', name: 'R', x: 4, fills: [{ type: 'solid', color: 'red' }] }).hint).toBe(XY_HINT);
  });

  it.each([
    ['text color nama', { type: 'text', name: 'T', content: 'a', size: 12, color: 'red' }],
    ['fill rgba', { type: 'rect', name: 'R', fills: [{ type: 'solid', color: 'rgba(0,0,0,1)' }] }],
    ['stroke hex pendek', { type: 'rect', name: 'R', stroke: { color: '#FFF', width: 1, align: 'inside' } }],
    ['shadow rgba', { type: 'rect', name: 'R', shadows: [{ x: 0, y: 0, blur: 1, color: 'rgba(0,0,0,.1)' }] }],
    ['stop gradien', { type: 'frame', name: 'F', fills: [{ type: 'linear', angle: 0, stops: [{ offset: 0, color: 'blue' }, { offset: 1, color: '#000000' }] }] }],
  ])('warna non-hex (%s) → SCHEMA_INVALID + hint warna', (_l, input) => {
    const e = issueOf(input);
    expect(e.code).toBe('SCHEMA_INVALID');
    expect(e.hint).toBe(COLOR_HINT);
  });

  it.each([{ type: 'image', name: 'I' }, { type: 'group', name: 'G' }, { name: 'tanpa type' }])('tipe di luar katalog %j → hint katalog', (input) => {
    const e = issueOf(input);
    expect(e.code).toBe('SCHEMA_INVALID');
    expect(e.hint).toBe(CATALOG_HINT);
    expect(e.hint).toContain('board | frame | text | rect | ellipse | path | icon');
  });

  it('tipe fill asing → SCHEMA_INVALID tanpa hint katalog node', () => {
    const e = issueOf({ type: 'rect', name: 'R', fills: [{ type: 'gradient', stops: [] }] });
    expect(e.code).toBe('SCHEMA_INVALID');
    expect(e.hint).not.toBe(CATALOG_HINT);
  });

  it('kunci x asing di dalam ref token → bukan XY_HINT', () => {
    const e = issueOf({ type: 'rect', name: 'R', width: { $token: 'a', x: 1 } });
    expect(e.code).toBe('SCHEMA_INVALID');
    expect(e.hint).not.toBe(XY_HINT);
  });

  it.each([
    ['ellipse inner 1.5', { type: 'ellipse', name: 'E', inner: 1.5 }],
    ['ellipse inner 1', { type: 'ellipse', name: 'E', inner: 1 }],
    ['ellipse sweepDeg 400', { type: 'ellipse', name: 'E', sweepDeg: 400 }],
    ['ellipse radius (tidak ada)', { type: 'ellipse', name: 'E', radius: 4 }],
    ['path viewBox w=0', { type: 'path', name: 'P', d: 'M0 0', viewBox: [0, 0, 0, 24] }],
    ['path d kosong', { type: 'path', name: 'P', d: '', viewBox: [0, 0, 24, 24] }],
    ['path viewBox 3 angka', { type: 'path', name: 'P', d: 'M0 0', viewBox: [0, 0, 24] }],
    ['kunci asing', { type: 'rect', name: 'R', foo: 1 }],
    ['text fills (tidak ada)', { type: 'text', name: 'T', content: 'a', size: 12, fills: [] }],
    ['text weight 450', { type: 'text', name: 'T', content: 'a', size: 12, weight: 450 }],
    ['opacity 2', { type: 'rect', name: 'R', opacity: 2 }],
    ['blend asing', { type: 'rect', name: 'R', blend: 'add' }],
    ['stroke sides berulang', { type: 'rect', name: 'R', stroke: { color: '#000000', width: 1, align: 'inside', sides: ['top', 'top'] } }],
    ['stroke sides kosong', { type: 'rect', name: 'R', stroke: { color: '#000000', width: 1, align: 'inside', sides: [] } }],
    ['gradien 1 stop', { type: 'rect', name: 'R', fills: [{ type: 'linear', angle: 0, stops: [{ offset: 0, color: '#000000' }] }] }],
    ['image assetId bukan hash', { type: 'rect', name: 'R', fills: [{ type: 'image', assetId: 'foto.png', fit: 'cover' }] }],
    ['radial center di luar 0..1', { type: 'rect', name: 'R', fills: [{ type: 'radial', center: [2, 0], stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#000000' }] }] }],
    ['icon lib asing', { type: 'icon', name: 'I', icon: 'x', lib: 'phosphor', size: 16 }],
    ['icon nama tidak kanonik', { type: 'icon', name: 'I', icon: 'Arrow Right', lib: 'lucide', size: 16 }],
    ['icon tanpa field icon', { type: 'icon', name: 'Icon / lucide / x', lib: 'lucide', size: 16 }],
    ['width string asing', { type: 'rect', name: 'R', width: 'auto' }],
    ['token nama asing', { type: 'rect', name: 'R', width: { $token: 'Spacing.MD' } }],
    ['token dengan kunci lain', { type: 'rect', name: 'R', width: { $token: 'a', x: 1 } }],
    ['board clip false', { ...board, clip: false }],
    ['padding 3 nilai', { type: 'frame', name: 'F', padding: [1, 2, 3] }],
  ])('ditolak SCHEMA_INVALID: %s', (_l, input) => {
    expect(issueOf(input).code).toBe('SCHEMA_INVALID');
  });
});

const doc = (pages: unknown[], tokens?: Record<string, unknown>): Doc =>
  LakarDocument.parse({ schemaVersion: SCHEMA_VERSION, id: 'Dddddddd', rev: 3, ...(tokens ? { tokens } : {}), pages });

const fullDoc = () =>
  doc(
    [
      {
        id: 'Pppppppp',
        name: 'Page 1',
        children: [
          {
            ...board,
            id: 'Bbbbbbbb',
            fills: [{ type: 'solid', color: { $token: 'colors.surface' } }],
            children: [
              {
                ...valid.frame,
                id: 'Ffffffff',
                children: [
                  { ...valid.text, id: 'Tttttttt' },
                  { ...valid.rect, id: 'Rrrrrrrr' },
                  { ...valid.ellipse, id: 'Eeeeeeee' },
                  { ...valid.path, id: 'Hhhhhhhh' },
                  { ...valid.icon, id: 'Iiiiiiii' },
                ],
              },
            ],
          },
        ],
      },
    ],
    {
      'colors.surface': { type: 'color', value: '#FFFFFF' },
      'colors.accent': { type: 'color', value: '#2F6BFF' },
      'colors.text-primary': { type: 'color', value: '#1A1A1A' },
      'type.h1.size': { type: 'fontSize', value: 40 },
      'rounded.md': { type: 'radius', value: 8 },
      'size.content': { type: 'container', value: 1200 },
    },
  );

describe('dokumen dan token', () => {
  it('dokumen lengkap dengan tokens dan ketujuh tipe lolos', () => {
    expect(() => fullDoc()).not.toThrow();
  });

  it('dokumen tracer lama (tanpa clip/fills/tokens) tetap lolos', () => {
    // Isi dokumen tracer v1; versi file dinaikkan oleh migrasi identitas 1→2 (@lakar/core, diuji di migrate.test.ts).
    const tracer = {
      schemaVersion: SCHEMA_VERSION,
      id: 'Dddddddd',
      rev: 1,
      pages: [
        {
          id: 'Pppppppp',
          name: 'Page 1',
          children: [
            {
              type: 'board',
              name: 'Tracer',
              x: 0,
              y: 0,
              width: 390,
              height: 844,
              screen: 'mobile',
              id: 'Bbbbbbbb',
              children: [{ type: 'text', name: 'Judul', content: 'Halo dari Lakar', size: 32, id: 'Tttttttt' }],
            },
          ],
        },
      ],
    };
    expect(LakarDocument.safeParse(tracer).success).toBe(true);
  });

  it('node tersimpan: tipe asing dalam frame ditolak dengan path terdalam', () => {
    const r = BoardNode.safeParse({ ...board, id: 'Bbbbbbbb', children: [{ type: 'frame', name: 'F', id: 'Ffffffff', children: [{ type: 'image', name: 'I', id: 'Iiiiiiii' }] }] });
    expect(r.success).toBe(false);
    const e = zodToLakarError(r.error!, 'dokumen');
    expect(e.message).toContain('children.0.children.0.type');
    expect(e.hint).toBe(CATALOG_HINT);
  });

  it('nama token tidak valid di peta tokens ditolak', () => {
    expect(() => doc([{ id: 'Pppppppp', name: 'P', children: [] }], { 'Bukan Nama': { type: 'spacing', value: 1 } })).toThrow();
    expect(() => doc([{ id: 'Pppppppp', name: 'P', children: [] }], { 'a.b': { type: 'fontFamily', value: '' } })).toThrow();
  });

  it('referensi token tersimpan apa adanya; resolveTokens mengganti dengan nilai tanpa memutasi input', () => {
    const d = fullDoc();
    const before = structuredClone(d);
    const text = (d.pages[0]!.children[0]!.children[0] as { children: { color?: unknown }[] }).children[0]!;
    expect(text.color).toEqual({ $token: 'colors.text-primary' });
    const r = resolveTokens(d);
    expect(d).toEqual(before);
    expect(findTokenRefs(r)).toEqual([]);
    const b = r.pages[0]!.children[0]!;
    expect(b.fills).toEqual([{ type: 'solid', color: '#FFFFFF' }]);
    const frame = b.children[0]!;
    if (frame.type !== 'frame') throw new Error('frame');
    expect(frame.maxWidth).toBe(1200);
    expect(frame.fills![0]).toMatchObject({ stops: [{}, { color: '#2F6BFF' }] });
    const t = frame.children[0]!;
    if (t.type !== 'text') throw new Error('text');
    expect(t.color).toBe('#1A1A1A');
    expect(t.size).toBe(40);
    expect(frame.children[1]).toMatchObject({ radius: 8 });
  });

  it('findTokenRefs melaporkan path dan nama', () => {
    expect(findTokenRefs({ a: [{ c: { $token: 'x.y' } }], b: { $token: 'z' } })).toEqual([
      { path: ['a', 0, 'c'], token: 'x.y' },
      { path: ['b'], token: 'z' },
    ]);
  });

  it('token tidak dikenal → TOKEN_UNKNOWN, semua nama dilaporkan + saran', () => {
    const d = fullDoc();
    const frame = d.pages[0]!.children[0]!.children[0] as { gap?: unknown; minWidth?: unknown };
    frame.gap = { $token: 'spacing.3' };
    frame.minWidth = { $token: 'colors.acent' };
    try {
      resolveTokens(d);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LakarError);
      const err = e as LakarError;
      expect(err.code).toBe('TOKEN_UNKNOWN');
      expect(err.message).toContain('spacing.3');
      expect(err.message).toContain('colors.acent');
      expect(err.message).toContain('colors.accent');
    }
  });

  it('token tidak dikenal tanpa tokens sama sekali → TOKEN_UNKNOWN', () => {
    const d = doc([{ id: 'Pppppppp', name: 'P', children: [{ ...board, id: 'Bbbbbbbb', fills: [{ type: 'solid', color: { $token: 'colors.bg' } }], children: [] }] }]);
    expect(() => resolveTokens(d)).toThrow(expect.objectContaining({ code: 'TOKEN_UNKNOWN' }));
  });

  it('token salah tipe (angka di slot warna) → SCHEMA_INVALID menyebut path dan token', () => {
    const d = fullDoc();
    d.tokens!['colors.text-primary'] = { type: 'spacing', value: 16 };
    try {
      resolveTokens(d);
      expect.unreachable();
    } catch (e) {
      const err = e as LakarError;
      expect(err.code).toBe('SCHEMA_INVALID');
      expect(err.message).toContain('pages.0.children.0.children.0.children.0.color');
      expect(err.message).toContain('colors.text-primary');
    }
  });

  it('token string di slot angka → SCHEMA_INVALID', () => {
    const d = fullDoc();
    d.tokens!['type.h1.size'] = { type: 'fontFamily', value: 'besar' };
    expect(() => resolveTokens(d)).toThrow(expect.objectContaining({ code: 'SCHEMA_INVALID' }));
  });
});

describe('jsonSchemas', () => {
  const { document, node } = jsonSchemas();
  const text = JSON.stringify(node);

  it('memuat ketujuh tipe node', () => {
    for (const t of NODE_TYPES) expect(text).toContain(`"const":"${t}"`);
    const docText = JSON.stringify(document);
    for (const t of NODE_TYPES) expect(docText).toContain(`"const":"${t}"`);
  });

  it('objek strict → additionalProperties:false', () => {
    expect(document.additionalProperties).toBe(false);
    const variants = (node as { oneOf?: { additionalProperties?: unknown }[]; anyOf?: { additionalProperties?: unknown }[] }).oneOf ?? (node as { anyOf: { additionalProperties?: unknown }[] }).anyOf;
    expect(variants).toHaveLength(7);
    for (const v of variants) expect(v.additionalProperties).toBe(false);
  });

  it('memuat bentuk referensi $token', () => {
    expect(text).toContain('"$token"');
    expect(text).toMatch(/"required":\["\$token"\]/);
  });
});
