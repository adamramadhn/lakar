// Op JSON (AD-7) dan op invers (AD-8): setiap jenis op, kombinasi, undo → redo bolak-balik, token dan mode,
// detach inferensi token, error bentuk op, ref lokal, dan insert bentrok.
import { describe, expect, it } from 'vitest';
import { LakarError, type DocOp, type LakarDocument } from '@lakar/schema';
import { IdAllocator, applyOps, beginTransaction, createDocument, transact } from './index.js';

const seeded = (seed = 42) => {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000);
};
const boardIn = (name = 'Home', x = 0) => ({ type: 'board', name, x, y: 0, width: 390, height: 844, screen: 'mobile' });

/** Board Home > frame Isi (column) > [text Judul, rect Garis], frame Bebas (layout none) > rect Kotak; board Kedua. */
function fixture() {
  const tx = beginTransaction(createDocument(seeded(1)), { sessionId: 's', random: seeded(2) });
  const home = tx.add(null, boardIn('Home'));
  const isi = tx.add(home, { type: 'frame', name: 'Isi', layout: 'column', gap: 8, padding: 16 });
  const judul = tx.add(isi, { type: 'text', name: 'Judul', content: 'Halo', size: 32 });
  const garis = tx.add(isi, { type: 'rect', name: 'Garis', width: 100, height: 1 });
  const bebas = tx.add(home, { type: 'frame', name: 'Bebas', width: 200, height: 200 });
  const kotak = tx.add(bebas, { type: 'rect', name: 'Kotak', x: 10, y: 10, width: 20, height: 20 });
  const kedua = tx.add(null, boardIn('Kedua', 500));
  const doc = tx.commit('fixture').doc;
  return { doc, home, isi, judul, garis, bebas, kotak, kedua };
}

const run = (doc: LakarDocument, ops: unknown) => transact(doc, { sessionId: 'viewer', description: 'ops' }, (tx) => applyOps(tx, ops));

/** Isi dokumen yang dibandingkan undo (rev diabaikan; `tokens` absen ≡ `{}`). */
const content = (d: LakarDocument) => ({ pages: d.pages, tokens: d.tokens ?? {}, tokenModes: d.tokenModes });

/** Commit `ops`, undo dengan inversnya, lalu redo dengan invers undo; isi harus bolak-balik persis. */
async function roundTrip(doc: LakarDocument, ops: DocOp[]) {
  const done = await run(doc, ops);
  expect(done.entry).not.toBeNull();
  expect(done.inverse.length).toBeGreaterThan(0);
  const undone = await run(done.doc, done.inverse);
  expect(undone.doc.rev).toBe(done.doc.rev + 1);
  expect(content(undone.doc)).toEqual(content(doc));
  const redone = await run(undone.doc, undone.inverse);
  expect(content(redone.doc)).toEqual(content(done.doc));
  return { done, undone, redone };
}

async function rejects(p: Promise<unknown>): Promise<LakarError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(LakarError);
    return e as LakarError;
  }
  return expect.unreachable('seharusnya melempar') as never;
}

const find = (doc: LakarDocument, id: string): Record<string, any> | undefined => {
  const walk = (n: any): any => (n.id === id ? n : (n.children ?? []).map(walk).find(Boolean));
  for (const p of doc.pages) for (const b of p.children) {
    const hit = walk(b);
    if (hit) return hit;
  }
  return undefined;
};

describe('applyOps + inverse per jenis op', () => {
  it('update: invers hanya kunci yang berubah (nilai lama atau null)', async () => {
    const f = fixture();
    const { done } = await roundTrip(f.doc, [{ op: 'update', id: f.isi, patch: { gap: 12, padding: null, opacity: 0.5 } }]);
    expect(done.inverse).toEqual([{ op: 'update', id: f.isi, patch: { gap: 8, padding: 16, opacity: null } }]);
  });

  it('update x pada anak frame layout none: position implisit ikut dipulihkan', async () => {
    const f = fixture();
    const tx = beginTransaction(f.doc, { sessionId: 's' });
    const free = tx.add(f.bebas, { type: 'rect', name: 'Polos', width: 5, height: 5 });
    const doc = tx.commit('polos').doc;
    const { done } = await roundTrip(doc, [{ op: 'update', id: free, patch: { x: 30 } }]);
    expect(done.inverse).toEqual([{ op: 'update', id: free, patch: { x: null, position: null } }]);
  });

  it('update tanpa perubahan: commit (rev baru) tanpa invers', async () => {
    const f = fixture();
    const r = await run(f.doc, [{ op: 'update', id: f.isi, patch: { gap: 8 } }]);
    expect(r.doc.rev).toBe(f.doc.rev + 1);
    expect(r.inverse).toEqual([]);
  });

  it('replace (ganti tipe) dan add/duplicate/remove/move', async () => {
    const f = fixture();
    await roundTrip(f.doc, [{ op: 'replace', id: f.garis, node: { type: 'ellipse', name: 'Bulat', width: 10, height: 10 } }]);
    await roundTrip(f.doc, [{ op: 'add', parentId: f.isi, node: { type: 'text', name: 'Baru', content: 'x', size: 12 } }]);
    await roundTrip(f.doc, [{ op: 'duplicate', id: f.isi, patch: { name: 'Isi 2' } }]);
    await roundTrip(f.doc, [{ op: 'remove', id: f.judul }]);
    await roundTrip(f.doc, [{ op: 'move', id: f.garis, parentId: f.isi, index: 0 }]);
    await roundTrip(f.doc, [{ op: 'move', id: f.judul, parentId: f.home }]);
    await roundTrip(f.doc, [{ op: 'move', id: f.kedua, parentId: null, index: 0 }]);
  });

  it('remove frame berisi anak → insert subtree utuh di posisi semula, ID sama', async () => {
    const f = fixture();
    const { done, undone } = await roundTrip(f.doc, [{ op: 'remove', id: f.isi }]);
    expect(done.inverse).toEqual([{ op: 'insert', parentId: f.home, node: find(f.doc, f.isi), index: 0 }]);
    expect(find(undone.doc, f.judul)).toEqual(find(f.doc, f.judul));
    expect(undone.created.map((c) => c.id)).toEqual([f.isi, f.judul, f.garis]);
  });

  it('remove board di halaman kedua → insert ke halaman itu', async () => {
    const f = fixture();
    // Board Kedua dipindah ke halaman kedua.
    const withPage: LakarDocument = structuredClone(f.doc);
    const kedua = withPage.pages[0]!.children.pop()!;
    expect(kedua.id).toBe(f.kedua);
    withPage.pages.push({ id: 'Pg2aaaaa', name: 'Page 2', children: [kedua] });
    const { done } = await roundTrip(withPage, [{ op: 'remove', id: f.kedua }]);
    expect(done.inverse[0]).toMatchObject({ op: 'insert', parentId: 'Pg2aaaaa', index: 0 });
  });

  it('setTokens dan setTokenModes: invers def lama bertipe atau null', async () => {
    const f = fixture();
    const base = (await run(f.doc, [
      { op: 'setTokens', tokens: { 'colors.bg': { type: 'color', value: '#FFFFFF' } } },
      { op: 'setTokenModes', modes: ['light', 'dark'] },
    ])).doc;
    const { done } = await roundTrip(base, [
      { op: 'setTokens', tokens: { 'colors.bg': '#000000', 'spacing.2': 8 } },
      { op: 'setTokenModes', modes: ['light', 'dark', 'dim'] },
      { op: 'update', id: f.isi, patch: { gap: { $token: 'spacing.2' } } },
    ]);
    expect(done.inverse).toEqual([
      { op: 'update', id: f.isi, patch: { gap: 8 } },
      { op: 'setTokenModes', modes: ['light', 'dark'] },
      { op: 'setTokens', tokens: { 'colors.bg': { type: 'color', value: '#FFFFFF' }, 'spacing.2': null } },
    ]);
    await roundTrip(base, [{ op: 'setTokens', tokens: { 'colors.bg': null } }, { op: 'setTokenModes', modes: null }]);
  });

  it('token datar baru yang men-detach ref node lain: invers memulihkan ref', async () => {
    const f = fixture();
    const base = (await run(f.doc, [
      { op: 'setTokens', tokens: { n: { type: 'fontSize', value: 16 } } },
      { op: 'update', id: f.judul, patch: { size: { $token: 'n' } } },
    ])).doc;
    const { done } = await roundTrip(base, [
      { op: 'setTokens', tokens: { n: null } },
      { op: 'update', id: f.isi, patch: { gap: { $token: 'n' } } },
      { op: 'update', id: f.bebas, patch: { gap: { $token: 'n' } } },
      { op: 'setTokens', tokens: { n: 16 } },
    ]);
    expect(find(done.doc, f.judul)!.size).toBe(16);
    expect(done.doc.tokens!.n!.type).toBe('spacing');
    expect(done.inverse[0]).toEqual({ op: 'update', id: f.judul, patch: { size: { $token: 'n' } } });
  });

  it('kombinasi + ref lokal: satu commit, refs, created, opsSummary', async () => {
    const f = fixture();
    const ops: DocOp[] = [
      { op: 'add', parentId: f.home, node: { type: 'frame', name: 'Grup', layout: 'row' }, ref: 'g' },
      { op: 'move', id: f.judul, parentId: '@g' },
      { op: 'move', id: f.garis, parentId: '@g', index: 0 },
      { op: 'update', id: '@g', patch: { gap: 4 } },
      { op: 'duplicate', id: '@g', ref: 'g2' },
      { op: 'update', id: '@g2', patch: { name: 'Grup 2' } },
    ];
    const { done } = await roundTrip(f.doc, ops);
    expect(done.entry!.opsSummary).toBe('add×1, move×2, update×2, duplicate×1');
    const g = find(done.doc, done.value.refs.g!)!;
    expect(g.children.map((c: any) => c.name)).toEqual(['Garis', 'Judul']);
    expect(find(done.doc, done.value.refs.g2!)!.name).toBe('Grup 2');
    expect(done.created[0]!.id).toBe(done.value.refs.g);
  });
});

describe('applyOps: kasus tambahan invers', () => {
  it('replace: board, frame berisi anak (anak tetap), node absolut di frame layout none', async () => {
    const f = fixture();
    await roundTrip(f.doc, [{ op: 'replace', id: f.home, node: { type: 'board', name: 'Baru', x: 5, y: 5, width: 100, height: 100, screen: 'app' } }]);
    const { done } = await roundTrip(f.doc, [{ op: 'replace', id: f.isi, node: { type: 'frame', name: 'Isi', layout: 'row' } }]);
    expect(find(done.doc, f.isi)!.children.map((c: any) => c.id)).toEqual([f.judul, f.garis]);
    await roundTrip(f.doc, [{ op: 'replace', id: f.kotak, node: { type: 'ellipse', name: 'Bulat', width: 4, height: 4 } }]);
  });

  it('insert board ke halaman (ID halaman dan null)', async () => {
    const f = fixture();
    const board = { ...find(f.doc, f.kedua)!, id: 'Newbrd01' };
    const byId = await run(f.doc, [{ op: 'insert', parentId: f.doc.pages[0]!.id, node: board, index: 0 }]);
    expect(byId.doc.pages[0]!.children[0]!.id).toBe('Newbrd01');
    const byNull = await run(f.doc, [{ op: 'insert', parentId: null, node: board }]);
    expect(byNull.doc.pages[0]!.children.at(-1)!.id).toBe('Newbrd01');
    expect(byNull.inverse).toEqual([{ op: 'remove', id: 'Newbrd01' }]);
  });

  it('reserve: ID yang disisip tidak dialokasikan lagi oleh add sesudahnya', async () => {
    const f = fixture();
    const next = new IdAllocator([], seeded(7)).next();
    const tx = beginTransaction(f.doc, { sessionId: 's', random: seeded(7) });
    tx.insert(f.isi, { type: 'rect', name: 'R', width: 1, height: 1, id: next });
    const added = tx.add(f.isi, { type: 'rect', name: 'S', width: 1, height: 1 });
    expect(added).not.toBe(next);
  });

  it('token disentuh dua kali di satu transaksi; tokenModes dari tidak ada', async () => {
    const f = fixture();
    await roundTrip(f.doc, [
      { op: 'setTokens', tokens: { 'colors.a': '#111111' } },
      { op: 'setTokens', tokens: { 'colors.a': '#222222' } },
      { op: 'setTokens', tokens: { 'colors.a': null, 'colors.b': { type: 'color', value: '#333333' } } },
      { op: 'setTokens', tokens: { 'colors.a': '#444444' } },
    ]);
    expect(f.doc.tokenModes).toBeUndefined();
    await roundTrip(f.doc, [{ op: 'setTokenModes', modes: ['light', 'dark'] }]);
  });

  it('op tanpa efek (token sama, hapus token tak ada, move ke posisi sama) tanpa invers', async () => {
    const f = fixture();
    const base = (await run(f.doc, [{ op: 'setTokens', tokens: { 'colors.a': { type: 'color', value: '#111111' } } }])).doc;
    const r = await run(base, [
      { op: 'setTokens', tokens: { 'colors.a': '#111111', 'colors.none': null } },
      { op: 'move', id: f.garis, parentId: f.isi },
      { op: 'move', id: f.judul, parentId: f.isi, index: 0 },
      { op: 'setTokenModes', modes: null },
    ]);
    expect(r.inverse).toEqual([]);
  });

  it('ref "__proto__" berlaku seperti ref biasa', async () => {
    const f = fixture();
    const r = await run(f.doc, [
      { op: 'add', parentId: f.home, node: { type: 'rect', name: 'P', width: 1, height: 1 }, ref: '__proto__' },
      { op: 'update', id: '@__proto__', patch: { width: 2 } },
    ]);
    expect(find(r.doc, r.value.refs['__proto__']!)!.width).toBe(2);
  });
});

describe('applyOps: error dan rollback', () => {
  it('op tengah gagal → error op itu dengan prefiks ops[i], dokumen asli utuh', async () => {
    const f = fixture();
    const before = structuredClone(f.doc);
    const e = await rejects(run(f.doc, [{ op: 'update', id: f.isi, patch: { gap: 1 } }, { op: 'update', id: 'Zzzzzzzz', patch: { gap: 2 } }]));
    expect(e.code).toBe('NOT_FOUND');
    expect(e.message).toMatch(/^ops\[1\] update: node Zzzzzzzz tidak ada/);
    expect(e.hint).not.toBe('');
    expect(f.doc).toEqual(before);
  });

  it('bentuk op salah → SCHEMA_INVALID', async () => {
    const f = fixture();
    const bad: unknown[] = [
      'x',
      [],
      [1],
      [{ op: 'nope' }],
      [{ op: 'update', id: f.isi }],
      [{ op: 'update', id: f.isi, patch: {}, extra: 1 }],
      [{ op: 'add', parentId: f.home, node: { type: 'rect', name: 'r' }, ref: 'bad ref' }],
      [{ op: 'update', id: '@nope', patch: {} }],
      [
        { op: 'add', parentId: f.home, node: { type: 'rect', name: 'a' }, ref: 'a' },
        { op: 'add', parentId: f.home, node: { type: 'rect', name: 'b' }, ref: 'a' },
      ],
      Array.from({ length: 1001 }, () => ({ op: 'remove', id: f.judul })),
    ];
    for (const ops of bad) expect((await rejects(run(f.doc, ops))).code, JSON.stringify(ops).slice(0, 80)).toBe('SCHEMA_INVALID');
  });

  it('insert: ID bentrok → CONFLICT; board ke frame / anak ke halaman → SCHEMA_INVALID; index di luar batas', async () => {
    const f = fixture();
    const judul = find(f.doc, f.judul)!;
    expect((await rejects(run(f.doc, [{ op: 'insert', parentId: f.home, node: judul }]))).code).toBe('CONFLICT');
    const fresh = { ...judul, id: 'Newid001' };
    const dup = { type: 'frame', name: 'D', id: 'Newid002', children: [fresh, fresh] };
    expect((await rejects(run(f.doc, [{ op: 'insert', parentId: f.home, node: dup }]))).code).toBe('CONFLICT');
    expect((await rejects(run(f.doc, [{ op: 'insert', parentId: null, node: fresh }]))).code).toBe('SCHEMA_INVALID');
    expect((await rejects(run(f.doc, [{ op: 'insert', parentId: f.isi, node: { ...find(f.doc, f.kedua)!, id: 'Newid003' } }]))).code).toBe('SCHEMA_INVALID');
    expect((await rejects(run(f.doc, [{ op: 'insert', parentId: f.isi, node: fresh, index: 9 }]))).code).toBe('SCHEMA_INVALID');
    expect((await rejects(run(f.doc, [{ op: 'insert', parentId: f.judul, node: fresh }]))).code).toBe('SCHEMA_INVALID');
    const ok = await run(f.doc, [{ op: 'insert', parentId: f.isi, node: fresh, index: 1 }]);
    expect(find(ok.doc, f.isi)!.children.map((c: any) => c.id)).toEqual([f.judul, 'Newid001', f.garis]);
    expect(ok.inverse).toEqual([{ op: 'remove', id: 'Newid001' }]);
  });

  it('undo basi: target invers sudah dihapus pihak lain → NOT_FOUND, tanpa commit', async () => {
    const f = fixture();
    const done = await run(f.doc, [{ op: 'update', id: f.judul, patch: { content: 'Baru' } }]);
    const agent = await run(done.doc, [{ op: 'remove', id: f.judul }]);
    expect((await rejects(run(agent.doc, done.inverse))).code).toBe('NOT_FOUND');
  });
});

describe('applyOps: renameToken (epic token-tema story 2)', () => {
  it('rename lewat op JSON: satu commit, invers rename balik, bolak-balik persis', async () => {
    const f = fixture();
    const base = (await run(f.doc, [
      { op: 'setTokens', tokens: { 'colors.a': { type: 'color', value: '#111111' } } },
      { op: 'update', id: f.garis, patch: { fills: [{ type: 'solid', color: { $token: 'colors.a' } }] } },
      { op: 'update', id: f.kotak, patch: { stroke: { color: { $token: 'colors.a' }, width: 1, align: 'inside' } } },
    ])).doc;
    const { done } = await roundTrip(base, [{ op: 'renameToken', from: 'colors.a', to: 'colors.ink' }]);
    expect(done.inverse).toEqual([{ op: 'renameToken', from: 'colors.ink', to: 'colors.a' }]);
    expect(find(done.doc, f.kotak)!.stroke.color).toEqual({ $token: 'colors.ink' });
    expect(done.entry!.opsSummary).toBe('renameToken×1');
  });

  it('bentuk op salah → SCHEMA_INVALID; token tak dikenal → TOKEN_UNKNOWN dengan prefiks ops[i]', async () => {
    const f = fixture();
    const shape = await rejects(run(f.doc, [{ op: 'renameToken', from: 'a' }]));
    expect(shape.code).toBe('SCHEMA_INVALID');
    expect(shape.message).toContain('to');
    const extra = await rejects(run(f.doc, [{ op: 'renameToken', from: 'a', to: 'b', x: 1 }]));
    expect(extra.message).toContain('kunci tidak dikenal x');
    const unknown = await rejects(run(f.doc, [{ op: 'renameToken', from: 'colors.nope', to: 'colors.b' }]));
    expect(unknown.code).toBe('TOKEN_UNKNOWN');
    expect(unknown.message.startsWith('ops[0] ')).toBe(true);
  });
});
