// Foto stok: SafeNet (SSRF), adaptor penyedia, dan PhotoService terhadap penyedia palsu lokal (tanpa jaringan).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { LakarError } from '@lakar/schema';
import { DEFAULT_ALLOWLIST, NetError, SafeNet, isBlockedIp } from './net.js';
import { PhotoService } from './service.js';
import { parseRef } from './providers.js';
import { imageSize, readAssetMeta } from '../assets.js';
import { OV_BY, OV_CC0, PEXELS_CASE, PHOTO_PNG, startFakeProviders, type FakeProviders } from '../../../../tests/support/photos.ts';

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
  fake.mode.openverse = 'ok';
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
    for (const [kind, url] of [
      ['image', 'http://images.pexels.com/a.jpg'],
      ['image', 'https://images.pexels.com:8443/a.jpg'],
      ['image', 'https://u:p@images.pexels.com/a.jpg'],
      ['image', 'https://api.openverse.org/v1/images/x/thumb/'],
      ['image', 'https://images.pexels.com.evil.com/a.jpg'],
      ['image', 'https://farm4.staticflickr.com.evil.com/a.jpg'],
      ['api', 'https://images.pexels.com/a.jpg'],
      ['api', 'file:///etc/passwd'],
      ['api', 'bukan url'],
    ] as const) {
      expect(() => net.check(kind, url), url).toThrow(NetError);
    }
    expect(DEFAULT_ALLOWLIST.api).toEqual(['api.pexels.com', 'api.openverse.org']);
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
    for (const bad of ['pexels:abc', 'openverse:123', 'foo', 'unsplash:1', 'pexels:1/../2', 'https://images.pexels.com/x']) expect(parseRef(bad), bad).toBeUndefined();
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

  it('tanpa key → openverse no-key; hanya CC0/PDM/BY dari host allowlist dan ≤ 12 MiB; filter tetap di query', async () => {
    const { svc } = await service('none');
    expect(svc.status()).toEqual({ provider: 'openverse', keyFile: 'absent', imported: 0 });
    const r = await svc.search({ query: 'hotel room', orientation: 'landscape' });
    expect(r).toMatchObject({ provider: 'openverse', fallbackReason: 'no-key' });
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

  it('key mode 644 → diperlakukan tanpa key: openverse key-insecure, status insecure, key tidak dikirim', async () => {
    const { svc } = await service('loose');
    expect(svc.status()).toEqual({ provider: 'openverse', keyFile: 'insecure', imported: 0 });
    const r = await svc.search({ query: 'kamar' });
    expect(r).toMatchObject({ provider: 'openverse', fallbackReason: 'key-insecure' });
    expect(fake.requests.some((x) => x.auth !== undefined || x.host === 'api.pexels.com')).toBe(false);
  });

  it('key dibaca ulang saat file berubah (tanpa restart)', async () => {
    const { svc, keyFile } = await service('loose');
    expect(svc.status().keyFile).toBe('insecure');
    await chmod(keyFile, 0o600);
    expect(svc.status()).toMatchObject({ provider: 'pexels', keyFile: 'present' });
    await rm(keyFile);
    expect(svc.status()).toMatchObject({ provider: 'openverse', keyFile: 'absent' });
  });

  it.each([
    [429, 'pexels-429'],
    [503, 'pexels-5xx'],
    [401, 'pexels-401'],
  ] as const)('Pexels %s → fallback openverse (%s)', async (status, reason) => {
    fake.mode.pexels = status;
    const { svc } = await service('ok');
    const r = await svc.search({ query: 'kamar' });
    expect(r).toMatchObject({ provider: 'openverse', fallbackReason: reason });
  });

  it('keduanya gagal → EXEC_ERROR retryable tanpa key di pesan; openverse 429 → hint tunggu', async () => {
    fake.mode.pexels = 500;
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
