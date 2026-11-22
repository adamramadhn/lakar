// Stream aktivitas viewer (Viewer B slice 2): event dari hook fastify + SSE `GET /viewer/events`. RenderPort palsu.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActivityBus, buildServer, loadConfig, type ActivityCall, type ActivityEvent } from './index.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };

/** RenderPort palsu: ukuran board, tanpa node; screenshot = PNG 1×1. */
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const fakeRender = {
  screenshot: async () => new Uint8Array(PNG_1x1),
  measure: async (doc: any, boardId: string) => {
    const b = doc.pages.flatMap((p: any) => p.children).find((x: any) => x.id === boardId);
    return { width: b.width, height: b.height, nodes: [], texts: [] };
  },
} as never;

const BOARD = `add(null,{type:'board',name:'Home',x:0,y:0,width:390,height:844,screen:'mobile'})`;

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-events-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function setup(opts: { heartbeatMs?: number } = {}) {
  const dataDir = await mkdtemp(join(root, 'data-'));
  const daemon = buildServer({
    config: { ...baseConfig, port: 0, dataDir },
    render: fakeRender,
    ...(opts.heartbeatMs !== undefined ? { activityHeartbeatMs: opts.heartbeatMs } : {}),
  });
  const { app, activity } = daemon;
  const events: ActivityEvent[] = [];
  activity.subscribe((e) => events.push(e));
  const post = (url: string, payload: unknown, session?: string) =>
    app.inject({ method: 'POST', url, payload: payload as object, headers: session ? { 'x-lakar-session': session } : {} });
  const session = async (client?: string) => (await post('/sessions', client ? { client } : {})).json().data.sessionId as string;
  const calls = () => events.filter((e): e is Extract<ActivityEvent, { type: 'call' }> => e.type === 'call').map((e) => e.call);
  return { ...daemon, app, events, calls, post, session };
}

/** Pasangan running → selesai per callId. */
function pairs(calls: ActivityCall[]) {
  const by = new Map<string, ActivityCall[]>();
  for (const c of calls) by.set(c.callId, [...(by.get(c.callId) ?? []), c]);
  return [...by.values()];
}

describe('ActivityBus', () => {
  it('ring buffer menyimpan maks N event terakhir; seq naik; unsubscribe melepas listener', () => {
    const bus = new ActivityBus(3);
    const seen: number[] = [];
    const off = bus.subscribe((e) => seen.push(e.seq));
    for (let i = 0; i < 5; i++) bus.emit({ type: 'session', session: { id: `s${i}`, createdAt: '', executes: 0 } });
    expect(bus.recent().map((e) => e.seq)).toEqual([3, 4, 5]);
    expect(seen).toEqual([1, 2, 3, 4, 5]);
    expect(bus.listenerCount).toBe(1);
    off();
    expect(bus.listenerCount).toBe(0);
  });

  it('default ring 100', () => {
    const bus = new ActivityBus();
    for (let i = 0; i < 130; i++) bus.emit({ type: 'session', session: { id: 'x', createdAt: '', executes: 0 } });
    expect(bus.recent()).toHaveLength(100);
    expect(bus.recent()[0]!.seq).toBe(31);
  });
});

describe('event tool call', () => {
  it('sesi baru → event session (id publik, client), tanpa id penuh', async () => {
    const { app, events, session } = await setup();
    try {
      const sid = await session('claude-code');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'session', session: { id: sid.slice(0, 8), client: 'claude-code', executes: 0 } });
      expect(JSON.stringify(events)).not.toContain(sid);
    } finally {
      await app.close();
    }
  });

  it('execute sukses → running (callId, session, client, tool, slug, description) lalu done (durationMs, rev, created, boards, nodes)', async () => {
    const { app, calls, post, session } = await setup();
    try {
      const sid = await session('lakar-mcp');
      await post('/docs/open', { slug: 'a' }, sid);
      const res = await post('/execute', { code: BOARD, description: 'tambah board home awal' }, sid);
      expect(res.json().ok).toBe(true);
      const exec = calls().filter((c) => c.tool === 'execute');
      expect(exec.map((c) => c.status)).toEqual(['running', expect.stringMatching(/^(done|warning)$/)]);
      const [running, done] = exec as [ActivityCall, ActivityCall];
      expect(running).toMatchObject({ session: sid.slice(0, 8), client: 'lakar-mcp', tool: 'execute', slug: 'a', description: 'tambah board home awal' });
      expect(running.callId).toBe(done.callId);
      expect(running.durationMs).toBeUndefined();
      const data = res.json().data;
      expect(done).toMatchObject({ rev: data.rev, created: data.created.map((c: { id: string }) => c.id), boards: data.check.boards });
      expect(done.durationMs).toBeGreaterThanOrEqual(0);
      expect(done.nodes).toBe(Object.keys(data.bounds).length);
      expect(Object.keys(data.bounds).length).toBeGreaterThan(0);
      expect(done.bounds).toEqual(data.bounds);
      expect(running.bounds).toBeUndefined();
      expect(done.summary).toEqual({ error: data.check.summary.error, warning: data.check.summary.warning });
      expect(done.status).toBe(data.check.summary.error + data.check.summary.warning > 0 ? 'warning' : 'done');
      expect(JSON.stringify(calls())).not.toContain(sid);
    } finally {
      await app.close();
    }
  });

  it('bentuk respons route lama tetap persis (open_doc sukses, execute body tidak valid)', async () => {
    const a = await setup();
    try {
      const sid = await a.session();
      const open = await a.post('/docs/open', { slug: 'a' }, sid);
      expect(open.json()).toEqual({ ok: true, data: { docId: expect.any(String), slug: 'a', rev: 0, created: true } });
      const bad = await a.post('/execute', { code: '1' }, sid);
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error.code).toBe('SCHEMA_INVALID');
    } finally {
      await a.app.close();
    }
  });

  it('temuan check → status warning dengan summary {error, warning}', async () => {
    const { app, calls, post, session } = await setup();
    try {
      const sid = await session();
      await post('/docs/open', { slug: 'w' }, sid);
      // Board mobile berukuran salah → temuan (LC ukuran board).
      const r = await post('/execute', { code: `add(null,{type:'board',name:'Kecil',x:0,y:0,width:100,height:100,screen:'mobile'})`, description: 'board kecil yang salah ukuran' }, sid);
      const s = r.json().data.check.summary;
      expect(s.error + s.warning).toBeGreaterThan(0);
      const done = calls().filter((c) => c.tool === 'execute' && c.status !== 'running');
      expect(done).toEqual([expect.objectContaining({ status: 'warning', summary: { error: s.error, warning: s.warning } })]);
      // layout_check juga memancarkan warning dengan summary.
      const lc = await post('/layout-check', {}, sid);
      expect(lc.json().ok).toBe(true);
      const lcDone = calls().filter((c) => c.tool === 'layout_check' && c.status !== 'running');
      expect(lcDone).toEqual([expect.objectContaining({ status: 'warning', summary: { error: lc.json().data.summary.error, warning: lc.json().data.summary.warning }, rev: 1 })]);
    } finally {
      await app.close();
    }
  });

  it('respons {ok:false} → status error dengan code + message', async () => {
    const { app, calls, post, session } = await setup();
    try {
      const sid = await session();
      await post('/docs/open', { slug: 'e' }, sid);
      const r = await post('/execute', { code: `throw new Error('gagal sengaja')`, description: 'snippet yang gagal sengaja' }, sid);
      expect(r.json().ok).toBe(false);
      const exec = calls().filter((c) => c.tool === 'execute');
      expect(exec.map((c) => c.status)).toEqual(['running', 'error']);
      expect(exec[1]!.error).toEqual({ code: r.json().error.code, message: r.json().error.message });
    } finally {
      await app.close();
    }
  });

  it('body tidak valid setelah sesi dikenal → running tetap dipasangkan dengan error', async () => {
    const { app, calls, post, session } = await setup();
    try {
      const sid = await session();
      await post('/docs/open', { slug: 'v' }, sid);
      await post('/execute', { nope: true }, sid);
      await post('/inspect', {}, sid);
      const bad = pairs(calls().filter((c) => c.tool !== 'open_doc'));
      expect(bad).toHaveLength(2);
      for (const p of bad) expect(p.map((c) => c.status)).toEqual(['running', 'error']);
    } finally {
      await app.close();
    }
  });

  it('sesi tidak dikenal / tanpa header / JSON rusak → tidak ada event call sama sekali', async () => {
    const { app, calls, post } = await setup();
    try {
      expect((await post('/execute', { code: '1', description: 'a b c' }, 'tidak-ada')).statusCode).toBe(401);
      expect((await post('/execute', { code: '1', description: 'a b c' })).statusCode).toBe(401);
      const bad = await app.inject({ method: 'POST', url: '/boards', payload: '{rusak', headers: { 'content-type': 'application/json', 'x-lakar-session': 'x' } });
      expect(bad.statusCode).toBe(400);
      expect(calls()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('sesi lakar-viewer tidak dipancarkan (sesi maupun call)', async () => {
    const { app, events, post, session } = await setup();
    try {
      const sid = await session('lakar-viewer');
      await post('/docs/open', { slug: 'a' }, sid);
      await post('/boards', {}, sid);
      expect(events).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('execute sesi lakar-viewer → satu event change `edit` (slug, rev, board, origin) ke subscribeAll; tidak ada call/ring', async () => {
    const { app, activity, events, post, session } = await setup();
    try {
      const changes: unknown[] = [];
      activity.subscribeAll((e) => e.type === 'change' && changes.push(e.change));
      const sid = await session('lakar-viewer');
      await post('/docs/open', { slug: 'a' }, sid);
      const ex = await app.inject({ method: 'POST', url: '/execute', payload: { code: BOARD, description: 'tambah board home awal' }, headers: { 'x-lakar-session': sid, 'x-lakar-origin': 'win-1' } });
      expect(ex.statusCode, ex.body).toBe(200);
      const boardId = ex.json().data.created[0].id as string;
      // Gagal (description kosong) → tidak ada event.
      expect((await post('/execute', { code: BOARD, description: '' }, sid)).statusCode).not.toBe(200);
      // Tanpa header origin → change tanpa origin.
      await post('/execute', { code: BOARD, description: 'tambah board kedua lagi' }, sid);
      expect(changes).toEqual([
        { kind: 'edit', slug: 'a', rev: 1, boards: [boardId], origin: 'win-1' },
        { kind: 'edit', slug: 'a', rev: 2, boards: [expect.any(String)] },
      ]);
      expect(events).toEqual([]);
      expect(activity.recent()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('open_doc, list_boards, inspect, read_skill → nama tool MCP dan target ringkas', async () => {
    const { app, calls, post, session } = await setup();
    try {
      const sid = await session();
      await post('/docs/open', { slug: 'b' }, sid);
      const ex = await post('/execute', { code: BOARD, description: 'tambah board home awal' }, sid);
      const boardId = ex.json().data.created[0].id as string;
      await post('/boards', {}, sid);
      const ins = await post('/inspect', { id: boardId }, sid);
      await post('/skills/read', { name: 'webapp' }, sid);
      expect((await post('/screenshot', { boardId }, sid)).statusCode).toBe(200);
      await post('/screenshot', {}, sid);
      expect((await post('/screenshot', { boardId: 'Tidakada' }, sid)).statusCode).toBe(404);
      const done = calls().filter((c) => c.status !== 'running');
      expect(done.map((c) => c.tool)).toEqual(['open_doc', 'execute', 'list_boards', 'inspect', 'read_skill', 'screenshot', 'screenshot', 'screenshot']);
      expect(done[5]).toMatchObject({ status: 'done', target: boardId, boards: [boardId] });
      expect(done[6]!.status).toBe('done');
      expect(done[6]!.boards).toBeUndefined();
      expect(done[7]).toMatchObject({ status: 'error', error: { code: 'NOT_FOUND' } });
      expect(done[0]).toMatchObject({ slug: 'b', rev: 0 });
      expect(done[2]).toMatchObject({ nodes: 1, slug: 'b' });
      expect(done[3]).toMatchObject({ target: boardId, nodes: 1, boards: [boardId] });
      // inspect → bounds node target dari respons (relatif board).
      const insNode = ins.json().data.node;
      expect(insNode.bounds).toHaveLength(4);
      expect(done[3]!.bounds).toEqual({ [boardId]: insNode.bounds });
      expect(done[2]!.bounds).toBeUndefined();
      expect(done[4]).toMatchObject({ target: 'webapp' });
    } finally {
      await app.close();
    }
  });

  it('execute dengan editId memakai description snippet gagal', async () => {
    const { app, calls, post, session } = await setup();
    try {
      const sid = await session();
      await post('/docs/open', { slug: 'r' }, sid);
      const bad = await post('/execute', { code: `throw new Error('x')`, description: 'perbaiki board yang rusak' }, sid);
      const editId = bad.json().error.editId as string;
      await post('/execute', { editId, edits: [{ find: `throw new Error('x')`, replace: BOARD }] }, sid);
      const last = calls().filter((c) => c.tool === 'execute').at(-2)!;
      expect(last).toMatchObject({ status: 'running', description: 'perbaiki board yang rusak' });
    } finally {
      await app.close();
    }
  });

  it('hook tidak mengubah lastAt sesi untuk permintaan yang ditolak', async () => {
    const { app, sessions, session, post } = await setup();
    try {
      const sid = await session();
      expect(sessions.byId(sid)!.lastAt).toBeUndefined();
      expect(sessions.peek(sid)!.id).toBe(sid);
      expect(sessions.byId(sid)!.lastAt).toBeUndefined();
      await post('/boards', {}, sid);
      expect(sessions.byId(sid)!.lastAt).toEqual(expect.any(String));
    } finally {
      await app.close();
    }
  });
});

/** Buka SSE di server sungguhan; kembalikan pembaca event dan penutup. */
function openSse(port: number) {
  const chunks: string[] = [];
  let resolveHeaders!: (h: { status: number; type: string }) => void;
  const headers = new Promise<{ status: number; type: string }>((r) => (resolveHeaders = r));
  let ended = false;
  const req = request({ host: '127.0.0.1', port, path: '/viewer/events', method: 'GET' }, (res) => {
    resolveHeaders({ status: res.statusCode ?? 0, type: String(res.headers['content-type']) });
    res.setEncoding('utf8');
    res.on('data', (c: string) => chunks.push(c));
    res.on('end', () => (ended = true));
    res.on('error', () => {});
  });
  req.on('error', () => {});
  req.end();
  const text = () => chunks.join('');
  const frames = () =>
    text()
      .split('\n\n')
      .filter((f) => f.startsWith('event:'))
      .map((f) => {
        const [ev, data] = f.split('\n');
        return { event: ev!.slice('event: '.length), data: JSON.parse(data!.slice('data: '.length)) };
      });
  const until = async (pred: () => boolean, ms = 3000) => {
    const t0 = Date.now();
    while (!pred()) {
      if (Date.now() - t0 > ms) throw new Error(`timeout; diterima: ${text()}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  return { headers, text, frames, until, ended: () => ended, close: () => req.destroy() };
}

describe('GET /viewer/events (SSE)', () => {
  it('hello berisi sessions[] (id publik) dan recent[]; event call mengalir; heartbeat; putus → listener dilepas', async () => {
    const { app, activity, post, session } = await setup({ heartbeatMs: 30 });
    try {
      const sid = await session('claude-code');
      await session('lakar-viewer');
      await post('/docs/open', { slug: 'a' }, sid);
      await app.listen({ host: '127.0.0.1', port: 0 });
      const port = (app.server.address() as { port: number }).port;
      const sse = openSse(port);
      const h = await sse.headers;
      expect(h.status).toBe(200);
      expect(h.type).toMatch(/^text\/event-stream/);
      await sse.until(() => sse.frames().length >= 1);
      const hello = sse.frames()[0]!;
      expect(hello.event).toBe('hello');
      expect(hello.data.sessions).toEqual([expect.objectContaining({ id: sid.slice(0, 8), client: 'claude-code', activeSlug: 'a', executes: 0, createdAt: expect.any(String) })]);
      expect(hello.data.recent.map((e: ActivityEvent) => e.type)).toEqual(['session', 'call', 'call']);
      expect(sse.text()).not.toContain(sid);
      expect(activity.listenerCount).toBe(2); // test + SSE

      await post('/execute', { code: BOARD, description: 'tambah board home awal' }, sid);
      await sse.until(() => sse.frames().filter((f) => f.event === 'call').length >= 2);
      const calls = sse.frames().filter((f) => f.event === 'call').map((f) => f.data.call as ActivityCall);
      expect(calls.map((c) => c.status)).toEqual(['running', expect.stringMatching(/^(done|warning)$/)]);
      await sse.until(() => sse.text().includes(': ping'));

      sse.close();
      await sse.until(() => activity.listenerCount === 1);
    } finally {
      await app.close();
    }
  });

  it('event change mengalir sebagai frame `change` dan tidak masuk recent[] hello', async () => {
    const { app, activity } = await setup();
    try {
      activity.change({ kind: 'create', slug: 'early', rev: 1 });
      await app.listen({ host: '127.0.0.1', port: 0 });
      const port = (app.server.address() as { port: number }).port;
      const sse = openSse(port);
      await sse.until(() => sse.frames().length >= 1);
      expect(sse.frames()[0]!.data.recent).toEqual([]);
      activity.change({ kind: 'rename', slug: 'b', from: 'a', origin: 'win-1' });
      await sse.until(() => sse.frames().some((f) => f.event === 'change'));
      const frame = sse.frames().find((f) => f.event === 'change')!;
      expect(frame.data).toEqual({ seq: 2, type: 'change', change: { kind: 'rename', slug: 'b', from: 'a', origin: 'win-1' } });
      sse.close();
    } finally {
      await app.close();
    }
  });

  it('app.close() menutup stream yang masih terbuka', async () => {
    const { app } = await setup();
    await app.listen({ host: '127.0.0.1', port: 0 });
    const port = (app.server.address() as { port: number }).port;
    const sse = openSse(port);
    await sse.until(() => sse.frames().length >= 1);
    expect(sse.ended()).toBe(false);
    await app.close();
    await sse.until(() => sse.ended());
    sse.close();
  });
});
