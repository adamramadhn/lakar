// Pengelompokan History per hari dengan `now` tetap (waktu lokal).
import { describe, expect, it } from 'vitest';
import { canRestore, changedBoards, comparePair, dayLabel, groupByDay, hasVersion, previewLabel } from './history.ts';

/** 1 Maret 2026 10:00 waktu lokal: hari sebelumnya melintasi batas bulan (28 Februari). */
const NOW = new Date(2026, 2, 1, 10, 0, 0);
const local = (m: number, d: number, h = 12) => new Date(2026, m, d, h, 0, 0).toISOString();

describe('dayLabel', () => {
  it('hari yang sama → Today', () => {
    expect(dayLabel(local(2, 1, 0), NOW)).toBe('Today');
    expect(dayLabel(local(2, 1, 23), NOW)).toBe('Today');
  });
  it('hari kalender sebelumnya melintasi batas bulan → Yesterday', () => {
    expect(dayLabel(local(1, 28, 23), NOW)).toBe('Yesterday');
    expect(dayLabel(local(1, 28, 0), NOW)).toBe('Yesterday');
  });
  it('lebih lama → label tanggal', () => {
    const at = local(1, 27);
    const label = dayLabel(at, NOW);
    expect(label).not.toMatch(/^(Today|Yesterday)$/);
    expect(label).toBe(new Date(at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }));
  });
  it('tidak valid → Unknown date', () => {
    expect(dayLabel('bukan tanggal', NOW)).toBe('Unknown date');
  });
});

describe('groupByDay', () => {
  it('entri turun lintas hari → grup berurutan, urutan entri terjaga', () => {
    const entries = [
      { rev: 5, at: local(2, 1, 9) },
      { rev: 4, at: local(2, 1, 8) },
      { rev: 3, at: local(1, 28, 20) },
      { rev: 2, at: local(1, 20) },
      { rev: 1, at: local(1, 20, 8) },
    ];
    const groups = groupByDay(entries, NOW);
    expect(groups.map((g) => [g.label, g.entries.map((e) => e.rev)])).toEqual([
      ['Today', [5, 4]],
      ['Yesterday', [3]],
      [dayLabel(local(1, 20), NOW), [2, 1]],
    ]);
  });
});

describe('ketersediaan versi (snapshot)', () => {
  const e = (rev: number, snapshot?: boolean) => ({ rev, at: local(2, 1, 9), description: `rev ${rev}`, ...(snapshot !== undefined ? { snapshot } : {}) });
  it('pratinjau/Compare: ada snapshot atau rev terkini; Restore: hanya versi lama bersnapshot', () => {
    expect(hasVersion(e(3, true), 7)).toBe(true);
    expect(hasVersion(e(3), 7)).toBe(false);
    expect(hasVersion(e(7), 7)).toBe(true);
    expect(canRestore(e(3, true), 7)).toBe(true);
    expect(canRestore(e(3, false), 7)).toBe(false);
    expect(canRestore(e(7, true), 7)).toBe(false);
  });
  it('comparePair: Before = entri tepat sebelumnya bila terbaca', () => {
    const list = [e(7, true), e(6, true), e(5), e(4, true)];
    expect(comparePair(list, list[0]!, 7)).toEqual({ before: 6, after: 7 });
    expect(comparePair(list, list[1]!, 7)).toEqual({ after: 6 });
    expect(comparePair(list, list[3]!, 7)).toEqual({ after: 4 });
  });
  it('previewLabel: jam · deskripsi; tanpa jam → rev', () => {
    expect(previewLabel(e(3, true), () => '14:29')).toBe('Previewing 14:29 · rev 3');
    expect(previewLabel({ ...e(3, true), description: 'Tightened headline tracking' }, () => '')).toBe('Previewing r3 · Tightened headline tracking');
  });
});

describe('changedBoards', () => {
  const doc = (boards: { id: string; name: string; w?: number }[]) => ({ pages: [{ children: boards.map((b) => ({ id: b.id, name: b.name, width: b.w ?? 100 })) }] });
  it('berubah, baru, dan dihapus per board; board sama dilewati', () => {
    const before = doc([{ id: 'A', name: 'Home' }, { id: 'B', name: 'About' }, { id: 'C', name: 'Old' }]);
    const after = doc([{ id: 'A', name: 'Home', w: 200 }, { id: 'B', name: 'About' }, { id: 'D', name: 'New' }]);
    expect(changedBoards(before, after)).toEqual([
      { id: 'A', name: 'Home', change: 'changed' },
      { id: 'D', name: 'New', change: 'added' },
      { id: 'C', name: 'Old', change: 'removed' },
    ]);
  });
  it('tanpa Before → semua board After baru; versi identik → kosong', () => {
    const a = doc([{ id: 'A', name: 'Home' }]);
    expect(changedBoards(undefined, a)).toEqual([{ id: 'A', name: 'Home', change: 'added' }]);
    expect(changedBoards(a, doc([{ id: 'A', name: 'Home' }]))).toEqual([]);
  });
});
