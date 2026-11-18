// Foto stok: SafeNet (SSRF), adaptor penyedia, dan PhotoService terhadap penyedia palsu lokal (tanpa jaringan).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { LakarError } from '@lakar/schema';
import { DEFAULT_ALLOWLIST, NetError, SafeNet, USER_AGENT, isBlockedIp } from './net.js';
import { PhotoService } from './service.js';
import { parseRef, plainText, rankWikimedia, wikimediaImportUrl, wikimediaLicenseClass, wikimediaScore, type WikimediaHit } from './providers.js';
import { imageSize, readAssetMeta } from '../assets.js';
import { OV_BY, OV_CC0, PEXELS_CASE, PHOTO_PNG, WIKI, WIKI_PNG, startFakeProviders, type FakeProviders } from '../../../../tests/support/photos.ts';

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
  fake.wikiConcurrency.max = 0;
  fake.ipFor.clear();
});

let n = 0;
/** Layanan baru dengan dataDir baru; `key`: 'none' | 'ok' | 'loose' (mode 644). */
async function service(key: 'none' | 'ok' | 'loose', dataDir?: string) {
  const dir = dataDir ?? join(tmp, `d${++n}`);
  const keyFile = join(tmp, `key${n}`);
  if (key !== 'none') {
    await writeFile(keyFile, `${KEY}\n`);
    await chmod(keyFile, key === 'ok' ? 0o600 : 0o644);
  }
  return { svc: new PhotoService({ dataDir: dir, keyFile, net: new SafeNet(fake.netOptions()) }), dir, keyFile };
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
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', 'ff02::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1', 'bukan-ip']) {
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
    expect(DEFAULT_ALLOWLIST.api).toEqual(['api.pexels.com', 'commons.wikimedia.org', 'api.openverse.org']);
  });

  it('Authorization hanya ke api.pexels.com; redirect lintas host tidak membawa key', async () => {
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
    for (const bad of ['pexels:abc', 'openverse:123', 'wikimedia:abc', 'wikimedia:1234567890123', 'wikimedia:', 'foo', 'unsplash:1', 'pexels:1/../2', 'https://images.pexels.com/x']) expect(parseRef(bad), bad).toBeUndefined();
  });
});

describe('PhotoService.search', () => {
  it('key valid → pexels: kandidat beratribusi + thumbnail; key hanya di header api.pexels.com', async () => {
    const { svc } = await service('ok');
    expect(svc.status()).toEqual({ provider: 'pexels', keyFile: 'present', imported: 0 });
    const r = await svc.search({ query: 'kamar hotel', orientation: 'landscape', limit: 3 });
    expect(r.provider).toBe('pexels');
    expect(r.fallbackReason).toBeUndefined();
    expect(r.results).toHaveLength(3);
    expect(r.results[0]).toEqual({
      ref: 'pexels:2014422',
      width: 4000,
      height: 3000,
      alt: 'Kamar hotel dengan tempat tidur putih',
      avgColor: '#2E7D32',
      creator: 'Rina Wijaya',
      license: 'Pexels License',
      sourcePageUrl: 'https://www.pexels.com/photo/kamar-2014422/',
      credit: 'Foto: Rina Wijaya / Pexels',
    });
    expect(r.thumbnails).toHaveLength(3);
    expect(r.thumbnails[0]).toMatchObject({ ref: 'pexels:2014422', mimeType: 'image/png' });
    const api = fake.requests.filter((x) => x.host === 'api.pexels.com');
    expect(api).toHaveLength(1);
    expect(api[0]!.auth).toBe(KEY);
    const q = new URL(api[0]!.path, 'http://x').searchParams;
    expect(Object.fromEntries(q)).toEqual({ query: 'kamar hotel', per_page: '3', locale: 'id-ID', orientation: 'landscape' });
    expect(fake.requests.filter((x) => x.host !== 'api.pexels.com').every((x) => x.auth === undefined)).toBe(true);
    // Hasil tidak memuat URL unduhan/thumbnail penyedia (tanpa hotlink).
    expect(JSON.stringify(r.results)).not.toMatch(/images\.pexels\.com/);
  });

  it('cache hasil cari: pencarian sama tidak meminta API lagi (thumbnail juga dari cache)', async () => {
    const { svc } = await service('ok');
    await svc.search({ query: 'Kamar Hotel', limit: 2 });
    const before = fake.requests.length;
    const again = await svc.search({ query: 'kamar hotel ', limit: 2 });
    expect(fake.requests.length).toBe(before);
    expect(again.thumbnails).toHaveLength(2);
  });

  it('tanpa key, Wikimedia 5xx → openverse wikimedia-5xx; hanya CC0/PDM/BY dari host allowlist dan ≤ 12 MiB; filter tetap di query', async () => {
    fake.mode.wikimedia = 503;
    const { svc } = await service('none');
    expect(svc.status()).toEqual({ provider: 'wikimedia', keyFile: 'absent', imported: 0 });
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
    expect(fake.requests.some((x) => x.host === 'api.pexels.com')).toBe(false);
  });

  it('key mode 644 → diperlakukan tanpa key: wikimedia key-insecure, status insecure, key tidak dikirim', async () => {
    const { svc } = await service('loose');
    expect(svc.status()).toEqual({ provider: 'wikimedia', keyFile: 'insecure', imported: 0 });
    const r = await svc.search({ query: 'kamar' });
    expect(r).toMatchObject({ provider: 'wikimedia', fallbackReason: 'key-insecure' });
    expect(fake.requests.some((x) => x.auth !== undefined || x.host === 'api.pexels.com')).toBe(false);
  });

  it('key dibaca ulang saat file berubah (tanpa restart)', async () => {
    const { svc, keyFile } = await service('loose');
    expect(svc.status().keyFile).toBe('insecure');
    await chmod(keyFile, 0o600);
    expect(svc.status()).toMatchObject({ provider: 'pexels', keyFile: 'present' });
    await rm(keyFile);
    expect(svc.status()).toMatchObject({ provider: 'wikimedia', keyFile: 'absent' });
  });

  it.each([
    [429, 'pexels-429'],
    [503, 'pexels-5xx'],
    [401, 'pexels-401'],
  ] as const)('Pexels %s → fallback wikimedia (%s)', async (status, reason) => {
    fake.mode.pexels = status;
    const { svc } = await service('ok');
    const r = await svc.search({ query: 'kamar' });
    expect(r).toMatchObject({ provider: 'wikimedia', fallbackReason: reason });
  });

  it('semua gagal → EXEC_ERROR retryable tanpa key di pesan; openverse 429 → hint tunggu', async () => {
    fake.mode.pexels = 500;
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

describe('PhotoService.importRefs', () => {
  it('impor ref hasil cari: aset + meta + indeks; resolve sinkron; impor ulang dan layanan baru tanpa jaringan', async () => {
    const { svc, dir } = await service('ok');
    await svc.search({ query: 'kamar hotel', limit: 3 });
    fake.requests.length = 0;
    await svc.importRefs(['pexels:2014422']);
    // Cache hasil cari → tanpa lookup by-id; unduhan hanya ukuran 2880 terkompres.
    expect(fake.requests.map((r) => r.host)).toEqual(['images.pexels.com']);
    expect(Object.fromEntries(new URL(fake.requests[0]!.path, 'http://x').searchParams)).toEqual({ auto: 'compress', cs: 'tinysrgb', w: '2880' });
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
    const { svc } = await service('ok');
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
    const { svc, dir } = await service('ok');
    const e = await errOf(svc.importRefs([`pexels:${id}`]));
    expect(e).toMatchObject({ code: 'EXEC_ERROR', retryable });
    expect(await filesUnder(join(dir, 'assets'))).toEqual([]);
    expect(svc.resolve(`pexels:${id}`)).toBeUndefined();
    expect(fake.requests.some((r) => r.host === 'evil.example.com')).toBe(false);
  }, 20_000);

  it('redirect ke host allowlist lain diikuti (≤ 3 hop)', async () => {
    const { svc } = await service('ok');
    await svc.importRefs([`pexels:${PEXELS_CASE.redirectOk}`]);
    expect(fake.requests.map((r) => r.host)).toEqual(['api.pexels.com', 'images.pexels.com', 'upload.wikimedia.org']);
    expect(svc.resolve(`pexels:${PEXELS_CASE.redirectOk}`)).toMatchObject({ width: 40, height: 30 });
  });

  it('host gambar resolve ke IP privat → EXEC_ERROR retryable:false, foto tidak tersimpan', async () => {
    const { svc, dir } = await service('ok');
    await svc.search({ query: 'kamar', limit: 1 });
    fake.ipFor.set('images.pexels.com', '10.0.0.7');
    const e = await errOf(svc.importRefs(['pexels:2014422']));
    expect(e).toMatchObject({ code: 'EXEC_ERROR', retryable: false });
    expect(await filesUnder(join(dir, 'assets'))).toEqual([]);
  });

  it('key tidak pernah muncul di status, meta, indeks, atau error', async () => {
    const { svc, dir } = await service('ok');
    await svc.search({ query: 'kamar', limit: 2 });
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

  it('URL impor: asli bila ≤ 3840 & ≤ 12 MiB; selain itu bucket 3840 (JPEG/WebP) / 1920 (PNG); turunan gagal → undefined', () => {
    const t = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/81/X.jpg/330px-X.jpg';
    const url = 'https://upload.wikimedia.org/wikipedia/commons/8/81/X.jpg';
    expect(wikimediaImportUrl({ url, thumbUrl: t, width: 2709, size: 3_000_000, mime: 'image/jpeg' })).toBe(url);
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

  it('impor dari hasil cari: URL asli (tanpa utm) / turunan 3840px / 1920px PNG; meta wikimedia lengkap', async () => {
    const { svc, dir } = await service('none');
    await svc.search({ query: 'shoes', limit: 12 });
    fake.requests.length = 0;
    await svc.importRefs([W(WIKI.cc0), W(WIKI.bySa), W(WIKI.png)]);
    const paths = fake.requests.map((r) => `${r.host}${r.path}`).sort();
    expect(paths).toEqual([
      'thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Running_shoes_on_track.jpg/3840px-Running_shoes_on_track.jpg',
      'thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Sneaker_studio.png/1920px-Sneaker_studio.png',
      'upload.wikimedia.org/wikipedia/commons/a/ab/Shoes_on_wooden_floor.jpg',
    ]);
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
    expect(fake.requests.map((r) => r.host)).toEqual(['commons.wikimedia.org', 'upload.wikimedia.org']);
    expect(new URL(fake.requests[0]!.path, 'http://x').searchParams.get('pageids')).toBe(String(WIKI.cc0));
    const info = svc.resolve(W(WIKI.cc0))!;
    expect(await readAssetMeta(dir, info.assetId)).toMatchObject({
      ref: W(WIKI.cc0),
      provider: 'wikimedia',
      creator: 'Budi',
      license: 'CC0',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File%3AShoes_on_wooden_floor.jpg',
      attribution: '"Shoes on wooden floor" oleh Budi, CC0, via Wikimedia Commons',
      downloadUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Shoes_on_wooden_floor.jpg',
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
