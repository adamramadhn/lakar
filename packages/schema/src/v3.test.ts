// Skema v3 (epic model-dokumen story 2, AD-11): token bertipe, tabel slot, mode tema.
import { describe, expect, it } from 'vitest';
import {
  LENGTH_TOKEN_TYPES,
  LakarDocument,
  LakarError,
  SCHEMA_VERSION,
  TOKEN_TYPES,
  TokenDef,
  findTokenUses,
  isTokenValueOf,
  jsonSchemas,
  resolveTokens,
  tokenSlot,
  type LakarDocument as Doc,
} from './index.js';

const board = (id: string, extra: Record<string, unknown> = {}, children: unknown[] = []) => ({
  type: 'board',
  id,
  name: `B ${id}`,
  x: 0,
  y: 0,
  width: 200,
  height: 200,
  screen: 'mobile',
  fills: [{ type: 'solid', color: { $token: 'colors.bg' } }],
  ...extra,
  children,
});
const docOf = (extra: Record<string, unknown>, boards: unknown[]) => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'Dddddddd',
  rev: 0,
  tokens: { 'colors.bg': { type: 'color', value: '#FFFFFF', modes: { dark: '#000000' } } },
  ...extra,
  pages: [{ id: 'Pppppppp', name: 'P', children: boards }],
});
const parse = (raw: unknown): Doc => LakarDocument.parse(raw);
const err = (fn: () => unknown): LakarError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(LakarError);
    return e as LakarError;
  }
  return expect.unreachable('seharusnya melempar') as never;
};
const bgOf = (d: ReturnType<typeof resolveTokens>, i: number) => (d.pages[0]!.children[i]!.fills![0] as { color: string }).color;

describe('skema v3: token bertipe', () => {
  it('SCHEMA_VERSION 15 (v3 + grid + komponen + vektor + tag + hug board + wrap + komentar + section + fixRequest + prototype + constraints + rich text) dan urutan TOKEN_TYPES tetap', () => {
    expect(SCHEMA_VERSION).toBe(15);
    expect(TOKEN_TYPES).toEqual(['color', 'radius', 'spacing', 'container', 'breakpoint', 'fontFamily', 'fontWeight', 'fontSize', 'lineHeight', 'letterSpacing']);
  });

  it.each([
    ['color', '#1A1A1A'],
    ['color', '#1A1A1A80'],
    ['fontFamily', 'Inter'],
    ['fontWeight', 600],
    ['radius', 0],
    ['spacing', 8],
    ['container', 1200],
    ['breakpoint', 768],
    ['fontSize', 16],
    ['lineHeight', 1.5],
    ['letterSpacing', -0.02],
  ])('lolos: %s = %j', (type, value) => {
    expect(TokenDef.safeParse({ type, value }).success).toBe(true);
    expect(isTokenValueOf(type as never, value)).toBe(true);
  });

  it.each([
    ['color', 16],
    ['color', 'red'],
    ['color', 'rgba(0,0,0,1)'],
    ['fontFamily', ''],
    ['fontFamily', 4],
    ['fontWeight', 450],
    ['fontWeight', 1000],
    ['radius', -1],
    ['spacing', '8px'],
    ['fontSize', -2],
    ['lineHeight', 0],
    ['letterSpacing', Infinity],
  ])('ditolak: %s = %j', (type, value) => {
    expect(TokenDef.safeParse({ type, value }).success).toBe(false);
  });

  it('token datar, tipe tak dikenal, kunci asing, nilai mode salah tipe ditolak', () => {
    expect(TokenDef.safeParse('#FFFFFF').success).toBe(false);
    expect(TokenDef.safeParse({ type: 'shadow', value: '#FFFFFF' }).success).toBe(false);
    expect(TokenDef.safeParse({ type: 'color', value: '#FFFFFF', note: 'x' }).success).toBe(false);
    expect(TokenDef.safeParse({ type: 'color', value: '#FFFFFF', modes: { dark: 1 } }).success).toBe(false);
    expect(TokenDef.safeParse({ type: 'color', value: '#FFFFFF', modes: { Dark: '#000000' } }).success).toBe(false);
  });

  it('JSON Schema dokumen memuat tokenModes dan themeMode', () => {
    const text = JSON.stringify(jsonSchemas().document);
    expect(text).toContain('tokenModes');
    expect(text).toContain('themeMode');
  });
});

describe('skema v3: mode', () => {
  const modes = { tokenModes: ['light', 'dark'] };

  it('dokumen dengan tokenModes, token modes, dan themeMode terdaftar lolos', () => {
    expect(LakarDocument.safeParse(docOf(modes, [board('Bbbbbbb1', { themeMode: 'dark' }), board('Bbbbbbb2')])).success).toBe(true);
  });

  it.each([
    ['tokenModes kosong', { tokenModes: [] }, [board('Bbbbbbb1')]],
    ['tokenModes duplikat', { tokenModes: ['light', 'light'] }, [board('Bbbbbbb1')]],
    ['nama mode tidak valid', { tokenModes: ['Light', 'dark'] }, [board('Bbbbbbb1')]],
    ['nama mode > 32 karakter', { tokenModes: ['a'.repeat(33), 'dark'] }, [board('Bbbbbbb1')]],
    ['modes token tak terdaftar', { tokenModes: ['light', 'sepia'] }, [board('Bbbbbbb1')]],
    ['themeMode tak terdaftar', modes, [board('Bbbbbbb1', { themeMode: 'sepia' })]],
    ['modes tanpa tokenModes', {}, [board('Bbbbbbb1')]],
  ])('%s → ditolak', (_l, extra, boards) => {
    expect(LakarDocument.safeParse(docOf(extra, boards)).success).toBe(false);
  });

  it('themeMode tanpa tokenModes → ditolak dengan path board', () => {
    const raw = { ...docOf({}, [board('Bbbbbbb1', { themeMode: 'dark' })]), tokens: {} };
    const r = LakarDocument.safeParse(raw);
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path.join('.'))).toContain('pages.0.children.0.themeMode');
  });
});

describe('tabel slot', () => {
  const LEN = [...LENGTH_TOKEN_TYPES];
  it.each([
    ['rect', ['fills', 0, 'color'], ['color'], 'color'],
    ['rect', ['fills', 0, 'stops', 1, 'color'], ['color'], 'color'],
    ['rect', ['fills', 0, 'colors', 3], ['color'], 'color'],
    ['rect', ['stroke', 'color'], ['color'], 'color'],
    ['rect', ['shadows', 0, 'color'], ['color'], 'color'],
    ['text', ['color'], ['color'], 'color'],
    ['icon', ['color'], ['color'], 'color'],
    ['frame', ['radius'], LEN, 'radius'],
    ['frame', ['radius', 2], LEN, 'radius'],
    ['frame', ['gap'], LEN, 'spacing'],
    ['frame', ['padding'], LEN, 'spacing'],
    ['frame', ['padding', 3], LEN, 'spacing'],
    ['frame', ['width'], LEN, 'spacing'],
    ['frame', ['maxWidth'], LEN, 'spacing'],
    ['rect', ['stroke', 'width'], LEN, 'spacing'],
    ['icon', ['size'], LEN, 'spacing'],
    ['text', ['size'], ['fontSize'], 'fontSize'],
    ['text', ['family'], ['fontFamily'], 'fontFamily'],
    ['text', ['weight'], ['fontWeight'], 'fontWeight'],
    ['text', ['lineHeight'], ['lineHeight'], 'lineHeight'],
    ['text', ['letterSpacing'], ['letterSpacing'], 'letterSpacing'],
  ])('%s %j → %j (utama %s)', (nodeType, path, accepts, primary) => {
    expect(tokenSlot(nodeType, path)).toMatchObject({ accepts, primary });
  });

  it('bukan slot token → undefined', () => {
    expect(tokenSlot('rect', ['opacity'])).toBeUndefined();
    expect(tokenSlot('rect', ['fills', 0, 'angle'])).toBeUndefined();
  });

  it('findTokenUses: path dari akar dokumen, node pemilik, indeks board', () => {
    const raw = docOf({}, [board('Bbbbbbb1', {}, [{ type: 'text', id: 'Tttttttt', name: 'T', content: 'a', size: { $token: 'type.s' } }])]);
    expect(findTokenUses(raw.pages).map((u) => [u.path.join('.'), u.token, u.nodeType, u.slot?.slot, u.board])).toEqual([
      ['pages.0.children.0.fills.0.color', 'colors.bg', 'board', 'fills.color', 0],
      ['pages.0.children.0.children.0.size', 'type.s', 'text', 'size', 0],
    ]);
  });
});

describe('resolveTokens v3', () => {
  const modes = { tokenModes: ['light', 'dark'] };

  it('mode per board: themeMode dark → #000000, tanpa themeMode → mode pertama (value)', () => {
    const d = parse(docOf(modes, [board('Bbbbbbb1', { themeMode: 'dark' }), board('Bbbbbbb2')]));
    const before = structuredClone(d);
    const r = resolveTokens(d);
    expect(bgOf(r, 0)).toBe('#000000');
    expect(bgOf(r, 1)).toBe('#FFFFFF');
    expect(d).toEqual(before);
  });

  it('mode pertama bukan light: board tanpa themeMode memakai modes[tokenModes[0]]', () => {
    const d = parse(docOf({ tokenModes: ['dark', 'light'] }, [board('Bbbbbbb1')]));
    expect(bgOf(resolveTokens(d), 0)).toBe('#000000');
  });

  it('paksa mode: opts.mode berlaku untuk semua board', () => {
    const d = parse(docOf(modes, [board('Bbbbbbb1', { themeMode: 'light' }), board('Bbbbbbb2')]));
    const r = resolveTokens(d, { mode: 'dark' });
    expect([bgOf(r, 0), bgOf(r, 1)]).toEqual(['#000000', '#000000']);
    expect(bgOf(resolveTokens(d, { mode: 'light' }), 0)).toBe('#FFFFFF');
  });

  it('mode tak dikenal → SCHEMA_INVALID; tanpa tokenModes pun ditolak', () => {
    const d = parse(docOf(modes, [board('Bbbbbbb1')]));
    expect(err(() => resolveTokens(d, { mode: 'sepia' })).code).toBe('SCHEMA_INVALID');
    const plain = parse({ ...docOf({}, [board('Bbbbbbb1')]), tokens: { 'colors.bg': { type: 'color', value: '#FFFFFF' } } });
    expect(err(() => resolveTokens(plain, { mode: 'dark' })).code).toBe('SCHEMA_INVALID');
    expect(bgOf(resolveTokens(plain), 0)).toBe('#FFFFFF');
  });

  it('mode tak terdaftar di dokumen yang tidak lewat parse → SCHEMA_INVALID', () => {
    const d = parse(docOf(modes, [board('Bbbbbbb1')]));
    const bad = structuredClone(d) as Doc;
    (bad.pages[0]!.children[0] as { themeMode?: string }).themeMode = 'sepia';
    expect(err(() => resolveTokens(bad)).code).toBe('SCHEMA_INVALID');
    const bad2 = structuredClone(d) as Doc;
    delete bad2.tokenModes;
    expect(err(() => resolveTokens(bad2)).code).toBe('SCHEMA_INVALID');
  });

  it('token color di padding → SCHEMA_INVALID menyebut path slot, nama token, dan tipenya', () => {
    const d = parse(docOf(modes, [board('Bbbbbbb1', {}, [{ type: 'frame', id: 'Ffffffff', name: 'F', padding: { $token: 'colors.bg' }, children: [] }])]));
    const e = err(() => resolveTokens(d));
    expect(e.code).toBe('SCHEMA_INVALID');
    expect(e.message).toContain('pages.0.children.0.children.0.padding');
    expect(e.message).toContain('colors.bg');
    expect(e.message).toContain('bertipe color');
  });

  it('grup panjang saling menerima: token radius di padding, container di maxWidth, spacing di radius', () => {
    const d = parse({
      ...docOf({}, [
        board('Bbbbbbb1', { fills: [] }, [
          { type: 'frame', id: 'Ffffffff', name: 'F', padding: { $token: 'r' }, maxWidth: { $token: 'c' }, radius: { $token: 's' }, children: [] },
        ]),
      ]),
      tokens: { r: { type: 'radius', value: 4 }, c: { type: 'container', value: 960 }, s: { type: 'spacing', value: 8 } },
    });
    expect(resolveTokens(d).pages[0]!.children[0]!.children[0]).toMatchObject({ padding: 4, maxWidth: 960, radius: 8 });
  });

  it('fontSize di slot size icon ditolak; spacing di size text ditolak', () => {
    const mk = (node: unknown, tokens: unknown) => parse({ ...docOf({}, [board('Bbbbbbb1', { fills: [] }, [node])]), tokens });
    const icon = mk({ type: 'icon', id: 'Iiiiiiii', name: 'I', lib: 'lucide', icon: 'house', size: { $token: 't' } }, { t: { type: 'fontSize', value: 24 } });
    expect(err(() => resolveTokens(icon)).code).toBe('SCHEMA_INVALID');
    const text = mk({ type: 'text', id: 'Tttttttt', name: 'T', content: 'a', size: { $token: 't' } }, { t: { type: 'spacing', value: 16 } });
    expect(err(() => resolveTokens(text)).code).toBe('SCHEMA_INVALID');
  });

  it('nilai mode tak sah untuk slot → pesan menyebut nilai efektif board/mode paksa, bukan value', () => {
    const text = { type: 'text', id: 'Tttttttt', name: 'T', content: 'a', size: { $token: 't' } };
    const d = parse({
      ...docOf(modes, [board('Bbbbbbb1', { fills: [], themeMode: 'dark' }, [text])]),
      tokens: { t: { type: 'fontSize', value: 16, modes: { dark: 0 } } },
    });
    const e = err(() => resolveTokens(d));
    expect(e.code).toBe('SCHEMA_INVALID');
    expect(e.message).toContain('t=0');
    expect(e.message).not.toContain('t=16');
    (d.pages[0]!.children[0] as { themeMode?: string }).themeMode = 'light';
    expect(err(() => resolveTokens(d, { mode: 'dark' })).message).toContain('t=0');
    expect(() => resolveTokens(d)).not.toThrow();
  });

  it('token tak dikenal tetap TOKEN_UNKNOWN (sebelum cek tipe)', () => {
    const d = parse({ ...docOf({}, [board('Bbbbbbb1')]), tokens: {} });
    expect(err(() => resolveTokens(d)).code).toBe('TOKEN_UNKNOWN');
  });
});
