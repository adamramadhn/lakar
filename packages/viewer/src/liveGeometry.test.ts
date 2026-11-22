import { describe, expect, it } from 'vitest';
import type { BoardNode } from '@lakar/schema';
import { measureBoard } from './liveGeometry.js';

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
