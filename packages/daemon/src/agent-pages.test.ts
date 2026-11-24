// Tool halaman agen (story 9.2): POST /pages, /pages/switch, /pages/create, /pages/tree. Halaman aktif adalah
// state sesi — tanpa rev/riwayat — dan menjadi target add(null)/children(null)/place di /execute.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SESSION_HEADER, type LakarDocument } from '@lakar/schema';
import { buildServer, loadConfig } from './index.js';
import type { ActivityEvent } from './events.js';

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
  root = await mkdtemp(join(tmpdir(), 'lakar-agent-pages-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function setup() {
  const dataDir = await mkdtemp(join(root, 'data-'));
  const daemon = buildServer({ config: { ...baseConfig, port: 0, dataDir }, render: fakeRender });
  const { app } = daemon;
  const docsDir = join(dataDir, 'docs');
  const post = (url: string, payload?: unknown, session?: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers: { ...(session ? { [SESSION_HEADER]: session } : {}), ...headers } });
  const del = (url: string) => app.inject({ method: 'DELETE', url });
  const session = async () => {
    const r = await post('/sessions', { client: 'lakar-mcp' });
    expect(r.statusCode).toBe(200);
    return r.json().data.sessionId as string;
  };
  const create = async (name: string) => {
    const r = await post('/viewer/docs', { name, board: { preset: 'mobile' } });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data.slug as string;
  };
  const open = async (s: string, slug: string) => {
    const r = await post('/docs/open', { slug }, s);
    expect(r.statusCode, r.body).toBe(200);
  };
  const doc = async (slug: string) => JSON.parse(await readFile(join(docsDir, `${slug}.lakar.json`), 'utf8')) as LakarDocument;
  const history = async (slug: string) =>
    (await readFile(join(docsDir, `${slug}.history.jsonl`), 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  const events: ActivityEvent[] = [];
  daemon.activity.subscribe((e) => events.push(e));
  return { ...daemon, docsDir, post, del, session, create, open, doc, history, events };
}

describe('POST /pages', () => {
  it('daftar halaman + aktif default halaman pertama; tanpa sesi 401; tanpa dokumen NO_ACTIVE_DOC', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Dua Halaman');
      await t.post(`/viewer/docs/${slug}/pages`, { name: 'Detail' });
      const s = await t.session();
      // Tanpa dokumen aktif → NO_ACTIVE_DOC.
      const none = await t.post('/pages', {}, s);
      expect(none.statusCode).toBe(409);
      expect(none.json().error.code).toBe('NO_ACTIVE_DOC');
      // Tanpa header sesi → 401.
      const anon = await t.post('/pages', {});
      expect(anon.statusCode).toBe(401);
      await t.open(s, slug);
      const r = await t.post('/pages', {}, s);
      expect(r.statusCode, r.body).toBe(200);
      const data = r.json().data;
      expect(data.pages.map((p: any) => p.name)).toEqual(['Page 1', 'Detail']);
      expect(data.active.index).toBe(0);
      expect(data.active.name).toBe('Page 1');
      expect(data.pages[1].boards).toBe(0);
    } finally {
      await t.app.close();
    }
  });
});

describe('POST /pages/switch', () => {
  it('switch dengan nama lalu id; previous = halaman sebelumnya; nama ambigu SCHEMA_INVALID; tidak ada NOT_FOUND', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Switch');
      await t.post(`/viewer/docs/${slug}/pages`, { name: 'Detail' });
      const s = await t.session();
      await t.open(s, slug);
      const revBefore = (await t.doc(slug)).rev;

      const byName = await t.post('/pages/switch', { page: 'Detail' }, s);
      expect(byName.statusCode, byName.body).toBe(200);
      expect(byName.json().data.page.name).toBe('Detail');
      expect(byName.json().data.previous.id).toBe((await t.doc(slug)).pages[0]!.id);
      // State sesi saja: rev dan riwayat tidak berubah.
      expect((await t.doc(slug)).rev).toBe(revBefore);

      const first = (await t.doc(slug)).pages[0]!.id;
      const byId = await t.post('/pages/switch', { page: first }, s);
      expect(byId.statusCode).toBe(200);
      expect(byId.json().data.page.id).toBe(first);

      // Nama ambigu.
      await t.post(`/viewer/docs/${slug}/pages`, { name: 'Detail' });
      const amb = await t.post('/pages/switch', { page: 'Detail' }, s);
      expect(amb.statusCode).toBe(400);
      expect(amb.json().error.code).toBe('SCHEMA_INVALID');
      expect(amb.json().error.hint).toContain('id');

      const gone = await t.post('/pages/switch', { page: 'Nope' }, s);
      expect(gone.statusCode).toBe(404);
      expect(gone.json().error.code).toBe('NOT_FOUND');
      expect(gone.json().error.hint).toContain('list_pages');
    } finally {
      await t.app.close();
    }
  });

  it('halaman aktif dihapus lewat viewer → NOT_FOUND sekali, lalu kembali ke halaman pertama', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Hapus');
      const added = (await t.post(`/viewer/docs/${slug}/pages`, { name: 'Kedua' })).json().data;
      const s = await t.session();
      await t.open(s, slug);
      await t.post('/pages/switch', { page: 'Kedua' }, s);
      const d = await t.del(`/viewer/docs/${slug}/pages/${added.pageId}`);
      expect(d.statusCode).toBe(200);

      const r = await t.post('/pages', {}, s);
      expect(r.statusCode).toBe(404);
      expect(r.json().error.code).toBe('NOT_FOUND');
      // activePage dibersihkan: panggilan berikutnya normal.
      const again = await t.post('/pages', {}, s);
      expect(again.statusCode).toBe(200);
      expect(again.json().data.active.index).toBe(0);
    } finally {
      await t.app.close();
    }
  });

  it('open_doc ke dokumen lain membersihkan halaman aktif', async () => {
    const t = await setup();
    try {
      const a = await t.create('Satu');
      const b = await t.create('Dua');
      await t.post(`/viewer/docs/${a}/pages`, { name: 'Kedua' });
      const s = await t.session();
      await t.open(s, a);
      await t.post('/pages/switch', { page: 'Kedua' }, s);
      await t.open(s, b);
      const r = await t.post('/pages', {}, s);
      expect(r.json().data.active.index).toBe(0);
      expect(r.json().data.active.name).toBe('Page 1');
    } finally {
      await t.app.close();
    }
  });
});

describe('POST /pages/create', () => {
  it('halaman baru jadi aktif, rev+1, riwayat atas nama sesi agen (bukan lakar-viewer), event aktivitas create_page', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Buat');
      const s = await t.session();
      await t.open(s, slug);
      const before = await t.doc(slug);

      const r = await t.post('/pages/create', { name: 'Checkout' }, s);
      expect(r.statusCode, r.body).toBe(200);
      const data = r.json().data;
      expect(data.rev).toBe(before.rev + 1);
      expect(data.page).toMatchObject({ name: 'Checkout', index: 1, boards: 0 });

      const after = await t.doc(slug);
      expect(after.pages.map((p) => p.name)).toEqual(['Page 1', 'Checkout']);
      // Jadi halaman aktif.
      const list = await t.post('/pages', {}, s);
      expect(list.json().data.active.name).toBe('Checkout');
      // Riwayat agen.
      const h = await t.history(slug);
      const last = h.at(-1);
      expect(last.description).toBe('Added page "Checkout"');
      expect(last.sessionId).toBe(s);
      expect(last.sessionId).not.toBe('lakar-viewer');
      // Event aktivitas nama tool create_page.
      const calls = t.events.filter((e) => e.type === 'call' && (e as any).call?.tool === 'create_page');
      expect(calls.length).toBeGreaterThan(0);
    } finally {
      await t.app.close();
    }
  });

  it('nama default "Page N"; nama kosong/panjang → SCHEMA_INVALID', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Default');
      const s = await t.session();
      await t.open(s, slug);
      const r = await t.post('/pages/create', {}, s);
      expect(r.statusCode).toBe(200);
      expect(r.json().data.page.name).toBe('Page 2');

      const empty = await t.post('/pages/create', { name: '   ' }, s);
      expect(empty.statusCode).toBe(400);
      const long = await t.post('/pages/create', { name: 'x'.repeat(101) }, s);
      expect(long.statusCode).toBe(400);
    } finally {
      await t.app.close();
    }
  });
});

describe('POST /pages/tree', () => {
  it('outline halaman aktif dan halaman bernama; depth 0 → childCount + truncated; NOT_FOUND nama salah', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Pohon');
      const s = await t.session();
      await t.open(s, slug);
      // Isi halaman 2 dengan satu board berisi teks lewat execute (halaman aktif = halaman baru).
      await t.post('/pages/create', { name: 'Toko' }, s);
      const ex = await t.post('/execute', {
        code: "const b = add(null, {type:'board', name:'Katalog', x:0, y:0, width:390, height:844, screen:'app'}); add(b, {type:'text', name:'Judul', content:'Sepatu lari', size:24}); children(null).map((n) => n.name);",
        description: 'isi halaman toko',
      }, s);
      expect(ex.statusCode, ex.body).toBe(200);
      // children(null) di halaman aktif = board Katalog.
      expect(ex.json().data.value).toContain('Katalog');

      const tree = await t.post('/pages/tree', {}, s);
      expect(tree.statusCode, tree.body).toBe(200);
      const td = tree.json().data;
      expect(td.page.name).toBe('Toko');
      expect(td.children).toHaveLength(1);
      expect(td.children[0]).toMatchObject({ type: 'board', name: 'Katalog', width: 390 });
      expect(td.children[0].children[0]).toMatchObject({ type: 'text', name: 'Judul', content: 'Sepatu lari' });

      const shallow = await t.post('/pages/tree', { page: 'Toko', depth: 0 }, s);
      expect(shallow.json().data.children[0].childCount).toBe(1);
      expect(shallow.json().data.truncated).toBe(true);

      const gone = await t.post('/pages/tree', { page: 'Nope' }, s);
      expect(gone.statusCode).toBe(404);
    } finally {
      await t.app.close();
    }
  });
});

describe('execute di halaman aktif sesi', () => {
  it('add(null, board) mendarat di halaman aktif; place() menjauhi board halaman itu saja; tanpa switch → halaman pertama', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Target');
      const s = await t.session();
      await t.open(s, slug);

      // Tanpa switch: halaman pertama.
      const ex1 = await t.post('/execute', {
        code: "add(null, {type:'board', name:'P1', x:0, y:0, width:100, height:100, screen:'app'})",
        description: 'board halaman 1',
      }, s);
      expect(ex1.statusCode, ex1.body).toBe(200);

      const created = await t.post('/pages/create', { name: 'Kedua' }, s);
      expect(created.statusCode).toBe(200);
      const ex2 = await t.post('/execute', {
        code: "const p = place(100, 100); const id = add(null, {type:'board', name:'P2', x:p.x, y:p.y, width:100, height:100, screen:'app'}); [p, children(null).map((n) => n.name)];",
        description: 'board halaman 2',
      }, s);
      expect(ex2.statusCode, ex2.body).toBe(200);
      const d2 = ex2.json().data;
      // Halaman kosong → place {x:0,y:0}; children(null) hanya board P2.
      expect(d2.value).toEqual([{ x: 0, y: 0 }, ['P2']]);

      const doc = await t.doc(slug);
      expect(doc.pages[0]!.children.some((b) => b.name === 'P1')).toBe(true);
      expect(doc.pages[1]!.children.map((b) => b.name)).toEqual(['P2']);
    } finally {
      await t.app.close();
    }
  });
});
