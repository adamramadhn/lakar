import { describe, expect, it } from 'vitest';
import { max, median, min, summarize } from './stats.js';

describe('stats', () => {
  it('median/min/maks', () => {
    expect(median([90, 120, 100])).toBe(100);
    expect(median([1, 3])).toBe(2);
    expect(median([])).toBeUndefined();
    expect(min([90, 120, 100])).toBe(90);
    expect(max([90, 120, 100])).toBe(120);
    expect(summarize([90, 120, 100])).toEqual({ n: 3, median: 100, min: 90, max: 120 });
  });
});
