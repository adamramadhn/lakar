import { describe, expect, it } from 'vitest';
import { seededRandom } from './index.js';

describe('seededRandom', () => {
  it('seed sama → urutan identik (kontrak replay sync)', () => {
    const a = seededRandom('lakar-sync:room-token:1');
    const b = seededRandom('lakar-sync:room-token:1');
    const seqA = Array.from({ length: 64 }, () => a());
    const seqB = Array.from({ length: 64 }, () => b());
    expect(seqB).toEqual(seqA);
  });

  it('seed beda → urutan beda', () => {
    const seqA = Array.from({ length: 16 }, seededRandom('lakar-sync:room:1'));
    const seqB = Array.from({ length: 16 }, seededRandom('lakar-sync:room:2'));
    expect(seqB).not.toEqual(seqA);
  });

  it('nilai selalu dalam [0,1)', () => {
    const r = seededRandom('uji');
    for (let i = 0; i < 2000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('seed kosong tetap deterministik', () => {
    const a = Array.from({ length: 8 }, seededRandom(''));
    const b = Array.from({ length: 8 }, seededRandom(''));
    expect(b).toEqual(a);
    expect(a.some((v) => v !== a[0])).toBe(true);
  });
});
