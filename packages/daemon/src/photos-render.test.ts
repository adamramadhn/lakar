// Integrasi foto stok: daemon nyata + Chromium + penyedia palsu lokal. execute dengan photo('<ref>') mengimpor
// foto sebelum snippet, screenshot menampilkannya, dan halaman render tidak pernah meminta host selain 127.0.0.1.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { PhotoService, SafeNet, loadConfig, startDaemon, type RunningDaemon } from './index.js';
import { decodePng } from './png.js';
import { chromiumInstalled } from '../../../tests/support/browser.ts';
import { postJson } from '../../../tests/support/http.ts';
import { PHOTO_RGB, startFakeProviders, type FakeProviders } from '../../../tests/support/photos.ts';

const baseConfig = loadConfig({});
const browsersPath = process.env.LAKAR_BROWSERS_PATH || baseConfig.browsersPath;
const browserInstalled = chromiumInstalled(browsersPath);

let d: RunningDaemon;
let fake: FakeProviders;
let tmp: string;
const external: string[] = [];
const routed = new WeakSet<Page>();
let lastPage: Page | undefined;

/** onLease: catat dan batalkan setiap permintaan halaman render ke host selain 127.0.0.1. */
async function guard(page: Page): Promise<void> {
  lastPage = page;
  if (routed.has(page)) return;
  routed.add(page);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    external.push(url.toString());
    return route.abort();
  });
}

const call = async (path: string, body: unknown, session?: string) => (await postJson(d.url, path, body, session));

describe.skipIf(!browserInstalled)('foto stok: execute → impor → render offline', () => {
  let s: string;

  beforeAll(async () => {
    fake = await startFakeProviders();
    tmp = await mkdtemp(join(tmpdir(), 'lakar-photo-render-'));
    const keyFile = join(tmp, 'pexels-api-key');
    await writeFile(keyFile, 'TESTKEYabcdef0123456789\n');
    await chmod(keyFile, 0o600);
    const dataDir = join(tmp, 'data');
    const photos = new PhotoService({ dataDir, keyFile, net: new SafeNet(fake.netOptions()) });
    d = await startDaemon({ ...baseConfig, port: 0, dataDir, browsersPath, pexelsKeyFile: keyFile }, { photos, onLease: guard });
    await d.warmed;
    s = (await call('/sessions', {})).body.data.sessionId as string;
    await call('/docs/open', { slug: 'foto-uji' }, s);
  }, 60_000);

  afterAll(async () => {
    await d?.close();
    await fake?.close();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it('/status.photos dan POST /photos/search (kandidat + thumbnail base64)', async () => {
    const st = await fetch(`${d.url}/status`).then((r) => r.json() as Promise<{ data: { photos: unknown } }>);
    expect(st.data.photos).toEqual({ provider: 'pexels', keyFile: 'present', imported: 0 });
    const r = await call('/photos/search', { query: 'kamar hotel', limit: 2 }, s);
    expect(r.status, JSON.stringify(r.body.error)).toBe(200);
    expect(r.body.data).toMatchObject({ provider: 'pexels', query: 'kamar hotel', results: [{ ref: 'pexels:2014422' }, { ref: 'pexels:2014423' }] });
    expect(r.body.data.thumbnails).toHaveLength(2);
    expect(Buffer.from(r.body.data.thumbnails[0].data, 'base64').subarray(1, 4).toString()).toBe('PNG');
    for (const bad of [{}, { query: '' }, { query: 'x'.repeat(101) }, { query: 'x', limit: 13 }, { query: 'x', orientation: 'miring' }, { query: 'x', url: 'https://a' }]) {
      expect((await call('/photos/search', bad, s)).body.error?.code, JSON.stringify(bad)).toBe('SCHEMA_INVALID');
    }
  });

  it('execute photo(ref literal) → foto di kartu; render tanpa permintaan luar; fetch luar dari halaman gagal', async () => {
    const code = [
      "const b = add(null, {type:'board', name:'Foto', x:0, y:0, width:390, height:844, screen:'mobile'});",
      "const p = photo('pexels:2014422');",
      "const k = add(b, {type:'frame', name:'Kartu', layout:'column', gap:8, padding:16, width:'fill'});",
      "add(k, {type:'rect', name:'Image / Kamar', width:200, height:120, fills:[{type:'image', assetId:p.assetId, fit:'cover'}]});",
      "add(k, {type:'text', name:'Kredit', content:p.credit, size:12, lineHeight:16});",
      'p',
    ].join('\n');
    const r = await call('/execute', { code, description: 'kartu dengan foto kamar' }, s);
    expect(r.status, JSON.stringify(r.body.error)).toBe(200);
    expect(r.body.data.value).toMatchObject({ assetId: expect.stringMatching(/^[a-f0-9]{64}$/), width: 64, height: 48, credit: 'Foto: Rina Wijaya / Pexels' });
    // Aset tersaji; metadata sidecar tidak.
    const assetId = r.body.data.value.assetId as string;
    expect((await fetch(`${d.url}/assets/${assetId}`)).status).toBe(200);
    for (const path of ['/assets/meta', `/assets/meta%2F${assetId}.json`, `/assets/${assetId}.json`]) expect((await fetch(`${d.url}${path}`)).status, path).toBe(404);
    const boardId = r.body.data.created[0].id as string;
    const shot = await call('/screenshot', { boardId }, s);
    expect(shot.status).toBe(200);
    const img = decodePng(Buffer.from(shot.body.data.png, 'base64'));
    // Rect 200×120 di (16,16): titik tengahnya = warna foto uji.
    const at = (x: number, y: number) => [...img.pixels.subarray((y * img.width + x) * img.channels, (y * img.width + x) * img.channels + 3)];
    const [r0, g0, b0] = at(116, 76);
    expect(Math.abs(r0! - PHOTO_RGB[0]) + Math.abs(g0! - PHOTO_RGB[1]) + Math.abs(b0! - PHOTO_RGB[2])).toBeLessThan(12);
    expect(external).toEqual([]);

    // Impor ulang ref yang sama: tanpa permintaan jaringan.
    fake.requests.length = 0;
    const again = await call('/execute', { code: "photo('pexels:2014422').assetId", description: 'baca ulang foto kamar' }, s);
    expect(again.status).toBe(200);
    expect(fake.requests).toEqual([]);

    // Halaman render tidak bisa menjangkau host luar (route dibatalkan + resolver Chromium diblokir).
    const page = lastPage!;
    const viaRoute = await page.evaluate(() => fetch('https://images.pexels.com/').then(() => 'ok', () => 'gagal'));
    expect(viaRoute).toBe('gagal');
    expect(external).toEqual(['https://images.pexels.com/']);
    await page.unrouteAll();
    routed.delete(page);
    // `no-cors` agar kegagalan bukan karena CORS; errorText membuktikan resolver Chromium yang menolak.
    const failed = new Promise<string>((res) => page.once('requestfailed', (r) => res(r.failure()?.errorText ?? '')));
    const viaResolver = await page.evaluate(() => fetch('https://images.pexels.com/', { mode: 'no-cors' }).then(() => 'ok', () => 'gagal'));
    expect(viaResolver).toBe('gagal');
    expect(await failed).toMatch(/ERR_NAME_NOT_RESOLVED/);
  }, 60_000);

  it('ref dinamis → NOT_FOUND + editId; ref tak dikenal → NOT_FOUND; format salah → SCHEMA_INVALID', async () => {
    const dyn = await call('/execute', { code: "const x = 'pexels:' + '2014499'; photo(x)", description: 'foto dengan ref dinamis' }, s);
    expect(dyn.body.error).toMatchObject({ code: 'NOT_FOUND', editId: expect.any(String) });
    expect(dyn.body.error!.hint).toMatch(/literal/);
    const unknown = await call('/execute', { code: "photo('pexels:777')", description: 'foto dengan ref asing' }, s);
    expect(unknown.body.error).toMatchObject({ code: 'NOT_FOUND', editId: expect.any(String) });
    const bad = await call('/execute', { code: "photo('foo')", description: 'foto dengan ref salah' }, s);
    expect(bad.body.error?.code).toBe('SCHEMA_INVALID');
  }, 30_000);
});
