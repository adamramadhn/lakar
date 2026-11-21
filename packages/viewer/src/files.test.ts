// Logika murni kelola file + routing hash viewer. Slugify viewer harus sama dengan daemon (sumber kebenaran).
import { describe, expect, it } from 'vitest';
import { slugify as daemonSlugify, withSuffix as daemonWithSuffix } from '../../daemon/src/files.ts';
import { byEdited, byName, CONNECTIONS_HASH, docHash, docLink, fileErrorText, folderHash, folderMeta, inFolder, parseRoute, parseSort, previewSlug, searchDocs, SETTINGS_HASH, slugify, sortDocs, validSize, withSuffix, wrapIndex } from './files.ts';

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

describe('sortDocs (halaman Files: Last edited / Name)', () => {
  const docs = [
    { slug: 'b', updatedAt: '2026-11-20T10:00:00.000Z' },
    { slug: 'a', updatedAt: '2026-11-21T10:00:00.000Z' },
    { slug: 'c', updatedAt: '2026-11-21T10:00:00.000Z' },
  ];
  it('edited: terbaru dulu, seri diurut nama; name: abjad', () => {
    expect(byEdited(docs).map((d) => d.slug)).toEqual(['a', 'c', 'b']);
    expect(sortDocs(docs, 'edited').map((d) => d.slug)).toEqual(['a', 'c', 'b']);
    expect(sortDocs(docs, 'name').map((d) => d.slug)).toEqual(['a', 'b', 'c']);
  });
  it('parseSort: nilai tidak dikenal → edited', () => {
    expect(parseSort('name')).toBe('name');
    expect(parseSort('edited')).toBe('edited');
    expect(parseSort(null)).toBe('edited');
    expect(parseSort('size')).toBe('edited');
  });
});

describe('fileErrorText: pesan daemon (bahasa Indonesia) tidak tampil di UI', () => {
  const apiError = (code: string, message: string, retryable = false) => Object.assign(new Error(message), { code, retryable });
  const fallback = (e: unknown) => `fallback:${(e as Error).message}`;
  const indonesian = /dokumen|sudah|tidak|arsip|pilih|kesalahan/;
  it.each([
    ['rename', apiError('CONFLICT', 'dokumen pricing sudah ada'), 'A file named “pricing” already exists. Choose another name.'],
    ['rename', apiError('CONFLICT', 'dokumen pricing sudah ada di arsip'), 'An archived file is already named “pricing”. Choose another name, or delete it from Archive first.'],
    ['unarchive', apiError('CONFLICT', 'dokumen pricing sudah ada'), 'A file named “pricing” is already in your files. Rename or delete it first, then unarchive.'],
    ['duplicate', apiError('CONFLICT', 'dokumen pricing-copy baru saja dibuat', true), 'Another file with this name was just created. Try again.'],
    ['delete', apiError('NOT_FOUND', 'dokumen pricing tidak ada'), '“pricing” no longer exists. It may have been renamed or deleted in another window.'],
    ['move', apiError('NOT_FOUND', 'folder f1 tidak ada'), 'This folder or file no longer exists. It may have been deleted in another window.'],
    ['archive', apiError('EXEC_ERROR', 'kesalahan internal daemon: EPERM: operation not permitted, rename', true), 'Lakar couldn’t save this change (EPERM: operation not permitted, rename). Try again.'],
    ['create', apiError('SCHEMA_INVALID', 'name: nama tidak valid'), 'That name or size isn’t valid. Use letters or numbers, and board sizes from 1 to 10000 px.'],
    ['archive', apiError('RENDER_FAILED', 'render gagal'), 'Something went wrong (RENDER_FAILED). Try again.'],
  ] as const)('%s %#', (op, e, text) => {
    const out = fileErrorText(e, op, 'pricing', fallback);
    expect(out).toBe(text);
    expect(out).not.toMatch(indonesian);
  });
  it('tanpa kode (jaringan/offline) → fallback; copy tanpa kode → pesan clipboard', () => {
    expect(fileErrorText(new Error('Failed to fetch'), 'rename', 'a', fallback)).toBe('fallback:Failed to fetch');
    expect(fileErrorText(new Error('clipboard tidak tersedia'), 'copy', 'a', fallback)).toBe('Couldn’t copy to the clipboard. Select the text and copy it manually.');
  });
});
