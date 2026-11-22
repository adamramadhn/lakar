// Kelola halaman dari aplikasi (aplikasi 8): POST/DELETE /viewer/docs/:slug/pages…. Seluruh matriks I/O spec,
// riwayat + snapshot, event aktivitas, Origin guard, dan Restore mengembalikan halaman. RenderPort palsu.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LakarDocument } from '@lakar/schema';
import { buildServer, loadConfig } from './index.js';
import type { ActivityEvent } from './events.js';
import { defaultPageName } from './pages.js';

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
  root = await mkdtemp(join(tmpdir(), 'lakar-pages-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function setup() {
  const dataDir = await mkdtemp(join(root, 'data-'));
  const daemon = buildServer({ config: { ...baseConfig, port: 0, dataDir }, render: fakeRender });
  const { app } = daemon;
  const docsDir = join(dataDir, 'docs');
  const post = (url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers });
  const get = (url: string) => app.inject({ method: 'GET', url });
  const del = (url: string, headers: Record<string, string> = {}) => app.inject({ method: 'DELETE', url, headers });
  const create = async (name: string) => {
    const r = await post('/viewer/docs', { name, board: { preset: 'mobile' } });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data.slug as string;
  };
  const doc = async (slug: string) => JSON.parse(await readFile(join(docsDir, `${slug}.lakar.json`), 'utf8')) as LakarDocument;
  const history = async (slug: string) =>
    (await readFile(join(docsDir, `${slug}.history.jsonl`), 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  const addPage = async (slug: string, body?: unknown) => {
    const r = await post(`/viewer/docs/${slug}/pages`, body);
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as { slug: string; rev: number; pageId: string };
  };
  const events: ActivityEvent[] = [];
  daemon.activity.subscribe((e) => events.push(e));
  return { ...daemon, docsDir, post, get, del, create, doc, history, addPage, events };
}

const names = (d: LakarDocument) => d.pages.map((p) => p.name);

describe('defaultPageName', () => {
  it('N mulai dari jumlah + 1, naik sampai nama belum dipakai', () => {
    expect(defaultPageName([{ name: 'Page 1' }])).toBe('Page 2');
    expect(defaultPageName([{ name: 'Page 1' }, { name: 'Page 3' }])).toBe('Page 4');
    expect(defaultPageName([{ name: 'Home' }, { name: 'About' }])).toBe('Page 3');
  });
});

describe('POST /viewer/docs/:slug/pages', () => {
  it('dok 1 halaman → "Page 2" di akhir, rev+1, riwayat + snapshot, event pages dari lakar-viewer', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Satu');
      const before = await t.doc(slug);
      const data = await t.addPage(slug);
      expect(data).toMatchObject({ slug, rev: before.rev + 1 });
      const after = await t.doc(slug);
      expect(names(after)).toEqual([before.pages[0]!.name, 'Page 2']);
      expect(after.pages[1]).toEqual({ id: data.pageId, name: 'Page 2', children: [] });
      expect(after.rev).toBe(data.rev);
      const h = await t.history(slug);
      expect(h.at(-1)).toMatchObject({ rev: data.rev, sessionId: 'lakar-viewer', description: 'Added page "Page 2"', opsSummary: 'pages' });
      const snap = (await t.get(`/viewer/docs/${slug}/revs/${data.rev}`)).json().data.doc as LakarDocument;
      expect(names(snap)).toEqual(names(after));
      const calls = t.events.flatMap((e) => (e.type === 'call' && e.call.tool === 'pages' ? [e.call] : []));
      expect(calls.map((c) => c.status)).toEqual(['running', 'done']);
      expect(calls[1]).toMatchObject({ client: 'lakar-viewer', slug, rev: data.rev, description: 'Added page "Page 2"' });
    } finally {
      await t.app.close();
    }
  });

  it('nama default bentrok: "Page 1", "Page 3" → "Page 4"; nama eksplisit di-trim', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Bentrok');
      const first = (await t.doc(slug)).pages[0]!;
      expect((await t.post(`/viewer/docs/${slug}/pages/${first.id}/rename`, { name: 'Page 1' })).statusCode).toBe(200);
      await t.addPage(slug, { name: ' Page 3 ' });
      await t.addPage(slug);
      expect(names(await t.doc(slug))).toEqual(['Page 1', 'Page 3', 'Page 4']);
    } finally {
      await t.app.close();
    }
  });

  it('ID halaman baru unik terhadap node dan halaman', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Unik');
      for (let i = 0; i < 5; i++) await t.addPage(slug);
      const d = await t.doc(slug);
      const ids = [d.id, ...d.pages.flatMap((p) => [p.id, ...p.children.map((b) => b.id)])];
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      await t.app.close();
    }
  });

  it('dokumen tidak ada → 404 NOT_FOUND; Origin asing → 403', async () => {
    const t = await setup();
    try {
      const r = await t.post('/viewer/docs/nope/pages', {});
      expect(r.statusCode).toBe(404);
      expect(r.json().error.code).toBe('NOT_FOUND');
      const slug = await t.create('Asing');
      const x = await t.post(`/viewer/docs/${slug}/pages`, {}, { origin: 'https://evil.example' });
      expect(x.statusCode).toBe(403);
      expect((await t.doc(slug)).pages).toHaveLength(1);
    } finally {
      await t.app.close();
    }
  });
});

describe('POST /viewer/docs/:slug/pages/:pageId/rename', () => {
  it('"  Home " → "Home", rev+1, riwayat "Renamed page to "Home""', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Rename');
      const d0 = await t.doc(slug);
      const r = await t.post(`/viewer/docs/${slug}/pages/${d0.pages[0]!.id}/rename`, { name: '  Home ' });
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().data).toEqual({ slug, rev: d0.rev + 1, pageId: d0.pages[0]!.id });
      expect(names(await t.doc(slug))).toEqual(['Home']);
      expect((await t.history(slug)).at(-1).description).toBe('Renamed page to "Home"');
      // Nama sama (sesudah trim) → rev tetap, tanpa entri riwayat baru.
      const hLen = (await t.history(slug)).length;
      const same = await t.post(`/viewer/docs/${slug}/pages/${d0.pages[0]!.id}/rename`, { name: ' Home  ' });
      expect(same.statusCode, same.body).toBe(200);
      expect(same.json().data).toEqual({ slug, rev: d0.rev + 1, pageId: d0.pages[0]!.id });
      expect((await t.history(slug)).length).toBe(hLen);
      expect((await t.doc(slug)).rev).toBe(d0.rev + 1);
    } finally {
      await t.app.close();
    }
  });

  it('kosong / > 100 karakter → 400 SCHEMA_INVALID; pageId asing → 404', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Invalid');
      const d0 = await t.doc(slug);
      const id = d0.pages[0]!.id;
      for (const name of ['   ', '', 'x'.repeat(101)]) {
        const r = await t.post(`/viewer/docs/${slug}/pages/${id}/rename`, { name });
        expect(r.statusCode).toBe(400);
        expect(r.json().error.code).toBe('SCHEMA_INVALID');
      }
      expect((await t.post(`/viewer/docs/${slug}/pages/${id}/rename`, { name: 'x'.repeat(100) })).statusCode).toBe(200);
      const nf = await t.post(`/viewer/docs/${slug}/pages/ZZZZZZZZ/rename`, { name: 'A' });
      expect(nf.statusCode).toBe(404);
      expect(nf.json().error.code).toBe('NOT_FOUND');
      expect((await t.post(`/viewer/docs/${slug}/pages/bad/rename`, { name: 'A' })).statusCode).toBe(404);
    } finally {
      await t.app.close();
    }
  });
});

describe('POST /viewer/docs/:slug/pages/:pageId/move', () => {
  it('3 halaman, idx 2 → 0: urutan baru, rev+1; indeks sama → rev tetap tanpa riwayat', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Move');
      await t.addPage(slug);
      const third = await t.addPage(slug);
      const r = await t.post(`/viewer/docs/${slug}/pages/${third.pageId}/move`, { index: 0 });
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().data).toEqual({ slug, rev: third.rev + 1, pageId: third.pageId });
      const d = await t.doc(slug);
      expect(names(d)[0]).toBe('Page 3');
      expect((await t.history(slug)).at(-1).description).toBe('Moved page "Page 3"');
      const hLen = (await t.history(slug)).length;
      const same = await t.post(`/viewer/docs/${slug}/pages/${third.pageId}/move`, { index: 0 });
      expect(same.json().data).toEqual({ slug, rev: d.rev, pageId: third.pageId });
      expect((await t.history(slug)).length).toBe(hLen);
      expect((await t.doc(slug)).rev).toBe(d.rev);
    } finally {
      await t.app.close();
    }
  });

  it('indeks di luar 0..n-1 atau bukan integer → 400', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Range');
      const p = await t.addPage(slug);
      for (const index of [-1, 2, 1.5, '1']) {
        const r = await t.post(`/viewer/docs/${slug}/pages/${p.pageId}/move`, { index });
        expect(r.statusCode).toBe(400);
        expect(r.json().error.code).toBe('SCHEMA_INVALID');
      }
    } finally {
      await t.app.close();
    }
  });
});

describe('DELETE /viewer/docs/:slug/pages/:pageId', () => {
  it('halaman berisi 2 board → halaman + board hilang, rev+1; Restore rev sebelum hapus mengembalikannya', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Hapus');
      const s = (await t.post('/sessions', { client: 'claude-code' })).json().data.sessionId as string;
      expect((await t.post('/docs/open', { slug }, { 'x-lakar-session': s })).statusCode).toBe(200);
      const p2 = await t.addPage(slug);
      // Board ke halaman 2 lewat execute (jalur viewer: add(pageId, …)).
      const code = [0, 1].map((i) => `add('${p2.pageId}',{type:'board',name:'B${i}',x:${i * 500},y:0,width:390,height:844,screen:'mobile'})`).join(';');
      const ex = await t.post('/execute', { code, description: 'dua board di halaman dua' }, { 'x-lakar-session': s });
      expect(ex.statusCode, ex.body).toBe(200);
      const before = await t.doc(slug);
      expect(before.pages[1]!.children.map((b) => b.name)).toEqual(['B0', 'B1']);
      const r = await t.del(`/viewer/docs/${slug}/pages/${p2.pageId}`);
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().data).toEqual({ slug, rev: before.rev + 1, pageId: p2.pageId });
      const after = await t.doc(slug);
      expect(after.pages).toHaveLength(1);
      expect((await t.history(slug)).at(-1).description).toBe('Deleted page "Page 2"');
      const rs = await t.post(`/viewer/docs/${slug}/restore`, { rev: before.rev });
      expect(rs.statusCode, rs.body).toBe(200);
      const restored = await t.doc(slug);
      expect(restored.pages).toEqual(before.pages);
    } finally {
      await t.app.close();
    }
  });

  it('halaman terakhir → 409 CONFLICT; pageId asing → 404; slug asing → 404', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Akhir');
      const d0 = await t.doc(slug);
      const last = await t.del(`/viewer/docs/${slug}/pages/${d0.pages[0]!.id}`);
      expect(last.statusCode).toBe(409);
      expect(last.json().error.code).toBe('CONFLICT');
      expect((await t.doc(slug)).rev).toBe(d0.rev);
      expect((await t.del(`/viewer/docs/${slug}/pages/ZZZZZZZZ`)).statusCode).toBe(404);
      expect((await t.del(`/viewer/docs/nope/pages/ZZZZZZZZ`)).statusCode).toBe(404);
      const err = t.events.flatMap((e) => (e.type === 'call' && e.call.tool === 'pages' && e.call.status === 'error' ? [e.call] : []));
      expect(err[0]?.error?.code).toBe('CONFLICT');
    } finally {
      await t.app.close();
    }
  });
});
