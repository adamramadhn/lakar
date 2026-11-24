// Foto stok: SafeNet (SSRF), adaptor penyedia, dan PhotoService terhadap penyedia palsu lokal (tanpa jaringan).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { LakarError } from '@lakar/schema';
import { DEFAULT_ALLOWLIST, NetError, SafeNet, USER_AGENT, isBlockedIp } from './net.js';
import { PhotoService, cacheAge, queryLadder } from './service.js';
import { parseRef, plainText, rankWikimedia, wikimediaImportUrl, wikimediaLicenseClass, wikimediaScore, type WikimediaHit } from './providers.js';
import { imageSize, readAssetMeta } from '../assets.js';
import { OV_BY, OV_CC0, PEXELS_CASE, PHOTO_PNG, UNSPLASH, UNSPLASH_COLOR, UNSPLASH_PNG, UNSPLASH_RGB, WIKI, WIKI_PNG, startFakeProviders, type FakeProviders } from '../../../../tests/support/photos.ts';

const KEY = 'TESTKEYabcdef0123456789ZZZZsecretvalue00000000000000001';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

let fake: FakeProviders;
let tmp: string;

beforeAll(async () => {
  fake = await startFakeProviders();
  tmp = await mkdtemp(join(tmpdir(), 'lakar-photos-'));
});
afterAll(async () => {
  await fake?.close();
  if (tmp) await rm(tmp, { recursive: true, force: true });
});
beforeEach(() => {
  fake.requests.length = 0;
  fake.mode.pexels = 'ok';
  fake.mode.wikimedia = 'ok';
  fake.mode.openverse = 'ok';
  fake.mode.unsplash = 'ok';
  fake.mode.unsplashImages = 'ok';
  fake.unsplashEmpty.clear();
  fake.unsplashRemaining.value = undefined;
  fake.wikiConcurrency.max = 0;
  fake.ipFor.clear();
});

let n = 0;
/**
 * Layanan baru dengan dataDir baru. `key` ('none' | 'ok' | 'loose' = mode 644) berlaku untuk key Unsplash
 * (`which: 'unsplash'`, default) atau key Pexels lama (`which: 'pexels'`, hanya lookup ref lama).
 */
async function service(key: 'none' | 'ok' | 'loose', dataDir?: string, which: 'unsplash' | 'pexels' = 'unsplash') {
  const dir = dataDir ?? join(tmp, `d${++n}`);
  const keyFile = join(tmp, `key${++n}`);
  if (key !== 'none') {
    await writeFile(keyFile, `${KEY}\n`);
    await chmod(keyFile, key === 'ok' ? 0o600 : 0o644);
  }
  const files = which === 'unsplash' ? { keyFile: join(tmp, 'tidak-ada'), unsplashKeyFile: keyFile } : { keyFile };
  return { svc: new PhotoService({ dataDir: dir, ...files, net: new SafeNet(fake.netOptions()) }), dir, keyFile };
}

async function filesUnder(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  return (await readdir(dir, { recursive: true, withFileTypes: true })).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

const errOf = async (p: Promise<unknown>): Promise<LakarError> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof LakarError) return e;
    throw e;
  }
  throw new Error('diharapkan gagal');
};

describe('SafeNet', () => {
  it('isBlockedIp: loopback, privat, link-local, CGNAT, ULA, multicast, mapped → diblokir; publik → lolos', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '::1',
      '::',
      'fd00::1',
      'fe80::1',
      'ff02::1',
      '::ffff:10.0.0.1',
      '::ffff:127.0.0.1',
      // Prefiks translasi IPv6 dengan IPv4 ter-embed (bisa privat): 6to4, Teredo, NAT64 lokal, IPv4-compatible.
      '2002:a00:1::',
      '2001::5efe:c0a8:101',
      '64:ff9b:1::a00:1',
      '::a00:1',
      'bukan-ip',
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '104.16.1.1', '2606:4700::1111', '::ffff:8.8.8.8']) expect(isBlockedIp(ip), ip).toBe(false);
  });

  it('check: hanya https/443 tanpa kredensial ke host allowlist per jenis', () => {
    const net = new SafeNet();
    expect(net.check('image', 'https://images.pexels.com/photos/1/a.jpeg').hostname).toBe('images.pexels.com');
    expect(net.check('image', 'https://farm4.staticflickr.com/1/a.jpg').hostname).toBe('farm4.staticflickr.com');
    expect(net.check('thumb', 'https://api.openverse.org/v1/images/x/thumb/').hostname).toBe('api.openverse.org');
    expect(net.check('thumb', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/330px-X.jpg').hostname).toBe('thumb.wikimedia.org');
    expect(net.check('image', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/3840px-X.jpg').hostname).toBe('thumb.wikimedia.org');
    expect(net.check('api', 'https://commons.wikimedia.org/w/api.php').hostname).toBe('commons.wikimedia.org');
    for (const [kind, url] of [
      ['image', 'http://images.pexels.com/a.jpg'],
      ['image', 'https://images.pexels.com:8443/a.jpg'],
      ['image', 'https://u:p@images.pexels.com/a.jpg'],
      ['image', 'https://api.openverse.org/v1/images/x/thumb/'],
      ['image', 'https://images.pexels.com.evil.com/a.jpg'],
      ['image', 'https://farm4.staticflickr.com.evil.com/a.jpg'],
      ['api', 'https://images.pexels.com/a.jpg'],
      ['api', 'https://thumb.wikimedia.org/w/api.php'],
      ['image', 'https://commons.wikimedia.org/w/api.php'],
      ['image', 'https://thumb.wikimedia.org.evil.com/a.jpg'],
      ['api', 'file:///etc/passwd'],
      ['api', 'bukan url'],
    ] as const) {
      expect(() => net.check(kind, url), url).toThrow(NetError);
    }
    expect(DEFAULT_ALLOWLIST.api).toEqual(['api.unsplash.com', 'api.pexels.com', 'commons.wikimedia.org', 'api.openverse.org']);
    expect(net.check('image', 'https://images.unsplash.com/photo-1?ixid=x&w=2880').hostname).toBe('images.unsplash.com');
    // Unsplash+ (premium) dan host Unsplash lain di luar allowlist gambar.
    for (const url of ['https://plus.unsplash.com/premium_photo-1', 'https://unsplash.com/photos/x', 'https://images.unsplash.com.evil.com/a.jpg']) expect(() => net.check('image', url), url).toThrow(NetError);
  });

  it('Authorization hanya ke host API ber-key (permintaan pertama); redirect lintas host tidak membawa key', async () => {
    const net = new SafeNet({ ...fake.netOptions(), allowlist: { ...DEFAULT_ALLOWLIST, api: [...DEFAULT_ALLOWLIST.api, 'images.pexels.com', 'upload.wikimedia.org'] } });
    await net.fetch('https://images.pexels.com/photos/900004/redirectOk.jpeg', { kind: 'api', maxBytes: 1 << 20, timeoutMs: 2000, headers: { Authorization: KEY } });
    expect(fake.requests.map((r) => r.host)).toEqual(['images.pexels.com', 'upload.wikimedia.org']);
    expect(fake.requests.every((r) => r.auth === undefined)).toBe(true);
    await net.fetch('https://api.pexels.com/v1/photos/2014422', { kind: 'api', maxBytes: 1 << 20, timeoutMs: 2000, headers: { Authorization: KEY } });
    expect(fake.requests.at(-1)).toMatchObject({ host: 'api.pexels.com', auth: KEY });
  });

  it('timeout → NetError timeout retryable; pesan tanpa query', async () => {
    fake.mode.pexels = 'hang';
    const net = new SafeNet(fake.netOptions());
    const e = await net.fetch('https://api.pexels.com/v1/search?query=rahasia', { kind: 'api', maxBytes: 1024, timeoutMs: 200 }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(NetError);
    expect((e as NetError).kind).toBe('timeout');
    expect((e as NetError).retryable).toBe(true);
    expect((e as NetError).message).not.toContain('rahasia');
  });

  it('IP privat di koneksi → blocked (lookup kustom), tanpa request ke server', async () => {
    fake.ipFor.set('images.pexels.com', '10.0.0.7');
    const e = await new SafeNet(fake.netOptions()).fetch('https://images.pexels.com/photos/1/a.jpeg', { kind: 'image', maxBytes: 1024, timeoutMs: 2000 }).catch((x: unknown) => x);
    expect(e).toMatchObject({ kind: 'blocked', retryable: false });
    expect(fake.requests).toEqual([]);
  });

  it('parseRef: format per penyedia', () => {
    expect(parseRef('pexels:2014422')).toEqual({ provider: 'pexels', id: '2014422' });
    expect(parseRef(`openverse:${OV_BY}`)).toEqual({ provider: 'openverse', id: OV_BY });
    expect(parseRef('wikimedia:98688894')).toEqual({ provider: 'wikimedia', id: '98688894' });
    expect(parseRef(`unsplash:${UNSPLASH.b}`)).toEqual({ provider: 'unsplash', id: UNSPLASH.b });
    for (const bad of ['pexels:abc', 'openverse:123', 'wikimedia:abc', 'wikimedia:1234567890123', 'wikimedia:', 'foo', 'unsplash:1', 'unsplash:a/b/../c', 'pexels:1/../2', 'https://images.pexels.com/x']) expect(parseRef(bad), bad).toBeUndefined();
  });
});

describe('tangga kata kunci dan Cache-Control', () => {
  it('queryLadder: apa adanya → dua kata isi pertama → kategori tanpa orientation (orang → portrait); maks 3, unik', () => {
    expect(queryLadder('restaurant owner portrait smiling', 'portrait')).toEqual([
      { query: 'restaurant owner portrait smiling', orientation: 'portrait' },
      { query: 'restaurant owner', orientation: 'portrait' },
      { query: 'portrait' },
    ]);
    expect(queryLadder('coffee beans bag')).toEqual([{ query: 'coffee beans bag' }, { query: 'coffee beans' }, { query: 'bag' }]);
    expect(queryLadder('bakery counter', 'landscape')).toEqual([{ query: 'bakery counter', orientation: 'landscape' }, { query: 'counter' }]);
    expect(queryLadder('shoes')).toEqual([{ query: 'shoes' }]);
    expect(queryLadder('  chef  portrait ', 'square')).toEqual([{ query: 'chef portrait', orientation: 'square' }, { query: 'portrait' }]);
  });

  it('cacheAge: max-age dibatasi 30 hari; tanpa header 1 hari; no-store 0', () => {
    expect(cacheAge('public, max-age=600')).toBe(600_000);
    expect(cacheAge('max-age=31536000')).toBe(30 * 24 * 3600 * 1000);
    expect(cacheAge(undefined)).toBe(24 * 3600 * 1000);
    expect(cacheAge('no-store')).toBe(0);
  });
});

describe('PhotoService.search', () => {
  it('key valid → unsplash: kandidat beratribusi (utm), premium dibuang, thumbnail; Client-ID + Accept-Version hanya ke api.unsplash.com', async () => {
    const { svc } = await service('ok');
    expect(svc.status()).toEqual({ provider: 'unsplash', keyFile: 'present', imported: 0 });
    const r = await svc.search({ query: 'chef portrait', orientation: 'square', limit: 3 });
    expect(r).toMatchObject({ provider: 'unsplash', query: 'chef portrait', tried: [{ provider: 'unsplash', query: 'chef portrait', orientation: 'square' }] });
    expect(r.fallbackReason).toBeUndefined();
    // Permintaan per_page 3 memuat 1 premium (dibuang) → 2 kandidat.
    expect(r.results.map((x) => x.ref)).toEqual([`unsplash:${UNSPLASH.a}`, `unsplash:${UNSPLASH.b}`]);
    expect(r.results[0]).toEqual({
      ref: `unsplash:${UNSPLASH.a}`,
      width: 4000,
      height: 6000,
      alt: 'chef smiling in a small kitchen',
      avgColor: UNSPLASH_COLOR,
      creator: 'Sari Dewi',
      license: 'Unsplash License',
      sourcePageUrl: `https://unsplash.com/photos/${UNSPLASH.a}?utm_source=lakar&utm_medium=referral`,
      credit: 'Foto: Sari Dewi / Unsplash',
    });
    expect(r.thumbnails.map((t) => t.ref)).toEqual(r.results.map((x) => x.ref));
    const api = fake.requests.filter((x) => x.host === 'api.unsplash.com');
    expect(api).toHaveLength(1);
    expect(api[0]!.auth).toBe(`Client-ID ${KEY}`);
    expect(Object.fromEntries(new URL(api[0]!.path, 'http://x').searchParams)).toEqual({ query: 'chef portrait', per_page: '3', content_filter: 'high', orientation: 'squarish' });
    expect(fake.requests.filter((x) => x.host !== 'api.unsplash.com').every((x) => x.auth === undefined)).toBe(true);
    expect(fake.requests.some((x) => x.host === 'plus.unsplash.com')).toBe(false);
    expect(JSON.stringify(r.results)).not.toMatch(/images\.unsplash\.com/);
  });

  it('utm_source mengikuti unsplashAppName', async () => {
    const keyFile = join(tmp, `key${++n}`);
    await writeFile(keyFile, `${KEY}\n`);
    await chmod(keyFile, 0o600);
    const svc = new PhotoService({ dataDir: join(tmp, `d${++n}`), keyFile: join(tmp, 'tidak-ada'), unsplashKeyFile: keyFile, unsplashAppName: 'lakar_studio', net: new SafeNet(fake.netOptions()) });
    const r = await svc.search({ query: 'chef portrait', limit: 2, preview: false });
    expect(r.results[0]!.sourcePageUrl).toBe(`https://unsplash.com/photos/${UNSPLASH.a}?utm_source=lakar_studio&utm_medium=referral`);
  });

  it('cache cari: memori, lalu disk sesudah "restart" (layanan baru) tanpa request API; berkas rusak = miss', async () => {
    const { svc, dir } = await service('ok');
    await svc.search({ query: 'Chef Portrait', limit: 3 });
    const before = fake.requests.length;
    const again = await svc.search({ query: 'chef portrait ', limit: 3 });
    expect(fake.requests.length).toBe(before);
    expect(again.thumbnails).toHaveLength(2);
    const { svc: fresh } = await service('ok', dir);
    fake.requests.length = 0;
    const r = await fresh.search({ query: 'chef portrait', limit: 3, preview: false });
    expect(r.results).toHaveLength(2);
    expect(fake.requests.filter((x) => x.host === 'api.unsplash.com')).toEqual([]);
    const files = await filesUnder(join(dir, 'cache', 'photo-search'));
    expect(files).toHaveLength(1);
    for (const f of files) await writeFile(f, '{rusak');
    const { svc: third } = await service('ok', dir);
    await third.search({ query: 'chef portrait', limit: 3, preview: false });
    expect(fake.requests.filter((x) => x.host === 'api.unsplash.com')).toHaveLength(1);
  });

  it('tangga: anak tangga 1 kosong → anak tangga 2 dipakai; query = yang dipakai, tried = yang dicoba', async () => {
    fake.unsplashEmpty.add('restaurant owner portrait smiling');
    const { svc } = await service('ok');
    const r = await svc.search({ query: 'restaurant owner portrait smiling', orientation: 'portrait', limit: 2, preview: false });
    expect(r).toMatchObject({ provider: 'unsplash', query: 'restaurant owner' });
    expect(r.tried).toEqual([
      { provider: 'unsplash', query: 'restaurant owner portrait smiling', orientation: 'portrait' },
      { provider: 'unsplash', query: 'restaurant owner', orientation: 'portrait' },
    ]);
    expect(r.fallbackReason).toBeUndefined();
  });

  it('tangga habis di Unsplash → Wikimedia (unsplash-empty); semua kosong di semua penyedia → NOT_FOUND dengan daftar yang dicoba', async () => {
    for (const q of ['restaurant owner portrait smiling', 'restaurant owner', 'portrait']) fake.unsplashEmpty.add(q);
    const { svc } = await service('ok');
    const r = await svc.search({ query: 'restaurant owner portrait smiling', limit: 2, preview: false });
    expect(r).toMatchObject({ provider: 'wikimedia', fallbackReason: 'unsplash-empty', query: 'restaurant owner portrait smiling' });
    expect(r.tried.map((t) => `${t.provider}:${t.query}`)).toEqual(['unsplash:restaurant owner portrait smiling', 'unsplash:restaurant owner', 'unsplash:portrait', 'wikimedia:restaurant owner portrait smiling']);
    fake.mode.wikimedia = 'empty';
    fake.mode.openverse = 'empty';
    const e = await errOf((await service('ok')).svc.search({ query: 'restaurant owner portrait smiling', limit: 2 }));
    expect(e.code).toBe('NOT_FOUND');
    expect(e.message).toContain('unsplash:"restaurant owner portrait smiling"');
    expect(e.message).toContain('openverse:"portrait"');
    expect(e.message.match(/(unsplash|wikimedia|openverse):"/g)).toHaveLength(9);
    expect(e.hint).toMatch(/jangan mengulang/);
  });

  it.each([
    [401, 'unsplash-401'],
    [403, 'unsplash-401'],
    [429, 'unsplash-429'],
    [503, 'unsplash-5xx'],
  ] as const)('Unsplash %s → Wikimedia (%s), tanpa anak tangga Unsplash lain', async (status, reason) => {
    fake.mode.unsplash = status;
    const { svc } = await service('ok');
    const r = await svc.search({ query: 'restaurant owner portrait smiling', preview: false });
    expect(r).toMatchObject({ provider: 'wikimedia', fallbackReason: reason });
    expect(fake.requests.filter((x) => x.host === 'api.unsplash.com')).toHaveLength(1);
  });

  it('X-Ratelimit-Remaining 0 → Unsplash dilewati (unsplash-429) sampai reset', async () => {
    let now = 1_000_000;
    const keyFile = join(tmp, `key${++n}`);
    await writeFile(keyFile, `${KEY}\n`);
    await chmod(keyFile, 0o600);
    const svc = new PhotoService({ dataDir: join(tmp, `d${++n}`), keyFile: join(tmp, 'tidak-ada'), unsplashKeyFile: keyFile, net: new SafeNet(fake.netOptions()), now: () => now });
    fake.unsplashRemaining.value = 0;
    expect((await svc.search({ query: 'chef portrait', preview: false })).provider).toBe('unsplash');
    fake.requests.length = 0;
    const r = await svc.search({ query: 'barista portrait', preview: false });
    expect(r).toMatchObject({ provider: 'wikimedia', fallbackReason: 'unsplash-429' });
    expect(fake.requests.some((x) => x.host === 'api.unsplash.com')).toBe(false);
    now += 61 * 60 * 1000;
    fake.unsplashRemaining.value = 49;
    expect((await svc.search({ query: 'baker portrait', preview: false })).provider).toBe('unsplash');
  });

  it('TTL cache cari 24 jam tidak diperbarui oleh hit (memori maupun disk sesudah restart)', async () => {
    let now = 5_000_000;
    const keyFile = join(tmp, `key${++n}`);
    await writeFile(keyFile, `${KEY}\n`);
    await chmod(keyFile, 0o600);
    const dir = join(tmp, `d${++n}`);
    const mk = () => new PhotoService({ dataDir: dir, keyFile: join(tmp, 'tidak-ada'), unsplashKeyFile: keyFile, net: new SafeNet(fake.netOptions()), now: () => now });
    const svc = mk();
    const api = () => fake.requests.filter((x) => x.host === 'api.unsplash.com').length;
    await svc.search({ query: 'chef portrait', limit: 3, preview: false });
    expect(api()).toBe(1);
    now += 23 * 3600 * 1000;
    await svc.search({ query: 'chef portrait', limit: 3, preview: false });
    await mk().search({ query: 'chef portrait', limit: 3, preview: false });
    expect(api()).toBe(1);
    // 25 jam sesudah simpan: miss walau sudah di-hit 2 jam sebelumnya (memori dan disk).
    now += 2 * 3600 * 1000;
    await svc.search({ query: 'chef portrait', limit: 3, preview: false });
    expect(api()).toBe(2);
  });

  it('remaining 0 dipakai sekali: sesudah masa tunggu, hit cache tidak memblokir ulang dan cari baru ke Unsplash', async () => {
    let now = 9_000_000;
    const keyFile = join(tmp, `key${++n}`);
    await writeFile(keyFile, `${KEY}\n`);
    await chmod(keyFile, 0o600);
    const svc = new PhotoService({ dataDir: join(tmp, `d${++n}`), keyFile: join(tmp, 'tidak-ada'), unsplashKeyFile: keyFile, net: new SafeNet(fake.netOptions()), now: () => now });
    fake.unsplashRemaining.value = 0;
    await svc.search({ query: 'chef portrait', preview: false });
    fake.unsplashRemaining.value = undefined;
    now += 61 * 60 * 1000;
    expect((await svc.search({ query: 'chef portrait', preview: false })).provider).toBe('unsplash');
    fake.requests.length = 0;
    const r = await svc.search({ query: 'barista portrait', preview: false });
    expect(r.provider).toBe('unsplash');
    expect(r.fallbackReason).toBeUndefined();
    expect(fake.requests.some((x) => x.host === 'api.unsplash.com')).toBe(true);
  });

  it('tanpa key → wikimedia no-key; key mode 644 → key-insecure, key tidak dikirim; key dibaca ulang saat file berubah', async () => {
    const none = await service('none');
    expect(none.svc.status()).toEqual({ provider: 'wikimedia', keyFile: 'absent', imported: 0 });
    expect(await none.svc.search({ query: 'shoes', preview: false })).toMatchObject({ provider: 'wikimedia', fallbackReason: 'no-key' });
    const { svc, keyFile } = await service('loose');
    expect(svc.status()).toEqual({ provider: 'wikimedia', keyFile: 'insecure', imported: 0 });
    expect(await svc.search({ query: 'kamar', preview: false })).toMatchObject({ provider: 'wikimedia', fallbackReason: 'key-insecure' });
    expect(fake.requests.some((x) => x.auth !== undefined || x.host === 'api.unsplash.com')).toBe(false);
    await chmod(keyFile, 0o600);
    expect(svc.status()).toMatchObject({ provider: 'unsplash', keyFile: 'present' });
    await rm(keyFile);
    expect(svc.status()).toMatchObject({ provider: 'wikimedia', keyFile: 'absent' });
  });

  it('Pexels tidak lagi di rantai cari (key Pexels saja → wikimedia no-key)', async () => {
    const { svc } = await service('ok', undefined, 'pexels');
    expect(svc.status()).toEqual({ provider: 'wikimedia', keyFile: 'absent', imported: 0 });
    expect(await svc.search({ query: 'shoes', preview: false })).toMatchObject({ provider: 'wikimedia', fallbackReason: 'no-key' });
    expect(fake.requests.some((x) => x.host === 'api.pexels.com')).toBe(false);
  });

  it('tanpa key, Wikimedia 5xx → openverse wikimedia-5xx; hanya CC0/PDM/BY dari host allowlist dan ≤ 12 MiB; filter tetap di query', async () => {
    fake.mode.wikimedia = 503;
    const { svc } = await service('none');
    const r = await svc.search({ query: 'hotel room', orientation: 'landscape' });
    expect(r).toMatchObject({ provider: 'openverse', fallbackReason: 'wikimedia-5xx' });
    expect(r.results.map((x) => x.ref)).toEqual([`openverse:${OV_BY}`, `openverse:${OV_CC0}`]);
    expect(r.results[0]).toMatchObject({ creator: 'Budi Santoso', license: 'CC BY 2.0', credit: '"Kamar" by Budi Santoso is licensed under CC BY 2.0.' });
    expect(r.results[1]!.license).toBe('CC0 1.0');
    // Thumbnail Openverse (endpoint /thumb/ menolak Accept tanpa */* dengan 406) ikut terambil untuk setiap kandidat.
    expect(r.thumbnails.map((t) => t.ref)).toEqual(r.results.map((x) => x.ref));
    const api = fake.requests.find((x) => x.host === 'api.openverse.org' && x.path.startsWith('/v1/images/?'))!;
    const q = Object.fromEntries(new URL(api.path, 'http://x').searchParams);
    expect(q).toMatchObject({ q: 'hotel room', source: 'flickr,wikimedia', license: 'cc0,pdm,by', category: 'photograph', mature: 'false', aspect_ratio: 'wide' });
  });

  it('semua gagal → EXEC_ERROR retryable tanpa key di pesan; openverse 429 → hint tunggu', async () => {
    fake.mode.unsplash = 500;
    fake.mode.wikimedia = 503;
    fake.mode.openverse = 502;
    const { svc } = await service('ok');
    const e = await errOf(svc.search({ query: 'kamar' }));
    expect(e).toMatchObject({ code: 'EXEC_ERROR', retryable: true });
    expect(`${e.message} ${e.hint}`).not.toContain(KEY);
    fake.mode.openverse = 429;
    const e2 = await errOf((await service('none')).svc.search({ query: 'kamar' }));
    expect(e2).toMatchObject({ code: 'EXEC_ERROR', retryable: true });
    expect(e2.hint).toMatch(/Openverse.*tunggu/);
  });
});

describe('PhotoService: foto Unsplash (aset jarak jauh)', () => {
  const U = (id: string) => `unsplash:${id}`;
  const dlCalls = () => fake.requests.filter((r) => r.host === 'api.unsplash.com' && /\/download$/.test(new URL(r.path, 'http://x').pathname));

  it('impor: meta remote (URL API, ixid + w=2880) tanpa byte di assets/; resolve; download_location sekali per (ref, docId), bertahan sesudah restart', async () => {
    const { svc, dir } = await service('ok');
    await svc.search({ query: 'chef portrait', limit: 3, preview: false });
    fake.requests.length = 0;
    await svc.importRefs([U(UNSPLASH.a)], { docId: 'DocAAAAA' });
    const id = sha(Buffer.from(U(UNSPLASH.a)));
    expect(svc.resolve(U(UNSPLASH.a))).toEqual({
      assetId: id,
      width: 2880,
      height: 4320,
      credit: 'Foto: Sari Dewi / Unsplash',
      license: 'Unsplash License',
      creator: 'Sari Dewi',
      sourcePageUrl: `https://unsplash.com/photos/${UNSPLASH.a}?utm_source=lakar&utm_medium=referral`,
    });
    expect(svc.isRemote(id)).toBe(true);
    // Tanpa unduhan byte: hanya pemicu download_location (ber-key).
    expect(fake.requests.map((r) => r.host)).toEqual(['api.unsplash.com']);
    expect(dlCalls()).toHaveLength(1);
    expect(dlCalls()[0]!.auth).toBe(`Client-ID ${KEY}`);
    expect((await filesUnder(join(dir, 'assets'))).map((f) => f.slice(dir.length))).toEqual([`/assets/meta/${id}.json`]);
    const meta = await readAssetMeta(dir, id);
    expect(meta).toMatchObject({ ref: U(UNSPLASH.a), provider: 'unsplash', bytes: 0, avgColor: UNSPLASH_COLOR, license: 'Unsplash License', downloads: [{ docId: 'DocAAAAA' }] });
    const url = new URL(meta!.remote!.url);
    expect(url.hostname).toBe('images.unsplash.com');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ ixid: expect.any(String), w: '2880', q: '80', fm: 'jpg', fit: 'max' });
    expect(meta!.remote!.downloadLocation).toMatch(/^https:\/\/api\.unsplash\.com\/photos\/Kq3wLm8xT0a\/download\?ixid=/);
    // Dok sama → tanpa pemicu ulang; dok lain → sekali lagi.
    await svc.importRefs([U(UNSPLASH.a)], { docId: 'DocAAAAA' });
    expect(dlCalls()).toHaveLength(1);
    await svc.importRefs([U(UNSPLASH.a)], { docId: 'DocBBBBB' });
    expect(dlCalls()).toHaveLength(2);
    // Restart: indeks + meta → resolve tanpa jaringan, (ref, dok) yang sama tidak dipicu lagi.
    const { svc: fresh } = await service('ok', dir);
    fake.requests.length = 0;
    expect(fresh.resolve(U(UNSPLASH.a))?.credit).toBe('Foto: Sari Dewi / Unsplash');
    await fresh.importRefs([U(UNSPLASH.a)], { docId: 'DocBBBBB' });
    expect(fake.requests).toEqual([]);
  });

  it('cache miss → lookup by-id Unsplash; premium/tak dikenal → NOT_FOUND; download_location gagal → dicatat di meta, impor tetap sukses', async () => {
    const { svc, dir } = await service('ok');
    fake.mode.unsplash = 'ok';
    await svc.importRefs([U(UNSPLASH.b)]);
    expect(fake.requests.map((r) => `${r.host}${new URL(r.path, 'http://x').pathname}`)).toEqual([`api.unsplash.com/photos/${UNSPLASH.b}`]);
    expect((await errOf(svc.importRefs([U(UNSPLASH.premium)]))).code).toBe('NOT_FOUND');
    expect((await errOf(svc.importRefs([U('TidakAda123')]))).code).toBe('NOT_FOUND');
    await svc.importRefs([U(UNSPLASH.c)]);
    fake.mode.unsplash = 500;
    await svc.importRefs([U(UNSPLASH.c)], { docId: 'DocCCCCC' });
    const meta = await readAssetMeta(dir, sha(Buffer.from(U(UNSPLASH.c))));
    expect(meta!.downloadErrors).toEqual([{ docId: 'DocCCCCC', at: expect.any(String), error: expect.stringMatching(/HTTP 500/) }]);
    expect(meta!.downloads).toBeUndefined();
    expect((await errOf((await service('none')).svc.importRefs([U(UNSPLASH.a)]))).code).toBe('NOT_FOUND');
  });

  it('render: /assets dari cache render (sekali ambil, lalu tanpa jaringan); cache dingin + jaringan gagal → placeholder berwarna foto', async () => {
    const { svc, dir } = await service('ok');
    await svc.importRefs([U(UNSPLASH.a), U(UNSPLASH.b)]);
    const a = sha(Buffer.from(U(UNSPLASH.a)));
    const b = sha(Buffer.from(U(UNSPLASH.b)));
    fake.requests.length = 0;
    const got = await svc.remoteAsset(a);
    expect(got).toEqual({ type: 'image/png', body: UNSPLASH_PNG, placeholder: false });
    expect(fake.requests.map((r) => r.host)).toEqual(['images.unsplash.com']);
    expect(fake.requests[0]!.auth).toBeUndefined();
    const cached = await filesUnder(join(dir, 'cache', 'remote-images'));
    expect(cached).toHaveLength(2);
    fake.requests.length = 0;
    fake.mode.unsplashImages = 503;
    expect((await svc.remoteAsset(a))?.placeholder).toBe(false);
    expect(fake.requests).toEqual([]);
    // Cache dingin (b) + 503 → placeholder PNG warna `color` foto.
    const ph = (await svc.remoteAsset(b))!;
    expect(ph.placeholder).toBe(true);
    expect(imageSize(ph.body)).toEqual({ width: 16, height: 16 });
    expect(svc.placeholders([a, b, 'f'.repeat(64)])).toEqual([b]);
    const { decodePng } = await import('../png.js');
    const img = decodePng(ph.body);
    expect([...img.pixels.subarray(0, 3)]).toEqual(UNSPLASH_RGB);
    // Jaringan pulih → foto asli, catatan placeholder hilang.
    fake.mode.unsplashImages = 'ok';
    expect((await svc.remoteAsset(b))?.placeholder).toBe(false);
    expect(svc.placeholders([b])).toEqual([]);
    // Bukan aset jarak jauh → undefined; tidak ada byte Unsplash di assets/.
    expect(await svc.remoteAsset('f'.repeat(64))).toBeUndefined();
    expect((await filesUnder(join(dir, 'assets'))).every((f) => f.includes('/assets/meta/'))).toBe(true);
  });

  it('key Unsplash tidak pernah muncul di error, status, meta, indeks, atau cache', async () => {
    const { svc, dir } = await service('ok');
    await svc.search({ query: 'chef portrait', limit: 3 });
    await svc.importRefs([U(UNSPLASH.a), U(UNSPLASH.b)], { docId: 'DocKKKKK' });
    await svc.remoteAsset(sha(Buffer.from(U(UNSPLASH.a))));
    fake.mode.unsplash = 401;
    const e = await errOf(svc.importRefs([U(UNSPLASH.c)]));
    expect(`${e.message} ${e.hint}`).not.toContain(KEY);
    await svc.importRefs([U(UNSPLASH.a)], { docId: 'DocLLLLL' });
    const r = await svc.search({ query: 'barista portrait', preview: false });
    expect(JSON.stringify(r)).not.toContain(KEY);
    expect(JSON.stringify(svc.status())).not.toContain(KEY);
    const files = await filesUnder(dir);
    expect(files.some((f) => f.includes('/cache/photo-search/'))).toBe(true);
    expect(files.some((f) => f.includes('/cache/remote-images/'))).toBe(true);
    for (const f of files) expect((await readFile(f)).includes(KEY), f).toBe(false);
  });
});

describe('PhotoService.importRefs', () => {
  it('impor ref Pexels lama (lookup by-id ber-key): aset + meta + indeks; resolve sinkron; impor ulang dan layanan baru tanpa jaringan', async () => {
    const { svc, dir } = await service('ok', undefined, 'pexels');
    await svc.importRefs(['pexels:2014422']);
    // Lookup by-id lalu unduhan hanya ukuran 2880 terkompres.
    expect(fake.requests.map((r) => r.host)).toEqual(['api.pexels.com', 'images.pexels.com']);
    expect(Object.fromEntries(new URL(fake.requests[1]!.path, 'http://x').searchParams)).toEqual({ auto: 'compress', cs: 'tinysrgb', w: '2880' });
    const hash = sha(PHOTO_PNG);
    const info = svc.resolve('pexels:2014422');
    expect(info).toEqual({ assetId: hash, width: 64, height: 48, credit: 'Foto: Rina Wijaya / Pexels', license: 'Pexels License', creator: 'Rina Wijaya', sourcePageUrl: 'https://www.pexels.com/photo/kamar-2014422/' });
    expect(await readFile(join(dir, 'assets', hash))).toEqual(PHOTO_PNG);
    const meta = await readAssetMeta(dir, hash);
    expect(meta).toMatchObject({ ref: 'pexels:2014422', provider: 'pexels', creator: 'Rina Wijaya', license: 'Pexels License', width: 64, height: 48, bytes: PHOTO_PNG.length, mime: 'image/png' });
    expect(meta!.downloadUrl).toMatch(/^https:\/\/images\.pexels\.com\/photos\/2014422\//);
    expect(JSON.parse(await readFile(join(dir, 'photos', 'index.json'), 'utf8'))).toEqual({ version: 1, refs: { 'pexels:2014422': hash } });
    expect(svc.status().imported).toBe(1);

    fake.requests.length = 0;
    await svc.importRefs(['pexels:2014422', 'pexels:2014422']);
    const fresh = new PhotoService({ dataDir: dir, keyFile: join(tmp, 'tidak-ada'), net: new SafeNet(fake.netOptions()) });
    expect(fresh.resolve('pexels:2014422')).toMatchObject({ assetId: hash, credit: 'Foto: Rina Wijaya / Pexels' });
    await fresh.importRefs(['pexels:2014422']);
    expect(fake.requests).toEqual([]);
  });

  it('cache miss → lookup by-id penyedia (openverse tanpa key), meta memuat atribusi CC BY', async () => {
    const { svc, dir } = await service('none');
    await svc.importRefs([`openverse:${OV_BY}`]);
    expect(fake.requests.map((r) => `${r.host}${r.path}`)).toEqual([`api.openverse.org/v1/images/${OV_BY}/`, 'upload.wikimedia.org/wikipedia/commons/a/a1/Kamar.png']);
    const info = svc.resolve(`openverse:${OV_BY}`)!;
    expect(info.credit).toBe('"Kamar" by Budi Santoso is licensed under CC BY 2.0.');
    expect(await readAssetMeta(dir, info.assetId)).toMatchObject({ provider: 'openverse', license: 'CC BY 2.0', attribution: info.credit, licenseUrl: 'https://creativecommons.org/licenses/by/2.0/' });
  });

  it('pexels by-id dengan key; tanpa key → NOT_FOUND; ref tak dikenal → NOT_FOUND; format → SCHEMA_INVALID; > 6 baru → SCHEMA_INVALID', async () => {
    const { svc } = await service('ok', undefined, 'pexels');
    await svc.importRefs(['pexels:2014423']);
    expect(fake.requests.map((r) => r.host)).toEqual(['api.pexels.com', 'images.pexels.com']);
    expect((await errOf((await service('none')).svc.importRefs(['pexels:2014424']))).code).toBe('NOT_FOUND');
    expect((await errOf(svc.importRefs(['pexels:777']))).code).toBe('NOT_FOUND');
    expect((await errOf(svc.importRefs(['openverse:aaaaaaaa-0000-4000-8000-00000000ffff']))).code).toBe('NOT_FOUND');
    expect((await errOf(svc.importRefs(['pexels:abc']))).code).toBe('SCHEMA_INVALID');
    const many = Array.from({ length: 7 }, (_, i) => `pexels:30${i}`);
    expect((await errOf(svc.importRefs(many))).code).toBe('SCHEMA_INVALID');
  });

  it.each([
    ['redirect lintas host', PEXELS_CASE.redirectEvil, false],
    ['HTML berlabel image/jpeg', PEXELS_CASE.html, false],
    ['body > 12 MiB (chunked)', PEXELS_CASE.huge, false],
  ] as const)('%s → EXEC_ERROR, tidak ada file aset', async (_label, id, retryable) => {
    const { svc, dir } = await service('ok', undefined, 'pexels');
    const e = await errOf(svc.importRefs([`pexels:${id}`]));
    expect(e).toMatchObject({ code: 'EXEC_ERROR', retryable });
    expect(await filesUnder(join(dir, 'assets'))).toEqual([]);
    expect(svc.resolve(`pexels:${id}`)).toBeUndefined();
    expect(fake.requests.some((r) => r.host === 'evil.example.com')).toBe(false);
  }, 20_000);

  it('redirect ke host allowlist lain diikuti (≤ 3 hop)', async () => {
    const { svc } = await service('ok', undefined, 'pexels');
    await svc.importRefs([`pexels:${PEXELS_CASE.redirectOk}`]);
    expect(fake.requests.map((r) => r.host)).toEqual(['api.pexels.com', 'images.pexels.com', 'upload.wikimedia.org']);
    expect(svc.resolve(`pexels:${PEXELS_CASE.redirectOk}`)).toMatchObject({ width: 40, height: 30 });
  });

  it('host gambar resolve ke IP privat → EXEC_ERROR retryable:false, foto tidak tersimpan', async () => {
    const { svc, dir } = await service('none');
    await svc.search({ query: 'shoes', limit: 1, preview: false });
    fake.ipFor.set('thumb.wikimedia.org', '10.0.0.7');
    const e = await errOf(svc.importRefs([`wikimedia:${WIKI.cc0}`]));
    expect(e).toMatchObject({ code: 'EXEC_ERROR', retryable: false });
    expect(await filesUnder(join(dir, 'assets'))).toEqual([]);
  });

  it('key Pexels tidak pernah muncul di status, meta, indeks, atau error', async () => {
    const { svc, dir } = await service('ok', undefined, 'pexels');
    await svc.importRefs(['pexels:2014422', 'pexels:2014423']);
    fake.mode.pexels = 500;
    const e = await errOf(svc.importRefs(['pexels:2014499']));
    expect(`${e.message} ${e.hint}`).not.toContain(KEY);
    expect(JSON.stringify(svc.status())).not.toContain(KEY);
    for (const f of await filesUnder(dir)) expect(await readFile(f, 'utf8'), f).not.toContain(KEY);
  });

  it('imageSize: PNG dari header', () => {
    expect(imageSize(PHOTO_PNG)).toEqual({ width: 64, height: 48 });
    expect(imageSize(Buffer.from('<svg/>'))).toBeUndefined();
  });
});

describe('Wikimedia Commons', () => {
  const W = (id: number) => `wikimedia:${id}`;
  const GOOD_RANKED = [WIKI.cc0, WIKI.featured, WIKI.bySa, WIKI.spam1, WIKI.spam2, WIKI.png, WIKI.bw, WIKI.portrait, WIKI.square].map(W);

  it('tanpa key → wikimedia no-key: tersaring, terurut, maks 2 per pembuat; thumbnail 330 tanpa utm; query API sesuai', async () => {
    const { svc } = await service('none');
    const r = await svc.search({ query: 'running shoes' });
    expect(r).toMatchObject({ provider: 'wikimedia', fallbackReason: 'no-key' });
    expect(r.results.map((x) => x.ref)).toEqual(GOOD_RANKED.slice(0, 6));
    expect(r.results[0]).toEqual({
      ref: W(WIKI.cc0),
      width: 3000,
      height: 2000,
      alt: 'Shoes on wooden floor',
      creator: 'Budi',
      license: 'CC0',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File%3AShoes_on_wooden_floor.jpg',
      credit: 'Foto: Budi / Wikimedia Commons (CC0)',
    });
    // Artist HTML → teks polos (tag dibuang, entitas didekode).
    expect(r.results.find((x) => x.ref === W(WIKI.bySa))!.creator).toBe('Ana & Co');
    expect(r.thumbnails.map((t) => t.ref)).toEqual(r.results.map((x) => x.ref));
    const thumbs = fake.requests.filter((x) => x.host === 'thumb.wikimedia.org');
    expect(thumbs).toHaveLength(6);
    expect(thumbs.every((x) => /\/330px-/.test(x.path) && !x.path.includes('utm_'))).toBe(true);
    const api = fake.requests.filter((x) => x.host === 'commons.wikimedia.org');
    expect(api).toHaveLength(1);
    expect(Object.fromEntries(new URL(api[0]!.path, 'http://x').searchParams)).toEqual({
      action: 'query',
      format: 'json',
      formatversion: '2',
      generator: 'search',
      gsrnamespace: '6',
      gsrsearch: 'running shoes filetype:bitmap filew:>799',
      gsrlimit: '40',
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiextmetadatafilter: 'LicenseShortName|License|LicenseUrl|Artist|ObjectName|Categories|NonFree',
      iiurlwidth: '330',
      maxlag: '5',
    });
    // Tidak ada permintaan ke Openverse/Pexels; UA persis di semua permintaan keluar.
    expect(fake.requests.some((x) => x.host === 'api.openverse.org' || x.host === 'api.pexels.com')).toBe(false);
    expect(fake.requests.every((x) => x.ua === USER_AGENT)).toBe(true);
    expect(USER_AGENT).toBe('Lakar/0.1 (internal design tool)');
    expect(JSON.stringify(r.results)).not.toMatch(/upload\.wikimedia\.org|thumb\.wikimedia\.org/);
  });

  it('kandidat buruk dibuang (SVG/TIFF, NC, GFDL saja, NonFree, kecil, panorama, peta, PD-Art, logo, turunan gagal); spam ke-3 dibuang', async () => {
    const { svc } = await service('none');
    const r = await svc.search({ query: 'shoes', limit: 12 });
    expect(r.results.map((x) => x.ref)).toEqual(GOOD_RANKED);
    for (const id of [WIKI.svg, WIKI.tiff, WIKI.nc, WIKI.gfdl, WIKI.nonFree, WIKI.small, WIKI.panorama, WIKI.map, WIKI.pdArt, WIKI.logo, WIKI.oddThumb, WIKI.spam3]) {
      expect(r.results.some((x) => x.ref === W(id)), String(id)).toBe(false);
    }
    // Pratinjau tetap maks 6.
    expect(r.thumbnails).toHaveLength(6);
  });

  it.each([
    ['portrait', [WIKI.portrait]],
    ['square', [WIKI.square]],
    ['landscape', [WIKI.cc0, WIKI.featured, WIKI.bySa, WIKI.spam1, WIKI.spam2, WIKI.png, WIKI.bw]],
  ] as const)('orientation %s → hanya yang cocok; gsrlimit 50', async (orientation, ids) => {
    const { svc } = await service('none');
    const r = await svc.search({ query: 'shoes', orientation, limit: 12 });
    expect(r.results.map((x) => x.ref)).toEqual(ids.map(W));
    const api = fake.requests.find((x) => x.host === 'commons.wikimedia.org')!;
    expect(new URL(api.path, 'http://x').searchParams.get('gsrlimit')).toBe('50');
  });

  it('skor: CC0 > CC BY > BY-SA pada relevansi sama; Featured naik; hitam-putih turun; PNG turun', () => {
    const hit = (licenseClass: WikimediaHit['licenseClass'], categories = '', mime = 'image/jpeg'): WikimediaHit => ({
      candidate: {} as WikimediaHit['candidate'],
      index: 3,
      licenseClass,
      categories,
      mime,
    });
    const base = wikimediaScore(hit('by-sa'), 10);
    expect(wikimediaScore(hit('free'), 10)).toBeCloseTo(base + 0.25);
    expect(wikimediaScore(hit('by'), 10)).toBeCloseTo(base + 0.1);
    expect(wikimediaScore(hit('by-sa', 'Featured pictures of food'), 10)).toBeCloseTo(base + 0.3);
    expect(wikimediaScore(hit('by-sa', 'Files from Pexels'), 10)).toBeCloseTo(base + 0.15);
    expect(wikimediaScore(hit('by-sa', 'Black and white photographs'), 10)).toBeCloseTo(base - 0.35);
    expect(wikimediaScore(hit('by-sa', '', 'image/png'), 10)).toBeCloseTo(base - 0.1);
    expect(base).toBeCloseTo(1 - 2 / 10);
  });

  it('keragaman: maks 2 per pembuat, tetapi pembuat tak diketahui tidak dibatasi', () => {
    const hit = (i: number, creator: string): WikimediaHit => ({
      candidate: { ref: `wikimedia:${i}`, creator, width: 4000, height: 3000, alt: `Foto ${i}` } as WikimediaHit['candidate'],
      index: i,
      licenseClass: 'by-sa',
      categories: '',
      mime: 'image/jpeg',
    });
    const hits = [hit(1, 'Ana'), hit(2, 'Ana'), hit(3, 'Ana'), hit(4, 'tidak diketahui'), hit(5, 'tidak diketahui'), hit(6, 'tidak diketahui')];
    expect(rankWikimedia(hits, 6, undefined, 6).map((c) => c.ref)).toEqual(['wikimedia:1', 'wikimedia:2', 'wikimedia:4', 'wikimedia:5', 'wikimedia:6']);
  });

  it('kelas lisensi: CC0/PD/CC BY/CC BY-SA diterima; NC/ND/GFDL/tak dikenal ditolak', () => {
    for (const [code, short, want] of [
      ['cc0', 'CC0', 'free'],
      ['pd', 'Public domain', 'free'],
      ['pd-usgov', undefined, 'free'],
      [undefined, 'Public domain', 'free'],
      ['cc-by-2.0', 'CC BY 2.0', 'by'],
      ['cc-by-sa-4.0', 'CC BY-SA 4.0', 'by-sa'],
      ['cc-by-sa-3.0-migrated', undefined, 'by-sa'],
      ['cc-by-nc-sa-2.0', 'CC BY-NC-SA 2.0', undefined],
      ['cc-by-nd-4.0', 'CC BY-ND 4.0', undefined],
      ['gfdl', 'GFDL', undefined],
      [undefined, undefined, undefined],
      ['attribution', 'Attribution', undefined],
      ['cc-by-nc-2.0', 'CC BY 2.0', undefined],
      ['cc-by-2.0', 'CC BY-NC 2.0', undefined],
    ] as const) {
      expect(wikimediaLicenseClass(code, short), `${code}/${short}`).toBe(want);
    }
    expect(plainText('<a href="x">Petar Milo&#353;evi&#x107;</a>&nbsp;&amp; <b>tim</b>')).toBe('Petar Milošević & tim');
  });

  it('URL impor: selalu bucket standar terbesar < lebar asli (maks 3840 JPEG/WebP, 1920 PNG); terlalu kecil/turunan gagal → undefined', () => {
    const t = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/81/X.jpg/330px-X.jpg';
    const url = 'https://upload.wikimedia.org/wikipedia/commons/8/81/X.jpg';
    expect(wikimediaImportUrl({ url, thumbUrl: t, width: 2709, size: 3_000_000, mime: 'image/jpeg' })).toBe(t.replace('/330px-', '/1920px-'));
    expect(wikimediaImportUrl({ url, thumbUrl: t, width: 1280, size: 300_000, mime: 'image/jpeg' })).toBe(t.replace('/330px-', '/960px-'));
    expect(wikimediaImportUrl({ url, thumbUrl: t, width: 300, size: 30_000, mime: 'image/jpeg' })).toBeUndefined();
    expect(wikimediaImportUrl({ url, thumbUrl: t, width: 4668, size: 4_000_000, mime: 'image/jpeg' })).toBe(t.replace('/330px-', '/3840px-'));
    expect(wikimediaImportUrl({ url, thumbUrl: t, width: 3000, size: 20 * 1024 * 1024, mime: 'image/png' })).toBe(t.replace('/330px-', '/1920px-'));
    expect(wikimediaImportUrl({ url, thumbUrl: t, width: 6000, size: 2_000_000, mime: 'image/webp' })).toBe(t.replace('/330px-', '/3840px-'));
    expect(wikimediaImportUrl({ url, thumbUrl: t.replace('/330px-', '/lossy-'), width: 9000, size: 30_000_000, mime: 'image/jpeg' })).toBeUndefined();
  });

  it.each([
    ['maxlag', 'wikimedia-maxlag'],
    [503, 'wikimedia-5xx'],
    [429, 'wikimedia-429'],
    ['empty', 'wikimedia-empty'],
  ] as const)('Wikimedia %s → openverse (%s)', async (m, reason) => {
    fake.mode.wikimedia = m;
    const { svc } = await service('none');
    const r = await svc.search({ query: 'shoes' });
    expect(r).toMatchObject({ provider: 'openverse', fallbackReason: reason });
    expect(r.results.length).toBeGreaterThan(0);
  });

  it('Wikimedia timeout → openverse (wikimedia-timeout)', async () => {
    fake.mode.wikimedia = 'hang';
    const { svc } = await service('none');
    const r = await svc.search({ query: 'shoes' });
    expect(r).toMatchObject({ provider: 'openverse', fallbackReason: 'wikimedia-timeout' });
  }, 20_000);

  it('Wikimedia + Openverse gagal → EXEC_ERROR; keduanya kosong → NOT_FOUND', async () => {
    fake.mode.wikimedia = 'maxlag';
    fake.mode.openverse = 503;
    const e = await errOf((await service('none')).svc.search({ query: 'shoes' }));
    expect(e).toMatchObject({ code: 'EXEC_ERROR', retryable: true });
    fake.mode.wikimedia = 'empty';
    fake.mode.openverse = 'empty';
    const e2 = await errOf((await service('none')).svc.search({ query: 'shoes' }));
    expect(e2.code).toBe('NOT_FOUND');
  });

  it('impor dari hasil cari: selalu thumbnail bucket standar (tanpa utm, tanpa file asli) 1920px / 3840px / 1920px PNG; meta wikimedia lengkap', async () => {
    const { svc, dir } = await service('none');
    await svc.search({ query: 'shoes', limit: 12 });
    fake.requests.length = 0;
    await svc.importRefs([W(WIKI.cc0), W(WIKI.bySa), W(WIKI.png)]);
    const paths = fake.requests.map((r) => `${r.host}${r.path}`).sort();
    expect(paths).toEqual([
      'thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Running_shoes_on_track.jpg/3840px-Running_shoes_on_track.jpg',
      'thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Shoes_on_wooden_floor.jpg/1920px-Shoes_on_wooden_floor.jpg',
      'thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Sneaker_studio.png/1920px-Sneaker_studio.png',
    ]);
    expect(fake.requests.some((r) => r.host === 'upload.wikimedia.org')).toBe(false);
    expect(fake.requests.some((r) => r.host === 'commons.wikimedia.org')).toBe(false);
    const info = svc.resolve(W(WIKI.bySa))!;
    expect(info).toEqual({
      assetId: sha(WIKI_PNG),
      width: 40,
      height: 30,
      credit: 'Foto: Ana & Co / Wikimedia Commons (CC BY-SA 4.0)',
      license: 'CC BY-SA 4.0',
      creator: 'Ana & Co',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File%3ARunning_shoes_on_track.jpg',
    });
    const meta = await readAssetMeta(dir, info.assetId);
    expect(meta).toMatchObject({
      provider: 'wikimedia',
      creator: expect.any(String),
      license: expect.any(String),
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0',
      sourcePageUrl: expect.stringMatching(/^https:\/\/commons\.wikimedia\.org\/wiki\//),
      attribution: expect.stringMatching(/ via Wikimedia Commons$/),
    });
    // Layanan baru (indeks + meta): credit wikimedia direkonstruksi dari meta.
    const fresh = new PhotoService({ dataDir: dir, keyFile: join(tmp, 'tidak-ada'), net: new SafeNet(fake.netOptions()) });
    expect(fresh.resolve(W(WIKI.cc0))?.credit).toMatch(/ \/ Wikimedia Commons \(/);
  });

  it('cache miss → lookup pageids (serial) lalu impor; lisensi/mime tak aman atau hilang → NOT_FOUND; format → SCHEMA_INVALID', async () => {
    const { svc, dir } = await service('none');
    await svc.importRefs([W(WIKI.cc0)]);
    expect(fake.requests.map((r) => r.host)).toEqual(['commons.wikimedia.org', 'thumb.wikimedia.org']);
    expect(new URL(fake.requests[0]!.path, 'http://x').searchParams.get('pageids')).toBe(String(WIKI.cc0));
    const info = svc.resolve(W(WIKI.cc0))!;
    expect(await readAssetMeta(dir, info.assetId)).toMatchObject({
      ref: W(WIKI.cc0),
      provider: 'wikimedia',
      creator: 'Budi',
      license: 'CC0',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File%3AShoes_on_wooden_floor.jpg',
      attribution: '"Shoes on wooden floor" oleh Budi, CC0, via Wikimedia Commons',
      downloadUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Shoes_on_wooden_floor.jpg/1920px-Shoes_on_wooden_floor.jpg',
    });
    for (const id of [WIKI.nc, WIKI.svg, WIKI.nonFree, 999999]) expect((await errOf(svc.importRefs([W(id)]))).code, String(id)).toBe('NOT_FOUND');
    expect((await errOf(svc.importRefs(['wikimedia:abc']))).code).toBe('SCHEMA_INVALID');
  });

  it('permintaan API Wikimedia serial: pencarian paralel + lookup → konkurensi maks 1', async () => {
    const { svc } = await service('none');
    await Promise.all([svc.search({ query: 'shoes a' }), svc.search({ query: 'shoes b' }), svc.search({ query: 'shoes c', orientation: 'landscape' }), svc.importRefs([W(WIKI.square)])]);
    expect(fake.requests.filter((r) => r.host === 'commons.wikimedia.org')).toHaveLength(4);
    expect(fake.wikiConcurrency.max).toBe(1);
  });
});
