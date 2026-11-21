// Panel Pages (aplikasi 8): halaman aktif dilacak per ID, tetangga saat dihapus, dan indeks jatuh drag.
import { describe, expect, it } from 'vitest';
import { dropTarget, resolvePageIndex } from './pages.ts';

const pages = (...ids: string[]) => ids.map((id) => ({ id }));

describe('resolvePageIndex', () => {
  it('per ID: tetap sama setelah reorder', () => {
    expect(resolvePageIndex(pages('A', 'B', 'C'), 'B', 1)).toBe(1);
    expect(resolvePageIndex(pages('B', 'A', 'C'), 'B', 1)).toBe(0);
  });
  it('dihapus → sebelumnya, atau berikutnya bila halaman pertama', () => {
    expect(resolvePageIndex(pages('A', 'C'), 'B', 1)).toBe(0);
    expect(resolvePageIndex(pages('B', 'C'), 'A', 0)).toBe(0);
    expect(resolvePageIndex(pages('A', 'B'), 'C', 2)).toBe(1);
  });
  it('tanpa ID → indeks tersimpan (dibatasi)', () => {
    expect(resolvePageIndex(pages('A', 'B'), undefined, 1)).toBe(1);
    expect(resolvePageIndex(pages('A'), undefined, 4)).toBe(0);
    expect(resolvePageIndex([], 'A', 3)).toBe(0);
  });
});

describe('dropTarget', () => {
  it('celah sebelum/sesudah baris asal → tidak berubah; lainnya indeks akhir', () => {
    expect(dropTarget(1, 1)).toBeUndefined();
    expect(dropTarget(1, 2)).toBeUndefined();
    expect(dropTarget(2, 0)).toBe(0);
    expect(dropTarget(0, 3)).toBe(2);
    expect(dropTarget(0, 2)).toBe(1);
  });
});
