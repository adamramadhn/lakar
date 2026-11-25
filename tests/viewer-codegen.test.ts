// Kode execute layer manual (aplikasi 4): dijalankan di sandbox exec sungguhan (tanpa daemon) supaya node yang
// dibangkitkan lolos skema dan mendarat di posisi/ukuran spec. Deskripsi selalu 3–8 kata.
import { describe, expect, it } from 'vitest';
import { createDocument, transact } from '../packages/core/src/index.ts';
import { runSnippet } from '../packages/exec/src/index.ts';
import { IconCatalog } from '../packages/icons/src/index.ts';
import {
  canvasInsertTarget,
  failureText,
  imageBox,
  imageFileProblem,
  insertBoardAt,
  insertBoardPlaced,
  insertIntoBoard,
  INSERT_KINDS,
  menuInsertTarget,
  nextBoardPosition,
  nodeProps,
  wordCount,
  type InsertKind,
} from '../packages/viewer/src/codegen.ts';

const icons = IconCatalog.load();
const ASSET = 'a'.repeat(64);

/** Dokumen dengan satu board "Desktop" 1440×900. */
async function baseDoc() {
  const r = await transact(createDocument(), { sessionId: 't', description: 'base' }, (tx) => {
    tx.add(null, { type: 'board', name: 'Desktop', x: 0, y: 0, width: 1440, height: 900, screen: 'landing' });
  });
  const board = r.doc.pages[0]!.children[0]!;
  return { doc: r.doc, board: { id: board.id, name: board.name } };
}

async function run(doc: Awaited<ReturnType<typeof baseDoc>>['doc'], code: string) {
  const r = await transact(doc, { sessionId: 'lakar-viewer', description: 'x' }, async (tx) => {
    const out = await runSnippet(code, tx, { timeoutMs: 2000, memoryBytes: 32 * 1024 * 1024, keep: {}, icons });
    if (!out.ok) throw out.error;
    return out;
  });
  return r;
}

const childOf = (doc: any, id: string) => doc.pages[0].children.flatMap((b: any) => [b, ...b.children]).find((n: any) => n.id === id);

describe('insertIntoBoard', () => {
  it('Rectangle klik (120,80) di Desktop → rect absolut 200×120 fill #D9D9D9; deskripsi "Insert rectangle into Desktop board"', async () => {
    const { doc, board } = await baseDoc();
    const { code, description } = insertIntoBoard('rect', board, 120.4, 79.6);
    expect(description).toBe('Insert rectangle into Desktop board');
    const r = await run(doc, code);
    expect(r.entry).not.toBeNull();
    const id = r.created[0]!.id;
    expect(childOf(r.doc, id)).toMatchObject({ type: 'rect', position: 'absolute', x: 120, y: 80, width: 200, height: 120, fills: [{ type: 'solid', color: '#D9D9D9' }] });
    expect(r.doc.pages[0]!.children[0]!.children.map((c) => c.id)).toContain(id);
  });

  it.each<[InsertKind, Record<string, unknown>]>([
    ['frame', { type: 'frame', layout: 'none', width: 200, height: 200 }],
    ['ellipse', { type: 'ellipse', width: 120, height: 120, fills: [{ type: 'solid', color: '#D9D9D9' }] }],
    ['text', { type: 'text', content: 'Text', family: 'Inter', size: 16, color: '#111111' }],
    ['icon', { type: 'icon', lib: 'lucide', icon: 'star', size: 24 }],
  ])('%s: default spec, lolos skema exec', async (kind, expected) => {
    const { doc, board } = await baseDoc();
    const { code } = insertIntoBoard(kind, board, 10, 20);
    const r = await run(doc, code);
    expect(childOf(r.doc, r.created[0]!.id)).toMatchObject({ ...expected, position: 'absolute', x: 10, y: 20 });
  });

  it('icon terpilih dari pemilih dipakai; image = rect fill image cover, lebar maks 400, rasio dijaga', async () => {
    const { doc, board } = await baseDoc();
    const ic = await run(doc, insertIntoBoard('icon', board, 0, 0, { icon: { lib: 'lucide', icon: 'arrow-right' } }).code);
    expect(childOf(ic.doc, ic.created[0]!.id)).toMatchObject({ lib: 'lucide', icon: 'arrow-right', name: 'Icon / lucide / arrow-right' });
    const im = await run(doc, insertIntoBoard('image', board, 5, 5, { image: { assetId: ASSET, width: 1200, height: 800 } }).code);
    expect(childOf(im.doc, im.created[0]!.id)).toMatchObject({ type: 'rect', width: 400, height: 267, fills: [{ type: 'image', assetId: ASSET, fit: 'cover' }] });
    expect(() => nodeProps('image')).toThrow();
  });

  it('nama board aneh tidak bocor ke kode (JSON), deskripsi tetap 3–8 kata', () => {
    const board = { id: 'B1234567', name: "x'); remove('B1234567'); ('\n a b c d e f g h" };
    const { code, description } = insertIntoBoard('text', board, 0, 0);
    expect(code.startsWith('add("B1234567", ')).toBe(true);
    expect(code).not.toContain("remove('B1234567')\n");
    expect(wordCount(description)).toBeLessThanOrEqual(8);
    expect(wordCount(insertIntoBoard('text', { id: 'B1', name: '   ' }, 0, 0).description)).toBeGreaterThanOrEqual(3);
  });
});

describe('board baru dan hapus', () => {
  it('Frame di kanvas kosong → board 400×300 screen app fill putih di posisi klik', async () => {
    const { doc } = await baseDoc();
    const r = await run(doc, insertBoardAt(1600.2, -40).code);
    const b = r.doc.pages[0]!.children.find((x) => x.id === r.created[0]!.id)!;
    expect(b).toMatchObject({ type: 'board', x: 1600, y: -40, width: 400, height: 300, screen: 'app', fills: [{ type: 'solid', color: '#FFFFFF' }] });
  });

  it('halaman 2 aktif: Frame di kanvas kosong dan menu "+" → board di halaman 2 (add(pageId)), bukan halaman 1', async () => {
    const base = await baseDoc();
    const doc = structuredClone(base.doc);
    doc.pages.push({ id: 'PageTwo2', name: 'Page 2', children: [] });
    const at = await run(doc, insertBoardAt(100, 50, 'PageTwo2').code);
    expect(at.doc.pages[0]!.children).toHaveLength(1);
    expect(at.doc.pages[1]!.children[0]).toMatchObject({ id: at.created[0]!.id, x: 100, y: 50, width: 400, height: 300 });
    // Tanpa klik: kanan board terakhir halaman + 80, atau (0,0) bila halaman kosong.
    const first = await run(doc, insertBoardPlaced('PageTwo2', []).code);
    expect(first.doc.pages[1]!.children[0]).toMatchObject({ x: 0, y: 0 });
    const next = await run(at.doc, insertBoardPlaced('PageTwo2', at.doc.pages[1]!.children).code);
    expect(next.doc.pages[1]!.children[1]).toMatchObject({ x: 100 + 400 + 80, y: 50 });
    expect(nextBoardPosition([])).toEqual({ x: 0, y: 0 });
    expect(insertBoardAt(0, 0).code.startsWith('add(null, ')).toBe(true);
  });

  it('preset perangkat (spec-viewer-device-presets): board preset di kanan board terakhir halaman, deskripsi menyebut nama', async () => {
    const base = await baseDoc();
    const doc = structuredClone(base.doc);
    doc.pages.push({ id: 'PageTwo2', name: 'Page 2', children: [] });
    const preset = { name: 'iPhone 18 Pro', width: 402, height: 874, screen: 'mobile' as const };
    const { code, description } = insertBoardPlaced('PageTwo2', doc.pages[1]!.children, preset);
    expect(description).toBe('Insert iPhone 18 Pro board');
    expect(wordCount(description)).toBeLessThanOrEqual(8);
    const r = await run(doc, code);
    expect(r.doc.pages[1]!.children[0]).toMatchObject({ id: r.created[0]!.id, name: 'iPhone 18 Pro', x: 0, y: 0, width: 402, height: 874, screen: 'mobile', fills: [{ type: 'solid', color: '#FFFFFF' }] });
    // insertBoardAt dengan preset: posisi klik + nama preset lolos JSON (aman untuk nama aneh).
    const weird = await run(doc, insertBoardAt(50, 60, 'PageTwo2', { name: "a'); remove('x'); ('b", width: 10, height: 10, screen: 'app' }).code);
    expect(weird.doc.pages[1]!.children.at(-1)!.name).toBe("a'); remove('x'); ('b");
  });

  it('semua deskripsi 3–8 kata', () => {
    const b = { id: 'B1', name: 'Hero Section For The Landing Page' };
    for (const { kind } of INSERT_KINDS) {
      const extra = { image: { assetId: ASSET, width: 10, height: 10 } };
      expect(wordCount(insertIntoBoard(kind, b, 0, 0, extra).description)).toBeGreaterThanOrEqual(3);
      expect(wordCount(insertIntoBoard(kind, b, 0, 0, extra).description)).toBeLessThanOrEqual(8);
    }
    expect(wordCount(insertBoardAt(0, 0).description)).toBeLessThanOrEqual(8);
  });
});

describe('util', () => {
  it('imageBox: kecil tetap, besar diskalakan ke 400', () => {
    expect(imageBox(1200, 800)).toEqual({ width: 400, height: 267 });
    expect(imageBox(100, 50)).toEqual({ width: 100, height: 50 });
    expect(imageBox(800, 4000)).toEqual({ width: 400, height: 2000 });
  });

  it('failureText: pesan + hint tanpa saran editId', () => {
    expect(failureText('render gagal', "periksa font; perbaiki tanpa mengirim ulang kode: execute({editId:'abc', edits:[]})")).toBe('render gagal (periksa font)');
    expect(failureText('x', '')).toBe('x');
  });

  it('imageFileProblem: tipe dan 20 MB', () => {
    expect(imageFileProblem({ name: 'a.png', type: 'image/png', size: 10 })).toBeUndefined();
    expect(imageFileProblem({ name: 'a.webp', type: '', size: 10 })).toBeUndefined();
    expect(imageFileProblem({ name: 'a.svg', type: 'image/svg+xml', size: 10 })).toMatch(/PNG/);
    expect(imageFileProblem({ name: 'a.png', type: 'image/png', size: 21 * 1024 * 1024 })).toMatch(/20 MB/);
  });
});

describe('board baru dari viewer membawa ID halaman aktif', () => {
  const page2 = { id: 'PageTwo2' };
  const boards = [{ id: 'B1', name: 'Mobile', x: 0, y: 0, width: 375 }];
  it('Frame di kanvas kosong → pageId halaman aktif; di atas board → sisip ke board', () => {
    expect(canvasInsertTarget('frame', { x: 10, y: 20 }, boards, page2)).toEqual({ kind: 'frame', x: 10, y: 20, pageId: 'PageTwo2' });
    expect(canvasInsertTarget('rect', { boardId: 'B1', x: 5, y: 6 }, boards, page2)).toEqual({ kind: 'rect', board: { id: 'B1', name: 'Mobile' }, x: 5, y: 6 });
  });
  it('menu "+" tanpa board → placed.pageId halaman aktif; tipe lain → undefined; dengan board → board itu', () => {
    expect(menuInsertTarget('frame', undefined, [], page2)).toEqual({ kind: 'frame', x: 0, y: 0, placed: { pageId: 'PageTwo2', pageBoards: [] } });
    expect(menuInsertTarget('rect', undefined, [], page2)).toBeUndefined();
    expect(menuInsertTarget('rect', boards[0], boards, page2)).toEqual({ kind: 'rect', board: { id: 'B1', name: 'Mobile' }, x: 40, y: 40 });
  });
});
