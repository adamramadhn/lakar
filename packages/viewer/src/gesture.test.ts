import { describe, expect, it } from 'vitest';
import {
  boxFrom,
  committedBox,
  dropContainer,
  hitPath,
  indexGeo,
  marqueeSelect,
  moveOps,
  pickTarget,
  reorderHint,
  reorderTarget,
  resizeBox,
  resizeOp,
  scaleBox,
  sizeBadge,
  toggleSelection,
  unionBox,
  type Box,
  type GeoNode,
} from './gesture.js';

const node = (id: string, box: Box, opts: Partial<GeoNode> = {}): GeoNode => ({
  id,
  type: 'rect',
  name: id,
  box,
  parentId: undefined,
  absolute: false,
  x: 0,
  y: 0,
  layout: undefined,
  children: [],
  ...opts,
});
/** Pasang parentId anak secara rekursif. */
const tree = (n: GeoNode): GeoNode => {
  for (const c of n.children) {
    c.parentId = n.id;
    tree(c);
  }
  return n;
};

// Board B (0,0 400x300, kolom) → Row (10,10 380x100, row) → kartu A, Bc, C (masing-masing teks di dalam);
// Abs (absolute, 200,200 50x50).
const text = (id: string, x: number) => node(id, { x: x + 5, y: 20, w: 40, h: 20 }, { type: 'text' });
const card = (id: string, x: number) => node(id, { x, y: 10, w: 100, h: 100 }, { type: 'frame', layout: 'none', children: [text(`t${id}`, x)] });
const makeBoard = () =>
  tree(
    node('B', { x: 0, y: 0, w: 400, h: 300 }, {
      type: 'board',
      absolute: true,
      layout: 'column',
      children: [
        node('Row', { x: 10, y: 10, w: 380, h: 100 }, { type: 'frame', layout: 'row', children: [card('A', 10), card('Bc', 120), card('C', 230)] }),
        node('Abs', { x: 200, y: 200, w: 50, h: 50 }, { absolute: true, x: 200, y: 190 }),
      ],
    }),
  );

describe('hitPath + pickTarget', () => {
  const b = makeBoard();
  const path = hitPath([b], { x: 20, y: 25 });
  it('jalur board → Row → kartu → teks', () => expect(path.map((n) => n.id)).toEqual(['B', 'Row', 'A', 'tA']));
  it('klik pertama memilih anak langsung board', () => expect(pickTarget(path, new Set(), new Set(), 'scope')?.id).toBe('Row'));
  it('saudara seleksi terpilih (scope parent)', () => {
    const p2 = hitPath([b], { x: 130, y: 25 });
    expect(pickTarget(p2, new Set(['A']), new Set(['Row']), 'scope')?.id).toBe('Bc');
  });
  it('node terpilih tetap terpilih saat diklik lagi', () => expect(pickTarget(path, new Set(['A']), new Set(['Row']), 'scope')?.id).toBe('A'));
  it('Ctrl/⌘ = terdalam', () => expect(pickTarget(path, new Set(), new Set(), 'deep')?.id).toBe('tA'));
  it('dobel-klik masuk ke anak node terpilih', () => expect(pickTarget(path, new Set(['A']), new Set(['Row']), 'enter')?.id).toBe('tA'));
  it('latar board → board', () => {
    const p = hitPath([b], { x: 300, y: 280 });
    expect(p.map((n) => n.id)).toEqual(['B']);
    expect(pickTarget(p, new Set(), new Set(), 'scope')?.id).toBe('B');
  });
  it('di luar board → kosong', () => {
    expect(hitPath([b], { x: 500, y: 10 })).toEqual([]);
    expect(pickTarget([], new Set(), new Set(), 'scope')).toBeUndefined();
  });
  it('anak terakhir yang memuat titik menang (paling atas)', () => {
    const top = tree(node('P', { x: 0, y: 0, w: 100, h: 100 }, { layout: 'none', children: [node('u', { x: 0, y: 0, w: 50, h: 50 }), node('o', { x: 0, y: 0, w: 50, h: 50 })] }));
    expect(hitPath([top], { x: 10, y: 10 }).map((n) => n.id)).toEqual(['P', 'o']);
  });
});

describe('seleksi', () => {
  it('toggleSelection menambah lalu membuang', () => {
    expect(toggleSelection(['A'], 'B')).toEqual(['A', 'B']);
    expect(toggleSelection(['A', 'B'], 'A')).toEqual(['B']);
  });
  it('marquee beririsan dalam board', () => {
    const b = makeBoard();
    expect(marqueeSelect(b.children, boxFrom({ x: 180, y: 180 }, { x: 260, y: 290 }))).toEqual(['Abs']);
    // Memotong Row dan Abs → keduanya (Row tidak memuat penuh marquee).
    expect(marqueeSelect(b.children, { x: 100, y: 50, w: 120, h: 180 })).toEqual(['Row', 'Abs']);
  });
  it('marquee di dalam kontainer turun ke anaknya', () => {
    const b = makeBoard();
    expect(marqueeSelect(b.children, { x: 112, y: 30, w: 50, h: 20 })).toEqual(['Bc']);
    expect(marqueeSelect(b.children, { x: 90, y: 30, w: 50, h: 20 })).toEqual(['A', 'Bc']);
    // Seluruhnya di dalam kartu A → teks di dalamnya.
    expect(marqueeSelect(b.children, { x: 12, y: 15, w: 20, h: 10 })).toEqual(['tA']);
  });
  it('marquee di halaman memilih board', () => {
    const b = makeBoard();
    const b2 = node('B2', { x: 500, y: 0, w: 100, h: 100 }, { type: 'board', absolute: true });
    expect(marqueeSelect([b, b2], { x: 350, y: -20, w: 200, h: 40 })).toEqual(['B', 'B2']);
  });
  it('unionBox + sizeBadge', () => {
    const u = unionBox([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 10, h: 20 }])!;
    expect(u).toEqual({ x: 0, y: 0, w: 30, h: 25 });
    expect(sizeBadge(1, u)).toBe('30 × 25');
    expect(sizeBadge(3, { x: 0, y: 0, w: 536.4, h: 149.6 })).toBe('3 selected · 536 × 150');
    expect(unionBox([])).toBeUndefined();
  });
  it('indexGeo memuat seluruh pohon', () => expect([...indexGeo([makeBoard()]).keys()]).toContain('tC'));
});

describe('resize', () => {
  const s: Box = { x: 10, y: 10, w: 100, h: 50 };
  it('handle se/nw/n/w', () => {
    expect(resizeBox(s, 'se', 20, 10)).toEqual({ x: 10, y: 10, w: 120, h: 60 });
    expect(resizeBox(s, 'nw', 20, 10)).toEqual({ x: 30, y: 20, w: 80, h: 40 });
    expect(resizeBox(s, 'n', 50, -5)).toEqual({ x: 10, y: 5, w: 100, h: 55 });
    expect(resizeBox(s, 'e', 5, 99)).toEqual({ x: 10, y: 10, w: 105, h: 50 });
  });
  it('ukuran minimal 1, sisi seberang tetap', () => {
    expect(resizeBox(s, 'w', 500, 0)).toEqual({ x: 109, y: 10, w: 1, h: 50 });
    expect(resizeBox(s, 's', 0, -500)).toEqual({ x: 10, y: 10, w: 100, h: 1 });
  });
  it('scaleBox memetakan anggota ke bounding box baru', () => {
    expect(scaleBox({ x: 50, y: 0, w: 50, h: 10 }, { x: 0, y: 0, w: 100, h: 10 }, { x: 0, y: 0, w: 200, h: 20 })).toEqual({ x: 100, y: 0, w: 100, h: 20 });
  });
  it('resizeOp flow: hanya width/height yang berubah', () => {
    const n = node('n', s);
    expect(resizeOp(n, s, { x: 0, y: 10, w: 110, h: 50 })).toEqual({ op: 'update', id: 'n', patch: { width: 110 } });
    expect(resizeOp(n, s, s)).toBeUndefined();
  });
  it('resizeOp absolute ikut x/y', () => {
    const n = node('n', s, { absolute: true, x: 4, y: 6 });
    expect(resizeOp(n, s, { x: 0, y: 10, w: 110.4, h: 70 })).toEqual({ op: 'update', id: 'n', patch: { width: 110, height: 70, x: -6 } });
  });
  it('committedBox: flow tetap di posisinya, icon persegi, absolute apa adanya', () => {
    const to: Box = { x: 0, y: 5, w: 30, h: 20 };
    expect(committedBox(node('f', s), to)).toEqual({ x: 10, y: 10, w: 30, h: 20 });
    expect(committedBox(node('a', s, { absolute: true }), to)).toEqual(to);
    expect(committedBox(node('i', s, { type: 'icon', absolute: true }), to)).toEqual({ x: 0, y: 5, w: 30, h: 30 });
  });
  it('resizeOp icon → size', () => {
    const n = node('i', { x: 0, y: 0, w: 24, h: 24 }, { type: 'icon' });
    expect(resizeOp(n, n.box, { x: 0, y: 0, w: 30, h: 28 })).toEqual({ op: 'update', id: 'i', patch: { size: 30 } });
  });
});

describe('geser + reorder', () => {
  it('moveOps: absolute dibulatkan, flow dan tanpa perubahan dilewati', () => {
    const b = makeBoard();
    const [row, abs] = b.children as [GeoNode, GeoNode];
    expect(moveOps([abs, row, b], 10.4, -0.2)).toEqual([
      { op: 'update', id: 'Abs', patch: { x: 210, y: 190 } },
      { op: 'update', id: 'B', patch: { x: 10, y: 0 } },
    ]);
    expect(moveOps([abs], 0.3, 0.4)).toEqual([]);
  });
  it('reorderTarget di Row: indeks akhir sesudah dilepas + posisi 1-based', () => {
    const b = makeBoard();
    const row = b.children[0]!;
    const a = row.children[0]!;
    // Ke antara Bc dan C: sesudah A dilepas [Bc, C] → indeks 1, posisi 2.
    const t = reorderTarget(row, a, { x: 225, y: 50 });
    expect(t).toMatchObject({ containerId: 'Row', index: 1, position: 2, noop: false });
    expect(t.bar.x).toBeCloseTo(223.5);
    expect(reorderHint(t.position, row.name)).toBe('Move to position 2 in Row');
    // Paling akhir.
    expect(reorderTarget(row, a, { x: 380, y: 50 })).toMatchObject({ index: 2, position: 3, noop: false });
    // Tetap di tempat.
    expect(reorderTarget(row, a, { x: 20, y: 50 })).toMatchObject({ index: 0, noop: true });
  });
  it('reorderTarget kolom melewati anak absolute', () => {
    const b = makeBoard();
    const abs = b.children[1]!;
    const extra = node('X', { x: 0, y: 120, w: 50, h: 20 });
    b.children.push(extra);
    extra.parentId = 'B';
    // Kolom board: [Row, Abs(absolute), X]; X ke atas Row → indeks 0.
    expect(reorderTarget(b, extra, { x: 5, y: 15 })).toMatchObject({ index: 0, position: 1, noop: false });
    // Ke bawah Row: sesudah Row = indeks 1 (sebelum Abs).
    expect(reorderTarget(b, extra, { x: 5, y: 290 })).toMatchObject({ index: 1, position: 2, noop: true });
    expect(abs.absolute).toBe(true);
  });
  it('kontainer kosong → indeks 0', () => {
    const empty = node('E', { x: 0, y: 0, w: 100, h: 100 }, { type: 'frame', layout: 'column' });
    expect(reorderTarget(empty, node('z', { x: 0, y: 0, w: 1, h: 1 }), { x: 10, y: 10 })).toMatchObject({ index: 0, position: 1, noop: false });
  });
  it('dropContainer: kontainer flow terdalam, bukan turunan node', () => {
    const b = makeBoard();
    const path = hitPath([b], { x: 20, y: 25 });
    expect(dropContainer(path, 'Abs')?.id).toBe('Row');
    expect(dropContainer(path, 'Row')?.id).toBe('B');
    expect(dropContainer(hitPath([b], { x: 300, y: 280 }), 'A')?.id).toBe('B');
  });
});
