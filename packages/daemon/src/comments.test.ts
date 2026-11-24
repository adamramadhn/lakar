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
      // Hapus thread permanen (route viewer): thread hilang dari dokumen; change ber-origin terpancar.
      const del = await t.post(`/viewer/docs/${slug}/comments/delete`, { threadId: th.id }, undefined, headers);
      expect(del.statusCode, del.body).toBe(200);
      expect((await t.doc(slug)).comments!.find((c) => c.id === th.id)).toBeUndefined();
      expect(t.changes.at(-1)).toMatchObject({ kind: 'edit', origin: 'win-test', rev: del.json().data.rev });
      // Thread kedua (pin layer) masih ada; hapus lagi → 404.
      expect((await t.doc(slug)).comments).toHaveLength(1);
      expect((await t.post(`/viewer/docs/${slug}/comments/delete`, { threadId: th.id })).statusCode).toBe(404);
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

describe('POST /comments/delete (agen)', () => {
  it('menghapus thread permanen; riwayat atas nama agen; event Activity delete_comment; kedua kali → 404', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Hapus Agen');
      const s = await t.session('claude-code');
      await t.open(s, slug);
      const made = await t.post('/comments/create', { text: 'untuk dihapus', x: 5, y: 5 }, s);
      const threadId = made.json().data.thread.id;
      const del = await t.post('/comments/delete', { threadId }, s);
      expect(del.statusCode, del.body).toBe(200);
      // Thread hilang; array kosong dibersihkan dari dokumen.
      expect((await t.doc(slug)).comments).toBeUndefined();
      const last = (await t.history(slug)).at(-1)!;
      expect(last.description).toBe(`Deleted comment ${threadId}`);
      expect(last.client).toBe('lakar-mcp');
      expect(last.agent).toBe('claude-code');
      expect(t.events.some((e) => e.type === 'call' && e.call.tool === 'delete_comment')).toBe(true);
      // Kedua kali → 404; thread asing → 404; body jelek → 400; tanpa sesi → 401.
      expect((await t.post('/comments/delete', { threadId }, s)).statusCode).toBe(404);
      expect((await t.post('/comments/delete', { threadId: 'ZZzzzz99' }, s)).statusCode).toBe(404);
      expect((await t.post('/comments/delete', { nope: 1 }, s)).statusCode).toBe(400);
      expect((await t.post('/comments/delete', { threadId })).statusCode).toBe(401);
    } finally {
      await t.app.close();
    }
  });
});

// ---- Mailbox "Ask agent to fix" (spec-comment-to-fix): fixRequest di thread (skema v11). Viewer membuka/membatalkan
//      lewat /viewer/docs/:slug/comments/:id/fix; agen menutup lewat /comments/fix {threadId, outcome, note?, slug?}. ----
describe('POST /viewer/docs/:slug/comments/:id/fix', () => {
  it('minta fix: fixRequest open + pesan prompt penulis user; idempoten; resolved → 409; asing → 404; origin → 403', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Minta Fix');
      const made = await t.post(`/viewer/docs/${slug}/comments/create`, { text: 'tombol terlalu kecil', x: 5, y: 6 });
      const threadId = made.json().data.thread.id;

      const r = await t.post(`/viewer/docs/${slug}/comments/${threadId}/fix`, { agent: 'claude-code' }, undefined, { 'x-lakar-origin': 'win-a' });
      expect(r.statusCode, r.body).toBe(200);
      const d = r.json().data;
      expect(d.fixRequest.status).toBe('open');
      expect(d.fixRequest.agent).toBe('claude-code');
      expect(d.fixRequest.at).toBeTruthy();
      // Pesan prompt di-append sebagai penulis user dan membawa konteks thread.
      const last = d.thread.messages.at(-1);
      expect(last.author).toEqual({ kind: 'user', name: 'You' });
      expect(last.text).toContain(`Fix request — Lakar document "${slug}"`);
      expect(last.text).toContain(`Thread: ${threadId}`);
      expect(last.text).toContain('tombol terlalu kecil');
      expect(last.text).toContain('reply_to_comment');
      expect(last.text).toContain('fix_comment');
      // Tersimpan di dokumen + riwayat atas nama viewer + event change edit.
      const stored = (await t.doc(slug)).comments![0]!;
      expect(stored.fixRequest).toMatchObject({ status: 'open', agent: 'claude-code' });
      expect(stored.messages).toHaveLength(2);
      expect((await t.history(slug)).at(-1)).toMatchObject({ sessionId: 'lakar-viewer', client: 'lakar-viewer', opsSummary: 'comments' });
      expect(t.changes.at(-1)).toMatchObject({ kind: 'edit', slug, rev: d.rev, origin: 'win-a' });

      // Sudah open → idempoten: rev tetap, tanpa pesan/event baru.
      const rev = d.rev;
      const again = await t.post(`/viewer/docs/${slug}/comments/${threadId}/fix`, {});
      expect(again.statusCode).toBe(200);
      expect(again.json().data.fixRequest.status).toBe('open');
      expect((await t.doc(slug)).rev).toBe(rev);
      expect((await t.doc(slug)).comments![0]!.messages).toHaveLength(2);

      // Thread resolved → 409; thread asing → 404; slug asing → 404; origin lintas situs → 403.
      await t.post(`/viewer/docs/${slug}/comments/resolve`, { threadId });
      expect((await t.post(`/viewer/docs/${slug}/comments/${threadId}/fix`, {})).statusCode).toBe(409);
      expect((await t.post(`/viewer/docs/${slug}/comments/ZZzzzz99/fix`, {})).statusCode).toBe(404);
      expect((await t.post('/viewer/docs/tidak-ada/comments/ZZzzzz99/fix', {})).statusCode).toBe(404);
      expect((await t.post(`/viewer/docs/${slug}/comments/${threadId}/fix`, {}, undefined, { origin: 'https://evil.example' })).statusCode).toBe(403);
    } finally {
      await t.app.close();
    }
  });

  it('batal: open → cancelled; idempoten; tanpa fixRequest → 404; setelah done → 409', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Batal Fix');
      const made = await t.post(`/viewer/docs/${slug}/comments/create`, { text: 'x', x: 1, y: 1 });
      const threadId = made.json().data.thread.id;
      // Tanpa fixRequest → 404.
      expect((await t.post(`/viewer/docs/${slug}/comments/${threadId}/fix`, { outcome: 'cancelled' })).statusCode).toBe(404);
      await t.post(`/viewer/docs/${slug}/comments/${threadId}/fix`, {});
      const cancel = await t.post(`/viewer/docs/${slug}/comments/${threadId}/fix`, { outcome: 'cancelled' });
      expect(cancel.statusCode, cancel.body).toBe(200);
      expect(cancel.json().data.fixRequest.status).toBe('cancelled');
      const rev = cancel.json().data.rev;
      // Sudah cancelled → idempoten tanpa rev baru.
      const again = await t.post(`/viewer/docs/${slug}/comments/${threadId}/fix`, { outcome: 'cancelled' });
      expect(again.statusCode).toBe(200);
      expect((await t.doc(slug)).rev).toBe(rev);
      // Agen menutup done → cancel berikutnya 409; minta fix baru boleh (permintaan baru).
      const s = await t.session('claude-code');
      const req2 = await t.post(`/viewer/docs/${slug}/comments/${threadId}/fix`, {});
      expect(req2.json().data.fixRequest.status).toBe('open');
      const done = await t.post('/comments/fix', { slug, threadId, outcome: 'done' }, s);
      expect(done.statusCode, done.body).toBe(200);
      expect((await t.post(`/viewer/docs/${slug}/comments/${threadId}/fix`, { outcome: 'cancelled' })).statusCode).toBe(409);
    } finally {
      await t.app.close();
    }
  });

  it('resolve thread ber-fixRequest open → fixRequest ikut cancelled (tidak menggantung); unresolve tidak menyentuhnya', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Resolve Fix');
      const made = await t.post(`/viewer/docs/${slug}/comments/create`, { text: 'x', x: 1, y: 1 });
      const threadId = made.json().data.thread.id;
      await t.post(`/viewer/docs/${slug}/comments/${threadId}/fix`, {});
      const r = await t.post(`/viewer/docs/${slug}/comments/resolve`, { threadId });
      expect(r.statusCode, r.body).toBe(200);
      const stored = (await t.doc(slug)).comments![0]!;
      expect(stored.status).toBe('resolved');
      expect(stored.fixRequest).toMatchObject({ status: 'cancelled' });
      expect(stored.messages).toHaveLength(2); // auto-cancel tanpa pesan tambahan
      // Buka kembali → fixRequest tetap cancelled (tidak dihidupkan ulang).
      await t.post(`/viewer/docs/${slug}/comments/resolve`, { threadId, resolved: false });
      expect((await t.doc(slug)).comments![0]!.fixRequest!.status).toBe('cancelled');
      // Minta fix baru tetap boleh setelah buka kembali.
      expect((await t.post(`/viewer/docs/${slug}/comments/${threadId}/fix`, {})).json().data.fixRequest.status).toBe('open');
    } finally {
      await t.app.close();
    }
  });
});

describe('POST /comments/fix (agen)', () => {
  it('done: fixRequest.status done + agent penutup + pesan hasil penulis agent; list membawa fixRequest; riwayat sesi; event fix_comment', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Tutup Fix');
      const s = await t.session('claude-code');
      await t.open(s, slug);
      const made = await t.post('/comments/create', { text: 'padding masih aneh', x: 3, y: 4 }, s);
      const threadId = made.json().data.thread.id;
      // Pengguna minta fix dari aplikasi.
      const req = await t.post(`/viewer/docs/${slug}/comments/${threadId}/fix`, {});
      expect(req.statusCode, req.body).toBe(200);

      const r = await t.post('/comments/fix', { threadId, outcome: 'done', note: 'padding diperbaiki ke 16' }, s);
      expect(r.statusCode, r.body).toBe(200);
      const d = r.json().data;
      expect(d.rev).toBe((await t.doc(slug)).rev);
      expect(d.fixRequest).toMatchObject({ status: 'done', agent: 'claude-code', note: 'padding diperbaiki ke 16' });
      const last = d.thread.messages.at(-1);
      expect(last.author).toEqual({ kind: 'agent', name: 'claude-code' });
      expect(last.text).toBe('padding diperbaiki ke 16');
      // Riwayat atas nama sesi + event Activity fix_comment.
      expect((await t.history(slug)).at(-1)).toMatchObject({ sessionId: s, agent: 'claude-code', opsSummary: 'comments' });
      expect(t.events.some((e) => e.type === 'call' && e.call.tool === 'fix_comment')).toBe(true);
      // list_comments membawa fixRequest (respons hanya bertambah field).
      const list = await t.post('/comments', {}, s);
      expect(list.json().data.threads[0].fixRequest.status).toBe('done');
      // list viewer juga membawa fixRequest.
      const vlist = await t.post(`/viewer/docs/${slug}/comments`, {});
      expect(vlist.json().data.threads[0].fixRequest.status).toBe('done');
      // Sudah terminal → tutup lagi 409.
      expect((await t.post('/comments/fix', { threadId, outcome: 'done' }, s)).statusCode).toBe(409);
    } finally {
      await t.app.close();
    }
  });

  it('failed + tanpa note → pesan default; slug eksplisit bekerja tanpa dokumen aktif; validasi dan 401/404', async () => {
    const t = await setup();
    try {
      const slug = await t.create('Fix Gagal');
      const s = await t.session('codex');
      await t.open(s, slug);
      const made = await t.post('/comments/create', { text: 'x', x: 0, y: 0 }, s);
      const threadId = made.json().data.thread.id;
      // Thread tanpa fixRequest → NOT_FOUND.
      const nf = await t.post('/comments/fix', { threadId, outcome: 'done' }, s);
      expect(nf.statusCode).toBe(404);
      expect(nf.json().error.code).toBe('NOT_FOUND');
      await t.post(`/viewer/docs/${slug}/comments/${threadId}/fix`, {});
      // outcome failed tanpa note → pesan default; agent = harness sesi.
      const r = await t.post('/comments/fix', { threadId, outcome: 'failed' }, s);
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().data.fixRequest).toMatchObject({ status: 'failed', agent: 'codex' });
      expect(r.json().data.thread.messages.at(-1).text).toBe('Fix failed.');

      // Sesi baru tanpa open_doc + slug eksplisit → tutup langsung (alur mailbox).
      const slug2 = await t.create('Mailbox Lain');
      const made2 = await t.post(`/viewer/docs/${slug2}/comments/create`, { text: 'y', x: 0, y: 0 });
      const threadId2 = made2.json().data.thread.id;
      await t.post(`/viewer/docs/${slug2}/comments/${threadId2}/fix`, {});
      const s2 = await t.session('claude-code');
      const done2 = await t.post('/comments/fix', { slug: slug2, threadId: threadId2, outcome: 'done', note: 'ok' }, s2);
      expect(done2.statusCode, done2.body).toBe(200);
      expect(done2.json().data.slug).toBe(slug2);
      expect(done2.json().data.fixRequest.status).toBe('done');
      // Sesi tanpa dokumen aktif dan tanpa slug → NO_ACTIVE_DOC; slug asing → 404; body jelek → 400; tanpa sesi → 401.
      const s3 = await t.session('codex');
      const nad = await t.post('/comments/fix', { threadId: threadId2, outcome: 'done' }, s3);
      expect(nad.statusCode).toBe(409);
      expect(nad.json().error.code).toBe('NO_ACTIVE_DOC');
      expect((await t.post('/comments/fix', { slug: 'tidak-ada', threadId: threadId2, outcome: 'done' }, s3)).statusCode).toBe(404);
      expect((await t.post('/comments/fix', { threadId: threadId2, outcome: 'cancelled' }, s3)).statusCode).toBe(400);
      expect((await t.post('/comments/fix', { threadId, outcome: 'done' })).statusCode).toBe(401);
    } finally {
      await t.app.close();
    }
  });
});
