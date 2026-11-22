import { describe, expect, it } from 'vitest';
import { NODE_ATTR } from '@lakar/render';
import type { BoardNode } from '@lakar/schema';
import { measureBoard, measureLiveSize } from './liveGeometry.js';

/** Host palsu: shadow root dengan elemen ber-`data-lakar-id` dan kotak layar (skala 0.5, board di layar (100, 50)). */
function fakeHost(rects: Record<string, [number, number, number, number]>) {
  const els = Object.entries(rects).map(([id, [x, y, w, h]]) => ({
    getAttribute: () => id,
    getBoundingClientRect: () => ({ left: x, top: y, width: w, height: h }),
  }));
  return { shadowRoot: { querySelectorAll: () => els } } as unknown as HTMLElement;
}

const board = {
  type: 'board',
  id: 'BBBBBBBB',
  name: 'B',
  x: 1000,
  y: 0,
  width: 400,
  height: 300,
  screen: 'app',
  children: [
    { type: 'frame', id: 'FFFFFFFF', name: 'Free', children: [{ type: 'rect', id: 'RRRRRRRR', name: 'R', x: 10, y: 20 }] },
    { type: 'frame', id: 'WWWWWWWW', name: 'Row', layout: 'row', children: [{ type: 'rect', id: 'AAAAAAAA', name: 'A', position: 'absolute', x: 5, y: 6 }, { type: 'rect', id: 'CCCCCCCC', name: 'C' }] },
    { type: 'rect', id: 'MMMMMMMM', name: 'Missing' },
  ],
} as unknown as BoardNode;

describe('measureBoard', () => {
  const host = fakeHost({
    BBBBBBBB: [100, 50, 200, 150],
    FFFFFFFF: [100, 50, 100, 50],
    RRRRRRRR: [105, 60, 10, 10],
    WWWWWWWW: [100, 100, 200, 50],
    AAAAAAAA: [102.5, 103, 10, 10],
    CCCCCCCC: [110, 100, 20, 20],
  });
  const g = measureBoard(host, board, { x: board.x, y: board.y })!;
  const [free, row] = g.children as [NonNullable<typeof g>, NonNullable<typeof g>];

  it('board = kolom absolute dengan x/y halaman', () => {
    expect(g).toMatchObject({ id: 'BBBBBBBB', layout: 'column', absolute: true, x: 1000, y: 0, box: { x: 1000, y: 0, w: 400, h: 300 } });
  });
  it('kotak dibagi skala dan digeser ke posisi halaman', () => {
    expect(row.box).toEqual({ x: 1000, y: 100, w: 400, h: 100 });
    expect(row.children[1]!.box).toEqual({ x: 1020, y: 100, w: 40, h: 40 });
  });
  it('anak frame tanpa layout absolute dengan x/y tersimpan; anak flow x/y 0; position absolute di row', () => {
    expect(free.layout).toBe('none');
    expect(free.absolute).toBe(false);
    expect(free.children[0]).toMatchObject({ id: 'RRRRRRRR', absolute: true, x: 10, y: 20, parentId: 'FFFFFFFF' });
    expect(row.children[0]).toMatchObject({ id: 'AAAAAAAA', absolute: true, x: 5, y: 6 });
    expect(row.children[1]).toMatchObject({ id: 'CCCCCCCC', absolute: false, x: 0, y: 0, layout: undefined });
  });
  it('node tanpa elemen dilewati; board belum di-mount → undefined', () => {
    expect(g.children.map((c) => c.id)).toEqual(['FFFFFFFF', 'WWWWWWWW']);
    expect(measureBoard(fakeHost({}), board, { x: 0, y: 0 })).toBeUndefined();
  });
});

describe('measureLiveSize', () => {
  // Host natural 400 px, tampil 200 px (zoom 0.5). Selektor harus persis atribut Canvas (`data-live-board`) dan
  // render (`NODE_ATTR`). Elemen SVG 50×25 px di layar → 100×50 desain; elemen HTML memakai offsetWidth/Height.
  const svg = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 50, height: 25 }) };
  const html = { offsetWidth: 120, offsetHeight: 40, getBoundingClientRect: () => ({ left: 0, top: 0, width: 999, height: 999 }) };
  const nodes: Record<string, unknown> = { [`[${NODE_ATTR}="NNNNNNNN"]`]: svg, [`[${NODE_ATTR}="HHHHHHHH"]`]: html };
  const host = {
    offsetWidth: 400,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 150 }),
    shadowRoot: { querySelector: (sel: string) => nodes[sel] ?? null },
  };
  const root = { querySelector: (sel: string) => (sel === '[data-live-board="BBBBBBBB"]' ? host : null) } as unknown as ParentNode;
  it('SVG: ukuran layar dibagi skala host; HTML: ukuran layout tanpa transform (rotasi tidak menggelembung)', () => {
    expect(measureLiveSize(root, 'BBBBBBBB', 'NNNNNNNN')).toEqual({ w: 100, h: 50 });
    expect(measureLiveSize(root, 'BBBBBBBB', 'HHHHHHHH')).toEqual({ w: 120, h: 40 });
  });
  it('board atau node belum di-mount → undefined', () => {
    expect(measureLiveSize(root, 'XXXXXXXX', 'NNNNNNNN')).toBeUndefined();
    expect(measureLiveSize(root, 'BBBBBBBB', 'ZZZZZZZZ')).toBeUndefined();
  });
});
