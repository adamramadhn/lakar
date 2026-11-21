// Kelola file dari aplikasi (aplikasi 1): POST /viewer/docs, rename, duplicate, archive/unarchive, DELETE, GET /viewer/archive.
// Seluruh matriks I/O spec; RenderPort palsu (execute butuh check board tersentuh).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDocument, transact } from '@lakar/core';
import { LakarError } from '@lakar/schema';
import { buildServer, exportFileName, loadConfig, slugify, withSuffix } from './index.js';
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
    await t.create('a');
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
