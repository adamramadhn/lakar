import { describe, expect, it } from 'vitest';
import { CONSTRAINTS_HINT, LakarError, RUNS_HINT, XY_HINT, type LakarDocument } from '@lakar/schema';
import { beginTransaction, createDocument, parseDocument, transact, type Transaction } from './index.js';

const fixedNow = () => new Date('2026-11-17T00:00:00.000Z');
/** Sumber acak deterministik (LCG) supaya dua transaksi menghasilkan ID yang sama. */
const seeded = (seed = 42) => {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000);
};
const boardIn = (name = 'Home', x = 0) => ({ type: 'board', name, x, y: 0, width: 390, height: 844, screen: 'mobile' });

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(LakarError);
    return (e as LakarError).code;
  }
  return expect.unreachable('op seharusnya melempar') as never;
}
function caught(fn: () => unknown): LakarError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(LakarError);
    return e as LakarError;
  }
  return expect.unreachable('op seharusnya melempar') as never;
}

/** Dokumen awal: board Home > frame Isi (column) > [text Judul, rect Garis]; board Kedua kosong. */
function fixture() {
  const tx = beginTransaction(createDocument(seeded(1)), { sessionId: 's', random: seeded(2) });
  const home = tx.add(null, boardIn('Home'));
  const isi = tx.add(home, { type: 'frame', name: 'Isi', layout: 'column', gap: 8, padding: 16 });
  const judul = tx.add(isi, { type: 'text', name: 'Judul', content: 'Halo', size: 32 });
  const garis = tx.add(isi, { type: 'rect', name: 'Garis', width: 100, height: 1 });
  const kedua = tx.add(null, boardIn('Kedua', 500));
  const doc = tx.commit('fixture').doc;
  return { doc, home, isi, judul, garis, kedua };
}

const find = (doc: LakarDocument, id: string): Record<string, any> | undefined => {
  const walk = (n: any): any => (n.id === id ? n : (n.children ?? []).map(walk).find(Boolean));
  return doc.pages.flatMap((p) => p.children).map(walk).find(Boolean);
};
const childIds = (doc: LakarDocument, id: string): string[] => (find(doc, id)!.children as { id: string }[]).map((c) => c.id);

/**
 * Atomisitas op gagal yang ditangkap: transaksi A menjalankan `setup` + op gagal (ditangkap) lalu commit,
 * transaksi B hanya `setup` lalu commit, dengan sumber acak sama. Hasilnya harus identik.
 */
function expectAtomic(doc: LakarDocument, setup: (tx: Transaction) => void, failing: (tx: Transaction) => void, expected: string) {
  const a = beginTransaction(doc, { sessionId: 's', random: seeded(7), now: fixedNow });
  setup(a);
  expect(code(() => failing(a))).toBe(expected);
  const b = beginTransaction(doc, { sessionId: 's', random: seeded(7), now: fixedNow });
  setup(b);
  const ra = a.commit('x');
  const rb = b.commit('x');
  expect(ra.doc).toEqual(rb.doc);
  expect(ra.entry).toEqual(rb.entry);
}

describe('add ke halaman', () => {
  /** Fixture + halaman kedua kosong (ID halaman tidak pernah terlihat agen; dipakai viewer). */
  const twoPages = () => {
    const f = fixture();
    const doc = structuredClone(f.doc);
    doc.pages.push({ id: 'PageTwo2', name: 'Page 2', children: [] });
    return { ...f, doc };
  };

  it('add(pageId, board) → board di halaman itu; add(null) tetap halaman pertama', () => {
    const { doc } = twoPages();
    const tx = beginTransaction(doc, { sessionId: 's' });
    const b = tx.add('PageTwo2', boardIn('Baru'));
    const c = tx.add(null, boardIn('Pertama'));
    const r = tx.commit('add');
    expect(r.doc.pages[1]!.children.map((n) => n.id)).toEqual([b]);
    expect(r.doc.pages[0]!.children.map((n) => n.id)).toContain(c);
    expect(r.created.map((e) => e.id)).toEqual([b, c]);
    expect(parseDocument(r.doc)).toEqual(r.doc);
  });

  it('add(pageId, bukan board) → SCHEMA_INVALID, tidak berubah', () => {
    const { doc, home } = twoPages();
    expectAtomic(doc, (tx) => tx.update(home, { name: 'H' }), (tx) => tx.add('PageTwo2', { type: 'rect', name: 'R' }), 'SCHEMA_INVALID');
  });
});

describe('update', () => {
  it('merge dangkal; null menghapus kunci opsional; hasil valid', () => {
    const { doc, isi } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.update(isi, { gap: 12, padding: null, name: 'Isi Baru' });
    const r = tx.commit('update');
    const n = find(r.doc, isi)!;
    expect(n).toMatchObject({ type: 'frame', id: isi, name: 'Isi Baru', gap: 12, layout: 'column' });
    expect('padding' in n).toBe(false);
    expect(n.children).toHaveLength(2);
    expect(parseDocument(r.doc)).toEqual(r.doc);
    expect(r.entry!.opsSummary).toBe('update×1');
  });

  it.each([
    ['type', { type: 'rect' }, /replace/],
    ['id', { id: 'AAAAAAAA' }, /ID tidak bisa diubah/],
    ['children', { children: [] }, /add\/move\/remove/],
  ])('patch berisi %s → SCHEMA_INVALID, salinan kerja tidak berubah', (_k, patch, hint) => {
    const { doc, isi } = fixture();
    expectAtomic(doc, (tx) => tx.update(isi, { gap: 4 }), (tx) => tx.update(isi, patch), 'SCHEMA_INVALID');
    const e = caught(() => beginTransaction(doc, { sessionId: 's' }).update(isi, patch));
    expect(e.hint).toMatch(hint);
  });

  it('x pada node flow → SCHEMA_INVALID + XY_HINT; x bersama position absolute → ok', () => {
    const { doc, judul } = fixture();
    expectAtomic(doc, () => {}, (tx) => tx.update(judul, { x: 10 }), 'SCHEMA_INVALID');
    expect(caught(() => beginTransaction(doc, { sessionId: 's' }).update(judul, { x: 10 })).hint).toBe(XY_HINT);
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.update(judul, { position: 'absolute', x: 10, y: 4 });
    expect(find(tx.commit('abs').doc, judul)).toMatchObject({ position: 'absolute', x: 10, y: 4 });
  });

  it('anak frame layout none: x/y tanpa position diterima, position:absolute ditambahkan (add/update/replace/duplicate)', () => {
    const { doc, home, isi, judul } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    const none = tx.add(home, { type: 'frame', name: 'Bebas', layout: 'none', width: 100, height: 100 });
    const dflt = tx.add(home, { type: 'frame', name: 'Default', width: 100, height: 100 });
    // X1 + X4: add dengan x/y ke frame none (eksplisit maupun default).
    const a = tx.add(none, { type: 'rect', name: 'Titik', x: 10, y: 20, width: 4, height: 4 });
    const b = tx.add(dflt, { type: 'rect', name: 'Titik', y: 3, width: 4, height: 4 });
    // X2: update x tanpa position pada anak frame none.
    const c = tx.add(none, { type: 'text', name: 'Label', content: 'A', size: 12 });
    tx.update(c, { x: 5 });
    tx.replace(a, { type: 'ellipse', name: 'Bulat', x: 1, y: 2, width: 4, height: 4 });
    const d = tx.duplicate(c, { y: 9 });
    // Tanpa x/y atau dengan x null: tidak ditambahkan position.
    const e = tx.add(none, { type: 'rect', name: 'Polos', width: 4, height: 4 });
    const out = tx.commit('none').doc;
    expect(find(out, a)).toMatchObject({ type: 'ellipse', position: 'absolute', x: 1, y: 2 });
    expect(find(out, b)).toMatchObject({ position: 'absolute', y: 3 });
    expect(find(out, c)).toMatchObject({ position: 'absolute', x: 5 });
    expect(find(out, d)).toMatchObject({ position: 'absolute', x: 5, y: 9 });
    expect('position' in find(out, e)!).toBe(false);
    expect(parseDocument(out)).toEqual(out);
    // X3: parent flow (frame column, board) tetap SCHEMA_INVALID + XY_HINT.
    const t2 = beginTransaction(doc, { sessionId: 's' });
    expect(caught(() => t2.add(isi, { type: 'rect', name: 'R', x: 1, width: 4, height: 4 })).hint).toBe(XY_HINT);
    expect(caught(() => t2.add(home, { type: 'rect', name: 'R', x: 1, width: 4, height: 4 })).hint).toBe(XY_HINT);
    expect(caught(() => t2.update(judul, { x: 1 })).hint).toBe(XY_HINT);
    expect(caught(() => t2.replace(judul, { type: 'rect', name: 'R', y: 1, width: 4, height: 4 })).hint).toBe(XY_HINT);
    // Urutan error add lama: skema salah ke parent tak ada → SCHEMA_INVALID; parent tak ada → NOT_FOUND.
    expect(code(() => t2.add('ZZZZZZZZ', { type: 'rect', name: 'R', x: 1, width: -1, height: 4 }))).toBe('SCHEMA_INVALID');
    expect(code(() => t2.add('ZZZZZZZZ', { type: 'rect', name: 'R', width: 4, height: 4 }))).toBe('NOT_FOUND');
  });

  it('hapus field wajib / nilai salah / patch bukan objek → SCHEMA_INVALID, tidak berubah', () => {
    const { doc, judul } = fixture();
    expectAtomic(doc, () => {}, (tx) => tx.update(judul, { content: null }), 'SCHEMA_INVALID');
    expectAtomic(doc, () => {}, (tx) => tx.update(judul, { size: -1 }), 'SCHEMA_INVALID');
    expectAtomic(doc, () => {}, (tx) => tx.update(judul, ['x']), 'SCHEMA_INVALID');
    expectAtomic(doc, () => {}, (tx) => tx.update(judul, null), 'SCHEMA_INVALID');
  });

  it('update board: properti board divalidasi skema board', () => {
    const { doc, home } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.update(home, { x: 1000, name: '[WIP] Home' });
    expect(code(() => tx.update(home, { screen: 'tv' }))).toBe('SCHEMA_INVALID');
    const r = tx.commit('board');
    expect(find(r.doc, home)).toMatchObject({ x: 1000, name: '[WIP] Home', screen: 'mobile' });
  });

  it('update board section (v11): set nama, update {section:null} menghapus; string kosong/non-string → SCHEMA_INVALID', () => {
    const { doc, home } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.update(home, { section: 'Hero' });
    expect(code(() => tx.update(home, { section: '' }))).toBe('SCHEMA_INVALID');
    expect(code(() => tx.update(home, { section: 5 }))).toBe('SCHEMA_INVALID');
    const r = tx.commit('section');
    expect(find(r.doc, home)).toMatchObject({ section: 'Hero' });
    const tx2 = beginTransaction(r.doc, { sessionId: 's' });
    tx2.update(home, { section: null });
    const r2 = tx2.commit('unsection');
    expect((find(r2.doc, home) as { section?: string }).section).toBeUndefined();
  });

  it('constraints (v14): resize parent menyesuaikan anak absolute per sumbu; anak tanpa constraints diam', () => {
    const { doc, home } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    const kanvas = tx.add(home, { type: 'frame', name: 'Kanvas', layout: 'none', width: 200, height: 100 });
    const end = tx.add(kanvas, { type: 'rect', name: 'End', x: 150, y: 80, width: 20, height: 10, constraints: { h: 'end', v: 'end' } });
    const center = tx.add(kanvas, { type: 'rect', name: 'Center', x: 90, y: 40, width: 20, height: 10, constraints: { h: 'center' } });
    const stretch = tx.add(kanvas, { type: 'rect', name: 'Stretch', x: 0, y: 0, width: 200, height: 20, constraints: { h: 'stretch', v: 'start' } });
    const scale = tx.add(kanvas, { type: 'rect', name: 'Scale', x: 50, y: 25, width: 40, height: 10, constraints: { h: 'scale', v: 'scale' } });
    const bebas = tx.add(kanvas, { type: 'rect', name: 'Bebas', x: 10, y: 10, width: 5, height: 5 });
    tx.update(kanvas, { width: 300, height: 200 });
    const d = tx.commit('resize').doc;
    expect(parseDocument(d)).toEqual(d);
    expect(find(d, end)).toMatchObject({ x: 250, y: 180, width: 20, height: 10 });
    expect(find(d, center)).toMatchObject({ x: 140, y: 40 });
    expect(find(d, stretch)).toMatchObject({ x: 0, y: 0, width: 300, height: 20 });
    expect(find(d, scale)).toMatchObject({ x: 75, y: 50, width: 60, height: 20 });
    expect(find(d, bebas)).toMatchObject({ x: 10, y: 10, width: 5, height: 5 });
  });

  it('constraints merambat rekursif saat anak stretch/scale ikut berubah ukuran', () => {
    const { doc, home } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    const luar = tx.add(home, { type: 'frame', name: 'Luar', layout: 'none', width: 100, height: 100 });
    const dalam = tx.add(luar, { type: 'frame', name: 'Dalam', layout: 'none', x: 0, y: 0, width: 50, height: 50, constraints: { h: 'stretch', v: 'stretch' } });
    const cucu = tx.add(dalam, { type: 'rect', name: 'Cucu', x: 40, y: 10, width: 10, height: 10, constraints: { h: 'end' } });
    tx.update(luar, { width: 200 });
    const d = tx.commit('resize').doc;
    expect(find(d, dalam)).toMatchObject({ width: 150, height: 50 });
    expect(find(d, cucu)).toMatchObject({ x: 140, y: 10 });
  });

  it('constraints pada node flow → SCHEMA_INVALID + CONSTRAINTS_HINT', () => {
    const { doc, isi, judul } = fixture();
    expect(code(() => beginTransaction(doc, { sessionId: 's' }).update(judul, { constraints: { h: 'end' } }))).toBe('SCHEMA_INVALID');
    const e = caught(() => beginTransaction(doc, { sessionId: 's' }).add(isi, { type: 'rect', name: 'R', width: 10, height: 10, constraints: { v: 'end' } }));
    expect(e.code).toBe('SCHEMA_INVALID');
    expect(e.hint).toBe(CONSTRAINTS_HINT);
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.update(judul, { position: 'absolute', x: 0, y: 0, constraints: { h: 'center' } });
    expect(find(tx.commit('c').doc, judul)).toMatchObject({ position: 'absolute', constraints: { h: 'center' } });
  });

  it('runs (v15): gaya per rentang divalidasi; patch content tanpa runs meresetnya', () => {
    const { doc, isi } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    const teks = tx.add(isi, { type: 'text', name: 'Campur', content: 'Halo dunia', size: 16, runs: [{ start: 5, length: 5, style: { weight: 700, color: '#FF0000' } }] });
    const d1 = tx.commit('runs').doc;
    expect(find(d1, teks)).toMatchObject({ runs: [{ start: 5, length: 5, style: { weight: 700, color: '#FF0000' } }] });
    // Patch content tanpa runs → rentang lama dihapus (offset tak lagi berarti).
    const tx2 = beginTransaction(d1, { sessionId: 's' });
    tx2.update(teks, { content: 'Halo' });
    expect(find(tx2.commit('reset').doc, teks)!.runs).toBeUndefined();
    // Patch content + runs bersama → rentang baru divalidasi dan disimpan.
    const tx3 = beginTransaction(d1, { sessionId: 's' });
    tx3.update(teks, { content: 'Halo semua', runs: [{ start: 0, length: 4, style: { style: 'italic' } }] });
    expect(find(tx3.commit('both').doc, teks)).toMatchObject({ runs: [{ start: 0, length: 4, style: { style: 'italic' } }] });
  });

  it('runs keluar batas / tidak terurut / tumpang-tindih → SCHEMA_INVALID + RUNS_HINT', () => {
    const { doc, isi } = fixture();
    const base = { type: 'text' as const, name: 'R', content: 'abcd', size: 16 };
    expect(code(() => beginTransaction(doc, { sessionId: 's' }).add(isi, { ...base, runs: [{ start: 3, length: 5, style: {} }] }))).toBe('SCHEMA_INVALID');
    expect(code(() => beginTransaction(doc, { sessionId: 's' }).add(isi, { ...base, runs: [{ start: 1, length: 2, style: {} }, { start: 2, length: 1, style: {} }] }))).toBe('SCHEMA_INVALID');
    const e = caught(() => beginTransaction(doc, { sessionId: 's' }).add(isi, { ...base, runs: [{ start: 9, length: 1, style: {} }] }));
    expect(e.code).toBe('SCHEMA_INVALID');
    expect(e.hint).toBe(RUNS_HINT);
  });

  it('decoration (v15): underline/strikethrough/none di level node dan per rentang', () => {
    const { doc, isi } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    const t = tx.add(isi, {
      type: 'text', name: 'D', content: 'abc def', size: 16, decoration: 'underline',
      runs: [{ start: 4, length: 3, style: { decoration: 'strikethrough' } }],
    });
    const d = tx.commit('deco').doc;
    expect(parseDocument(d)).toEqual(d);
    expect(find(d, t)).toMatchObject({ decoration: 'underline', runs: [{ start: 4, length: 3, style: { decoration: 'strikethrough' } }] });
    expect(code(() => beginTransaction(doc, { sessionId: 's' }).add(isi, { type: 'text', name: 'X', content: 'x', size: 16, decoration: 'blink' }))).toBe('SCHEMA_INVALID');
  });
});

describe('replace', () => {
  it('frame tanpa anak → rect: ID & posisi tetap, semua properti lama diganti', () => {
    const tx0 = beginTransaction(fixture().doc, { sessionId: 's' });
    const { home } = fixture();
    const kosong = tx0.add(home, { type: 'frame', name: 'Kosong', layout: 'row', gap: 4 });
    tx0.add(home, { type: 'rect', name: 'Sesudah' });
    const doc = tx0.commit('x').doc;
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.replace(kosong, { type: 'rect', name: 'R' });
    const r = tx.commit('replace');
    expect(find(r.doc, kosong)).toEqual({ type: 'rect', name: 'R', id: kosong });
    expect(childIds(r.doc, home).indexOf(kosong)).toBe(childIds(doc, home).indexOf(kosong));
    expect(parseDocument(r.doc)).toEqual(r.doc);
  });

  it('frame beranak → frame lain: anak dipertahankan; daun → frame: children []', () => {
    const { doc, isi, garis } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.replace(isi, { type: 'frame', name: 'Baris', layout: 'row' });
    tx.replace(garis, { type: 'frame', name: 'Wadah' });
    const r = tx.commit('replace');
    expect(find(r.doc, isi)).toMatchObject({ name: 'Baris', layout: 'row' });
    expect(find(r.doc, isi)!.gap).toBeUndefined();
    expect(find(r.doc, isi)!.children).toHaveLength(2);
    expect(find(r.doc, garis)).toEqual({ type: 'frame', name: 'Wadah', id: garis, children: [] });
    expect(parseDocument(r.doc)).toEqual(r.doc);
  });

  it('frame beranak → tipe daun ditolak (subtree tidak dibuang diam-diam)', () => {
    const { doc, isi } = fixture();
    expectAtomic(doc, () => {}, (tx) => tx.replace(isi, { type: 'rect', name: 'R' }), 'SCHEMA_INVALID');
    expect(caught(() => beginTransaction(doc, { sessionId: 's' }).replace(isi, { type: 'rect', name: 'R' })).hint).toMatch(/move.*remove|pindahkan/);
  });

  it.each([
    ['board → non-board', 'home', { type: 'frame', name: 'F' }],
    ['anak → board', 'isi', boardIn('B')],
    ['membawa id', 'garis', { type: 'rect', name: 'R', id: 'AAAAAAAA' }],
    ['membawa children', 'isi', { type: 'frame', name: 'F', children: [] }],
    ['skema salah', 'judul', { type: 'text', name: 'T' }],
  ] as const)('%s → SCHEMA_INVALID', (_l, key, node) => {
    const f = fixture();
    expectAtomic(f.doc, () => {}, (tx) => tx.replace(f[key], node), 'SCHEMA_INVALID');
  });

  it('board → board: anak dipertahankan', () => {
    const { doc, home, isi } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.replace(home, { ...boardIn('Home 2'), screen: 'app' });
    const r = tx.commit('x');
    expect(find(r.doc, home)).toMatchObject({ name: 'Home 2', screen: 'app' });
    expect(childIds(r.doc, home)).toEqual([isi]);
  });
});

describe('move', () => {
  it('ke frame/board pada index; default akhir', () => {
    const { doc, home, isi, judul, garis } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.move(garis, isi, 0);
    tx.move(judul, home);
    const r = tx.commit('move');
    expect(childIds(r.doc, isi)).toEqual([garis]);
    expect(childIds(r.doc, home)).toEqual([isi, judul]);
    expect(r.entry!.opsSummary).toBe('move×2');
  });

  it('null = halaman, khusus board (reorder)', () => {
    const { doc, home, kedua } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.move(kedua, null, 0);
    expect(tx.commit('x').doc.pages[0]!.children.map((b) => b.id)).toEqual([kedua, home]);
  });

  it('index = posisi akhir di parent yang sama (0..len-1)', () => {
    const { doc, isi, judul, garis } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.move(judul, isi, 1);
    expect(childIds(tx.commit('x').doc, isi)).toEqual([garis, judul]);
    expect(code(() => beginTransaction(doc, { sessionId: 's' }).move(judul, isi, 2))).toBe('SCHEMA_INVALID');
  });

  it.each([
    ['ke diri sendiri', (f: ReturnType<typeof fixture>) => [f.isi, f.isi]],
    ['ke keturunan sendiri', (f: ReturnType<typeof fixture>) => [f.home, f.isi]],
    ['ke daun', (f: ReturnType<typeof fixture>) => [f.garis, f.judul]],
    ['board ke frame', (f: ReturnType<typeof fixture>) => [f.kedua, f.isi]],
    ['anak ke halaman', (f: ReturnType<typeof fixture>) => [f.judul, null]],
    ['index pecahan', (f: ReturnType<typeof fixture>) => [f.judul, f.home, 0.5]],
    ['index negatif', (f: ReturnType<typeof fixture>) => [f.judul, f.home, -1]],
    ['index > len', (f: ReturnType<typeof fixture>) => [f.judul, f.home, 3]],
  ])('%s → SCHEMA_INVALID, tidak berubah', (_l, args) => {
    const f = fixture();
    const [id, parent, index] = args(f) as [string, string | null, number | undefined];
    expectAtomic(f.doc, (tx) => tx.update(f.judul, { content: 'x' }), (tx) => tx.move(id, parent, index), 'SCHEMA_INVALID');
  });

  it('ke keturunan dalam (frame cucu) → SCHEMA_INVALID, tidak berubah', () => {
    const f = fixture();
    const t0 = beginTransaction(f.doc, { sessionId: 's' });
    const dalam = t0.add(f.isi, { type: 'frame', name: 'Dalam' });
    const cucu = t0.add(dalam, { type: 'frame', name: 'Cucu' });
    const doc = t0.commit('x').doc;
    expectAtomic(doc, () => {}, (tx) => tx.move(f.isi, cucu), 'SCHEMA_INVALID');
    expect(caught(() => beginTransaction(doc, { sessionId: 's' }).move(f.isi, cucu)).message).toMatch(/keturunan/);
  });

  it('parent tak ada → NOT_FOUND', () => {
    const f = fixture();
    expectAtomic(f.doc, () => {}, (tx) => tx.move(f.judul, 'ZZZZZZZZ'), 'NOT_FOUND');
  });
});

describe('duplicate', () => {
  it('frame beranak: salinan dalam dengan ID baru semua, tepat setelah asal, patch di akar', () => {
    const { doc, home, isi } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    const copy = tx.duplicate(isi, { name: 'Isi 2', gap: 24 });
    const r = tx.commit('dup');
    expect(childIds(r.doc, home)).toEqual([isi, copy]);
    const orig = find(r.doc, isi)!;
    const dup = find(r.doc, copy)!;
    expect(dup).toMatchObject({ name: 'Isi 2', gap: 24, layout: 'column', padding: 16 });
    expect(dup.children.map((c: any) => c.name)).toEqual(['Judul', 'Garis']);
    const origIds = [orig.id, ...orig.children.map((c: any) => c.id)];
    const dupIds = [dup.id, ...dup.children.map((c: any) => c.id)];
    expect(dupIds.filter((i) => origIds.includes(i))).toEqual([]);
    expect(r.created.map((c) => c.id)).toEqual(dupIds);
    expect(r.created.map((c) => c.path)).toEqual([['Home', 'Isi 2'], ['Home', 'Isi 2', 'Judul'], ['Home', 'Isi 2', 'Garis']]);
    expect(parseDocument(r.doc)).toEqual(r.doc);
  });

  it('board: salinan di halaman tepat setelah asal (pola dua board)', () => {
    const { doc, home, kedua } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    const copy = tx.duplicate(home, { name: 'Home / Scroll', x: 1000 });
    const r = tx.commit('dup');
    expect(r.doc.pages[0]!.children.map((b) => b.id)).toEqual([home, copy, kedua]);
    expect(find(r.doc, copy)).toMatchObject({ name: 'Home / Scroll', x: 1000 });
  });

  it('patch ilegal / ID tak ada → ditolak, tidak berubah', () => {
    const f = fixture();
    expectAtomic(f.doc, () => {}, (tx) => tx.duplicate(f.isi, { type: 'rect' }), 'SCHEMA_INVALID');
    expectAtomic(f.doc, () => {}, (tx) => tx.duplicate(f.judul, { x: 4 }), 'SCHEMA_INVALID');
    expectAtomic(f.doc, () => {}, (tx) => tx.duplicate('ZZZZZZZZ'), 'NOT_FOUND');
  });
});

describe('remove', () => {
  it('node + subtree hilang; op berikutnya pada ID itu → NOT_FOUND', () => {
    const { doc, home, isi, judul } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.remove(isi);
    expect(code(() => tx.update(judul, { content: 'x' }))).toBe('NOT_FOUND');
    expect(code(() => tx.remove(isi))).toBe('NOT_FOUND');
    const r = tx.commit('rm');
    expect(childIds(r.doc, home)).toEqual([]);
    expect(find(r.doc, judul)).toBeUndefined();
    expect(r.entry!.opsSummary).toBe('remove×1');
  });

  it('ID tak ada → NOT_FOUND, tidak berubah', () => {
    const f = fixture();
    expectAtomic(f.doc, () => {}, (tx) => tx.remove('ZZZZZZZZ'), 'NOT_FOUND');
  });
});

describe('addressing hanya via ID', () => {
  it.each([
    ['nama', 'Judul'],
    ['path', 'Home/Isi/Judul'],
    ['list', ['Home', 'Isi']],
    ['angka', 12],
  ])('%s sebagai alamat → SCHEMA_INVALID + hint ID', (_l, addr) => {
    const f = fixture();
    const tx = beginTransaction(f.doc, { sessionId: 's' });
    const a = addr as string;
    for (const fn of [() => tx.update(a, {}), () => tx.remove(a), () => tx.move(a, null), () => tx.duplicate(a), () => tx.replace(a, { type: 'rect', name: 'R' }), () => tx.add(a, { type: 'rect', name: 'R' }), () => tx.move(f.judul, a)]) {
      const e = caught(fn);
      expect(e.code).toBe('SCHEMA_INVALID');
      expect(e.hint).toMatch(/ID 8 karakter/);
    }
  });
});

describe('setTokens', () => {
  it('merge ke doc.tokens (dibuat bila tak ada); null menghapus', () => {
    const base = createDocument();
    delete (base as { tokens?: unknown }).tokens;
    const tx = beginTransaction({ ...base, tokens: undefined } as LakarDocument, { sessionId: 's' });
    tx.setTokens({ 'colors.a': '#111111', 'spacing.2': 8 });
    tx.setTokens({ 'spacing.2': null, 'colors.b': '#222222' });
    const r = tx.commit('tokens');
    expect(r.doc.tokens).toEqual({ 'colors.a': { type: 'color', value: '#111111' }, 'colors.b': { type: 'color', value: '#222222' } });
    expect(r.entry!.opsSummary).toBe('setTokens×2');
  });

  it.each([
    ['nama tidak valid', { 'Colors.A': '#111111' }],
    ['nilai kosong', { 'colors.a': '' }],
    ['nilai objek', { 'colors.a': { r: 1 } }],
    ['bukan objek', ['colors.a']],
    ['satu salah dari banyak', { 'colors.ok': '#111111', 'bad name': 1 }],
  ])('%s → SCHEMA_INVALID, seluruh map ditolak', (_l, map) => {
    const doc = { ...createDocument(), tokens: { 'colors.x': { type: 'color' as const, value: '#000000' } } };
    expectAtomic(doc, (tx) => tx.setTokens({ 'colors.y': '#FFFFFF' }), (tx) => tx.setTokens(map), 'SCHEMA_INVALID');
  });

  it('token terhapus masih dirujuk → TOKEN_UNKNOWN saat commit, transaksi tertutup, dokumen utuh', () => {
    const doc0 = { ...createDocument(), tokens: { 'colors.a': { type: 'color' as const, value: '#111111' } } };
    const t0 = beginTransaction(doc0, { sessionId: 's' });
    const b = t0.add(null, boardIn());
    t0.add(b, { type: 'text', name: 'T', content: 'a', size: 12, color: { $token: 'colors.a' } });
    const doc = t0.commit('x').doc;
    const before = structuredClone(doc);
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.setTokens({ 'colors.a': null });
    expect(code(() => tx.commit('hapus token'))).toBe('TOKEN_UNKNOWN');
    expect(tx.open).toBe(false);
    expect(doc).toEqual(before);
  });
});

describe('commit', () => {
  it('opsSummary per jenis dalam urutan pertama dipakai, hanya op sukses', () => {
    const { doc, isi, judul } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's1', now: fixedNow });
    tx.add(isi, { type: 'rect', name: 'A' });
    tx.update(judul, { content: 'B' });
    try {
      tx.remove('ZZZZZZZZ');
    } catch {}
    tx.add(isi, { type: 'rect', name: 'C' });
    tx.add(isi, { type: 'rect', name: 'D' });
    const r = tx.commit('ringkas');
    expect(r.entry).toEqual({ rev: doc.rev + 1, sessionId: 's1', description: 'ringkas', opsSummary: 'add×3, update×1', at: '2026-11-17T00:00:00.000Z' });
  });

  it('kosong (tanpa op sukses): dokumen asli, rev tetap, entry null, created []', () => {
    const { doc, judul } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    try {
      tx.update(judul, { x: 1 });
    } catch {}
    const r = tx.commit('baca saja');
    expect(r).toEqual({ doc, entry: null, created: [], inverse: [] });
    expect(r.doc).toBe(doc);
    expect(tx.open).toBe(false);
  });

  it('created: nama ganda dipertahankan; node dihapus/dipindah/di-rename dihitung dari dokumen akhir', () => {
    const { doc, home, isi } = fixture();
    const tx = beginTransaction(doc, { sessionId: 's' });
    const a = tx.add(isi, { type: 'text', name: 'Label', content: '1', size: 12 });
    const b = tx.add(isi, { type: 'text', name: 'Label', content: '2', size: 12 });
    const gone = tx.add(isi, { type: 'rect', name: 'Sementara' });
    const card = tx.add(home, { type: 'frame', name: 'Hero / Card' });
    tx.remove(gone);
    tx.move(b, card);
    tx.update(a, { name: 'Label / Utama' });
    const r = tx.commit('created');
    expect(r.created).toEqual([
      { id: a, name: 'Label / Utama', path: ['Home', 'Isi', 'Label / Utama'] },
      { id: b, name: 'Label', path: ['Home', 'Hero / Card', 'Label'] },
      { id: card, name: 'Hero / Card', path: ['Home', 'Hero / Card'] },
    ]);
  });

  it('dokumen asli tidak pernah dimutasi oleh op apa pun', () => {
    const { doc, home, isi, judul, garis, kedua } = fixture();
    const before = structuredClone(doc);
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.update(judul, { content: 'x' });
    tx.replace(garis, { type: 'ellipse', name: 'E' });
    tx.move(judul, home, 0);
    tx.duplicate(isi);
    tx.remove(kedua);
    tx.setTokens({ 'colors.a': '#000000' });
    tx.commit('semua');
    expect(doc).toEqual(before);
  });
});

describe('transact', () => {
  it('error tak tertangkap → rollback penuh: dokumen utuh, tanpa entri, error dilempar ulang', async () => {
    const { doc, isi, judul } = fixture();
    const before = structuredClone(doc);
    let seen: Transaction | undefined;
    const boom = new LakarError('EXEC_ERROR', 'gagal di tengah');
    await expect(
      transact(doc, { sessionId: 's', description: 'gagal' }, (tx) => {
        seen = tx;
        tx.add(isi, { type: 'rect', name: 'A' });
        tx.update(judul, { content: 'berubah' });
        tx.remove(isi);
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(seen!.open).toBe(false);
    expect(doc).toEqual(before);
  });

  it('error async tak tertangkap juga rollback, kode asli dipertahankan', async () => {
    const { doc, isi } = fixture();
    const r = transact(doc, { sessionId: 's', description: 'x' }, async (tx) => {
      tx.add(isi, { type: 'rect', name: 'A' });
      await Promise.resolve();
      tx.add(isi, { type: 'text', name: 'T' }); // SCHEMA_INVALID tak tertangkap
    });
    await expect(r).rejects.toMatchObject({ code: 'SCHEMA_INVALID' });
  });

  it('error tertangkap → commit berisi op yang sukses saja', async () => {
    const { doc, isi } = fixture();
    const r = await transact(doc, { sessionId: 's', description: 'sebagian', now: fixedNow }, (tx) => {
      const a = tx.add(isi, { type: 'rect', name: 'A' });
      try {
        tx.add(isi, { type: 'nope', name: 'X' });
      } catch {}
      return a;
    });
    expect(r.entry).toMatchObject({ rev: doc.rev + 1, opsSummary: 'add×1', description: 'sebagian' });
    expect(r.created).toEqual([{ id: r.value, name: 'A', path: ['Home', 'Isi', 'A'] }]);
  });

  it('commit: rev +1 dan tepat satu entri riwayat; created list dengan nama ganda', async () => {
    const doc = createDocument();
    const r = await transact(doc, { sessionId: 's9', description: 'dua judul', now: fixedNow }, (tx) => {
      const b = tx.add(null, boardIn('Home'));
      tx.add(b, { type: 'text', name: 'Judul', content: 'A', size: 20 });
      tx.add(b, { type: 'text', name: 'Judul', content: 'B', size: 20 });
      return 'ok';
    });
    expect(r.value).toBe('ok');
    expect(r.doc.rev).toBe(doc.rev + 1);
    expect(r.entry).toEqual({ rev: 1, sessionId: 's9', description: 'dua judul', opsSummary: 'add×3', at: '2026-11-17T00:00:00.000Z' });
    expect(Array.isArray(r.created)).toBe(true);
    expect(r.created.map((c) => c.name)).toEqual(['Home', 'Judul', 'Judul']);
    expect(r.created.map((c) => c.path)).toEqual([['Home'], ['Home', 'Judul'], ['Home', 'Judul']]);
    expect(new Set(r.created.map((c) => c.id)).size).toBe(3);
  });

  it('tanpa op → entry null, dokumen asli', async () => {
    const doc = createDocument();
    const r = await transact(doc, { sessionId: 's', description: 'baca' }, () => 2);
    expect(r).toEqual({ value: 2, doc, entry: null, created: [], inverse: [] });
  });

  it('commit gagal (TOKEN_UNKNOWN) dilempar, dokumen utuh', async () => {
    const doc = createDocument();
    const before = structuredClone(doc);
    await expect(
      transact(doc, { sessionId: 's', description: 'x' }, (tx) => {
        const b = tx.add(null, boardIn());
        tx.add(b, { type: 'text', name: 'T', content: 'a', size: 12, color: { $token: 'colors.nope' } });
      }),
    ).rejects.toMatchObject({ code: 'TOKEN_UNKNOWN' });
    expect(doc).toEqual(before);
  });
});

describe('view', () => {
  it('salinan kerja hidup: melihat op yang sudah sukses; dokumen asli tidak berubah; tertutup → melempar', () => {
    const doc = createDocument(seeded());
    const tx = beginTransaction(doc, { sessionId: 's', random: seeded(7), now: fixedNow });
    expect(tx.view().pages[0]!.children).toHaveLength(0);
    const b = tx.add(null, boardIn());
    expect(tx.view().pages[0]!.children.map((n) => n.id)).toEqual([b]);
    expect(doc.pages[0]!.children).toHaveLength(0);
    tx.rollback();
    expect(() => tx.view()).toThrow(/ditutup/);
  });
});

// ---------------------------------------------------------------------------
// Token bertipe v3 (AD-11): setTokens gaya baru + setTokenModes
// ---------------------------------------------------------------------------

describe('setTokens bertipe (v3)', () => {
  const base = () => createDocument(seeded(3));
  const colorDark = { 'colors.a': { type: 'color' as const, value: '#FFFFFF', modes: { dark: '#000000' } } };

  it('datar baru + ref di snippet yang sama → tipe diinferensi saat commit (radius)', () => {
    const tx = beginTransaction(base(), { sessionId: 's' });
    tx.setTokens({ 'radius.md': 8 });
    const b = tx.add(null, boardIn());
    tx.add(b, { type: 'rect', name: 'R', width: 10, height: 10, radius: { $token: 'radius.md' } });
    const r = tx.commit('radius');
    expect(r.doc.tokens!['radius.md']).toEqual({ type: 'radius', value: 8 });
  });

  it('datar baru dirujuk 2× size text + 1× gap → fontSize, gap di-detach saat commit', () => {
    const tx = beginTransaction(base(), { sessionId: 's' });
    tx.setTokens({ 'n.16': 16 });
    const b = tx.add(null, boardIn());
    const f = tx.add(b, { type: 'frame', name: 'F', layout: 'column', gap: { $token: 'n.16' } });
    tx.add(f, { type: 'text', name: 'A', content: 'a', size: { $token: 'n.16' } });
    tx.add(f, { type: 'text', name: 'B', content: 'b', size: { $token: 'n.16' } });
    const r = tx.commit('detach');
    expect(r.doc.tokens!['n.16']).toEqual({ type: 'fontSize', value: 16 });
    expect(find(r.doc, f)!.gap).toBe(16);
  });

  it('datar baru tanpa ref → tipe dari nilai', () => {
    const tx = beginTransaction(base(), { sessionId: 's' });
    tx.setTokens({ 'a.hex': '#FFF000', 'a.font': 'Inter', 'a.num': 8, 'a.neg': -0.5 });
    expect(tx.commit('x').doc.tokens).toEqual({
      'a.hex': { type: 'color', value: '#FFF000' },
      'a.font': { type: 'fontFamily', value: 'Inter' },
      'a.num': { type: 'spacing', value: 8 },
      'a.neg': { type: 'letterSpacing', value: -0.5 },
    });
  });

  it('datar ke token yang ada → value diganti, type/modes tetap', () => {
    const doc = { ...base(), tokenModes: ['light', 'dark'], tokens: colorDark };
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.setTokens({ 'colors.a': '#222222' });
    expect(tx.commit('x').doc.tokens).toEqual({ 'colors.a': { type: 'color', value: '#222222', modes: { dark: '#000000' } } });
  });

  it('datar ke token yang ada tetapi salah tipe → SCHEMA_INVALID, atomik', () => {
    const doc = { ...base(), tokenModes: ['light', 'dark'], tokens: colorDark };
    expectAtomic(doc, (tx) => tx.setTokens({ 'colors.y': '#FFFFFF' }), (tx) => tx.setTokens({ 'colors.a': 16 }), 'SCHEMA_INVALID');
  });

  it('bertipe → tersimpan apa adanya (menggantikan token sepenuhnya)', () => {
    const doc = { ...base(), tokenModes: ['light', 'dark'], tokens: colorDark };
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.setTokens({ 'colors.b': { type: 'color', value: '#FFFFFF' }, 'colors.a': { type: 'color', value: '#333333' } });
    expect(tx.commit('x').doc.tokens).toEqual({ 'colors.a': { type: 'color', value: '#333333' }, 'colors.b': { type: 'color', value: '#FFFFFF' } });
  });

  it.each([
    ['nilai salah tipe', { 'colors.b': { type: 'color', value: 16 } }],
    ['tipe tak dikenal', { 'colors.b': { type: 'shadow', value: '#000000' } }],
    ['string CSS', { 'colors.b': { type: 'color', value: 'rgba(0,0,0,1)' } }],
    ['kunci asing', { 'colors.b': { type: 'color', value: '#000000', extra: 1 } }],
    ['nilai mode salah tipe', { 'colors.b': { type: 'color', value: '#000000', modes: { dark: 4 } } }],
    ['fontWeight bukan kelipatan 100', { 'w.x': { type: 'fontWeight', value: 450 } }],
    ['lineHeight 0', { 'lh.x': { type: 'lineHeight', value: 0 } }],
    ['satu salah dari banyak', { 'colors.ok': '#111111', 'colors.b': { type: 'color', value: 16 } }],
  ])('%s → SCHEMA_INVALID, seluruh map ditolak, dokumen tak berubah', (_l, map) => {
    const doc = { ...base(), tokens: { 'colors.x': { type: 'color' as const, value: '#000000' } } };
    expectAtomic(doc, (tx) => tx.setTokens({ 'colors.y': '#FFFFFF' }), (tx) => tx.setTokens(map), 'SCHEMA_INVALID');
  });

  it('token color dirujuk di padding → commit gagal SCHEMA_INVALID menyebut path, token, tipe', () => {
    const doc = { ...base(), tokens: { 'colors.a': { type: 'color' as const, value: '#111111' } } };
    const tx = beginTransaction(doc, { sessionId: 's' });
    const b = tx.add(null, boardIn());
    tx.add(b, { type: 'frame', name: 'F', padding: { $token: 'colors.a' } });
    const e = caught(() => tx.commit('salah slot'));
    expect(e.code).toBe('SCHEMA_INVALID');
    expect(e.message).toContain('pages.0.children.0.children.0.padding');
    expect(e.message).toContain('colors.a');
    expect(e.message).toContain('color');
    expect(tx.open).toBe(false);
  });
});

describe('setTokenModes', () => {
  it('setTokenModes lalu update board themeMode → commit sukses', () => {
    const tx = beginTransaction(createDocument(seeded(4)), { sessionId: 's' });
    const b = tx.add(null, boardIn());
    tx.setTokenModes(['light', 'dark']);
    tx.update(b, { themeMode: 'dark' });
    const r = tx.commit('mode');
    expect(r.doc.tokenModes).toEqual(['light', 'dark']);
    expect(find(r.doc, b)!.themeMode).toBe('dark');
    expect(r.entry!.opsSummary).toBe('add×1, setTokenModes×1, update×1');
  });

  it('setTokenModes(null) saat mode masih dipakai → SCHEMA_INVALID saat commit; tidak dipakai → kunci dihapus', () => {
    const tx0 = beginTransaction(createDocument(seeded(5)), { sessionId: 's' });
    const b = tx0.add(null, boardIn());
    tx0.setTokenModes(['light', 'dark']);
    tx0.update(b, { themeMode: 'dark' });
    const doc = tx0.commit('x').doc;
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.setTokenModes(null);
    expect(code(() => tx.commit('hapus mode'))).toBe('SCHEMA_INVALID');
    const ok = beginTransaction(doc, { sessionId: 's' });
    ok.update(b, { themeMode: null });
    ok.setTokenModes(null);
    expect('tokenModes' in ok.commit('hapus').doc).toBe(false);
  });

  it('mode token tak terdaftar → SCHEMA_INVALID saat commit', () => {
    const tx = beginTransaction(createDocument(seeded(6)), { sessionId: 's' });
    tx.setTokenModes(['light', 'dark']);
    tx.setTokens({ 'colors.a': { type: 'color', value: '#FFFFFF', modes: { sepia: '#704214' } } });
    expect(code(() => tx.commit('sepia'))).toBe('SCHEMA_INVALID');
  });

  it.each([
    ['kosong', []],
    ['duplikat', ['light', 'light']],
    ['nama tidak valid', ['Light']],
    ['bukan array', 'light'],
  ])('%s → SCHEMA_INVALID langsung, atomik', (_l, modes) => {
    expectAtomic(createDocument(seeded(8)), (tx) => tx.setTokens({ 'colors.y': '#FFFFFF' }), (tx) => tx.setTokenModes(modes), 'SCHEMA_INVALID');
  });
});

// epic token-tema story 2: renameToken memindah definisi dan semua ref dalam satu commit (AD-2, AD-8).
describe('renameToken', () => {
  /** Fixture + token `colors.a` (fill Garis, stop gradien Isi), `spacing.s` (padding tuple Isi), `colors.z`. */
  const withTokens = () => {
    const f = fixture();
    const tx = beginTransaction(f.doc, { sessionId: 's', random: seeded(3) });
    tx.setTokens({ 'colors.z': { type: 'color', value: '#000000' }, 'colors.a': { type: 'color', value: '#111111' }, 'spacing.s': { type: 'spacing', value: 4 } });
    tx.update(f.garis, { fills: [{ type: 'solid', color: { $token: 'colors.a' } }] });
    tx.update(f.isi, {
      padding: [{ $token: 'spacing.s' }, 16],
      fills: [{ type: 'linear', angle: 90, stops: [{ offset: 0, color: { $token: 'colors.a' } }, { offset: 1, color: '#FFFFFF' }] }],
    });
    return { ...f, doc: tx.commit('token').doc };
  };

  it('memindah definisi (posisi tetap) dan semua ref; invers mengembalikan dokumen', () => {
    const f = withTokens();
    const tx = beginTransaction(f.doc, { sessionId: 's' });
    tx.renameToken('colors.a', 'colors.brand');
    const r = tx.commit('rename');
    expect(Object.keys(r.doc.tokens!)).toEqual(['colors.z', 'colors.brand', 'spacing.s']);
    expect(r.doc.tokens!['colors.brand']).toEqual({ type: 'color', value: '#111111' });
    expect(find(r.doc, f.garis)!.fills[0].color).toEqual({ $token: 'colors.brand' });
    expect(find(r.doc, f.isi)!.fills[0].stops[0].color).toEqual({ $token: 'colors.brand' });
    expect(find(r.doc, f.isi)!.padding).toEqual([{ $token: 'spacing.s' }, 16]);
    expect(JSON.stringify(r.doc)).not.toContain('"colors.a"');
    expect(r.entry!.opsSummary).toBe('renameToken×1');
    expect(r.inverse).toEqual([{ op: 'renameToken', from: 'colors.brand', to: 'colors.a' }]);
    expect(f.doc.tokens!['colors.a']).toBeDefined();
    const back = beginTransaction(r.doc, { sessionId: 's' });
    back.renameToken('colors.brand', 'colors.a');
    const b = back.commit('undo');
    expect({ pages: b.doc.pages, tokens: b.doc.tokens }).toEqual({ pages: f.doc.pages, tokens: f.doc.tokens });
  });

  it('error: tak dikenal → TOKEN_UNKNOWN + saran; bentrok → CONFLICT; nama salah → SCHEMA_INVALID; atomik', () => {
    const f = withTokens();
    const e = caught(() => beginTransaction(f.doc, { sessionId: 's' }).renameToken('colors.b', 'colors.c'));
    expect(e.code).toBe('TOKEN_UNKNOWN');
    expect(e.message).toContain('colors.a');
    expectAtomic(f.doc, () => {}, (tx) => tx.renameToken('colors.a', 'colors.z'), 'CONFLICT');
    expectAtomic(f.doc, () => {}, (tx) => tx.renameToken('colors.a', 'Bad Name'), 'SCHEMA_INVALID');
    expectAtomic(f.doc, () => {}, (tx) => tx.renameToken(42, 'colors.b'), 'SCHEMA_INVALID');
  });

  it('from === to tanpa efek dan tanpa invers', () => {
    const f = withTokens();
    const tx = beginTransaction(f.doc, { sessionId: 's' });
    tx.renameToken('colors.a', 'colors.a');
    const r = tx.commit('noop');
    expect(r.inverse).toEqual([]);
    expect(r.doc.tokens).toEqual(f.doc.tokens);
  });

  it('token datar baru di transaksi yang sama ikut pindah nama dan tetap diinferensi saat commit', () => {
    const f = fixture();
    const tx = beginTransaction(f.doc, { sessionId: 's' });
    tx.setTokens({ 'radius.tmp': 8 });
    tx.update(f.garis, { radius: { $token: 'radius.tmp' } });
    tx.renameToken('radius.tmp', 'radius.md');
    const r = tx.commit('flat');
    expect(r.doc.tokens!['radius.md']).toEqual({ type: 'radius', value: 8 });
    expect(find(r.doc, f.garis)!.radius).toEqual({ $token: 'radius.md' });
  });
});
