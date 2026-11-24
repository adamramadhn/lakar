import { describe, expect, it } from 'vitest';
import { LakarError, SCHEMA_VERSION, type LakarDocument } from '@lakar/schema';
import { MIGRATIONS, collectIds, createDocument, inferTokenType, inferTokens, migrateDocument, parseDocument, tokenTypeOfValue, type MigrationRegistry } from './index.js';

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(LakarError);
    return (e as LakarError).code;
  }
  return expect.unreachable('seharusnya melempar') as never;
};

/** Rantai 1→2→3 tiruan: v2 menambah `meta`, v3 mengganti nama `meta.note` → `meta.notes`. */
const chain: MigrationRegistry = {
  1: (d) => ({ ...d, schemaVersion: 2, meta: { note: 'v2' } }),
  2: (d) => {
    const meta = d.meta as { note: string };
    d.schemaVersion = 3; // boleh memutasi argumen (sudah salinan)
    d.meta = { notes: [meta.note, 'v3'] };
    return d;
  },
};

describe('migrateDocument', () => {
  it('registri resmi: 1→2 identitas, 2→3 token bertipe, 3→4 identitas (grid), 4→5 identitas (komponen), 5→6 identitas (vektor), 6→7 identitas (tag), 7→8 identitas (board hug), 8→9 identitas (frame wrap), 9→10 identitas (komentar), 10→11 identitas (prototipe); versi kini → apa adanya (objek yang sama)', () => {
    expect(Object.keys(MIGRATIONS)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    const doc = JSON.parse(JSON.stringify(createDocument()));
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrateDocument(doc)).toBe(doc);
  });

  it('migrasi resmi 1→2→3→4: dokumen v1 lama (tokens kosong) dibuka sebagai versi kini tanpa perubahan lain, input tidak dimutasi', () => {
    const v3 = JSON.parse(JSON.stringify(createDocument()));
    const v1 = { ...v3, schemaVersion: 1 };
    const snapshot = structuredClone(v1);
    const out = migrateDocument(v1) as Record<string, unknown>;
    expect(out).toEqual(v3);
    expect(v1).toEqual(snapshot);
    expect(parseDocument(v1)).toEqual(v3);
  });

  it('rantai 1→2→3 dijalankan berurutan, input tidak dimutasi', () => {
    const raw = { schemaVersion: 1, id: 'Dddddddd' };
    const snapshot = structuredClone(raw);
    expect(migrateDocument(raw, { migrations: chain, target: 3 })).toEqual({ schemaVersion: 3, id: 'Dddddddd', meta: { notes: ['v2', 'v3'] } });
    expect(raw).toEqual(snapshot);
    expect(migrateDocument({ schemaVersion: 2, meta: { note: 'x' } }, { migrations: chain, target: 3 })).toEqual({ schemaVersion: 3, meta: { notes: ['x', 'v3'] } });
  });

  it('lebih baru dari target → VERSION_MISMATCH', () => {
    expect(codeOf(() => migrateDocument({ schemaVersion: 12 }))).toBe('VERSION_MISMATCH');
    expect(codeOf(() => parseDocument({ ...createDocument(), schemaVersion: 99 }))).toBe('VERSION_MISMATCH');
  });

  it('langkah hilang → VERSION_MISMATCH (sebelum langkah apa pun dijalankan)', () => {
    let ran = false;
    const gap: MigrationRegistry = {
      1: (d) => ((ran = true), { ...d, schemaVersion: 2 }),
    };
    expect(codeOf(() => migrateDocument({ schemaVersion: 1 }, { migrations: gap, target: 3 }))).toBe('VERSION_MISMATCH');
    expect(ran).toBe(false);
  });

  it.each([
    ['bukan objek', 'teks'],
    ['array', [1]],
    ['null', null],
    ['tanpa schemaVersion', { id: 'Dddddddd' }],
    ['versi 0', { schemaVersion: 0 }],
    ['versi pecahan', { schemaVersion: 1.5 }],
    ['versi string', { schemaVersion: '1' }],
  ])('%s → SCHEMA_INVALID', (_l, raw) => {
    expect(codeOf(() => migrateDocument(raw))).toBe('SCHEMA_INVALID');
  });

  it('langkah yang menghasilkan versi salah → Error biasa (bug migrasi)', () => {
    const bad: MigrationRegistry = { 1: (d) => ({ ...d, schemaVersion: 1 }) };
    expect(() => migrateDocument({ schemaVersion: 1 }, { migrations: bad, target: 2 })).toThrow(/migrasi 1 → 2/);
    try {
      migrateDocument({ schemaVersion: 1 }, { migrations: bad, target: 2 });
    } catch (e) {
      expect(e).not.toBeInstanceOf(LakarError);
    }
  });

  it('parseDocument = migrasi lalu validasi', () => {
    const doc = createDocument();
    expect(parseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    expect(codeOf(() => parseDocument({ schemaVersion: 1, id: 'x' }))).toBe('SCHEMA_INVALID');
  });
});

// ---------------------------------------------------------------------------
// Migrasi 2 → 3 (AD-11): token datar → token bertipe lewat inferensi
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;
const v2Doc = (tokens: Raw | undefined, children: Raw[]): Raw => ({
  schemaVersion: 2,
  id: 'Dddddddd',
  rev: 4,
  ...(tokens ? { tokens } : {}),
  pages: [{ id: 'Pppppppp', name: 'P', children: [{ type: 'board', id: 'Bbbbbbbb', name: 'B', x: 0, y: 0, width: 390, height: 844, screen: 'mobile', children }] }],
});
const nodes = (d: { pages: { children: { children: unknown[] }[] }[] }) => d.pages[0]!.children[0]!.children as Raw[];

describe('migrasi 2 → 3', () => {
  it('warna dirujuk fill → color, ref tetap', () => {
    const raw = v2Doc({ 'colors.a': '#111111' }, [{ type: 'rect', id: 'Rrrrrrr1', name: 'R', fills: [{ type: 'solid', color: { $token: 'colors.a' } }] }]);
    const doc = parseDocument(raw);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(doc.tokens).toEqual({ 'colors.a': { type: 'color', value: '#111111' } });
    expect(doc.tokenModes).toBeUndefined();
    expect(nodes(doc)[0]).toMatchObject({ fills: [{ color: { $token: 'colors.a' } }] });
  });

  it('grup panjang: 1× padding + 1× radius → seri → radius (urutan TOKEN_TYPES), kedua ref tetap', () => {
    const raw = v2Doc({ 'size.x': 12 }, [{ type: 'frame', id: 'Fffffff1', name: 'F', padding: { $token: 'size.x' }, radius: { $token: 'size.x' }, children: [] }]);
    const doc = parseDocument(raw);
    expect(doc.tokens).toEqual({ 'size.x': { type: 'radius', value: 12 } });
    expect(nodes(doc)[0]).toMatchObject({ padding: { $token: 'size.x' }, radius: { $token: 'size.x' } });
  });

  it('lintas grup: 16 dirujuk 2× size text + 1× gap → fontSize; ref gap di-detach jadi 16', () => {
    const raw = v2Doc({ 'n.16': 16 }, [
      {
        type: 'frame',
        id: 'Fffffff1',
        name: 'F',
        layout: 'column',
        gap: { $token: 'n.16' },
        children: [
          { type: 'text', id: 'Tttttt01', name: 'A', content: 'a', size: { $token: 'n.16' } },
          { type: 'text', id: 'Tttttt02', name: 'B', content: 'b', size: { $token: 'n.16' } },
        ],
      },
    ]);
    const snapshot = structuredClone(raw);
    const doc = parseDocument(raw);
    expect(raw).toEqual(snapshot);
    expect(doc.tokens).toEqual({ 'n.16': { type: 'fontSize', value: 16 } });
    const frame = nodes(doc)[0] as { gap: unknown; children: Raw[] };
    expect(frame.gap).toBe(16);
    expect(frame.children.map((c) => c.size)).toEqual([{ $token: 'n.16' }, { $token: 'n.16' }]);
  });

  it('token tak dirujuk: hex → color, string → fontFamily, angka ≥ 0 → spacing, < 0 → letterSpacing', () => {
    const doc = parseDocument(v2Doc({ 'a.hex': '#FFF000', 'a.font': 'Inter', 'a.num': 8, 'a.neg': -0.5, 'a.nol': 0 }, []));
    expect(doc.tokens).toEqual({
      'a.hex': { type: 'color', value: '#FFF000' },
      'a.font': { type: 'fontFamily', value: 'Inter' },
      'a.num': { type: 'spacing', value: 8 },
      'a.neg': { type: 'letterSpacing', value: -0.5 },
      'a.nol': { type: 'spacing', value: 0 },
    });
  });

  it('nilai tak sah untuk tipe kandidat (gap negatif) → tipe dari nilai, ref di-detach; tampilan tetap', () => {
    const raw = v2Doc({ 'gap.neg': -8 }, [{ type: 'frame', id: 'Fffffff1', name: 'F', layout: 'row', gap: { $token: 'gap.neg' }, children: [] }]);
    const doc = parseDocument(raw);
    expect(doc.tokens).toEqual({ 'gap.neg': { type: 'letterSpacing', value: -8 } });
    expect(nodes(doc)[0]).toMatchObject({ gap: -8 });
  });

  it('dokumen tanpa tokens hanya naik versi', () => {
    const raw = v2Doc(undefined, [{ type: 'rect', id: 'Rrrrrrr1', name: 'R' }]);
    expect(migrateDocument(raw, { target: 3 })).toEqual({ ...raw, schemaVersion: 3 });
  });

  it('langkah 3 → 4 (grid): identitas yang hanya menaikkan versi, input tidak dimutasi', () => {
    const v3 = { ...JSON.parse(JSON.stringify(createDocument())), schemaVersion: 3 };
    const snapshot = structuredClone(v3);
    expect(MIGRATIONS[3]!(v3)).toEqual({ ...snapshot, schemaVersion: 4 });
    expect(v3).toEqual(snapshot);
    expect(parseDocument(v3).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('langkah 4 → 5 (komponen): identitas yang hanya menaikkan versi, input tidak dimutasi', () => {
    const v4 = { ...JSON.parse(JSON.stringify(createDocument())), schemaVersion: 4 };
    const snapshot = structuredClone(v4);
    expect(MIGRATIONS[4]!(v4)).toEqual({ ...snapshot, schemaVersion: 5 });
    expect(v4).toEqual(snapshot);
    expect(parseDocument(v4)).toEqual({ ...snapshot, schemaVersion: SCHEMA_VERSION });
  });

  it('langkah 5 → 6 (vektor): identitas yang hanya menaikkan versi, input tidak dimutasi', () => {
    const v5 = { ...JSON.parse(JSON.stringify(createDocument())), schemaVersion: 5 };
    const snapshot = structuredClone(v5);
    expect(MIGRATIONS[5]!(v5)).toEqual({ ...snapshot, schemaVersion: 6 });
    expect(v5).toEqual(snapshot);
    expect(parseDocument(v5)).toEqual({ ...snapshot, schemaVersion: SCHEMA_VERSION });
  });

  it('langkah 6 → 7 (tag semantik): identitas yang hanya menaikkan versi, input tidak dimutasi', () => {
    const v6 = { ...JSON.parse(JSON.stringify(createDocument())), schemaVersion: 6 };
    const snapshot = structuredClone(v6);
    expect(MIGRATIONS[6]!(v6)).toEqual({ ...snapshot, schemaVersion: 7 });
    expect(v6).toEqual(snapshot);
    expect(parseDocument(v6)).toEqual({ ...snapshot, schemaVersion: SCHEMA_VERSION });
  });

  it('langkah 7 → 8 (board hug): identitas; tinggi board angka tetap angka, input tidak dimutasi', () => {
    const base = JSON.parse(JSON.stringify(createDocument()));
    const board = { type: 'board', id: 'Bhug0001', name: 'Landing', x: 0, y: 0, width: 1440, height: 4050, screen: 'landing', children: [] };
    const v7 = { ...base, schemaVersion: 7, pages: [{ ...base.pages[0], children: [board] }] };
    const snapshot = structuredClone(v7);
    expect(MIGRATIONS[7]!(v7)).toEqual({ ...snapshot, schemaVersion: 8 });
    expect(v7).toEqual(snapshot);
    const doc = parseDocument(v7);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(doc.pages[0]!.children[0]!.height).toBe(4050);
  });

  it("v8: board menerima height:'hug', menolak 'fill'", () => {
    const base = JSON.parse(JSON.stringify(createDocument()));
    const board = { type: 'board', id: 'Bhug0001', name: 'Landing', x: 0, y: 0, width: 1440, height: 'hug', screen: 'landing', children: [] };
    const pages = [{ ...base.pages[0], children: [board] }];
    expect(parseDocument({ ...base, schemaVersion: 8, pages }).pages[0]!.children[0]!.height).toBe('hug');
    expect(() => parseDocument({ ...base, schemaVersion: 8, pages: [{ ...pages[0], children: [{ ...board, height: 'fill' }] }] })).toThrow();
  });

  it('langkah 9 → 10 (komentar canvas): identitas yang hanya menaikkan versi, input tidak dimutasi; comments lama ikut', () => {
    const base = JSON.parse(JSON.stringify(createDocument()));
    const comments = [
      { id: 'Ttttttt1', pageId: base.pages[0].id, x: 5, y: 6, status: 'open', messages: [{ author: { kind: 'agent', name: 'claude-code' }, text: 'cek', at: '2026-11-24T00:00:00Z' }] },
    ];
    const v9 = { ...base, schemaVersion: 9, comments };
    const snapshot = structuredClone(v9);
    expect(MIGRATIONS[9]!(v9)).toEqual({ ...snapshot, schemaVersion: 10 });
    expect(v9).toEqual(snapshot);
    const doc = parseDocument(v9);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(doc.comments).toEqual(comments);
    // Dokumen v9 tanpa comments → v10 valid tanpa field.
    expect(parseDocument({ ...base, schemaVersion: 9 }).comments).toBeUndefined();
  });

  it('langkah 10 → 11 (prototipe): identitas yang hanya menaikkan versi, input tidak dimutasi; interactions/flows ikut', () => {
    const base = JSON.parse(JSON.stringify(createDocument()));
    const board = { type: 'board', id: 'Bbbbbbb1', name: 'B', x: 0, y: 0, width: 390, height: 844, screen: 'mobile', children: [{ type: 'rect', id: 'Rrrrrrr1', name: 'Tombol', interactions: [{ id: 'Intr0001', trigger: 'tap', action: { kind: 'navigate', boardId: 'Bbbbbbb2' }, transition: { kind: 'slide', direction: 'left' } }] }] };
    const board2 = { type: 'board', id: 'Bbbbbbb2', name: 'Detail', x: 480, y: 0, width: 390, height: 844, screen: 'mobile', children: [] };
    const flows = [{ id: 'Flow0001', name: 'Utama', startBoardId: 'Bbbbbbb1' }];
    const v10 = { ...base, schemaVersion: 10, pages: [{ ...base.pages[0], children: [board, board2] }], flows };
    const snapshot = structuredClone(v10);
    expect(MIGRATIONS[10]!(v10)).toEqual({ ...snapshot, schemaVersion: 11 });
    expect(v10).toEqual(snapshot);
    const doc = parseDocument(v10);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(doc.flows).toEqual(flows);
    // Dokumen v10 tanpa flows/interactions → v11 valid tanpa field.
    expect(parseDocument({ ...base, schemaVersion: 10 }).flows).toBeUndefined();
  });

  it('langkah 8 → 9 (frame wrap): identitas yang hanya menaikkan versi, input tidak dimutasi', () => {
    const base = JSON.parse(JSON.stringify(createDocument()));
    const frame = { type: 'frame', id: 'Fwrap001', name: 'F', layout: 'row', children: [] };
    const v8 = { ...base, schemaVersion: 8, pages: [{ ...base.pages[0], children: [{ type: 'board', id: 'Bbbbbbb1', name: 'B', x: 0, y: 0, width: 100, height: 100, screen: 'app', children: [frame] }] }] };
    const snapshot = structuredClone(v8);
    expect(MIGRATIONS[8]!(v8)).toEqual({ ...snapshot, schemaVersion: 9 });
    expect(v8).toEqual(snapshot);
    const doc = parseDocument(v8);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect((doc.pages[0]!.children[0]!.children[0] as Record<string, unknown>).wrap).toBeUndefined();
  });

  it('v9: frame menerima wrap boolean, menolak nilai non-boolean; node lain menolak wrap', () => {
    const base = JSON.parse(JSON.stringify(createDocument()));
    const board = { type: 'board', id: 'Bbbbbbb1', name: 'B', x: 0, y: 0, width: 100, height: 100, screen: 'app', children: [] };
    const frame = (wrap: unknown) => ({ type: 'frame', id: 'Fwrap001', name: 'F', layout: 'row', ...(wrap !== undefined ? { wrap } : {}), children: [] });
    const doc = (children: unknown[]) => ({ ...base, schemaVersion: 9, pages: [{ ...base.pages[0], children: [{ ...board, children }] }] });
    for (const wrap of [true, false]) {
      expect((parseDocument(doc([frame(wrap)])).pages[0]!.children[0]!.children[0] as { wrap?: boolean }).wrap).toBe(wrap);
    }
    for (const wrap of ['wrap', 1, null]) {
      expect(codeOf(() => parseDocument(doc([frame(wrap)])))).toBe('SCHEMA_INVALID');
    }
    // `wrap` frame tidak ikut ke teks (teks sudah punya `wrap` enum sendiri) atau board.
    expect(codeOf(() => parseDocument(doc([{ type: 'text', id: 'Tttttt01', name: 'T', content: 'x', size: 14, wrap: true }])))).toBe('SCHEMA_INVALID');
    expect(codeOf(() => parseDocument({ ...base, schemaVersion: 9, pages: [{ ...base.pages[0], children: [{ ...board, wrap: true }] }] }))).toBe('SCHEMA_INVALID');
  });

  it('langkah 2 murni: input tidak dimutasi', () => {
    const raw = v2Doc({ 'n.16': 16 }, [{ type: 'frame', id: 'Fffffff1', name: 'F', gap: { $token: 'n.16' }, children: [{ type: 'text', id: 'Tttttt01', name: 'A', content: 'a', size: { $token: 'n.16' } }, { type: 'text', id: 'Tttttt02', name: 'B', content: 'b', size: { $token: 'n.16' } }] }]);
    const snapshot = structuredClone(raw);
    MIGRATIONS[2]!(raw);
    expect(raw).toEqual(snapshot);
  });
});

describe('inferensi tipe token', () => {
  it('tokenTypeOfValue', () => {
    expect(['#FFF000', '#11223344', 'Inter', 'fff000', 8, 0, -1].map(tokenTypeOfValue)).toEqual(['color', 'color', 'fontFamily', 'fontFamily', 'spacing', 'spacing', 'letterSpacing']);
  });

  it('inferTokenType: frekuensi tipe utama, seri → urutan TOKEN_TYPES, tanpa ref → dari nilai', () => {
    const s = (primary: string) => ({ slot: { slot: 'x', accepts: [primary] as never, primary: primary as never } });
    expect(inferTokenType(8, [s('spacing'), s('spacing'), s('radius')])).toBe('spacing');
    expect(inferTokenType(8, [s('spacing'), s('radius')])).toBe('radius');
    expect(inferTokenType(8, [])).toBe('spacing');
    expect(inferTokenType(500, [s('fontWeight')])).toBe('fontWeight');
    expect(inferTokenType(450, [s('fontWeight')])).toBe('spacing');
  });

  it('inferTokens hanya menyentuh nama yang diminta; pages mentah tidak dimutasi', () => {
    const pages = [{ id: 'P', name: 'P', children: [{ type: 'board', children: [{ type: 'text', size: { $token: 'a' }, color: { $token: 'b' } }] }] }];
    const snapshot = structuredClone(pages);
    const r = inferTokens({ a: 14 }, pages);
    expect(r.tokens).toEqual({ a: { type: 'fontSize', value: 14 } });
    expect(r.detached).toBe(0);
    expect(r.pages).toBe(pages);
    expect(pages).toEqual(snapshot);
  });
});

describe('collectIds (v5, AD-12)', () => {
  it('menelusuri isi slot instance supaya ID baru tidak bertabrakan', () => {
    const doc = createDocument() as LakarDocument;
    const board = { type: 'board', id: 'Bbbbbbb1', name: 'B', x: 0, y: 0, width: 100, height: 100, screen: 'app', children: [] } as unknown as LakarDocument['pages'][number]['children'][number];
    board.children.push(
      { type: 'frame', id: 'Mmmmmmm1', name: 'M', component: { props: [], slots: [{ name: 'body', nodeId: 'Ffffffe1' }] }, children: [{ type: 'frame', id: 'Ffffffe1', name: 'Slot', children: [] }] },
      { type: 'instance', id: 'Iiiiiii1', name: 'I', componentId: 'Mmmmmmm1', slots: { body: [{ type: 'text', id: 'Tsssss01', name: 'S', content: 'x', size: 14 }] } },
    );
    doc.pages[0]!.children.push(board);
    expect(collectIds(doc)).toEqual(expect.arrayContaining(['Mmmmmmm1', 'Ffffffe1', 'Iiiiiii1', 'Tsssss01']));
  });
});
