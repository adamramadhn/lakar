// Snap bottom sheet dan geometri pinch: matriks I/O spec aplikasi 9.
import { describe, expect, it } from 'vitest';
import { grabberTap, pinchCamera, pointerIntent, sheetForTab, sheetHeights, snapSheet } from './sheet.ts';

describe('sheetHeights', () => {
  it('viewer 756: collapsed 54, half 356, full 748', () => {
    expect(sheetHeights(756)).toEqual({ collapsed: 54, half: 356, full: 748 });
  });
  it('viewer pendek: half = 50%', () => {
    expect(sheetHeights(500).half).toBe(250);
  });
});

describe('snapSheet', () => {
  it('lepas dekat state → state itu', () => {
    expect(snapSheet(60, 756)).toBe('collapsed');
    expect(snapSheet(330, 756)).toBe('half');
    expect(snapSheet(700, 756)).toBe('full');
  });
  it('titik tengah collapsed–half: seri → yang lebih rendah', () => {
    expect(snapSheet((54 + 356) / 2, 756)).toBe('collapsed');
  });
  it('tarik melewati batas → state ujung', () => {
    expect(snapSheet(-40, 756)).toBe('collapsed');
    expect(snapSheet(2000, 756)).toBe('full');
  });
});

describe('pinchCamera', () => {
  const cam = { x: 10, y: 20, z: 1 };
  it('jari menjauh 2× → zoom 2× di titik tengah', () => {
    const c = pinchCamera(cam, { x: 90, y: 100 }, { x: 110, y: 100 }, { x: 80, y: 100 }, { x: 120, y: 100 });
    expect(c.z).toBe(2);
    // Titik dokumen di bawah titik tengah (100, 100) tetap di sana: (100 − x) / z sama sebelum dan sesudah.
    expect((100 - c.x) / c.z).toBe((100 - cam.x) / cam.z);
    expect((100 - c.y) / c.z).toBe((100 - cam.y) / cam.z);
  });
  it('dua jari bergeser tanpa mengubah jarak → pan saja', () => {
    const c = pinchCamera(cam, { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 30, y: 15 }, { x: 80, y: 15 });
    expect(c).toEqual({ x: 40, y: 35, z: 1 });
  });
  it('zoom dijepit clamp, titik tengah tetap berlabuh', () => {
    const c = pinchCamera(cam, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 1000, y: 0 }, (z) => Math.min(8, z));
    expect(c.z).toBe(8);
    expect((5 - cam.x) / cam.z).toBeCloseTo((500 - c.x) / c.z);
  });
  it('jari di titik sama (jarak 0) → zoom tidak berubah', () => {
    expect(pinchCamera(cam, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }).z).toBe(1);
  });
  it('jari bertemu (jarak akhir 0) → zoom tidak jadi 0', () => {
    expect(pinchCamera(cam, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 0 }).z).toBe(1);
  });
});

describe('pointerIntent', () => {
  const base = { touch: false, tool: 'select', spaceHeld: false, button: 0 };
  it('sentuh + Select → pan dan tap', () => {
    expect(pointerIntent({ ...base, touch: true })).toEqual({ pan: true, tap: true, slop: 8 });
  });
  it('sentuh + Hand → pan tanpa tap', () => {
    expect(pointerIntent({ ...base, touch: true, tool: 'hand' })).toEqual({ pan: true, tap: false, slop: 8 });
  });
  it('sentuh + tool sisip → tap saja', () => {
    expect(pointerIntent({ ...base, touch: true, tool: 'rect' })).toEqual({ pan: false, tap: true, slop: 8 });
  });
  it('mouse + Select → tap saja', () => {
    expect(pointerIntent(base)).toEqual({ pan: false, tap: true, slop: 3 });
  });
  it('mouse tombol tengah → pan saja', () => {
    expect(pointerIntent({ ...base, button: 1 })).toEqual({ pan: true, tap: false, slop: 3 });
  });
  it('Space ditahan → pan saja', () => {
    expect(pointerIntent({ ...base, spaceHeld: true })).toEqual({ pan: true, tap: false, slop: 3 });
  });
});

describe('sheetForTab', () => {
  it('collapsed → half, lainnya tetap', () => {
    expect(sheetForTab('collapsed')).toBe('half');
    expect(sheetForTab('half')).toBe('half');
    expect(sheetForTab('full')).toBe('full');
  });
});

describe('grabberTap', () => {
  it('collapsed ↔ half, full → half', () => {
    expect(grabberTap('collapsed')).toBe('half');
    expect(grabberTap('half')).toBe('collapsed');
    expect(grabberTap('full')).toBe('half');
  });
});
