// Pengelompokan History per hari dengan `now` tetap (waktu lokal).
import { describe, expect, it } from 'vitest';
import { dayLabel, groupByDay } from './history.ts';

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
