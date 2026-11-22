// Kontrol vektor panel Design (epic paste-vektor story 2, AD-14; desain J7AmQi/S8w37): parser Dash/Miter dan op update.
import { describe, expect, it } from 'vitest';
import { formatDash, isVectorSelection, parseDash, parseMiter, readField, setVector, vectorValue, type DesignTarget, type Raw } from './designModel.js';

const t = (id: string, type: string, stored: Raw = {}): DesignTarget => ({
  id,
  type,
  name: id,
  stored: { id, type, name: id, ...stored },
  resolved: { id, type, name: id, ...stored },
  parentLayout: 'none',
});
const patches = (ops: unknown[]) => ops.map((o) => (o as { id: string; patch: Raw }).patch);

describe('kontrol vektor', () => {
  it('hanya untuk seleksi yang semuanya path', () => {
    expect(isVectorSelection([t('a', 'path')])).toBe(true);
    expect(isVectorSelection([t('a', 'path'), t('b', 'rect')])).toBe(false);
    expect(isVectorSelection([])).toBe(false);
  });

  it.each([
    ['4 2', [4, 2]],
    ['4, 2', [4, 2]],
    [' 1.5 ,0.5  3 ', [1.5, 0.5, 3]],
    ['', null],
    ['none', null],
    ['0', null],
    ['0 0', null],
    ['abc', undefined],
    ['-1 2', undefined],
    ['4, 2,', [4, 2]],
    [Array.from({ length: 17 }, () => '1').join(' '), undefined],
  ])('parseDash(%j) → %j', (text, out) => {
    expect(parseDash(text)).toEqual(out);
  });

  it('formatDash dan parseMiter', () => {
    expect(formatDash([4, 2])).toBe('4 2');
    expect(formatDash(undefined)).toBe('');
    expect(parseMiter('8')).toBe(8);
    expect(parseMiter('0.5')).toBeUndefined();
    expect(parseMiter('101')).toBeUndefined();
  });

  it('nilai kosong tampil sebagai bawaan (Butt, Miter, 4, Nonzero)', () => {
    const n = t('a', 'path');
    expect(readField([n], (x) => vectorValue(x, 'strokeLinecap'))).toMatchObject({ value: 'butt' });
    expect(readField([n], (x) => vectorValue(x, 'strokeLinejoin'))).toMatchObject({ value: 'miter' });
    expect(readField([n], (x) => vectorValue(x, 'strokeMiterlimit'))).toMatchObject({ value: 4 });
    expect(readField([n], (x) => vectorValue(x, 'fillRule'))).toMatchObject({ value: 'nonzero' });
    expect(readField([n, t('b', 'path', { strokeLinecap: 'round' })], (x) => vectorValue(x, 'strokeLinecap'))).toEqual({ mixed: true });
  });

  it('setiap kontrol menulis satu properti bertipe ke setiap path (satu commit per edit)', () => {
    const ts = [t('a', 'path'), t('b', 'path', { strokeLinecap: 'round' })];
    expect(patches(setVector(ts, 'strokeLinecap', 'round'))).toEqual([{ strokeLinecap: 'round' }]);
    expect(patches(setVector(ts, 'strokeLinejoin', 'bevel'))).toEqual([{ strokeLinejoin: 'bevel' }, { strokeLinejoin: 'bevel' }]);
    expect(patches(setVector(ts, 'strokeDasharray', [4, 2]))).toEqual([{ strokeDasharray: [4, 2] }, { strokeDasharray: [4, 2] }]);
    expect(patches(setVector(ts, 'strokeMiterlimit', 8))).toEqual([{ strokeMiterlimit: 8 }, { strokeMiterlimit: 8 }]);
    expect(patches(setVector(ts, 'fillRule', 'evenodd'))).toEqual([{ fillRule: 'evenodd' }, { fillRule: 'evenodd' }]);
    expect(patches(setVector([t('a', 'path', { strokeDasharray: [1] })], 'strokeDasharray', null))).toEqual([{ strokeDasharray: null }]);
  });
});
