// Tinggi board hug di viewer (spec-board-hug-height): murni.
import { describe, expect, it } from 'vitest';
import { HUG_PENDING_HEIGHT, measuredBoards, withHeight } from './boardHeight.js';
import { resizeOp, type GeoNode } from './gesture.js';

describe('boardHeight', () => {
  const fixed = { id: 'Fixedbr1', name: 'App', x: 0, y: 0, width: 1440, height: 900 };
  const hug = { id: 'Hugboar1', name: 'Landing', x: 1520, y: 0, width: 1440, height: 'hug' as const };

  it('measuredBoards: hug → tinggi terukur + hug:true; belum terukur → HUG_PENDING_HEIGHT; fixed = objek yang sama', () => {
    const [f, h] = measuredBoards([fixed, hug], new Map([['Hugboar1', 4050]]));
    expect(f).toBe(fixed);
    expect(h).toEqual({ ...hug, height: 4050, hug: true });
    expect(measuredBoards([hug], new Map())[0]).toMatchObject({ height: HUG_PENDING_HEIGHT, hug: true });
  });

  it('withHeight: peta sama bila nilai tidak berubah (dibulatkan 0,01); nilai baru → peta baru', () => {
    const m = new Map([['Hugboar1', 4050]]);
    expect(withHeight(m, 'Hugboar1', 4050.001)).toBe(m);
    const next = withHeight(m, 'Hugboar1', 4400.5);
    expect(next).not.toBe(m);
    expect(next.get('Hugboar1')).toBe(4400.5);
    expect(withHeight(m, 'Hugboar1', Number.NaN)).toBe(m);
  });

  // Seret handle board hug (Figma/open-pencil): hanya sumbu yang berubah yang menjadi fixed.
  const node: GeoNode = { id: 'Hugboar1', type: 'board', name: 'Landing', box: { x: 0, y: 0, w: 1440, h: 4050 }, parentId: undefined, absolute: true, x: 0, y: 0, layout: 'column', children: [] };
  it("handle bawah → height angka (hug jadi fixed); handle kanan saja → tinggi tidak dikirim (tetap hug)", () => {
    expect(resizeOp(node, node.box, { ...node.box, h: 4200 })).toEqual({ op: 'update', id: 'Hugboar1', patch: { height: 4200 } });
    expect(resizeOp(node, node.box, { ...node.box, w: 1500 })).toEqual({ op: 'update', id: 'Hugboar1', patch: { width: 1500 } });
  });
});
