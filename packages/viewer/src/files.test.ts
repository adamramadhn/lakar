// Logika murni kelola file + routing hash viewer. Slugify viewer harus sama dengan daemon (sumber kebenaran).
import { describe, expect, it } from 'vitest';
import { slugify as daemonSlugify, withSuffix as daemonWithSuffix } from '../../daemon/src/files.ts';
import { byName, CONNECTIONS_HASH, docHash, docLink, folderHash, folderMeta, inFolder, parseRoute, previewSlug, searchDocs, SETTINGS_HASH, slugify, validSize, withSuffix, wrapIndex } from './files.ts';

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
    ['#/files/fabc1234567', { name: 'files', folder: 'fabc1234567' }],
    ['#/files/fabc1234567/', { name: 'files', folder: 'fabc1234567' }],
    ['#/files/zzz', { name: 'files', folder: 'zzz' }],
    ['#/files/%E0%A4%A', { name: 'files' }],
    ['#/files/a/b', { name: 'recents' }],
    ['#/archive', { name: 'archive' }],
    ['#/settings/connections', { name: 'connections' }],
    ['#/settings/connections/', { name: 'connections' }],
    ['#/settings', { name: 'settings' }],
    ['#/settings/', { name: 'settings' }],
    ['#/settings/general', { name: 'settings' }],
    ['#/settings/other', { name: 'recents' }],
    ['#/d/my-landing', { name: 'viewer', slug: 'my-landing' }],
    ['#/d/%E0%A4%A', { name: 'recents' }],
    ['#/unknown', { name: 'recents' }],
  ])('%j', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });
  it('konstanta hash Settings', () => {
    expect(parseRoute(SETTINGS_HASH)).toEqual({ name: 'settings' });
    expect(parseRoute(CONNECTIONS_HASH)).toEqual({ name: 'connections' });
  });
  it('docHash bolak-balik', () => {
    expect(parseRoute(docHash('a-b'))).toEqual({ name: 'viewer', slug: 'a-b' });
  });
  it('folderHash bolak-balik; tanpa id → Files', () => {
    expect(parseRoute(folderHash('fabc1234567'))).toEqual({ name: 'files', folder: 'fabc1234567' });
    expect(folderHash()).toBe('#/files');
    expect(folderHash(null)).toBe('#/files');
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

describe('searchDocs', () => {
  const docs = ['creative-waterfall', 'scratchpad', 'welcome-to-paper', 'waterfall-2', 'Wa-upper'].map((slug) => ({ slug }));
  it('cocok di slug, tidak peka huruf besar, urutan daftar', () => {
    expect(searchDocs(docs, 'wa').map((d) => d.slug)).toEqual(['creative-waterfall', 'waterfall-2', 'Wa-upper']);
    expect(searchDocs(docs, '  WA ').map((d) => d.slug)).toEqual(['creative-waterfall', 'waterfall-2', 'Wa-upper']);
  });
  it('query kosong / spasi → kosong; tanpa hasil → kosong', () => {
    expect(searchDocs(docs, '')).toEqual([]);
    expect(searchDocs(docs, '   ')).toEqual([]);
    expect(searchDocs(docs, 'pricing')).toEqual([]);
  });
  it('maksimal `limit` (default 8)', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ slug: `file-${i}` }));
    expect(searchDocs(many, 'file')).toHaveLength(8);
    expect(searchDocs(many, 'file', 3).map((d) => d.slug)).toEqual(['file-0', 'file-1', 'file-2']);
  });
});

describe('wrapIndex', () => {
  it('melingkar di kedua ujung', () => {
    expect(wrapIndex(0, 3, 1)).toBe(1);
    expect(wrapIndex(2, 3, 1)).toBe(0);
    expect(wrapIndex(0, 3, -1)).toBe(2);
    expect(wrapIndex(1, 3, -1)).toBe(0);
    expect(wrapIndex(0, 1, 1)).toBe(0);
  });
  it('n = 0 → 0', () => {
    expect(wrapIndex(0, 0, 1)).toBe(0);
    expect(wrapIndex(0, 0, -1)).toBe(0);
  });
});

describe('folderMeta / inFolder', () => {
  it('Empty, 1 file, N files', () => {
    expect(folderMeta(0)).toBe('Empty');
    expect(folderMeta(1)).toBe('1 file');
    expect(folderMeta(2)).toBe('2 files');
    expect(folderMeta(12)).toBe('12 files');
  });
  it('root = file tanpa folder; folder = anggotanya; urutan dipertahankan', () => {
    const docs = ['c', 'a', 'b', 'd'].map((slug) => ({ slug }));
    const membership = { a: 'f1', b: 'f2', d: 'f1', ghost: 'f1' };
    expect(inFolder(docs, membership, null).map((d) => d.slug)).toEqual(['c']);
    expect(inFolder(docs, membership, 'f1').map((d) => d.slug)).toEqual(['a', 'd']);
    expect(inFolder(docs, membership, 'f9')).toEqual([]);
  });
});
