// Komentar canvas (story 9.3): POST /comments, /comments/create, /comments/reply, /comments/resolve.
// Thread di root dokumen (skema v10): pin layer {nodeId} atau titik bebas {x,y,pageId?}; penulis = harness sesi.
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
  root = await mkdtemp(join(tmpdir(), 'lakar-comments-test-'));
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
  const session = async (agent = 'test-agent') => {
    const r = await post('/sessions', { client: 'lakar-mcp' }, undefined, { 'x-lakar-agent': agent });
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
  const boardId = async (slug: string) => (await doc(slug)).pages[0]!.children[0]!.id;
  const events: ActivityEvent[] = [];
  daemon.activity.subscribe((e) => events.push(e));
  return { ...daemon, post, session, create, open, doc, history, boardId, events };
}

describe('POST /comments (list)', () => {
  it('dokumen tanpa komentar → {total:0, open:0, threads:[]}; tanpa sesi 401; tanpa dokumen NO_ACTIVE_DOC', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Kosong');
      const s = await t.session();
      const none = await t.post('/comments', {}, s);
      expect(none.statusCode).toBe(409);
      expect(none.json().error.code).toBe('NO_ACTIVE_DOC');
      expect((await t.post('/comments', {})).statusCode).toBe(401);
      await t.open(s, slug);
      const r = await t.post('/comments', {}, s);
      expect(r.statusCode, r.body).toBe(200);
      const d = r.json().data;
      expect(d.total).toBe(0);
      expect(d.open).toBe(0);
      expect(d.threads).toEqual([]);
    } finally {
      await t.app.close();
    }
  });
});

describe('POST /comments/create', () => {
  it('pin di layer {nodeId} → pageId halaman node, x,y = posisi node; rev+1, riwayat atas nama sesi, penulis agent', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Pin Layer');
      const s = await t.session('claude-code');
      await t.open(s, slug);
      const nodeId = await t.boardId(slug);
      const revBefore = (await t.doc(slug)).rev;
      const r = await t.post('/comments/create', { text: 'perbesar padding di sini', nodeId }, s);
      expect(r.statusCode, r.body).toBe(200);
      const th = r.json().data.thread;
      const board = (await t.doc(slug)).pages[0]!.children[0]!;
      expect(th.nodeId).toBe(nodeId);
      expect(th.pageId).toBe((await t.doc(slug)).pages[0]!.id);
      expect(th.x).toBe(board.x);
      expect(th.y).toBe(board.y);
      expect(th.status).toBe('open');
      expect(th.messages).toHaveLength(1);
      expect(th.messages[0].author).toEqual({ kind: 'agent', name: 'claude-code' });
      expect((await t.doc(slug)).rev).toBe(revBefore + 1);
      expect((await t.doc(slug)).comments![0]!.id).toBe(th.id);
      const h = await t.history(slug);
      const last = h[h.length - 1]!;
      expect(last.sessionId).toBe(s);
      expect(last.opsSummary).toBe('comments');
      expect(last.description).toBe(`Added comment ${th.id}`);
      // Event Activity memetakan route ke nama tool MCP.
      expect(t.events.some((e) => e.type === 'call' && (e as { call?: { tool?: string } }).call?.tool === 'add_comment')).toBe(true);
    } finally {
      await t.app.close();
    }
  });

  it('titik bebas {x,y} → halaman aktif sesi; {x,y,pageId} → halaman itu; tanpa nodeId tanpa x/y → SCHEMA_INVALID', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Titik Bebas');
      await t.post(`/viewer/docs/${slug}/pages`, { name: 'Kedua' });
      const s = await t.session();
      await t.open(s, slug);
      const pages = (await t.doc(slug)).pages;
      // Halaman aktif sesi = halaman pertama.
      const a = await t.post('/comments/create', { text: 'cek area ini', x: 40, y: 60 }, s);
      expect(a.statusCode, a.body).toBe(200);
      expect(a.json().data.thread.pageId).toBe(pages[0]!.id);
      // pageId eksplisit → halaman kedua.
      const b = await t.post('/comments/create', { text: 'dan ini', x: 1, y: 2, pageId: pages[1]!.id }, s);
      expect(b.statusCode, b.body).toBe(200);
      expect(b.json().data.thread.pageId).toBe(pages[1]!.id);
      expect(b.json().data.thread.nodeId).toBeUndefined();
      // Tanpa nodeId wajib x dan y.
      const bad = await t.post('/comments/create', { text: 'tanpa posisi', x: 5 }, s);
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error.code).toBe('SCHEMA_INVALID');
      // pageId asing → NOT_FOUND.
      const nf = await t.post('/comments/create', { text: 'x', x: 1, y: 2, pageId: 'ZZzzzz99' }, s);
      expect(nf.statusCode).toBe(404);
      // nodeId asing → NOT_FOUND.
      const nn = await t.post('/comments/create', { text: 'x', nodeId: 'ZZzzzz99' }, s);
      expect(nn.statusCode).toBe(404);
      // text kosong → SCHEMA_INVALID.
      const empty = await t.post('/comments/create', { text: '   ', nodeId: await t.boardId(slug) }, s);
      expect(empty.statusCode).toBe(400);
      expect(empty.json().error.code).toBe('SCHEMA_INVALID');
    } finally {
      await t.app.close();
    }
  });
});

describe('POST /comments/reply dan /comments/resolve', () => {
  it('reply menambah pesan (penulis agent); resolve → resolvedAt; idempoten tanpa rev; reopen menghapus resolvedAt', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Alur');
      const s = await t.session('codex');
      await t.open(s, slug);
      const made = await t.post('/comments/create', { text: 'pertanyaan', x: 0, y: 0 }, s);
      const threadId = made.json().data.thread.id as string;

      const rep = await t.post('/comments/reply', { threadId, text: 'jawaban saya' }, s);
      expect(rep.statusCode, rep.body).toBe(200);
      const thread = rep.json().data.thread;
      expect(thread.messages).toHaveLength(2);
      expect(thread.messages[1].author).toEqual({ kind: 'agent', name: 'codex' });

      const revAfterReply = (await t.doc(slug)).rev;
      const res = await t.post('/comments/resolve', { threadId }, s);
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().data.status).toBe('resolved');
      expect(res.json().data.resolvedAt).toBeTruthy();
      expect((await t.doc(slug)).rev).toBe(revAfterReply + 1);
      // Idempoten: resolved → resolved tanpa rev baru.
      const again = await t.post('/comments/resolve', { threadId }, s);
      expect(again.statusCode).toBe(200);
      expect((await t.doc(slug)).rev).toBe(revAfterReply + 1);
      // Reopen.
      const open = await t.post('/comments/resolve', { threadId, resolved: false }, s);
      expect(open.json().data.status).toBe('open');
      expect(open.json().data.resolvedAt).toBeUndefined();
      expect((await t.doc(slug)).comments![0]!.resolvedAt).toBeUndefined();
      // threadId asing → NOT_FOUND.
      expect((await t.post('/comments/reply', { threadId: 'ZZzzzz99', text: 'x' }, s)).statusCode).toBe(404);
      expect((await t.post('/comments/resolve', { threadId: 'ZZzzzz99' }, s)).statusCode).toBe(404);
    } finally {
      await t.app.close();
    }
  });
});

describe('POST /comments — filter', () => {
  it('status/pageId/kind menyaring daftar; total+open selalu dokumen penuh', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Filter');
      await t.post(`/viewer/docs/${slug}/pages`, { name: 'Kedua' });
      const s = await t.session();
      await t.open(s, slug);
      const pages = (await t.doc(slug)).pages;
      await t.post('/comments/create', { text: 'satu', x: 0, y: 0 }, s);
      const two = await t.post('/comments/create', { text: 'dua', x: 0, y: 0, pageId: pages[1]!.id }, s);
      await t.post('/comments/resolve', { threadId: two.json().data.thread.id }, s);

      const all = await t.post('/comments', {}, s);
      expect(all.json().data.total).toBe(2);
      expect(all.json().data.open).toBe(1);
      expect(all.json().data.threads).toHaveLength(2);

      const openOnly = await t.post('/comments', { status: 'open' }, s);
      expect(openOnly.json().data.threads).toHaveLength(1);
      const resolvedOnly = await t.post('/comments', { status: 'resolved' }, s);
      expect(resolvedOnly.json().data.threads).toHaveLength(1);
      const pageTwo = await t.post('/comments', { pageId: pages[1]!.id }, s);
      expect(pageTwo.json().data.threads).toHaveLength(1);
      expect(pageTwo.json().data.threads[0].status).toBe('resolved');
      const agents = await t.post('/comments', { kind: 'agent' }, s);
      expect(agents.json().data.threads).toHaveLength(2);
      const users = await t.post('/comments', { kind: 'user' }, s);
      expect(users.json().data.threads).toHaveLength(0);
      // Filter status asing → SCHEMA_INVALID.
      expect((await t.post('/comments', { status: 'closed' }, s)).statusCode).toBe(400);
    } finally {
      await t.app.close();
    }
  });
});
