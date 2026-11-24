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
  const changes: { kind?: string; origin?: string; rev?: number }[] = [];
  daemon.activity.subscribeAll((e) => {
    if (e.type === 'change') changes.push(e.change);
  });
  return { ...daemon, post, session, create, open, doc, history, boardId, events, changes };
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

// ---- Route komentar aplikasi (story 9.4): dokumen dari slug di URL tanpa sesi; penulis {user,'You'},
//      riwayat atas nama lakar-viewer; event `change` edit dipancarkan manual dengan origin jendela. ----
describe('POST /viewer/docs/:slug/comments (list)', () => {
  it('tanpa sesi; pageName/nodeName aditif per thread; slug asing 404; slug di luar pola 400', async () => {
    const t = await setup();
    try {
      const slug = await t.create('List Viewer');
      // Dokumen tanpa komentar → daftar kosong (tetap 200; dokumen dibaca dari disk).
      const empty = await t.post(`/viewer/docs/${slug}/comments`, {});
      expect(empty.statusCode, empty.body).toBe(200);
      expect(empty.json().data).toMatchObject({ slug, total: 0, open: 0, threads: [] });
      // Thread pin layer dari agen → nama node/halaman ikut di respons list viewer.
      const s = await t.session('claude-code');
      await t.open(s, slug);
      const nodeId = await t.boardId(slug);
      await t.post('/comments/create', { text: 'agen menandai', nodeId }, s);
      const list = await t.post(`/viewer/docs/${slug}/comments`, {});
      expect(list.statusCode, list.body).toBe(200);
      const th = list.json().data.threads[0];
      expect(th.nodeId).toBe(nodeId);
      expect(th.nodeName).toBe((await t.doc(slug)).pages[0]!.children[0]!.name);
      expect(th.pageName).toBe((await t.doc(slug)).pages[0]!.name);
      // Filter bekerja sama dengan route agen.
      expect((await t.post(`/viewer/docs/${slug}/comments`, { status: 'resolved' })).json().data.threads).toHaveLength(0);
      // Slug asing → 404; slug di luar pola → 400.
      expect((await t.post('/viewer/docs/tidak-ada/comments', {})).statusCode).toBe(404);
      expect((await t.post('/viewer/docs/INVALID%20SLUG/comments', {})).statusCode).toBe(400);
      // Origin lintas situs → 403 (guard global route tulis /viewer/*).
      const foreign = await t.post(`/viewer/docs/${slug}/comments`, {}, undefined, { origin: 'https://evil.example' });
      expect(foreign.statusCode).toBe(403);
    } finally {
      await t.app.close();
    }
  });
});

describe('POST /viewer/docs/:slug/comments/{create,reply,resolve}', () => {
  it('penulis {user,You}; riwayat lakar-viewer; change ber-origin; resolve idempoten tanpa rev/event baru', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Tulis Viewer');
      const headers = { 'x-lakar-origin': 'win-test' };
      const made = await t.post(`/viewer/docs/${slug}/comments/create`, { text: 'geser tombol ini', x: 10, y: 20 }, undefined, headers);
      expect(made.statusCode, made.body).toBe(200);
      const th = made.json().data.thread;
      expect(th.messages[0].author).toEqual({ kind: 'user', name: 'You' });
      // Titik bebas tanpa pageId → halaman pertama.
      expect(th.pageId).toBe((await t.doc(slug)).pages[0]!.id);
      expect(th.x).toBe(10);
      expect(th.y).toBe(20);
      // Riwayat atas nama viewer (seperti kelola file), opsSummary comments.
      const last = (await t.history(slug)).at(-1)!;
      expect(last.sessionId).toBe('lakar-viewer');
      expect(last.client).toBe('lakar-viewer');
      expect(last.opsSummary).toBe('comments');
      // Event change edit ber-origin: jendela pembuat mengabaikannya, jendela lain memuat ulang.
      // (Hanya terlihat lewat subscribeAll — event change tidak masuk ring aktivitas.)
      const change = t.changes.at(-1);
      expect(change?.kind).toBe('edit');
      expect(change?.origin).toBe('win-test');
      expect(change?.rev).toBe(made.json().data.rev);
      // Pin di layer tanpa x/y → koordinat default = posisi tersimpan node; pageId = halaman node.
      const board = await t.boardId(slug);
      const pinned = await t.post(`/viewer/docs/${slug}/comments/create`, { text: 'pin layer', nodeId: board });
      expect(pinned.statusCode, pinned.body).toBe(200);
      const pth = pinned.json().data.thread;
      const bnode = (await t.doc(slug)).pages[0]!.children[0]! as { x: number; y: number };
      expect(pth.nodeId).toBe(board);
      expect(pth.x).toBe(bnode.x);
      expect(pth.y).toBe(bnode.y);
      // Reply dan resolve (yang mengubah status) sama-sama memancarkan change edit — jendela lain memuat ulang.
      const rep = await t.post(`/viewer/docs/${slug}/comments/reply`, { threadId: th.id, text: 'balasan pengguna' });
      expect(rep.statusCode, rep.body).toBe(200);
      expect(rep.json().data.thread.messages.at(-1).author).toEqual({ kind: 'user', name: 'You' });
      expect(t.changes.at(-1)).toMatchObject({ kind: 'edit', rev: rep.json().data.rev });
      const res = await t.post(`/viewer/docs/${slug}/comments/resolve`, { threadId: th.id });
      expect(res.json().data.status).toBe('resolved');
      expect(res.json().data.resolvedAt).toBeTruthy();
      expect(t.changes.at(-1)).toMatchObject({ kind: 'edit', rev: res.json().data.rev });
      // Reopen (resolved:false) membuka kembali + memancarkan change; status kembali 'open' tanpa resolvedAt.
      const reopen = await t.post(`/viewer/docs/${slug}/comments/resolve`, { threadId: th.id, resolved: false });
      expect(reopen.json().data.status).toBe('open');
      expect(reopen.json().data.resolvedAt).toBeUndefined();
      expect(t.changes.at(-1)).toMatchObject({ kind: 'edit', rev: reopen.json().data.rev });
      await t.post(`/viewer/docs/${slug}/comments/resolve`, { threadId: th.id });
      const revAfter = (await t.doc(slug)).rev;
      const changesBefore = t.changes.length;
      // Idempoten: resolved → resolved lagi = rev tetap, tanpa event change baru.
      const again = await t.post(`/viewer/docs/${slug}/comments/resolve`, { threadId: th.id });
      expect(again.statusCode).toBe(200);
      expect((await t.doc(slug)).rev).toBe(revAfter);
      expect(t.changes).toHaveLength(changesBefore);
      // Validasi sama dengan route agen: body jelek 400, thread asing 404, slug asing 404.
      expect((await t.post(`/viewer/docs/${slug}/comments/create`, { text: '   ', x: 1, y: 2 })).statusCode).toBe(400);
      expect((await t.post(`/viewer/docs/${slug}/comments/reply`, { threadId: 'ZZzzzz99', text: 'x' })).statusCode).toBe(404);
      expect((await t.post(`/viewer/docs/${slug}/comments/resolve`, { threadId: 'ZZzzzz99' })).statusCode).toBe(404);
      expect((await t.post('/viewer/docs/tidak-ada/comments/create', { text: 'x', x: 1, y: 2 })).statusCode).toBe(404);
      expect((await t.post(`/viewer/docs/${slug}/comments/create`, { text: 'x', x: 1, y: 2 }, undefined, { origin: 'https://evil.example' })).statusCode).toBe(403);
    } finally {
      await t.app.close();
    }
  });
});
