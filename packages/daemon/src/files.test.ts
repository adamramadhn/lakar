// Kelola file dari aplikasi (aplikasi 1): POST /viewer/docs, rename, duplicate, archive/unarchive, DELETE, GET /viewer/archive.
// Seluruh matriks I/O spec; RenderPort palsu (execute butuh check board tersentuh).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDocument, transact } from '@lakar/core';
import { LakarError } from '@lakar/schema';
import { ASSET_UPLOAD_MAX, buildServer, exportFileName, loadConfig, slugify, withSuffix } from './index.js';
import { solidPng } from './assets.js';
import { readPngSize } from './png.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const fakeRender = {
  screenshot: async () => new Uint8Array(PNG_1x1),
  measure: async (doc: any, boardId: string) => {
    const b = doc.pages.flatMap((p: any) => p.children).find((x: any) => x.id === boardId);
    return { width: b.width, height: b.height, nodes: [], texts: [] };
  },
} as never;

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-files-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function setup() {
  const dataDir = await mkdtemp(join(root, 'data-'));
  const daemon = buildServer({ config: { ...baseConfig, port: 0, dataDir }, render: fakeRender });
  const { app } = daemon;
  const docsDir = join(dataDir, 'docs');
  const archiveDir = join(docsDir, 'archive');
  const post = (url: string, payload?: unknown, session?: string) =>
    app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers: session ? { 'x-lakar-session': session } : {} });
  const get = (url: string) => app.inject({ method: 'GET', url });
  const del = (url: string) => app.inject({ method: 'DELETE', url });
  const create = async (name: string, board: unknown = { preset: 'desktop' }) => {
    const r = await post('/viewer/docs', { name, board });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as { slug: string; rev: number };
  };
  const session = async () => (await post('/sessions', { client: 'claude-code' })).json().data.sessionId as string;
  const listed = async () => ((await get('/viewer/docs')).json().data.docs as { slug: string }[]).map((d) => d.slug).sort();
  const archived = async () => ((await get('/viewer/archive')).json().data.docs as { slug: string }[]).map((d) => d.slug).sort();
  const docFile = (slug: string, dir = docsDir) => join(dir, `${slug}.lakar.json`);
  const histFile = (slug: string, dir = docsDir) => join(dir, `${slug}.history.jsonl`);
  const history = async (slug: string, dir = docsDir) =>
    (await readFile(histFile(slug, dir), 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  return { ...daemon, dataDir, docsDir, archiveDir, post, get, del, create, session, listed, archived, docFile, histFile, history };
}

const BOARD = `add(null,{type:'board',name:'Extra',x:2000,y:0,width:390,height:844,screen:'mobile'})`;

describe('slugify / withSuffix', () => {
  it('nama → kebab-case; diakritik dibuang; kosong bila tidak ada huruf/angka', () => {
    expect(slugify('My Landing')).toBe('my-landing');
    expect(slugify('  Café — Menu 2  ')).toBe('cafe-menu-2');
    expect(slugify('--a__b--')).toBe('a-b');
    expect(slugify('!!!')).toBe('');
    expect(slugify('x'.repeat(80))).toHaveLength(64);
  });
  it('sufiks -n tetap ≤ 64 karakter', () => {
    expect(withSuffix('a', 1)).toBe('a');
    expect(withSuffix('a', 2)).toBe('a-2');
    expect(withSuffix('x'.repeat(64), 12)).toBe(`${'x'.repeat(61)}-12`);
  });
});

describe('POST /viewer/docs (New file)', () => {
  it('My Landing + desktop → my-landing rev 1; file + riwayat "Created file"; board 1440×900 landing berfill putih', async () => {
    const t = await setup();
    const r = await t.post('/viewer/docs', { name: 'My Landing', board: { preset: 'desktop' } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, data: { slug: 'my-landing', rev: 1 } });
    const doc = JSON.parse(await readFile(t.docFile('my-landing'), 'utf8'));
    expect(doc.rev).toBe(1);
    const boards = doc.pages.flatMap((p: any) => p.children);
    expect(boards).toHaveLength(1);
    expect(boards[0]).toMatchObject({ type: 'board', name: 'Desktop', width: 1440, height: 900, screen: 'landing', fills: [{ type: 'solid', color: '#FFFFFF' }] });
    const h = await t.history('my-landing');
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ rev: 1, description: 'Created file', sessionId: 'lakar-viewer' });
    expect(await t.listed()).toEqual(['my-landing']);
    // Riwayat viewer: entri aplikasi dikenali sebagai lakar-viewer.
    const vh = (await t.get('/viewer/docs/my-landing/history')).json().data.entries;
    expect(vh[0]).toMatchObject({ rev: 1, description: 'Created file', client: 'lakar-viewer' });
  });

  it.each([
    [{ preset: 'tablet' }, { name: 'Tablet', width: 768, height: 1024, screen: 'app' }],
    [{ preset: 'mobile' }, { name: 'Mobile', width: 375, height: 812, screen: 'mobile' }],
    [{ preset: 'custom', width: 1, height: 10000 }, { name: 'Custom', width: 1, height: 10000, screen: 'app' }],
  ])('preset %j', async (board, expected) => {
    const t = await setup();
    const { slug } = await t.create('Board', board);
    const doc = (await t.get(`/viewer/docs/${slug}`)).json().data.doc;
    expect(doc.pages[0].children[0]).toMatchObject(expected);
  });

  it('nama bentrok → -2, -3 (termasuk slug yang hanya ada di memori agen)', async () => {
    const t = await setup();
    expect((await t.create('My Landing')).slug).toBe('my-landing');
    expect((await t.create('my landing')).slug).toBe('my-landing-2');
    expect((await t.create('MY-LANDING')).slug).toBe('my-landing-3');
  });

  it('nama tidak valid / body salah → 400 SCHEMA_INVALID, file tidak dibuat', async () => {
    const t = await setup();
    for (const body of [{ name: '!!!' }, { name: '' }, { name: 'ok', board: { preset: 'custom', width: 0, height: 10 } }, { name: 'ok', board: { preset: 'custom', width: 10001, height: 10 } }, { name: 'ok', board: { preset: 'watch' } }, { name: 'ok', extra: 1 }]) {
      const r = await t.post('/viewer/docs', body);
      expect(r.statusCode, JSON.stringify(body)).toBe(400);
      expect(r.json().error.code).toBe('SCHEMA_INVALID');
    }
    expect(await t.listed()).toEqual([]);
    expect(existsSync(t.docsDir) ? await t.listed() : []).toEqual([]);
  });

  it('riwayat yatim di slug baru dibuang (tidak tercampur)', async () => {
    const t = await setup();
    await t.create('seed');
    await writeFile(t.histFile('ghost'), `${JSON.stringify({ rev: 1, sessionId: 'x', description: 'lama', opsSummary: 'add×1', at: 'x' })}\n`);
    await t.create('ghost');
    expect((await t.history('ghost')).map((e) => e.description)).toEqual(['Created file']);
  });
});

describe('rename', () => {
  it('sesi agen aktif di a, rename a→b: sesi pindah ke b, execute berikut menulis ke b; file + riwayat pindah', async () => {
    const t = await setup();
    await t.create('alpha');
    const s = await t.session();
    expect((await t.post('/docs/open', { slug: 'alpha' }, s)).statusCode).toBe(200);
    const r = await t.post('/viewer/docs/alpha/rename', { name: 'Beta' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual({ slug: 'beta', from: 'alpha' });
    expect(existsSync(t.docFile('alpha'))).toBe(false);
    expect(existsSync(t.histFile('alpha'))).toBe(false);
    expect(await t.listed()).toEqual(['beta']);
    expect(t.sessions.byId(s)!.activeSlug).toBe('beta');
    const ex = await t.post('/execute', { code: BOARD, description: 'tambah board ekstra mobile' }, s);
    expect(ex.statusCode, ex.body).toBe(200);
    expect(ex.json().data.rev).toBe(2);
    const doc = JSON.parse(await readFile(t.docFile('beta'), 'utf8'));
    expect(doc.rev).toBe(2);
    expect(existsSync(t.docFile('alpha'))).toBe(false);
    expect((await t.history('beta')).map((e) => e.rev)).toEqual([1, 2]);
  });

  it('target sudah ada → 409 CONFLICT; slug tidak ada → 404; nama tidak valid → 400; nama sama → no-op', async () => {
    const t = await setup();
    await t.create('a');
    await t.create('b');
    const c = await t.post('/viewer/docs/a/rename', { name: 'B' });
    expect(c.statusCode).toBe(409);
    expect(c.json().error.code).toBe('CONFLICT');
    expect((await t.post('/viewer/docs/zz/rename', { name: 'q' })).statusCode).toBe(404);
    expect((await t.post('/viewer/docs/a/rename', { name: '???' })).statusCode).toBe(400);
    expect((await t.post('/viewer/docs/a/rename', { name: 'A' })).json().data).toEqual({ slug: 'a', from: 'a' });
    expect(await t.listed()).toEqual(['a', 'b']);
  });
});

describe('delete', () => {
  it('sesi agen aktif di a: file + riwayat hilang; execute → NO_ACTIVE_DOC dan tidak menghidupkan file lagi', async () => {
    const t = await setup();
    await t.create('a');
    const s = await t.session();
    await t.post('/docs/open', { slug: 'a' }, s);
    const r = await t.del('/viewer/docs/a');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual({ slug: 'a', deleted: true });
    expect(existsSync(t.docFile('a'))).toBe(false);
    expect(existsSync(t.histFile('a'))).toBe(false);
    const ex = await t.post('/execute', { code: BOARD, description: 'tambah board ekstra mobile' }, s);
    expect(ex.statusCode).toBe(409);
    expect(ex.json().error.code).toBe('NO_ACTIVE_DOC');
    expect(existsSync(t.docFile('a'))).toBe(false);
    expect(await t.listed()).toEqual([]);
  });

  it('slug tidak ada → 404; slug tidak valid → 400', async () => {
    const t = await setup();
    expect((await t.del('/viewer/docs/nope')).statusCode).toBe(404);
    expect((await t.del('/viewer/docs/Bad%20Slug')).statusCode).toBe(400);
  });
});

describe('archive / unarchive', () => {
  it('a pindah ke archive (hilang dari daftar, muncul di arsip) lalu kembali; sesi agen dikosongkan', async () => {
    const t = await setup();
    await t.create('a');
    await t.create('keep');
    const s = await t.session();
    await t.post('/docs/open', { slug: 'a' }, s);
    expect((await t.post('/viewer/docs/a/archive')).json()).toEqual({ ok: true, data: { slug: 'a' } });
    expect(await t.listed()).toEqual(['keep']);
    expect(await t.archived()).toEqual(['a']);
    expect(existsSync(t.docFile('a', t.archiveDir))).toBe(true);
    expect(existsSync(t.histFile('a', t.archiveDir))).toBe(true);
    expect(t.sessions.byId(s)!.activeSlug).toBeUndefined();
    expect((await t.post('/execute', { code: BOARD, description: 'tambah board ekstra mobile' }, s)).json().error.code).toBe('NO_ACTIVE_DOC');
    expect(existsSync(t.docFile('a'))).toBe(false);

    expect((await t.post('/viewer/docs/a/unarchive')).statusCode).toBe(200);
    expect(await t.listed()).toEqual(['a', 'keep']);
    expect(await t.archived()).toEqual([]);
    expect((await t.history('a')).map((e) => e.description)).toEqual(['Created file']);
  });

  it('bentrok nama saat unarchive → 409; arsip berisi slug sama → 409; tidak ada → 404', async () => {
    const t = await setup();
    await t.create('a');
    await t.post('/viewer/docs/a/archive');
    // New file tidak lagi memakai slug arsip (jadi a-2); bentrok tetap mungkin lewat open_doc agen.
    expect((await t.create('a')).slug).toBe('a-2');
    const s = await t.session();
    expect((await t.post('/docs/open', { slug: 'a' }, s)).statusCode).toBe(200);
    const u = await t.post('/viewer/docs/a/unarchive');
    expect(u.statusCode).toBe(409);
    expect(u.json().error.code).toBe('CONFLICT');
    expect((await t.post('/viewer/docs/a/archive')).statusCode).toBe(409);
    expect((await t.post('/viewer/docs/zz/archive')).statusCode).toBe(404);
    expect((await t.post('/viewer/docs/zz/unarchive')).statusCode).toBe(404);
  });

  it('DELETE ?archived=true menghapus dari arsip saja', async () => {
    const t = await setup();
    await t.create('a');
    await t.post('/viewer/docs/a/archive');
    expect((await t.del('/viewer/docs/a')).statusCode).toBe(404);
    expect((await t.del('/viewer/docs/a?archived=true')).statusCode).toBe(200);
    expect(await t.archived()).toEqual([]);
    expect(existsSync(t.histFile('a', t.archiveDir))).toBe(false);
  });

  it('GET /viewer/archive tanpa direktori arsip → []', async () => {
    const t = await setup();
    expect((await t.get('/viewer/archive')).json()).toEqual({ ok: true, data: { docs: [] } });
  });
});

describe('duplicate', () => {
  it('a → a-copy lalu a-copy-2: id dokumen baru, rev 0, riwayat baru "Duplicated from a"', async () => {
    const t = await setup();
    await t.create('a');
    const r = await t.post('/viewer/docs/a/duplicate');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual({ slug: 'a-copy', rev: 0 });
    expect((await t.post('/viewer/docs/a/duplicate')).json().data.slug).toBe('a-copy-2');
    const src = JSON.parse(await readFile(t.docFile('a'), 'utf8'));
    const copy = JSON.parse(await readFile(t.docFile('a-copy'), 'utf8'));
    expect(copy.rev).toBe(0);
    expect(copy.id).not.toBe(src.id);
    expect(copy.pages).toEqual(src.pages);
    expect(await t.history('a-copy')).toEqual([expect.objectContaining({ rev: 0, description: 'Duplicated from a', sessionId: 'lakar-viewer' })]);
    expect(await t.listed()).toEqual(['a', 'a-copy', 'a-copy-2']);
    // Salinan bisa dibuka dan diedit agen.
    const s = await t.session();
    expect((await t.post('/docs/open', { slug: 'a-copy' }, s)).json().data).toMatchObject({ rev: 0, created: false });
    expect((await t.post('/execute', { code: BOARD, description: 'tambah board ekstra mobile' }, s)).json().data.rev).toBe(1);
    expect((await t.post('/viewer/docs/nope/duplicate')).statusCode).toBe(404);
  });
});

describe('route lama tidak berubah', () => {
  it('/docs/open slug baru tetap membuat dokumen kosong rev 0', async () => {
    const t = await setup();
    const s = await t.session();
    expect((await t.post('/docs/open', { slug: 'fresh' }, s)).json().data).toMatchObject({ slug: 'fresh', rev: 0, created: true });
  });
});

describe('POST /viewer/docs/:slug/export (aplikasi 2)', () => {
  /** PNG tiruan: signature + IHDR berukuran board × scale (cukup untuk readPngSize). */
  const pngOf = (width: number, height: number): Uint8Array => {
    const b = Buffer.alloc(33);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b, 0);
    b.writeUInt32BE(13, 8);
    b.write('IHDR', 12, 'latin1');
    b.writeUInt32BE(width, 16);
    b.writeUInt32BE(height, 20);
    return new Uint8Array(b);
  };
  const calls: { boardId: string; opts: unknown }[] = [];
  const sizedRender = {
    screenshot: async (doc: any, boardId: string, opts: { scale?: number } = {}) => {
      calls.push({ boardId, opts });
      const b = doc.pages.flatMap((p: any) => p.children).find((x: any) => x.id === boardId);
      const s = opts.scale ?? 1;
      return pngOf(b.width * s, b.height * s);
    },
    measure: (fakeRender as any).measure,
  } as never;

  async function exportSetup(render: never = sizedRender) {
    const dataDir = await mkdtemp(join(root, 'export-'));
    const { app } = buildServer({ config: { ...baseConfig, port: 0, dataDir }, render });
    const post = (url: string, payload?: unknown) => app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}) });
    // Dokumen ditulis langsung ke disk (tanpa commit/fsync) supaya tes ini juga jalan di Windows.
    const committed = await transact(createDocument(), { sessionId: 'test', description: 'seed' }, (tx) => {
      tx.add(null, { type: 'board', name: 'Desktop', x: 0, y: 0, width: 1440, height: 900, screen: 'landing' });
    });
    await mkdir(join(dataDir, 'docs'), { recursive: true });
    await writeFile(join(dataDir, 'docs', 'my-landing.lakar.json'), JSON.stringify(committed.doc));
    return { app, post, dataDir, boardId: committed.doc.pages[0]!.children[0]!.id };
  }

  it('board 1440×900, scale 2 → PNG 2880×1800 sebagai lampiran; tidak menulis ke <dataDir>/exports', async () => {
    const t = await exportSetup();
    const r = await t.post('/viewer/docs/my-landing/export', { boardId: t.boardId, scale: 2 });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.headers['content-type']).toBe('image/png');
    expect(r.headers['content-disposition']).toBe('attachment; filename="my-landing-desktop@2x.png"');
    expect(readPngSize(r.rawPayload)).toEqual({ width: 2880, height: 1800 });
    expect(calls.at(-1)).toEqual({ boardId: t.boardId, opts: { scale: 2 } });
    expect(existsSync(join(t.dataDir, 'exports'))).toBe(false);
  });

  it('scale 1 → ukuran asli, nama @1x', async () => {
    const t = await exportSetup();
    const r = await t.post('/viewer/docs/my-landing/export', { boardId: t.boardId, scale: 1 });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toContain('my-landing-desktop@1x.png');
    expect(readPngSize(r.rawPayload)).toEqual({ width: 1440, height: 900 });
  });

  it('boardId salah / dokumen tidak ada → 404 NOT_FOUND', async () => {
    const t = await exportSetup();
    const bad = await t.post('/viewer/docs/my-landing/export', { boardId: 'nope', scale: 1 });
    expect(bad.statusCode).toBe(404);
    expect(bad.json().error.code).toBe('NOT_FOUND');
    const gone = await t.post('/viewer/docs/ghost/export', { boardId: t.boardId, scale: 1 });
    expect(gone.statusCode).toBe(404);
  });

  it('body tidak valid (scale 3, tanpa boardId) → 400 SCHEMA_INVALID', async () => {
    const t = await exportSetup();
    expect((await t.post('/viewer/docs/my-landing/export', { boardId: t.boardId, scale: 3 })).statusCode).toBe(400);
    expect((await t.post('/viewer/docs/my-landing/export', { scale: 1 })).json().error.code).toBe('SCHEMA_INVALID');
  });

  it('render gagal (browser tidak ada) → 503 RENDER_FAILED retryable', async () => {
    const broken = {
      ...(sizedRender as object),
      screenshot: async () => {
        throw new LakarError('RENDER_FAILED', 'Chrome atau Edge tidak ditemukan', { hint: 'pasang Chrome atau Edge', retryable: true });
      },
    } as never;
    const t = await exportSetup(broken);
    const r = await t.post('/viewer/docs/my-landing/export', { boardId: t.boardId, scale: 1 });
    expect(r.statusCode).toBe(503);
    expect(r.json().error).toMatchObject({ code: 'RENDER_FAILED', retryable: true });
  });

  it('exportFileName: nama board di-slugify; kosong → id board', () => {
    expect(exportFileName('shop', { id: 'b1', name: 'Hero / Mobile' }, 2)).toBe('shop-hero-mobile@2x.png');
    expect(exportFileName('shop', { id: 'B1', name: '!!!' }, 1)).toBe('shop-b1@1x.png');
  });
});

// Layer manual (aplikasi 4): unggah gambar mentah untuk node Image.
describe('POST /viewer/assets', () => {
  const upload = (app: Awaited<ReturnType<typeof setup>>['app'], payload: Buffer, type = 'application/octet-stream') =>
    app.inject({ method: 'POST', url: '/viewer/assets', payload, headers: { 'content-type': type } });

  it('PNG 1200×800 → aset tersimpan {assetId, width, height}; bisa dipakai fill image lewat execute', async () => {
    const t = await setup();
    const png = solidPng(1200, 800, [200, 100, 50]);
    const r = await upload(t.app, png, 'image/png');
    expect(r.statusCode, r.body).toBe(200);
    const data = r.json().data;
    expect(data).toMatchObject({ width: 1200, height: 800, mime: 'image/png' });
    expect(data.assetId).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(join(t.dataDir, 'assets', data.assetId))).toBe(true);
    const served = await t.get(`/assets/${data.assetId}`);
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    // Unggah ulang byte sama → assetId sama (idempoten); octet-stream juga diterima.
    expect((await upload(t.app, png)).json().data.assetId).toBe(data.assetId);

    const { slug } = await t.create('Assets');
    const s = await t.session();
    expect((await t.post('/docs/open', { slug }, s)).statusCode).toBe(200);
    const board = (await t.get(`/viewer/docs/${slug}`)).json().data.doc.pages[0].children[0].id as string;
    const code = `add(${JSON.stringify(board)}, ${JSON.stringify({ type: 'rect', name: 'Image', position: 'absolute', x: 10, y: 10, width: 400, height: 267, fills: [{ type: 'image', assetId: data.assetId, fit: 'cover' }] })})`;
    const ex = await t.post('/execute', { code, description: 'Insert image into Desktop board' }, s);
    expect(ex.statusCode, ex.body).toBe(200);
    expect(ex.json().data.rev).toBe(2);
  });

  it('bukan gambar → 400 SCHEMA_INVALID; body kosong → 400', async () => {
    const t = await setup();
    const r = await upload(t.app, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml');
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('SCHEMA_INVALID');
    expect((await upload(t.app, Buffer.from('hello'))).json().error.code).toBe('SCHEMA_INVALID');
    expect((await upload(t.app, Buffer.alloc(0))).statusCode).toBe(400);
  });

  it('> 20 MB → 413; route JSON lain tetap dibatasi 1 MB (400)', async () => {
    const t = await setup();
    const big = Buffer.concat([PNG_1x1, Buffer.alloc(ASSET_UPLOAD_MAX)]);
    const r = await upload(t.app, big, 'image/png');
    expect(r.statusCode).toBe(413);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'SCHEMA_INVALID' } });
    // Gambar < 20 MB tapi > 1 MB diterima (batas khusus route ini).
    const mid = Buffer.concat([PNG_1x1, Buffer.alloc(2 * 1024 * 1024)]);
    expect((await upload(t.app, mid, 'image/png')).statusCode).toBe(200);
    const json = await t.post('/viewer/docs', { name: 'x'.repeat(2 * 1024 * 1024) });
    expect(json.statusCode).toBe(400);
  });
});

describe('GET /viewer/icons/:lib/:icon', () => {
  it('glyph katalog → SVG; tidak dikenal → 404', async () => {
    const t = await setup();
    const r = await t.get('/viewer/icons/lucide/star');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toMatch(/^image\/svg\+xml/);
    expect(r.body).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 24 24"/);
    expect(r.body).toContain('<path');
    expect((await t.get('/viewer/icons/lucide/no-such-icon-xyz')).statusCode).toBe(404);
    expect((await t.get('/viewer/icons/evil/star')).statusCode).toBe(404);
  });
});

describe('execute antre di belakang kelola file', () => {
  /** Server dengan measure lambat: execute pertama memegang kunci dokumen selama check. */
  async function slowSetup() {
    const t = await setup();
    await t.app.close();
    const slow = {
      screenshot: async () => new Uint8Array(PNG_1x1),
      measure: async (doc: any, boardId: string) => {
        await new Promise((r) => setTimeout(r, 150));
        const b = doc.pages.flatMap((p: any) => p.children).find((x: any) => x.id === boardId);
        return { width: b.width, height: b.height, nodes: [], texts: [] };
      },
    } as never;
    const { app } = buildServer({ config: { ...baseConfig, port: 0, dataDir: t.dataDir }, render: slow });
    const post = (url: string, payload?: unknown, session?: string) =>
      app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers: session ? { 'x-lakar-session': session } : {} });
    const slug = (await post('/viewer/docs', { name: 'Queued' })).json().data.slug as string;
    const s = (await post('/sessions', { client: 'claude-code' })).json().data.sessionId as string;
    expect((await post('/docs/open', { slug }, s)).statusCode).toBe(200);
    const exec = (n: number) => post('/execute', { code: `add(null,{type:'board',name:'B${n}',x:${n * 500},y:0,width:10,height:10,screen:'mobile'})`, description: `tambah board antre nomor ${n}` }, s);
    return { app, post, slug, s, exec, docsDir: t.docsDir, docFile: t.docFile };
  }
  const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it.each(['rename', 'delete'] as const)('%s antre di antara dua execute → execute kedua NO_ACTIVE_DOC, slug lama tidak dibuat ulang', async (op) => {
    const t = await slowSetup();
    try {
      const first = t.exec(1);
      await tick(30);
      const mutate = op === 'rename' ? t.post(`/viewer/docs/${t.slug}/rename`, { name: 'Moved' }) : t.app.inject({ method: 'DELETE', url: `/viewer/docs/${t.slug}` });
      await tick(30);
      const second = t.exec(2);
      const [a, m, b] = await Promise.all([first, mutate, second]);
      expect(a.statusCode, a.body).toBe(200);
      expect(m.statusCode, m.body).toBe(200);
      expect(b.statusCode, b.body).not.toBe(500);
      expect(b.json().error.code).toBe('NO_ACTIVE_DOC');
      expect(existsSync(t.docFile(t.slug))).toBe(false);
      if (op === 'rename') expect(existsSync(t.docFile('moved'))).toBe(true);
    } finally {
      await t.app.close();
    }
  });
});

describe('Origin route tulis /viewer/*', () => {
  it('Origin asing → 403; origin daemon sendiri dan tanpa Origin → boleh; GET tidak diperiksa', async () => {
    const dataDir = await mkdtemp(join(root, 'origin-'));
    const { app } = buildServer({ config: { ...baseConfig, port: 7466, dataDir }, render: fakeRender });
    try {
      const post = (origin?: string) =>
        app.inject({ method: 'POST', url: '/viewer/docs', payload: { name: 'Origin Test' }, headers: origin ? { origin } : {} });
      const evil = await post('https://evil.example');
      expect(evil.statusCode).toBe(403);
      expect(evil.json()).toMatchObject({ ok: false, error: { code: 'SCHEMA_INVALID' } });
      expect((await post('http://127.0.0.1:9999')).statusCode).toBe(403);
      expect((await post('null')).statusCode).toBe(403);
      expect((await app.inject({ method: 'DELETE', url: '/viewer/docs/x', headers: { origin: 'https://evil.example' } })).statusCode).toBe(403);
      expect((await post('http://127.0.0.1:7466')).statusCode).toBe(200);
      expect((await post('http://localhost:7466')).statusCode).toBe(200);
      expect((await post()).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/viewer/docs', headers: { origin: 'https://evil.example' } })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('slug arsip dianggap terpakai', () => {
  it('New file/duplicate/rename tidak memakai slug milik file arsip; Unarchive sesudahnya tidak bentrok', async () => {
    const t = await setup();
    await t.create('Shelf');
    expect((await t.post('/viewer/docs/shelf/archive')).statusCode).toBe(200);
    expect((await t.create('Shelf')).slug).toBe('shelf-2');
    await t.create('Other');
    const ren = await t.post('/viewer/docs/other/rename', { name: 'Shelf' });
    expect(ren.statusCode).toBe(409);
    expect(ren.json().error.code).toBe('CONFLICT');
    await t.create('Book');
    expect((await t.post('/viewer/docs/book/archive')).statusCode).toBe(200);
    await t.create('Bk');
    expect((await t.post('/viewer/docs/bk/rename', { name: 'Book copy' })).json().data.slug).toBe('book-copy');
    expect((await t.post('/viewer/docs/book-copy/archive')).statusCode).toBe(200);
    await t.create('Book');
    expect((await t.post('/viewer/docs/book-2/duplicate')).json().data.slug).toBe('book-2-copy');
    expect((await t.post('/viewer/docs/shelf/unarchive')).statusCode).toBe(200);
  });
});

describe('dokumen hanya di memori (file dihapus dari luar aplikasi)', () => {
  it('rename menulis balik salinan memori lalu memindahkannya; isi dan riwayat ikut', async () => {
    const t = await setup();
    await t.create('Ghost');
    const s = await t.session();
    await t.post('/docs/open', { slug: 'ghost' }, s);
    await rm(t.docFile('ghost'));
    const r = await t.post('/viewer/docs/ghost/rename', { name: 'Spirit' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual({ slug: 'spirit', from: 'ghost' });
    expect(existsSync(t.docFile('ghost'))).toBe(false);
    expect(JSON.parse(await readFile(t.docFile('spirit'), 'utf8')).rev).toBe(1);
    expect((await t.history('spirit')).map((e) => e.rev)).toEqual([1]);
    expect(await t.listed()).toEqual(['spirit']);
    expect(t.sessions.byId(s)!.activeSlug).toBe('spirit');
  });

  it('archive menulis balik salinan memori lalu memindahkannya ke arsip', async () => {
    const t = await setup();
    await t.create('Ghost');
    await rm(t.docFile('ghost'));
    const r = await t.post('/viewer/docs/ghost/archive');
    expect(r.statusCode, r.body).toBe(200);
    expect(await t.listed()).toEqual([]);
    expect(await t.archived()).toEqual(['ghost']);
    expect(existsSync(t.docFile('ghost', t.archiveDir))).toBe(true);
    expect((await t.post('/viewer/docs/ghost/unarchive')).statusCode).toBe(200);
    expect(await t.listed()).toEqual(['ghost']);
  });

  it('delete cukup melupakan salinan memori: 200, hilang dari daftar, sesi agen dikosongkan; delete kedua → 404', async () => {
    const t = await setup();
    await t.create('Ghost');
    const s = await t.session();
    await t.post('/docs/open', { slug: 'ghost' }, s);
    await rm(t.docFile('ghost'));
    const r = await t.del('/viewer/docs/ghost');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual({ slug: 'ghost', deleted: true });
    expect(await t.listed()).toEqual([]);
    expect(t.sessions.byId(s)!.activeSlug).toBeUndefined();
    expect(existsSync(t.docFile('ghost'))).toBe(false);
    expect((await t.del('/viewer/docs/ghost')).statusCode).toBe(404);
  });
});

describe('event change untuk sinkron antar jendela', () => {
  it('setiap tulis kelola file/folder sukses → satu event change dengan origin pengirim; gagal → tidak ada event', async () => {
    const t = await setup();
    const changes: unknown[] = [];
    const plain: unknown[] = [];
    t.activity.subscribeAll((e) => e.type === 'change' && changes.push(e.change));
    t.activity.subscribe((e) => plain.push(e));
    const send = (method: 'POST' | 'DELETE', url: string, payload?: unknown, origin = 'win-1') =>
      t.app.inject({ method, url, ...(payload !== undefined ? { payload: payload as object } : {}), headers: { 'x-lakar-origin': origin } });
    expect((await send('POST', '/viewer/docs', { name: 'Alpha' })).statusCode).toBe(200);
    expect((await send('POST', '/viewer/docs/alpha/rename', { name: 'Beta' })).statusCode).toBe(200);
    expect((await send('POST', '/viewer/docs/beta/rename', { name: 'Beta' })).statusCode).toBe(200); // no-op: tanpa event
    expect((await send('POST', '/viewer/docs/beta/duplicate')).statusCode).toBe(200);
    expect((await send('POST', '/viewer/docs/beta/archive')).statusCode).toBe(200);
    expect((await send('POST', '/viewer/docs/beta/unarchive', undefined, 'bad origin!')).statusCode).toBe(200);
    expect((await send('DELETE', '/viewer/docs/beta-copy')).statusCode).toBe(200);
    const folder = await send('POST', '/viewer/folders', { name: 'Work' });
    const id = folder.json().data.folder.id as string;
    expect((await send('POST', '/viewer/folders/move', { slug: 'beta', folder: id })).statusCode).toBe(200);
    expect((await send('POST', `/viewer/folders/${id}/rename`, { name: 'Play' })).statusCode).toBe(200);
    expect((await send('DELETE', `/viewer/folders/${id}`)).statusCode).toBe(200);
    expect((await send('POST', '/viewer/docs/zz/archive')).statusCode).toBe(404);
    expect(changes).toEqual([
      { kind: 'create', slug: 'alpha', rev: 1, origin: 'win-1' },
      { kind: 'rename', slug: 'beta', from: 'alpha', origin: 'win-1' },
      { kind: 'duplicate', slug: 'beta-copy', from: 'beta', rev: 0, origin: 'win-1' },
      { kind: 'archive', slug: 'beta', origin: 'win-1' },
      { kind: 'unarchive', slug: 'beta' },
      { kind: 'delete', slug: 'beta-copy', archived: false, origin: 'win-1' },
      { kind: 'folders', origin: 'win-1' },
      { kind: 'folders', slug: 'beta', origin: 'win-1' },
      { kind: 'folders', origin: 'win-1' },
      { kind: 'folders', origin: 'win-1' },
    ]);
    // Pelanggan lama (`subscribe`) tidak menerima event change.
    expect(plain).toEqual([]);
  });

  it('restore membawa origin di event call; tanpa header → tanpa origin', async () => {
    const t = await setup();
    const calls: { status: string; origin?: string }[] = [];
    t.activity.subscribe((e) => e.type === 'call' && calls.push(e.call));
    await t.create('a');
    const s = await t.session();
    await t.post('/docs/open', { slug: 'a' }, s);
    expect((await t.post('/execute', { code: BOARD, description: 'tambah board ekstra mobile' }, s)).statusCode).toBe(200);
    calls.length = 0;
    const r = await t.app.inject({ method: 'POST', url: '/viewer/docs/a/restore', payload: { rev: 1 }, headers: { 'x-lakar-origin': 'win-2' } });
    expect(r.statusCode, r.body).toBe(200);
    expect(calls.map((c) => [c.status, c.origin])).toEqual([
      ['running', 'win-2'],
      ['done', 'win-2'],
    ]);
    calls.length = 0;
    expect((await t.post('/viewer/docs/a/restore', { rev: 2 })).statusCode).toBe(200);
    expect(calls.every((c) => c.origin === undefined)).toBe(true);
  });
});
