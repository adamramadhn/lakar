// Data path SVG (AD-14): parse semua perintah (relatif, implisit, angka rapat, eksponen, flag arc rapat),
// serializer, transform afin, arc → kubik, dan kotak batas.
import { describe, expect, it } from 'vitest';
import { PathDataError, arcToCubics, multiply, parsePath, pathBounds, serializePath, transformPath } from './path-data.js';

describe('parsePath', () => {
  it('perintah absolut/relatif dinormalkan; H/V → L; lineto implisit sesudah M', () => {
    expect(serializePath(parsePath('M10 10h5v5H0V0z m1 1 2 2'))).toBe('M10 10L15 10L15 15L0 15L0 0ZM11 11L13 13');
  });

  it('angka rapat, eksponen, dan flag arc rapat', () => {
    expect(parsePath('M1.5.5L-1e1,2e-1')).toEqual([
      { cmd: 'M', args: [1.5, 0.5] },
      { cmd: 'L', args: [-10, 0.2] },
    ]);
    expect(parsePath('M0 0a5 5 0 104 4')[1]).toEqual({ cmd: 'A', args: [5, 5, 0, 1, 0, 4, 4] });
  });

  it('S/T memantulkan titik kendali', () => {
    expect(serializePath(parsePath('M0 0C0 10 10 10 10 0S20-10 20 0'))).toBe('M0 0C0 10 10 10 10 0C10 -10 20 -10 20 0');
    expect(serializePath(parsePath('M0 0Q5 10 10 0T20 0'))).toBe('M0 0Q5 10 10 0Q15 -10 20 0');
  });

  it('error: kosong, tidak diawali M, argumen kurang, karakter asing, flag arc salah', () => {
    for (const bad of ['', 'L0 0', 'M0', 'M0 0L1', 'M0 0 X', 'M0 0A1 1 0 2 0 1 1', 'M1e999 0']) expect(() => parsePath(bad), bad).toThrow(PathDataError);
  });

  it('d besar (≈1 MB) diurai linear', () => {
    const d = 'M0 0' + 'L1.25 2.5'.repeat(110_000);
    const t0 = performance.now();
    expect(parsePath(d)).toHaveLength(110_001);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe('transform dan arc', () => {
  it('transformPath menerapkan matriks; arc menjadi kubik dengan titik ujung tepat', () => {
    const m = multiply([1, 0, 0, 1, 2, 2], [2, 0, 0, 2, 0, 0]);
    expect(serializePath(transformPath(parsePath('M0 0L5 0'), m))).toBe('M2 2L12 2');
    const segs = transformPath(parsePath('M0 0A10 10 0 0 1 20 0'), [1, 0, 0, 1, 0, 0]);
    expect(segs.every((s) => s.cmd !== 'A')).toBe(true);
    expect(segs.at(-1)!.args.slice(-2)).toEqual([20, 0]);
  });

  it('arcToCubics: radius 0 → garis; titik sama → kosong; setengah lingkaran 2 kubik', () => {
    expect(arcToCubics([0, 0], [0, 5, 0, 0, 1, 10, 0])).toEqual([{ cmd: 'L', args: [10, 0] }]);
    expect(arcToCubics([1, 1], [5, 5, 0, 0, 1, 1, 1])).toEqual([]);
    const half = arcToCubics([0, 0], [10, 10, 0, 0, 1, 20, 0]);
    expect(half).toHaveLength(2);
    // Titik tengah busur (sweep 1 dari kiri ke kanan) berada di y = -10.
    expect(half[0]!.args[5]).toBeCloseTo(-10);
  });

  it('pathBounds dari titik ujung dan kendali', () => {
    expect(pathBounds(parsePath('M10 20L30 60'))).toEqual([10, 20, 20, 40]);
  });
});
