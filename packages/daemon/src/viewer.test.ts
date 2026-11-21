// Route baca-saja viewer (Viewer B slice 1): /viewer/docs, /viewer/docs/:slug, /app/*. Tanpa Chromium.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION } from '@lakar/schema';
import { DocStore, VIEWER_DIST_DIR, buildServer, loadConfig } from './index.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };

/** RenderPort yang tidak boleh dipanggil: route viewer tidak merender. */
const noRender = {
  screenshot: async () => {
    throw new Error('render tidak boleh dipanggil');
  },
  measure: async () => {
    throw new Error('render tidak boleh dipanggil');
  },
} as never;

const docJson = (id: string, rev: number, boards: { id: string; name: string }[]) => ({
  schemaVersion: SCHEMA_VERSION,
  id,
  rev,
  pages: [
    {
      id: 'Pppppppp',
      name: 'Page 1',
      children: boards.map((b, i) => ({ type: 'board', name: b.name, x: i * 500, y: 0, width: 390, height: 844, screen: 'mobile', id: b.id, children: [] })),
    },
  ],
});

let root: string;
const temps: string[] = [];
const tempDir = async (prefix: string) => {
  const d = await mkdtemp(join(root, prefix));
  temps.push(d);
  return d;
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-viewer-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function setup(opts: { viewerDir?: string } = {}) {
  const dataDir = await tempDir('data-');
  const { app } = buildServer({ config: { ...baseConfig, port: 0, dataDir, ...(opts.viewerDir ? { viewerDir: opts.viewerDir } : {}) }, render: noRender });
  const docsDir = join(dataDir, 'docs');
  const put = async (slug: string, body: unknown, mtime?: Date) => {
    await mkdir(docsDir, { recursive: true });
    const p = join(docsDir, `${slug}.lakar.json`);
    await writeFile(p, typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
    if (mtime) await utimes(p, mtime, mtime);
  };
  const get = (url: string) => app.inject({ method: 'GET', url });
  const post = (url: string, payload: unknown, session?: string) =>
    app.inject({ method: 'POST', url, payload: payload as object, headers: session ? { 'x-lakar-session': session } : {} });
  return { app, dataDir, docsDir, put, get, post };
}

describe('DocStore.list', () => {
  it('direktori docs belum ada → []', async () => {
    const store = new DocStore(join(await tempDir('nodocs-'), 'tidak-ada'));
    expect(await store.list()).toEqual([]);
  });

  it('hanya <slug>.lakar.json dengan slug valid; riwayat, tmp, dan file lain diabaikan', async () => {
    const dataDir = await tempDir('list-');
    const docs = join(dataDir, 'docs');
    await mkdir(docs, { recursive: true });
    for (const f of ['a.lakar.json', 'b.lakar.json', 'a.history.jsonl', 'a.lakar.json.123.abcd.tmp', 'README.md', 'Bad Name.lakar.json']) await writeFile(join(docs, f), '{}');
    await mkdir(join(docs, 'dir.lakar.json'));
    const list = await new DocStore(dataDir).list();
    expect(list.map((x) => x.slug).sort()).toEqual(['a', 'b']);
    for (const x of list) expect(x.mtimeMs).toBeGreaterThan(0);
  });
});

describe('GET /viewer/docs', () => {
  it('daftar dokumen: bentuk {slug, rev, updatedAt, boardCount, firstBoardId}, urut updatedAt terbaru', async () => {
    const { app, put, get } = await setup();
    try {
      await put('a', docJson('Aaaaaaaa', 3, [{ id: 'Bbbbbbb1', name: 'Home' }, { id: 'Bbbbbbb2', name: 'Detail' }]), new Date('2026-01-01T00:00:00Z'));
      await put('b', docJson('Bbbbbbbb', 7, []), new Date('2026-02-01T00:00:00Z'));
      const r = await get('/viewer/docs');
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({
        ok: true,
        data: {
          docs: [
            { slug: 'b', rev: 7, updatedAt: '2026-02-01T00:00:00.000Z', boardCount: 0, firstBoardId: null },
            { slug: 'a', rev: 3, updatedAt: '2026-01-01T00:00:00.000Z', boardCount: 2, firstBoardId: 'Bbbbbbb1' },
          ],
        },
      });
    } finally {
      await app.close();
    }
  });

  it('firstBoardId dari halaman berikutnya bila halaman 1 kosong', async () => {
    const { app, put, get } = await setup();
    try {
      const body = docJson('Mmmmmmmm', 2, []);
      body.pages.push({ ...docJson('Mmmmmmmm', 2, [{ id: 'Bbbbbbb9', name: 'Later' }]).pages[0]!, id: 'Pppppp02', name: 'Page 2' });
      await put('multi', body);
      expect((await get('/viewer/docs')).json().data.docs[0]).toMatchObject({ slug: 'multi', boardCount: 1, firstBoardId: 'Bbbbbbb9' });
    } finally {
      await app.close();
    }
  });

  it('store kosong / folder docs belum ada → docs: []', async () => {
    const { app, get, docsDir } = await setup();
    try {
      expect(existsSync(docsDir)).toBe(false);
      expect((await get('/viewer/docs')).json()).toEqual({ ok: true, data: { docs: [] } });
      expect(existsSync(docsDir)).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('file rusak dilewati (dicatat di log), entri lain tetap tampil; file tidak disentuh', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { app, put, get, docsDir } = await setup();
    try {
      await put('ok', docJson('Oooooooo', 1, [{ id: 'Bbbbbbb1', name: 'Home' }]));
      await put('rusak', '{"schemaVersion":1,');
      await put('rusak2', '{"schemaVersion":1}');
      const r = await get('/viewer/docs');
      expect(r.statusCode).toBe(200);
      expect(r.json().data.docs.map((d: { slug: string }) => d.slug)).toEqual(['ok']);
      const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toMatch(/rusak\.lakar\.json/);
      expect(logged).toMatch(/rusak2\.lakar\.json/);
      expect(await readFile(join(docsDir, 'rusak.lakar.json'), 'utf8')).toBe('{"schemaVersion":1,');
    } finally {
      await app.close();
    }
  });

  it('dokumen yang sudah dimuat daemon memakai salinan memori', async () => {
    const { app, put, get, post } = await setup();
    try {
      await put('a', docJson('Aaaaaaaa', 1, [{ id: 'Bbbbbbb1', name: 'Home' }]));
      const sid = (await post('/sessions', { client: 'lakar-viewer' })).json().data.sessionId as string;
      expect((await post('/docs/open', { slug: 'a' }, sid)).json().data).toMatchObject({ rev: 1, created: false });
      // File berubah di luar daemon: daftar dan isi tetap dari memori (AD-1).
      await put('a', docJson('Aaaaaaaa', 9, []));
      expect((await get('/viewer/docs')).json().data.docs[0]).toMatchObject({ slug: 'a', rev: 1, boardCount: 1 });
      expect((await get('/viewer/docs/a')).json().data.doc).toMatchObject({ id: 'Aaaaaaaa', rev: 1 });
    } finally {
      await app.close();
    }
  });
});

describe('GET /viewer/docs/:slug', () => {
  it('belum dimuat → dibaca dari store tanpa menulis apa pun', async () => {
    const { app, put, get, docsDir } = await setup();
    try {
      const body = docJson('Aaaaaaaa', 4, [{ id: 'Bbbbbbb1', name: 'Home' }]);
      await put('a', body);
      const before = await readFile(join(docsDir, 'a.lakar.json'), 'utf8');
      const r = await get('/viewer/docs/a');
      expect(r.statusCode).toBe(200);
      expect(r.json()).toMatchObject({ ok: true, data: { doc: { id: 'Aaaaaaaa', rev: 4, pages: [{ children: [{ id: 'Bbbbbbb1', name: 'Home' }] }] } } });
      expect(await readFile(join(docsDir, 'a.lakar.json'), 'utf8')).toBe(before);
      expect(existsSync(join(docsDir, 'a.history.jsonl'))).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('file rusak → 400 SCHEMA_INVALID, file tidak berubah', async () => {
    const { app, put, get, docsDir } = await setup();
    try {
      await put('rusak', '{"schemaVersion":1,');
      const r = await get('/viewer/docs/rusak');
      expect(r.statusCode).toBe(400);
      expect(r.json()).toMatchObject({ ok: false, error: { code: 'SCHEMA_INVALID' } });
      expect(await readFile(join(docsDir, 'rusak.lakar.json'), 'utf8')).toBe('{"schemaVersion":1,');
    } finally {
      await app.close();
    }
  });

  it('slug tidak ada → 404 NOT_FOUND (AD-11), dokumen tidak dibuat', async () => {
    const { app, get, docsDir } = await setup();
    try {
      const r = await get('/viewer/docs/zzz');
      expect(r.statusCode).toBe(404);
      expect(r.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND', retryable: false } });
      expect(typeof r.json().error.message).toBe('string');
      expect(typeof r.json().error.hint).toBe('string');
      expect(existsSync(join(docsDir, 'zzz.lakar.json'))).toBe(false);
    } finally {
      await app.close();
    }
  });

  it.each(['..%2Fx', 'A%20B', 'Bad_Slug'])('slug tidak valid %s → 400 SCHEMA_INVALID, dokumen tidak dibuat', async (slug) => {
    const { app, get, docsDir } = await setup();
    try {
      const r = await get(`/viewer/docs/${slug}`);
      expect(r.statusCode).toBe(400);
      expect(r.json()).toMatchObject({ ok: false, error: { code: 'SCHEMA_INVALID', retryable: false } });
      expect(r.json().error.hint).toContain('^[a-z0-9][a-z0-9-]{0,63}$');
      expect(existsSync(docsDir)).toBe(false);
    } finally {
      await app.close();
    }
  });
});

describe('GET /viewer/docs/:slug/history', () => {
  it('entri {rev, description, opsSummary, opCount, at, session, client?} urut rev turun; baris rusak dilewati; id sesi penuh tidak bocor', async () => {
    const { app, put, get, post, docsDir } = await setup();
    try {
      await put('a', docJson('Aaaaaaaa', 3, [{ id: 'Bbbbbbb1', name: 'Home' }]));
      const sid = (await post('/sessions', { client: 'claude-code' })).json().data.sessionId as string;
      const gone = '0123456789abcdef-gone';
      const lines = [
        { rev: 1, sessionId: gone, description: 'buat board home awal', opsSummary: 'add×4', at: '2026-11-20T10:00:00.000Z' },
        { rev: 2, sessionId: sid, description: 'rapikan judul hero landing', opsSummary: 'set×2, add×1', at: '2026-11-21T09:00:00.000Z' },
      ].map((x) => JSON.stringify(x));
      lines.splice(1, 0, '{rusak', JSON.stringify({ rev: 9, description: 'tanpa sesi', opsSummary: 'add×1', at: '2026-11-21T11:00:00.000Z' }));
      lines.push(JSON.stringify({ rev: 3, sessionId: sid, description: 'hapus node lama', opsSummary: 'remove×1', at: '2026-11-21T10:00:00.000Z' }));
      await writeFile(join(docsDir, 'a.history.jsonl'), lines.map((l) => `${l}\n`).join(''));
      const before = await readFile(join(docsDir, 'a.history.jsonl'), 'utf8');
      const r = await get('/viewer/docs/a/history');
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({
        ok: true,
        data: {
          entries: [
            { rev: 3, description: 'hapus node lama', opsSummary: 'remove×1', opCount: 1, at: '2026-11-21T10:00:00.000Z', session: sid.slice(0, 8), client: 'claude-code' },
            { rev: 2, description: 'rapikan judul hero landing', opsSummary: 'set×2, add×1', opCount: 3, at: '2026-11-21T09:00:00.000Z', session: sid.slice(0, 8), client: 'claude-code' },
            { rev: 1, description: 'buat board home awal', opsSummary: 'add×4', opCount: 4, at: '2026-11-20T10:00:00.000Z', session: '01234567' },
          ],
        },
      });
      expect(r.body).not.toContain(sid);
      expect(r.body).not.toContain(gone);
      expect(await readFile(join(docsDir, 'a.history.jsonl'), 'utf8')).toBe(before);
    } finally {
      await app.close();
    }
  });

  it('dokumen tanpa riwayat → entries: []', async () => {
    const { app, put, get } = await setup();
    try {
      await put('a', docJson('Aaaaaaaa', 0, []));
      expect((await get('/viewer/docs/a/history')).json()).toEqual({ ok: true, data: { entries: [] } });
    } finally {
      await app.close();
    }
  });

  it('slug tanpa dokumen → 404 NOT_FOUND; slug tidak valid → 400 SCHEMA_INVALID (AD-11)', async () => {
    const { app, get, docsDir } = await setup();
    try {
      const nf = await get('/viewer/docs/zzz/history');
      expect(nf.statusCode).toBe(404);
      expect(nf.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND', retryable: false } });
      for (const slug of ['..%2Fx', 'Bad_Slug']) {
        const bad = await get(`/viewer/docs/${slug}/history`);
        expect(bad.statusCode).toBe(400);
        expect(bad.json()).toMatchObject({ ok: false, error: { code: 'SCHEMA_INVALID' } });
      }
      expect(existsSync(docsDir)).toBe(false);
    } finally {
      await app.close();
    }
  });
});

describe('GET /app/*', () => {
  it('default dist = packages/viewer/dist', () => {
    expect(VIEWER_DIST_DIR.replaceAll('\\', '/')).toMatch(/packages\/viewer\/dist\/?$/);
  });

  it('index.html dan aset build disajikan dengan MIME dari ekstensi', async () => {
    const dist = await tempDir('dist-');
    await mkdir(join(dist, 'assets'), { recursive: true });
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>Lakar</title>');
    await writeFile(join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');
    await writeFile(join(dist, 'assets', 'index-abc123.css'), 'body{}');
    await writeFile(join(dist, 'favicon.svg'), '<svg/>');
    const { app, get } = await setup({ viewerDir: dist });
    try {
      const idx = await get('/app/');
      expect(idx.statusCode).toBe(200);
      expect(idx.headers['content-type']).toMatch(/^text\/html/);
      expect(idx.headers['cache-control']).toBe('no-cache');
      expect(idx.body).toContain('<title>Lakar</title>');
      expect((await get('/app/index.html')).body).toContain('<title>Lakar</title>');
      const redirect = await get('/app');
      expect(redirect.statusCode).toBe(302);
      expect(redirect.headers.location).toBe('/app/');
      const js = await get('/app/assets/index-abc123.js');
      expect(js.statusCode).toBe(200);
      expect(js.headers['content-type']).toMatch(/^text\/javascript/);
      expect(js.headers['cache-control']).toMatch(/immutable/);
      expect((await get('/app/assets/index-abc123.css')).headers['content-type']).toMatch(/^text\/css/);
      expect((await get('/app/favicon.svg')).headers['content-type']).toBe('image/svg+xml');
      const missing = await get('/app/assets/nope.js');
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error.code).toBe('NOT_FOUND');
    } finally {
      await app.close();
    }
  });

  it.each(['/app/..%2F..%2Fsecret.txt', '/app/%2e%2e/secret.txt', '/app/assets/..%2F..%2F..%2Fsecret.txt', '/app/..%5Csecret.txt'])('path traversal %s ditolak', async (url) => {
    const base = await tempDir('trav-');
    const dist = join(base, 'a', 'dist');
    await mkdir(join(dist, 'assets'), { recursive: true });
    await writeFile(join(dist, 'index.html'), '<!doctype html>');
    await writeFile(join(base, 'secret.txt'), 'RAHASIA');
    await writeFile(join(base, 'a', 'secret.txt'), 'RAHASIA');
    const { app, get } = await setup({ viewerDir: dist });
    try {
      const r = await get(url);
      expect(r.statusCode).toBe(404);
      expect(r.body).not.toContain('RAHASIA');
    } finally {
      await app.close();
    }
  });

  it('build belum ada → 404 dengan pesan "jalankan pnpm build"', async () => {
    const dist = join(await tempDir('nobuild-'), 'dist');
    const { app, get } = await setup({ viewerDir: dist });
    try {
      for (const url of ['/app/', '/app/assets/index.js']) {
        const r = await get(url);
        expect(r.statusCode).toBe(404);
        expect(r.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
        expect(r.json().error.hint).toBe('jalankan pnpm build');
      }
    } finally {
      await app.close();
    }
  });

  it('route lama tetap ada (status, sesi)', async () => {
    const { app, get, post } = await setup();
    try {
      expect((await get('/status')).json().ok).toBe(true);
      expect((await post('/sessions', { client: 'lakar-viewer' })).json().data.sessionId).toEqual(expect.any(String));
    } finally {
      await app.close();
    }
  });
});
