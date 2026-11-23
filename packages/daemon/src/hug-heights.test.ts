// Catatan tinggi board `height:'hug'` (spec-board-hug-height): murni + RenderPort tiruan.
import { describe, expect, it } from 'vitest';
import type { BoardMeasure, RenderPort } from '@lakar/ports';
import { SCHEMA_VERSION, type ResolvedDocument } from '@lakar/schema';
import { HugHeights, hugBoardIds } from './hug-heights.js';

const board = (id: string, height: number | 'hug') => ({ type: 'board', id, name: id, x: 0, y: 0, width: 1440, height, screen: 'landing', children: [] });
const docAt = (rev: number, boards = [board('Hugboar1', 'hug'), board('Fixedbr1', 900), board('Hugboar2', 'hug')]) =>
  ({ schemaVersion: SCHEMA_VERSION, id: 'Docu0001', rev, pages: [{ id: 'Page0001', name: 'Page 1', children: boards }] }) as unknown as ResolvedDocument;
const m = (height: number): BoardMeasure => ({ width: 1440, height, nodes: [], texts: [] });

/** RenderPort tiruan: tinggi per board, id di `fail` → error render; mencatat board yang diukur. */
function fakeRender(heights: Record<string, number>, fail: string[] = []) {
  const calls: string[] = [];
  const port: RenderPort<ResolvedDocument> = {
    screenshot: () => Promise.reject(new Error('tidak dipakai')),
    measure: (_doc, id) => {
      calls.push(id);
      return fail.includes(id) ? Promise.reject(new Error('FONT_MISSING')) : Promise.resolve(m(heights[id] ?? 0));
    },
  };
  return { port, calls };
}

describe('HugHeights', () => {
  it('hugBoardIds: hanya board height:"hug", urutan dokumen', () => {
    expect(hugBoardIds(docAt(1))).toEqual(['Hugboar1', 'Hugboar2']);
  });

  it('record menyimpan hanya board hug pada rev dokumen; rev lain → kosong', () => {
    const h = new HugHeights();
    h.record(docAt(3), new Map([['Hugboar1', m(4050)], ['Fixedbr1', m(900)]]));
    expect(h.known(docAt(3))).toEqual(new Map([['Hugboar1', 4050]]));
    expect(h.known(docAt(4))).toEqual(new Map());
  });

  it('record dengan baseRev: board tak tersentuh terbawa dari rev sebelumnya; tanpa catatan di baseRev → mulai baru', () => {
    const h = new HugHeights();
    h.record(docAt(3), new Map([['Hugboar1', m(4050)], ['Hugboar2', m(2000)]]));
    h.record(docAt(4), new Map([['Hugboar1', m(4400)]]), 3);
    expect(h.known(docAt(4))).toEqual(new Map([['Hugboar1', 4400], ['Hugboar2', 2000]]));
    h.record(docAt(9), new Map([['Hugboar1', m(10)]]), 7);
    expect(h.known(docAt(9))).toEqual(new Map([['Hugboar1', 10]]));
  });

  it('board yang berubah jadi fixed tidak lagi tercatat', () => {
    const h = new HugHeights();
    h.record(docAt(3), new Map([['Hugboar1', m(4050)]]));
    h.record(docAt(4, [board('Hugboar1', 4050)]), new Map(), 3);
    expect(h.known(docAt(4))).toEqual(new Map());
  });

  it('ensure mengukur hanya board hug yang belum tercatat; render gagal dilewati (belum terukur), bukan error', async () => {
    const h = new HugHeights();
    const { port, calls } = fakeRender({ Hugboar1: 4050, Hugboar2: 1200 }, ['Hugboar2']);
    expect(await h.ensure(port, docAt(5))).toEqual(new Map([['Hugboar1', 4050]]));
    expect(calls).toEqual(['Hugboar1', 'Hugboar2']);
    // Kedua kali: Hugboar1 sudah tercatat, hanya Hugboar2 (gagal sebelumnya) dicoba lagi.
    await h.ensure(port, docAt(5));
    expect(calls).toEqual(['Hugboar1', 'Hugboar2', 'Hugboar2']);
  });

  it('heightOf: angka apa adanya; hug = terukur atau undefined', () => {
    const known = new Map([['Hugboar1', 4050]]);
    expect(HugHeights.heightOf({ id: 'Fixedbr1', height: 900 }, known)).toBe(900);
    expect(HugHeights.heightOf({ id: 'Hugboar1', height: 'hug' }, known)).toBe(4050);
    expect(HugHeights.heightOf({ id: 'Hugboar2', height: 'hug' }, known)).toBeUndefined();
  });
});
