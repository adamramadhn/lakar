// Logika murni kelola file + routing hash viewer. Slugify viewer harus sama dengan daemon (sumber kebenaran).
import { describe, expect, it } from 'vitest';
import { slugify as daemonSlugify, withSuffix as daemonWithSuffix } from '../../daemon/src/files.ts';
import { byName, docHash, docLink, parseRoute, previewSlug, slugify, validSize, withSuffix } from './files.ts';

describe('slugify (pratinjau = daemon)', () => {
  const names = ['My Landing', '  Café — Menu 2  ', '--a__b--', '!!!', '', 'Ünïcödé Ñame', 'x'.repeat(80), `a${'-'.repeat(70)}b`, 'Landing 2026 / v2'];
  it.each(names)('%j', (name) => {
    expect(slugify(name)).toBe(daemonSlugify(name));
  });
  it('contoh spec', () => {
    expect(slugify('My Landing')).toBe('my-landing');
    expect(slugify('!!!')).toBe('');
  });
  it('withSuffix sama dengan daemon', () => {
    for (const [b, n] of [['a', 1], ['a', 2], ['x'.repeat(64), 12], [`${'y'.repeat(62)}-z`, 3]] as const) expect(withSuffix(b, n)).toBe(daemonWithSuffix(b, n));
  });
});

describe('previewSlug', () => {
  it('bentrok → -2, -3; nama tidak valid → kosong', () => {
    expect(previewSlug('My Landing', new Set())).toBe('my-landing');
    expect(previewSlug('My Landing', new Set(['my-landing']))).toBe('my-landing-2');
    expect(previewSlug('My Landing', new Set(['my-landing', 'my-landing-2']))).toBe('my-landing-3');
    expect(previewSlug('!!!', new Set())).toBe('');
  });
});

describe('validSize', () => {
  it('bilangan bulat 1..10000', () => {
    expect([1, 10000, 375].every(validSize)).toBe(true);
    expect([0, 10001, 1.5, Number.NaN, -3].some(validSize)).toBe(false);
  });
});

describe('parseRoute', () => {
  it.each([
    ['', { name: 'recents' }],
    ['#/', { name: 'recents' }],
    ['#/files', { name: 'files' }],
    ['#/files/', { name: 'files' }],
    ['#/archive', { name: 'archive' }],
    ['#/settings/connections', { name: 'connections' }],
    ['#/d/my-landing', { name: 'viewer', slug: 'my-landing' }],
    ['#/d/%E0%A4%A', { name: 'recents' }],
    ['#/unknown', { name: 'recents' }],
  ])('%j', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });
  it('docHash bolak-balik', () => {
    expect(parseRoute(docHash('a-b'))).toEqual({ name: 'viewer', slug: 'a-b' });
  });
});

describe('docLink / byName', () => {
  it('tautan loopback ke viewer', () => {
    expect(docLink(7466, 'my-landing')).toBe('http://127.0.0.1:7466/app/#/d/my-landing');
  });
  it('urut nama', () => {
    expect(byName([{ slug: 'b' }, { slug: 'a' }, { slug: 'a-2' }]).map((d) => d.slug)).toEqual(['a', 'a-2', 'b']);
  });
});
