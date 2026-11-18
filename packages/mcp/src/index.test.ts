import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { PACKAGE, createLakarMcpServer } from './index.js';

const PNG_B64 = Buffer.from('fake-png').toString('base64');

type Seen = { path: string; session?: string; body: any };

/** Daemon tiruan: meniru bentuk respons AD-11 lakard. */
function fakeDaemon() {
  const seen: Seen[] = [];
  let sessions = 0;
  let restartOnce = false;
  const server: Server = createServer(async (req: IncomingMessage, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    const session = req.headers['x-lakar-session'] as string | undefined;
    seen.push({ path: req.url!, session, body });
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.url === '/sessions') return send(200, { ok: true, data: { sessionId: `s${++sessions}` } });
    if (restartOnce) {
      restartOnce = false;
      return send(401, { ok: false, error: { code: 'NOT_FOUND', message: 'sesi tidak dikenal', hint: '', retryable: false } });
    }
    if (req.url === '/docs/open') return send(200, { ok: true, data: { docId: 'Dddddddd', slug: body.slug, rev: 0, created: true } });
    if (req.url === '/execute') {
      if (body.code === 'boom') {
        return send(422, { ok: false, error: { code: 'EXEC_ERROR', message: 'baris 1:1: error tak tertangkap', hint: 'perbaiki', retryable: false, editId: 'Eeeeeeee' } });
      }
      if (body.editId === 'Eeeeeeee') return send(200, { ok: true, data: { docId: 'Dddddddd', rev: 2, created: [], value: 1, logs: 'halo' } });
      return send(200, { ok: true, data: { docId: 'Dddddddd', rev: 1, created: [{ id: 'Bbbbbbbb', name: 'Tracer', path: ['Tracer'] }] } });
    }
    if (req.url === '/screenshot') {
      if (body.boardId === 'ZZZZZZZZ') return send(404, { ok: false, error: { code: 'NOT_FOUND', message: 'board tidak ada', hint: 'pakai id', retryable: false } });
      return send(200, { ok: true, data: { boardId: 'Bbbbbbbb', width: 390, height: 844, mimeType: 'image/png', png: PNG_B64 } });
    }
    send(404, {});
  });
  return {
    seen,
    server,
    restartOnce: () => (restartOnce = true),
    async listen() {
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    },
  };
}

async function connect(url: string) {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await createLakarMcpServer(url).connect(st);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(ct);
  return client;
}

describe('@lakar/mcp', () => {
  const fake = fakeDaemon();
  let url: string;
  beforeAll(async () => {
    url = await fake.listen();
  });
  afterAll(() => fake.server.close());

  it('mengekspor nama paket', () => {
    expect(PACKAGE).toBe('@lakar/mcp');
  });

  it('daftar tool: open_doc, execute, screenshot', async () => {
    const c = await connect(url);
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['execute', 'open_doc', 'screenshot']);
  });

  it('alur open_doc → execute → screenshot, sesi malas dan dipakai ulang', async () => {
    fake.seen.length = 0;
    const c = await connect(url);
    expect(fake.seen).toHaveLength(0); // belum ada sesi sebelum tool pertama
    const o = await c.callTool({ name: 'open_doc', arguments: { slug: 'tracer-a' } });
    expect(o.isError).toBeFalsy();
    expect(JSON.parse((o.content as any)[0].text)).toMatchObject({ slug: 'tracer-a', created: true });
    const e = await c.callTool({ name: 'execute', arguments: { code: 'add(null,{})', description: 'board tracer' } });
    expect(JSON.parse((e.content as any)[0].text).created).toHaveLength(1);
    const s = await c.callTool({ name: 'screenshot', arguments: {} });
    expect((s.content as any)[0]).toEqual({ type: 'image', data: PNG_B64, mimeType: 'image/png' });
    expect(JSON.parse((s.content as any)[1].text)).toEqual({ boardId: 'Bbbbbbbb', width: 390, height: 844, mimeType: 'image/png' });
    const paths = fake.seen.map((x) => x.path);
    expect(paths).toEqual(['/sessions', '/docs/open', '/execute', '/screenshot']);
    const sessionsUsed = new Set(fake.seen.slice(1).map((x) => x.session));
    expect(sessionsUsed.size).toBe(1);
    expect(fake.seen[2]!.body).toEqual({ code: 'add(null,{})', description: 'board tracer' });
  });

  it('dua panggilan paralel sebelum ada sesi → satu /sessions', async () => {
    fake.seen.length = 0;
    const c = await connect(url);
    await Promise.all([
      c.callTool({ name: 'open_doc', arguments: { slug: 'p1' } }),
      c.callTool({ name: 'open_doc', arguments: { slug: 'p2' } }),
    ]);
    expect(fake.seen.filter((x) => x.path === '/sessions')).toHaveLength(1);
    expect(new Set(fake.seen.filter((x) => x.path === '/docs/open').map((x) => x.session)).size).toBe(1);
  });

  it('error daemon → isError dengan kode + hint', async () => {
    const c = await connect(url);
    const e = await c.callTool({ name: 'execute', arguments: { code: 'boom' } });
    expect(e.isError).toBe(true);
    expect((e.content as any)[0].text).toMatch(/^EXEC_ERROR: .*\nhint: perbaiki\neditId: Eeeeeeee$/);
    const s = await c.callTool({ name: 'screenshot', arguments: { boardId: 'ZZZZZZZZ' } });
    expect(s.isError).toBe(true);
    expect((s.content as any)[0].text).toMatch(/^NOT_FOUND/);
  });

  it('execute perbaikan: editId + edits diteruskan apa adanya, tanpa code; value/logs dikembalikan', async () => {
    fake.seen.length = 0;
    const c = await connect(url);
    const edits = [{ find: 'boom', replace: '1' }];
    const r = await c.callTool({ name: 'execute', arguments: { editId: 'Eeeeeeee', edits } });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse((r.content as any)[0].text)).toMatchObject({ rev: 2, value: 1, logs: 'halo' });
    expect(fake.seen.find((x) => x.path === '/execute')!.body).toEqual({ editId: 'Eeeeeeee', edits });
    const { tools } = await c.listTools();
    const exec = tools.find((t) => t.name === 'execute')!;
    expect(Object.keys((exec.inputSchema as any).properties).sort()).toEqual(['code', 'description', 'editId', 'edits']);
    expect(exec.description).toMatch(/3–8 kata/);
  });

  it('sesi hilang (401) → sesi baru, permintaan diulang sekali', async () => {
    const c = await connect(url);
    await c.callTool({ name: 'open_doc', arguments: { slug: 'a' } });
    fake.seen.length = 0;
    fake.restartOnce();
    const o = await c.callTool({ name: 'open_doc', arguments: { slug: 'b' } });
    expect(o.isError).toBeFalsy();
    expect(fake.seen.map((x) => x.path)).toEqual(['/docs/open', '/sessions', '/docs/open']);
  });

  it('daemon mati → isError menyebut URL dan cara menjalankan lakard; proses tetap hidup', async () => {
    const dead = createServer();
    await new Promise<void>((r) => dead.listen(0, '127.0.0.1', r));
    const deadUrl = `http://127.0.0.1:${(dead.address() as { port: number }).port}`;
    await new Promise<void>((r) => dead.close(() => r()));
    const c = await connect(deadUrl);
    const r = await c.callTool({ name: 'open_doc', arguments: { slug: 'x' } });
    expect(r.isError).toBe(true);
    const text = (r.content as any)[0].text as string;
    expect(text).toContain(deadUrl);
    expect(text).toContain('lakard');
    // panggilan berikutnya tetap dilayani
    expect((await c.callTool({ name: 'screenshot', arguments: {} })).isError).toBe(true);
  });

  it('stdio: dist/main.js memakai LAKAR_URL dan bertahan walau daemon mati', async () => {
    const mainJs = fileURLToPath(new URL('../dist/main.js', import.meta.url));
    const transport = new StdioClientTransport({ command: process.execPath, args: [mainJs], env: { LAKAR_URL: url } });
    const client = new Client({ name: 'stdio-test', version: '0' });
    await client.connect(transport);
    try {
      const o = await client.callTool({ name: 'open_doc', arguments: { slug: 'stdio-a' } });
      expect(JSON.parse((o.content as any)[0].text).slug).toBe('stdio-a');
    } finally {
      await client.close();
    }
    const deadTransport = new StdioClientTransport({ command: process.execPath, args: [mainJs], env: { LAKAR_URL: 'http://127.0.0.1:1' } });
    const c2 = new Client({ name: 'stdio-test', version: '0' });
    await c2.connect(deadTransport);
    try {
      const r = await c2.callTool({ name: 'execute', arguments: { code: '1' } });
      expect(r.isError).toBe(true);
      expect((r.content as any)[0].text).toContain('http://127.0.0.1:1');
      expect((await c2.listTools()).tools).toHaveLength(3);
    } finally {
      await c2.close();
    }
  });
});
