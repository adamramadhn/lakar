import { describe, expect, it } from 'vitest';
import {
  changeColor,
  formatNumber,
  formatPadding,
  formatPercent,
  formatShadow,
  isTokenRef,
  joinHex,
  parseHex,
  parseNumber,
  parsePadding,
  parsePercent,
  parseShadow,
  sameValue,
  splitHex,
  withHex,
} from './designValues.js';

describe('designValues', () => {
  it('parseNumber: angka, px, batas, int; teks tak valid → undefined', () => {
    expect(parseNumber('320')).toBe(320);
    expect(parseNumber(' 12px ')).toBe(12);
    expect(parseNumber('-1.5')).toBe(-1.5);
    expect(parseNumber('.5')).toBe(0.5);
    expect(parseNumber('abc')).toBeUndefined();
    expect(parseNumber('')).toBeUndefined();
    expect(parseNumber('-3', { min: 0 })).toBeUndefined();
    expect(parseNumber('2.6', { int: true })).toBe(3);
    expect(parseNumber('1000', { max: 900 })).toBeUndefined();
    expect(formatNumber(1.236)).toBe('1.24');
    expect(formatNumber(12)).toBe('12');
  });

  it('persen: 50% / 50 → 0.5, di-clamp', () => {
    expect(parsePercent('50%')).toBe(0.5);
    expect(parsePercent('50')).toBe(0.5);
    expect(parsePercent('150')).toBe(1);
    expect(parsePercent('-4')).toBe(0);
    expect(parsePercent('x')).toBeUndefined();
    expect(formatPercent(0.2)).toBe('20%');
  });

  it('hex: 3/6/8 digit, dengan/tanpa #, huruf besar; alpha split/join', () => {
    expect(parseHex('#1a1a1a')).toBe('#1A1A1A');
    expect(parseHex('0f0')).toBe('#00FF00');
    expect(parseHex('11223380')).toBe('#11223380');
    expect(parseHex('zzz')).toBeUndefined();
    expect(parseHex('#12345')).toBeUndefined();
    expect(splitHex('#11223380')).toEqual({ hex: '112233', alpha: 0.5 });
    expect(splitHex('#FFFFFF')).toEqual({ hex: 'FFFFFF', alpha: 1 });
    expect(splitHex({ $token: 'c' })).toBeUndefined();
    expect(joinHex('112233', 0.5)).toBe('#11223380');
    expect(joinHex('#abcdef', 1)).toBe('#ABCDEF');
    expect(withHex('#00000080', 'fff')).toBe('#FFFFFF80');
    expect(withHex('#000000', '#12345678')).toBe('#12345678');
  });

  it('padding: 1/2/4 nilai; 3 nilai/negatif → undefined; format', () => {
    expect(parsePadding('8')).toBe(8);
    expect(parsePadding('8 16')).toEqual([8, 16]);
    expect(parsePadding('1, 2, 3, 4')).toEqual([1, 2, 3, 4]);
    expect(parsePadding('1 2 3')).toBeUndefined();
    expect(parsePadding('-1')).toBeUndefined();
    expect(parsePadding('a b')).toBeUndefined();
    expect(formatPadding([8, 16])).toBe('8 16');
    expect(formatPadding(undefined)).toBe('0');
    expect(formatPadding([{ $token: 'space.2' }, 4])).toBe('$space.2 4');
    // Sisi bertoken bertahan saat sisi lain diedit (format → parse bolak-balik).
    expect(parsePadding('$space.2 8')).toEqual([{ $token: 'space.2' }, 8]);
    expect(parsePadding('$Bad 8')).toBeUndefined();
  });

  it('changeColor/withHex: byte alpha disalin apa adanya; alpha mengganti RGB tetap; prev bukan hex', () => {
    expect(withHex('#11223381', '445566')).toBe('#44556681');
    expect(changeColor('#11223381', { hex: 'abc' })).toBe('#AABBCC81');
    expect(changeColor('#112233', { alpha: 0.5 })).toBe('#11223380');
    expect(changeColor(undefined, { alpha: 0.5 })).toBe('#00000080');
    expect(changeColor({ $token: 'c' }, { hex: 'fff' })).toBe('#FFFFFF');
    expect(changeColor('#112233', { hex: 'zz' })).toBeUndefined();
    expect(changeColor('#112233', {})).toBeUndefined();
  });

  it('shadow: [drop|inner] x y blur [spread]', () => {
    expect(parseShadow('Inner 0 2 6 1')).toEqual({ type: 'inner', x: 0, y: 2, blur: 6, spread: 1 });
    expect(parseShadow('0 8 24')).toEqual({ type: 'drop', x: 0, y: 8, blur: 24 });
    expect(parseShadow('0 8 24', 'inner')?.type).toBe('inner');
    expect(parseShadow('0 8')).toBeUndefined();
    expect(parseShadow('0 8 -2')).toBeUndefined();
    expect(formatShadow({ type: 'drop', x: 0, y: 8, blur: 24 })).toBe('Drop  0 8 24');
    expect(formatShadow({ type: 'inner', x: 0, y: 1, blur: 0, spread: 2 })).toBe('Inner  0 1 0 2');
  });

  it('isTokenRef dan sameValue', () => {
    expect(isTokenRef({ $token: 'a' })).toBe(true);
    expect(isTokenRef(['a'])).toBe(false);
    expect(sameValue([1, { a: 2 }], [1, { a: 2 }])).toBe(true);
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
    expect(sameValue(1, '1')).toBe(false);
  });
});
